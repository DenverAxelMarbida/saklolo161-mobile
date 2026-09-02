export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000";

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

export const THEMES = {
  darkNavy: "#111A3A",
  medicalOrange: "#F97316",
  fireRed: "#EF4444",
  floodBlue: "#3B82F6",
  crimeSlate: "#334155",
  mintGreen: "#10B981",
  white: "#FFFFFF",
  lightGray: "#F3F4F6",
  gray: "#6B7280",
};
