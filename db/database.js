const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'portal.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    is_active INTEGER DEFAULT 1,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '💼',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    company_logo TEXT DEFAULT '',
    location TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Full-Time', 'Part-Time', 'Internship', 'Contract', 'Freelance')),
    work_mode TEXT NOT NULL CHECK(work_mode IN ('Remote', 'On-site', 'Hybrid')),
    category_id INTEGER,
    salary_min INTEGER,
    salary_max INTEGER,
    currency TEXT DEFAULT 'USD',
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    responsibilities TEXT NOT NULL,
    skills TEXT NOT NULL,
    experience_level TEXT DEFAULT 'Entry Level' CHECK(experience_level IN ('Entry Level', 'Mid Level', 'Senior', 'Lead', 'Executive')),
    is_featured INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    deadline DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    user_id INTEGER,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    resume_path TEXT,
    cover_letter TEXT,
    linkedin_url TEXT,
    portfolio_url TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'shortlisted', 'rejected', 'hired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
  CREATE INDEX IF NOT EXISTS idx_jobs_work_mode ON jobs(work_mode);
  CREATE INDEX IF NOT EXISTS idx_jobs_featured ON jobs(is_featured);
  CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
  CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
`);

// ── Auto-seed jobs on first boot ──
const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get();
if (jobCount.count === 0) {
  console.log('📦 No jobs found — seeding 25 jobs...');
  try {
    const logo = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    const cats = [
      { name: 'Software Engineering', icon: '💻' },
      { name: 'Data Science', icon: '📊' },
      { name: 'Product Design', icon: '🎨' },
      { name: 'Product Management', icon: '📋' },
      { name: 'Marketing', icon: '📣' },
      { name: 'Sales', icon: '💰' },
      { name: 'DevOps & Cloud', icon: '☁️' },
      { name: 'Mobile Development', icon: '📱' },
      { name: 'AI & Machine Learning', icon: '🤖' },
      { name: 'Cybersecurity', icon: '🔒' },
      { name: 'Finance & Accounting', icon: '📈' },
      { name: 'Human Resources', icon: '🤝' },
    ];
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)');
    db.transaction(() => cats.forEach(c => insertCat.run(c.name, c.icon)))();

    const jobs = [
      { title: 'Senior Frontend Engineer', company: 'Google', logo: logo('google.com'), location: 'Mountain View, CA', type: 'Full-Time', mode: 'Hybrid', cat: 'Software Engineering', smin: 180000, smax: 260000, cur: 'USD', desc: 'Join Google\'s frontend team to build next-generation web experiences used by billions.', req: 'Bachelor\'s in CS;5+ years frontend;Expert in React, TypeScript', resp: 'Lead frontend architecture;Mentor junior engineers;Ship user-facing features', skills: 'React,TypeScript,JavaScript,HTML,CSS,GraphQL', level: 'Senior', featured: 1, deadline: '2026-06-30' },
      { title: 'Machine Learning Intern', company: 'OpenAI', logo: logo('openai.com'), location: 'San Francisco, CA', type: 'Internship', mode: 'On-site', cat: 'AI & Machine Learning', smin: 8000, smax: 12000, cur: 'USD', desc: 'Work on cutting-edge AI research at OpenAI with large language models.', req: 'MS/PhD in CS;Strong Python;Experience with PyTorch', resp: 'Conduct ML experiments;Write reports;Collaborate with scientists', skills: 'Python,PyTorch,TensorFlow,Machine Learning,NLP', level: 'Entry Level', featured: 1, deadline: '2026-05-15' },
      { title: 'Full Stack Developer', company: 'Stripe', logo: logo('stripe.com'), location: 'Seattle, WA', type: 'Full-Time', mode: 'Remote', cat: 'Software Engineering', smin: 160000, smax: 220000, cur: 'USD', desc: 'Build the economic infrastructure of the internet at Stripe.', req: 'Bachelor\'s in CS;3+ years full stack;Ruby or Python', resp: 'Design APIs;Build tools;Improve reliability', skills: 'Ruby,Python,JavaScript,React,PostgreSQL,Redis,AWS', level: 'Mid Level', featured: 1, deadline: '2026-07-01' },
      { title: 'Product Design Intern', company: 'Figma', logo: logo('figma.com'), location: 'San Francisco, CA', type: 'Internship', mode: 'Hybrid', cat: 'Product Design', smin: 6000, smax: 9000, cur: 'USD', desc: 'Design the tools that designers use every day at Figma.', req: 'Degree in Design;Portfolio;Figma proficiency', resp: 'Create mockups;Conduct user research;Build prototypes', skills: 'Figma,UI Design,UX Research,Prototyping,Design Systems', level: 'Entry Level', featured: 1, deadline: '2026-05-30' },
      { title: 'Backend Engineer', company: 'Spotify', logo: logo('spotify.com'), location: 'Stockholm, Sweden', type: 'Full-Time', mode: 'Hybrid', cat: 'Software Engineering', smin: 90000, smax: 140000, cur: 'EUR', desc: 'Build systems powering music for 600M+ users at Spotify.', req: 'Bachelor\'s in CS;4+ years backend;Java or Scala', resp: 'Design microservices;Build pipelines;Optimize performance', skills: 'Java,Scala,Kafka,Kubernetes,GCP,Microservices', level: 'Mid Level', featured: 0, deadline: '2026-06-15' },
      { title: 'Data Science Intern', company: 'Netflix', logo: logo('netflix.com'), location: 'Los Gatos, CA', type: 'Internship', mode: 'On-site', cat: 'Data Science', smin: 7500, smax: 10000, cur: 'USD', desc: 'Work on recommendation algorithms for 250M+ subscribers.', req: 'MS/PhD Statistics or CS;Python/R;Statistical modeling', resp: 'Analyze data;Build models;Design experiments', skills: 'Python,R,SQL,Statistics,Machine Learning,A/B Testing', level: 'Entry Level', featured: 1, deadline: '2026-05-20' },
      { title: 'DevOps Engineer', company: 'Amazon', logo: logo('amazon.com'), location: 'Arlington, VA', type: 'Full-Time', mode: 'On-site', cat: 'DevOps & Cloud', smin: 150000, smax: 210000, cur: 'USD', desc: 'Build cloud infrastructure at scale for AWS.', req: 'Bachelor\'s in CS;5+ years DevOps;Expert in AWS', resp: 'Design CI/CD;Manage cloud infra;Automate deployments', skills: 'AWS,Terraform,Docker,Kubernetes,Python,Bash', level: 'Senior', featured: 0, deadline: '2026-07-15' },
      { title: 'iOS Developer', company: 'Apple', logo: logo('apple.com'), location: 'Cupertino, CA', type: 'Full-Time', mode: 'On-site', cat: 'Mobile Development', smin: 175000, smax: 250000, cur: 'USD', desc: 'Build apps used by over a billion people on iOS.', req: 'Bachelor\'s in CS;4+ years iOS;Swift and SwiftUI', resp: 'Build iOS features;Optimize performance;Write tests', skills: 'Swift,SwiftUI,UIKit,Xcode,Core Data,Combine', level: 'Mid Level', featured: 0, deadline: '2026-06-30' },
      { title: 'Product Manager', company: 'Meta', logo: logo('meta.com'), location: 'Menlo Park, CA', type: 'Full-Time', mode: 'Hybrid', cat: 'Product Management', smin: 190000, smax: 280000, cur: 'USD', desc: 'Define the future of social connection at Meta.', req: 'MBA or BS in CS;5+ years PM;Consumer products', resp: 'Define roadmap;Analyze metrics;Collaborate with engineering', skills: 'Product Strategy,Data Analysis,User Research,Agile,SQL', level: 'Senior', featured: 1, deadline: '2026-06-15' },
      { title: 'Cybersecurity Analyst', company: 'CrowdStrike', logo: logo('crowdstrike.com'), location: 'Austin, TX', type: 'Full-Time', mode: 'Remote', cat: 'Cybersecurity', smin: 120000, smax: 170000, cur: 'USD', desc: 'Protect organizations from sophisticated cyber threats.', req: 'Bachelor\'s in Cybersecurity;3+ years security;CISSP cert', resp: 'Monitor alerts;Investigate incidents;Develop detection rules', skills: 'SIEM,Threat Intelligence,Incident Response,Python', level: 'Mid Level', featured: 0, deadline: '2026-07-01' },
      { title: 'Marketing Intern', company: 'HubSpot', logo: logo('hubspot.com'), location: 'Boston, MA', type: 'Internship', mode: 'Hybrid', cat: 'Marketing', smin: 4000, smax: 5500, cur: 'USD', desc: 'Learn growth marketing from the leaders in inbound.', req: 'Degree in Marketing;Strong writing;Social media knowledge', resp: 'Create content;Analyze metrics;Email marketing', skills: 'Content Marketing,Social Media,SEO,Google Analytics', level: 'Entry Level', featured: 0, deadline: '2026-05-31' },
      { title: 'Android Developer', company: 'Samsung', logo: logo('samsung.com'), location: 'Seoul, South Korea', type: 'Full-Time', mode: 'On-site', cat: 'Mobile Development', smin: 80000, smax: 130000, cur: 'USD', desc: 'Build next-generation mobile experiences for Samsung devices.', req: 'Bachelor\'s in CS;3+ years Android;Kotlin skills', resp: 'Develop Android features;Optimize performance;Build UI', skills: 'Kotlin,Jetpack Compose,Android SDK,Java,Room', level: 'Mid Level', featured: 0, deadline: '2026-06-30' },
      { title: 'Cloud Solutions Architect', company: 'Microsoft', logo: logo('microsoft.com'), location: 'Redmond, WA', type: 'Full-Time', mode: 'Hybrid', cat: 'DevOps & Cloud', smin: 170000, smax: 240000, cur: 'USD', desc: 'Design Azure cloud architectures for enterprise customers.', req: 'Bachelor\'s in CS;7+ years cloud;Azure certifications', resp: 'Design architectures;Lead workshops;Build proof of concepts', skills: 'Azure,Cloud Architecture,Terraform,Docker,Kubernetes,.NET', level: 'Lead', featured: 1, deadline: '2026-07-30' },
      { title: 'UX Researcher', company: 'Airbnb', logo: logo('airbnb.com'), location: 'San Francisco, CA', type: 'Full-Time', mode: 'Remote', cat: 'Product Design', smin: 140000, smax: 190000, cur: 'USD', desc: 'Uncover insights shaping how people travel at Airbnb.', req: 'Master\'s in HCI;4+ years UX research;Mixed methods', resp: 'Conduct user studies;Create research reports;Present findings', skills: 'User Research,Usability Testing,Survey Design,Data Analysis', level: 'Mid Level', featured: 0, deadline: '2026-06-15' },
      { title: 'Financial Analyst Intern', company: 'Goldman Sachs', logo: logo('goldmansachs.com'), location: 'New York, NY', type: 'Internship', mode: 'On-site', cat: 'Finance & Accounting', smin: 7000, smax: 9500, cur: 'USD', desc: 'Begin your finance career at Goldman Sachs.', req: 'Degree in Finance;Strong Excel;Financial modeling', resp: 'Build financial models;Prepare presentations;Market research', skills: 'Financial Modeling,Excel,PowerPoint,Bloomberg,Valuation', level: 'Entry Level', featured: 0, deadline: '2026-05-01' },
      { title: 'HR Business Partner', company: 'Salesforce', logo: logo('salesforce.com'), location: 'San Francisco, CA', type: 'Full-Time', mode: 'Hybrid', cat: 'Human Resources', smin: 130000, smax: 180000, cur: 'USD', desc: 'Shape the employee experience at Salesforce.', req: 'Bachelor\'s in HR;5+ years HRBP;Employment law knowledge', resp: 'Advise managers;Lead org design;Drive performance management', skills: 'HR Strategy,Talent Management,Employee Relations,Coaching', level: 'Senior', featured: 0, deadline: '2026-06-30' },
      { title: 'React Native Developer', company: 'Uber', logo: logo('uber.com'), location: 'San Francisco, CA', type: 'Full-Time', mode: 'Hybrid', cat: 'Mobile Development', smin: 155000, smax: 215000, cur: 'USD', desc: 'Build mobile experiences that move the world at Uber.', req: 'Bachelor\'s in CS;3+ years React Native;TypeScript', resp: 'Build cross-platform features;Optimize performance;Write tests', skills: 'React Native,TypeScript,JavaScript,Redux,Native Modules', level: 'Mid Level', featured: 0, deadline: '2026-07-15' },
      { title: 'Data Engineer', company: 'Snowflake', logo: logo('snowflake.com'), location: 'Bozeman, MT', type: 'Full-Time', mode: 'Remote', cat: 'Data Science', smin: 145000, smax: 200000, cur: 'USD', desc: 'Build the data cloud at Snowflake.', req: 'Bachelor\'s in CS;4+ years data engineering;SQL skills', resp: 'Design pipelines;Optimize queries;Build ETL processes', skills: 'SQL,Python,Spark,Airflow,dbt,Snowflake,Data Modeling', level: 'Mid Level', featured: 0, deadline: '2026-06-30' },
      { title: 'Sales Development Representative', company: 'Notion', logo: logo('notion.so'), location: 'New York, NY', type: 'Full-Time', mode: 'Hybrid', cat: 'Sales', smin: 65000, smax: 90000, cur: 'USD', desc: 'Help teams discover connected workspaces at Notion.', req: 'Bachelor\'s degree;1+ years sales;CRM experience', resp: 'Prospect accounts;Qualify leads;Conduct discovery calls', skills: 'Sales,Salesforce,Cold Outreach,Communication,SaaS', level: 'Entry Level', featured: 0, deadline: '2026-06-15' },
      { title: 'Software Engineering Intern', company: 'Tesla', logo: logo('tesla.com'), location: 'Palo Alto, CA', type: 'Internship', mode: 'On-site', cat: 'Software Engineering', smin: 6500, smax: 9500, cur: 'USD', desc: 'Work on software powering electric vehicles at Tesla.', req: 'BS/MS in CS or EE;Strong C++ or Python;Passion for sustainability', resp: 'Develop embedded software;Write tests;Debug systems', skills: 'C++,Python,Embedded Systems,Linux,Git,Testing', level: 'Entry Level', featured: 1, deadline: '2026-05-15' },
      { title: 'AI Research Scientist', company: 'DeepMind', logo: logo('deepmind.com'), location: 'London, UK', type: 'Full-Time', mode: 'Hybrid', cat: 'AI & Machine Learning', smin: 130000, smax: 200000, cur: 'GBP', desc: 'Push the boundaries of AI at DeepMind.', req: 'PhD in CS or Math;Published papers;Deep ML knowledge', resp: 'Conduct research;Publish;Develop architectures', skills: 'PyTorch,JAX,Reinforcement Learning,Transformers,Python', level: 'Senior', featured: 1, deadline: '2026-08-01' },
      { title: 'Growth Marketing Manager', company: 'Shopify', logo: logo('shopify.com'), location: 'Toronto, Canada', type: 'Full-Time', mode: 'Remote', cat: 'Marketing', smin: 100000, smax: 140000, cur: 'CAD', desc: 'Drive merchant growth at Shopify.', req: 'Bachelor\'s in Marketing;4+ years growth marketing;Paid acquisition', resp: 'Plan campaigns;Optimize funnels;Manage budgets', skills: 'Growth Marketing,Google Ads,Facebook Ads,Analytics,SEO', level: 'Mid Level', featured: 0, deadline: '2026-06-30' },
      { title: 'Blockchain Developer', company: 'Coinbase', logo: logo('coinbase.com'), location: 'Remote', type: 'Full-Time', mode: 'Remote', cat: 'Software Engineering', smin: 165000, smax: 230000, cur: 'USD', desc: 'Build the open financial system at Coinbase.', req: 'Bachelor\'s in CS;3+ years blockchain;Solidity experience', resp: 'Develop smart contracts;Build integrations;Audit code', skills: 'Solidity,Ethereum,Web3.js,Go,Rust,Smart Contracts', level: 'Mid Level', featured: 0, deadline: '2026-07-15' },
      { title: 'QA Engineering Intern', company: 'Adobe', logo: logo('adobe.com'), location: 'San Jose, CA', type: 'Internship', mode: 'Hybrid', cat: 'Software Engineering', smin: 5500, smax: 8000, cur: 'USD', desc: 'Ensure quality in creative tools at Adobe.', req: 'BS in CS;Testing knowledge;Basic scripting', resp: 'Write automated tests;Execute plans;Report bugs', skills: 'Selenium,Python,Java,Test Automation,JIRA,Agile', level: 'Entry Level', featured: 0, deadline: '2026-05-30' },
      { title: 'Technical Program Manager', company: 'LinkedIn', logo: logo('linkedin.com'), location: 'Sunnyvale, CA', type: 'Full-Time', mode: 'Hybrid', cat: 'Product Management', smin: 170000, smax: 240000, cur: 'USD', desc: 'Drive technical programs connecting the world\'s professionals.', req: 'Bachelor\'s in CS;6+ years TPM;Technical acumen', resp: 'Lead programs;Manage timelines;Drive technical decisions', skills: 'Program Management,Agile,JIRA,Technical Architecture,Risk Management', level: 'Lead', featured: 0, deadline: '2026-07-01' },
    ];

    const insertJob = db.prepare(`
      INSERT INTO jobs (title, company, company_logo, location, type, work_mode, category_id, salary_min, salary_max, currency, description, requirements, responsibilities, skills, experience_level, is_featured, deadline)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM categories WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      jobs.forEach(j => insertJob.run(j.title, j.company, j.logo, j.location, j.type, j.mode, j.cat, j.smin, j.smax, j.cur, j.desc, j.req, j.resp, j.skills, j.level, j.featured, j.deadline));
    })();
    console.log(`✅ Seeded ${jobs.length} jobs`);
  } catch (err) {
    console.error('⚠️  Job seed error:', err.message);
  }
}

// ── Auto-seed demo users (runs every boot, INSERT OR IGNORE is safe) ──
try {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    console.log('👤 No users found — seeding demo accounts...');
    const bcrypt = require('bcryptjs');
    const demoPasswordHash  = bcrypt.hashSync('Demo@1234', 10);
    const adminPasswordHash = bcrypt.hashSync('Admin@1234', 10);
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (full_name, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    db.transaction(() => {
      insertUser.run('Demo User',  'demo@jobpulse.com',  demoPasswordHash,  'user');
      insertUser.run('Admin User', 'admin@jobpulse.com', adminPasswordHash, 'admin');
    })();
    console.log('✅ Demo users seeded: demo@jobpulse.com / Demo@1234 | admin@jobpulse.com / Admin@1234');
  }
} catch (err) {
  console.error('⚠️  User seed error:', err.message);
}

module.exports = db;
