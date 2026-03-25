import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  alertId: {   // <-- custom ID field
    type: String,
    required: true,
    unique: true
  },
  userId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now, index: true }
});

// Auto-delete user locations after 7 days
userSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model("UserLocation", userSchema);
