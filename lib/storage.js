import AsyncStorage from "@react-native-async-storage/async-storage";

const PHONE_KEY = "@saklolo_saved_phone";
const RECENT_IDS_KEY = "@saklolo_recent_incident_ids";
const MAX_RECENT = 5;

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
