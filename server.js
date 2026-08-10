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
// The whole read-modify-write cycle for each request is serialized through
// a promise chain, so concurrent requests can never both read the same
// on-disk snapshot and clobber each other's changes when they write back.
let queue = Promise.resolve();

async function readDB() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(db) {
  return fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

// Runs `fn(db)` with the current on-disk state, persists whatever `fn`
// mutated on `db`, and resolves to `fn`'s return value — all as one step
// that no other queued operation can interleave with.
function transact(fn) {
  const result = queue.then(async () => {
    const db = await readDB();
    const output = await fn(db);
    await writeDB(db);
    return output;
  });
  // Keep the chain alive even if this step rejects, so later requests
  // still run against a fresh read instead of getting stuck forever.
  queue = result.catch(() => {});
  return result;
}

// Same ordering guarantee as transact(), but for reads that don't mutate
// anything — so it never triggers a redundant write to disk.
function read(fn) {
  const result = queue.then(async () => {
    const db = await readDB();
    return fn ? fn(db) : db;
  });
  queue = result.catch(() => {});
  return result;
}

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

const STATUSES = ['pending', 'in-progress', 'completed'];
const COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FDCB6E', '#E84393', '#00CEC9', '#D63031'];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps a route handler so a thrown ApiError becomes the right HTTP status,
// and anything else falls back to a 500.
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong.' });
      }
    }
  };
}

// --- members ---------------------------------------------------------------

app.get('/api/state', handle(async (req, res) => {
  const db = await read();
  res.json(db);
}));

app.post('/api/members', handle(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'Member name is required.');

  const member = await transact((db) => {
    if (db.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(409, 'A member with that name already exists.');
    }
    const member = {
      id: id('m'),
      name,
      color: COLORS[db.members.length % COLORS.length],
    };
    db.members.push(member);
    return member;
  });
  res.status(201).json(member);
}));

app.delete('/api/members/:id', handle(async (req, res) => {
  await transact((db) => {
    if (!db.members.some((m) => m.id === req.params.id)) {
      throw new ApiError(404, 'Member not found.');
    }
    db.members = db.members.filter((m) => m.id !== req.params.id);
    // Unassign their tasks rather than deleting them.
    db.tasks = db.tasks.map((t) =>
      t.assigneeId === req.params.id ? { ...t, assigneeId: null } : t
    );
  });
  res.status(204).end();
}));

// --- tasks -------------------------------------------------------------

app.post('/api/tasks', handle(async (req, res) => {
  const { title, notes, day, weekStart, assigneeId, status, time } = req.body;
  if (!title || !title.trim()) throw new ApiError(400, 'Task title is required.');
  if (typeof day !== 'number' || day < 0 || day > 6) {
    throw new ApiError(400, 'day must be 0 (Mon) through 6 (Sun).');
  }
  if (!weekStart) throw new ApiError(400, 'weekStart (ISO date) is required.');

  const task = await transact((db) => {
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
    return task;
  });
  res.status(201).json(task);
}));

app.put('/api/tasks/:id', handle(async (req, res) => {
  const { title, notes, day, weekStart, assigneeId, status, time } = req.body;
  if (title !== undefined && !title.trim()) throw new ApiError(400, 'Task title cannot be empty.');
  if (day !== undefined && (typeof day !== 'number' || day < 0 || day > 6)) {
    throw new ApiError(400, 'day must be 0 (Mon) through 6 (Sun).');
  }
  if (status !== undefined && !STATUSES.includes(status)) throw new ApiError(400, 'Invalid status.');

  const task = await transact((db) => {
    const task = db.tasks.find((t) => t.id === req.params.id);
    if (!task) throw new ApiError(404, 'Task not found.');

    if (title !== undefined) task.title = title.trim();
    if (notes !== undefined) task.notes = notes.trim();
    if (time !== undefined) task.time = time.trim();
    if (day !== undefined) task.day = day;
    if (weekStart !== undefined) task.weekStart = weekStart;
    if (assigneeId !== undefined) task.assigneeId = assigneeId;
    if (status !== undefined) task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  });
  res.json(task);
}));

app.patch('/api/tasks/:id/status', handle(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new ApiError(400, 'Invalid status.');

  const task = await transact((db) => {
    const task = db.tasks.find((t) => t.id === req.params.id);
    if (!task) throw new ApiError(404, 'Task not found.');
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  });
  res.json(task);
}));

app.delete('/api/tasks/:id', handle(async (req, res) => {
  await transact((db) => {
    if (!db.tasks.some((t) => t.id === req.params.id)) {
      throw new ApiError(404, 'Task not found.');
    }
    db.tasks = db.tasks.filter((t) => t.id !== req.params.id);
  });
  res.status(204).end();
}));

app.listen(PORT, () => {
  console.log(`Frame & Frqnc Weekly Planner running at http://localhost:${PORT}`);
});
