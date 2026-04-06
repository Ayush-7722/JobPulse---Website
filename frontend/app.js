// ========================================
//  JobPulse — Frontend Application
//  With Authentication & Security
// ========================================

// Detect environment:
// - Railway/production: no port or port 443/80 → use relative '/api'
// - VS Code Live Server: port 5500/5501 → proxy to localhost:3000
// - Direct Node: port 3000 → use relative '/api'
const API_BASE = (window.location.port && window.location.port !== '3000')
  ? 'http://localhost:3000/api'
  : '/api';


// ── State ──
const state = {
  jobs: [],
  featuredJobs: [],
  categories: [],
  stats: {},
  filters: {
    search: '',
    type: '',
    work_mode: '',
    category: '',
    sort: 'newest',
    page: 1,
  },
  pagination: null,
  currentJob: null,
  // Auth
  user: null,
  token: null,
  // Live Jobs
  liveFilters: {
    search: '',
    type: '',
    source: '',
    page: 1,
    limit: 18,
  },
  livePagination: null,
};

// ── API Service ──
const api = {
  _getHeaders() {
    const headers = {};
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    return headers;
  },

  async get(url) {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: this._getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      if (res.status === 401) handleAuthError();
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  async post(url, body) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._getHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    if (!res.ok) {
      // Only trigger session-expired logout for 401s on NON-auth routes.
      // On /auth/login and /auth/register, 401 just means wrong credentials.
      const isAuthRoute = url.startsWith('/auth/');
      if (res.status === 401 && !isAuthRoute) handleAuthError();
      throw new Error(data.error || 'Request failed');
    }
    return data;
  },

  async put(url, body) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this._getHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    if (!res.ok) {
      if (res.status === 401) handleAuthError();
      throw new Error(data.error || 'Request failed');
    }
    return data;
  },

  async postForm(url, formData) {
    const headers = this._getHeaders();
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    if (!res.ok) {
      if (res.status === 401) handleAuthError();
      throw new Error(data.error || 'Request failed');
    }
    return data;
  },
};

// ── Auth Management ──
function handleAuthError() {
  logout();
  showToast('Session expired. Please log in again.', 'error');
}

function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('jobpulse_token', token);
  localStorage.setItem('jobpulse_user', JSON.stringify(user));
  updateAuthUI();
}

function loadAuth() {
  const token = localStorage.getItem('jobpulse_token');
  const userStr = localStorage.getItem('jobpulse_user');
  if (token && userStr) {
    try {
      state.token = token;
      state.user = JSON.parse(userStr);
      updateAuthUI();
      // Verify token is still valid
      verifyToken();
    } catch (e) {
      logout();
    }
  }
}

async function verifyToken() {
  try {
    const data = await api.get('/auth/me');
    state.user = data.user;
    localStorage.setItem('jobpulse_user', JSON.stringify(data.user));
    updateAuthUI();
  } catch (err) {
    // Token invalid
    logout();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('jobpulse_token');
  localStorage.removeItem('jobpulse_user');
  updateAuthUI();
}

function updateAuthUI() {
  const authButtons = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');

  if (state.user) {
    authButtons.style.display = 'none';
    userMenu.style.display = 'block';
    document.getElementById('user-avatar').textContent = state.user.full_name.charAt(0).toUpperCase();
    document.getElementById('user-name').textContent = state.user.full_name.split(' ')[0];
    document.getElementById('user-dropdown-header').innerHTML = `
      <strong>${state.user.full_name}</strong>
      ${state.user.email}
    `;
  } else {
    authButtons.style.display = 'flex';
    userMenu.style.display = 'none';
    userMenu.classList.remove('open');
  }
}

// ── Password Strength Checker ──
function checkPasswordStrength(password) {
  let score = 0;
  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  for (const v of Object.values(rules)) if (v) score++;

  // Update rule indicators
  document.getElementById('rule-length').className = rules.length ? 'valid' : '';
  document.getElementById('rule-length').textContent = (rules.length ? '✓' : '✗') + ' 8+ characters';
  document.getElementById('rule-upper').className = rules.upper ? 'valid' : '';
  document.getElementById('rule-upper').textContent = (rules.upper ? '✓' : '✗') + ' Uppercase';
  document.getElementById('rule-lower').className = rules.lower ? 'valid' : '';
  document.getElementById('rule-lower').textContent = (rules.lower ? '✓' : '✗') + ' Lowercase';
  document.getElementById('rule-number').className = rules.number ? 'valid' : '';
  document.getElementById('rule-number').textContent = (rules.number ? '✓' : '✗') + ' Number';
  document.getElementById('rule-special').className = rules.special ? 'valid' : '';
  document.getElementById('rule-special').textContent = (rules.special ? '✓' : '✗') + ' Special char';

  // Update strength bar
  const fill = document.getElementById('strength-fill');
  const text = document.getElementById('strength-text');
  const levels = ['', 'weak', 'weak', 'fair', 'good', 'strong'];
  const labels = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  fill.className = `strength-fill ${levels[score]}`;
  text.className = `strength-text ${levels[score]}`;
  text.textContent = password.length > 0 ? labels[score] : '';

  return score >= 5;
}

// ── Helpers ──
function formatSalary(min, max, currency = 'USD') {
  const fmt = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toLocaleString();
  };
  const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$' };
  const sym = symbols[currency] || currency + ' ';
  if (min && max) return `${sym}${fmt(min)} — ${sym}${fmt(max)}`;
  if (min) return `From ${sym}${fmt(min)}`;
  if (max) return `Up to ${sym}${fmt(max)}`;
  return 'Competitive';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Expired';
  if (diff === 0) return 'Last day!';
  if (diff <= 7) return `${diff} days left`;
  return formatDate(dateStr);
}

function typeClass(type) {
  return 'type-' + type.toLowerCase().replace(/\s+/g, '-');
}

function getCompanyInitial(company) {
  return company.charAt(0).toUpperCase();
}

// Escape HTML to prevent XSS in rendered content
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Toast Notifications ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Render Functions ──
function renderJobCard(job, isFeatured = false) {
  const skills = job.skills ? job.skills.split(',').slice(0, 4) : [];
  const deadlineText = daysUntil(job.deadline);

  return `
    <div class="job-card ${job.is_featured ? 'featured' : ''} fade-in-up" data-job-id="${job.id}">
      ${job.is_featured ? '<div class="featured-badge">⭐ Featured</div>' : ''}
      <div class="job-card-header">
        ${job.company_logo
          ? `<img src="${escapeHtml(job.company_logo)}" alt="${escapeHtml(job.company)}" class="company-logo" onerror="this.outerHTML='<div class=\\'company-logo-fallback\\'>${getCompanyInitial(job.company)}</div>'">`
          : `<div class="company-logo-fallback">${getCompanyInitial(job.company)}</div>`
        }
        <div class="job-card-info">
          <h3>${escapeHtml(job.title)}</h3>
          <div class="company-name">${escapeHtml(job.company)}</div>
        </div>
      </div>
      <div class="job-card-meta">
        <span class="meta-tag ${typeClass(job.type)}">${escapeHtml(job.type)}</span>
        <span class="meta-tag">📍 ${escapeHtml(job.location)}</span>
        <span class="meta-tag">${job.work_mode === 'Remote' ? '🌍' : job.work_mode === 'Hybrid' ? '🔀' : '🏢'} ${escapeHtml(job.work_mode)}</span>
        ${job.experience_level ? `<span class="meta-tag">📊 ${escapeHtml(job.experience_level)}</span>` : ''}
      </div>
      <div class="job-card-skills">
        ${skills.map(s => `<span class="skill-tag">${escapeHtml(s.trim())}</span>`).join('')}
        ${job.skills && job.skills.split(',').length > 4 ? `<span class="skill-tag">+${job.skills.split(',').length - 4}</span>` : ''}
      </div>
      <div class="job-card-footer">
        <div class="salary">${formatSalary(job.salary_min, job.salary_max, job.currency)}${job.type === 'Internship' ? '/mo' : '/yr'}</div>
        ${deadlineText ? `<div class="deadline">⏰ ${deadlineText}</div>` : ''}
      </div>
    </div>
  `;
}

function renderSkeletons(count = 6) {
  return Array(count).fill('<div class="skeleton-card loading-skeleton"></div>').join('');
}

function renderCategoryCard(cat) {
  return `
    <div class="category-card ${state.filters.category === cat.name ? 'active' : ''}" data-category="${escapeHtml(cat.name)}">
      <div class="cat-icon">${cat.icon}</div>
      <div class="cat-name">${escapeHtml(cat.name)}</div>
      <div class="cat-count">${cat.job_count} ${cat.job_count === 1 ? 'job' : 'jobs'}</div>
    </div>
  `;
}

function renderPagination() {
  const p = state.pagination;
  if (!p || p.total_pages <= 1) {
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  let html = '';
  html += `<button ${p.current_page === 1 ? 'disabled' : ''} data-page="${p.current_page - 1}">←</button>`;

  for (let i = 1; i <= p.total_pages; i++) {
    if (
      i === 1 || i === p.total_pages ||
      (i >= p.current_page - 1 && i <= p.current_page + 1)
    ) {
      html += `<button class="${i === p.current_page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === p.current_page - 2 || i === p.current_page + 2) {
      html += `<button disabled>…</button>`;
    }
  }

  html += `<button ${p.current_page === p.total_pages ? 'disabled' : ''} data-page="${p.current_page + 1}">→</button>`;
  document.getElementById('pagination').innerHTML = html;
}

// ── Modal Rendering ──
function renderJobModal(job) {
  const requirements = job.requirements ? job.requirements.split(';') : [];
  const responsibilities = job.responsibilities ? job.responsibilities.split(';') : [];
  const skills = job.skills ? job.skills.split(',') : [];
  const deadlineText = daysUntil(job.deadline);

  document.getElementById('modal-header-info').innerHTML = `
    ${job.company_logo
      ? `<img src="${escapeHtml(job.company_logo)}" alt="${escapeHtml(job.company)}" class="company-logo" onerror="this.outerHTML='<div class=\\'company-logo-fallback\\'>${getCompanyInitial(job.company)}</div>'">`
      : `<div class="company-logo-fallback">${getCompanyInitial(job.company)}</div>`
    }
    <div>
      <h2>${escapeHtml(job.title)}</h2>
      <div class="company-name">${escapeHtml(job.company)}</div>
    </div>
  `;

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-meta">
      <span class="meta-tag ${typeClass(job.type)}">${escapeHtml(job.type)}</span>
      <span class="meta-tag">📍 ${escapeHtml(job.location)}</span>
      <span class="meta-tag">${job.work_mode === 'Remote' ? '🌍' : job.work_mode === 'Hybrid' ? '🔀' : '🏢'} ${escapeHtml(job.work_mode)}</span>
      <span class="meta-tag">📊 ${escapeHtml(job.experience_level)}</span>
      ${job.category_name ? `<span class="meta-tag">${job.category_icon || '📂'} ${escapeHtml(job.category_name)}</span>` : ''}
      ${deadlineText ? `<span class="meta-tag">⏰ ${deadlineText}</span>` : ''}
    </div>

    <div class="modal-section">
      <h3>📋 Description</h3>
      <p>${escapeHtml(job.description)}</p>
    </div>

    ${requirements.length ? `
    <div class="modal-section">
      <h3>✅ Requirements</h3>
      <ul>${requirements.map(r => `<li>${escapeHtml(r.trim())}</li>`).join('')}</ul>
    </div>
    ` : ''}

    ${responsibilities.length ? `
    <div class="modal-section">
      <h3>🎯 Responsibilities</h3>
      <ul>${responsibilities.map(r => `<li>${escapeHtml(r.trim())}</li>`).join('')}</ul>
    </div>
    ` : ''}

    <div class="modal-section">
      <h3>🛠️ Skills</h3>
      <div class="modal-skills">
        ${skills.map(s => `<span class="skill-tag">${escapeHtml(s.trim())}</span>`).join('')}
      </div>
    </div>
  `;

  document.getElementById('modal-footer').innerHTML = `
    <div class="modal-salary">
      ${formatSalary(job.salary_min, job.salary_max, job.currency)}
      <span>${job.type === 'Internship' ? '/month' : '/year'}</span>
    </div>
    <button class="btn btn-primary btn-lg" id="apply-btn" data-job-id="${job.id}">
      🚀 Apply Now
    </button>
  `;

  // Bind apply button
  document.getElementById('apply-btn').addEventListener('click', () => {
    closeModal('job-modal-overlay');
    if (!state.user) {
      showToast('Please log in or sign up to apply for jobs.', 'info');
      showAuthModal('login');
      return;
    }
    openApplyModal(job);
  });
}

// ── Modal Management ──
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

function closeAllModals() {
  ['job-modal-overlay', 'apply-modal-overlay', 'auth-modal-overlay',
   'applications-modal-overlay', 'password-modal-overlay'].forEach(closeModal);
}

function showAuthModal(mode = 'login') {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');

  if (mode === 'login') {
    loginForm.style.display = 'flex';
    registerForm.style.display = 'none';
    title.textContent = 'Log In';
    subtitle.textContent = 'Welcome back to JobPulse';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'flex';
    title.textContent = 'Create Account';
    subtitle.textContent = 'Join JobPulse to apply for jobs';
  }

  openModal('auth-modal-overlay');
}

function openApplyModal(job) {
  document.getElementById('apply-job-id').value = job.id;
  document.getElementById('apply-modal-title').textContent = `Apply for ${job.title}`;
  document.getElementById('apply-modal-subtitle').textContent = `${job.company} · ${job.location}`;
  document.getElementById('apply-as-name').textContent = state.user.full_name;
  document.getElementById('apply-as-email').textContent = state.user.email;
  document.getElementById('apply-form').reset();
  document.getElementById('file-name').style.display = 'none';
  document.getElementById('file-upload').classList.remove('has-file');
  openModal('apply-modal-overlay');
}

// ── Data Fetching ──
async function loadStats() {
  try {
    const data = await api.get('/jobs/stats');
    state.stats = data;
    animateCounter('stat-jobs', data.total_jobs);
    animateCounter('stat-internships', data.total_internships);
    animateCounter('stat-companies', data.total_companies);
    animateCounter('stat-remote', data.total_remote);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  let current = 0;
  const increment = Math.max(1, Math.floor(target / 40));
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current;
  }, 30);
}

async function loadFeaturedJobs() {
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = renderSkeletons(4);
  try {
    const data = await api.get('/jobs/featured');
    state.featuredJobs = data.jobs;
    grid.innerHTML = data.jobs.map(j => renderJobCard(j, true)).join('');
    bindJobCards(grid);
  } catch (err) {
    grid.innerHTML = '<p style="color: var(--text-tertiary)">Failed to load featured jobs</p>';
  }
}

async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  try {
    const data = await api.get('/categories');
    state.categories = data.categories;
    grid.innerHTML = data.categories.map(c => renderCategoryCard(c)).join('');
    bindCategoryCards();
  } catch (err) {
    grid.innerHTML = '<p style="color: var(--text-tertiary)">Failed to load categories</p>';
  }
}

async function loadJobs() {
  const grid = document.getElementById('jobs-grid');
  grid.innerHTML = renderSkeletons(6);

  try {
    const params = new URLSearchParams();
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.type) params.set('type', state.filters.type);
    if (state.filters.work_mode) params.set('work_mode', state.filters.work_mode);
    if (state.filters.category) params.set('category', state.filters.category);
    if (state.filters.sort) params.set('sort', state.filters.sort);
    params.set('page', state.filters.page);
    params.set('limit', 12);

    const data = await api.get(`/jobs?${params.toString()}`);
    state.jobs = data.jobs;
    state.pagination = data.pagination;

    if (data.jobs.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🔍</div>
          <h3>No jobs found</h3>
          <p>Try adjusting your filters or search query to find more opportunities.</p>
        </div>
      `;
    } else {
      grid.innerHTML = data.jobs.map(j => renderJobCard(j)).join('');
      bindJobCards(grid);

      const cards = grid.querySelectorAll('.job-card');
      cards.forEach((card, i) => {
        card.style.animationDelay = `${i * 0.05}s`;
      });
    }

    const info = document.getElementById('results-info');
    info.innerHTML = `Showing <strong>${data.jobs.length}</strong> of <strong>${data.pagination.total_jobs}</strong> opportunities`;

    renderPagination();
  } catch (err) {
    grid.innerHTML = '<p style="color: var(--error); text-align: center; grid-column: 1/-1;">Failed to load jobs. Is the server running?</p>';
    console.error('Jobs error:', err);
  }
}

async function loadMyApplications() {
  const body = document.getElementById('applications-modal-body');
  body.innerHTML = '<div class="loading-skeleton" style="height: 200px;"></div>';
  openModal('applications-modal-overlay');

  try {
    const data = await api.get('/applications/my');
    if (data.applications.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No applications yet</h3>
          <p>Start browsing jobs and submit your first application!</p>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="applications-list">
          ${data.applications.map(a => `
            <div class="application-item">
              <h4>${escapeHtml(a.job_title)}</h4>
              <div class="app-company">${escapeHtml(a.job_company)}${a.job_location ? ' · ' + escapeHtml(a.job_location) : ''}</div>
              <div class="app-meta">
                <span class="status-badge ${a.status}">${a.status}</span>
                <span>Applied ${formatDate(a.created_at)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = '<p style="color: var(--error)">Failed to load applications.</p>';
  }
}

// ── Event Bindings ──
function bindJobCards(container) {
  container.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('click', async () => {
      const jobId = card.dataset.jobId;
      try {
        const data = await api.get(`/jobs/${jobId}`);
        state.currentJob = data.job;
        renderJobModal(data.job);
        openModal('job-modal-overlay');
      } catch (err) {
        showToast('Failed to load job details', 'error');
      }
    });
  });
}

function bindCategoryCards() {
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const category = card.dataset.category;
      if (state.filters.category === category) {
        state.filters.category = '';
      } else {
        state.filters.category = category;
      }
      state.filters.page = 1;

      document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
      if (state.filters.category) card.classList.add('active');

      loadJobs();
      document.getElementById('jobs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ══════════════════════════════════════
//  Live Jobs (External APIs)
// ══════════════════════════════════════

function renderLiveJobCard(job) {
  const tags = (job.tags || []).slice(0, 5);
  const chipClass = job.source === 'linkedin' ? 'chip-linkedin' : 'chip-remotive';
  const chipLabel = job.source === 'linkedin' ? '💼 LinkedIn' : '📡 Remotive';

  // Route logos through our proxy to bypass Cloudflare 403s
  // Use API_BASE so this works from Live Server (5500) AND direct (3000)
  const proxyLogo = job.company_logo
    ? `${API_BASE}/logo-proxy?url=${encodeURIComponent(job.company_logo)}`
    : null;

  const fallbackLetter = escapeHtml(job.company.charAt(0).toUpperCase());
  const logoEl = proxyLogo
    ? `<img src="${proxyLogo}" alt="${escapeHtml(job.company)}" class="live-company-logo"
         onerror="this.outerHTML='<div class=\\'live-company-fallback\\'>${fallbackLetter}</div>'">`
    : `<div class="live-company-fallback">${fallbackLetter}</div>`;

  return `
    <a href="${escapeHtml(job.apply_url || '#')}" target="_blank" rel="noopener noreferrer"
       class="live-job-card source-${escapeHtml(job.source)} fade-in-up">
      <span class="live-source-chip ${chipClass}">${chipLabel}</span>

      <div class="live-card-header">
        ${logoEl}
        <div class="live-card-info">
          <h3>${escapeHtml(job.title)}</h3>
          <div class="live-card-company">${escapeHtml(job.company)}</div>
        </div>
      </div>

      <div class="live-card-meta">
        <span class="meta-tag ${typeClass(job.type)}">${escapeHtml(job.type)}</span>
        <span class="meta-tag">${job.work_mode === 'Remote' ? '🌍' : job.work_mode === 'Hybrid' ? '🔀' : '🏢'} ${escapeHtml(job.location)}</span>
        ${job.category ? `<span class="meta-tag">📂 ${escapeHtml(job.category)}</span>` : ''}
      </div>

      ${tags.length ? `
      <div class="live-card-tags">
        ${tags.map(t => `<span class="skill-tag">${escapeHtml(t)}</span>`).join('')}
      </div>` : ''}

      <div class="live-card-footer">
        <span class="live-card-salary">${escapeHtml(job.salary || 'Competitive')}</span>
        <span class="live-card-time">🕐 ${escapeHtml(job.time_ago || '')}</span>
        <span class="live-apply-btn">Apply ↗</span>
      </div>
    </a>
  `;
}

function renderLivePagination(p) {
  const container = document.getElementById('live-pagination');
  if (!p || p.total_pages <= 1) { container.innerHTML = ''; return; }

  let html = `<button ${p.page === 1 ? 'disabled' : ''} data-page="${p.page - 1}">←</button>`;
  for (let i = 1; i <= p.total_pages; i++) {
    if (i === 1 || i === p.total_pages || (i >= p.page - 1 && i <= p.page + 1)) {
      html += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === p.page - 2 || i === p.page + 2) {
      html += `<button disabled>…</button>`;
    }
  }
  html += `<button ${p.page === p.total_pages ? 'disabled' : ''} data-page="${p.page + 1}">→</button>`;
  container.innerHTML = html;
}

async function loadLiveJobs(forceRefresh = false) {
  const grid = document.getElementById('live-jobs-grid');
  const statusBar = document.getElementById('live-status-bar');

  // Show skeletons
  grid.innerHTML = Array(6).fill(
    '<div class="live-skeleton loading-skeleton"></div>'
  ).join('');
  statusBar.innerHTML = '<div class="live-pulse"></div> Fetching live jobs…';

  try {
    const params = new URLSearchParams();
    if (state.liveFilters.search) params.set('search', state.liveFilters.search);
    if (state.liveFilters.type)   params.set('type',   state.liveFilters.type);
    if (state.liveFilters.source) params.set('source', state.liveFilters.source);
    params.set('page',  state.liveFilters.page);
    params.set('limit', state.liveFilters.limit);
    if (forceRefresh) params.set('_t', Date.now()); // bypass browser cache

    const data = await api.get(`/live-jobs?${params.toString()}`);
    state.livePagination = data.pagination;

    // Update status bar
    const { remotive = 0, linkedin = 0 } = data.sources || {};
    const total = data.pagination?.total || 0;
    statusBar.innerHTML = `
      <div class="live-pulse"></div>
      <strong>${total}</strong> live jobs found
      &nbsp;·&nbsp; 📡 Remotive: <strong>${remotive}</strong>
      ${linkedin > 0 ? `&nbsp;·&nbsp; 💼 LinkedIn: <strong>${linkedin}</strong>` : ''}
      &nbsp;·&nbsp; Updated just now
    `;

    if (!data.jobs || data.jobs.length === 0) {
      grid.innerHTML = `
        <div class="live-empty">
          <div class="empty-icon">🔍</div>
          <h3>No live jobs found</h3>
          <p>Try a different search term or remove filters.</p>
        </div>`;
      document.getElementById('live-pagination').innerHTML = '';
      return;
    }

    grid.innerHTML = data.jobs.map(j => renderLiveJobCard(j)).join('');

    // Stagger animation
    grid.querySelectorAll('.live-job-card').forEach((card, i) => {
      card.style.animationDelay = `${i * 0.04}s`;
    });

    renderLivePagination(data.pagination);
  } catch (err) {
    statusBar.innerHTML = '⚠️ Failed to load live jobs.';
    grid.innerHTML = `
      <div class="live-empty">
        <div class="empty-icon">⚠️</div>
        <h3>Could not load live jobs</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
    console.error('Live jobs error:', err);
  }
}

// ── Initialize ──

function init() {
  // Load saved auth
  loadAuth();

  // Theme
  const savedTheme = localStorage.getItem('jobpulse-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jobpulse-theme', next);
    updateThemeIcon(next);
  });

  // Mobile menu
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('mobile-nav').classList.toggle('active');
  });

  document.querySelectorAll('.mobile-nav a').forEach(a => {
    a.addEventListener('click', () => {
      document.getElementById('mobile-nav').classList.remove('active');
    });
  });

  // ── Auth UI Bindings ──

  // Log in / Sign up buttons
  document.getElementById('login-btn').addEventListener('click', () => showAuthModal('login'));
  document.getElementById('signup-btn').addEventListener('click', () => showAuthModal('register'));

  // User menu toggle
  document.getElementById('user-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-menu').classList.toggle('open');
  });

  // Close user menu on outside click
  document.addEventListener('click', () => {
    document.getElementById('user-menu').classList.remove('open');
  });

  // Auth modal close
  document.getElementById('auth-modal-close').addEventListener('click', () => closeModal('auth-modal-overlay'));
  document.getElementById('auth-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal('auth-modal-overlay');
  });

  // Switch between login/register
  document.getElementById('switch-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthModal('register');
  });
  document.getElementById('switch-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthModal('login');
  });

  // Password visibility toggles
  document.getElementById('login-pw-toggle').addEventListener('click', () => {
    const input = document.getElementById('login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('register-pw-toggle').addEventListener('click', () => {
    const input = document.getElementById('register-password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // ── Demo login: auto-fill credentials and submit ──
  document.getElementById('demo-login-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    document.getElementById('login-email').value    = 'demo@jobpulse.com';
    document.getElementById('login-password').value = 'Demo@1234';
    const btn = document.getElementById('login-submit');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Logging in...';
    btn.disabled = true;
    try {
      const data = await api.post('/auth/login', {
        email: 'demo@jobpulse.com',
        password: 'Demo@1234',
      });
      saveAuth(data.token, data.user);
      closeModal('auth-modal-overlay');
      showToast(`Welcome, ${data.user.full_name}! 🎉`, 'success');
    } catch (err) {
      showToast(err.message || 'Demo login failed', 'error');
    } finally {
      btn.innerHTML = orig;
      btn.disabled = false;
    }
  });

  // Password strength checker
  document.getElementById('register-password').addEventListener('input', (e) => {
    checkPasswordStrength(e.target.value);
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-submit');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Logging in...';
    btn.disabled = true;

    // Clear any previous inline error
    const prevErr = document.getElementById('login-inline-error');
    if (prevErr) prevErr.remove();

    try {
      const data = await api.post('/auth/login', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      });
      saveAuth(data.token, data.user);
      closeModal('auth-modal-overlay');
      showToast(`Welcome back, ${data.user.full_name}! 🎉`, 'success');
      e.target.reset();
    } catch (err) {
      // Show persistent inline error with credential hint
      const errDiv = document.createElement('div');
      errDiv.id = 'login-inline-error';
      errDiv.style.cssText = 'margin-top:10px;padding:12px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:10px;font-size:13px;animation:shake 0.4s ease;';
      errDiv.innerHTML = `
        <div style="color:#ef4444;font-weight:600;margin-bottom:6px;">❌ ${err.message || 'Invalid email or password'}</div>
        <div style="color:var(--text-secondary,#64748b);">
          Try the demo account:<br>
          📧 <strong>demo@jobpulse.com</strong><br>
          🔑 <strong>Demo@1234</strong><br>
          <a href="#" id="inline-demo-btn" style="color:var(--primary,#6366f1);font-weight:700;text-decoration:none;">⚡ Auto-login with demo →</a>
        </div>`;
      e.target.appendChild(errDiv);

      // Wire up the inline demo button
      document.getElementById('inline-demo-btn').addEventListener('click', async (ev) => {
        ev.preventDefault();
        document.getElementById('login-email').value = 'demo@jobpulse.com';
        document.getElementById('login-password').value = 'Demo@1234';
        document.getElementById('login-form').requestSubmit();
      });

      showToast(err.message, 'error');
    } finally {
      btn.innerHTML = orig;
      btn.disabled = false;
    }
  });

  // Register form
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    const btn = document.getElementById('register-submit');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Creating account...';
    btn.disabled = true;

    try {
      const data = await api.post('/auth/register', {
        full_name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        phone: document.getElementById('register-phone').value,
        password: password,
      });
      saveAuth(data.token, data.user);
      closeModal('auth-modal-overlay');
      showToast(`Welcome to JobPulse, ${data.user.full_name}! 🎉`, 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.innerHTML = orig;
      btn.disabled = false;
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
    document.getElementById('user-menu').classList.remove('open');
    showToast('Logged out successfully.', 'info');
  });

  // My Applications
  document.getElementById('my-applications-btn').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('user-menu').classList.remove('open');
    loadMyApplications();
  });

  // Applications modal close
  document.getElementById('applications-modal-close').addEventListener('click', () => closeModal('applications-modal-overlay'));
  document.getElementById('applications-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal('applications-modal-overlay');
  });

  // Change Password
  document.getElementById('change-password-btn').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('user-menu').classList.remove('open');
    document.getElementById('password-form').reset();
    openModal('password-modal-overlay');
  });

  document.getElementById('password-modal-close').addEventListener('click', () => closeModal('password-modal-overlay'));
  document.getElementById('password-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal('password-modal-overlay');
  });

  // Password change form
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-new-password').value;

    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    try {
      await api.put('/auth/password', {
        current_password: document.getElementById('current-password').value,
        new_password: newPw,
      });
      closeModal('password-modal-overlay');
      showToast('Password changed successfully! 🔑', 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ── Search ──
  document.getElementById('hero-search-btn').addEventListener('click', () => {
    state.filters.search = document.getElementById('hero-search').value;
    state.filters.page = 1;
    loadJobs();
    document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('hero-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      state.filters.search = e.target.value;
      state.filters.page = 1;
      loadJobs();
      document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Type filters
  document.querySelectorAll('#type-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#type-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.type = btn.dataset.type;
      state.filters.page = 1;
      loadJobs();
    });
  });

  // Work mode filter
  document.getElementById('work-mode-filter').addEventListener('change', (e) => {
    state.filters.work_mode = e.target.value;
    state.filters.page = 1;
    loadJobs();
  });

  // Sort filter
  document.getElementById('sort-filter').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    state.filters.page = 1;
    loadJobs();
  });

  // Pagination
  document.getElementById('pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (btn && !btn.disabled) {
      state.filters.page = parseInt(btn.dataset.page);
      loadJobs();
      document.getElementById('jobs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Modal close buttons
  document.getElementById('modal-close').addEventListener('click', () => closeModal('job-modal-overlay'));
  document.getElementById('apply-modal-close').addEventListener('click', () => closeModal('apply-modal-overlay'));

  document.getElementById('job-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal('job-modal-overlay');
  });
  document.getElementById('apply-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal('apply-modal-overlay');
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // File upload display
  document.getElementById('apply-resume').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const fileNameEl = document.getElementById('file-name');
    const uploadEl = document.getElementById('file-upload');
    if (file) {
      fileNameEl.textContent = `📎 ${file.name}`;
      fileNameEl.style.display = 'flex';
      uploadEl.classList.add('has-file');
    } else {
      fileNameEl.style.display = 'none';
      uploadEl.classList.remove('has-file');
    }
  });

  // Apply form submission (authenticated)
  document.getElementById('apply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) {
      showToast('Please log in to apply.', 'error');
      closeModal('apply-modal-overlay');
      showAuthModal('login');
      return;
    }

    const submitBtn = document.getElementById('apply-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ Submitting...';
    submitBtn.disabled = true;

    try {
      const formData = new FormData(e.target);
      const data = await api.postForm('/applications', formData);
      closeModal('apply-modal-overlay');
      showToast(data.message, 'success');
      e.target.reset();
      document.getElementById('file-name').style.display = 'none';
      document.getElementById('file-upload').classList.remove('has-file');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });

  // View all button
  document.getElementById('view-all-btn').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
  });

  // Footer type links
  document.querySelectorAll('.footer-type-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const type = link.dataset.type;
      if (type === 'Remote') {
        state.filters.work_mode = 'Remote';
        document.getElementById('work-mode-filter').value = 'Remote';
      } else {
        state.filters.type = type;
        document.querySelectorAll('#type-filters .filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === type);
        });
      }
      state.filters.page = 1;
      loadJobs();
      document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    const scrollY = window.scrollY;
    navbar.style.boxShadow = scrollY > 100 ? 'var(--shadow-md)' : 'none';
  });

  // Load data
  loadStats();
  loadFeaturedJobs();
  loadCategories();
  loadJobs();

  // ── Live Jobs Section ──

  // Source badges
  document.querySelectorAll('.source-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      document.querySelectorAll('.source-badge').forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      state.liveFilters.source = badge.dataset.source;
      state.liveFilters.page = 1;
      loadLiveJobs();
    });
  });

  // Live type filters
  document.querySelectorAll('[data-live-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-live-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.liveFilters.type = btn.dataset.liveType;
      state.liveFilters.page = 1;
      loadLiveJobs();
    });
  });

  // Live search with debounce
  let liveSearchTimer;
  document.getElementById('live-search').addEventListener('input', (e) => {
    clearTimeout(liveSearchTimer);
    liveSearchTimer = setTimeout(() => {
      state.liveFilters.search = e.target.value.trim();
      state.liveFilters.page = 1;
      loadLiveJobs();
    }, 400);
  });

  // Refresh button
  document.getElementById('live-refresh-btn').addEventListener('click', () => {
    loadLiveJobs(true);
  });

  // Live pagination
  document.getElementById('live-pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (btn && !btn.disabled) {
      state.liveFilters.page = parseInt(btn.dataset.page);
      loadLiveJobs();
      document.getElementById('live-jobs-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Initial load
  loadLiveJobs();
}

function updateThemeIcon(theme) {
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
