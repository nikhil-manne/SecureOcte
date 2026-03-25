import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import panicRoutes from "./routes/panic.js";
import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/upload.js";
import streamRoutes from "./routes/stream.js";
import aiRoutes from "./routes/ai.js";

/* ---------- ESM dirname fix ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- App ---------- */
dotenv.config();
const app = express();

/* ---------- Middleware ---------- */
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ---------- Serve public files ---------- */
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Routes ---------- */
app.use("/api/panic", panicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/stream", streamRoutes);
app.use("/ai", aiRoutes);

/* ---------- Stream viewer route ---------- */
app.get("/stream/:streamId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "stream.html"));
});

/* ---------- Health ---------- */
app.get("/health", (req, res) => res.send("OK"));

/* ---------- DB + Server ---------- */
const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  })
  .catch(err => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });




