import redisClient from './redisClient.js';

async function checkRedis() {
    try {
        await redisClient.connect();
        const quizJson = await redisClient.get("quiz:active");
        if (quizJson) {
            console.log("✅ Found active quiz in Redis:");
            console.log(JSON.parse(quizJson));
        } else {
            console.log("❌ No active quiz found in Redis (key: quiz:active is empty)");
        }
        await redisClient.disconnect();
    } catch (err) {
        console.error("Redis Error:", err);
    }
}

checkRedis();
