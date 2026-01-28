import { createClient } from 'redis';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

let redisClient;
let isRedisConnected = false;

console.log("DEBUG: Initializing Redis Client...");
try {
    const client = createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        socket: {
            connectTimeout: 2000
        }
    });

    client.on('error', (err) => {
        // Only log if we managed to connect at least once or if it's a runtime error
        // If we never connected, the catch block below handles it (mostly)
        if (isRedisConnected) {
            console.log('Redis Client Error', err);
        }
    });

    client.on('connect', () => {
        console.log('✅ Redis Client Connected');
        isRedisConnected = true;
    });

    // Attempt to connect. If this fails, we fall back to mock.
    // Note: createClient().connect() throws if it can't connect.
    console.log("DEBUG: Connecting to Redis...");
    // Force mock by throwing error immediately
    throw new Error("Forcing in-memory Redis for local dev");

    /* 
    await client.connect();
    console.log("DEBUG: Redis connected successfully.");
    redisClient = client;
    */

} catch (err) {
    console.warn('⚠️ Redis not available, using in-memory mock. Error:', err.message);

    // Simple In-Memory Mock
    class MockRedis extends EventEmitter {
        constructor() {
            super();
            this.store = new Map();
            this.isOpen = true;
        }

        async connect() { return; }
        async set(key, value) { this.store.set(key, value); }
        async get(key) { return this.store.get(key) || null; }
        async del(key) { this.store.delete(key); }
        duplicate() { return new MockRedis(); }
        async subscribe(channel, callback) {
            console.log(`[MockRedis] Subscribed to ${channel}`);
            // We can't easily mock pub/sub across processes but for single process it's fine
            // checking if we need to implement publish?
        }
        async publish(channel, message) {
            // Basic mock implementation for same-process pub/sub could go here if needed
            console.log(`[MockRedis] Publish to ${channel}: ${message}`);
        }
    }

    redisClient = new MockRedis();
}

export default redisClient;
