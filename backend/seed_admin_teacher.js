
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import logindata from './models/logindata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/quizapp";
        await mongoose.connect(mongoURI);
        console.log("✅ Custom Seeder Connected to MongoDB");
    } catch (err) {
        console.error("❌ DB Connection Error:", err.message);
        process.exit(1);
    }
};

const seedAdminTeacher = async () => {
    await connectDB();

    const users = [
        { userid: "teacher", password: "teacher", role: "teacher", name: "Teacher User" },
        { userid: "admin", password: "admin", role: "admin", name: "Admin User" }
    ];

    for (const u of users) {
        try {
            const exists = await logindata.findOne({ userid: u.userid });
            if (exists) {
                console.log(`ℹ️ User ${u.userid} already exists.`);
                // Optional: Update password if needed, but skipping for now to preserve existing if any
            } else {
                const hashedPassword = await bcrypt.hash(u.password, 10);
                const newUser = new logindata({
                    userid: u.userid,
                    password: hashedPassword,
                    role: u.role,
                    name: u.name
                });
                await newUser.save();
                console.log(`✅ Created user: ${u.userid}`);
            }
        } catch (err) {
            console.error(`❌ Error creating ${u.userid}:`, err.message);
        }
    }

    console.log("Done.");
    process.exit(0);
};

seedAdminTeacher();
