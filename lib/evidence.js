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
  };
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
    videoMaxDuration: 30,
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
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  });
  const res = await axios.post(
    `${API_BASE_URL}/api/incidents/${incidentId}/evidence`,
    formData,
    { timeout: 30000 }
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