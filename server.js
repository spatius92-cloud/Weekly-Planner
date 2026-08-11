const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { readDB, writeDB } = require('./lib/db');
const { sendWhatsApp } = require('./lib/notify');
const { assignedMessage, statusChangedMessage, reminderMessage, digestMessage } = require('./lib/messages');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

const STATUSES = ['pending', 'in-progress', 'completed'];
const COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FDCB6E', '#E84393', '#00CEC9', '#D63031'];
const PHONE_RE = /^\+[1-9]\d{7,14}$/; // E.164, e.g. +14155552671

function isValidPhone(phone) {
  return PHONE_RE.test(phone);
}

// --- members ---------------------------------------------------------------

app.get('/api/state', async (req, res) => {
  try {
    const db = await readDB();
    res.json(db);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load planner data.' });
  }
});

app.post('/api/members', async (req, res) => {
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  if (!name) return res.status(400).json({ error: 'Member name is required.' });
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'WhatsApp number must be in international format, e.g. +14155552671.' });
  }

  const db = await readDB();
  if (db.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'A member with that name already exists.' });
  }
  const member = {
    id: id('m'),
    name,
    phone,
    color: COLORS[db.members.length % COLORS.length],
  };
  db.members.push(member);
  await writeDB(db);
  res.status(201).json(member);
});

app.patch('/api/members/:id', async (req, res) => {
  const db = await readDB();
  const member = db.members.find((m) => m.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  if (req.body.phone !== undefined) {
    const phone = (req.body.phone || '').trim();
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'WhatsApp number must be in international format, e.g. +14155552671.' });
    }
    member.phone = phone;
  }
  if (req.body.name !== undefined) {
    const name = req.body.name.trim();
    if (!name) return res.status(400).json({ error: 'Member name cannot be empty.' });
    member.name = name;
  }

  await writeDB(db);
  res.json(member);
});

app.delete('/api/members/:id', async (req, res) => {
  const db = await readDB();
  const exists = db.members.some((m) => m.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Member not found.' });

  db.members = db.members.filter((m) => m.id !== req.params.id);
  // Unassign their tasks rather than deleting them.
  db.tasks = db.tasks.map((t) =>
    t.assigneeId === req.params.id ? { ...t, assigneeId: null } : t
  );
  await writeDB(db);
  res.status(204).end();
});

// --- tasks -------------------------------------------------------------

app.post('/api/tasks', async (req, res) => {
  const { title, notes, day, weekStart, assigneeId, status, time } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required.' });
  if (typeof day !== 'number' || day < 0 || day > 6) {
    return res.status(400).json({ error: 'day must be 0 (Mon) through 6 (Sun).' });
  }
  if (!weekStart) return res.status(400).json({ error: 'weekStart (ISO date) is required.' });

  const db = await readDB();
  const now = new Date().toISOString();
  const task = {
    id: id('t'),
    title: title.trim(),
    notes: (notes || '').trim(),
    time: (time || '').trim(),
    day,
    weekStart,
    assigneeId: assigneeId || null,
    status: STATUSES.includes(status) ? status : 'pending',
    createdAt: now,
    updatedAt: now,
  };
  db.tasks.push(task);
  await writeDB(db);

  if (task.assigneeId) {
    const member = db.members.find((m) => m.id === task.assigneeId);
    if (member) sendWhatsApp(member.phone, assignedMessage(member, task));
  }

  res.status(201).json(task);
});

app.put('/api/tasks/:id', async (req, res) => {
  const db = await readDB();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const prevAssigneeId = task.assigneeId;
  const prevStatus = task.status;

  const { title, notes, day, weekStart, assigneeId, status, time } = req.body;
  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ error: 'Task title cannot be empty.' });
    task.title = title.trim();
  }
  if (notes !== undefined) task.notes = notes.trim();
  if (time !== undefined) task.time = time.trim();
  if (day !== undefined) {
    if (typeof day !== 'number' || day < 0 || day > 6) {
      return res.status(400).json({ error: 'day must be 0 (Mon) through 6 (Sun).' });
    }
    task.day = day;
  }
  if (weekStart !== undefined) task.weekStart = weekStart;
  if (assigneeId !== undefined) task.assigneeId = assigneeId;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    task.status = status;
  }
  task.updatedAt = new Date().toISOString();

  await writeDB(db);

  // Notify: reassignment takes priority over a same-request status change.
  if (task.assigneeId && task.assigneeId !== prevAssigneeId) {
    const member = db.members.find((m) => m.id === task.assigneeId);
    if (member) sendWhatsApp(member.phone, assignedMessage(member, task));
  } else if (task.status !== prevStatus && task.assigneeId) {
    const member = db.members.find((m) => m.id === task.assigneeId);
    if (member) sendWhatsApp(member.phone, statusChangedMessage(member, task));
  }

  res.json(task);
});

app.patch('/api/tasks/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const db = await readDB();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const changed = task.status !== status;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeDB(db);

  if (changed && task.assigneeId) {
    const member = db.members.find((m) => m.id === task.assigneeId);
    if (member) sendWhatsApp(member.phone, statusChangedMessage(member, task));
  }

  res.json(task);
});

app.post('/api/tasks/:id/notify', async (req, res) => {
  const db = await readDB();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!task.assigneeId) return res.status(400).json({ error: 'This activity is unassigned — nothing to notify.' });

  const member = db.members.find((m) => m.id === task.assigneeId);
  if (!member) return res.status(400).json({ error: 'Assignee not found.' });
  if (!member.phone) return res.status(400).json({ error: `${member.name} doesn't have a WhatsApp number on file.` });

  const result = await sendWhatsApp(member.phone, reminderMessage(member, task));
  if (!result.sent) {
    const message =
      result.reason === 'not_configured'
        ? 'WhatsApp isn’t configured on the server yet (missing Twilio credentials).'
        : result.message || 'Failed to send WhatsApp message.';
    return res.status(502).json({ error: message });
  }
  res.json({ sent: true });
});

app.delete('/api/tasks/:id', async (req, res) => {
  const db = await readDB();
  const exists = db.tasks.some((t) => t.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Task not found.' });

  db.tasks = db.tasks.filter((t) => t.id !== req.params.id);
  await writeDB(db);
  res.status(204).end();
});

// --- scheduled digests -------------------------------------------------
// Triggered by Vercel Cron (see vercel.json). Guarded by CRON_SECRET when set
// — Vercel signs cron requests with `Authorization: Bearer <CRON_SECRET>`.

function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (e.g. manual testing)
  return req.get('authorization') === `Bearer ${secret}`;
}

function currentMondayISO() {
  const d = new Date();
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

app.get('/api/cron/daily-digest', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).end();

  const db = await readDB();
  const weekStart = currentMondayISO();
  const todayIndex = (new Date().getUTCDay() + 6) % 7; // 0 = Mon .. 6 = Sun

  const results = [];
  for (const member of db.members) {
    if (!member.phone) continue;
    const tasks = db.tasks.filter(
      (t) => t.assigneeId === member.id && t.weekStart === weekStart && t.day === todayIndex
    );
    const result = await sendWhatsApp(member.phone, digestMessage(member, tasks, { weekly: false }));
    results.push({ member: member.name, ...result });
  }
  res.json({ sent: results.length, results });
});

app.get('/api/cron/weekly-digest', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).end();

  const db = await readDB();
  const weekStart = currentMondayISO();

  const results = [];
  for (const member of db.members) {
    if (!member.phone) continue;
    const tasks = db.tasks.filter((t) => t.assigneeId === member.id && t.weekStart === weekStart);
    const result = await sendWhatsApp(member.phone, digestMessage(member, tasks, { weekly: true }));
    results.push({ member: member.name, ...result });
  }
  res.json({ sent: results.length, results });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Frame & Frqnc Weekly Planner running at http://localhost:${PORT}`);
  });
}

module.exports = app;
