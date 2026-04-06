# 🚀 JobPulse — Job & Internship Portal

<div align="center">

![JobPulse Banner](https://img.shields.io/badge/JobPulse-Job%20%26%20Internship%20Portal-6366f1?style=for-the-badge&logo=rocket&logoColor=white)

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-Railway-6366f1?style=for-the-badge)](https://jobpulse-website-production.up.railway.app)
[![GitHub](https://img.shields.io/badge/GitHub-Ayush--7722-181717?style=for-the-badge&logo=github)](https://github.com/Ayush-7722/JobPulse---Website)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**A full-stack job and internship aggregation platform with real-time listings, secure authentication, and a beautiful modern UI.**

[🌐 Live Site](https://jobpulse-website-production.up.railway.app) • [📦 GitHub](https://github.com/Ayush-7722/JobPulse---Website) • [🚀 Deploy Your Own](#deployment)

</div>

---

## ✨ Features

### 🔍 Job Discovery
- **25+ curated job listings** across 12 categories (Software Engineering, AI/ML, DevOps, Design, etc.)
- **Real-time live jobs** powered by the [Remotive API](https://remotive.com/api) — hundreds of fresh remote jobs
- **Advanced filtering** — by type (Full-Time / Internship / Remote), category, experience level, salary
- **Full-text search** across job title, company, and skills
- **Job detail modals** with full descriptions, requirements, and responsibilities

### 🔐 Authentication & Security
- JWT-based authentication with 7-day token expiry
- bcrypt password hashing (10 salt rounds)
- Password strength validation (uppercase, lowercase, number, special char)
- Account lockout after 5 failed login attempts
- Protected routes with `Authorization: Bearer` header
- Helmet.js security headers + CORS + rate limiting

### 👥 Users
- **19 pre-seeded real-world user accounts** (Indian, American, European, Asian)
- **2 admin accounts** with elevated privileges
- **Demo account** — `demo@jobpulse.com` / `Demo@1234` (one-click auto-login)
- User profile management
- Application history tracking

### 🎨 UI/UX
- Responsive design (mobile-first)
- Dark/Light mode toggle
- Smooth animations and micro-interactions
- Company logos via Google Favicon CDN
- Loading skeletons and empty states
- Toast notifications + inline error feedback

### 📋 Applications
- Apply to any job with a resume upload (PDF/DOC)
- Cover letter and LinkedIn/portfolio URL fields
- Application status tracking (Pending → Reviewed → Shortlisted → Hired)

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS (ES6+), HTML5, CSS3 |
| **Backend** | Node.js + Express.js |
| **Database** | SQLite (better-sqlite3) |
| **Auth** | JWT (jsonwebtoken) + bcryptjs |
| **Security** | Helmet, express-rate-limit, cors |
| **File Upload** | Multer |
| **Live Jobs API** | Remotive API |
| **Deployment** | Railway |
| **Version Control** | GitHub |

---

## 📁 Project Structure

```
job-portal/
├── server.js               # Express app entry point
├── railway.json            # Railway deployment config
├── package.json
│
├── db/
│   ├── database.js         # SQLite setup, schema, auto-seeding
│   └── seed.js             # Job seed data (25 jobs, 12 categories)
│
├── routes/
│   ├── auth.js             # Register, Login, Profile
│   ├── jobs.js             # Browse, search, filter jobs
│   ├── live-jobs.js        # Remotive API proxy
│   ├── applications.js     # Apply, track applications
│   └── categories.js       # Job categories
│
├── middleware/
│   └── auth.js             # JWT verification + sanitization
│
└── frontend/
    ├── index.html          # Single-page application
    ├── app.js              # All frontend logic (~1200 lines)
    └── index.css           # Styling (~2200 lines)
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- npm v9+

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/Ayush-7722/JobPulse---Website.git
cd JobPulse---Website

# 2. Install dependencies
npm install

# 3. Start the server
npm start
# → Server running at http://localhost:3000
```

> The database is **auto-created and seeded** on first run — no setup needed!

### Environment Variables (Optional)

Create a `.env` file for custom configuration:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10
RAPIDAPI_KEY=your_rapidapi_key_here
```

---

## 👤 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| 🧪 Demo User | `demo@jobpulse.com` | `Demo@1234` |
| 👑 Admin | `ayush@jobpulse.com` | `Admin@JobPulse1` |
| 👑 Admin | `admin@jobpulse.com` | `Admin@JobPulse1` |
| 👤 User | `arjun.mehta@gmail.com` | `JobPulse@1` |
| 👤 User | `james.carter@gmail.com` | `JobPulse@1` |
| 👤 User | `lucas.muller@gmail.com` | `JobPulse@1` |

> All regular users share the password `JobPulse@1`

---

## 🌐 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create new account |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `GET` | `/api/auth/me` | Get current user profile |
| `PUT` | `/api/auth/profile` | Update profile |
| `PUT` | `/api/auth/password` | Change password |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs` | List jobs (paginated, filterable) |
| `GET` | `/api/jobs/:id` | Get single job |
| `GET` | `/api/jobs/featured` | Featured jobs |
| `GET` | `/api/jobs/stats` | Totals (jobs, internships, etc.) |

### Live Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/live-jobs` | Real-time remote jobs (Remotive) |

### Applications
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/applications` | Submit application |
| `GET` | `/api/applications/my` | My applications (auth) |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/categories` | All job categories |

---

## 🚢 Deployment

### Deploy to Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Fork this repository
2. Create a new [Railway](https://railway.app) project
3. Connect your GitHub repo
4. Set environment variables:
   ```
   NODE_ENV=production
   JWT_SECRET=<your-strong-secret>
   JWT_EXPIRES_IN=7d
   ```
5. Railway auto-deploys on every push to `main` ✅

### Deploy to Render

1. Create a new [Render](https://render.com) Web Service
2. Connect GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables

---

## 🗃 Database Schema

```sql
users         — id, full_name, email, password_hash, phone, role, is_active
jobs          — id, title, company, location, type, work_mode, category_id,
                salary_min, salary_max, description, skills, experience_level, is_featured
categories    — id, name, icon
applications  — id, job_id, user_id, full_name, email, resume_path, status
```

**Indexes:** email (unique), category, type, work_mode, featured, salary, deadline, status

---

## 📊 Seeded Data

- **25 Jobs** — Google, OpenAI, Apple, Meta, Amazon, Stripe, Netflix, Tesla, DeepMind, Microsoft, Airbnb, Coinbase, Uber, Adobe, LinkedIn, Salesforce, Shopify, Snowflake, Samsung, HubSpot, Goldman Sachs, CrowdStrike, Spotify, Figma, Notion
- **12 Categories** — Software Engineering, AI & ML, Data Science, DevOps & Cloud, Mobile Dev, Product Design, Product Management, Cybersecurity, Marketing, Sales, Finance, HR
- **19 Users** — Diverse global profiles (India, USA, Germany, France, Italy, Japan, China, South Korea)

---

## 🔒 Security Features

- **Helmet.js** — Sets secure HTTP headers
- **Rate limiting** — 100 req/15min (general), 10 req/15min (auth)
- **Input sanitization** — XSS protection on all user inputs
- **Account lockout** — After 5 failed login attempts
- **Password rules** — Min 8 chars, uppercase, lowercase, number, special char
- **JWT expiry** — Tokens expire after 7 days
- **CORS** — Configured for production domain

---

## 🤝 Contributing

1. Fork the project
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Ayush Raj**

[![GitHub](https://img.shields.io/badge/GitHub-Ayush--7722-181717?style=flat-square&logo=github)](https://github.com/Ayush-7722)

---

<div align="center">

Made with ❤️ by Ayush Raj

⭐ **Star this repo** if you found it helpful!

</div>
