# SehatNear

[Open the live mobile-first prototype](https://kilcherushikesh-gif.github.io/sehatnear-app/)

SehatNear helps people choose a city or share their location, browse nearby
hospitals, and open directions or call when verified contact details are
available.

## Current data limitation

The public GitHub Pages prototype cannot call OpenStreetMap's Overpass API
directly because the service does not allow browser CORS requests. The page
shows a retryable error instead of treating a failed request as “no hospitals.”
Live hospital results require deploying the free proxy in `backend/server-free.js`
to a CORS-enabled host and connecting the frontend to that service URL.

This is a prototype, not an emergency dispatch service. In India, call 112 for
emergencies or 102 for an ambulance; confirm hospital details by phone.

## Run the free backend locally

```bash
cd backend
npm install
node server-free.js
```

The backend serves nearby hospital data through OpenStreetMap and needs no API
key. Coverage depends on community mapping; smaller towns may have incomplete
records.