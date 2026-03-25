import mongoose from "mongoose";

const liveStreamSchema = new mongoose.Schema({
  streamId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("LiveStream", liveStreamSchema);
