const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// On Render with a disk mounted at /data, use that. Otherwise use local dir.
const DATA_DIR = fs.existsSync("/data") ? "/data" : path.join(__dirname);
const DATA_FILE = path.join(DATA_DIR, "picasso-data.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Data helpers ─────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      tasks: [],
      permanentTasks: [],
      dailyCompletions: {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    if (!data.permanentTasks) data.permanentTasks = [];
    if (!data.dailyCompletions) data.dailyCompletions = {};
    return data;
  } catch (e) {
    console.error("Data file corrupt, resetting:", e.message);
    const seed = { tasks: [], permanentTasks: [], dailyCompletions: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

console.log(`📁 Data file: ${DATA_FILE}`);

// ─── TASKS API ────────────────────────────────────────────────────────────────

app.get("/api/tasks", (req, res) => {
  const data = loadData();
  let tasks = data.tasks;
  if (req.query.date) tasks = tasks.filter(t => t.date === req.query.date);
  if (req.query.client) tasks = tasks.filter(t => (t.clients||[]).includes(req.query.client));
  res.json(tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post("/api/tasks", (req, res) => {
  const data = loadData();
  const clients = Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients || "AEO Agency"];
  const task = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description || "",
    clients,
    client: clients[0],
    status: req.body.status || "pending",
    priority: req.body.priority || "medium",
    isException: req.body.isException || false,
    date: req.body.date || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  data.tasks.push(task);
  saveData(data);
  res.status(201).json(task);
});

app.put("/api/tasks/:id", (req, res) => {
  const data = loadData();
  const idx = data.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const t = data.tasks[idx];
  const clients = req.body.clients !== undefined
    ? (Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients])
    : t.clients;
  const updated = {
    ...t, ...req.body, clients, client: clients[0],
    completedAt: req.body.status === "done" && !t.completedAt ? new Date().toISOString() : t.completedAt,
  };
  data.tasks[idx] = updated;
  saveData(data);
  res.json(updated);
});

app.delete("/api/tasks/:id", (req, res) => {
  const data = loadData();
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// ─── STATS API ────────────────────────────────────────────────────────────────

app.get("/api/stats", (req, res) => {
  const data = loadData();
  const today = new Date().toISOString().split("T")[0];
  const todayTasks = data.tasks.filter(t => t.date === today);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const day = data.tasks.filter(t => t.date === ds);
    last7.push({ date: ds, total: day.length, done: day.filter(t => t.status === "done").length, exceptions: day.filter(t => t.isException).length });
  }

  const CLIENTS = ["AEO Agency", "Flavors", "Enjoy Hemp"];
  const clientStats = {};
  CLIENTS.forEach(c => {
    const ct = data.tasks.filter(t => (t.clients||[t.client]).includes(c));
    clientStats[c] = { total: ct.length, done: ct.filter(t => t.status === "done").length, pending: ct.filter(t => t.status === "pending").length };
  });

  res.json({
    today: { total: todayTasks.length, done: todayTasks.filter(t => t.status === "done").length, pending: todayTasks.filter(t => t.status === "pending").length, exceptions: todayTasks.filter(t => t.isException).length },
    last7Days: last7, clientStats,
    allTime: { total: data.tasks.length, done: data.tasks.filter(t => t.status === "done").length, exceptions: data.tasks.filter(t => t.isException).length },
  });
});

// ─── PERMANENT TASKS API ──────────────────────────────────────────────────────

app.get("/api/permanent-tasks/history", (req, res) => {
  const data = loadData();
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const done = (data.dailyCompletions[ds] || []).length;
    history.push({ date: ds, done, total: data.permanentTasks.length });
  }
  res.json(history);
});

app.get("/api/permanent-tasks", (req, res) => {
  const data = loadData();
  const today = new Date().toISOString().split("T")[0];
  const doneToday = new Set(data.dailyCompletions[today] || []);
  res.json(data.permanentTasks.map(t => ({ ...t, doneToday: doneToday.has(t.id) })));
});

app.post("/api/permanent-tasks", (req, res) => {
  const data = loadData();
  const clients = Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients || "AEO Agency"];
  const task = { id: uuidv4(), title: req.body.title, description: req.body.description || "", clients, client: clients[0], priority: req.body.priority || "medium", createdAt: new Date().toISOString() };
  data.permanentTasks.push(task);
  saveData(data);
  res.status(201).json(task);
});

app.put("/api/permanent-tasks/:id", (req, res) => {
  const data = loadData();
  const idx = data.permanentTasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const t = data.permanentTasks[idx];
  const clients = req.body.clients !== undefined ? (Array.isArray(req.body.clients) ? req.body.clients : [req.body.clients]) : t.clients;
  data.permanentTasks[idx] = { ...t, ...req.body, clients, client: clients[0] };
  saveData(data);
  res.json(data.permanentTasks[idx]);
});

app.delete("/api/permanent-tasks/:id", (req, res) => {
  const data = loadData();
  data.permanentTasks = data.permanentTasks.filter(t => t.id !== req.params.id);
  Object.keys(data.dailyCompletions).forEach(date => {
    data.dailyCompletions[date] = data.dailyCompletions[date].filter(id => id !== req.params.id);
  });
  saveData(data);
  res.json({ success: true });
});

app.post("/api/permanent-tasks/:id/toggle", (req, res) => {
  const data = loadData();
  const today = new Date().toISOString().split("T")[0];
  if (!data.dailyCompletions[today]) data.dailyCompletions[today] = [];
  const list = data.dailyCompletions[today];
  const idx = list.indexOf(req.params.id);
  if (idx === -1) list.push(req.params.id);
  else list.splice(idx, 1);
  saveData(data);
  res.json({ doneToday: idx === -1 });
});

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────────

app.get("/api/export", (req, res) => {
  const data = loadData();
  const filename = `picasso-backup-${new Date().toISOString().split("T")[0]}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(data, null, 2));
});

app.post("/api/import", (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object") return res.status(400).json({ error: "Invalid data" });
    // Validate basic shape
    if (!Array.isArray(incoming.tasks)) return res.status(400).json({ error: "Missing tasks array" });
    const merged = {
      tasks: incoming.tasks || [],
      permanentTasks: incoming.permanentTasks || [],
      dailyCompletions: incoming.dailyCompletions || {},
    };
    saveData(merged);
    res.json({ success: true, tasks: merged.tasks.length, permanentTasks: merged.permanentTasks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Ping ─────────────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => res.json({ status: "alive", time: new Date().toISOString() }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`🎨 Picasso Tracker running on port ${PORT}`));
