import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    // Get MongoDB URI from environment variable, fallback to local MongoDB
    const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/quizapp";
    if (!mongoURI) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    await mongoose.connect(mongoURI, {
      // Optional: Add these options for better connection handling
      // useNewUrlParser: true,      // These are now default in Mongoose 6+
      // useUnifiedTopology: true,   // These are now default in Mongoose 6+
    });

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ DB Connection Error:", err.message);
    process.exit(1); // Exit process with failure
  }
};

// Handle connection events
mongoose.connection.on("connected", () => {
  console.log("🔗 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected from MongoDB");
});

export default connectDB;