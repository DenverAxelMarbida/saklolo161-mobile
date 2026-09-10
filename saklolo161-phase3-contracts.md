# Saklolo161 — Phase 3 API Contracts (single source of truth)

The shared interface the three repos build against during Phase 3. The
backend dev authors these endpoints; the web and mobile devs implement
UI against these exact shapes (never against each other's code). Each
dev's task file embeds the slice they need — this doc is the canonical
reference the backend prompt verifies against.

**Envelope (unchanged, never break it):** every response is
`{ success: boolean, message: string, data }`; validation failures use
`{ success: false, message, errors }`.

**Auth boundary (never move it):**
- `GET /api/incidents/:id` — **public forever**. Mobile has no login and never will.
- `GET /api/incidents` (list) — **dispatcher-only** (Bearer token).
- New Phase 3 routes staying public (rate-limited per phone like incidents): `GET /api/routes`, `POST /api/incidents/:id/evidence`.

**Status: backend slice SHIPPED + verified live on Render (2026-09-08).**
Web and mobile may build against these shapes now — nothing below is a
proposal. `station` sits at the **top level** of an incident (not under
`dispatch`). The auth cutover ("Auth cutover" track at the bottom) remains
a coordinated window.

---

## New in Phase 3

### `GET /api/routes?fromLat=&fromLng=&toLat=&toLng=`
Public, rate-limited. Returns a driving route between two points.

```
{ success, message,
  data: {
    geometry: { type: "LineString", coordinates: [[lng, lat], ...] },  // GeoJSON
    distanceMeters: <number>,
    durationSeconds: <number>,
  } }
```

Degradation contract: when the Directions API call fails or the Mapbox
token is unset, the backend **returns the same shape with a straight-line
geometry (2 points)** rather than erroring — clients get graceful
behavior for free and don't implement their own fallback. No client may
compute routing math; it only draws `geometry`.

### `POST /api/incidents/:id/evidence`
Public, rate-limited, `multipart/form-data`, field name **`file`**
(≤10MB). Server proxies the file to Firebase Storage
(`evidence/{incidentId}/`), saves metadata to RTDB.

```
{ success, message,
  data: { fileId, url, mimeType, sizeKb, uploadedAt } }
```

Fallback modes: Firebase not configured → metadata stored in-memory with
a placeholder URL (still returns 200, keeps the client flow intact).

### Incident responses gain fields (BOTH clients read these)
`GET /api/incidents/:id` and `GET /api/incidents` now include:

```
station: { id, name, coords: { lat, lng } },   // only when a dispatch exists
evidence: [ { fileId, url, mimeType, uploadedAt } ],   // empty array when none
```

### `GET /api/weather-river` gains one additive field
```
source: "pagasa" | "mock"    // UI-ignored; all existing fields unchanged
```
River level becomes live PAGASA data when reachable; on any failure the
backend silently returns today's exact mock values (15.2 / "Normal" /
"LOW RISK"). Clients cannot tell and must not care.

## Auth cutover (Track 1 — coordinated window only)
- `Authorization: Bearer <Firebase ID token>` — the *token type* changes
  (Firebase ID token instead of signed JWT); the **payload shape
  `{ uid, email, agency, role }` is unchanged** (backend maps Firebase
  custom claims).
- `POST /api/auth/login` may be removed once the web client signs in via
  the Firebase client SDK — coordinated with the web `auth.js` swap, per
  `saklolo161-auth-coordination.md`. Mobile is unaffected.