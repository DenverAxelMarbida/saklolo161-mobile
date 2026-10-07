/**
 * REAL production payloads captured from
 * GET https://saklolo161-backend.onrender.com/api/incidents/:id
 * on 2026-10-07 during the \"Resolved —\" root-cause investigation.
 *
 * They pin the exact production shapes behind the field report:
 *  - INC-20261004-7190 / INC-20261005-1575 / INC-20261005-5320:
 *    historical resolutions with NO resolvedAt key at all — the
 *    deployed Render backend has never persisted it (it only stamps
 *    the PATCH response object; live-proven 2026-10-07T15:50:56Z).
 *  - INC-20261007-9431: carries a real persisted resolvedAt —
 *    written by a LOCAL fixed-code test run against the shared RTDB.
 *  - INC-20261007-5191: created + resolved DURING the live probe;
 *    PATCH response had resolvedAt, immediate GET did not (deployed
 *    backend runs the old response-only stamp).
 *
 * PRODUCTION_SERVED_ORDER mirrors the backend's served order
 * (RTDB key order = incidentId ascending).
 */
export const PRODUCTION_INCIDENTS = {
  "INC-20261004-7190": {
    "category": "Medical",
    "citizenPhone": "09170000000",
    "dispatch": {
      "arrivalEtaMinutes": 10,
      "assignedUnit": "Rescue 161 Ambulance #1",
      "dispatchedAt": "2026-10-04T02:57:12.624Z",
      "estimatedTurnout": "2–5 mins",
      "stationId": "MEDICAL_MDRRMO_BASE",
      "stationName": "Marikina City Disaster Risk Reduction Management Office"
    },
    "evidenceExpectedCount": 0,
    "evidenceFailedCount": 0,
    "evidenceUploading": false,
    "incidentId": "INC-20261004-7190",
    "location": {
      "address": "8011 Bayan-Bayanan Avenue Concepcion Uno, Marikina, Philippines",
      "latitude": 14.6507,
      "longitude": 121.1029
    },
    "notes": "Firebase cutover API test",
    "station": {
      "coords": {
        "lat": 14.662746008271984,
        "lng": 121.1214855893322
      },
      "id": "MEDICAL_MDRRMO_BASE",
      "name": "Marikina City Disaster Risk Reduction Management Office"
    },
    "status": "Resolved",
    "timestamp": "2026-10-04T00:54:54.414Z",
    "evidence": [],
    "evidenceAttempt": 0,
    "evidenceAttemptsTotal": 0,
    "elapsedMinutes": 5219
  },
  "INC-20261005-1575": {
    "category": "Crime",
    "citizenPhone": "09218346260",
    "dispatch": {
      "arrivalEtaMinutes": 37,
      "assignedUnit": "Mobile Patrol #101",
      "dispatchedAt": "2026-10-06T00:58:33.121Z",
      "estimatedTurnout": "3–5 mins",
      "stationId": "CRIME_PNP_MAIN_HQ",
      "stationName": "Marikina City Police Headquarters"
    },
    "evidenceExpectedCount": 0,
    "evidenceFailedCount": 0,
    "evidenceUploading": false,
    "incidentId": "INC-20261005-1575",
    "location": {
      "address": "938 Aurora Boulevard Mangga, Quezon City, Philippines",
      "latitude": 14.62665,
      "longitude": 121.0624288
    },
    "notes": "h",
    "station": {
      "coords": {
        "lat": 14.663565945837846,
        "lng": 121.12160587795394
      },
      "id": "CRIME_PNP_MAIN_HQ",
      "name": "Marikina City Police Headquarters"
    },
    "status": "Resolved",
    "timestamp": "2026-10-05T23:38:33.430Z",
    "evidence": [],
    "evidenceAttempt": 0,
    "evidenceAttemptsTotal": 0,
    "elapsedMinutes": 2415
  },
  "INC-20261005-5320": {
    "category": "Medical",
    "citizenPhone": "09218346260",
    "dispatch": {
      "arrivalEtaMinutes": 35,
      "assignedUnit": "Rescue 161 Ambulance #1",
      "dispatchedAt": "2026-10-05T04:21:12.628Z",
      "estimatedTurnout": "2–5 mins",
      "stationId": "MEDICAL_MDRRMO_BASE",
      "stationName": "Marikina City Disaster Risk Reduction Management Office"
    },
    "evidenceExpectedCount": 0,
    "evidenceFailedCount": 0,
    "evidenceUploading": false,
    "incidentId": "INC-20261005-5320",
    "location": {
      "address": "E. Evangelista Street Mangga, Quezon City, Philippines",
      "latitude": 14.6257884,
      "longitude": 121.0627752
    },
    "notes": "uhgg",
    "station": {
      "coords": {
        "lat": 14.662746008271984,
        "lng": 121.1214855893322
      },
      "id": "MEDICAL_MDRRMO_BASE",
      "name": "Marikina City Disaster Risk Reduction Management Office"
    },
    "status": "Resolved",
    "timestamp": "2026-10-05T02:39:26.317Z",
    "evidence": [],
    "evidenceAttempt": 0,
    "evidenceAttemptsTotal": 0,
    "elapsedMinutes": 3674
  },
  "INC-20261007-9431": {
    "category": "Flood",
    "citizenPhone": "+639121987664",
    "evidenceAttempt": 0,
    "evidenceAttemptsTotal": 0,
    "evidenceExpectedCount": 0,
    "evidenceFailedCount": 0,
    "evidenceUploading": false,
    "incidentId": "INC-20261007-9431",
    "location": {
      "address": "Unknown location",
      "latitude": 14.6507,
      "longitude": 121.1029
    },
    "notes": "Contract test incident.",
    "resolvedAt": "2026-10-07T14:40:30.168Z",
    "status": "Resolved",
    "timestamp": "2026-10-07T14:40:29.714Z",
    "evidence": [],
    "elapsedMinutes": 73
  },
  "INC-20261007-5191": {
    "category": "Flood",
    "citizenPhone": "+639199900077",
    "evidenceAttempt": 0,
    "evidenceAttemptsTotal": 0,
    "evidenceExpectedCount": 0,
    "evidenceFailedCount": 0,
    "evidenceUploading": false,
    "incidentId": "INC-20261007-5191",
    "location": {
      "address": "Kc-30 Street Manggahan, Pasig, Philippines",
      "latitude": 14.6,
      "longitude": 121.1
    },
    "notes": "Probe: does deployed backend persist resolvedAt on PATCH status->Resolved?",
    "status": "Resolved",
    "timestamp": "2026-10-07T15:50:56.485Z",
    "evidence": [],
    "elapsedMinutes": 3
  }
};

export const PRODUCTION_SERVED_ORDER = [
  'INC-20261004-7190',
  'INC-20261005-1575',
  'INC-20261005-5320',
  'INC-20261007-5191',
  'INC-20261007-9431',
];
