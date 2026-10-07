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
 *   - uploadEvidenceResilient(incidentId, file) — same upload, but with
 *     bounded automatic retries (exponential backoff + jitter) for
 *     transient network/server failures and duplicate-safe reconciliation
 *     when a previous attempt's response was lost.
 *   - subscribeEvidenceProgress / getRecentEvidenceEvent — a
 *     module-level byte-progress bus. The background upload loop outlives
 *     the IncidentForm that started it (submission navigates immediately),
 *     so live progress events are broadcast here for whichever screen is
 *     mounted (DispatchTracker) to render.
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

// ---------------------------------------------------------------------------
// Automatic retry for transient upload failures.
//
// A single attempt that dies on a cold backend start, a dropped 4G
// connection, or a momentary 5xx should heal on its own — citizens should
// not have to press Retry for ordinary network weather. Total attempts are
// bounded (initial + 2 retries) with exponential backoff plus jitter so a
// burst of failed uploads doesn't hammer the shared evidence rate limiter
// in lockstep. Permanent failures (4xx validation, rate limited, wrong
// incident) are never retried — they would only burn rate-limit budget.
// ---------------------------------------------------------------------------

export const EVIDENCE_RETRY_ATTEMPTS = 3;

const RETRY_BASE_DELAY_MS = 1500;
const RETRY_MAX_DELAY_MS = 3500;
const RETRY_JITTER_MS = 500;

// Codes where the request may have REACHED the server even though no
// response arrived (response lost mid-flight). A blind re-upload after
// these can duplicate the evidence record, because the backend mints a
// fresh fileId per attempt. These trigger a reconciliation GET first.
const AMBIGUOUS_OUTCOME_CODES = new Set([
  "ETIMEDOUT",
  "ECONNABORTED",
  "ECONNRESET",
  "ESOCKETTIMEDOUT",
  "EPIPE",
]);

const TIMEOUT_CODES = new Set(["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"]);

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ERR_NETWORK",
]);

/**
 * Classify an upload failure so callers can decide whether to retry and
 * which citizen-facing message to show. Never returns raw Axios text.
 * @param {any} err
 * @returns {"too_large"|"rate_limited"|"not_found"|"server"|"timeout"|"network"|"client"|"unknown"}
 */
export function evidenceErrorKind(err) {
  if (err?.kind) return err.kind;
  const status = err?.response?.status;
  if (typeof status === "number") {
    if (status === 429) return "rate_limited";
    if (status === 404) return "not_found";
    if (status === 408) return "timeout";
    if (status >= 500) return "server";
    if (status >= 400) return "client";
    return "unknown";
  }
  const code = err?.code;
  if (TIMEOUT_CODES.has(code)) return "timeout";
  if (NETWORK_CODES.has(code)) return "network";
  if (typeof err?.message === "string" && err.message.includes("Network Error")) {
    return "network";
  }
  return "unknown";
}

/**
 * True only for failures that a bounded automatic retry can plausibly
 * fix: timeouts, dropped connections, and temporary 5xx server errors.
 * 4xx validation failures and rate limiting are permanent (for now).
 * @param {any} err
 * @returns {boolean}
 */
export function isTransientEvidenceError(err) {
  const kind = evidenceErrorKind(err);
  return kind === "timeout" || kind === "network" || kind === "server";
}

/**
 * Citizen-facing message per failure kind. No Axios/Firebase/server stack
 * text ever reaches the screen.
 * @param {any} err
 * @returns {string}
 */
export function evidenceErrorMessage(err) {
  switch (evidenceErrorKind(err)) {
    case "too_large":
      return err?.message ||
        "This file is too large to upload. Please choose a shorter or smaller video.";
    case "rate_limited":
      return "Too many uploads right now. Please wait a few minutes and retry.";
    case "not_found":
      return err?.response?.data?.message || "This report could not be found.";
    case "server":
      return "Evidence upload temporarily failed. Please try again.";
    case "timeout":
      return "Upload is taking too long. Check your connection and retry.";
    case "network":
      return "Network connection was lost during upload. You can retry.";
    case "client":
      return err?.response?.data?.message ||
        "Evidence couldn't be uploaded. You can retry.";
    default:
      return "Evidence couldn't be uploaded. You can retry.";
  }
}

/**
 * Bounded exponential backoff with jitter for the gap after a failed
 * attempt. `failedAttempt` is the 1-based attempt number that just failed
 * (1 → wait before attempt 2, 2 → wait before attempt 3).
 * @param {number} failedAttempt
 * @param {() => number} [rand] injectable for deterministic tests
 * @returns {number} delay in milliseconds (always within base..max+jitter).
 */
export function retryDelayMs(failedAttempt, rand = Math.random) {
  const n = Math.max(1, Number(failedAttempt) || 1);
  const backoff = Math.min(RETRY_BASE_DELAY_MS * 2 ** (n - 1), RETRY_MAX_DELAY_MS);
  return backoff + rand() * RETRY_JITTER_MS;
}

// ---------------------------------------------------------------------------
// Live byte-level progress bus.
//
// The incident-creation flow navigates to the Dispatch Tracker immediately
// while the evidence loop keeps running detached, so per-upload progress
// can't live in either screen's state. Events are broadcast from this
// module instead: screens subscribe while mounted, and the most recent
// event per incident is cached so a screen that mounts slightly late (or
// remounts) still adopts the current state instead of starting blank.
// ---------------------------------------------------------------------------

const progressListeners = new Set();
const lastProgressEvents = new Map(); // incidentId → { ...event, at }
const LAST_EVENT_TTL_MS = 5 * 60 * 1000;

// Retry attempt changes are reported to the dashboard via the shared,
// rate-limited evidence-status endpoint (10 req/10 min/IP together with
// the uploads themselves). Throttle those pings so a retry storm can never
// starve real upload requests of rate-limit budget.
const ATTEMPT_PING_MIN_INTERVAL_MS = 60 * 1000;
const lastAttemptPingAt = new Map();

/**
 * Subscribe to live evidence-upload events for any incident. The listener
 * receives every progress/lifecycle event (throttled by axios to ~3/s for
 * raw byte progress; lifecycle transitions always fire immediately).
 * @param {(event: object) => void} listener
 * @returns {() => void} unsubscribe.
 */
export function subscribeEvidenceProgress(listener) {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

/**
 * Most recent progress event for an incident (within the TTL), for
 * adopting the live state when a screen mounts mid-upload. Returns null
 * when nothing was heard recently.
 * @param {string} incidentId
 * @returns {object|null}
 */
export function getRecentEvidenceEvent(incidentId) {
  const hit = lastProgressEvents.get(incidentId);
  if (!hit) return null;
  if (Date.now() - hit.at > LAST_EVENT_TTL_MS) {
    lastProgressEvents.delete(incidentId);
    return null;
  }
  return hit;
}

function emitEvidenceProgress(event) {
  const stamped = { ...event, at: Date.now() };
  lastProgressEvents.set(event.incidentId, stamped);
  progressListeners.forEach((listener) => {
    try {
      listener(stamped);
    } catch {
      // A broken subscriber must never break the upload itself.
    }
  });
}

/**
 * Tell the dashboard an upload attempt beyond the first is in flight
 * (i.e. automatic retry is active) so web can render an honest
 * "retrying — attempt N/M" state. Best-effort and throttled (see
 * ATTEMPT_PING_MIN_INTERVAL_MS); attempt 1 is skipped because the server
 * already tracks evidenceUploading. Never rejects.
 * @param {string} incidentId
 * @param {number} attempt 1-based attempt currently running.
 * @param {number} total total attempts allowed.
 * @returns {Promise<void>}
 */
export function reportEvidenceAttempt(incidentId, attempt, total) {
  if (!incidentId || !(attempt >= 2)) return Promise.resolve();
  const now = Date.now();
  const last = lastAttemptPingAt.get(incidentId) || 0;
  if (now - last < ATTEMPT_PING_MIN_INTERVAL_MS) return Promise.resolve();
  lastAttemptPingAt.set(incidentId, now);
  return updateEvidenceStatus(incidentId, {
    evidenceUploading: true,
    evidenceAttempt: attempt,
    evidenceAttemptsTotal: total,
  });
}

/**
 * Whole-percent upload progress, or null when the total is unknown
 * (never fabricate a percentage from an unknown denominator).
 * @param {number} loaded
 * @param {number} total
 * @returns {number|null} 0..100.
 */
export function evidenceProgressPercent(loaded, total) {
  const t = Number(total) || 0;
  if (!(t > 0)) return null;
  const l = Math.max(0, Number(loaded) || 0);
  return Math.min(100, Math.floor((l / t) * 100));
}

// ETA guardrails: only surface a measured, meaningful estimate.
const ETA_MIN_ELAPSED_MS = 1000;
const ETA_MIN_LOADED_BYTES = 64 * 1024;
const ETA_MIN_SECONDS = 1;
const ETA_MAX_SECONDS = MAX_UPLOAD_TIMEOUT_MS / 1000;

/**
 * Remaining seconds for the CURRENT attempt, or null when an ETA would be
 * guesswork. Derived only from measured transfer state — axios's
 * speedometer-smoothed `rate` (bytes/s) and its own `estimated` seconds —
 * and hidden unless:
 *   - the total is known and we're mid-file,
 *   - the attempt has run ≥1s and moved ≥min(64KB, 5% of the file), so
 *     startup jitter can't produce a nonsense number,
 *   - the estimate lands in 1s..timeout-cap (outside it is unreliable).
 * @param {{loaded?: number, total?: number, rate?: number, estimated?: number, elapsedMs?: number}} s
 * @returns {number|null} whole seconds remaining.
 */
export function evidenceEtaSeconds(s) {
  const total = Number(s?.total) || 0;
  const loaded = Number(s?.loaded) || 0;
  if (!(total > 0) || !(loaded > 0) || loaded >= total) return null;
  if (!(Number(s?.elapsedMs) >= ETA_MIN_ELAPSED_MS)) return null;
  if (loaded < Math.min(ETA_MIN_LOADED_BYTES, total * 0.05)) return null;
  let est = Number(s?.estimated);
  if (!(est > 0)) {
    const rate = Number(s?.rate) || 0;
    if (!(rate > 0)) return null;
    est = (total - loaded) / rate;
  }
  if (!(est >= ETA_MIN_SECONDS) || est > ETA_MAX_SECONDS) return null;
  return Math.round(est);
}

/**
 * Measured duration of a completed upload, formatted for the success
 * line ("8.4 sec"; minutes fall back to the compact format). Returns
 * null for missing/zero durations so callers omit the segment rather
 * than rendering "0.0 sec".
 * @param {number} ms
 * @returns {string|null}
 */
export function formatUploadDuration(ms) {
  const n = Number(ms) || 0;
  if (!(n > 0)) return null;
  if (n < 60 * 1000) return `${(n / 1000).toFixed(1)} sec`;
  return formatEvidenceDuration(n);
}

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
 * @param {{onProgress?: (data: {loaded: number, total?: number, rate?: number, estimated?: number}) => void}} [opts]
 *        onProgress receives axios's throttled byte-progress payload for
 *        THIS attempt only (RN's XHR reports real loaded/total).
 * @returns {Promise<object>} the evidence record from the backend.
 */
export async function uploadEvidence(incidentId, file, opts = {}) {
  if (evidenceTooLarge(file)) {
    const message =
      `"${file.name}" is too large to upload (over ${Math.round(
        EVIDENCE_FILE_SIZE_LIMIT / (1024 * 1024)
      )}MB). ` +
      "Shorten the clip or lower the resolution.";
    const error = new Error(message);
    error.kind = "too_large";
    throw error;
  }
  const formData = new FormData();
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  });
  const config = { timeout: evidenceTimeoutFor(file) };
  if (opts.onProgress) {
    config.onUploadProgress = opts.onProgress;
  }
  const res = await axios.post(
    `${API_BASE_URL}/api/incidents/${incidentId}/evidence`,
    formData,
    config
  );
  return res.data?.data;
}

/**
 * Look for an evidence record that matches this file on the incident, for
 * reconciling a retry after an ambiguous failure (timeout / connection
 * reset where the previous request may have actually succeeded but its
 * response was lost). The backend stores no filename or hash, so the only
 * available signals are mimeType + sizeKb from GET /api/incidents/:id.
 * Returns null whenever the match cannot be made safely (unknown size) or
 * the lookup itself fails — callers then fall back to re-uploading.
 * @param {string} incidentId
 * @param {{uri?, name?, mimeType?, fileSize?}} file
 * @returns {Promise<object|null>} the already-stored record, or null.
 */
export async function findMatchingEvidenceRecord(incidentId, file) {
  const bytes = Number(file?.fileSize) || 0;
  if (!(bytes > 0) || !file?.mimeType) return null;
  try {
    const res = await axios.get(`${API_BASE_URL}/api/incidents/${incidentId}`, {
      timeout: 15000,
    });
    const list = res.data?.data?.evidence;
    if (!Array.isArray(list)) return null;
    const sizeKb = Math.round(bytes / 1024);
    return (
      list.find(
        (ev) => ev && ev.mimeType === file.mimeType && ev.sizeKb === sizeKb
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * Upload one file with bounded automatic retries for transient failures.
 *
 * - attempt 1 fires immediately;
 * - attempts 2 and 3 wait an exponential, jittered delay;
 * - 4xx validation / rate limiting / unknown errors fail fast (no retry);
 * - after an ambiguous failure (response possibly lost), the incident's
 *   evidence list is checked BEFORE re-uploading so a request that actually
 *   succeeded is not recorded twice — the real stored record is returned.
 *
 * Every attempt broadcasts live events on the module progress bus:
 *   uploading (loaded=0 at attempt start, then real byte progress from
 *   onUploadProgress) → retrying (before the backoff wait, carrying the
 *   NEXT attempt number so the UI restarts at 0 instead of freezing at a
 *   stale 90%) → uploading again, or done (measured duration) / failed
 *   (sanitized message) at the end.
 *
 * @param {string} incidentId
 * @param {{uri, name, mimeType, fileSize?}} file
 * @param {{attempts?: number, sleep?: (ms: number) => Promise<void>, rand?: () => number, onAttempt?: (info: {attempt: number, total: number}) => void, onProgress?: (data: object) => void, index?: number, count?: number}} [opts]
 *        index/count place this file within its batch ("2 of 3") for the UI.
 * @returns {Promise<object>} the evidence record from the backend.
 */
export async function uploadEvidenceResilient(incidentId, file, opts = {}) {
  const {
    attempts = EVIDENCE_RETRY_ATTEMPTS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    rand = Math.random,
    onAttempt,
    onProgress,
    index,
    count,
  } = opts;

  const fileBytes = Number(file?.fileSize) > 0 ? Number(file.fileSize) : undefined;
  const base = (extra) => ({
    incidentId,
    name: file?.name,
    index,
    count,
    attempts,
    ...extra,
  });

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    onAttempt?.({ attempt, total: attempts });
    const attemptStart = Date.now();
    emitEvidenceProgress(
      base({ phase: "uploading", attempt, loaded: 0, total: fileBytes })
    );
    try {
      const record = await uploadEvidence(incidentId, file, {
        onProgress: (data) => {
          const total =
            Number(data?.total) > 0 ? Number(data.total) : fileBytes;
          const event = base({
            phase: "uploading",
            attempt,
            loaded: Number(data?.loaded) || 0,
            total,
            rate: Number(data?.rate) || undefined,
            estimated: Number(data?.estimated) || undefined,
            elapsedMs: Date.now() - attemptStart,
          });
          emitEvidenceProgress(event);
          onProgress?.(data);
        },
      });
      emitEvidenceProgress(
        base({
          phase: "done",
          attempt,
          durationMs: Date.now() - attemptStart,
          loaded: fileBytes,
          total: fileBytes,
        })
      );
      return record;
    } catch (err) {
      lastError = err;
      if (!isTransientEvidenceError(err) || attempt >= attempts) {
        emitEvidenceProgress(
          base({ phase: "failed", attempt, message: evidenceErrorMessage(err) })
        );
        throw err;
      }
      // Ambiguous failure: the server may already hold these bytes.
      // Reconcile before burning another upload (and rate-limit slot).
      if (AMBIGUOUS_OUTCOME_CODES.has(err?.code)) {
        const existing = await findMatchingEvidenceRecord(incidentId, file);
        if (existing) {
          emitEvidenceProgress(base({ phase: "done", attempt, reconciled: true }));
          return existing;
        }
      }
      // Show the backoff as an explicit retry transition: the next attempt
      // starts its bar over at 0%.
      emitEvidenceProgress(
        base({
          phase: "retrying",
          attempt: attempt + 1,
          failedAttempt: attempt,
          message: evidenceErrorMessage(err),
        })
      );
      await sleep(retryDelayMs(attempt, rand));
    }
  }
  throw lastError; // unreachable — loop always returns or throws
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
 * calls `uploadEvidenceResilient` per file (no duplicated upload logic)
 * so the retry never fans out concurrently and swamps the rate-limited
 * endpoint. Each file still gets its own bounded automatic retries for
 * transient failures before it counts as remaining. Batch position
 * (index/count) is forwarded so the progress UI can say "2 of 3".
 * @param {string} incidentId
 * @param {Array<{uri, name, mimeType}>} files
 * @param {(progress: {done: number, total: number}) => void} [onProgress]
 * @param {{onAttempt?: (info: {attempt: number, total: number}) => void}} [opts]
 * @returns {Promise<Array<{uri, name, mimeType}>>} files still failing.
 */
export async function retryFailedEvidence(incidentId, files, onProgress, opts = {}) {
  const remaining = [];
  let attemptsDone = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      await uploadEvidenceResilient(incidentId, files[i], {
        ...opts,
        index: i + 1,
        count: files.length,
      });
    } catch {
      remaining.push(files[i]);
    }
    attemptsDone += 1;
    onProgress?.({ done: attemptsDone, total: files.length });
  }
  return remaining;
}