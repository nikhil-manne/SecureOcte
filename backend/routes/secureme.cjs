// Logger shim — writes directly to stdout/stderr (no recursion)
const logger = {
  info:  (...a) => process.stdout.write("[INFO]  " + a.map(String).join(" ") + "\n"),
  warn:  (...a) => process.stderr.write("[WARN]  " + a.map(String).join(" ") + "\n"),
  error: (...a) => process.stderr.write("[ERROR] " + a.map(String).join(" ") + "\n"),
};
const express   = require("express");
const jwt       = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const mongoose  = require("mongoose");
const Redis     = require("ioredis");

// ── JWT verification with device binding (CJS) ──────────────────
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ error: "Token expired" });
    return res.status(401).json({ error: "Invalid token" });
  }
  // Device binding — skip for admin; skip for legacy tokens without deviceId
  if (decoded.role !== "admin" && decoded.deviceId) {
    const sent = req.headers["x-device-id"];
    if (!sent) return res.status(401).json({ error: "Missing X-Device-Id header" });
    if (sent !== decoded.deviceId) {
      logger.warn("[SecureMe verifyToken] Device mismatch userId=" + decoded.userId);
      return res.status(401).json({ error: "Device mismatch: token was issued to a different device" });
    }
  }
  req.user = decoded;
  next();
}

const router   = express.Router();

/* ── Alert rate limit: 5 per minute per userId ─────────────── */
const alertLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.userId || req.ip,
  handler: (req, res) =>
    res.status(429).json({ error: "Too many alerts. Please wait before sending another." }),
  standardHeaders: true,
  legacyHeaders: false,
});

////////////////////////////////////////////////
// REDIS CLIENT
////////////////////////////////////////////////

if (!process.env.REDIS_URL) {
  logger.error("❌ [SecureMe] REDIS_URL environment variable is not set");
  process.exit(1);
}
const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => logger.info("✅ [SecureMe] Redis connected"));
redis.on("error",   (e) => logger.error("❌ [SecureMe] Redis error:", e.message));

// ── Inline replay protection (CJS) ──────────────────────────────
const REPLAY_WINDOW_MS = 30_000;
const NONCE_TTL_SEC    = 60;
async function replayProtection(req, res, next) {
  const tsRaw    = req.headers["x-timestamp"];
  const nonceRaw = req.headers["x-nonce"];
  if (!tsRaw || !nonceRaw) {
    return res.status(400).json({ error: "Missing security headers: X-Timestamp and X-Nonce are required" });
  }
  const clientTs = parseInt(tsRaw, 10);
  if (isNaN(clientTs) || Math.abs(Date.now() - clientTs) > REPLAY_WINDOW_MS) {
    return res.status(400).json({ error: "Request expired or clock skew too large" });
  }
  const nonce = String(nonceRaw).trim();
  if (!nonce || nonce.length < 8 || nonce.length > 128) {
    return res.status(400).json({ error: "X-Nonce must be 8–128 characters" });
  }
  try {
    const result = await redis.set("nonce:" + nonce, "1", "EX", NONCE_TTL_SEC, "NX");
    if (result === null) return res.status(400).json({ error: "Duplicate request detected (nonce already used)" });
  } catch (e) {
    logger.error("[SecureMe] replay protection Redis error:", e.message); // fail open
  }
  next();
}

// ── Timing constants ─────────────────────────────────────────────
const HEARTBEAT_TTL_SEC  = 25;    // Redis liveness key TTL (pseudo: HEARTBEAT_TTL)
const POLL_INTERVAL_MS   = 5000;  // Active-user poll cadence (pseudo: POLL_INTERVAL = 5s)
const RECHECK_DELAY_MS   = 10000; // Wait before re-checking after drop (pseudo: RECHECK_DELAY = 10s)
const STALE_THRESHOLD_MS = 30000; // MongoDB fallback poll threshold (unchanged)
const MONGO_POLL_MS      = 15000; // MongoDB fallback poll cadence (unchanged)

////////////////////////////////////////////////
// MODELS
////////////////////////////////////////////////

const ZoneSchema = new mongoose.Schema({
  zone: [{ lat: Number, lng: Number }],
});
const Zone = mongoose.model("SecureMeZone", ZoneSchema);

const AlertSchema = new mongoose.Schema({
  username:   String,
  trigger:    String,
  reason:     String,
  batteryPct: Number,
  mode:       String,
  lat:        Number,
  lng:        Number,
  time:       Date,
});
const Alert = mongoose.model("SecureMeAlert", AlertSchema);

const HeartbeatSchema = new mongoose.Schema({
  username:   { type: String, unique: true },
  batteryPct: Number,
  mode:       String,
  lat:        Number,
  lng:        Number,
  lastSeen:   Date,
  active:     { type: Boolean, default: true }, // false = clean stop
});
const Heartbeat = mongoose.model("SecureMeHeartbeat", HeartbeatSchema);

////////////////////////////////////////////////
// HELPER — fire shutdown alert
// Used by both the AI scoring engine and the MongoDB fallback poll.
////////////////////////////////////////////////

async function fireShutdownAlert(username, batteryPct, mode, lat, lng) {
  logger.info(`🚨 [SecureMe] Shutdown: user=${username} battery=${batteryPct}% mode=${mode}`);

  // Debounce — prevent duplicate alerts within 60s
  const dupeKey = `shutdown_alerted:${username}`;
  const already = await redis.get(dupeKey);
  if (already) {
    logger.info(`[SecureMe] Duplicate suppressed for ${username}`);
    return;
  }
  await redis.set(dupeKey, "1", "EX", 60);

  const modeLabel = { walk: "Walk Monitoring", cab: "Cab Escort", secureme: "SecureMe" }[mode] || mode;
  const reason = `Phone suddenly shut down during ${modeLabel} — battery was at ${batteryPct}%`;

  await Alert.create({
    username,
    trigger:    "battery_shutdown",
    reason,
    batteryPct,
    mode,
    lat:  lat  || null,
    lng:  lng  || null,
    time: new Date(),
  });

  logger.info(`✅ [SecureMe] Alert saved — ${username} | ${modeLabel} | ${batteryPct}%`);
}

////////////////////////////////////////////////
// AI SCORING ENGINE — detectShutdown
// Reads the last 3 heartbeat snapshots from Redis and applies a
// weighted scoring model to decide if the drop was a true shutdown
// (intentional force-off) vs. a transient network blip.
//
// Score thresholds:
//   >= 3  → fire alert (high confidence of real shutdown)
//   <  3  → ignore (likely network issue)
//
// Signal weights:
//   +2  battery > 20%     (phone had charge — not a battery death)
//   -2  retryCount > 0    (app was fighting network before drop)
//   -3  networkStatus=false (network was already gone)
//   +2  stable intervals  (heartbeats were arriving on schedule)
//   +1  appState=active   (app was in foreground — user was actively using)
//   -1  appState=background (app was backgrounded — OS may have killed it)
////////////////////////////////////////////////

async function detectShutdown(username) {
  // Fetch last 3 heartbeat snapshots stored by POST /heartbeat
  const rawHistory = await redis.lrange(`hb_history:${username}`, 0, 2);
  if (!rawHistory || rawHistory.length === 0) {
    logger.info(`[SecureMe][AI] No history for ${username} — skipping`);
    return;
  }

  // Parse JSON entries (stored as serialised strings)
  const history = rawHistory.map((entry) => {
    try { return JSON.parse(entry); } catch { return null; }
  }).filter(Boolean);

  if (history.length === 0) return;

  const last = history[0];  // most recent snapshot
  const prev = history[1];  // second-most-recent (may be undefined)

  // ── Hard rule: low battery → normal shutdown, ignore ────────────
  if (last.battery <= 5) {
    logger.info(`[SecureMe][AI] ${username} battery ≤5% — low-battery shutdown, skipping`);
    return;
  }

  // ── Calculate inter-arrival interval ────────────────────────────
  // Stable = heartbeats arriving every 10–18 s (phone sends every ~10s)
  let stableIntervals = false;
  if (prev) {
    const gap = new Date(last.time) - new Date(prev.time); // ms
    if (gap >= 10_000 && gap <= 18_000) {
      stableIntervals = true;
    }
  }

  // ── Scoring system ───────────────────────────────────────────────
  let score = 0;

  if (last.battery > 20)          score += 2;  // charged phone → suspicious drop
  if (last.retryCount > 0)        score -= 2;  // app was retrying → poor network
  if (last.networkStatus === false) score -= 3; // network was already down
  if (stableIntervals)            score += 2;  // clean cadence → sudden stop stands out
  if (last.appState === "active")      score += 1;  // foreground app → real shutdown
  if (last.appState === "background")  score -= 1;  // OS may have suspended it

  logger.info(
    `[SecureMe][AI] ${username} score=${score} ` +
    `battery=${last.battery}% retry=${last.retryCount} ` +
    `network=${last.networkStatus} stable=${stableIntervals} appState=${last.appState}`
  );

  if (score >= 3) {
    await fireAlert(username, last.battery, last.lat, last.lng);
  } else {
    logger.info(`[SecureMe][AI] ${username} — Ignored (likely network issue, score=${score})`);
  }
}

// ── fireAlert — thin wrapper used by the AI engine ──────────────
// Reads mode from MongoDB so the AI path has the same rich alert as
// the MongoDB fallback path.
async function fireAlert(username, batteryPct, lat, lng) {
  // Dedupe gate (same key as fireShutdownAlert)
  const dupeKey = `alerted:${username}`;
  const already = await redis.get(dupeKey);
  if (already) {
    logger.info(`[SecureMe][AI] Alert already fired for ${username} — suppressing`);
    return;
  }
  await redis.set(dupeKey, "1", "EX", 60);

  // Pull mode from MongoDB (heartbeat record is still present; just marked stale)
  const hb = await Heartbeat.findOne({ username }).lean();
  const mode = hb?.mode || "unknown";

  logger.info(`🚨 [SecureMe][AI] ALERT TRIGGERED — ${username} battery=${batteryPct}% mode=${mode}`);
  await fireShutdownAlert(username, batteryPct, mode, lat, lng);
}

////////////////////////////////////////////////
// scheduleRecheck
// Called when the active-users poll finds a user whose liveness key
// has expired.  Waits RECHECK_DELAY_MS and then re-checks; if the
// key has recovered it was only a network blip, otherwise the AI
// scoring engine decides whether to alert.
////////////////////////////////////////////////

async function scheduleRecheck(username) {
  // Idempotency gate — only one recheck per user at a time
  const recheckKey = `recheck:${username}`;
  const exists = await redis.get(recheckKey);
  if (exists) {
    logger.info(`[SecureMe] Recheck already scheduled for ${username}`);
    return;
  }
  await redis.set(recheckKey, "1", "EX", 15);

  logger.info(`[SecureMe] Recheck scheduled for ${username} in ${RECHECK_DELAY_MS / 1000}s`);

  setTimeout(async () => {
    try {
      const recoveredKey = `hb:${username}`;
      const existsAgain  = await redis.exists(recoveredKey);

      if (existsAgain) {
        // Liveness key is back → transient network drop, not a shutdown
        logger.info(`[SecureMe] ${username} recovered — transient network issue, no alert`);
        return;
      }

      // Still gone → run AI scoring engine
      await detectShutdown(username);
    } catch (e) {
      logger.error(`[SecureMe] scheduleRecheck error for ${username}:`, e.message);
    }
  }, RECHECK_DELAY_MS);
}

////////////////////////////////////////////////
// REDIS ACTIVE-USER POLLING LOOP
// Runs every POLL_INTERVAL_MS (5s).
// For each user in the "active_users" set, checks whether their
// liveness key is still alive.  If not, schedules a recheck and
// removes them from the set.
////////////////////////////////////////////////

async function runActiveUserPoll() {
  try {
    const users = await redis.smembers("active_users");
    if (users.length === 0) return;

    for (const username of users) {
      const exists = await redis.exists(`hb:${username}`);
      if (!exists) {
        logger.info(`[SecureMe] Liveness key gone for ${username} — scheduling recheck`);
        await scheduleRecheck(username);
        await redis.srem("active_users", username);
      }
    }
  } catch (e) {
    logger.error("[SecureMe] active-user poll error:", e.message);
  }
}

// Start the Redis active-user poll immediately (5s warm-up)
setTimeout(() => {
  logger.info(`✅ [SecureMe] Redis active-user poll started (every ${POLL_INTERVAL_MS / 1000}s)`);
  setInterval(runActiveUserPoll, POLL_INTERVAL_MS);
}, 5000);

////////////////////////////////////////////////
// MONGODB POLLING FALLBACK
// Runs every 15s — finds active heartbeats where lastSeen is older
// than 30s.  Acts as a safety net if the Redis poll or AI engine
// miss something (e.g. server restart between recheck window).
////////////////////////////////////////////////

async function pollForDeadHeartbeats() {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const stale = await Heartbeat.find({
      active:   true,
      lastSeen: { $lt: cutoff },
    });

    for (const hb of stale) {
      logger.info(`[SecureMe] 🔍 Stale heartbeat: ${hb.username} lastSeen=${hb.lastSeen} battery=${hb.batteryPct}%`);

      if (hb.batteryPct > 5) {
        await fireShutdownAlert(hb.username, hb.batteryPct, hb.mode, hb.lat, hb.lng);
      } else {
        logger.info(`[SecureMe] ${hb.username} battery ≤5% — normal low-battery shutdown, skipping`);
      }

      // Mark inactive so we don't re-alert on next poll
      await Heartbeat.findOneAndUpdate(
        { username: hb.username },
        { active: false }
      );
    }
  } catch (e) {
    logger.error("[SecureMe] MongoDB poll error:", e.message);
  }
}

// Start MongoDB fallback poll after 5s
setTimeout(() => {
  logger.info("✅ [SecureMe] MongoDB heartbeat fallback poll started (every 15s)");
  setInterval(pollForDeadHeartbeats, MONGO_POLL_MS);
}, 5000);

////////////////////////////////////////////////
// POST /heartbeat
// All three modes call this every 10s while session is active.
// Body: { username, batteryPct, mode, lat, lng, appState, networkStatus, retryCount }
//
// New fields consumed by the AI engine:
//   appState      — "active" | "background" | "inactive"
//   networkStatus — boolean (true = online)
//   retryCount    — number of send retries before this ping arrived
////////////////////////////////////////////////

router.post("/heartbeat", verifyToken, replayProtection, async (req, res) => {
  const {
    username,
    batteryPct,
    mode,
    lat,
    lng,
    appState      = "unknown",
    networkStatus = true,
    retryCount    = 0,
  } = req.body;

  if (!username) return res.status(400).json({ error: "username required" });
  if (!mode)     return res.status(400).json({ error: "mode required" });

  try {
    const now = new Date().toISOString();

    // 1. Liveness key — TTL resets on every ping
    await redis.set(`hb:${username}`, batteryPct ?? -1, "EX", HEARTBEAT_TTL_SEC);

    // 2. History ring-buffer (last 3 snapshots) for AI scoring engine
    const snapshot = JSON.stringify({
      time:          now,
      battery:       batteryPct ?? null,
      lat:           lat        ?? null,
      lng:           lng        ?? null,
      appState,
      networkStatus,
      retryCount,
    });
    const histKey = `hb_history:${username}`;
    await redis.lpush(histKey, snapshot);
    await redis.ltrim(histKey, 0, 2);   // keep only the last 3
    await redis.expire(histKey, 60);    // auto-clean after 60s of silence

    // 3. Register in active-user set so the poll loop tracks this user
    await redis.sadd("active_users", username);
    await redis.expire("active_users", 60);

    // 4. MongoDB upsert — MongoDB fallback poll reads this
    await Heartbeat.findOneAndUpdate(
      { username },
      {
        batteryPct: batteryPct ?? null,
        mode,
        lat:      lat      ?? null,
        lng:      lng      ?? null,
        lastSeen: new Date(),
        active:   true,
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, ttl: HEARTBEAT_TTL_SEC });
  } catch (e) {
    logger.error("[SecureMe] heartbeat error:", e.message);
    res.status(500).json({ error: "heartbeat failed" });
  }
});

////////////////////////////////////////////////
// DELETE /heartbeat — clean session stop
// Called when user intentionally ends walk/cab/secureme.
// Body: { username, mode }
////////////////////////////////////////////////

router.delete("/heartbeat", verifyToken, async (req, res) => {
  const { username, mode } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  try {
    // Remove Redis liveness key so it doesn't expire and trigger a false alert
    await redis.del(`hb:${username}`);

    // Remove history and active-user membership (pseudo: ON_STOP)
    await redis.del(`hb_history:${username}`);
    await redis.srem("active_users", username);

    // Mark inactive in MongoDB so the MongoDB poll skips it
    await Heartbeat.findOneAndUpdate(
      { username },
      { active: false }
    );

    logger.info(`[SecureMe] 🟢 Clean stop — user=${username} mode=${mode}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "clear failed" });
  }
});

////////////////////////////////////////////////
// SAVE ZONE
////////////////////////////////////////////////

router.post("/save-zone", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access only" });
    }
    if (!Array.isArray(req.body.zone) || req.body.zone.length < 3) {
      return res.status(400).json({ error: "zone must be an array of at least 3 coordinates" });
    }
    const z = new Zone({ zone: req.body.zone });
    await z.save();
    res.json({ msg: "SecureMe Zone Updated", _id: z._id });
  } catch (e) {
    logger.error("[SecureMe] save-zone error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

////////////////////////////////////////////////
// GET ZONE
////////////////////////////////////////////////

router.get("/get-zone", verifyToken, async (req, res) => {
  try {
    const zones = await Zone.find();
    if (!zones || zones.length === 0) return res.json([]);
    res.json(zones);
  } catch (e) {
    logger.error("[SecureMe] get-zone error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

////////////////////////////////////////////////
// DELETE /zone/:id — remove a saved zone
////////////////////////////////////////////////

router.delete("/zone/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access only" });
    }
    const deleted = await Zone.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Zone not found" });
    res.json({ msg: "Zone deleted" });
  } catch (e) {
    logger.error("[SecureMe] zone delete error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

////////////////////////////////////////////////
// POST /alert — manual trigger from mobile
////////////////////////////////////////////////

router.post("/alert", verifyToken, replayProtection, alertLimiter, async (req, res) => {
  try {
    const a = new Alert({
      username:   req.body.userId || req.body.username || req.user?.userId || "SECUREME_AUTO",
      trigger:    req.body.trigger    || "manual",
      reason:     req.body.reason     || "",
      batteryPct: req.body.batteryPct || null,
      mode:       req.body.mode       || null,
      lat:        req.body.lat        || null,
      lng:        req.body.lng        || null,
      time:       new Date(),
    });
    await a.save();
    logger.info("[SECUREME ALERT]", { username: a.username, reason: a.reason });
    res.json({ msg: "SecureMe Alert Stored" });
  } catch (e) {
    logger.error("[SecureMe] alert error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

////////////////////////////////////////////////
// GET /alerts — view recent alerts
////////////////////////////////////////////////

router.get("/alerts", verifyToken, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500));
    const skip  = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      Alert.find().sort({ time: -1 }).skip(skip).limit(limit),
      Alert.countDocuments(),
    ]);

    res.json({ alerts, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
