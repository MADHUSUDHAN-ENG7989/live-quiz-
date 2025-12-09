import mongoose from "mongoose";

const malpracticeLogSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  quizId: { type: String, required: false }, // Optional, as it might happen outside a specific quiz context if extended
  eventType: { type: String, required: true }, // e.g., "tab_switch", "blur", "window_leave"
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model("MalpracticeLog", malpracticeLogSchema);
