# 🎨 Picasso Tracker

CEO task tracker for **Web of Picasso** — tracks daily tasks across clients (Yo Agencies, Flavors, Enjoy Hemp) with stats, exceptions, and a full dashboard.

---

## 🚀 Deploy to Render (Free)

### Step 1 — Push to GitHub

1. Create a new GitHub repo (e.g. `picasso-tracker`)
2. Push this folder to it:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/picasso-tracker.git
git push -u origin main
```

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - **Plan**: Free
5. Click **Deploy**

✅ Your app will be live at: `https://picasso-tracker.onrender.com`

---

## 🔔 Keep-Alive Cron (Prevents Render Free Tier Sleep)

Render's free tier spins down after 15 minutes of inactivity. To keep it alive:

### Option A — cron-job.org (Recommended, Free)

1. Go to [cron-job.org](https://cron-job.org) and create a free account
2. Create a new cronjob:
   - **URL**: `https://picasso-tracker.onrender.com/ping`
   - **Schedule**: Every 10 minutes
   - **Method**: GET
3. Save — your app will stay awake 24/7

### Option B — GitHub Actions (Also Free)

Create `.github/workflows/keepalive.yml` in your repo:

```yaml
name: Keep Alive
on:
  schedule:
    - cron: '*/10 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://picasso-tracker.onrender.com/ping
```

---

## 🌐 Use in Chrome (Anywhere)

### Bookmark it
Just bookmark `https://picasso-tracker.onrender.com` in Chrome for one-click access.

### Install as PWA (feels like a native app)
1. Open the URL in Chrome
2. Click the **⊕** icon in the address bar → "Install Picasso Tracker"
3. It opens in its own window, no browser UI, like a desktop app!

---

## 📋 Features

- ✅ Add, edit, delete tasks
- ✅ Mark done/undone with one click
- ✅ Clients: Yo Agencies, Flavors, Enjoy Hemp, Internal
- ✅ Categories: Internal Linking, SEO, Content, Strategy, etc.
- ✅ Priority levels (High / Medium / Low)
- ✅ Exception flag for out-of-ordinary tasks
- ✅ Date picker — view any day's tasks
- ✅ Today's stats in right sidebar
- ✅ 7-day bar chart
- ✅ Per-client progress bars
- ✅ All-time stats
- ✅ Fully persistent (saves to `data.json` on server)

---

## 🛠 Local Development

```bash
npm install
npm run dev    # runs with nodemon on http://localhost:3000
```

---

## 📁 File Structure

```
picasso-tracker/
├── server.js          # Express API + static server
├── data.json          # Auto-created on first run (all your tasks)
├── package.json
├── render.yaml        # Render deployment config
└── public/
    └── index.html     # Full frontend (single page)
```
