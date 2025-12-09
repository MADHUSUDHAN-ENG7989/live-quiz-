
import mongoose from "mongoose";

const logindataSchema = new mongoose.Schema({
  userid: String,
  name: String,
  password: String,
  role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
  section: { type: String, enum: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], default: null } 
});

export default mongoose.model("logindata", logindataSchema);