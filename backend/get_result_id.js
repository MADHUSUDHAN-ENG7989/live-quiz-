import mongoose from 'mongoose';
import QuizResult from './models/quizResult.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function getResultId() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const result = await QuizResult.findOne().sort({ timestamp: -1 });
        if (result) {
            console.log(`RESULT_ID:${result._id}`);
        } else {
            console.log("NO_RESULTS_FOUND");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

getResultId();
