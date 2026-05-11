require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');
const compression = require('compression');
const RedisStore = require('rate-limit-redis').default;
const { redisClient, isRedisConnected } = require('./services/cache');
const { sanitizeBody } = require('./middleware/auth');
// ── Initialize SQLite database (auto-seeds on first boot) ──
require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Required for rate limiting to work correctly on platforms like Railway)
app.set('trust proxy', 1);

// ══════════════════════════════════════
//  Security Middleware
// ══════════════════════════════════════

// Helmet — HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false,      // We handle SPA inline scripts
  crossOriginEmbedderPolicy: false,  // Needed for external images
}));

// Explicit Permissions-Policy — removes the xr-spatial-tracking violation
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), xr-spatial-tracking=()'
  );
  next();
});

// CORS
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGIN || '*'
    : DEV_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));


// Rate Limiting (Using Redis if available for scalable distributed limits)
const getRateLimitStore = () => {
  if (redisClient && isRedisConnected()) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }
  return undefined; // fallback to memory
};

const generalLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: 15 * 60 * 1000,
  max: 20, // Increased from 10 to 20 to be more lenient
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

// Compression — GZIP all responses
app.use(compression());

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Sanitize all request bodies (strip HTML / prevent XSS)
app.use(sanitizeBody);

// ══════════════════════════════════════
//  Static Files
// ══════════════════════════════════════

app.use(express.static(path.join(__dirname, 'frontend')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ══════════════════════════════════════
//  Logo Proxy  (fixes 403 on Cloudflare-protected logos)
//  Browser requests to remotive.com logos get blocked by Cloudflare.
//  We proxy them server-side using a proper User-Agent.
// ══════════════════════════════════════

const ALLOWED_LOGO_HOSTS = [
  'remotive.com',
  'remoteok.com',
  'lever.co',
  'greenhouse.io',
  'workable.com',
  'ashbyhq.com',
  'cdn.workable.com',
  'logo.clearbit.com',
];

app.get('/api/logo-proxy', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let parsedUrl;
  try { parsedUrl = new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  const allowed = ALLOWED_LOGO_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  if (!allowed) return res.status(403).json({ error: 'Domain not allowed' });

  const lib = parsedUrl.protocol === 'https:' ? https : http;
  const reqOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JobPulseBot/1.0; +https://jobpulse.app)',
      'Accept': 'image/*,*/*;q=0.8',
      'Referer': 'https://remotive.com',
    },
    timeout: 8000,
  };

  const proxyReq = lib.request(reqOptions, (proxyRes) => {
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers['location'];
      if (loc) return res.redirect(`/api/logo-proxy?url=${encodeURIComponent(loc)}`);
    }
    if (proxyRes.statusCode !== 200) return res.status(404).end();

    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');  // Fix NotSameOrigin block
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => res.status(502).end());
  proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).end(); });
  proxyReq.end();
});

// ══════════════════════════════════════
//  API Routes
// ══════════════════════════════════════

const authRouter = require('./routes/auth');
const jobsRouter = require('./routes/jobs');
const applicationsRouter = require('./routes/applications');
const categoriesRouter = require('./routes/categories');
const liveJobsRouter = require('./routes/live-jobs');

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/live-jobs', liveJobsRouter);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 JobPulse running at http://localhost:${PORT}`);
  console.log(`🔒 Security: Helmet + Rate Limiting + Input Sanitization`);
  console.log(`🔑 Auth: JWT + bcrypt`);
  console.log(`🖼️  Logo proxy active at /api/logo-proxy\n`);
});
