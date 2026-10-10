# saklolo161-mobile

Expo React Native citizen app for the **Saklolo 161 Emergency Response System** (Marikina City). Citizens file incident reports, track dispatch status, and attach photo/video evidence against the `saklolo161-backend` API. No login — reports are tracked by phone number + `incidentId`.

## Scripts

```bash
npm start        # Expo dev server
npm run android  # run on Android
npm run ios      # run on iOS
npm run lint     # expo lint
npm test         # Jest (13-file suite)
```

## Environment (`.env`, `EXPO_PUBLIC_`-prefixed or stripped from the bundle)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend base URL — Render URL for builds, machine **LAN IP** (`http://192.168.x.x:5000`) for Expo Go iteration |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox public token for tracker maps |

## Notes for contributors

- Never call `GET /api/incidents` (dispatcher-only) and never add auth — see `AGENTS.md` Hard Rules.
- Category colors live in `lib/config.js`; hotline numbers in `lib/hotlines.js`.
- See `AGENTS.md` for the API slice, roadmap context, and local-testing setup.
