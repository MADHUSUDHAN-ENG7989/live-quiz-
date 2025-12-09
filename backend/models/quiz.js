import mongoose from 'mongoose';

const QuizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    questions: [{
        question: String,
        options: {
            A: String,
            B: String,
            C: String,
            D: String
        },
        correctOption: String,
        marks: Number,
        timeLimit: Number  // Time limit in seconds
    }],
    createdBy: {
        type: String, // userid of the teacher
        required: true
    },
    timerMode: {
        type: String,
        enum: ['whole_quiz', 'per_question'],
        default: 'per_question'
    },
    totalQuizTime: {
        type: Number,  // Total quiz time in minutes (for whole_quiz mode)
        default: 30
    },
    allowedSections: {
        type: [String], // Array of allowed sections e.g. ["A", "B"]
        default: []     // Empty means allowed for all
    },
    status: {
        type: String,
        enum: ['active', 'ended', 'scheduled'],
        default: 'active'
    },
    scheduledStartTime: {
        type: Date,
        default: null
    },
    scheduledEndTime: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Quiz', QuizSchema);
