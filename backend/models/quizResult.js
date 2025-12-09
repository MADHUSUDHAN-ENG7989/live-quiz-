import mongoose from 'mongoose';

const QuizResultSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        index: true
    },
    quizId: {
        type: String,
        required: true,
        index: true
    },
    quizTitle: {
        type: String,
        required: true
    },
    score: {
        type: Number,
        required: true
    },
    totalMarks: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    totalTimeTaken: {
        type: Number, // Total time in seconds
        default: 0
    },
    answers: [{
        questionId: String,
        questionText: String,
        userAnswer: String,
        correctAnswer: String,
        isCorrect: Boolean,
        marksEarned: Number,
        timeTaken: Number, // Time spent on this question in seconds
        timeLimit: Number // Time limit for this question
    }]
});

export default mongoose.model('QuizResult', QuizResultSchema);
