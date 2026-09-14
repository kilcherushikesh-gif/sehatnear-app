# SehatNear backend — reference implementation

Merges live hospital results from Google Places with a verified,
registry-style dataset (standing in for something like the ABDM Health
Facility Registry or a state health department list), so the app never
shows an emergency phone number or 24x7 claim that hasn't been confirmed
by an official source.

## Setup

```bash
npm install
```

Create a `.env` file:

```
GOOGLE_PLACES_API_KEY=your_key_here
PORT=4000
```

Get a key from the [Google Cloud Console](https://console.cloud.google.com/)
by enabling the **Places API** and **Maps JavaScript API**. Billing must be
enabled on the project; Google gives a monthly free credit that covers
moderate use.

Run it:

```bash
npm start
```

## Endpoints

**GET `/api/hospitals/nearby?lat=..&lng=..&radius=5000`**
Calls Google Places `nearbysearch` for `type=hospital`, then matches each
result against `verifiedRegistry.json` by proximity (< 150m) and fuzzy name
match. Matched results carry a verified phone number, 24x7 status and
department list from the registry. Unmatched results are still shown, but
flagged `verified: false` with a note that details are unconfirmed —
the frontend should visually downweight these rather than treating them
as equal to a verified listing.

**POST `/api/hospitals/claim`**
A hospital submits corrected details (phone, hours, departments). This is
queued as `pending_review`, never auto-applied. Someone on your team (or an
automated check against the registry) approves it before it becomes the
displayed record.

**GET `/api/hospitals/claims`**
Lists pending claims — what the admin panel reads.

## Swapping in a real government registry

`verifiedRegistry.json` is sample data shaped like what you'd get from a
real source. Two real options for India:

- **ABDM Health Facility Registry (HFR)** — apply for API access through
  the National Health Authority; facilities carry an HFR ID, registration
  type, and address, but not live phone/hours.
- **State health department open data** — several states publish hospital
  directories (often as downloadable CSVs rather than a live API), which
  you'd ingest with a scheduled job rather than a request-time call.

Either way, treat that data as the trust anchor: seed `verified: true`
records from it, and only let phone/hours/departments be edited through the
claim-and-review flow, never overwritten by a live Google Places sync.

## Notes on cost and reliability

- Cache Google Places results server-side (e.g. Redis, 24h TTL) keyed by a
  rounded lat/lng grid cell — repeated nearby searches from users in the
  same area shouldn't each hit the API.
- Google Places usage is metered per request; nearby search plus a details
  call per result adds up fast at scale. Budget for this before launch.
- Never surface Google's `phone`/`opening_hours` fields as if they were
  verified emergency information — that's exactly the gap the registry
  match is meant to close.
