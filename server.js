const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const APP_PORT = process.env.PORT || 3000;
const ADMIN_CODE = '86512345689124';
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TEAM_CAPACITY = { solo: 1, duo: 2, squad: 4 };

// ---------- tiny JSON "database" ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ---------- app setup ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(cookieSession({
  name: 'ffsession',
  keys: ['بدل-هاذا-بسر-طويل-وعشوائي-متاعك'],
  maxAge: 1000 * 60 * 60 * 24 * 30
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
  }),
  limits: { fileSize: 6 * 1024 * 1024 }
});

function requireAuth(req, res, next) {
  if (!req.session.username) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'دخول الإدارة مطلوب' });
  next();
}
function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------- auth ----------
app.post('/api/register', async (req, res) => {
  const { username, password, gameId, whatsapp, instagram, telegram, facebook } = req.body;
  if (!username || !password || !gameId) {
    return res.status(400).json({ error: 'لازم تعمر اسم المستخدم، كلمة السر، و ID فري فاير.' });
  }
  if (!whatsapp && !instagram && !telegram && !facebook) {
    return res.status(400).json({ error: 'لازم وسيلة تواصل وحدة على الأقل.' });
  }
  const db = readDB();
  if (db.users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'اسم المستخدم موجود من قبل.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    username, passwordHash, gameId,
    whatsapp: whatsapp || '', instagram: instagram || '', telegram: telegram || '', facebook: facebook || '',
    teamId: null, points: 0, isCommentator: false, createdAt: Date.now()
  };
  db.users.push(user);
  writeDB(db);
  req.session.username = username;
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غالطة.' });
  }
  req.session.username = username;
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.username) return res.json({ user: null });
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  res.json({ user: user ? publicUser(user) : null, isAdmin: !!req.session.isAdmin });
});

// ---------- public data ----------
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  const users = [...db.users].sort((a, b) => b.points - a.points).map(publicUser);
  const teams = [...db.teams].sort((a, b) => b.points - a.points);
  res.json({ users, teams });
});

app.get('/api/commentator', (req, res) => {
  const db = readDB();
  res.json(db.settings.commentator);
});

app.get('/api/matches', (req, res) => {
  const db = readDB();
  res.json({ matches: [...db.matches].reverse() });
});

// ---------- teams ----------
app.post('/api/team/create', requireAuth, (req, res) => {
  const { name, mode } = req.body;
  if (!name || !['solo', 'duo', 'squad'].includes(mode)) {
    return res.status(400).json({ error: 'لازم اسم فريق ونوع صحيح (فردي/ثنائي/فرقة).' });
  }
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  if (user.teamId) return res.status(400).json({ error: 'انت في فريق من قبل.' });
  if (db.teams.some(t => t.name === name)) return res.status(409).json({ error: 'اسم الفريق موجود.' });
  const team = {
    id: 't' + Date.now(), name, mode, capacity: TEAM_CAPACITY[mode],
    ownerUsername: user.username, members: [user.username],
    points: 0, inviteCode: genCode(), createdAt: Date.now()
  };
  db.teams.push(team);
  user.teamId = team.id;
  writeDB(db);
  res.json({ ok: true, team });
});

app.post('/api/team/join', requireAuth, (req, res) => {
  const { inviteCode } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  if (user.teamId) return res.status(400).json({ error: 'انت في فريق من قبل.' });
  const team = db.teams.find(t => t.inviteCode === (inviteCode || '').toUpperCase());
  if (!team) return res.status(404).json({ error: 'كود الدعوة غالط.' });
  if (team.members.length >= team.capacity) return res.status(400).json({ error: 'الفريق كامل.' });
  team.members.push(user.username);
  user.teamId = team.id;
  writeDB(db);
  res.json({ ok: true, team });
});

app.get('/api/team/mine', requireAuth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  const team = db.teams.find(t => t.id === user.teamId) || null;
  res.json({ team });
});

app.post('/api/team/leave', requireAuth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  const team = db.teams.find(t => t.id === user.teamId);
  if (team) team.members = team.members.filter(m => m !== user.username);
  user.teamId = null;
  writeDB(db);
  res.json({ ok: true });
});

// ---------- matches ----------
app.post('/api/match/create', requireAuth, (req, res) => {
  const { type, opponent } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === req.session.username);
  if (!opponent) return res.status(400).json({ error: 'اختار خصم.' });
  let side1;
  if (type === 'team') {
    const team = db.teams.find(t => t.id === user.teamId);
    if (!team) return res.status(400).json({ error: 'لازم تكون في فريق.' });
    side1 = team.name;
  } else {
    side1 = user.username;
  }
  const match = {
    id: 'm' + Date.now(), type, side1, side2: opponent,
    status: 'pending', winner: null, proofImage: null, createdBy: user.username, createdAt: Date.now()
  };
  db.matches.push(match);
  writeDB(db);
  res.json({ ok: true, match });
});

app.post('/api/match/:id/proof', requireAuth, upload.single('photo'), (req, res) => {
  const db = readDB();
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'التحدي غير موجود.' });
  if (!req.file) return res.status(400).json({ error: 'لازم صورة.' });
  match.proofImage = '/uploads/' + req.file.filename;
  writeDB(db);
  res.json({ ok: true, match });
});

// ---------- admin ----------
app.post('/api/admin/login', (req, res) => {
  if (req.body.code === ADMIN_CODE) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'كود غالط.' });
});

app.get('/api/admin/data', requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db);
});

app.post('/api/admin/match/:id/resolve', requireAdmin, (req, res) => {
  const { winner } = req.body;
  const db = readDB();
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'التحدي غير موجود.' });
  match.status = 'done';
  match.winner = winner;
  if (match.type === 'team') {
    const t = db.teams.find(t => t.name === winner);
    if (t) t.points += 3;
  } else {
    const u = db.users.find(u => u.username === winner);
    if (u) u.points += 3;
  }
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/admin/user/:username/points', requireAdmin, (req, res) => {
  const { points } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'غير موجود.' });
  user.points = Number(points) || 0;
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/user/:username', requireAdmin, (req, res) => {
  const db = readDB();
  db.users = db.users.filter(u => u.username !== req.params.username);
  db.teams.forEach(t => { t.members = t.members.filter(m => m !== req.params.username); });
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/team/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const team = db.teams.find(t => t.id === req.params.id);
  if (team) db.users.forEach(u => { if (u.teamId === team.id) u.teamId = null; });
  db.teams = db.teams.filter(t => t.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/match/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.matches = db.matches.filter(m => m.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/admin/commentator', requireAdmin, (req, res) => {
  const { name, handle, live } = req.body;
  const db = readDB();
  db.settings.commentator = { name: name || 'المعلق الرسمي', handle: handle || '', live: !!live };
  writeDB(db);
  res.json({ ok: true, commentator: db.settings.commentator });
});

app.listen(APP_PORT, () => {
  console.log(`بطلة فري فاير تعمل على http://localhost:${APP_PORT}`);
});
