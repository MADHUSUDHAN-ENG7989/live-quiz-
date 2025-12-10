import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import connectDB from "./db.js";
import logindata from "./models/logindata.js";
import QuizResult from "./models/quizResult.js";
import Quiz from "./models/quiz.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import http from "http";
import MalpracticeLog from "./models/MalpracticeLog.js";
import { Server } from "socket.io";
import redisClient from "./redisClient.js";
import multer from "multer";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import Groq from "groq-sdk";
import dotenv from "dotenv";
import os from "os";
import amqp from 'amqplib';
import { fork } from 'child_process';

import winston from 'winston';
import { metricsMiddleware } from './middleware.js';
import {
  register,
  wsConnectionsGauge,
  wsEventsCounter,
  activeQuizzesGauge,
  quizSubmissionsCounter,
  quizCreationCounter,
  studentAnswersCounter,
  authAttemptsCounter,
  registrationCounter,
  errorCounter,
  aiGenerationCounter,
  aiGenerationDuration,
  rabbitMQMessagesCounter,
  rabbitMQQueueSizeGauge
} from './metrics.js';

// System Logging
const systemLogs = [];
const MAX_LOGS = 250; 

function captureLog(category, message, metadata = {}) {
    // Determine category if not explicitly set strings
    if (category === 'info' || category === 'error') {
        const msgStr = (typeof message === 'string') ? message.toLowerCase() : JSON.stringify(message).toLowerCase();
        if (msgStr.includes('quiz')) category = 'QUIZ';
        else if (msgStr.includes('user') || msgStr.includes('login') || msgStr.includes('token') || msgStr.includes('register')) category = 'AUTH';
        else if (msgStr.includes('rabbit')) category = 'SYSTEM';
        else if (msgStr.includes('socket') || msgStr.includes('connect')) category = 'NETWORK';
        else category = category.toUpperCase();
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        timestamp,
        category: category.toUpperCase(), 
        message,
        metadata
    };
    
    systemLogs.unshift(logEntry);
    if (systemLogs.length > MAX_LOGS) {
        systemLogs.pop();
    }
}

// Custom Transport for UI logs
class UiTransport extends winston.Transport {
  log(info, callback) {
    const { level, message, ...meta } = info;
    captureLog(level, message, meta);
    callback();
  }
}

// Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() }),
    new UiTransport() // Add our custom transport
  ],
});



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const upload = multer({ dest: "uploads/" });
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// RabbitMQ Setup
let rabbitChannel = null;
const QUEUE_NAME = 'quiz_submissions';
const VALIDATION_QUEUE = 'question_validation';

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });
        await rabbitChannel.assertQueue(VALIDATION_QUEUE, { durable: true });
        console.log("✅ Connected to RabbitMQ");

        // Start Worker Process
        const workerPath = path.join(__dirname, 'worker.js');
        const workerProcess = fork(workerPath);
        
        console.log(`👷 Worker process started with PID: ${workerProcess.pid}`);

        workerProcess.on('error', (err) => {
            console.error('❌ Worker process failed:', err);
        });

        workerProcess.on('exit', (code) => {
            console.log(`⚠️ Worker process exited with code ${code}`);
        });

        workerProcess.on('message', (msg) => {
            if (msg.type === 'submission_processed') {
                rabbitMQQueueSizeGauge.labels('quiz_submissions').dec();
                quizSubmissionsCounter.inc({ quiz_id: msg.quizId, status: 'completed' });
            } else if (msg.type === 'answer_validated') {
                rabbitMQQueueSizeGauge.labels('question_validation').dec();
                studentAnswersCounter.inc({ status: 'validated' });
            }
        });

        // Prevent server crash on connection errors
        connection.on('error', (err) => {
            console.error('❌ RabbitMQ Connection Error:', err);
            // Non-fatal, letting it attempt reconnect or just logging
        });

        connection.on('close', () => {
             console.warn('⚠️ RabbitMQ Connection Closed');
        });

    } catch (err) {
        console.error("❌ RabbitMQ Connection Error:", err);
    }
}
connectRabbitMQ();

const SALT_ROUNDS = 10;
const SECRET_KEY = process.env.JWT_SECRET ;

const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(metricsMiddleware);

// DEBUG LOGGING
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log(`[AUTH] Verifying token: ${token ? token.substring(0, 10) + '...' : 'null'}`);

    if (token == null) {
        console.log("[AUTH] No token provided");
        return res.sendStatus(401); 
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.log("[AUTH] Token verification failed:", err.message);
            return res.sendStatus(403);
        }
        console.log("[AUTH] Token verified for user:", user.userid);
        req.user = user;
        next();
    });
}

// Override console methods to capture logs
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    originalLog.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    captureLog('INFO', msg); // captureLog handles categorization now
};

console.error = function(...args) {
    originalError.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    captureLog('ERROR', msg);
};

app.get('/api/system-logs', (req, res) => {
    res.json(systemLogs);
});

// Prometheus Metrics Endpoint (Placeholder)
app.get('/api/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
    } catch (err) {
        logger.error('Error generating metrics', { error: err.message });
        res.status(500).end();
    }
});

// Redirect root to login
app.get("/", (req, res) => {
    res.redirect("/index.html");
});

// Update your /register endpoint to track metrics:
app.post("/register", async (req, res) => {
    try {
        const { userid, password, role, section } = req.body;

        if (!userid || !password || !role) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await logindata.findOne({ userid: { $regex: `^${userid}$`, $options: 'i' } });
        if (existingUser) {
            return res.json({ message: "User ID already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const user = new logindata({ 
            userid, 
            password: hashedPassword, 
            role, 
            section: role === 'student' ? section : null 
        });

        await user.save();
        
        // Track registration metric
        registrationCounter.inc({ role });
        
        logger.info(`New user registered: ${userid} (${role})`);
        res.json({ message: "Login data saved successfully!" });

    } catch (err) {
        logger.error("Registration error:", err);
        errorCounter.inc({ type: 'registration', route: '/register' });
        res.status(500).json({ error: "Failed to register user" });
    }
});

// Update your /check-user endpoint:
app.post("/check-user", async (req, res) => {
  const { userid, pswd } = req.body;
  if (!userid || !pswd) {
    authAttemptsCounter.inc({ result: 'failed', role: 'unknown' });
    return res.json({ exists: false, message: "Missing userid or password" });
  }
  try {
    const user = await logindata.findOne({ userid: { $regex: `^${userid}$`, $options: 'i' } });
    if (user) {
        const isMatch = await bcrypt.compare(pswd, user.password);
        if (isMatch) {
             const token = jwt.sign(
                { userid: user.userid, role: user.role, section: user.section },
                SECRET_KEY,
                { expiresIn: "1h" }
            );

            authAttemptsCounter.inc({ result: 'success', role: user.role });
            logger.info(`User logged in: ${userid}`);
            
            res.json({ 
                exists: true, 
                message: "Login successful!", 
                token,
                role: user.role,
                userid: user.userid,
                name: user.name || user.userid, // Fallback to userid if name is missing
                redirect: user.role === 'admin' ? '/admin_dashboard.html' : 
                          user.role === 'teacher' ? '/teacher_dashboard.html' : 
                          '/student_dashboard.html'
            });
        } else {
             authAttemptsCounter.inc({ result: 'failed', role: user.role });
             return res.json({ exists: false, message: "Incorrect password!" });
        }
    } else {
        authAttemptsCounter.inc({ result: 'failed', role: 'unknown' });
        logger.warn(`User not found: ${userid}`);
        return res.json({ exists: false, message: "User not found!" });
    }
  } catch (err) {
      logger.error("Check-user error:", err);
      errorCounter.inc({ type: 'auth', route: '/check-user' });
      res.status(500).json({ error: "Server error" });
  }
});

// MISSING ENDPOINT FIXED
app.get("/dashboard", authenticateToken, (req, res) => {
    console.log(`[DASHBOARD] Serving dashboard for ${req.user.userid}`);
    // req.user is populated by authenticateToken middleware
    res.json({ 
        message: "Welcome to dashboard", 
        user: req.user 
    });
});

// Restore active quiz state from MongoDB to Redis on server start
async function restoreActiveQuizState() {
    try {
        // Give DB a moment to connect if needed, though connectDB should handle it
        const activeQuizzes = await Quiz.find({ status: 'active' }).sort({ createdAt: -1 });
        
        if (activeQuizzes.length > 0) {
            const mostRecent = activeQuizzes[0];
            console.log(`♻️ Restoring active quiz: ${mostRecent.title} (${mostRecent._id})`);
            
            // Re-construct the quiz data structure expected by Redis/Frontend
            const quizData = {
                id: mostRecent._id.toString(),
                _id: mostRecent._id.toString(), // Support both formats
                title: mostRecent.title,
                questions: mostRecent.questions,
                timerMode: mostRecent.timerMode,
                totalQuizTime: mostRecent.totalQuizTime,
                status: 'active'
            };
            
            await redisClient.set("quiz:active", JSON.stringify(quizData));
            
            // Clean up older "active" quizzes to prevent conflicts
            if (activeQuizzes.length > 1) {
                for (let i = 1; i < activeQuizzes.length; i++) {
                    console.log(`⚠️ Auto-ending old active quiz: ${activeQuizzes[i].title}`);
                    activeQuizzes[i].status = 'ended';
                    await activeQuizzes[i].save();
                }
            }
        } else {
            // If no active quizzes in DB, ensure Redis is clear
            await redisClient.del("quiz:active");
        }
    } catch (err) {
        console.error("Error restoring active quiz state:", err);
    }
}

// Redis Subscriber for Worker Notifications
const redisSubscriber = redisClient.duplicate();
await redisSubscriber.connect();

redisSubscriber.subscribe('quiz_notifications', (message) => {
    try {
        const data = JSON.parse(message);
        console.log(`🔔 Notification received: ${data.type} for ${data.userid}`);
        io.to(data.userid).emit(data.type, data.payload);
    } catch (err) {
        console.error("Error processing redis notification:", err);
    }
});

connectDB().then(() => {
    restoreActiveQuizState();
});

app.get("/dashboard", (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Access Denied. No token provided." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({ message: "Welcome to Dashboard", user: decoded });
  } catch (err) {
    res.status(401).json({ message: "Invalid Token" });
  }
});

function getSystemHealth(req, res) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Access Denied. No token provided." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    
    const memoryUsage = process.memoryUsage();
    const loadAvg = os.loadavg();
    const activeConnections = (typeof io !== 'undefined' && io && io.engine) ? io.engine.clientsCount : 0;

    res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed
        },
        loadAvg: loadAvg,
        activeConnections: activeConnections
    });
  } catch (err) {
    console.error("System health error:", err);
    res.status(500).json({ error: "Failed to fetch system health" });
  }
}

app.get('/api/system-health', getSystemHealth);



app.get('/api/all-results', async (req, res) => {
    try {
        const results = await QuizResult.find().sort({ timestamp: -1 });
        res.json(results);
    } catch (err) {
        console.error("Fetch all results error:", err);
        res.status(500).json({ error: "Failed to fetch results" });
    }
});

app.get('/api/result/:resultId', async (req, res) => {
    try {
        const result = await QuizResult.findById(req.params.resultId);
        if (!result) return res.status(404).json({ error: "Result not found" });
        res.json(result);
    } catch (err) {
        console.error("Fetch result error:", err);
        res.status(500).json({ error: "Failed to fetch result" });
    }
});

app.get('/api/analytics/:userid', async (req, res) => {
    try {
        const results = await QuizResult.find({ studentId: req.params.userid }).sort({ timestamp: -1 });
        res.json(results);
    } catch (err) {
        console.error("Analytics error:", err);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

// Get Leaderboard (Last 3 Quizzes)
app.get('/api/leaderboard', async (req, res) => {
    try {
        // 1. Get last 3 quizzes (ended or active)
        const last3Quizzes = await Quiz.find({ status: { $in: ['ended', 'active'] } })
            .sort({ createdAt: -1 })
            .limit(3);

        if (last3Quizzes.length === 0) {
            return res.json([]);
        }

        const quizIds = last3Quizzes.map(q => q._id.toString());
        
        // 2. Get all students
        const students = await logindata.find({ role: 'student' });
        
        // 3. Get all results for these quizzes
        const results = await QuizResult.find({ quizId: { $in: quizIds } });

        const leaderboard = students.map(student => {
            let totalScore = 0;
            let totalPossible = 0;

            last3Quizzes.forEach(quiz => {
                // Calculate total possible marks for this quiz
                const quizTotalMarks = quiz.questions.reduce((sum, q) => sum + parseInt(q.marks || 1), 0);
                totalPossible += quizTotalMarks;

                // Find student's result for this quiz
                const result = results.find(r => 
                    r.studentId === student.userid && 
                    r.quizId.toString() === quiz._id.toString()
                );

                if (result) {
                    totalScore += result.score;
                }
                // If absent (no result), score remains 0 for this quiz
            });

            const percentage = totalPossible > 0 ? ((totalScore / totalPossible) * 100).toFixed(2) : 0;

            return {
                userid: student.userid,
                totalScore,
                totalPossible,
                percentage: parseFloat(percentage)
            };
        });

        // 4. Sort by percentage descending
        leaderboard.sort((a, b) => b.percentage - a.percentage);

        res.json(leaderboard);

    } catch (err) {
        console.error("Leaderboard error:", err);
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});

// Get all quizzes (for teacher dashboard/filters)
app.get('/api/quizzes', async (req, res) => {
    try {
        const quizzes = await Quiz.find().sort({ createdAt: -1 });
        res.json(quizzes);
    } catch (err) {
        console.error("Error fetching quizzes:", err);
        res.status(500).json({ error: "Failed to fetch quizzes" });
    }
});

// Get quizzes for student (Live/Scheduled vs Ended/Completed)
app.get('/api/quizzes/for-student/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 1. Get student details to check section
        const student = await logindata.findOne({ userid: userId });
        const studentSection = student ? student.section : null;

        // 2. Get all quizzes
        const allQuizzes = await Quiz.find().sort({ createdAt: -1 });
        
        // 3. Get student's results to know which they've completed
        const studentResults = await QuizResult.find({ studentId: userId });
        const completedQuizIds = new Set(studentResults.map(r => r.quizId.toString()));
        const availableQuizzes = [];
        const completedQuizzes = [];
        const now = new Date();

        for (const quiz of allQuizzes) {
            // Check if student already completed this quiz
            if (completedQuizIds.has(quiz._id.toString())) {
                completedQuizzes.push(quiz);
                continue;
            }

            // Check Section Access
            if (quiz.allowedSections && quiz.allowedSections.length > 0) {
                console.log(`Checking access for quiz ${quiz.title}: Allowed=${quiz.allowedSections}, Student=${studentSection}`);
                if (!studentSection || !quiz.allowedSections.includes(studentSection)) {
                    console.log(`🚫 Access denied for quiz ${quiz.title}`);
                    continue; // Skip if student is not in allowed section
                }
            }

            // Handle Scheduled Quizzes
            if (quiz.status === 'scheduled') {
                if (quiz.scheduledStartTime && new Date(quiz.scheduledStartTime) <= now) {
                    // It's time to start! Auto-activate
                    console.log(`⏰ Auto-activating scheduled quiz: ${quiz.title}`);
                    quiz.status = 'active';
                    await quiz.save();

                    // Update Redis so students can join
                    const quizData = {
                        id: quiz._id.toString(),
                        _id: quiz._id.toString(),
                        title: quiz.title,
                        questions: quiz.questions,
                        timerMode: quiz.timerMode,
                        totalQuizTime: quiz.totalQuizTime,
                        status: 'active'
                    };
                    await redisClient.set("quiz:active", JSON.stringify(quizData));
                }
            }

            // Handle Auto-Ending Quizzes
            if (quiz.status === 'active' && quiz.scheduledEndTime) {
                if (new Date(quiz.scheduledEndTime) <= now) {
                    console.log(`🛑 Auto-ending expired quiz: ${quiz.title}`);
                    quiz.status = 'ended';
                    await quiz.save();
                    
                    // If this was the active quiz in Redis, clear it
                    const activeQuizJson = await redisClient.get("quiz:active");
                    if (activeQuizJson) {
                        const activeQuiz = JSON.parse(activeQuizJson);
                        if (activeQuiz.id === quiz._id.toString()) {
                            await redisClient.del("quiz:active");
                            console.log("🧹 Cleared expired quiz from Redis");
                        }
                    }
                    
                    completedQuizzes.push(quiz);
                    continue; // Skip adding to available
                }
            }

            if (quiz.status === 'active' || quiz.status === 'scheduled') {
                availableQuizzes.push(quiz);
            } else if (quiz.status === 'ended') {
                completedQuizzes.push(quiz);
            }
        }
        
        res.json({ availableQuizzes, completedQuizzes });

    } catch (err) {
        console.error("Error fetching student quizzes:", err);
        res.status(500).json({ error: "Failed to fetch quizzes" });
    }
});

// Update your AI generation endpoint:
app.post("/api/generate-quiz", async (req, res) => {
    const startTime = Date.now();
    try {
        const { topic, count, difficulty } = req.body;
        
        if (!process.env.GROQ_API_KEY) {
            aiGenerationCounter.inc({ type: 'topic', status: 'failed' });
            return res.status(500).json({ error: "Groq API Key is missing" });
        }

        const prompt = `Generate exactly ${count} multiple-choice questions about "${topic}" at ${difficulty} difficulty level.

Return ONLY a valid JSON array with this exact structure (no markdown, no backticks, no extra text):
[
  {
    "question": "Question text here",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "correctOption": "A",
    "marks": 1,
    "timeLimit": 30
  }
]`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are a quiz generator. Return only valid JSON arrays, no markdown formatting." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
        });

        const responseText = completion.choices[0].message.content.trim();
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const questions = JSON.parse(cleanText);
        
        // Track metrics
        const duration = (Date.now() - startTime) / 1000;
        aiGenerationCounter.inc({ type: 'topic', status: 'success' });
        aiGenerationDuration.observe({ type: 'topic' }, duration);
        
        logger.info(`Generated ${questions.length} questions using Groq in ${duration}s`);
        res.json(questions);

    } catch (err) {
        const duration = (Date.now() - startTime) / 1000;
        aiGenerationCounter.inc({ type: 'topic', status: 'failed' });
        aiGenerationDuration.observe({ type: 'topic' }, duration);
        
        logger.error("AI Generation Error:", err);
        errorCounter.inc({ type: 'ai_generation', route: '/api/generate-quiz' });
        res.status(500).json({ error: err.message || "Failed to generate questions" });
    }
});

// Document Upload Endpoint - Groq
app.post("/api/upload-quiz-doc", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "Groq API Key is missing in server configuration" });
        }

        const filePath = req.file.path;
        let dataBuffer = fs.readFileSync(filePath);
        let textContent = "";

        if (req.file.mimetype === "application/pdf") {
            const pdfData = await pdfParse(dataBuffer);
            textContent = pdfData.text;
        } else {
            textContent = dataBuffer.toString();
        }

        // Clean up uploaded file
        try {
            fs.unlinkSync(filePath);
        } catch (cleanupErr) {
            console.warn("Warning: Failed to delete temp file:", cleanupErr.message);
        }

        // Truncate text if too long
        const truncatedText = textContent.slice(0, 20000);

        const prompt = `Analyze the following text and generate 5-10 multiple-choice questions based on the key concepts.

Text Content:
"""
${truncatedText}
"""

Return ONLY a valid JSON array with this exact structure (no markdown, no backticks, no extra text):
[
  {
    "question": "Question text here",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "correctOption": "A",
    "marks": 1,
    "timeLimit": 30
  }
]`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: "You are a quiz generator. Analyze documents and create relevant questions. Return only valid JSON arrays, no markdown formatting."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
        });

        const responseText = completion.choices[0].message.content.trim();
        
        // Clean up any markdown formatting
        const cleanText = responseText
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
        
        const questions = JSON.parse(cleanText);
        
        console.log(`✅ Extracted ${questions.length} questions from document using Groq`);
        res.json(questions);

    } catch (err) {
        console.error("Document Processing Error:", err);
        res.status(500).json({ error: err.message || "Failed to process document. Please ensure it contains readable text." });
    }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Track active students: userId -> Set(socketIds)
const activeStudents = new Map();

// --- QUESTION ARENA SOCKET LOGIC ---
io.on('connection', (socket) => {
    // console.log(`🔌 New client connected: ${socket.id}`);

    // Join Arena Room
    socket.on('join_arena', async ({ userid, role }) => {
        socket.join('arena_room');
        
        if (role === 'student') {
            await redisClient.sAdd('arena:participants', userid);
        }

        // Send current scores & leaderboard
        try {
            const teacherScore = await redisClient.get('arena:score:teacher') || 0;
            let studentScore = 0;
            if (role === 'student') {
                studentScore = await redisClient.hGet('arena:score:students', userid) || 0;
            }
            
            socket.emit('score_update', { 
                teacherScore: parseInt(teacherScore), 
                studentScore: parseInt(studentScore) 
            });

            // Send full leaderboard to everyone who joins
            broadcastLeaderboard();

        } catch (err) {
            console.error("Redis Error on Join:", err);
        }
    });

    // Teacher Posts a Question
    socket.on('arena_post_question', (questionData) => {
        // questionData: { question, options, correctOption, timeLimit }
        console.log(`📢 Broadcasting question with ${questionData.timeLimit}s limit`);
        io.to('arena_room').emit('arena_new_question', questionData);
    });

    // Student Submits Answer
    socket.on('arena_submit_answer', async ({ userid, answer, correctOption }) => {
        try {
            const isCorrect = answer === correctOption;
            let currentStudentScore = 0;
            let currentTeacherScore = 0;

            if (isCorrect) {
                 currentStudentScore = await redisClient.hIncrBy('arena:score:students', userid, 1);
                 // Teacher score stays same
                 currentTeacherScore = await redisClient.get('arena:score:teacher') || 0;
            } else {
                 currentTeacherScore = await redisClient.incr('arena:score:teacher');
                 currentStudentScore = await redisClient.hGet('arena:score:students', userid) || 0;
            }

            // Tell the student the result
            socket.emit('arena_answer_result', {
                correct: isCorrect,
                correctOption: correctOption, 
                newScore: parseInt(currentStudentScore),
                teacherScore: parseInt(currentTeacherScore)
            });

            // Broadcast Global Score Update (Mainly Teacher Score)
            io.to('arena_room').emit('arena_global_score_update', {
                teacherScore: parseInt(currentTeacherScore)
            });

            // Broadcast Leaderboard Update
            broadcastLeaderboard();

        } catch (err) {
            console.error("Error processing arena answer:", err);
        }
    });

    // Reset Scores
    socket.on('arena_reset_scores', async () => {
        try {
            await redisClient.del('arena:score:teacher');
            await redisClient.del('arena:score:students');
            await redisClient.del('arena:participants'); // Optional: clear participants? No, keep them.
            // Actually, if we reset scores, we should probably keep participants but reset their scores to 0.
            // For simplicity, we just delete the hash. 
            
            io.to('arena_room').emit('score_update', { teacherScore: 0, studentScore: 0 });
            broadcastLeaderboard(); 
        } catch (err) {
            console.error("Error resetting scores:", err);
        }
    });

    socket.on('disconnect', () => {
        // ... (Existing disconnect logic)
    });
});

async function broadcastLeaderboard() {
    try {
        // specific redis call to get all fields
        const allScores = await redisClient.hGetAll('arena:score:students');
        // Convert to array
        const leaderboard = Object.entries(allScores).map(([userid, score]) => ({
            userid,
            score: parseInt(score)
        }));
        
        // Sort descending
        leaderboard.sort((a,b) => b.score - a.score);

        io.to('arena_room').emit('arena_leaderboard_update', leaderboard);
    } catch (err) {
        console.error("Error broadcasting leaderboard:", err);
    }
}



function getActiveStudentCount() {
    return activeStudents.size;
}

// Update Socket.IO events with metrics:
io.on("connection", (socket) => {
  logger.info("User connected:", socket.id);

  socket.on("teacher_joined", () => {
      logger.info("Teacher joined");
      wsConnectionsGauge.inc({ type: 'teacher' });
      wsEventsCounter.inc({ event_type: 'teacher_joined' });
      socket.emit("update_active_count", getActiveStudentCount());
  });

  socket.on("student_join", async (data) => {
      logger.info(`Student Joined Quiz: ${data.userid}`);
      wsEventsCounter.inc({ event_type: 'student_join' });
      
      if (!activeStudents.has(data.userid)) {
          activeStudents.set(data.userid, new Set());
          wsConnectionsGauge.inc({ type: 'student' });
      }
      activeStudents.get(data.userid).add(socket.id);
      
      socket.join(data.userid);

      let answersCount = 0;
      const quizJson = await redisClient.get("quiz:active");
      if (quizJson) {
          const quizData = JSON.parse(quizJson);
          const answersKey = `answers:${quizData.id}:${data.userid}`;
          answersCount = await redisClient.hLen(answersKey);
          
          socket.emit("send_quiz_to_students", quizData);
      } else {
          socket.emit("no_active_quiz");
      }

      const enrichedData = { ...data, answersCount: answersCount || 0 };
      io.emit("student_joined", enrichedData);
      io.emit("update_active_count", getActiveStudentCount());
  });

  socket.on("monitor_join", async () => {
    logger.info("Monitor joined, syncing state...");
    wsConnectionsGauge.inc({ type: 'monitor' });
    wsEventsCounter.inc({ event_type: 'monitor_join' });

    try {
        const quizJson = await redisClient.get("quiz:active");
        if (!quizJson) {
            socket.emit("monitor_init", { active: false });
            return;
        }

        const quiz = JSON.parse(quizJson);
        const onlineStudents = [];

        // Iterate over all currently active students
        for (const userid of activeStudents.keys()) {
             // Fetch their progress from Redis
             const answersKey = `answers:${quiz.id}:${userid}`;
             const answers = await redisClient.hGetAll(answersKey);
             
             onlineStudents.push({
                 userid: userid,
                 answersCount: Object.keys(answers).length,
                 status: 'online'
             });
        }

        socket.emit("monitor_init", { 
            active: true, 
            quiz: quiz,
            students: onlineStudents
        });
        
    } catch (err) {
        logger.error("Error syncing monitor:", err);
    }
  });

  socket.on("teacher_create_quiz", async (quizData) => {
    logger.info("Quiz Creation:", quizData.title);
    wsEventsCounter.inc({ event_type: 'quiz_created' });
    
    try {
        const isScheduled = !!quizData.scheduledStartTime;
        const status = isScheduled ? 'scheduled' : 'active';

        const newQuiz = new Quiz({
            title: quizData.title,
            questions: quizData.questions,
            createdBy: "teacher",
            timerMode: quizData.timerMode || 'per_question',
            totalQuizTime: quizData.totalQuizTime || 30,
            status: status,
            scheduledStartTime: quizData.scheduledStartTime || null,
            scheduledEndTime: quizData.scheduledEndTime || null,
            allowedSections: quizData.allowedSections || []
        });
        
        const savedQuiz = await newQuiz.save();
        
        // Track metrics
        quizCreationCounter.inc({ status });
        if (!isScheduled) {
            activeQuizzesGauge.inc();
        }
        
        logger.info(`Quiz saved! ID: ${savedQuiz._id} Status: ${status}`);
        
        quizData.id = savedQuiz._id.toString();

        if (!isScheduled) {
            await redisClient.set("quiz:active", JSON.stringify(quizData), { EX: 7200 });
            socket.broadcast.emit("send_quiz_to_students", quizData);
        }

        socket.emit("quiz_created_success", { quizId: savedQuiz._id, message: "Quiz created successfully!" });

    } catch (err) {
        logger.error("Error creating quiz:", err);
        errorCounter.inc({ type: 'quiz_creation', route: 'socket' });
        socket.emit("quiz_creation_failed", { message: "Failed to create quiz" });
    }
  });

  socket.on("submit_answer", async (answerData) => {
    wsEventsCounter.inc({ event_type: 'submit_answer' });
    studentAnswersCounter.inc({ status: 'submitted' });
    
    const { userid, questionIndex, answer, timeTaken } = answerData;
    
    const quizJson = await redisClient.get("quiz:active");
    if (!quizJson) return;
    
    const quiz = JSON.parse(quizJson);
    
    const answersKey = `answers:${quiz.id}:${userid}`;
    const timeKey = `times:${quiz.id}:${userid}`;
    
    await redisClient.hSet(answersKey, questionIndex.toString(), answer);
    if (timeTaken !== undefined) {
      await redisClient.hSet(timeKey, questionIndex.toString(), timeTaken.toString());
    }

    socket.emit("answer_received", { questionIndex, answer });
    io.emit("new_answer", answerData);

    if (rabbitChannel) {
        rabbitChannel.sendToQueue(VALIDATION_QUEUE, Buffer.from(JSON.stringify({
            userid,
            quizId: quiz.id,
            questionIndex,
            answer
        })), { persistent: true });
        rabbitMQMessagesCounter.inc({ queue: 'validation', action: 'sent' });
        rabbitMQQueueSizeGauge.labels('question_validation').inc();
    }
  });

  socket.on("finish_quiz", async (data) => {
      wsEventsCounter.inc({ event_type: 'finish_quiz' });
      
      const { userid, totalTime } = data;
      const quizJson = await redisClient.get("quiz:active");
      if (!quizJson) return;
      const quiz = JSON.parse(quizJson);

      const answersKey = `answers:${quiz.id}:${userid}`;
      const timeKey = `times:${quiz.id}:${userid}`;
      
      const studentAnswers = await redisClient.hGetAll(answersKey);
      const studentTimes = await redisClient.hGetAll(timeKey);

      const payload = {
          userid,
          quizId: quiz.id,
          quizTitle: quiz.title,
          totalTime,
          studentAnswers,
          studentTimes
      };

      if (rabbitChannel) {
          rabbitChannel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
              persistent: true
          });
          rabbitMQMessagesCounter.inc({ queue: 'submissions', action: 'sent' });
          rabbitMQQueueSizeGauge.labels('quiz_submissions').inc();
          quizSubmissionsCounter.inc({ quiz_id: quiz.id, status: 'queued' });
          
          logger.info(`Queued submission for ${userid}`);
          socket.emit("quiz_processing_started", { message: "Result calculation in progress..." });
      }
  });

  socket.on("malpractice_alert", async (data) => {
      logger.warn(`Malpractice Alert: ${data.userid} - ${data.type}`);
      wsEventsCounter.inc({ event_type: 'malpractice' });
      
      try {
          // 1. Save to Database
          await MalpracticeLog.create({
              studentId: data.userid,
              quizId: data.quizId,
              eventType: data.type,
              timestamp: new Date()
          });

          // 2. Broadcast to Teacher/Monitor
          // We broadcast to everyone for now, or specifically to monitor room if we had one.
          // Since monitor joins casually, broadcast is fine or io.emit.
          socket.broadcast.emit("malpractice_alert", data);

      } catch (err) {
          logger.error("Error logging malpractice:", err);
      }
  });

  socket.on("end_quiz", async (data) => {
      wsEventsCounter.inc({ event_type: 'end_quiz' });
      
      try {
          const quizJson = await redisClient.get("quiz:active");
          if (!quizJson) {
              socket.emit("error", { message: "No active quiz to end" });
              return;
          }
          
          const quiz = JSON.parse(quizJson);
          logger.info(`Ending quiz: ${quiz.title} (${quiz.id})`);

          await Quiz.findByIdAndUpdate(quiz.id, { status: 'ended' });
          await redisClient.del("quiz:active");
          
          // Update metrics
          activeQuizzesGauge.dec();

          io.emit("quiz_ended", { quizId: quiz.id });
          logger.info("Quiz ended successfully");

      } catch (err) {
          logger.error("Error ending quiz:", err);
          errorCounter.inc({ type: 'end_quiz', route: 'socket' });
      }
  });

  socket.on("disconnect", () => {
    // logger.info("User disconnected:", socket.id); // Too noisy, removing
    
    for (const [userid, sockets] of activeStudents.entries()) {
        if (sockets.delete(socket.id)) {
            logger.info(`User disconnected: ${userid}`);
            if (sockets.size === 0) {
                activeStudents.delete(userid);
                wsConnectionsGauge.dec({ type: 'student' });
            }
            io.emit("update_active_count", getActiveStudentCount());
            break; 
        }
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}\n`);
});