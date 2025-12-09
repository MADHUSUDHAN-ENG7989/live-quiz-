import amqp from 'amqplib';
import mongoose from 'mongoose';
import connectDB from './db.js';
import QuizResult from './models/quizResult.js';
import Quiz from './models/quiz.js';
import redisClient from './redisClient.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const QUEUE_NAME = 'quiz_submissions';
const VALIDATION_QUEUE = 'question_validation';

// Redis Publisher
const redisPublisher = redisClient.duplicate();
await redisPublisher.connect();

async function startWorker() {
    try {
        // 1. Connect to MongoDB
        await connectDB();
        console.log("✅ Worker connected to MongoDB");

        // 2. Connect to RabbitMQ
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        const channel = await connection.createChannel();
        
        await channel.assertQueue(QUEUE_NAME, {
            durable: true // Ensure queue survives restarts
        });

        // Prevent worker crash on connection errors
        connection.on('error', (err) => {
            console.error('❌ Worker RabbitMQ Connection Error:', err);
        });

        connection.on('close', () => {
             console.warn('⚠️ Worker RabbitMQ Connection Closed');
        });

        console.log(`Waiting for messages in ${QUEUE_NAME}. To exit press CTRL+C`);

        channel.prefetch(1); // Process one message at a time per worker

        channel.consume(QUEUE_NAME, async (msg) => {
            if (msg !== null) {
                const content = JSON.parse(msg.content.toString());
                console.log("📥 Received submission:", content.userid, "for quiz:", content.quizId);

                try {
                    await processSubmission(content);
                    channel.ack(msg); // Acknowledge success
                    console.log("✅ Processed & Acknowledged");
                } catch (err) {
                    console.error("❌ Error processing submission:", err);
                    // channel.nack(msg); // Optional: Re-queue or Dead Letter Queue logic
                }
            }
        });

        // Consumer for Question Validation
        await channel.assertQueue(VALIDATION_QUEUE, { durable: true });
        channel.consume(VALIDATION_QUEUE, async (msg) => {
            if (msg !== null) {
                const content = JSON.parse(msg.content.toString());
                try {
                    await validateAnswer(content);
                    channel.ack(msg);
                } catch (err) {
                    console.error("❌ Error validating answer:", err);
                }
            }
        });

    } catch (err) {
        console.error("Worker startup error:", err);
    }
}

async function processSubmission(data) {
    const { userid, quizId, quizTitle, totalTime, studentAnswers, studentTimes } = data;

    // Fetch the full quiz to get correct answers and marks
    // We could fetch from Redis for speed, but MongoDB is safer for the "Source of Truth" in the worker
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
        throw new Error(`Quiz not found: ${quizId}`);
    }

    let totalScore = 0;
    let totalPossibleMarks = 0;
    const detailedAnswers = [];

    quiz.questions.forEach((q, index) => {
        const marks = parseInt(q.marks || 1);
        totalPossibleMarks += marks;
        
        const studentAns = studentAnswers[index.toString()];
        const isCorrect = studentAns === q.correctOption;
        const marksEarned = isCorrect ? marks : 0;
        
        if (isCorrect) totalScore += marksEarned;

        detailedAnswers.push({
            questionId: index.toString(),
            questionText: q.question,
            userAnswer: studentAns || null,
            correctAnswer: q.correctOption,
            isCorrect: isCorrect,
            marksEarned: marksEarned,
            timeTaken: parseInt(studentTimes[index.toString()] || 0),
            timeLimit: q.timeLimit || 30
        });
    });

    const result = new QuizResult({
        studentId: userid,
        quizId: quizId,
        quizTitle: quizTitle || quiz.title,
        score: totalScore,
        totalMarks: totalPossibleMarks,
        totalTimeTaken: totalTime || 0,
        answers: detailedAnswers
    });

    await result.save();
    console.log(`💾 Saved Result: ${userid} - ${totalScore}/${totalPossibleMarks}`);

    // Notify User via Redis Pub/Sub
    await redisPublisher.publish('quiz_notifications', JSON.stringify({
        userid: userid,
        type: 'quiz_completed',
        payload: result
    }));
    console.log(`🔔 Published notification for ${userid}`);

    // Notify Server for Metrics
    if (process.send) {
        process.send({ type: 'submission_processed', quizId: quizId, userid: userid });
    }
}

async function validateAnswer(data) {
    const { userid, quizId, questionIndex, answer } = data;
    
    // We can get the correct answer from Redis (faster) or DB
    // Since worker has DB access, let's use DB for reliability or Redis if available
    // For now, let's fetch from DB as it's safer
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;

    const question = quiz.questions[questionIndex];
    const isCorrect = question.correctOption === answer;
    
    // Publish result back to server
    await redisPublisher.publish('quiz_notifications', JSON.stringify({
        userid: userid,
        type: 'answer_result',
        payload: {
            questionIndex,
            isCorrect,
            correctOption: isCorrect ? null : question.correctOption, // Optional: reveal answer?
            message: isCorrect ? "Correct!" : "Incorrect"
        }
    }));
    console.log(`✅ Validated answer for ${userid}: ${isCorrect ? 'Correct' : 'Incorrect'}`);

    if (process.send) {
        process.send({ type: 'answer_validated', userid: userid });
    }
}

startWorker();
