const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Data helpers ──────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { tasks: [], clients: ["Yo Agencies", "Flavors", "Enjoy Hemp"] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Tasks API ─────────────────────────────────────────────────────────────

// GET all tasks (optional ?date=YYYY-MM-DD filter)
app.get("/api/tasks", (req, res) => {
  const data = loadData();
  let tasks = data.tasks;
  if (req.query.date) {
    tasks = tasks.filter((t) => t.date === req.query.date);
  }
  if (req.query.client) {
    tasks = tasks.filter((t) => t.client === req.query.client);
  }
  res.json(tasks);
});

// POST create a task
app.post("/api/tasks", (req, res) => {
  const data = loadData();
  const task = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description || "",
    client: req.body.client || "Internal",
    category: req.body.category || "General",
    status: req.body.status || "pending",
    priority: req.body.priority || "medium",
    isException: req.body.isException || false,
    date: req.body.date || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    completedAt: null,
    tags: req.body.tags || [],
  };
  data.tasks.push(task);
  saveData(data);
  res.status(201).json(task);
});

// PUT update a task
app.put("/api/tasks/:id", (req, res) => {
  const data = loadData();
  const idx = data.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });
  const updated = { ...data.tasks[idx], ...req.body };
  if (req.body.status === "done" && !data.tasks[idx].completedAt) {
    updated.completedAt = new Date().toISOString();
  }
  data.tasks[idx] = updated;
  saveData(data);
  res.json(updated);
});

// DELETE a task
app.delete("/api/tasks/:id", (req, res) => {
  const data = loadData();
  data.tasks = data.tasks.filter((t) => t.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// ─── Stats API ──────────────────────────────────────────────────────────────

app.get("/api/stats", (req, res) => {
  const data = loadData();
  const today = new Date().toISOString().split("T")[0];
  const todayTasks = data.tasks.filter((t) => t.date === today);

  // Last 7 days
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayTasks = data.tasks.filter((t) => t.date === dateStr);
    last7.push({
      date: dateStr,
      total: dayTasks.length,
      done: dayTasks.filter((t) => t.status === "done").length,
      exceptions: dayTasks.filter((t) => t.isException).length,
    });
  }

  // Per-client breakdown
  const clientStats = {};
  data.clients.forEach((c) => {
    const clientTasks = data.tasks.filter((t) => t.client === c);
    clientStats[c] = {
      total: clientTasks.length,
      done: clientTasks.filter((t) => t.status === "done").length,
      pending: clientTasks.filter((t) => t.status === "pending").length,
    };
  });

  res.json({
    today: {
      total: todayTasks.length,
      done: todayTasks.filter((t) => t.status === "done").length,
      pending: todayTasks.filter((t) => t.status === "pending").length,
      exceptions: todayTasks.filter((t) => t.isException).length,
    },
    last7Days: last7,
    clientStats,
    allTime: {
      total: data.tasks.length,
      done: data.tasks.filter((t) => t.status === "done").length,
      exceptions: data.tasks.filter((t) => t.isException).length,
    },
  });
});

// ─── Clients API ────────────────────────────────────────────────────────────

app.get("/api/clients", (req, res) => {
  const data = loadData();
  res.json(data.clients);
});

app.post("/api/clients", (req, res) => {
  const data = loadData();
  if (!data.clients.includes(req.body.name)) {
    data.clients.push(req.body.name);
    saveData(data);
  }
  res.json(data.clients);
});

// ─── Ping (for Render cron keep-alive) ─────────────────────────────────────

app.get("/ping", (req, res) => res.json({ status: "alive", time: new Date().toISOString() }));

// ─── Catch-all → serve frontend ────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🎨 Picasso Tracker running on port ${PORT}`);
});
