import express from "express";
import User from "../models/User.js";

const router = express.Router();

/* ---------- STATUS ---------- */
router.get("/", (req, res) => {
  res.json({ message: "✅ Auth routes working" });
});

/* ---------- SIGNUP ---------- */
router.post("/signup", async (req, res) => {
  try {
    const { username, password, mobile, trustedContacts } = req.body;

    if (!username || !password || !mobile) {
      return res.status(400).json({
        error: "Username, password, mobile required",
      });
    }

    const existing = await User.findOne({ mobile });
    if (existing) {
      return res.status(400).json({
        error: "Mobile already registered",
      });
    }

    const user = await User.create({
      username,
      password,
      mobile,
      trustedContacts: trustedContacts || [],
    });

    res.status(201).json({
      message: "Signup successful",
      userId: user._id,
      username: user.username,
      mobile: user.mobile,
      trustedContacts: user.trustedContacts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- LOGIN ---------- */
router.post("/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;

    const user = await User.findOne({ mobile, password });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    res.json({
      message: "Login successful",
      userId: user._id,
      username: user.username,
      mobile: user.mobile,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- GET all users ---------- */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- UPDATE profile ---------- */
router.put("/update/:id", async (req, res) => {
  try {
    const { username, mobile, trustedContacts } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (username !== undefined) user.username = username;
    if (mobile !== undefined) user.mobile = mobile;
    if (trustedContacts !== undefined)
      user.trustedContacts = trustedContacts;

    await user.save();

    res.json({
      message: "Profile updated",
      username: user.username,
      mobile: user.mobile,
      trustedContacts: user.trustedContacts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;



