import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../utils/cloudinary.js";

const router = express.Router();

// Storage engine for multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "cab-escort", // folder in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const upload = multer({ storage });

// Upload endpoint
router.post("/", upload.single("image"), (req, res) => {
  try {
    res.json({
      message: "Image uploaded successfully",
      url: req.file.path, // Cloudinary URL
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

