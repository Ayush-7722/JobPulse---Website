const axios = require('axios');
const { parse } = require('csv-parse/sync');

const SHEET_ID = '1t3Mhbe707_3D64B5694-x_E_G_v_7722-AYUSHRaj_JobPulse';
const G_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// Simple in-memory cache
let cachedJobs = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchJobsFromSheet() {
  const now = Date.now();
  if (cachedJobs && (now - lastFetchTime < CACHE_TTL)) {
    return cachedJobs;
  }

  try {
    const response = await axios.get(G_SHEET_URL);
    const records = parse(response.data, {
      columns: true,
      skip_empty_lines: true,
    });

    // Map relevant data
    const jobs = records.map((row, index) => ({
      _id: `g-${index}`, // use index for ID if none provided
      title: row['Job Title'] || row.title || 'Untitled Job',
      company: row['Company Name'] || row.company || 'Unknown Company',
      company_logo: row['Company Logo'] || row.company_logo || '',
      location: row['Location'] || row.location || 'Remote',
      type: row['Job Type'] || row.type || 'Full-Time',
      work_mode: row['Work Mode'] || row.work_mode || 'Remote',
      category_name: row['Category'] || row.category || 'General',
      category_icon: '💼',
      salary_min: parseInt(row['Salary Min'] || row.salary_min) || null,
      salary_max: parseInt(row['Salary Max'] || row.salary_max) || null,
      currency: row['Currency'] || row.currency || 'USD',
      description: row['Description'] || row.description || 'No description provided.',
      requirements: row['Requirements'] || row.requirements || '',
      responsibilities: row['Responsibilities'] || row.responsibilities || '',
      skills: row['Skills'] || row.skills || '',
      experience_level: row['Experience Level'] || row.experience_level || 'Entry Level',
      is_featured: row['Is Featured'] === 'TRUE' || row.is_featured === 'true',
      deadline: row['Deadline'] || row.deadline || null,
      is_active: true,
      created_at: new Date(),
    }));

    cachedJobs = jobs;
    lastFetchTime = now;
    return jobs;
  } catch (err) {
    console.error('❌ Error fetching from Google Sheets:', err.message);
    return cachedJobs || []; // return cache if exists, else empty
  }
}

/**
 * Get a specific job by search or ID
 */
async function getJobById(id) {
  const jobs = await fetchJobsFromSheet();
  return jobs.find(j => j._id === id);
}

module.exports = {
  fetchJobsFromSheet,
  getJobById
};
