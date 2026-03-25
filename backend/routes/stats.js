import adminAuth from "../middlewares/adminAuth.js";
import express from "express";
import CabEscortTrip from "../models/CabEscortTrip.js";
import WalkSession from "../models/WalkSession.js";

const router = express.Router();

router.get("/dashboard", adminAuth, async (req, res) => {
  try {
    const now = new Date();

    // ── Calendar boundaries (midnight local time) ──────────────────────────
    const startOfDay       = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfDay.getDate() - 1);

    // Rolling 7-day window (last 7 full days, not "since last Sunday").
    // This prevents week=0 whenever today is early in the calendar week.
    const startOfWeek     = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - 7);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);

    // Calendar month boundaries
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(startOfMonth);   // exclusive upper bound

    const [
      todayCab,     todayWalk,
      yesterdayCab, yesterdayWalk,
      weekCab,      weekWalk,
      lastWeekCab,  lastWeekWalk,
      monthCab,     monthWalk,
      lastMonthCab, lastMonthWalk,
      lifetimeCab,  lifetimeWalk,
    ] = await Promise.all([
      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfDay } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfDay } }),

      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfDay } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfYesterday, $lt: startOfDay } }),

      // Rolling last-7-days (always non-zero if there is any recent activity)
      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfWeek } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfWeek } }),

      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfLastWeek, $lt: startOfWeek } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfLastWeek, $lt: startOfWeek } }),

      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfMonth } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfMonth } }),

      CabEscortTrip.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: endOfLastMonth } }),
      WalkSession.countDocuments({   createdAt: { $gte: startOfLastMonth, $lt: endOfLastMonth } }),

      // True lifetime totals — all records ever created
      CabEscortTrip.countDocuments({}),
      WalkSession.countDocuments({}),
    ]);

    res.json({
      today:     { cab: todayCab,      walk: todayWalk },
      yesterday: { cab: yesterdayCab,  walk: yesterdayWalk },
      week:      { cab: weekCab,       walk: weekWalk },
      lastWeek:  { cab: lastWeekCab,   walk: lastWeekWalk },
      month:     { cab: monthCab,      walk: monthWalk },
      lastMonth: { cab: lastMonthCab,  walk: lastMonthWalk },
      lifetime:  { cab: lifetimeCab,   walk: lifetimeWalk },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
