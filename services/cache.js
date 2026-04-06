const { createClient } = require('redis');

let redisClient = null;
let isRedisConnected = false;

// Initialize Redis if URL is provided
if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 2000)
    }
  });

  redisClient.on('error', (err) => {
    console.error('❌ Redis Client Error:', err.message);
    isRedisConnected = false;
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully.');
    isRedisConnected = true;
  });

  redisClient.connect().catch(console.error);
} else {
  console.log('⚠️ REDIS_URL not set. Running without clustered cache (Memory mode fallback).');
}

/**
 * Express Middleware to cache responses using Redis.
 * Falls back to normal response if Redis is down or not configured.
 * @param {number} duration Expiry time in seconds
 */
function cacheMiddleware(duration) {
  return async (req, res, next) => {
    // Skip cache if Redis isn't ready
    if (!redisClient || !isRedisConnected || req.method !== 'GET') {
      return next();
    }

    const key = '__express__' + req.originalUrl || req.url;
    try {
      const cachedBody = await redisClient.get(key);
      if (cachedBody) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cachedBody);
      } else {
        res.setHeader('X-Cache', 'MISS');
        // Intercept res.send to cache the response
        res.sendResponse = res.send;
        res.send = (body) => {
          // Fire and forget caching
          redisClient.setEx(key, duration, body).catch(console.error);
          res.sendResponse(body);
        };
        next();
      }
    } catch (err) {
      console.error('Cache middleware error:', err);
      next(); // gracefully fail and proceed to route
    }
  };
}

module.exports = {
  redisClient,
  isRedisConnected: () => isRedisConnected,
  cacheMiddleware,
};
