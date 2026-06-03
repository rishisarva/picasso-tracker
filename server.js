const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Supabase / Postgres connection ─────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  console.error("   Render → your service → Environment → Add DATABASE_URL");
  console.error("   Value: your Supabase connection string (postgresql://...)");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// ─── DB init ─────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      clients TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      is_exception BOOLEAN DEFAULT FALSE,
      date TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS permanent_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      clients TEXT[] DEFAULT '{}',
      priority TEXT DEFAULT 'medium',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_completions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES permanent_tasks(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      UNIQUE(task_id, date)
    );
  `);
  console.log("✅ DB tables ready");
}

// ─── TASKS API ───────────────────────────────────────────────────────────────

app.get("/api/tasks", async (req, res) => {
  try {
    let query = "SELECT * FROM tasks";
    const params = [];
    const conditions = [];
    if (req.query.date) { conditions.push(`date = $${params.length+1}`); params.push(req.query.date); }
    if (req.query.client) { conditions.push(`$${params.length+1} = ANY(clients)`); params.push(req.query.client); }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC";
    const { rows } = await pool.query(query, params);
    res.json(rows.map(normalizeTask));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const id = uuidv4();
    const clients = Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients || "AEO Agency"];
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, title, description, clients, status, priority, is_exception, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, req.body.title, req.body.description || "", clients,
       req.body.status || "pending", req.body.priority || "medium",
       req.body.isException || false,
       req.body.date || new Date().toISOString().split("T")[0]]
    );
    res.status(201).json(normalizeTask(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { rows: existing } = await pool.query("SELECT * FROM tasks WHERE id=$1", [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    const t = existing[0];
    const clients = req.body.clients !== undefined
      ? (Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients])
      : t.clients;
    const completedAt = req.body.status === "done" && !t.completed_at ? new Date().toISOString() : t.completed_at;
    const { rows } = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, clients=$3, status=$4, priority=$5, is_exception=$6, date=$7, completed_at=$8 WHERE id=$9 RETURNING *`,
      [req.body.title??t.title, req.body.description??t.description, clients,
       req.body.status??t.status, req.body.priority??t.priority,
       req.body.isException??t.is_exception, req.body.date??t.date, completedAt, req.params.id]
    );
    res.json(normalizeTask(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tasks WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STATS API ───────────────────────────────────────────────────────────────

app.get("/api/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { rows } = await pool.query("SELECT * FROM tasks");
    const allTasks = rows.map(normalizeTask);
    const todayTasks = allTasks.filter(t => t.date === today);

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const day = allTasks.filter(t => t.date === ds);
      last7.push({ date: ds, total: day.length, done: day.filter(t => t.status==="done").length, exceptions: day.filter(t => t.isException).length });
    }

    const CLIENTS = ["AEO Agency", "Flavors", "Enjoy Hemp"];
    const clientStats = {};
    CLIENTS.forEach(c => {
      const ct = allTasks.filter(t => t.clients.includes(c));
      clientStats[c] = { total: ct.length, done: ct.filter(t=>t.status==="done").length, pending: ct.filter(t=>t.status==="pending").length };
    });

    res.json({
      today: { total: todayTasks.length, done: todayTasks.filter(t=>t.status==="done").length, pending: todayTasks.filter(t=>t.status==="pending").length, exceptions: todayTasks.filter(t=>t.isException).length },
      last7Days: last7, clientStats,
      allTime: { total: allTasks.length, done: allTasks.filter(t=>t.status==="done").length, exceptions: allTasks.filter(t=>t.isException).length },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PERMANENT TASKS API ─────────────────────────────────────────────────────

app.get("/api/permanent-tasks/history", async (req, res) => {
  try {
    const { rows: total } = await pool.query("SELECT COUNT(*) as count FROM permanent_tasks");
    const totalCount = parseInt(total[0].count);
    const history = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const { rows } = await pool.query("SELECT COUNT(*) as count FROM daily_completions WHERE date=$1", [ds]);
      history.push({ date: ds, done: parseInt(rows[0].count), total: totalCount });
    }
    res.json(history);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/permanent-tasks", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { rows: tasks } = await pool.query("SELECT * FROM permanent_tasks ORDER BY created_at ASC");
    const { rows: done } = await pool.query("SELECT task_id FROM daily_completions WHERE date=$1", [today]);
    const doneIds = new Set(done.map(r => r.task_id));
    res.json(tasks.map(t => ({ ...normalizePermanent(t), doneToday: doneIds.has(t.id) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/permanent-tasks", async (req, res) => {
  try {
    const id = uuidv4();
    const clients = Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients || "AEO Agency"];
    const { rows } = await pool.query(
      `INSERT INTO permanent_tasks (id, title, description, clients, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, req.body.title, req.body.description || "", clients, req.body.priority || "medium"]
    );
    res.status(201).json(normalizePermanent(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/permanent-tasks/:id", async (req, res) => {
  try {
    const { rows: existing } = await pool.query("SELECT * FROM permanent_tasks WHERE id=$1", [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    const t = existing[0];
    const clients = req.body.clients !== undefined
      ? (Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients])
      : t.clients;
    const { rows } = await pool.query(
      `UPDATE permanent_tasks SET title=$1, description=$2, clients=$3, priority=$4 WHERE id=$5 RETURNING *`,
      [req.body.title??t.title, req.body.description??t.description, clients, req.body.priority??t.priority, req.params.id]
    );
    res.json(normalizePermanent(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/permanent-tasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM permanent_tasks WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/permanent-tasks/:id/toggle", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { rows } = await pool.query("SELECT id FROM daily_completions WHERE task_id=$1 AND date=$2", [req.params.id, today]);
    if (rows.length) {
      await pool.query("DELETE FROM daily_completions WHERE task_id=$1 AND date=$2", [req.params.id, today]);
      res.json({ doneToday: false });
    } else {
      await pool.query("INSERT INTO daily_completions (id, task_id, date) VALUES ($1,$2,$3)", [uuidv4(), req.params.id, today]);
      res.json({ doneToday: true });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeTask(r) {
  return { id: r.id, title: r.title, description: r.description, clients: r.clients || [], client: (r.clients||[])[0] || "AEO Agency", status: r.status, priority: r.priority, isException: r.is_exception, date: r.date, createdAt: r.created_at, completedAt: r.completed_at };
}
function normalizePermanent(r) {
  return { id: r.id, title: r.title, description: r.description, clients: r.clients || [], client: (r.clients||[])[0] || "AEO Agency", priority: r.priority, createdAt: r.created_at };
}

// ─── Ping ────────────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status: "alive", time: new Date().toISOString() }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ─── Start ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🎨 Picasso Tracker running on port ${PORT}`));
}).catch(err => {
  console.error("❌ DB init failed:", err.message);
  console.error("   Check your DATABASE_URL is correct in Render environment variables.");
  process.exit(1);
});
