import express from "express";
import { v4 as uuidv4 } from "uuid";
import LiveStream from "../models/LiveStream.js";
import UserLocation from "../models/userLocation.js";

const router = express.Router();

/* CREATE NEW STREAM */
router.post("/create", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  const streamId = uuidv4();

  await LiveStream.create({
    streamId,
    userId
  });

  res.json({
    streamUrl: `${process.env.PUBLIC_BASE_URL}/stream/${streamId}`
  });
});

/* GET LIVE LOCATION BY STREAM */
router.get("/:streamId", async (req, res) => {
  const stream = await LiveStream.findOne({ streamId: req.params.streamId });
  if (!stream) return res.status(404).json({ error: "Invalid stream" });

  const location = await UserLocation
    .findOne({ userId: stream.userId })
    .sort({ updatedAt: -1 });

  res.json(location);
});

export default router;
