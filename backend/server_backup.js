// backend/server.js
import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import connectDB from "./db.js";
import logindata from "./models/logindata.js";

import jwt from "jsonwebtoken";
// 🚨 IMPORTANT: You must install this package: npm install bcrypt
import bcrypt from "bcrypt";
const SALT_ROUNDS = 10; // Standard number of rounds for hashing

const SECRET_KEY = "4f8e2a1b9c6d3e7f5a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f"; // put strong key

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

connectDB();

// ===============================
//  ROUTES (Authentication)
// ===============================

// Register new user (with password hashing)
app.post("/register", async (req, res) => {
  try {
    const { userid, password, role } = req.body;

    if (!userid || !password || !role) {
      return res.status(400).json({ message: "Missing userid, password, or role" });
    }

    let check = await logindata.findOne({ userid });
    if (check) {
      return res.json({ message: "USER ID already exist!" });
    }

    // 🔒 HASH THE PASSWORD
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = new logindata({
      userid,
      password: hashedPassword, // Store the hashed password
      role
    });

    await user.save();

    res.json({ message: "Login data saved successfully!" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Error saving data" });
  }
});

// checking existing or not (Login with password comparison)
app.post("/check-user", async (req, res) => {
  const { userid, pswd } = req.body;

  if (!userid || !pswd) {
    return res.json({ exists: false, message: "Missing userid or password" });
  }

  const user = await logindata.findOne({ userid });

  if (user) {
    // 🔒 COMPARE HASHED PASSWORD
    const isMatch = await bcrypt.compare(pswd, user.password);

    if (isMatch) {
      const token = jwt.sign(
        { userid: user.userid, role: user.role },
        SECRET_KEY,
        { expiresIn: "30m" }
      );

      res.json({
        exists: true,
        message: "Login successful",
        token,
        userid: user.userid,
        role: user.role
      });

    } else {
      res.json({ exists: false, message: "Incorrect password" });
    }

  } else {
    res.json({ exists: false, message: "User does not exist" });
  }
});

// Dashboard (protected route)
app.get("/dashboard", verifyToken, async (req, res) => {
  const user = await logindata.findOne({ userid: req.user.userid });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    message: "Token valid",
    user: {
      userid: user.userid,
      role: user.role
    }
  });
});

// Verify Token Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Access Denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ===============================
//  START SERVER + WEBSOCKET
// ===============================

import http from "http";
import { Server } from "socket.io";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/**
 * 💡 NOTE ON QUIZ BROADCASTING:
 * The function io.emit("send_quiz_to_students", quizData) already broadcasts
 * the quiz to ALL connected sockets. If students aren't receiving it,
 * ensure their frontend client code is connected AND listening for the
 * 'send_quiz_to_students' event. The backend logic here is correct for
 * sending a broadcast.
 */
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Teacher creates full quiz (broadcasts to all)
  socket.on("teacher_create_quiz", (quizData) => {
    console.log("Quiz Created by Teacher:", quizData);
    io.emit("send_quiz_to_students", quizData); // Broadcasts to all connected clients
  });

  // Teacher sends single question (broadcasts to all)
  socket.on("send_question", (questionData) => {
    io.emit("receive_question", questionData);
  });

  // Student submits answer (broadcasts to all, primarily for teacher/dashboard)
  socket.on("submit_answer", (answerData) => {
    console.log("Student answer:", answerData);
    io.emit("new_answer", answerData); // teacher receives
  });

  // Student joins
  socket.on("student_joined", (data) => {
    console.log("Student joined:", data.userid);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


server.listen(PORT, () => {
  console.log(`🚀 Server + WebSocket running at http://localhost:${PORT}`);
});