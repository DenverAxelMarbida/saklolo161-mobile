import AsyncStorage from "@react-native-async-storage/async-storage";

const PHONE_KEY = "@saklolo_saved_phone";
const RECENT_IDS_KEY = "@saklolo_recent_incident_ids";
const RESOLVED_KEY = "@saklolo_resolved_incidents";
const FAILED_EVIDENCE_KEY = "@saklolo_failed_evidence";
const MAX_RECENT = 5;
const MAX_EVIDENCE = 5;

export async function getSavedPhone() {
  try {
    return await AsyncStorage.getItem(PHONE_KEY);
  } catch {
    return null;
  }
}

export async function savePhone(phone) {
  try {
    await AsyncStorage.setItem(PHONE_KEY, phone);
  } catch {
    // silent
  }
}

export async function getRecentIncidentIds() {
  try {
    const json = await AsyncStorage.getItem(RECENT_IDS_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function saveIncidentId(id) {
  try {
    const existing = await getRecentIncidentIds();
    const updated = [id, ...existing.filter((x) => x !== id)].slice(
      0,
      MAX_RECENT
    );
    await AsyncStorage.setItem(RECENT_IDS_KEY, JSON.stringify(updated));
  } catch {
    // silent
  }
}

export async function removeIncidentId(id) {
  try {
    const existing = await getRecentIncidentIds();
    const updated = existing.filter((x) => x !== id);
    await AsyncStorage.setItem(RECENT_IDS_KEY, JSON.stringify(updated));
  } catch {
    // silent
  }
}

export async function getResolvedIncidents() {
  try {
    const json = await AsyncStorage.getItem(RESOLVED_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function saveResolvedIncident(incident) {
  try {
    const existing = await getResolvedIncidents();
    const alreadyPresent = existing.some(
      (i) => i.incidentId === incident.incidentId
    );
    if (alreadyPresent) return;
    const updated = [
      incident,
      ...existing.filter((i) => i.incidentId !== incident.incidentId),
    ].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RESOLVED_KEY, JSON.stringify(updated));
  } catch {
    // silent
  }
}

/**
 * Failed-evidence handoff: the form persists the file objects it could
 * not upload so the Dispatch Tracker can offer a Retry later. Files are
 * small `{ uri, name, mimeType }` records (exactly what
 * `uploadEvidence()` consumes).
 */
async function getFailedEvidenceMap() {
  try {
    const json = await AsyncStorage.getItem(FAILED_EVIDENCE_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

export async function saveFailedEvidence(incidentId, files) {
  try {
    const map = await getFailedEvidenceMap();
    map[incidentId] = files.slice(0, MAX_EVIDENCE);
    await AsyncStorage.setItem(FAILED_EVIDENCE_KEY, JSON.stringify(map));
  } catch {
    // silent
  }
}

export async function getFailedEvidence(incidentId) {
  try {
    const map = await getFailedEvidenceMap();
    return map[incidentId] ?? [];
  } catch {
    return [];
  }
}

export async function clearFailedEvidence(incidentId) {
  try {
    const map = await getFailedEvidenceMap();
    if (!(incidentId in map)) return;
    delete map[incidentId];
    await AsyncStorage.setItem(FAILED_EVIDENCE_KEY, JSON.stringify(map));
  } catch {
    // silent
  }
}
