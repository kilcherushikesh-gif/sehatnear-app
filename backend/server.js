// SehatNear — reference backend
// Merges live Google Places results with a verified government-style registry.
//
// Setup:
//   npm install express axios dotenv cors
//   echo "GOOGLE_PLACES_API_KEY=your_key_here" > .env
//   node server.js
//
// Try it:
//   GET http://localhost:4000/api/hospitals/nearby?lat=18.5204&lng=73.8567&radius=5000

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'verifiedRegistry.json'), 'utf8')
);

// In-memory store for demo "hospital claim" submissions.
// In production this is a real table with an approval workflow, not auto-trusted.
const pendingClaims = [];

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Simple Levenshtein distance for fuzzy name matching.
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function nameSimilarity(a, b) {
  const an = a.toLowerCase().trim();
  const bn = b.toLowerCase().trim();
  const dist = levenshtein(an, bn);
  const maxLen = Math.max(an.length, bn.length);
  return 1 - dist / maxLen; // 1.0 = identical
}

// Match a Google Places result against the verified registry.
// Two signals: physically close (< 150m) AND similar name (> 0.6 similarity).
function findRegistryMatch(place) {
  return registry.find(r => {
    const distance = haversineMeters(
      place.geometry.location.lat,
      place.geometry.location.lng,
      r.lat,
      r.lng
    );
    const similarity = nameSimilarity(place.name, r.name);
    return distance < 150 && similarity > 0.6;
  });
}

async function fetchGooglePlacesNearby(lat, lng, radius) {
  if (!GOOGLE_KEY) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY missing — set it in a .env file to call the live API.'
    );
  }
  const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const { data } = await axios.get(url, {
    params: { location: `${lat},${lng}`, radius, type: 'hospital', key: GOOGLE_KEY }
  });
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status}`);
  }
  return data.results || [];
}

app.get('/api/hospitals/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius || '5000', 10);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  try {
    const places = await fetchGooglePlacesNearby(lat, lng, radius);
    const matchedIds = new Set();

    const merged = places.map(place => {
      const match = findRegistryMatch(place);
      if (match) matchedIds.add(match.regId);

      return {
        source: match ? 'google+registry' : 'google_only',
        name: place.name,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        distanceMeters: Math.round(
          haversineMeters(lat, lng, place.geometry.location.lat, place.geometry.location.lng)
        ),
        address: place.vicinity,
        verified: !!match,
        phone: match ? match.verifiedPhone : null,
        er247: match ? match.er247 : null,
        departments: match ? match.departments : [],
        googleRating: place.rating || null,
        note: match
          ? null
          : 'Not yet matched to a verified registry entry — hours and phone unconfirmed.'
      };
    });

    // Registry entries with no matching live Google result still get surfaced
    // (e.g. a small clinic Google hasn't indexed well) but flagged as such.
    const registryOnly = registry
      .filter(r => !matchedIds.has(r.regId))
      .filter(r => haversineMeters(lat, lng, r.lat, r.lng) < radius)
      .map(r => ({
        source: 'registry_only',
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        distanceMeters: Math.round(haversineMeters(lat, lng, r.lat, r.lng)),
        address: r.area,
        verified: true,
        phone: r.verifiedPhone,
        er247: r.er247,
        departments: r.departments,
        googleRating: null,
        note: 'From verified registry; not currently indexed on Google Places.'
      }));

    const all = [...merged, ...registryOnly].sort(
      (a, b) => a.distanceMeters - b.distanceMeters
    );

    res.json({ count: all.length, results: all });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// A hospital (or someone claiming to represent one) submits corrected info.
// This never auto-overwrites verified data — it queues for manual review.
app.post('/api/hospitals/claim', (req, res) => {
  const { name, lat, lng, phone, er247, departments, submittedBy } = req.body;
  if (!name || lat == null || lng == null || !submittedBy) {
    return res.status(400).json({ error: 'name, lat, lng and submittedBy are required' });
  }
  const claim = {
    id: pendingClaims.length + 1,
    name,
    lat,
    lng,
    phone: phone || null,
    er247: !!er247,
    departments: departments || [],
    submittedBy,
    status: 'pending_review',
    submittedAt: new Date().toISOString()
  };
  pendingClaims.push(claim);
  res.status(201).json({ message: 'Claim submitted for review', claim });
});

app.get('/api/hospitals/claims', (req, res) => {
  res.json({ count: pendingClaims.length, claims: pendingClaims });
});

app.listen(PORT, () => {
  console.log(`SehatNear backend running on http://localhost:${PORT}`);
  if (!GOOGLE_KEY) {
    console.log('Note: GOOGLE_PLACES_API_KEY not set — /api/hospitals/nearby will error until you add one.');
  }
});
