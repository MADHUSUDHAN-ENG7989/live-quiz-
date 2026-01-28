import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const start = async () => {
    console.log("Starting MongoMemoryServer...");
    try {
        const mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        console.log(`MongoMemoryServer started at: ${uri}`);

        console.log("Connecting mongoose...");
        await mongoose.connect(uri);
        console.log("Mongoose connected!");

        await mongoose.disconnect();
        await mongod.stop();
        console.log("Done.");
    } catch (err) {
        console.error("Error:", err);
    }
};

start();
