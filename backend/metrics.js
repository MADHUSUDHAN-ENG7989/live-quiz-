import promClient from 'prom-client';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ 
  register,
  prefix: 'quiz_app_'
});

// Custom Metrics for Quiz Application

// HTTP Request metrics
const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// WebSocket metrics
const wsConnectionsGauge = new promClient.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  labelNames: ['type'], // teacher, student, monitor
  registers: [register]
});

const wsEventsCounter = new promClient.Counter({
  name: 'websocket_events_total',
  help: 'Total number of WebSocket events',
  labelNames: ['event_type'],
  registers: [register]
});

// Quiz-specific metrics
const activeQuizzesGauge = new promClient.Gauge({
  name: 'active_quizzes',
  help: 'Number of currently active quizzes',
  registers: [register]
});

const quizSubmissionsCounter = new promClient.Counter({
  name: 'quiz_submissions_total',
  help: 'Total number of quiz submissions',
  labelNames: ['quiz_id', 'status'], // status: completed, failed
  registers: [register]
});

const quizCreationCounter = new promClient.Counter({
  name: 'quiz_creations_total',
  help: 'Total number of quizzes created',
  labelNames: ['status'], // scheduled, active
  registers: [register]
});

const studentAnswersCounter = new promClient.Counter({
  name: 'student_answers_total',
  help: 'Total number of answers processed',
  labelNames: ['status'], // submitted, validated
  registers: [register]
});

// Authentication metrics
const authAttemptsCounter = new promClient.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['result', 'role'], // result: success, failed
  registers: [register]
});

const registrationCounter = new promClient.Counter({
  name: 'registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['role'], // student, teacher
  registers: [register]
});

// Database metrics
const dbQueryCounter = new promClient.Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'collection'],
  registers: [register]
});

const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

// RabbitMQ metrics
const rabbitMQMessagesCounter = new promClient.Counter({
  name: 'rabbitmq_messages_total',
  help: 'Total number of RabbitMQ messages',
  labelNames: ['queue', 'action'], // action: sent, received
  registers: [register]
});

const rabbitMQQueueSizeGauge = new promClient.Gauge({
  name: 'rabbitmq_queue_size',
  help: 'Current size of RabbitMQ queues',
  labelNames: ['queue'],
  registers: [register]
});

// Redis metrics
const redisCacheHitsCounter = new promClient.Counter({
  name: 'redis_cache_hits_total',
  help: 'Total number of Redis cache hits',
  registers: [register]
});

const redisCacheMissesCounter = new promClient.Counter({
  name: 'redis_cache_misses_total',
  help: 'Total number of Redis cache misses',
  registers: [register]
});

const redisOperationDuration = new promClient.Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Duration of Redis operations in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register]
});

// Error metrics
const errorCounter = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'route'],
  registers: [register]
});

// AI Generation metrics
const aiGenerationCounter = new promClient.Counter({
  name: 'ai_generations_total',
  help: 'Total number of AI quiz generations',
  labelNames: ['type', 'status'], // type: topic, document; status: success, failed
  registers: [register]
});

const aiGenerationDuration = new promClient.Histogram({
  name: 'ai_generation_duration_seconds',
  help: 'Duration of AI generations in seconds',
  labelNames: ['type'],
  buckets: [1, 3, 5, 10, 20, 30],
  registers: [register]
});

export {
  register,
  httpRequestCounter,
  httpRequestDuration,
  wsConnectionsGauge,
  wsEventsCounter,
  activeQuizzesGauge,
  quizSubmissionsCounter,
  quizCreationCounter,
  studentAnswersCounter,
  authAttemptsCounter,
  registrationCounter,
  dbQueryCounter,
  dbQueryDuration,
  rabbitMQMessagesCounter,
  rabbitMQQueueSizeGauge,
  redisCacheHitsCounter,
  redisCacheMissesCounter,
  redisOperationDuration,
  errorCounter,
  aiGenerationCounter,
  aiGenerationDuration
};