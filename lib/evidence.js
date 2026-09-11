import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { API_BASE_URL } from "./config";

/**
 * lib/evidence.js
 * Photo/video evidence helpers for the Incident Form:
 *   - pickEvidence(kind, { multiple }) — opens the system picker for
 *     photos (batch multi-select) or videos (one at a time)
 *   - captureEvidence(kind) — opens the in-app camera for a photo/video
 *   - appendEvidence(list, item, max) — pure append helper (testable)
 *   - uploadEvidence(incidentId, file) — attaches one file via the
 *     public, rate-limited POST /api/incidents/:id/evidence endpoint.
 *
 * The upload is deliberately kept separate from incident creation: the
 * create flow must never block on evidence.
 */

export const EVIDENCE_MIME = {
  photo: "image/jpeg",
  video: "video/mp4",
};

export const MAX_EVIDENCE = 5;

// In-app video capture is deliberately capped at 2 minutes. Evidence is
// meant to give dispatchers brief situational context, and longer clips
// strain the 200MB upload cap, the scaling upload timeout, and a
// citizen's mobile data. Gallery picks bypass this cap (size-only).
export const MAX_CAPTURE_DURATION_MS = 120 * 1000;

// Matches the backend's multer cap (routes/incidentRoutes.js). Anything
// at/above this can never upload, so reject it before the network trip.
export const EVIDENCE_FILE_SIZE_LIMIT = 200 * 1024 * 1024; // bytes

// Uploads are the only network call that moves real bytes, so their
// timeout scales with file size. Small files keep a quick floor; big
// videos get enough headroom to survive a slow mobile uplink.
const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // size unknown
const MIN_UPLOAD_TIMEOUT_MS = 60 * 1000;
const MAX_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
// Pessimistic effective uplink (~512 Kbps) for the size→time estimate.
const UPLINK_BYTES_PER_SEC = 64 * 1024;

function normalizeAsset(asset, kind) {
  return {
    uri: asset.uri,
    name:
      asset.fileName ||
      (kind === "video"
        ? `evidence-video-${Date.now()}.mp4`
        : `evidence-${Date.now()}.jpg`),
    mimeType: asset.mimeType || EVIDENCE_MIME[kind],
    kind,
    fileSize: asset.fileSize || 0,
    durationMs: asset.duration || 0,
  };
}

/**
 * Choose an upload timeout based on the file's size in bytes. Falls back
 * to a generous default when the size is unknown (iOS can omit it).
 * @param {{fileSize?: number}} file
 * @returns {number} timeout in milliseconds.
 */
export function evidenceTimeoutFor(file) {
  const bytes = Number(file?.fileSize) || 0;
  if (!(bytes > 0)) return DEFAULT_UPLOAD_TIMEOUT_MS;
  const estimateMs = (bytes / UPLINK_BYTES_PER_SEC) * 1000;
  return Math.min(
    Math.max(estimateMs, MIN_UPLOAD_TIMEOUT_MS),
    MAX_UPLOAD_TIMEOUT_MS
  );
}

/**
 * True when a file exceeds the backend upload cap, so callers can warn
 * before it is ever sent.
 * @param {{fileSize?: number}} file
 * @returns {boolean}
 */
export function evidenceTooLarge(file) {
  const bytes = Number(file?.fileSize) || 0;
  return bytes > EVIDENCE_FILE_SIZE_LIMIT;
}

/**
 * Human-readable size for evidence UI ("24.5 MB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatEvidenceSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "0 MB";
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compact duration for evidence UI ("45s", "1m 05s").
 * @param {number} ms
 * @returns {string}
 */
export function formatEvidenceDuration(ms) {
  const totalSec = Math.round((Number(ms) || 0) / 1000);
  if (!(totalSec > 0)) return "0s";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

/**
 * Pessimistic upload-time estimate for a file in seconds, using the same
 * assumed uplink as the timeout math. Returns 0 when size is unknown.
 * @param {{fileSize?: number}} file
 * @returns {number} seconds.
 */
export function estimateUploadSeconds(file) {
  const bytes = Number(file?.fileSize) || 0;
  if (!(bytes > 0)) return 0;
  return bytes / UPLINK_BYTES_PER_SEC;
}

/**
 * True when, even on the pessimistic uplink, the file cannot finish
 * uploading before its size-scaled timeout expires (i.e. it exceeds the
 * 10-minute cap). Lets the UI warn the citizen before they commit to an
 * upload that is doomed on a slow link.
 * @param {{fileSize?: number}} file
 * @returns {boolean}
 */
export function evidenceUploadLikelyToTimeOut(file) {
  const estimateSeconds = estimateUploadSeconds(file);
  if (!(estimateSeconds > 0)) return false;
  return estimateSeconds * 1000 > evidenceTimeoutFor(file);
}

/**
 * Ask the user to pick photos (batch) or a video from their device.
 * @param {"photo"|"video"} kind
 * @param {{multiple?: boolean}} [opts]
 * @returns {Promise<Array<{uri, name, mimeType, kind}>>} [] if cancelled.
 */
export async function pickEvidence(kind, { multiple = false } = {}) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "video" ? ["videos"] : ["images"],
    quality: 0.8,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 0 : 1,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((asset) => normalizeAsset(asset, kind));
}

/**
 * Capture a photo or video with the in-app camera.
 * @param {"photo"|"video"} kind
 * @returns {Promise<Array<{uri, name, mimeType, kind}>>} [] if cancelled.
 */
export async function captureEvidence(kind) {
  if (Platform.OS !== "android") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === "video" ? ["videos"] : ["images"],
    quality: 0.8,
    videoMaxDuration: MAX_CAPTURE_DURATION_MS / 1000,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((asset) => normalizeAsset(asset, kind));
}

/**
 * Append picked items to the attachment list, respecting the cap.
 * @param {Array} list current attachments
 * @param {Array} items newly picked items
 * @param {number} [max=MAX_EVIDENCE]
 * @returns {Array} new list (never exceeds max).
 */
export function appendEvidence(list, items, max = MAX_EVIDENCE) {
  const room = Math.max(0, max - list.length);
  return [...list, ...items.slice(0, room)];
}

/**
 * Attach a picked file to an already-created incident.
 * @param {string} incidentId
 * @param {{uri, name, mimeType}} file
 * @returns {Promise<object>} the evidence record from the backend.
 */
export async function uploadEvidence(incidentId, file) {
  if (evidenceTooLarge(file)) {
    const message =
      `"${file.name}" is too large to upload (over ${Math.round(
        EVIDENCE_FILE_SIZE_LIMIT / (1024 * 1024)
      )}MB). ` +
      "Shorten the clip or lower the resolution.";
    throw new Error(message);
  }
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  });
  const res = await axios.post(
    `${API_BASE_URL}/api/incidents/${incidentId}/evidence`,
    formData,
    { timeout: evidenceTimeoutFor(file) }
  );
  return res.data?.data;
}

/**
 * Signal evidence-upload progress to the backend so the web dashboard
 * can tell dispatchers attachments are still inbound. Always swallows
 * errors — a status ping failing must never fail the report.
 * @param {string} incidentId
 * @param {{ evidenceUploading?: boolean, evidenceFailedCount?: number }} progress
 * @returns {Promise<void>}
 */
export async function updateEvidenceStatus(incidentId, progress) {
  try {
    await axios.post(
      `${API_BASE_URL}/api/incidents/${incidentId}/evidence-status`,
      progress,
      { timeout: 15000 }
    );
  } catch {
    // Never bubble up — this is best-effort telemetry for the dashboard.
  }
}

/**
 * Re-attempt a set of files that failed on the first pass. Sequentially
 * calls `uploadEvidence` per file (no duplicated upload logic) so the
 * retry never fans out concurrently and swamps the rate-limited
 * endpoint.
 * @param {string} incidentId
 * @param {Array<{uri, name, mimeType}>} files
 * @param {(progress: {done: number, total: number}) => void} [onProgress]
 * @returns {Promise<Array<{uri, name, mimeType}>>} files still failing.
 */
export async function retryFailedEvidence(incidentId, files, onProgress) {
  const remaining = [];
  let attemptsDone = 0;
  for (const file of files) {
    try {
      await uploadEvidence(incidentId, file);
    } catch {
      remaining.push(file);
    }
    attemptsDone += 1;
    onProgress?.({ done: attemptsDone, total: files.length });
  }
  return remaining;
}