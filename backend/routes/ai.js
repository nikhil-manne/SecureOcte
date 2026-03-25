import express from "express";
import { chatWithGemini } from "../gemini.js";

const router = express.Router();

/* ---------- STATUS ---------- */
router.get("/", (req, res) => {
  res.json({ message: "✅ AI route active" });
});

/* ---------- CHAT ---------- */
router.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        reply: "Invalid request format",
      });
    }

    const reply = await chatWithGemini(messages);
    res.json({ reply });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({
      reply: "I’m here for you, but I’m having trouble responding right now.",
    });
  }
});

export default router;

