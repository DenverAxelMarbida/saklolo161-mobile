export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000";

// The backend stores evidence media `url` as a RELATIVE path so the same
// record works on any client; resolve it against this app's API base.
// Absolute urls (Firebase Storage after the cutover) pass through.
export function resolveApiUrl(url) {
  return url && url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";

export const CATEGORY_DISPLAY = {
  MEDICAL: "Medical",
  FIRE: "Fire",
  FLOOD: "Flood",
  CRIME: "Crime",
};

export const CATEGORY_COLORS = {
  MEDICAL: "#F97316",
  FIRE: "#EF4444",
  FLOOD: "#3B82F6",
  CRIME: "#334155",
};

export { THEMES, LIGHT } from "./themes";
