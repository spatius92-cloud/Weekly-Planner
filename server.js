const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- tiny file-based "database" ------------------------------------------
// Writes are serialized through a promise chain so concurrent requests never
// clobber each other's changes.
let writeQueue = Promise.resolve();

async function readDB() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(db) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DB_PATH, JSON.stringify(db, null, 2))
  );
  return writeQueue;
}

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

const STATUSES = ['pending', 'in-progress', 'completed'];
const COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FDCB6E', '#E84393', '#00CEC9', '#D63031'];

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
  if (!name) return res.status(400).json({ error: 'Member name is required.' });

  const db = await readDB();
  if (db.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'A member with that name already exists.' });
  }
  const member = {
    id: id('m'),
    name,
    color: COLORS[db.members.length % COLORS.length],
  };
  db.members.push(member);
  await writeDB(db);
  res.status(201).json(member);
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
  res.status(201).json(task);
});

app.put('/api/tasks/:id', async (req, res) => {
  const db = await readDB();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

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
  res.json(task);
});

app.patch('/api/tasks/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const db = await readDB();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeDB(db);
  res.json(task);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const db = await readDB();
  const exists = db.tasks.some((t) => t.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Task not found.' });

  db.tasks = db.tasks.filter((t) => t.id !== req.params.id);
  await writeDB(db);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Frame & Frqnc Weekly Planner running at http://localhost:${PORT}`);
});
