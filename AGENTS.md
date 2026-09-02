# Saklolo161 Mobile — Project Context

Emergency response system for Marikina City, PH ("SAKLOLO 161"). This
file orients any AI coding agent (opencode, Claude Code, etc.) working
in this repo — the citizen-facing incident-reporting app.

## This Repo & Related Repos

| Repo | Stack | Relationship to this repo |
|---|---|---|
| `saklolo161-backend` | Express.js REST API, Render | This repo's only backend. Calls exactly two endpoints — see "API Contract." |
| `saklolo161-web` | React 19 + Vite + Tailwind | Dispatcher-facing, authenticated. Shares design tokens and one polling pattern with this repo — nothing else. Request its files before assuming shared logic; don't assume this repo mirrors it. |

Mapping: pure Mapbox via `@rnmapbox/maps` — **not** `react-native-maps`,
matching the web dashboard's `mapbox-gl` choice. `EXPO_PUBLIC_MAPBOX_TOKEN`,
`EXPO_PUBLIC_API_BASE_URL` — any Expo env var exposed to the app MUST be
prefixed `EXPO_PUBLIC_` or it's silently stripped from the bundle.

## Roadmap Status

- **Phase 2 (current):** Building the 3 core screens — Home Dashboard,
  Incident Form, Dispatch Tracker. Full step-by-step task list:
  `saklolo161-mobile-phase2-tasks.md`.
- **Phase 3:** No changes expected on this repo's side. This app has
  no login and never will in this architecture — the entire
  Firebase/Auth migration happening in the other two repos doesn't
  touch it. The only thing to watch: if the shape of
  `GET /api/incidents/:id`'s response ever changes as part of that
  migration, this repo needs to hear about it at the same time the web
  team does.

## API Contract — this repo's slice only

| Endpoint | Auth | Use |
|---|---|---|
| `POST /api/incidents` | None | Submit a new report. Rate-limited server-side per `citizenPhone` (~3 per 10 min) — don't hammer it while testing. |
| `GET /api/incidents/:id` | None | Poll a single incident's status. |

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
18` → `npm ci --legacy-peer-deps || npm install`. It doesn't lint,
build, or test anything — a broken import or an obvious bug can merge
to `main` with CI green. That's behind both other repos:
`saklolo161-backend` runs `npm ci`; `saklolo161-web` runs `npm ci` →
`npm run lint` → `npm run build`.

Two changes are planned, in this order:

1. **Add a lint step now.** Cheap, no flakiness risk, and closes the
   gap with the other two repos immediately. Do this regardless of
   what stage Phase 2 is at.
2. **Add a build-sanity step (`expo-doctor` and/or `expo export`)
   once the 3 core screens (Home Dashboard, Incident Form, Dispatch
   Tracker) are functionally done and merged — not before.** Adding it
   mid-build would go red while in-flight screens/env-var wiring from
   `saklolo161-mobile-phase2-tasks.md` are still landing, and a
   red check people learn to ignore is worse than no check yet. It
   should validate a stable baseline from day one.

**Not doing yet:** a full test suite (Jest/RNTL) — there's no test
infra in this repo currently, and standing one up from scratch is a
separate, bigger effort than closing the CI gap. Tracked as a Phase 3
backlog item below, not bundled into the lint/build-sanity work above.

## Known Gaps / Backlog

- No real GPS/telemetry-based "En Route" detection — manual dispatcher
  action on web is the trigger for now (see Hard Rule 6).
- No real routed path on the tracker map — pin only, for now (see Hard
  Rule 5).
- Evidence (photo/video) attachment upload wiring is UI-stub-only until
  a storage endpoint exists on the backend.
- No test suite (Jest/RNTL or otherwise) exists yet — flagged for
  Phase 3, not blocking Phase 2 CI hygiene work (see "CI/CD" above).
