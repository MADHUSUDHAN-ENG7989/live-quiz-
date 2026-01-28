import { createClient } from 'redis';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

let redisClient;
let isRedisConnected = false;

console.log("DEBUG: Initializing Redis Client...");

// Check if we should use real Redis (production) or mock (local dev without Redis)
const useRealRedis = process.env.REDIS_URL && !process.env.FORCE_MOCK_REDIS;

if (useRealRedis) {
    try {
        const client = createClient({
            url: process.env.REDIS_URL,
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        console.warn('⚠️ Redis reconnection failed, using mock');
                        return new Error('Max retries reached');
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        });

        client.on('error', (err) => {
            if (isRedisConnected) {
                console.log('Redis Client Error', err);
            }
        });

        client.on('connect', () => {
            console.log('✅ Redis Client Connected');
            isRedisConnected = true;
        });

        console.log("DEBUG: Connecting to Redis...");
        await client.connect();
        console.log("DEBUG: Redis connected successfully.");
        redisClient = client;

    } catch (err) {
        console.warn('⚠️ Redis connection failed, falling back to in-memory mock. Error:', err.message);
        redisClient = createMockRedis();
    }
} else {
    console.log('ℹ️ Using in-memory Redis mock (no REDIS_URL or FORCE_MOCK_REDIS set)');
    redisClient = createMockRedis();
}

// Mock Redis factory function
function createMockRedis() {
    class MockRedis extends EventEmitter {
        constructor() {
            super();
            this.store = new Map();
            this.hashStore = new Map(); // For hash operations
            this.isOpen = true;
        }

        async connect() { return; }
        async set(key, value) { this.store.set(key, value); }
        async get(key) { return this.store.get(key) || null; }
        async del(key) {
            this.store.delete(key);
            this.hashStore.delete(key);
        }

        // Hash operations
        async hSet(key, field, value) {
            if (!this.hashStore.has(key)) {
                this.hashStore.set(key, new Map());
            }
            this.hashStore.get(key).set(field, value);
        }
        async hGet(key, field) {
            const hash = this.hashStore.get(key);
            return hash ? hash.get(field) || null : null;
        }
        async hGetAll(key) {
            const hash = this.hashStore.get(key);
            if (!hash) return {};
            const result = {};
            hash.forEach((value, field) => { result[field] = value; });
            return result;
        }
        async hLen(key) {
            const hash = this.hashStore.get(key);
            return hash ? hash.size : 0;
        }
        async hDel(key, field) {
            const hash = this.hashStore.get(key);
            if (hash) hash.delete(field);
        }

        duplicate() {
            const dup = new MockRedis();
            dup.store = this.store;
            dup.hashStore = this.hashStore;
            return dup;
        }
        async subscribe(channel, callback) {
            console.log(`[MockRedis] Subscribed to ${channel}`);
        }
        async publish(channel, message) {
            console.log(`[MockRedis] Publish to ${channel}: ${message}`);
        }
    }

    return new MockRedis();
}

export default redisClient;
