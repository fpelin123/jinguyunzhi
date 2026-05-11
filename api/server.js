const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, 'submissions.json');
const MSG_FILE = path.join(__dirname, 'messages.json');
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

app.use(cors({ origin: '*' }));
app.use(express.json());

// Ensure data files exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}
if (!fs.existsSync(MSG_FILE)) {
  fs.writeFileSync(MSG_FILE, '[]', 'utf-8');
}
if (!fs.existsSync(SCHEDULE_FILE)) {
  const defaultSchedules = [
    {id:'b1', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-5-25', endDate:'2026-5-27', duration:'3天', price:'¥1,980', seats:8, time:'09:00-17:00'},
    {id:'b2', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-6-8', endDate:'2026-6-10', duration:'3天', price:'¥1,980', seats:12, time:'09:00-17:00'},
    {id:'b3', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-6-22', endDate:'2026-6-24', duration:'3天', price:'¥1,980', seats:10, time:'09:00-17:00'},
    {id:'b4', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-7-13', endDate:'2026-7-15', duration:'3天', price:'¥1,980', seats:14, time:'09:00-17:00'},
    {id:'b5', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-8-3', endDate:'2026-8-5', duration:'3天', price:'¥1,980', seats:10, time:'09:00-17:00'},
    {id:'b6', type:'beginner', label:'初级', name:'初级入门班', dateStr:'2026-9-14', endDate:'2026-9-16', duration:'3天', price:'¥1,980', seats:15, time:'09:00-17:00'},
    {id:'i1', type:'intermediate', label:'中级', name:'中级进阶班', dateStr:'2026-6-1', endDate:'2026-6-12', duration:'10天', price:'¥3,680', seats:6, time:'09:00-17:00'},
    {id:'i2', type:'intermediate', label:'中级', name:'中级进阶班', dateStr:'2026-7-20', endDate:'2026-7-31', duration:'10天', price:'¥3,680', seats:10, time:'09:00-17:00'},
    {id:'i3', type:'intermediate', label:'中级', name:'中级进阶班', dateStr:'2026-9-7', endDate:'2026-9-18', duration:'10天', price:'¥3,680', seats:12, time:'09:00-17:00'},
    {id:'i4', type:'intermediate', label:'中级', name:'中级进阶班', dateStr:'2026-11-2', endDate:'2026-11-13', duration:'10天', price:'¥3,680', seats:14, time:'09:00-17:00'},
    {id:'a1', type:'advanced', label:'高级', name:'高级全栈实战班', dateStr:'2026-5-25', endDate:'2026-7-4', duration:'6周', price:'¥6,880', seats:4, time:'09:00-17:00'},
    {id:'a2', type:'advanced', label:'高级', name:'高级全栈实战班', dateStr:'2026-8-17', endDate:'2026-9-26', duration:'6周', price:'¥6,880', seats:8, time:'09:00-17:00'},
    {id:'a3', type:'advanced', label:'高级', name:'高级全栈实战班', dateStr:'2026-11-9', endDate:'2026-12-19', duration:'6周', price:'¥6,880', seats:10, time:'09:00-17:00'}
  ];
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(defaultSchedules, null, 2), 'utf-8');
}

// ---- In-memory rate limiter ----
const rateMap = new Map();
const RATE_WINDOW = 10_000; // 10 seconds
const RATE_MAX = 3; // max 3 requests per window per IP

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  if (!rateMap.has(ip)) {
    rateMap.set(ip, []);
  }
  const ts = rateMap.get(ip).filter(t => now - t < RATE_WINDOW);
  if (ts.length >= RATE_MAX) {
    return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
  }
  ts.push(now);
  rateMap.set(ip, ts);
  next();
}

// ---- Phone validation ----
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

// ---- Log helper ----
function log(level, msg, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  console.log(line);
  fs.appendFileSync(path.join(__dirname, 'api.log'), line + '\n', 'utf-8');
}

// ---- Read JSON file helper ----
function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return [];
  }
}

// ========================
// POST /api/trial - save trial form submission
// ========================
app.post('/api/trial', rateLimit, (req, res) => {
  const { name, phone, age, course, wechat, message } = req.body;

  // Validation
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '请填写姓名' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ success: false, message: '请填写手机号码' });
  }
  if (!isValidPhone(phone.trim())) {
    return res.status(400).json({ success: false, message: '请输入正确的11位手机号码' });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    phone: phone.trim(),
    age: age || '',
    course: course || '',
    wechat: (wechat || '').trim(),
    message: (message || '').trim(),
    createdAt: new Date().toISOString(),
    source: 'landing-page',
    status: 'new'
  };

  const data = readJSON(DATA_FILE);
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

  log('INFO', 'New trial submission', { id: entry.id, name: entry.name, course: entry.course });
  res.json({ success: true, message: '预约成功！我们会在24小时内联系您。', id: entry.id });
});

// ========================
// GET /api/trial - list all submissions (admin)
// ========================
app.get('/api/trial', (req, res) => {
  const data = readJSON(DATA_FILE);
  res.json({ success: true, count: data.length, data: data.slice(-100).reverse() });
});

// ========================
// GET /api/trial/stats - quick stats
// ========================
app.get('/api/trial/stats', (req, res) => {
  const data = readJSON(DATA_FILE);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = data.filter(e => e.createdAt.startsWith(today)).length;
  const courseCounts = {};
  data.forEach(e => { if (e.course) courseCounts[e.course] = (courseCounts[e.course] || 0) + 1; });
  res.json({
    success: true,
    total: data.length,
    today: todayCount,
    courses: courseCounts,
    newest: data.length > 0 ? data[data.length - 1] : null
  });
});

// ========================
// POST /api/contact - general inquiry / message
// ========================
app.post('/api/contact', rateLimit, (req, res) => {
  const { name, phone, email, message } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '请填写姓名' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: '请填写留言内容' });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    message: message.trim(),
    createdAt: new Date().toISOString(),
    source: 'landing-page-contact',
    status: 'new'
  };

  const data = readJSON(MSG_FILE);
  data.push(entry);
  fs.writeFileSync(MSG_FILE, JSON.stringify(data, null, 2), 'utf-8');

  log('INFO', 'New contact message', { id: entry.id, name: entry.name });
  res.json({ success: true, message: '留言已收到，我们会尽快回复您。', id: entry.id });
});

// ========================
// GET /api/contact - list messages (admin)
// ========================
app.get('/api/contact', (req, res) => {
  const data = readJSON(MSG_FILE);
  res.json({ success: true, count: data.length, data: data.slice(-50).reverse() });
});

// ========================
// GET /api/health - health check
// ========================
app.get('/api/health', (req, res) => {
  const data = readJSON(DATA_FILE);
  res.json({ success: true, status: 'running', submissions: data.length, uptime: process.uptime().toFixed(0) + 's' });
});

// ========================
// ADMIN AUTH - simple password
// ========================
const ADMIN_PASSWORD = 'jingu2026'; // 登录密码，可修改
const ADMIN_TOKEN_PREFIX = 'jgy_';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_TOKEN_PREFIX + ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: '未授权访问' });
  }
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = ADMIN_TOKEN_PREFIX + password;
    log('INFO', 'Admin login successful');
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: '密码错误' });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ success: true, valid: true });
});

// ========================
// PATCH /api/trial/:id/status - update submission status
// ========================
app.patch('/api/trial/:id/status', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['new', 'contacted', 'enrolled', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: '无效状态值' });
  }
  const data = readJSON(DATA_FILE);
  const idx = data.findIndex(e => e.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: '记录不存在' });
  }
  data[idx].status = status;
  data[idx].updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  log('INFO', 'Status updated', { id, status });
  res.json({ success: true, message: '状态已更新' });
});

// ========================
// SCHEDULE CRUD
// ========================

// GET /api/schedule - list all schedules (public)
app.get('/api/schedule', (req, res) => {
  const data = readJSON(SCHEDULE_FILE);
  res.json({ success: true, count: data.length, data });
});

// POST /api/schedule - add new schedule (auth required)
app.post('/api/schedule', authMiddleware, (req, res) => {
  const { type, label, name, dateStr, endDate, duration, price, seats, time } = req.body;
  if (!type || !name || !dateStr || !endDate) {
    return res.status(400).json({ success: false, message: '类型、名称、开始日期和结束日期为必填项' });
  }
  const data = readJSON(SCHEDULE_FILE);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
    type, label: label || '', name, dateStr, endDate,
    duration: duration || '', price: price || '', seats: seats || 0, time: time || '09:00-17:00'
  };
  data.push(entry);
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  log('INFO', 'Schedule created', { id: entry.id, name });
  res.json({ success: true, message: '排期已添加', id: entry.id });
});

// PUT /api/schedule/:id - update schedule (auth required)
app.put('/api/schedule/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const data = readJSON(SCHEDULE_FILE);
  const idx = data.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: '排期不存在' });
  const { type, label, name, dateStr, endDate, duration, price, seats, time } = req.body;
  Object.assign(data[idx], { type, label, name, dateStr, endDate, duration, price, seats, time });
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  log('INFO', 'Schedule updated', { id });
  res.json({ success: true, message: '排期已更新' });
});

// DELETE /api/schedule/:id - delete schedule (auth required)
app.delete('/api/schedule/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  let data = readJSON(SCHEDULE_FILE);
  const idx = data.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: '排期不存在' });
  data = data.filter(e => e.id !== id);
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  log('INFO', 'Schedule deleted', { id });
  res.json({ success: true, message: '排期已删除' });
});

// ========================
// ========================
app.listen(PORT, '127.0.0.1', () => {
  console.log(`晋谷云智 API server running on http://127.0.0.1:${PORT}`);
  log('INFO', 'Server started', { port: PORT });
});
