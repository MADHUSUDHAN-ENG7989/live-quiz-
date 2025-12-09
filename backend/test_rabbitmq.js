import amqp from 'amqplib';

const WSL_IP = '172.25.34.175';

async function testConnection(url) {
    console.log(`Attempting to connect to RabbitMQ at ${url}...`);
    try {
        const connection = await amqp.connect(url);
        console.log(`✅ Successfully connected to RabbitMQ at ${url}!`);
        await connection.close();
        return true;
    } catch (error) {
        console.error(`❌ Failed to connect to RabbitMQ at ${url}`);
        // console.error("Error:", error.message);
        return false;
    }
}

async function run() {
    const localSuccess = await testConnection('amqp://localhost');
    if (localSuccess) process.exit(0);

    const wslSuccess = await testConnection(`amqp://${WSL_IP}`);
    if (wslSuccess) {
        console.log("\n💡 SUGGESTION: Use the WSL IP address instead of localhost.");
        process.exit(0);
    }

    console.error("\n❌ Could not connect to RabbitMQ on localhost or WSL IP.");
    process.exit(1);
}

run();
