# Saklolo161 Mobile — Project Context

Emergency response system for Marikina City, PH ("SAKLOLO 161"). This
file orients any AI coding agent (opencode, Claude Code, etc.) working
in this repo — the citizen-facing incident-reporting app.

## This Repo & Related Repos

| Repo | Stack | Relationship to this repo |
|---|---|---|
| `saklolo161-backend` | Express.js REST API, Render | This repo's only backend. Calls four public endpoints — see "API Contract." |
| `saklolo161-web` | React 19 + Vite + Tailwind | Dispatcher-facing, authenticated. Shares design tokens and one polling pattern with this repo — nothing else. Request its files before assuming shared logic; don't assume this repo mirrors it. |

Mapping: pure Mapbox via `@rnmapbox/maps` — **not** `react-native-maps`,
matching the web dashboard's `mapbox-gl` choice. `EXPO_PUBLIC_MAPBOX_TOKEN`,
`EXPO_PUBLIC_API_BASE_URL` — any Expo env var exposed to the app MUST be
prefixed `EXPO_PUBLIC_` or it's silently stripped from the bundle.

## Roadmap Status

- **Phase 2 (done):** Home Dashboard, Incident Form, Dispatch Tracker —
  merged and building clean. Task list used:
  `saklolo161-mobile-phase2-tasks.md`.
- **Phase 3 (in progress):** real routed path on the tracker map (from
  the new public `GET /api/routes`), evidence capture/upload
  (`POST /api/incidents/:id/evidence`), and a Jest/RNTL test suite +
  CI hygiene. The Firebase/Auth cutover happening in the other two repos
  does NOT touch this app — it has no login and never will. Watch item:
  if `GET /api/incidents/:id`'s shape ever changes as part of the
  backend's Phase 3 work, update the contract slice below.
  Task list: `../Phase 3/saklolo161-mobile-phase3-tasks.md`

## API Contract — this repo's slice only

| Endpoint | Auth | Use |
|---|---|---|
| `POST /api/incidents` | None | Submit a new report. Rate-limited server-side per `citizenPhone` (~3 per 10 min) — don't hammer it while testing. |
| `GET /api/incidents/:id` | None | Poll a single incident's status (gains `evidence[]` and `station.coords` when dispatched in Phase 3). |
| `GET /api/routes?fromLat&fromLng&toLat&toLng` | None | Phase 3. Real route geometry + distance/ETA. Rate-limited. |
| `POST /api/incidents/:id/evidence` | None | Phase 3. Multipart field `file`; returns `{ fileId, url, mimeType, sizeKb, uploadedAt }`. Rate-limited. |

**Hard rule: never call `GET /api/incidents` (the list endpoint).** It
is dispatcher-only and requires a JWT this app will never have — it
will 401. This repo tracks a citizen's own report(s) by ID via
`GET /api/incidents/:id`, never by fetching the full list client-side.

## Design Tokens (match `saklolo161-web`'s `src/index.css` exactly)

| Token | Hex | Use |
|---|---|---|
| Dark Navy | `#111A3A` | header, hero card background |
| Fire Red | `#EF4444` | fire category |
| Medical Orange | `#F97316` | medical category |
| Flood Blue | `#3B82F6` | flood category |
| Crime Slate | `#334155` | crime category |
| Mint Green | `#10B981` | live badges, resolved state |

## Hard Rules (do not violate)

1. **No login, no auth token, ever.** Citizens are identified by
   phone number; `incidentId` is their receipt. Don't add an
   authentication layer to this repo under any phase.
2. **Never call `GET /api/incidents` (list).** See API Contract above.
3. **Category casing needs an explicit mapping, not inline strings.**
   UI displays `MEDICAL/FIRE/FLOOD/CRIME` (uppercase, matching web);
   the API's `category` field expects Title Case (`"Fire"`,
   `"Medical"`, etc.) per the backend's `validateIncident.js`. Keep the
   mapping in one constant (`lib/config.js`'s `CATEGORY_DISPLAY`) — no
   screen should hardcode either form directly.
4. **Distress-call hotline numbers live in one file
   (`lib/hotlines.js`), never inline in a button's `onPress`.** Same
   spirit as the backend's "never hardcode station duty numbers" rule
   — these are public numbers, not internal dispatch lines, but a
   wrong/changed number should be a one-line fix, not a rebuild.
   Numbers come from `../Phase 3/station-data-checklistCOMPLETE.md`
   (Part 2) — keep them in sync with the backend's
   `config/env.js` fallbacks.
5. **Don't build custom station-to-incident routing math.** A real
   Directions-API-backed route is planned to replace the web
   dashboard's current straight-line placeholder too — this repo
   should show a pin for now, not invent its own line-drawing logic
   that both repos would need to throw away later.
6. **Don't simulate or auto-advance the incident status stepper.**
   Only three of the four steps (`Pending`/`Dispatched`/`Resolved`) are
   currently triggered by any client — a dispatcher on the web
   dashboard manually marks `"En Route"`. This app's stepper reflects
   whatever `status` comes back from the poll; it never assumes or
   times out into a step nothing has actually set.

## Established Patterns

- **Polling with cleanup:** mirror
  `saklolo161-web/src/hooks/useIncidentPolling.js`'s 10-second
  `setInterval` + `isMountedRef` guard + cleanup-on-unmount pattern
  when building the Dispatch Tracker screen's polling hook. Ask for
  that file's contents rather than guessing its shape.
- **Graceful degradation:** mirror the web dashboard's pattern of
  falling back to a placeholder/mock value on fetch failure (Render
  cold starts, or no backend running during local dev) rather than
  leaving a screen blank or crashing.
- **Local persistence via AsyncStorage:** `lib/storage.js` should
  export `getSavedPhone()`/`savePhone(phone)` and
  `getRecentIncidentIds()`/`saveIncidentId(id)` (array, capped at 5,
  most recent first) — this is how the Dispatch Tracker screen knows
  what to poll without a login or a list endpoint.

## Local Testing Setup

Clone `saklolo161-backend` and run it locally rather than pointing at
Render for day-to-day iteration — this app hits the backend on nearly
every screen (weather, submit, poll), so cold starts and shared mock
data affect it more than a one-off request would:

1. Run the backend locally: `cd saklolo161-backend && npm run dev`
   (defaults to `http://localhost:5000`). No write access needed —
   clone/pull only.
2. Point `EXPO_PUBLIC_API_BASE_URL` at your machine's **LAN IP**, not
   `localhost` — a phone running Expo Go is a different device on the
   network. `saklolo161-backend/config/corsOptions.js` already
   whitelists local network IPs (`192.168.x.x`, `10.x.x.x`).
3. Map screens should degrade to a placeholder pin if
   `EXPO_PUBLIC_MAPBOX_TOKEN` is missing/invalid rather than crashing —
   useful while a real token is still being provisioned.
4. Watch for the backend's rate limiter (max ~3
   `POST /api/incidents` per 10 min per phone) throttling rapid local
   resubmission testing — flag to the backend dev if a dev-mode bypass
   isn't in place yet. This limiter is shared across everyone hitting
   the same instance, so a local backend also means your test
   resubmissions don't burn through web's or another mobile tester's
   quota (or vice versa).
5. A local backend also means test incidents/reports created while
   iterating don't land in the same shared, resettable in-memory store
   (`mockIncidents.js`) that other devs' test data is sitting in on
   the live Render instance.

## CI/CD

`.github/workflows/ci.yml` currently only does `checkout` → `setup-node
18` → `npm ci --legacy-peer-deps || npm install` — no lint/build/test
step, so a broken import can merge with CI green. Phase 3 closes this
(see `../Phase 3/saklolo161-mobile-phase3-tasks.md`, task 3): add a lint
step, then `expo-doctor`/`expo export` only once they go green on the
stable baseline, plus a Jest/RNTL suite. A red check people learn to
ignore is worse than no check — add each step when it's actually green,
not before.

## Known Gaps / Backlog

- No real GPS/telemetry-based "En Route" detection — manual dispatcher
  action on web is the trigger for now (see Hard Rule 6). Held: needs a
  responder client to generate telemetry; not planned this round.
- No real routed path on the tracker map — Phase 3 task 1 draws
  `GET /api/routes` geometry (straight-line fallback until then).
- Evidence (photo/video) attachment wiring is UI-stub-only — Phase 3
  task 2 wires capture + upload to `POST /api/incidents/:id/evidence`.
- No test suite (Jest/RNTL or otherwise) — Phase 3 task 3 (see
  "CI/CD" above).
