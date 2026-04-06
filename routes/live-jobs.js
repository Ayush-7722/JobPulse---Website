const express = require('express');
const router = express.Router();
const https = require('https');

// ── In-memory cache to avoid hammering external APIs ──
let cache = {
  remotive: { data: null, timestamp: 0 },
  linkedin: { data: null, timestamp: 0 },
};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Helper: Make HTTPS request and return parsed JSON
function fetchJSON(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('Failed to parse API response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

// ── Fetch from Remotive API (FREE, no key needed) ──
async function fetchRemotiveJobs(query = '', category = '', limit = 50) {
  const now = Date.now();

  // Build cache key based on params
  const cacheKey = `remotive_${query}_${category}`;
  if (cache.remotive.key === cacheKey && cache.remotive.data && (now - cache.remotive.timestamp < CACHE_TTL)) {
    return cache.remotive.data;
  }

  const params = new URLSearchParams();
  if (query) params.set('search', query);
  if (category) params.set('category', category);
  params.set('limit', limit);

  const options = {
    method: 'GET',
    hostname: 'remotive.com',
    port: 443,
    path: `/api/remote-jobs?${params.toString()}`,
    headers: { 'Accept': 'application/json' },
  };

  const data = await fetchJSON(options);

  if (data.jobs && Array.isArray(data.jobs)) {
    // Normalize to our format
    const normalized = data.jobs.map((job) => {
      // Remotive's job-specific logo URLs (remotive.com/job/XXXXX/logo) are
      // Cloudflare-protected and return 404 for all requests. Skip them entirely
      // so the frontend shows the clean letter-avatar fallback instead.
      const logoUrl = job.company_logo_url || job.company_logo || '';
      const isRomotiveLogo = logoUrl.includes('remotive.com/job/');
      return {
        id: `remotive_${job.id}`,
        title: job.title,
        company: job.company_name,
        company_logo: isRomotiveLogo ? '' : logoUrl,  // skip broken logos
        location: job.candidate_required_location || 'Remote',
        type: normalizeJobType(job.job_type),
        work_mode: 'Remote',
        category: job.category || 'General',
        salary: job.salary || 'Competitive',
        description: stripHtml(job.description || ''),
        tags: job.tags || [],
        published: job.publication_date,
        apply_url: job.url,
        source: 'remotive',
        source_label: 'Remotive',
      };
    });

    cache.remotive = { data: normalized, timestamp: now, key: cacheKey };
    return normalized;
  }

  return [];
}

// ── Fetch from LinkedIn Jobs API (RapidAPI — requires subscription) ──
async function fetchLinkedInJobs() {
  const now = Date.now();
  if (cache.linkedin.data && (now - cache.linkedin.timestamp < CACHE_TTL)) {
    return cache.linkedin.data;
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_LINKEDIN_HOST;

  if (!apiKey || !apiHost) {
    return [];
  }

  try {
    const options = {
      method: 'GET',
      hostname: apiHost,
      port: 443,
      path: '/active-jb-1h',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost,
        'Content-Type': 'application/json',
      },
    };

    const data = await fetchJSON(options);

    // If it returns a message (e.g. "not subscribed"), return empty
    if (data.message) {
      console.log('LinkedIn API:', data.message);
      return [];
    }

    // Normalize LinkedIn response
    let jobs = [];
    if (Array.isArray(data)) {
      jobs = data.map((job, index) => ({
        id: `linkedin_${job.id || index}`,
        title: job.title || job.job_title || 'Untitled',
        company: job.company || job.company_name || 'Unknown',
        company_logo: job.company_logo || job.logo || '',
        location: job.location || 'Not specified',
        type: normalizeJobType(job.type || job.employment_type || 'Full-Time'),
        work_mode: detectWorkMode(job.location || ''),
        category: job.category || 'General',
        salary: job.salary || 'Competitive',
        description: stripHtml(job.description || ''),
        tags: extractTags(job.description || ''),
        published: job.date || job.posted_at || new Date().toISOString(),
        apply_url: job.url || job.apply_url || job.link || '#',
        source: 'linkedin',
        source_label: 'LinkedIn',
      }));
    }

    cache.linkedin = { data: jobs, timestamp: now };
    return jobs;
  } catch (err) {
    console.error('LinkedIn API error:', err.message);
    return [];
  }
}

// ── Helper Functions ──
function normalizeJobType(type) {
  if (!type) return 'Full-Time';
  const t = type.toLowerCase().replace(/[_-]/g, ' ');
  if (t.includes('intern')) return 'Internship';
  if (t.includes('full')) return 'Full-Time';
  if (t.includes('part')) return 'Part-Time';
  if (t.includes('contract')) return 'Contract';
  if (t.includes('freelance')) return 'Freelance';
  return 'Full-Time';
}

function detectWorkMode(location) {
  const loc = location.toLowerCase();
  if (loc.includes('remote')) return 'Remote';
  if (loc.includes('hybrid')) return 'Hybrid';
  return 'On-site';
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);
}

function extractTags(text) {
  const common = ['JavaScript', 'Python', 'React', 'Node.js', 'AWS', 'Docker', 'SQL', 'Java', 'TypeScript',
    'Kubernetes', 'Go', 'Rust', 'Ruby', 'PHP', 'Angular', 'Vue', 'Swift', 'Kotlin', 'Flutter', 'DevOps',
    'Machine Learning', 'AI', 'Data Science', 'GraphQL', 'MongoDB', 'PostgreSQL', 'Redis', 'Figma',
    'UI/UX', 'HTML', 'CSS', 'C++', 'C#', '.NET', 'Terraform', 'Git', 'Linux', 'Agile'];
  const textLower = text.toLowerCase();
  return common.filter(tag => textLower.includes(tag.toLowerCase())).slice(0, 6);
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ══════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════

// GET /api/live-jobs — Fetch external jobs (combined sources)
router.get('/', async (req, res) => {
  try {
    const { search, category, type, source, page = 1, limit = 20 } = req.query;

    // Fetch from all sources in parallel
    const [remotiveJobs, linkedinJobs] = await Promise.all([
      fetchRemotiveJobs(search || '', category || ''),
      fetchLinkedInJobs(),
    ]);

    // Combine all sources
    let allJobs = [...remotiveJobs, ...linkedinJobs];

    // Apply filters
    if (search) {
      const q = search.toLowerCase();
      allJobs = allJobs.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    if (type) {
      allJobs = allJobs.filter(j => j.type === type);
    }

    if (source) {
      allJobs = allJobs.filter(j => j.source === source);
    }

    if (category) {
      const cat = category.toLowerCase();
      allJobs = allJobs.filter(j => j.category.toLowerCase().includes(cat));
    }

    // Sort by most recent
    allJobs.sort((a, b) => new Date(b.published) - new Date(a.published));

    // Paginate
    const total = allJobs.length;
    const startIdx = (parseInt(page) - 1) * parseInt(limit);
    const paginatedJobs = allJobs.slice(startIdx, startIdx + parseInt(limit));

    // Add relative time
    const jobsWithTime = paginatedJobs.map(j => ({
      ...j,
      time_ago: timeSince(j.published),
    }));

    res.json({
      jobs: jobsWithTime,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / parseInt(limit)),
      },
      sources: {
        remotive: remotiveJobs.length,
        linkedin: linkedinJobs.length,
      },
    });
  } catch (err) {
    console.error('Live jobs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch live jobs. Please try again later.' });
  }
});

// GET /api/live-jobs/categories — Available categories from Remotive
router.get('/categories', async (req, res) => {
  try {
    const categories = [
      { name: 'Software Development', slug: 'software-dev', icon: '💻' },
      { name: 'Design', slug: 'design', icon: '🎨' },
      { name: 'Marketing', slug: 'marketing', icon: '📈' },
      { name: 'Sales', slug: 'sales', icon: '💰' },
      { name: 'Customer Support', slug: 'customer-support', icon: '🎧' },
      { name: 'Data', slug: 'data', icon: '📊' },
      { name: 'DevOps / Sysadmin', slug: 'devops-sysadmin', icon: '⚙️' },
      { name: 'Product', slug: 'product', icon: '📦' },
      { name: 'Finance / Legal', slug: 'finance-legal', icon: '⚖️' },
      { name: 'Human Resources', slug: 'hr', icon: '👥' },
      { name: 'QA', slug: 'qa', icon: '🔍' },
      { name: 'Writing', slug: 'writing', icon: '✍️' },
    ];
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
