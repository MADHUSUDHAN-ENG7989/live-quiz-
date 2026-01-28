import bcrypt from 'bcrypt';
import logindata from './models/logindata.js';

const SALT_ROUNDS = 10;

const seedLocalData = async () => {
    try {
        const count = await logindata.countDocuments();
        if (count > 0) {
            console.log("ℹ️ Database already has users. Skipping seed.");
            return;
        }

        console.log("🌱 Database is empty. Seeding default users...");

        const adminPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
        const admin = new logindata({
            userid: "admin",
            password: adminPassword,
            role: "admin",
            name: "Admin User"
        });
        await admin.save();

        const studentPassword = await bcrypt.hash("student123", SALT_ROUNDS);
        const student = new logindata({
            userid: "student",
            password: studentPassword,
            role: "student",
            section: "A",
            name: "Test Student"
        });
        await student.save();

        console.log("✅ Seeded users: admin (admin123), student (student123)");

    } catch (err) {
        console.error("❌ Error seeding local data:", err);
    }
};

export default seedLocalData;
