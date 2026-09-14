// SehatNear — FREE backend (no API key, no billing)
// Uses OpenStreetMap's Overpass API instead of Google Places.
//
// Setup:
//   npm install express axios cors
//   node server-free.js
//
// Try it:
//   GET http://localhost:4000/api/hospitals/nearby?lat=18.5204&lng=73.8567&radius=5000
//
// Trade-off vs the Google Places version: coverage depends on how well
// volunteers have mapped hospitals in that area. Good in most Indian cities,
// patchy in smaller towns. Always let users report missing hospitals.

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'verifiedRegistry.json'), 'utf8')
);

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

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function nameSimilarity(a, b) {
  const an = (a || '').toLowerCase().trim();
  const bn = (b || '').toLowerCase().trim();
  if (!an || !bn) return 0;
  const dist = levenshtein(an, bn);
  return 1 - dist / Math.max(an.length, bn.length);
}

function findRegistryMatch(osmPlace) {
  return registry.find(r => {
    const distance = haversineMeters(osmPlace.lat, osmPlace.lng, r.lat, r.lng);
    const similarity = nameSimilarity(osmPlace.name, r.name);
    return distance < 150 && similarity > 0.6;
  });
}

// Overpass QL: find hospital nodes/ways/relations within `radius` metres of lat/lng.
async function fetchOsmHospitalsNearby(lat, lng, radius) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      way["amenity"="hospital"](around:${radius},${lat},${lng});
      relation["amenity"="hospital"](around:${radius},${lat},${lng});
    );
    out center tags;
  `;
  const { data } = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 25000
  });
  return data.elements || [];
}

function normalizeOsmElement(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const tags = el.tags || {};
  return {
    osmId: `${el.type}/${el.id}`,
    name: tags.name || 'Unnamed hospital',
    lat,
    lng,
    address: [tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean).join(', '),
    osmPhone: tags.phone || tags['contact:phone'] || null,
    osmEmergency: tags.emergency === 'yes' ? true : tags.emergency === 'no' ? false : null,
    osmOpeningHours: tags.opening_hours || null
  };
}

app.get('/api/hospitals/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius || '5000', 10);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  try {
    const rawElements = await fetchOsmHospitalsNearby(lat, lng, radius);
    const places = rawElements.map(normalizeOsmElement).filter(p => p.lat && p.lng);
    const matchedIds = new Set();

    const merged = places.map(place => {
      const match = findRegistryMatch(place);
      if (match) matchedIds.add(match.regId);

      return {
        source: match ? 'osm+registry' : 'osm_only',
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        distanceMeters: Math.round(haversineMeters(lat, lng, place.lat, place.lng)),
        address: place.address || null,
        verified: !!match,
        phone: match ? match.verifiedPhone : place.osmPhone,
        er247: match ? match.er247 : place.osmEmergency,
        departments: match ? match.departments : [],
        note: match
          ? null
          : 'From OpenStreetMap, not yet matched to a verified registry entry — confirm phone and hours before trusting them.'
      };
    });

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
        note: 'From verified registry; not currently mapped on OpenStreetMap.'
      }));

    const all = [...merged, ...registryOnly].sort((a, b) => a.distanceMeters - b.distanceMeters);
    res.json({ count: all.length, results: all });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/hospitals/claim', (req, res) => {
  const { name, lat, lng, phone, er247, departments, submittedBy } = req.body;
  if (!name || lat == null || lng == null || !submittedBy) {
    return res.status(400).json({ error: 'name, lat, lng and submittedBy are required' });
  }
  const claim = {
    id: pendingClaims.length + 1,
    name, lat, lng,
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
  console.log(`SehatNear FREE backend running on http://localhost:${PORT}`);
  console.log('Data source: OpenStreetMap Overpass API — no key, no billing.');
});
