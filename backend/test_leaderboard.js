
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logindata from './models/logindata.js';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = "http://127.0.0.1:3001";

async function testLeaderboard() {
    console.log("🚀 Starting test...");
    // 1. Create/Ensure Teacher User exists
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ DB Connected");

    const teacherId = "test_teacher";
    const password = "password123";
    
    let teacher = await logindata.findOne({ userid: teacherId });
    if (!teacher) {
        const hashedPassword = await bcrypt.hash(password, 10);
        teacher = new logindata({ userid: teacherId, password: hashedPassword, role: "teacher" });
        await teacher.save();
        console.log("✅ Created test teacher");
    }

    // 2. Login to get token
    const loginRes = await fetch(`${API_URL}/check-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: teacherId, pswd: password })
    });
    
    const loginData = await loginRes.json();
    if (!loginData.token) {
        console.error("❌ Login failed:", loginData);
        process.exit(1);
    }
    console.log("✅ Login successful, got token");

    // 3. Fetch Leaderboard
    const lbRes = await fetch(`${API_URL}/api/leaderboard`, {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
    });

    if (!lbRes.ok) {
        console.error(`❌ Leaderboard API Error: ${lbRes.status} ${lbRes.statusText}`);
        const text = await lbRes.text();
        console.error("Response:", text);
    } else {
        const data = await lbRes.json();
        console.log("✅ Leaderboard Data:", JSON.stringify(data, null, 2));
    }

    process.exit(0);
}

testLeaderboard();
