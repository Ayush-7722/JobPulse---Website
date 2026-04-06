const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobpulse';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('✅ MongoDB connected:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
  autoSeed();
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('♻️  MongoDB reconnected'));

// ─────────────────────────────────────────────
// Schemas & Models
// ─────────────────────────────────────────────

// ── User ──
const { encrypt, decrypt } = require('../services/encryption');

const userSchema = new mongoose.Schema({
  full_name:            { type: String, required: true, trim: true, maxlength: 100 },
  email:                { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash:        { type: String, required: true },
  
  // Encrypted PII Fields
  phone:                { type: String, default: null, get: decrypt, set: encrypt },
  address:              { type: String, default: null, get: decrypt, set: encrypt },
  
  // Additional Profile Fields
  bio:                  { type: String, default: null },
  current_job_title:    { type: String, default: null },
  resume_url:           { type: String, default: null },
  linkedin_url:         { type: String, default: null },
  portfolio_url:        { type: String, default: null },
  
  role:                 { type: String, enum: ['user', 'admin'], default: 'user' },
  is_active:            { type: Boolean, default: true },
  failed_login_attempts:{ type: Number, default: 0 },
  locked_until:         { type: Date, default: null },
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { getters: true }, // Enable getters when formatting response to JSON
  toObject: { getters: true }
});

userSchema.index({ email: 1 }, { unique: true });

// ── Category ──
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  icon: { type: String, default: '💼' },
  description: { type: String, default: '' },
}, { timestamps: false });

// ── Job ──
const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  company_logo: { type: String, default: '' },
  location: { type: String, required: true },
  type: { type: String, enum: ['Full-Time', 'Part-Time', 'Internship', 'Contract', 'Freelance'], required: true },
  work_mode: { type: String, enum: ['Remote', 'On-site', 'Hybrid'], required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  category_name: { type: String, default: '' },  // denormalized for fast reads
  category_icon: { type: String, default: '' },
  salary_min: { type: Number, default: null },
  salary_max: { type: Number, default: null },
  currency: { type: String, default: 'USD' },
  description: { type: String, required: true },
  requirements: { type: String, default: '' },
  responsibilities: { type: String, default: '' },
  skills: { type: String, default: '' },
  experience_level: { type: String, enum: ['Entry Level', 'Mid Level', 'Senior', 'Lead', 'Executive'], default: 'Entry Level' },
  is_featured: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  deadline: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

jobSchema.index({ is_active: 1, is_featured: 1 });
jobSchema.index({ type: 1, work_mode: 1 });
jobSchema.index({ title: 'text', company: 'text', skills: 'text', description: 'text' });

// ── Application ──
const applicationSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  full_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: null },
  resume_path: { type: String, default: null },
  cover_letter: { type: String, default: null },
  linkedin_url: { type: String, default: null },
  portfolio_url: { type: String, default: null },
  status: { type: String, enum: ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'], default: 'pending' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

applicationSchema.index({ user: 1 });
applicationSchema.index({ job: 1, user: 1 }, { unique: true }); // prevent duplicate applications

// ── OTP Verification ──
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  name: { type: String, default: 'User' },
  otp_code: { type: String, required: true },
  expires_at: { type: Number, required: true },  // Unix ms timestamp
  is_used: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

otpSchema.index({ email: 1, is_used: 1 });
// Auto-expire documents after 1 hour via TTL index
otpSchema.index({ created_at: 1 }, { expireAfterSeconds: 3600 });

// ─────────────────────────────────────────────
// Export Models
// ─────────────────────────────────────────────
const User = mongoose.model('User', userSchema);
const Category = mongoose.model('Category', categorySchema);
const Job = mongoose.model('Job', jobSchema);
const Application = mongoose.model('Application', applicationSchema);
const OtpVerification = mongoose.model('OtpVerification', otpSchema);

// ─────────────────────────────────────────────
// Auto-Seed on First Boot
// ─────────────────────────────────────────────
async function autoSeed() {
  try {
    // ── Categories ──
    const catCount = await Category.countDocuments();
    let categories = {};
    if (catCount === 0) {
      const cats = await Category.insertMany([
        { name: 'Software Engineering', icon: '💻' },
        { name: 'AI & Machine Learning', icon: '🤖' },
        { name: 'Data Science', icon: '📊' },
        { name: 'DevOps & Cloud', icon: '☁️' },
        { name: 'Mobile Development', icon: '📱' },
        { name: 'Product Design', icon: '🎨' },
        { name: 'Product Management', icon: '📋' },
        { name: 'Cybersecurity', icon: '🔒' },
        { name: 'Marketing', icon: '📣' },
        { name: 'Sales', icon: '💰' },
        { name: 'Finance', icon: '🏦' },
        { name: 'Human Resources', icon: '👥' },
      ]);
      cats.forEach(c => { categories[c.name] = c._id; });
      console.log('✅ Seeded 12 categories');
    } else {
      const cats = await Category.find({});
      cats.forEach(c => { categories[c.name] = c._id; });
    }

    // ── Jobs ──
    const jobCount = await Job.countDocuments();
    if (jobCount === 0) {
      const SE = categories['Software Engineering'];
      const AI = categories['AI & Machine Learning'];
      const DS = categories['Data Science'];
      const DO = categories['DevOps & Cloud'];
      const MOB = categories['Mobile Development'];
      const DES = categories['Product Design'];
      const PM = categories['Product Management'];
      const SEC = categories['Cybersecurity'];
      const MKT = categories['Marketing'];
      const FIN = categories['Finance'];

      await Job.insertMany([
        { title: 'Senior Software Engineer', company: 'Google', company_logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', location: 'Mountain View, CA', type: 'Full-Time', work_mode: 'Hybrid', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 180000, salary_max: 280000, currency: 'USD', description: 'Join Google\'s core engineering team to build planet-scale distributed systems that serve billions of users. You will design, implement and deploy scalable, reliable infrastructure for Google products..rements: 5+ years experience in distributed systems, expertise in Java/Go/C++, experience with large-scale systems', requirements: '• 5+ years of software engineering experience\n• Strong proficiency in Java, Go, or C++\n• Experience with distributed systems\n• BS/MS in Computer Science or equivalent', responsibilities: '• Design and implement scalable distributed systems\n• Lead technical projects end-to-end\n• Mentor junior engineers\n• Collaborate across teams on architecture', skills: 'Java,Go,C++,Distributed Systems,Kubernetes', experience_level: 'Senior', is_featured: true, deadline: new Date('2025-06-30') },
        { title: 'Machine Learning Engineer', company: 'OpenAI', company_logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64', location: 'San Francisco, CA', type: 'Full-Time', work_mode: 'Remote', category: AI, category_name: 'AI & Machine Learning', category_icon: '🤖', salary_min: 200000, salary_max: 350000, currency: 'USD', description: 'Work on cutting-edge large language models that will redefine how humans interact with AI. Shape the future of artificial intelligence at the world\'s leading AI lab.', requirements: '• PhD or MS in ML/AI/CS\n• Published research in top ML venues\n• Experience with PyTorch/JAX\n• Strong mathematics background', responsibilities: '• Research and develop new ML architectures\n• Train and evaluate large models\n• Publish research papers\n• Collaborate with safety team', skills: 'Python,PyTorch,JAX,Deep Learning,NLP,LLMs', experience_level: 'Senior', is_featured: true, deadline: new Date('2025-07-15') },
        { title: 'iOS Engineer', company: 'Apple', company_logo: 'https://www.google.com/s2/favicons?domain=apple.com&sz=64', location: 'Cupertino, CA', type: 'Full-Time', work_mode: 'On-site', category: MOB, category_name: 'Mobile Development', category_icon: '📱', salary_min: 160000, salary_max: 260000, currency: 'USD', description: 'Build the next generation of iOS experiences used by over 1 billion Apple users worldwide. You\'ll work on core frameworks that power apps across the entire Apple ecosystem.', requirements: '• 4+ years iOS development\n• Expert in Swift and UIKit/SwiftUI\n• Strong CS fundamentals\n• Published apps on App Store', responsibilities: '• Develop and maintain iOS frameworks\n• Build new features for core apps\n• Performance optimization\n• Code review and mentoring', skills: 'Swift,Objective-C,SwiftUI,UIKit,Xcode,CoreData', experience_level: 'Senior', is_featured: true, deadline: new Date('2025-08-01') },
        { title: 'Full Stack Engineer', company: 'Meta', company_logo: 'https://www.google.com/s2/favicons?domain=meta.com&sz=64', location: 'Menlo Park, CA', type: 'Full-Time', work_mode: 'Hybrid', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 170000, salary_max: 290000, currency: 'USD', description: 'Help build the infrastructure and products that connect 3+ billion people around the world across Facebook, Instagram, WhatsApp and more.', requirements: '• 3+ years full-stack experience\n• Proficiency in React, PHP/Hack, Python\n• Experience with GraphQL\n• Understanding of distributed systems', responsibilities: '• Build and scale features for Meta apps\n• Design robust APIs\n• Collaborate with product teams\n• Ensure reliability and performance', skills: 'React,TypeScript,GraphQL,PHP,Python,MySQL', experience_level: 'Mid Level', is_featured: true, deadline: new Date('2025-07-30') },
        { title: 'Cloud Infrastructure Engineer', company: 'Amazon Web Services', company_logo: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=64', location: 'Seattle, WA', type: 'Full-Time', work_mode: 'Hybrid', category: DO, category_name: 'DevOps & Cloud', category_icon: '☁️', salary_min: 150000, salary_max: 250000, currency: 'USD', description: 'Design and operate the cloud infrastructure that powers millions of businesses worldwide. Work on the systems that form the foundation of modern cloud computing.', requirements: '• 4+ years in infrastructure/DevOps\n• AWS Certified (Solutions Architect preferred)\n• Experience with Kubernetes, Terraform\n• Strong Linux skills', responsibilities: '• Design fault-tolerant cloud infrastructure\n• Automate deployment pipelines\n• Incident response and root cause analysis\n• Capacity planning and cost optimization', skills: 'AWS,Kubernetes,Terraform,Docker,Linux,Python', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-09-01') },
        { title: 'Backend Engineer - Payments', company: 'Stripe', company_logo: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=64', location: 'San Francisco, CA', type: 'Full-Time', work_mode: 'Hybrid', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 175000, salary_max: 275000, currency: 'USD', description: 'Build the financial infrastructure that processes hundreds of billions of dollars annually for millions of businesses worldwide. Your code will handle real money at massive scale.', requirements: '• 5+ years backend experience\n• Experience with high-throughput systems\n• Understanding of financial systems\n• Proficiency in Ruby, Go, or Java', responsibilities: '• Build payment processing infrastructure\n• Design APIs used by millions of developers\n• Ensure 99.99% uptime for critical systems\n• Work with compliance and security teams', skills: 'Ruby,Go,Java,PostgreSQL,Redis,gRPC', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-08-15') },
        { title: 'Data Engineer', company: 'Netflix', company_logo: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=64', location: 'Los Gatos, CA', type: 'Full-Time', work_mode: 'Remote', category: DS, category_name: 'Data Science', category_icon: '📊', salary_min: 155000, salary_max: 240000, currency: 'USD', description: 'Build the data platform that powers recommendations, content decisions, and business insights for 230+ million subscribers worldwide.', requirements: '• 3+ years data engineering\n• Strong SQL and Python skills\n• Experience with Spark, Kafka\n• Knowledge of data warehousing', responsibilities: '• Build and maintain data pipelines\n• Design data models\n• Collaborate with ML teams\n• Ensure data quality and governance', skills: 'Python,Spark,Kafka,SQL,Airflow,Flink', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-07-20') },
        { title: 'Autopilot Software Engineer', company: 'Tesla', company_logo: 'https://www.google.com/s2/favicons?domain=tesla.com&sz=64', location: 'Palo Alto, CA', type: 'Full-Time', work_mode: 'On-site', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 160000, salary_max: 260000, currency: 'USD', description: 'Work on Tesla\'s Autopilot and Full Self-Driving systems — some of the most challenging and impactful real-time embedded software in the world.', requirements: '• Experience in C++ and real-time systems\n• Computer vision or ML background preferred\n• Embedded systems experience\n• Strong fundamentals in algorithms', responsibilities: '• Develop Autopilot perception and planning\n• Optimize algorithms for embedded hardware\n• Work with hardware and ML teams\n• Conduct real-world testing', skills: 'C++,Python,CUDA,Computer Vision,ROS,Linux', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-09-15') },
        { title: 'Research Scientist - AI Safety', company: 'DeepMind', company_logo: 'https://www.google.com/s2/favicons?domain=deepmind.com&sz=64', location: 'London, UK', type: 'Full-Time', work_mode: 'Hybrid', category: AI, category_name: 'AI & Machine Learning', category_icon: '🤖', salary_min: 120000, salary_max: 220000, currency: 'GBP', description: 'Conduct fundamental research to ensure AI systems remain safe, aligned, and beneficial as they become more capable. Your work will directly shape the future of AI development.', requirements: '• PhD in ML, CS, or related field\n• Strong publication record\n• Expertise in RL or alignment research\n• Excellent communication skills', responsibilities: '• Lead original research projects\n• Publish in top venues (NeurIPS, ICML)\n• Collaborate with policy teams\n• Mentor junior researchers', skills: 'Python,JAX,TensorFlow,Reinforcement Learning,Research', experience_level: 'Lead', is_featured: true, deadline: new Date('2025-10-01') },
        { title: 'Software Engineer - Azure', company: 'Microsoft', company_logo: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=64', location: 'Redmond, WA', type: 'Full-Time', work_mode: 'Hybrid', category: DO, category_name: 'DevOps & Cloud', category_icon: '☁️', salary_min: 145000, salary_max: 235000, currency: 'USD', description: 'Build Azure cloud services used by enterprises across the globe. Help shape the future of enterprise computing and developer tools.', requirements: '• 3+ years in cloud/distributed systems\n• Experience with Azure or AWS\n• Proficiency in C#, Java, or Python\n• Familiarity with containerization', responsibilities: '• Develop Azure platform features\n• Ensure service reliability\n• Work with enterprise customers\n• Drive technical roadmaps', skills: 'C#,.NET,Azure,Kubernetes,Terraform,Python', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-08-30') },
        { title: 'Software Engineer Internship', company: 'Airbnb', company_logo: 'https://www.google.com/s2/favicons?domain=airbnb.com&sz=64', location: 'San Francisco, CA', type: 'Internship', work_mode: 'Hybrid', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 8000, salary_max: 10000, currency: 'USD', description: 'Build features used by millions of hosts and guests across 220+ countries. Work on challenging engineering problems at scale.', requirements: '• Currently pursuing CS or related degree\n• Strong programming fundamentals\n• Experience in web development\n• Available for 12-week internship', responsibilities: '• Work on a real product team\n• Ship features to production\n• Participate in code reviews\n• Get mentorship from senior engineers', skills: 'React,Ruby on Rails,GraphQL,SQL', experience_level: 'Entry Level', is_featured: true, deadline: new Date('2025-05-31') },
        { title: 'Blockchain Engineer', company: 'Coinbase', company_logo: 'https://www.google.com/s2/favicons?domain=coinbase.com&sz=64', location: 'Remote', type: 'Full-Time', work_mode: 'Remote', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 165000, salary_max: 245000, currency: 'USD', description: 'Build the secure infrastructure that handles billions in crypto transactions for millions of customers. Help bring crypto to the next billion users.', requirements: '• 4+ years backend engineering\n• Interest/knowledge of blockchain tech\n• Experience with Go or Node.js\n• Security-first mindset', responsibilities: '• Build blockchain integrations\n• Develop secure wallet infrastructure\n• Design APIs for crypto operations\n• Ensure regulatory compliance', skills: 'Go,TypeScript,Node.js,PostgreSQL,Redis,Solidity', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-07-15') },
        { title: 'Android Developer', company: 'Uber', company_logo: 'https://www.google.com/s2/favicons?domain=uber.com&sz=64', location: 'San Francisco, CA', type: 'Full-Time', work_mode: 'Hybrid', category: MOB, category_name: 'Mobile Development', category_icon: '📱', salary_min: 145000, salary_max: 230000, currency: 'USD', description: 'Build the Android app that millions of riders and drivers rely on every day. Work on complex real-time mapping, navigation, and payment features.', requirements: '• 3+ years Android development\n• Expert in Kotlin and Jetpack\n• Experience with real-time systems\n• Strong understanding of MVVM', responsibilities: '• Develop core Android rider app features\n• Build real-time location tracking\n• Optimize app performance\n• A/B test new features', skills: 'Kotlin,Java,Android SDK,Jetpack Compose,Room,RxJava', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-08-01') },
        { title: 'Senior UX Designer', company: 'Adobe', company_logo: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=64', location: 'San Jose, CA', type: 'Full-Time', work_mode: 'Hybrid', category: DES, category_name: 'Product Design', category_icon: '🎨', salary_min: 130000, salary_max: 200000, currency: 'USD', description: 'Shape the design of creative tools used by millions of designers, photographers, and artists worldwide. Create experiences that empower creative expression.', requirements: '• 5+ years UX/product design\n• Expert Figma skills\n• Strong portfolio demonstrating complex product design\n• Experience with design systems', responsibilities: '• Lead design for Adobe Creative Cloud features\n• Create and maintain design systems\n• Conduct user research\n• Collaborate with engineering teams', skills: 'Figma,Adobe XD,Prototyping,User Research,Design Systems', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-09-30') },
        { title: 'Product Manager - LinkedIn', company: 'LinkedIn', company_logo: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=64', location: 'Sunnyvale, CA', type: 'Full-Time', work_mode: 'Hybrid', category: PM, category_name: 'Product Management', category_icon: '📋', salary_min: 160000, salary_max: 250000, currency: 'USD', description: 'Define the product vision for LinkedIn\'s core professional networking and jobs features. Help create economic opportunity for every member globally.', requirements: '• 5+ years product management\n• Experience with consumer-scale products\n• Strong analytical skills\n• Excellent communication and leadership', responsibilities: '• Define product roadmap and strategy\n• Lead cross-functional teams\n• Analyze user data to drive decisions\n• Work with engineering, design, and data science', skills: 'Product Strategy,SQL,A/B Testing,Roadmapping,Analytics', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-08-15') },
        { title: 'Salesforce Developer', company: 'Salesforce', company_logo: 'https://www.google.com/s2/favicons?domain=salesforce.com&sz=64', location: 'San Francisco, CA', type: 'Full-Time', work_mode: 'Remote', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 130000, salary_max: 200000, currency: 'USD', description: 'Build next-generation CRM features on the Salesforce platform that help businesses connect with their customers in entirely new ways.', requirements: '• 3+ years Salesforce development\n• Salesforce certifications preferred\n• Strong Apex and LWC skills\n• Experience with integrations', responsibilities: '• Develop custom Salesforce solutions\n• Build Lightning Web Components\n• Design Salesforce integrations\n• Support enterprise customers', skills: 'Apex,Lightning Web Components,SOQL,REST APIs,JavaScript', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-10-15') },
        { title: 'Data Science Internship', company: 'Shopify', company_logo: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=64', location: 'Ottawa, Canada', type: 'Internship', work_mode: 'Remote', category: DS, category_name: 'Data Science', category_icon: '📊', salary_min: 5000, salary_max: 7000, currency: 'CAD', description: 'Analyze data that helps millions of merchants run their businesses. Work with world-class data science teams on real problems with real impact.', requirements: '• Pursuing degree in Statistics, CS, or Math\n• Strong Python and SQL skills\n• Familiarity with ML libraries\n• Good communication skills', responsibilities: '• Analyze merchant behavior data\n• Build ML models for recommendations\n• Create dashboards and reports\n• Present findings to leadership', skills: 'Python,R,SQL,scikit-learn,Spark,Tableau', experience_level: 'Entry Level', is_featured: true, deadline: new Date('2025-05-15') },
        { title: 'Data Engineer - Data Platform', company: 'Snowflake', company_logo: 'https://www.google.com/s2/favicons?domain=snowflake.com&sz=64', location: 'Bozeman, MT', type: 'Full-Time', work_mode: 'Remote', category: DS, category_name: 'Data Science', category_icon: '📊', salary_min: 140000, salary_max: 210000, currency: 'USD', description: 'Build the data platform that powers Snowflake\'s analytics and enables customers to access data from anywhere in the world.', requirements: '• 3+ years data engineering\n• Expert SQL and Python skills\n• Experience with Snowflake\n• Knowledge of data modeling', responsibilities: '• Build data pipelines at scale\n• Design data warehouse schemas\n• Optimize query performance\n• Build data quality frameworks', skills: 'Snowflake,Python,SQL,dbt,Airflow,Spark', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-09-15') },
        { title: 'Hardware Engineer - Semiconductors', company: 'Samsung', company_logo: 'https://www.google.com/s2/favicons?domain=samsung.com&sz=64', location: 'Austin, TX', type: 'Full-Time', work_mode: 'On-site', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 120000, salary_max: 190000, currency: 'USD', description: 'Design next-generation semiconductor chips and embedded systems that power Samsung\'s global lineup of consumer electronics.', requirements: '• BS/MS in Electrical Engineering\n• Experience with VLSI design\n• Proficiency in Verilog/VHDL\n• Knowledge of ASIC design flow', responsibilities: '• RTL design and implementation\n• Functional verification\n• Silicon bring-up and debug\n• Collaborate with global teams', skills: 'Verilog,VHDL,ASIC,FPGA,C,Python', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-10-31') },
        { title: 'Growth Marketing Manager', company: 'HubSpot', company_logo: 'https://www.google.com/s2/favicons?domain=hubspot.com&sz=64', location: 'Cambridge, MA', type: 'Full-Time', work_mode: 'Hybrid', category: MKT, category_name: 'Marketing', category_icon: '📣', salary_min: 100000, salary_max: 150000, currency: 'USD', description: 'Drive growth for HubSpot\'s global customer base through data-driven marketing strategies across multiple channels.', requirements: '• 4+ years growth marketing\n• Strong analytical skills and SQL\n• Experience with paid acquisition\n• Track record of measurable growth', responsibilities: '• Develop and execute growth strategies\n• Manage paid acquisition campaigns\n• Optimize conversion funnels\n• Report on KPIs and ROI', skills: 'Google Ads,Facebook Ads,SQL,HubSpot,Analytics,SEO', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-09-01') },
        { title: 'Security Engineer', company: 'CrowdStrike', company_logo: 'https://www.google.com/s2/favicons?domain=crowdstrike.com&sz=64', location: 'Austin, TX', type: 'Full-Time', work_mode: 'Remote', category: SEC, category_name: 'Cybersecurity', category_icon: '🔒', salary_min: 150000, salary_max: 230000, currency: 'USD', description: 'Protect organizations from nation-state actors and sophisticated threat groups. Build and deploy security systems at the forefront of cybersecurity.', requirements: '• 4+ years in cybersecurity\n• Strong knowledge of attack techniques\n• Experience with EDR systems\n• Relevant certifications (CISSP, CEH)', responsibilities: '• Research emerging threat landscape\n• Build detection and response systems\n• Conduct threat hunting\n• Respond to security incidents', skills: 'Python,SIEM,Threat Intelligence,Malware Analysis,Cloud Security', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-08-30') },
        { title: 'Backend Engineer - Podcast Platform', company: 'Spotify', company_logo: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=64', location: 'Stockholm, Sweden', type: 'Full-Time', work_mode: 'Hybrid', category: SE, category_name: 'Software Engineering', category_icon: '💻', salary_min: 90000, salary_max: 150000, currency: 'SEK', description: 'Build the backend systems that serve music and podcasts to 500+ million users worldwide. Work on recommendation engines, streaming infrastructure, and content delivery.', requirements: '• 3+ years backend engineering\n• Experience with high-traffic systems\n• Proficiency in Java or Python\n• Knowledge of event-driven architectures', responsibilities: '• Build podcast platform APIs\n• Develop recommendation algorithms\n• Scale infrastructure for global traffic\n• A/B test new features', skills: 'Java,Python,Kafka,Kubernetes,PostgreSQL,Cassandra', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-07-31') },
        { title: 'UI/UX Design Internship', company: 'Figma', company_logo: 'https://www.google.com/s2/favicons?domain=figma.com&sz=64', location: 'San Francisco, CA', type: 'Internship', work_mode: 'Hybrid', category: DES, category_name: 'Product Design', category_icon: '🎨', salary_min: 7000, salary_max: 9000, currency: 'USD', description: 'Design the next version of the tool used by over 4 million designers worldwide. Shape the future of collaborative design.', requirements: '• Pursuing design or CS degree\n• Expert-level Figma skills\n• Strong portfolio of design work\n• Passion for developer tools', responsibilities: '• Design new features for Figma editor\n• Conduct usability research\n• Collaborate with Figma\'s product team\n• Ship designs to production', skills: 'Figma,Prototyping,User Research,Design Thinking', experience_level: 'Entry Level', is_featured: true, deadline: new Date('2025-06-30') },
        { title: 'Product Designer - Collaboration', company: 'Notion', company_logo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64', location: 'Remote', type: 'Full-Time', work_mode: 'Remote', category: DES, category_name: 'Product Design', category_icon: '🎨', salary_min: 120000, salary_max: 180000, currency: 'USD', description: 'Shape the design of Notion\'s collaboration and productivity features used by over 30 million users. Join a world-class design team building the future of work tools.', requirements: '• 3+ years product design\n• Strong Figma skills\n• Experience with productivity or collaboration tools\n• Excellent design portfolio', responsibilities: '• Own design for core collaboration features\n• Conduct user research and testing\n• Build and maintain design system\n• Partner closely with engineering', skills: 'Figma,User Research,Design Systems,Prototyping,Animation', experience_level: 'Mid Level', is_featured: false, deadline: new Date('2025-09-30') },
        { title: 'Quantitative Analyst', company: 'Goldman Sachs', company_logo: 'https://www.google.com/s2/favicons?domain=goldmansachs.com&sz=64', location: 'New York, NY', type: 'Full-Time', work_mode: 'On-site', category: FIN, category_name: 'Finance', category_icon: '🏦', salary_min: 150000, salary_max: 300000, currency: 'USD', description: 'Develop quantitative models and strategies for trading, risk management, and investment decisions at one of the world\'s leading investment banks.', requirements: '• PhD in Mathematics, Physics, or CS\n• Strong programming skills (Python, C++)\n• Experience with financial modeling\n• Knowledge of derivatives pricing', responsibilities: '• Develop quantitative trading strategies\n• Build risk models\n• Research new algorithmic approaches\n• Collaborate with traders', skills: 'Python,C++,R,Statistics,Machine Learning,Financial Modeling', experience_level: 'Senior', is_featured: false, deadline: new Date('2025-08-01') },
      ]);
      console.log('✅ Seeded 25 jobs');
    }

    // ── Users ──
    const userCount = await User.countDocuments();
    const adminEmail = 'admin@jobpulse.com';
    const bcrypt = require('bcryptjs');
    const adminHash = bcrypt.hashSync('Admin@JobPulse1', 10);

    // Always ensure the main admin account is correctly set
    await User.findOneAndUpdate(
      { email: adminEmail },
      { 
        full_name: 'khushi srivastav',
        password_hash: adminHash,
        role: 'admin',
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null
      },
      { upsert: true, new: true }
    );
    console.log('✅ Admin account ensured');

    if (userCount === 0) {
      const userHash = bcrypt.hashSync('JobPulse@1', 10);
      const demoHash = bcrypt.hashSync('Demo@1234', 10);

      await User.insertMany([
        { full_name: 'Ayush Raj', email: 'ayush@jobpulse.com', password_hash: adminHash, phone: '+91-9876543210', role: 'admin' },

        // Indian users
        { full_name: 'Arjun Mehta', email: 'arjun.mehta@gmail.com', password_hash: userHash, phone: '+91-9123456789', role: 'user' },
        { full_name: 'Sneha Patel', email: 'sneha.patel@gmail.com', password_hash: userHash, phone: '+91-9234567890', role: 'user' },
        { full_name: 'Rohan Verma', email: 'rohan.verma@outlook.com', password_hash: userHash, phone: '+91-9345678901', role: 'user' },
        { full_name: 'Ananya Krishnan', email: 'ananya.k@gmail.com', password_hash: userHash, phone: '+91-9456789012', role: 'user' },
        { full_name: 'Vikram Singh', email: 'vikram.singh@yahoo.com', password_hash: userHash, phone: '+91-9567890123', role: 'user' },
        { full_name: 'Kavita Nair', email: 'kavita.nair@gmail.com', password_hash: userHash, phone: '+91-9678901234', role: 'user' },
        // American users
        { full_name: 'James Carter', email: 'james.carter@gmail.com', password_hash: userHash, phone: '+1-415-555-0192', role: 'user' },
        { full_name: 'Emily Johnson', email: 'emily.johnson@outlook.com', password_hash: userHash, phone: '+1-212-555-0147', role: 'user' },
        { full_name: 'Michael Thompson', email: 'michael.t@gmail.com', password_hash: userHash, phone: '+1-312-555-0183', role: 'user' },
        { full_name: 'Sarah Williams', email: 'sarah.w@gmail.com', password_hash: userHash, phone: '+1-650-555-0134', role: 'user' },
        // European users
        { full_name: 'Lucas Müller', email: 'lucas.muller@gmail.com', password_hash: userHash, phone: '+49-30-12345678', role: 'user' },
        { full_name: 'Sophie Dubois', email: 'sophie.dubois@gmail.com', password_hash: userHash, phone: '+33-1-23456789', role: 'user' },
        { full_name: 'Marco Rossi', email: 'marco.rossi@outlook.com', password_hash: userHash, phone: '+39-02-12345678', role: 'user' },
        // Asian users
        { full_name: 'Yuki Tanaka', email: 'yuki.tanaka@gmail.com', password_hash: userHash, phone: '+81-3-1234-5678', role: 'user' },
        { full_name: 'Wei Zhang', email: 'wei.zhang@gmail.com', password_hash: userHash, phone: '+86-10-12345678', role: 'user' },
        { full_name: 'Min-jun Lee', email: 'minjun.lee@gmail.com', password_hash: userHash, phone: '+82-2-1234-5678', role: 'user' },
        // Demo
        { full_name: 'Demo User', email: 'demo@jobpulse.com', password_hash: demoHash, phone: '+1-800-555-0100', role: 'user' },
      ]);
      console.log('✅ 19 users seeded (User password: JobPulse@1 | Admin: Admin@JobPulse1 | Demo: Demo@1234)');
    }
  } catch (err) {
    console.error('⚠️  Seed error:', err.message);
  }
}

module.exports = { User, Category, Job, Application, OtpVerification };
