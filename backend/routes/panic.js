import express from "express";
import UserLocation from "../models/userLocation.js";
import Panic from "../models/panic.js";
import User from "../models/User.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/* ---------- GET all panic alerts ---------- */
router.get("/", async (req, res) => {
  try {
    const panics = await Panic.find().sort({ createdAt: -1 });
    res.status(200).json(panics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- GET all locations ---------- */
router.get("/locations", async (req, res) => {
  try {
    const locations = await UserLocation.find().sort({ updatedAt: -1 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- TEST ---------- */
router.get("/test", (req, res) => {
  res.json({ message: "✅ Panic routes working" });
});

/* ---------- CREATE panic ---------- */
router.post("/", async (req, res) => {
  try {
    const { userId, latitude, longitude, type } = req.body;

    if (!userId || latitude == null || longitude == null) {
      return res
        .status(400)
        .json({ error: "userId, latitude, longitude required" });
    }

    const alertId = uuidv4();

    await UserLocation.create({
      alertId,
      userId,
      latitude,
      longitude,
      updatedAt: new Date(),
    });

    let username;
    try {
      const user = await User.findById(userId).select("username");
      if (user) username = user.username;
    } catch {}

    await Panic.create({
      userId,
      username,
      location: { lat: latitude, lng: longitude },
    });

    console.log("[PANIC]", { alertId, userId, latitude, longitude });

    res.status(201).json({ message: "Panic received", alertId });
  } catch (err) {
    console.error("Panic error:", err);
    res.status(500).json({ error: "Server error saving panic" });
  }
});

export default router;


