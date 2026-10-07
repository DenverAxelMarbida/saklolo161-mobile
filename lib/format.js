/**
 * lib/format.js
 * --------------------------------------------------------------
 * Shared timestamp formatting for the resolved/history surfaces.
 *
 * The established project convention (History detail rows, history
 * cards): en-PH medium date + short time → e.g. "Jun 15, 2025, 7:30 PM".
 * One implementation so the detail screen and the list cards can never
 * drift apart.
 *
 * Returns "" for missing/unparseable input so call sites can render
 * their own graceful fallback (the cards show "—") instead of ever
 * fabricating a time or showing "Invalid Date".
 */
export function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Epoch for anything without a usable resolvedAt so missing-value
// records sort below timed ones without crashing the comparator.
// resolvedAt is the ONLY ordering key — never the report timestamp.
export function resolvedTime(incident) {
  const t = Date.parse(incident?.resolvedAt ?? "");
  return Number.isFinite(t) ? t : 0;
}
