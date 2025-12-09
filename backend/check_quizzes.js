const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const quizSchema = new mongoose.Schema({
    title: String,
    status: String, // 'active', 'ended', 'scheduled'
    scheduledStartTime: Date,
    scheduledEndTime: Date,
    createdAt: Date
});

const Quiz = mongoose.model('Quiz', quizSchema);

async function checkQuizzes() {
    try {
        await mongoose.connect('mongodb://localhost:27017/quizapp', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        const quizzes = await Quiz.find({});
        console.log(`Found ${quizzes.length} quizzes:`);
        
        quizzes.forEach(q => {
            console.log(`- ID: ${q._id}`);
            console.log(`  Title: ${q.title}`);
            console.log(`  Status: ${q.status}`);
            console.log(`  Start: ${q.scheduledStartTime}`);
            console.log(`  End: ${q.scheduledEndTime}`);
            console.log('---');
        });

        mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkQuizzes();
