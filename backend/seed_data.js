import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import logindata from './models/logindata.js';
import Quiz from './models/quiz.js';
import QuizResult from './models/quizResult.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    }
};

const seedData = async () => {
    await connectDB();

    try {
        console.log("🧹 Clearing existing test data...");
        // Optional: Clear existing data to avoid duplicates if run multiple times
        // await logindata.deleteMany({ userid: { $regex: /^test_student_/ } });
        // await Quiz.deleteMany({ title: { $regex: /^Test Quiz/ } });
        // await QuizResult.deleteMany({ quizTitle: { $regex: /^Test Quiz/ } });

        console.log("👥 Creating Students...");
        const hashedPassword = await bcrypt.hash("password123", 10);
        
        const students = [
            { userid: "test_student_top", password: hashedPassword, role: "student", section: "A" },
            { userid: "test_student_avg", password: hashedPassword, role: "student", section: "B" },
            { userid: "test_student_low", password: hashedPassword, role: "student", section: "C" },
            { userid: "test_student_absent", password: hashedPassword, role: "student", section: "A" }
        ];

        for (const s of students) {
            const exists = await logindata.findOne({ userid: s.userid });
            if (!exists) {
                await new logindata(s).save();
                console.log(`   Created ${s.userid}`);
            } else {
                console.log(`   ${s.userid} already exists`);
            }
        }

        console.log("📝 Creating Quizzes...");
        const quizzes = [];
        for (let i = 1; i <= 3; i++) {
            const quiz = new Quiz({
                title: `Test Quiz ${i} (Leaderboard)`,
                questions: [
                    { question: "Q1", options: { A: "A", B: "B", C: "C", D: "D" }, correctOption: "A", marks: 10 },
                    { question: "Q2", options: { A: "A", B: "B", C: "C", D: "D" }, correctOption: "B", marks: 10 },
                    { question: "Q3", options: { A: "A", B: "B", C: "C", D: "D" }, correctOption: "C", marks: 10 }
                ],
                createdBy: "teacher",
                status: "ended", // Important: Must be ended for leaderboard
                timerMode: "per_question",
                totalQuizTime: 30
            });
            const savedQuiz = await quiz.save();
            quizzes.push(savedQuiz);
            console.log(`   Created ${savedQuiz.title}`);
        }

        console.log("📊 Creating Results...");
        
        // Helper to create result
        const createResult = async (studentId, quiz, score) => {
            const result = new QuizResult({
                studentId: studentId,
                quizId: quiz._id.toString(),
                quizTitle: quiz.title,
                score: score,
                totalMarks: 30,
                totalTimeTaken: 60,
                answers: []
            });
            await result.save();
            console.log(`   Result: ${studentId} scored ${score} in ${quiz.title}`);
        };

        // 1. Top Student: 30/30 in all 3
        await createResult("test_student_top", quizzes[0], 30);
        await createResult("test_student_top", quizzes[1], 30);
        await createResult("test_student_top", quizzes[2], 30);

        // 2. Avg Student: 20, 10, 20
        await createResult("test_student_avg", quizzes[0], 20);
        await createResult("test_student_avg", quizzes[1], 10);
        await createResult("test_student_avg", quizzes[2], 20);

        // 3. Low Student: 0, 0, 10
        await createResult("test_student_low", quizzes[0], 0);
        await createResult("test_student_low", quizzes[1], 0);
        await createResult("test_student_low", quizzes[2], 10);

        // 4. REAL STUDENT (24BD1A058H) - For User Verification
        // Give them some good scores so they appear on leaderboard
        await createResult("24BD1A058H", quizzes[0], 25);
        await createResult("24BD1A058H", quizzes[1], 28);
        await createResult("24BD1A058H", quizzes[2], 15);

        // 4. Absent Student: Only took Quiz 1 (30/30), missed others (should be 0)
        await createResult("test_student_absent", quizzes[0], 30);
        // Missed Quiz 2 & 3

        console.log("✅ Seeding Complete!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding Error:", err);
        process.exit(1);
    }
};

seedData();
