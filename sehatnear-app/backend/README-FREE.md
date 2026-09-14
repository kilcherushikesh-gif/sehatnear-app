# SehatNear — running the whole app for ₹0

This is the free path: no Google billing, no paid hosting, no domain
purchase required to get started.

## 1. Hospital data — OpenStreetMap instead of Google Places

Use `server-free.js` instead of `server.js`. It queries OpenStreetMap's
Overpass API, which is free and needs no signup or key.

```bash
npm install express axios cors
node server-free.js
```

Test it:
```
http://localhost:4000/api/hospitals/nearby?lat=18.5204&lng=73.8567&radius=5000
```

**Trade-off to know about**: OpenStreetMap is community-mapped. Big-city
coverage is usually good; smaller towns may show fewer hospitals than
actually exist, and phone/hours tags are often missing. Two ways to close
that gap without spending money:
- Keep `verifiedRegistry.json` growing with hospitals you or volunteers
  confirm by phone — this becomes your trust layer regardless of data source.
- Add a "Hospital not listed? Tell us" button in the app that feeds the
  same `/api/hospitals/claim` endpoint — free crowdsourced data entry.

## 2. Backend hosting — Render.com free tier

1. Push the `backend` folder to a GitHub repo.
2. On [render.com](https://render.com), create a **Web Service**, connect
   the repo, set build command `npm install` and start command
   `node server-free.js`.
3. Free tier sleeps after 15 minutes of no traffic and takes ~30s to wake
   on the next request — fine for early testing, not for a live emergency
   app at scale.

Alternatives with similar free tiers: Railway, Cyclic, Fly.io.

## 3. Frontend + admin panel — Netlify or Vercel free tier

Both `sehatnear-prototype.html` and `sehatnear-admin-panel.html` are static
files. Drag-and-drop the folder onto Netlify's dashboard, or connect the
GitHub repo — both give you a free `.netlify.app` / `.vercel.app` URL with
HTTPS, no credit card needed.

## 4. Turning it into an installable app — no app store fee (yet)

Add a `manifest.json` and a service worker to make it a **Progressive Web
App (PWA)**. Users can then "Add to Home Screen" from Chrome and it behaves
like an app icon — no Play Store's $25 one-time fee, no Apple's $99/year
fee. This is the right first step; you can still publish to app stores
later once the free version has real users and feedback.

## What actually costs money later, when you scale

- Play Store listing: $25 one-time (Android), App Store: $99/year (iOS) —
  only needed if you go beyond PWA.
- A custom domain (sehatnear.in etc.): roughly ₹500–1000/year — optional,
  the free `.netlify.app` subdomain works fine to start.
- If Render's free tier sleep becomes a problem, its cheapest paid tier is
  a few hundred rupees a month.

Nothing above is required to launch and test with real users first.
