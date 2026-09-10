import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { API_BASE_URL } from "./config";

/**
 * lib/evidence.js
 * Photo/video evidence helpers for the Incident Form:
 *   - pickEvidence(kind) — opens the system picker for a photo or video
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

/**
 * Ask the user to pick one photo or video from their device.
 * @param {"photo"|"video"} kind
 * @returns {Promise<{uri, name, mimeType, kind}|null>} null if cancelled.
 */
export async function pickEvidence(kind) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "video" ? ["videos"] : ["images"],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
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