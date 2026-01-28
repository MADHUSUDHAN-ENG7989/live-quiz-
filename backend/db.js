import mongoose from "mongoose";
import dotenv from "dotenv";
import { MongoMemoryServer } from 'mongodb-memory-server';

// Load environment variables
dotenv.config();

let mongod = null;

const connectDB = async () => {
  try {
    // Get MongoDB URI from environment variable, fallback to local MongoDB
    let mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/quizapp";

    // Attempt to connect to the provided URI first
    console.log(`Connecting to MongoDB at ${mongoURI}...`);
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.warn("⚠️ standard DB Connection failed:", err.message);
    console.log("🔄 Attempting to start In-Memory MongoDB...");

    try {
      mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      console.log(`Checking Mongo Memory Server URI: ${uri}`);

      await mongoose.connect(uri);
      console.log("✅ Connected to In-Memory MongoDB");
    } catch (memErr) {
      console.error("❌ Fatal: Could not connect to any MongoDB source", memErr);
      process.exit(1);
    }
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

// Clean up on exit
process.on('SIGINT', async () => {
  if (mongod) {
    await mongoose.disconnect();
    await mongod.stop();
  }
  process.exit(0);
});

export default connectDB;