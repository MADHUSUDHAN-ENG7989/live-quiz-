import mongoose from 'mongoose';
import QuizResult from './models/quizResult.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/newlivquiz');
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

async function checkResults() {
    await connectDB();
    try {
        const count = await QuizResult.countDocuments();
        console.log(`Total QuizResults: ${count}`);
        
        if (count > 0) {
            const results = await QuizResult.find().sort({ timestamp: -1 }).limit(1);
            console.log('Sample Results:', JSON.stringify(results, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

checkResults();
