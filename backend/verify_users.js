
import mongoose from 'mongoose';
import connectDB from './db.js';
import logindata from './models/logindata.js';

const verifyUsers = async () => {
    await connectDB();
    
    console.log("Connected to DB. Checking users...");
    
    const roles = ['admin', 'teacher'];
    for (const role of roles) {
        const user = await logindata.findOne({ role });
        if (user) {
            console.log(`✅ Found ${role}: ${user.userid} (ID: ${user._id})`);
        } else {
            console.error(`❌ ${role} NOT FOUND in DB!`);
        }
    }

    const admin = await logindata.findOne({ userid: 'admin' });
    if(admin) console.log("Admin record:", admin);

    process.exit(0);
};

verifyUsers();
