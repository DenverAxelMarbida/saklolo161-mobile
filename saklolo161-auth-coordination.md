# Saklolo161 — Auth Cutover Coordination Window (Phase 3, Track 1)

This is the **one cross-repo coordinated change** in Phase 3. Everything
else is independently delegable. Tunnel-vision three rules:

1. Run this in a **scheduled window** — never a silent deploy.
2. **Backend + web land together.** Shipping one side without the other
   breaks login end-to-end.
3. **Mobile is exempt.** It has no auth surface; it must not change.

## What changes, per repo

| Repo | File | Change |
|---|---|---|
| backend | `services/authService.js` | `login()` verifies against Firebase (admin SDK / Auth REST); `verifyToken()` → `admin.auth().verifyIdToken()`. Payload stays `{ uid, email, agency, role }` (Firebase custom claims). |
| backend | `config/firebase.js` | Uncomment `initializeFirebase()`; seed `/stations` node (stationService already branches on `getDb()`). |
| backend | `routes/authRoutes.js` | `POST /api/auth/login` may be removed — web no longer posts to it. |
| web | `src/lib/auth.js` | Swap internals for the Firebase client SDK: `login(email, password)` → `signInWithEmailAndPassword`; `onAuthChange` keeps emitting `{ token: firebaseIdToken, user: { uid, email, agency, role } } \| null`. **`App.jsx`/`Header.jsx`/`api.js` untouched** (they only consume the shape). |
| web | env | `VITE_FIREBASE_API_KEY` etc. added (prefixed `VITE_` or stripped from the bundle). |
| backend | `scripts/provisionUser.js` | Re-provision staff accounts in Firebase (or replace with an admin-SDK provisioning script). |

## Pre-window checklist (days before)
- [ ] Firebase project exists; web + admin SDK config in hand.
- [ ] Custom claims mapping defined: user record → `{ agency, role }`.
- [ ] `scripts/provisionUser.js` reproduces the existing mockUsers accounts.
- [ ] A **forced re-login** communicated to dispatchers (existing sessions
      will not survive the token-format change).

## Window execution order
1. Backend branch: authService + firebase.js + /stations seed → PR.
2. Web branch: auth.js swap + env vars → PR.
3. **Merge backend → deploy to Render. Merge web → deploy. Back-to-back.**
4. After deploy, verify login fresh (new + reactivated user), then ask
   dispatchers to sign in once to confirm.

## Post-window verification
- New login works end-to-end (Firebase ID token → backend verifyIdToken → agency-scoped list).
- Agency scoping still filters incidents by `req.user.agency`.
- Stale localStorage JWT no longer authenticates (forced re-login effective).
- Mobile smoke test: `POST /api/incidents` + `GET /api/incidents/:id` still work, no token needed.

## Rollback
- If the web deploy fails: web pre-swap build is rollback-safe (auth.js
  and backend still on JWT) **only if backend deploy hasn't happened yet**.
- If the backend deploy fails: re-deploy previous backend; web pre-swap
  build goes back to JWT login. Keep both PR-ready-to-revert.
- If both deploy but login breaks: fix-forward on `verifyToken` first
  (it's the single choke point), not a revert.