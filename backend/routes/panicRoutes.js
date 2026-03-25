import express from "express";
import UserLocation from "../models/UserLocation.js";   // <- one folder up

const router = express.Router();

router.post("/panic", async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.body;

    const newLocation = await UserLocation.create({
      userId,
      latitude,
      longitude,
    });

    res.status(201).json({ message: "Location saved", data: newLocation });
  } catch (error) {
    console.error("Error saving location:", error);
    res.status(500).json({ error: "Failed to save location" });
  }
});

export default router;
