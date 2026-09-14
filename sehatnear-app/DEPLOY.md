# SehatNear — deploy this yourself, step by step, free

Everything is already built. This file is the only thing left to follow —
each step is copy-paste, no coding needed.

## What you'll end up with
- A live app URL anyone can open on their phone and "Add to Home Screen".
- A live backend URL that serves real nearby-hospital data from OpenStreetMap.
- An admin panel URL where you approve hospital corrections.

---

### Step 1 — Put the code on GitHub (5 min)

1. Go to github.com, sign up if you don't have an account (free).
2. Click **New repository**, name it `sehatnear-app`, keep it public, click **Create**.
3. On the new repo page, click **uploading an existing file**, then drag in
   the entire `sehatnear-app` folder (both `frontend` and `backend`
   subfolders). Commit.

### Step 2 — Deploy the backend on Render (10 min, free)

1. Go to render.com, sign up with your GitHub account.
2. Click **New +** → **Web Service**, pick your `sehatnear-app` repo.
3. Set:
   - **Root directory**: `backend`
   - **Build command**: `npm install`
   - **Start command**: `node server-free.js`
   - Rename `package-free.json` to `package.json` in the repo first (or in
     Render's settings point the build to install from it) so Render finds
     the right dependencies — simplest is to delete the original
     `package.json` and rename `package-free.json` to `package.json` before
     this step, since the free path doesn't need `axios`'s Google-specific
     usage removed but does skip `dotenv`.
4. Click **Create Web Service**. Wait for the build to finish — you'll get a
   URL like `https://sehatnear-backend.onrender.com`.
5. Test it by opening:
   `https://sehatnear-backend.onrender.com/api/hospitals/nearby?lat=18.5204&lng=73.8567`
   You should see real Pune hospitals as JSON.

### Step 3 — Point the app at your live backend (2 min)

1. Open `frontend/index.html` in a text editor.
2. Find the line `const BACKEND_URL = "";` and change it to your Render URL:
   `const BACKEND_URL = "https://sehatnear-backend.onrender.com";`
3. Save, and re-upload this one file to your GitHub repo (or push the change).

### Step 4 — Deploy the frontend on Netlify (5 min, free)

1. Go to netlify.com, sign up with GitHub.
2. Click **Add new site** → **Import an existing project** → pick
   `sehatnear-app` → set **Base directory** to `frontend` → **Deploy**.
3. You'll get a URL like `https://sehatnear.netlify.app`. Open it on your
   phone browser and use **Add to Home Screen** — it now behaves like an
   installed app, for free, no app store needed.

### Step 5 — Deploy the admin panel

Same Netlify project can serve `admin.html` too — it'll be reachable at
`https://sehatnear.netlify.app/admin.html`. Keep that link private/bookmarked
rather than linking it from the main app, since anyone with it can currently
approve claims (add a login before giving this URL to your team).

---

## What I can't do for you

I don't have the ability to create accounts, click through GitHub/Render/
Netlify's UI, or hold API keys on your behalf — those steps need your own
login. Everything up to that point (all the code, the free data source, the
config already wired to a `BACKEND_URL` variable) is done.

## If you get stuck on any step

Paste the exact error message or screenshot description back here and I'll
walk through fixing that specific step with you.
