import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
  Animated,
  Easing,
} from "react-native";
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  MapPin,
  Radio,
  RefreshCw,
} from "lucide-react-native";
import axios from "axios";
import {
  MAPBOX_TOKEN,
  API_BASE_URL,
  CATEGORY_DISPLAY,
  CATEGORY_COLORS,
} from "../../lib/config";
import { THEMES, LIGHT } from "../../lib/themes";
import DispatchUnitVisual from "../components/DispatchUnitVisual";
import EvidenceGrid from "../components/EvidenceGrid";
import {
  getRecentIncidentIds,
  getFailedEvidence,
  clearFailedEvidence,
  saveFailedEvidence,
} from "../../lib/storage";
import {
  retryFailedEvidence,
  updateEvidenceStatus,
  reportEvidenceAttempt,
  subscribeEvidenceProgress,
  getRecentEvidenceEvent,
  evidenceProgressPercent,
  evidenceEtaSeconds,
  formatEvidenceSize,
  formatEvidenceDuration,
  formatUploadDuration,
} from "../../lib/evidence";
import { STEPS, stepIndexFor } from "../../lib/stepper";
import useIncidentPolling from "../hooks/useIncidentPolling";
import { Enter, MOTION, useReducedMotion } from "../../lib/motion";

let MapView;
let MapboxCamera;
let PointAnnotation;
let ShapeSource;
let LineLayer;
try {
  const mapbox = require("@rnmapbox/maps");
  const resolved = mapbox.default || mapbox;
  MapView = resolved.MapView;
  MapboxCamera = resolved.Camera;
  PointAnnotation = resolved.PointAnnotation;
  ShapeSource = resolved.ShapeSource;
  LineLayer = resolved.LineLayer;
} catch {
  // Mapbox not available
}

// How long the "✓ Evidence uploaded" success banner stays on screen
// after an upload settles. Plain wall-clock ms, armed by the effect in
// the component — deliberately independent of the 10s polling cycle.
const SUCCESS_BANNER_MS = 3000;

function statusPillColors(status) {
  const bg =
    status === "Resolved"
      ? THEMES.mintGreen
      : status === "Dispatched"
      ? "#FBBF24"
      : status === "En Route"
      ? THEMES.floodBlue
      : THEMES.gray;
  const text = status === "Pending" ? THEMES.white : THEMES.darkNavy;
  return { bg, text };
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// LIVE badge dot: a slow breathing pulse that signals the screen is
// polling in real time. Purely decorative — the LIVE text carries the
// meaning — and it freezes to a solid dot under reduce motion.
function LiveDot() {
  const reduced = useReducedMotion();
  const [glow] = React.useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduced) {
      glow.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 0.3,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, glow]);

  return <Animated.View style={[styles.liveDot, { opacity: glow }]} />;
}

export default function DispatchTracker({
  incidentId: propId,
  initialIncident,
  onBack,
}) {
  const [incidentId, setIncidentId] = useState(propId);
  // true  → incident-card list (no bare-ID picker; the citizen picks a card)
  // false → detailed tracking view for the selected incident
  const [showList, setShowList] = useState(!propId);
  const [summaries, setSummaries] = useState([]);
  const [listLoading, setListLoading] = useState(!propId);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [routeTick, setRouteTick] = useState(0);
  const cameraRef = useRef(null);

  // Immediately use the incident passed in from the submit screen so the
  // map shows the pinned location + route without waiting for the poll.
  // Polling still runs in parallel to pick up live status updates.
  const { incident, error, notFound, refetch } = useIncidentPolling(incidentId);
  const liveIncident = incident || initialIncident;

  // Evidence-upload progress — read from the same poll response the web
  // dashboard uses. No new hook: this is pure display from polling data.
  const isUploading = liveIncident?.evidenceUploading === true;
  const evidenceCompleted = (liveIncident?.evidence ?? []).length;
  const evidenceExpected = liveIncident?.evidenceExpectedCount ?? 0;
  const evidenceFailed = liveIncident?.evidenceFailedCount ?? 0;
  // Stored evidence for the detail card below — same records History
  // shows, straight from the poll response (GET /api/incidents/:id).
  const uploadedEvidence = liveIncident?.evidence ?? [];

  // Transient retry session: { total, done, remaining }. Local component
  // state only — the persisted failed files (AsyncStorage) are the
  // durable source; the poll reflects results within 10s.
  const [retryState, setRetryState] = useState(null);
  const [retrying, setRetrying] = useState(false);

  // Live byte-level progress from the module-level bus in lib/evidence.
  // The upload loop runs detached from the (already-unmounted) IncidentForm,
  // so this subscription — plus the cached last event for late mounts — is
  // the only in-app source of real per-attempt progress.
  const [progressEvent, setProgressEvent] = useState(() =>
    getRecentEvidenceEvent(incidentId)
  );
  // True once the 3-second "✓ Evidence uploaded" window has elapsed —
  // see the success-banner effect below for the full lifecycle.
  const [successDismissed, setSuccessDismissed] = useState(false);
  // Adopt the cached event when the selected incident changes (list →
  // detail), using the render-phase pattern rather than setState-in-effect.
  const [seenIncidentId, setSeenIncidentId] = useState(incidentId);
  if (seenIncidentId !== incidentId) {
    setSeenIncidentId(incidentId);
    setProgressEvent(getRecentEvidenceEvent(incidentId));
    setSuccessDismissed(false);
  }

  useEffect(() => {
    if (!incidentId) return undefined;
    const unsubscribe = subscribeEvidenceProgress((event) => {
      if (event.incidentId === incidentId) {
        setProgressEvent(event);
        // A settled upload re-arms the success-banner window (the timer
        // effect below restarts because progressEvent changed).
        if (event.phase === "done") setSuccessDismissed(false);
      }
    });
    return unsubscribe;
  }, [incidentId]);

  // Only active phases drive the progress panel; terminal states fall
  // through to the poll-driven banners (✓ count / ⚠ failed + Retry).
  const showLiveProgress =
    !!liveIncident &&
    !!progressEvent &&
    (progressEvent.phase === "uploading" || progressEvent.phase === "retrying");

  // Settled-success condition for the "✓ Evidence uploaded" banner:
  // there is stored evidence, nothing failed, and no retry is pending.
  const successReady =
    !!liveIncident &&
    evidenceCompleted > 0 &&
    evidenceFailed === 0 &&
    !(retryState && retryState.remaining > 0);

  // Success banner auto-dismiss: visible for ~3 seconds after the
  // upload actually settled, then hidden until the next success.
  //   - The clock only runs when no upload/retry is in flight (poll
  //     flag or live bus phase), so the banner can never be dismissed
  //     mid-upload — the timer is suspended and a full window is
  //     armed again once the work finishes.
  //   - A fresh "done" event re-arms the window (set in the bus
  //     subscription above), so repeated successes each get their own
  //     3 seconds.
  //   - The effect's cleanup clears the timeout on every dependency
  //     change and on unmount/navigation — no stale timers, no
  //     setState-after-unmount. A plain poll tick changes none of the
  //     deps, so the 10-second polling cycle never restarts the clock.
  useEffect(() => {
    if (!successReady || isUploading || retrying || showLiveProgress) {
      return undefined;
    }
    const timer = setTimeout(() => setSuccessDismissed(true), SUCCESS_BANNER_MS);
    return () => clearTimeout(timer);
  }, [successReady, isUploading, retrying, showLiveProgress, progressEvent]);

  const progressPercent =
    progressEvent?.phase === "uploading"
      ? evidenceProgressPercent(progressEvent.loaded, progressEvent.total)
      : null;
  const progressEtaSeconds =
    progressEvent?.phase === "uploading"
      ? evidenceEtaSeconds(progressEvent)
      : null;

  // Success sub-line: measured bytes + duration of the last completed
  // upload ("3.0 MB • 8.4 sec"). Reconciled files have no measured
  // upload, so they show nothing extra rather than a fabricated time.
  let doneSummary = null;
  if (progressEvent?.phase === "done" && !progressEvent.reconciled) {
    const parts = [];
    if (progressEvent.total > 0) {
      parts.push(formatEvidenceSize(progressEvent.total));
    }
    const duration = formatUploadDuration(progressEvent.durationMs);
    if (duration) parts.push(duration);
    if (parts.length > 0) doneSummary = parts.join(" • ");
  }

  const handleRetry = async () => {
    if (retrying || !incidentId) return;
    const files = await getFailedEvidence(incidentId);
    if (files.length === 0) return;
    setRetrying(true);
    setRetryState({ total: files.length, done: 0, remaining: files.length });
    // Flip the shared progress flag so the web dashboard shows the
    // attachments as inbound again while the manual retry runs.
    await updateEvidenceStatus(incidentId, {
      evidenceUploading: true,
      evidenceAttempt: 1,
    });
    const stillFailing = await retryFailedEvidence(
      incidentId,
      files,
      ({ done, total }) =>
        setRetryState({ total, done, remaining: total - done }),
      {
        onAttempt: ({ attempt, total }) =>
          reportEvidenceAttempt(incidentId, attempt, total),
      }
    );
    await saveFailedEvidence(incidentId, stillFailing);
    await updateEvidenceStatus(incidentId, {
      evidenceUploading: false,
      evidenceFailedCount: stillFailing.length,
      evidenceAttempt: 1,
    });
    setRetryState({
      total: files.length,
      done: files.length - stillFailing.length,
      remaining: stillFailing.length,
    });
    setRetrying(false);
    if (stillFailing.length === 0) {
      await clearFailedEvidence(incidentId);
    }
  };

  // Responding station lives at the TOP level of the incident
  // (incident.station.coords), not under incident.dispatch.
  const stationCoords =
    liveIncident?.station?.coords &&
    typeof liveIncident.station.coords.lat === "number" &&
    typeof liveIncident.station.coords.lng === "number"
      ? liveIncident.station.coords
      : null;
  const stationLng = stationCoords?.lng;
  const stationLat = stationCoords?.lat;

  const incidentLng = liveIncident?.location?.longitude;
  const incidentLat = liveIncident?.location?.latitude;

  // Real driving geometry served by GET /api/routes (or straight-line
  // fallback if that fetch fails). Drawn with the existing ShapeSource/
  // LineLayer — never computed client-side. Stored alongside the incident
  // ID it was fetched for so a stale polyline never shows for a different
  // incident while a newer request is in flight.
  const [routeState, setRouteState] = useState(null);
  const routeCoords =
    routeState && routeState.incidentId === incidentId
      ? routeState.coords
      : null;
  // Pending = inputs are ready but this incident's route hasn't landed
  // yet (either still in flight or about to start). Derived, not state,
  // so no stale flags survive an incident switch.
  const routeInputsReady =
    !!stationCoords && incidentLat != null && incidentLng != null;
  const routePending =
    routeInputsReady &&
    (!routeState || routeState.incidentId !== incidentId);

  // Arrival ETA has two sources with the same meaning (driving time from
  // GET /api/routes): the live route fetch (freshest, matches the web
  // dashboard) and the server-computed minutes stamped on the dispatch at
  // dispatch time. Prefer the live value so the row updates if a route is
  // ever recomputed; fall back to the dispatch stamp; else "—".
  const arrivalEtaMinutes = liveIncident?.dispatch?.arrivalEtaMinutes;
  const routeDurationSeconds =
    routeState && routeState.incidentId === incidentId
      ? routeState.durationSeconds
      : null;
  const drivingEtaValue =
    routeDurationSeconds != null
      ? `~${Math.round(routeDurationSeconds / 60)} min`
      : arrivalEtaMinutes != null
      ? `~${arrivalEtaMinutes} min`
      : "—";

  useEffect(() => {
    if (!stationCoords || incidentLat == null || incidentLng == null) {
      return undefined;
    }
    let cancelled = false;
    const fallback = [
      [stationCoords.lng, stationCoords.lat],
      [incidentLng, incidentLat],
    ];
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/routes`, {
          params: {
            fromLat: stationCoords.lat,
            fromLng: stationCoords.lng,
            toLat: incidentLat,
            toLng: incidentLng,
          },
        });
        if (cancelled) return;
        const data = res.data?.data;
        const coords = data?.geometry?.coordinates;
        setRouteState({
          incidentId,
          coords:
            Array.isArray(coords) && coords.length >= 2 ? coords : fallback,
          distanceMeters:
            typeof data?.distanceMeters === "number"
              ? data.distanceMeters
              : null,
          durationSeconds:
            typeof data?.durationSeconds === "number"
              ? data.durationSeconds
              : null,
        });
      } catch {
        if (!cancelled) setRouteState({ incidentId, coords: fallback });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationLat, stationLng, incidentLat, incidentLng, incidentId, routeTick]);

  // Stable camera target so re-renders (10s polling) don't re-center the
  // map over the user's manual pan/swipe. Only recompute when the actual
  // coordinates change (primitive deps keep identity stable per incident).
  const cameraDefaults = React.useMemo(() => {
    if (!liveIncident) return null;
    if (stationCoords) {
      return {
        centerCoordinate: [
          (stationLng + (incidentLng ?? 0)) / 2,
          (stationLat + (incidentLat ?? 0)) / 2,
        ],
        zoomLevel: 13,
      };
    }
    return {
      centerCoordinate: [incidentLng ?? 0, incidentLat ?? 0],
      zoomLevel: 15,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationLat, stationLng, incidentLng, incidentLat]);

  // Load the citizen's tracked incidents as cards. The local storage list
  // of IDs is the source of WHICH incidents exist; each ID is enriched via
  // the existing per-incident endpoint (GET /api/incidents/:id) — the
  // dispatcher-only list endpoint is never touched. IDs that fail to fetch
  // still get an ID-only card (no invented details) and remain tappable.
  const loadSummaries = useCallback(async () => {
    const ids = await getRecentIncidentIds();
    if (ids.length === 0) {
      setSummaries([]);
      return;
    }
    const results = await Promise.all(
      ids.map((id) =>
        axios
          .get(`${API_BASE_URL}/api/incidents/${id}`)
          .then((res) => {
            const data = res.data?.data;
            return data
              ? { ...data, incidentId: data.incidentId || id }
              : { incidentId: id };
          })
          .catch(() => ({ incidentId: id }))
      )
    );
    setSummaries(results);
  }, []);

  // Initial card-list load (list mode only; the submission flow with
  // propId goes straight to the detail view as before).
  useEffect(() => {
    if (propId || initialIncident) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      await loadSummaries();
      if (!cancelled) setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [propId, initialIncident, loadSummaries]);

  async function onRefreshList() {
    setListRefreshing(true);
    try {
      await loadSummaries();
    } finally {
      setListRefreshing(false);
    }
  }

  // Detail refresh: one immediate pass of the SAME per-incident fetch the
  // 10s poll runs (refetch) plus a route re-computation via GET /api/routes.
  // The polling interval itself is untouched and the selected incident
  // stays selected.
  async function onRefreshDetail() {
    setDetailRefreshing(true);
    setRouteTick((tick) => tick + 1);
    try {
      await refetch();
    } finally {
      setDetailRefreshing(false);
    }
  }

  function handleSelectCard(id) {
    setIncidentId(id);
    setShowList(false);
  }

  // Back out of the detail view into the card list without dropping the
  // freshest polled data: merge the selected incident's latest state into
  // its card (drop it entirely if polling marked it resolved/removed).
  function backToList() {
    setSummaries((prev) => {
      if (notFound) {
        return prev.filter((s) => s.incidentId !== incidentId);
      }
      if (!incident || incident.incidentId !== incidentId) return prev;
      if (incident.status === "Resolved") {
        return prev.filter((s) => s.incidentId !== incidentId);
      }
      return prev.map((s) => (s.incidentId === incidentId ? incident : s));
    });
    setIncidentId(null);
    setShowList(true);
  }

  function handleBackPress() {
    // Detail reached from the card list → return to the list.
    // Submission flow (propId) or the list itself → App-level onBack.
    if (!propId && !showList) {
      backToList();
      return;
    }
    onBack();
  }

  // Android hardware back mirrors the header button while the detailed
  // tracking view is open; otherwise App.js handles it (history/home).
  useEffect(() => {
    if (propId || showList) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backToList();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propId, showList]);

  const currentStepIdx = liveIncident ? stepIndexFor(liveIncident.status) : -1;

  const categoryKey = (liveIncident?.category || "").toUpperCase();
  const categoryLabel = CATEGORY_DISPLAY[categoryKey] || liveIncident?.category;
  const categoryColor = CATEGORY_COLORS[categoryKey] || THEMES.crimeSlate;
  const pill = statusPillColors(liveIncident?.status);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {!showList && (
            <Text style={styles.refNumber}>{incidentId || "New"}</Text>
          )}
          <Text style={styles.headerTitle}>Dispatch Tracker</Text>
        </View>
        {!showList && (
          <View style={styles.liveBadge}>
            <LiveDot />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {showList ? (
        listLoading ? (
          <View
            style={styles.loadingContainer}
            testID="picker-loading"
            accessibilityLabel="Loading recent reports"
            accessible
          >
            <ActivityIndicator color={THEMES.mintGreen} size="large" />
            <Text style={styles.loadingText}>Loading your reports...</Text>
          </View>
        ) : summaries.length === 0 ? (
          <View style={styles.emptyState} testID="track-empty-state">
            <View style={styles.emptyPanel}>
              <Radio size={48} color={THEMES.mintGreen} />
              <Text style={styles.emptyTitle}>No Recent Incidents</Text>
              <Text style={styles.emptyText}>
                Your recent reports will appear here when available.
              </Text>
            </View>
          </View>
        ) : (
          <ScrollView
            testID="track-list-scroll"
            style={styles.scroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={listRefreshing}
                onRefresh={onRefreshList}
                tintColor={THEMES.darkNavy}
              />
            }
          >
            {summaries.map((sum, sumIndex) => {
              const sumKey = (sum.category || "").toUpperCase();
              const sumLabel = CATEGORY_DISPLAY[sumKey] || sum.category;
              const sumColor = CATEGORY_COLORS[sumKey] || THEMES.crimeSlate;
              const sumPill = statusPillColors(sum.status);
              return (
                <Enter
                  key={sum.incidentId}
                  delay={Math.min(sumIndex, 8) * 40}
                  dy={10}
                  duration={MOTION.card}
                >
                <TouchableOpacity
                  testID={`track-card-${sum.incidentId}`}
                  style={[
                    styles.listCard,
                    { borderLeftWidth: 4, borderLeftColor: sumColor },
                  ]}
                  onPress={() => handleSelectCard(sum.incidentId)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardRef}>{sum.incidentId}</Text>
                    {sum.status ? (
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: sumPill.bg },
                        ]}
                      >
                        <Text
                          style={[styles.statusText, { color: sumPill.text }]}
                        >
                          {sum.status.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {sumLabel ? (
                    <Text style={styles.listCardCategory}>{sumLabel}</Text>
                  ) : null}
                  {sum.location?.address ? (
                    <View style={styles.listMetaRow}>
                      <MapPin size={13} color={LIGHT.textSecondary} />
                      <Text style={styles.listMetaText} numberOfLines={2}>
                        {sum.location.address}
                      </Text>
                    </View>
                  ) : null}
                  {sum.timestamp ? (
                    <View style={styles.listMetaRow}>
                      <Text style={styles.listMetaText}>
                        Reported {formatTimestamp(sum.timestamp)}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                </Enter>
              );
            })}
          </ScrollView>
        )
      ) : (
        <>
          {notFound && (
            <Enter dy={6} duration={MOTION.small}>
              <View style={styles.notFoundBanner}>
                <Text style={styles.notFoundTitle}>Report no longer tracked</Text>
                <Text style={styles.notFoundText}>
                  This report is no longer available from the dispatcher
                  system. You can still see it in your history.
                </Text>
              </View>
            </Enter>
          )}

          {error && (
            <Enter dy={6} duration={MOTION.small}>
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </Enter>
          )}

          {!liveIncident && !error && !notFound && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={THEMES.mintGreen} size="large" />
              <Text style={styles.loadingText}>Fetching status...</Text>
            </View>
          )}

          {/* Live byte-level upload panel (module progress bus). Falls
              back to the poll-derived one-liner when no live events are
              available (e.g. re-opened after the loop finished its last
              emit, or an upload faster than the first progress tick). */}
          {liveIncident && showLiveProgress && (
            <Enter dy={6} duration={MOTION.small}>
              <View style={styles.uploadBanner} testID="evidence-progress-panel">
              <Text style={styles.uploadText}>
                {progressEvent.phase === "retrying"
                  ? "Connection interrupted — retrying…"
                  : `Uploading evidence${
                      progressEvent.count > 1 && progressEvent.index
                        ? ` (${progressEvent.index} of ${progressEvent.count})`
                        : ""
                    }…`}
              </Text>
              {progressEvent.phase === "retrying" ? (
                <Text style={styles.progressSubText}>
                  Attempt {progressEvent.attempt} of {progressEvent.attempts}
                </Text>
              ) : (
                <>
                  {progressPercent !== null && (
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${progressPercent}%` },
                        ]}
                        testID="evidence-progress-bar"
                      />
                    </View>
                  )}
                  <Text style={styles.progressSubText}>
                    {progressPercent !== null && progressEvent.total > 0
                      ? `${progressPercent}% • ${formatEvidenceSize(
                          progressEvent.loaded
                        )} / ${formatEvidenceSize(progressEvent.total)}`
                      : progressEvent.loaded > 0
                      ? `${formatEvidenceSize(progressEvent.loaded)} sent…`
                      : "Starting upload…"}
                    {progressEtaSeconds !== null
                      ? ` • About ${
                          progressEtaSeconds < 60
                            ? `${progressEtaSeconds} sec`
                            : formatEvidenceDuration(progressEtaSeconds * 1000)
                        } remaining`
                      : ""}
                  </Text>
                </>
              )}
              </View>
            </Enter>
          )}

          {liveIncident && isUploading && !showLiveProgress && (
            <Enter dy={6} duration={MOTION.small}>
              <View style={styles.uploadBanner}>
                <Text style={styles.uploadText}>
                  ⏳ Attaching evidence {evidenceCompleted}/{evidenceExpected}…
                </Text>
              </View>
            </Enter>
          )}

          {liveIncident &&
            !isUploading &&
            !retrying &&
            !successDismissed &&
            evidenceCompleted > 0 &&
            evidenceFailed === 0 &&
            !(retryState && retryState.remaining > 0) && (
              <Enter dy={6} duration={MOTION.small}>
                <View style={styles.uploadBanner}>
                  <Text style={styles.uploadText}>
                    ✓ Evidence uploaded ({evidenceCompleted})
                  </Text>
                  {doneSummary && (
                    <Text style={styles.progressSubText}>{doneSummary}</Text>
                  )}
                </View>
              </Enter>
            )}

          {liveIncident && retrying && retryState && (
            <Enter dy={6} duration={MOTION.small}>
              <View style={styles.uploadBanner}>
                <Text style={styles.uploadText}>
                  ⏳ Retrying {retryState.done}/{retryState.total}…
                </Text>
              </View>
            </Enter>
          )}

          {liveIncident &&
            !retrying &&
            (retryState ? retryState.remaining : evidenceFailed) > 0 && (
              <Enter dy={6} duration={MOTION.small}>
                <View style={styles.failedBanner}>
                  <Text style={styles.failedText}>
                    ⚠{" "}
                    {retryState ? retryState.remaining : evidenceFailed}{" "}
                    attachment
                    {(retryState ? retryState.remaining : evidenceFailed) === 1
                      ? ""
                      : "s"}{" "}
                    failed — your report still came through.
                  </Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={handleRetry}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Retry failed attachments"
                  >
                    <RefreshCw size={14} color={THEMES.fireRed} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              </Enter>
            )}

          {liveIncident && (
            <View style={styles.trackerBody}>
              <View>
                {MAPBOX_TOKEN && MapView ? (
                  <View style={styles.mapSection}>
                    <MapView
                      style={styles.heroMap}
                      styleURL="mapbox://styles/mapbox/streets-v12"
                      scrollEnabled={true}
                      pitchEnabled={true}
                      rotateEnabled={true}
                      compassEnabled={true}
                      requestDisallowInterceptTouchEvent={true}
                    >
                      {MapboxCamera && (
                        <MapboxCamera
                          ref={cameraRef}
                          defaultSettings={cameraDefaults}
                        />
                      )}
                      {ShapeSource &&
                        LineLayer &&
                        routeCoords &&
                        stationCoords && (
                        <ShapeSource
                          id="routeSource"
                          shape={{
                            type: "Feature",
                            properties: {},
                            geometry: {
                              type: "LineString",
                              coordinates: routeCoords,
                            },
                          }}
                        >
                          <LineLayer
                            id="routeLine"
                            style={{
                              lineColor: "#2f80ed",
                              lineWidth: 3,
                              lineDasharray: [0.5, 1.5],
                              lineCap: "round",
                              lineJoin: "round",
                            }}
                          />
                        </ShapeSource>
                      )}
                      {PointAnnotation && stationCoords && (
                        <PointAnnotation
                          id="station-location"
                          coordinate={[stationCoords.lng, stationCoords.lat]}
                          anchor={{ x: 0.5, y: 0.5 }}
                        >
                          <View style={styles.pinWrap}>
                            <View style={styles.stationPin} />
                          </View>
                        </PointAnnotation>
                      )}
                      {PointAnnotation && (
                        <PointAnnotation
                          id="incident-location"
                          coordinate={[
                            liveIncident.location.longitude,
                            liveIncident.location.latitude,
                          ]}
                          anchor={{ x: 0.5, y: 0.5 }}
                        >
                          <View style={styles.pinWrap}>
                            <View style={styles.incidentPin} />
                          </View>
                        </PointAnnotation>
                      )}
                    </MapView>
                    <View style={styles.addressOverlay} pointerEvents="none">
                      <MapPin size={13} color={THEMES.floodBlue} />
                      <Text style={styles.addressText} numberOfLines={1}>
                        {liveIncident.location.address}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.placeholderSection}>
                    <MapPin size={28} color={THEMES.mintGreen} />
                    <Text style={styles.placeholderText}>
                      {liveIncident.location.address}
                    </Text>
                  </View>
                )}
                {routePending && (
                  <View
                    style={styles.routeChip}
                    testID="route-chip"
                    accessible
                    accessibilityLabel="Calculating route"
                  >
                    <Text style={styles.routeChipText}>
                      Calculating route…
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                testID="track-detail-scroll"
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={detailRefreshing}
                    onRefresh={onRefreshDetail}
                    tintColor={THEMES.darkNavy}
                  />
                }
              >
          {/* Status change re-runs a quick settle so progress reads as
              motion, not a jump. Keyed on the current step only. */}
          <Enter key={currentStepIdx} dy={4} duration={MOTION.small}>
            <View style={styles.stepper}>
              {STEPS.map((step, idx) => {
                const isComplete = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <React.Fragment key={step}>
                    <View style={styles.stepItem}>
                      <View
                        style={[
                          styles.stepCircle,
                          isComplete && styles.stepCircleComplete,
                          isCurrent && styles.stepCircleCurrent,
                        ]}
                      >
                        {isComplete ? (
                          <CheckCircle2
                            size={16}
                            color={isCurrent ? THEMES.white : THEMES.darkNavy}
                          />
                        ) : (
                          <Circle size={16} color={LIGHT.textSecondary} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stepLabel,
                          isComplete && styles.stepLabelComplete,
                        ]}
                      >
                        {step}
                      </Text>
                    </View>
                    {idx < STEPS.length - 1 && (
                      <View
                        style={[
                          styles.stepLine,
                          idx < currentStepIdx && styles.stepLineComplete,
                        ]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </Enter>

              <DispatchUnitVisual
                category={categoryKey}
                status={liveIncident?.status}
              />

              <Enter dy={10} duration={MOTION.card}>
                <View
                  testID="track-incident-card"
                  style={[
                    styles.card,
                    { borderLeftWidth: 4, borderLeftColor: categoryColor },
                  ]}
                >
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardRef}>{liveIncident.incidentId}</Text>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: pill.bg },
                    ]}
                  >
                    <Text
                      style={[styles.statusText, { color: pill.text }]}
                    >
                      {liveIncident.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardTitle}>Incident Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{categoryLabel}</Text>
                </View>
                {liveIncident.location?.address ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>
                      {liveIncident.location.address}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone Number</Text>
                  <Text style={styles.detailValue}>
                    {liveIncident.citizenPhone || "—"}
                  </Text>
                </View>
                {liveIncident.dispatch && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Station</Text>
                      <Text style={styles.detailValue}>
                        {liveIncident.dispatch.stationName}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Unit</Text>
                      <Text style={styles.detailValue}>
                        {liveIncident.dispatch.assignedUnit}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Driving ETA</Text>
                      <Text style={styles.detailValue} testID="driving-eta">
                        {drivingEtaValue}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Station readiness</Text>
                      <Text style={styles.detailValue} testID="station-readiness">
                        {liveIncident.dispatch.estimatedTurnout}
                      </Text>
                    </View>
                  </>
                )}
                {liveIncident.notes ? (
                  <View style={styles.notesSection}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.notesText}>{liveIncident.notes}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reported</Text>
                  <Text style={styles.detailValue}>
                    {new Date(liveIncident.timestamp).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Text>
                </View>
                </View>
              </Enter>

              {/* Uploaded evidence — same records/visuals as History.
                  Appears only when the poll reports stored evidence and
                  refreshes with the next poll after an upload lands. */}
              {uploadedEvidence.length > 0 && (
                <View style={styles.card} testID="track-evidence-card">
                  <Text style={styles.cardTitle}>Evidence</Text>
                  <EvidenceGrid evidence={uploadedEvidence} />
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: THEMES.darkNavy,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
  },
  refNumber: {
    fontSize: 11,
    color: THEMES.mintGreen,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    color: THEMES.white,
    fontWeight: "700",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: THEMES.mintGreen,
  },
  liveText: {
    color: THEMES.mintGreen,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  notFoundBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
  },
  notFoundTitle: {
    color: THEMES.medicalOrange,
    fontSize: 14,
    fontWeight: "700",
  },
  notFoundText: {
    color: LIGHT.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  errorText: {
    color: THEMES.fireRed,
    fontSize: 13,
  },
  uploadBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "rgba(244,180,0,0.12)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(244,180,0,0.3)",
  },
  uploadText: {
    // Dark amber for AA text contrast on the 12%-amber tint (the old
    // #F4B400 was ~1.7:1). Tint/glyph/copy/timing unchanged.
    color: "#8A5A00",
    fontSize: 13,
    fontWeight: "600",
  },
  progressSubText: {
    color: "#8A5A00",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(244,180,0,0.25)",
    marginTop: 8,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F4B400",
  },
  failedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  failedText: {
    color: THEMES.fireRed,
    fontSize: 13,
  },
  retryBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: THEMES.fireRed,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  retryBtnText: {
    color: THEMES.fireRed,
    fontSize: 13,
    fontWeight: "700",
  },
  loadingContainer: {
    alignItems: "center",
    marginTop: 60,
    gap: 10,
  },
  loadingText: {
    color: THEMES.gray,
    fontSize: 13,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 0,
  },
  stepItem: {
    alignItems: "center",
    gap: 6,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: LIGHT.inputBg,
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleComplete: {
    backgroundColor: THEMES.mintGreen,
  },
  stepCircleCurrent: {
    backgroundColor: THEMES.mintGreen,
    shadowColor: THEMES.mintGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  stepLabel: {
    fontSize: 10,
    color: LIGHT.textSecondary,
    fontWeight: "600",
  },
  stepLabelComplete: {
    color: THEMES.darkNavy,
    fontWeight: "800",
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: LIGHT.border,
    marginBottom: 20,
    marginHorizontal: 4,
  },
  stepLineComplete: {
    backgroundColor: THEMES.mintGreen,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    color: LIGHT.textPrimary,
    fontWeight: "700",
  },
  cardRef: {
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
    color: LIGHT.textPrimary,
    flexShrink: 1,
  },
  dispatchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(47,128,237,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dispatchChipText: {
    fontSize: 10,
    color: "#2f80ed",
    fontWeight: "700",
  },
  mapSection: {
    height: 240,
    backgroundColor: LIGHT.inputBg,
  },
  heroMap: {
    flex: 1,
  },
  addressOverlay: {
    position: "absolute",
    left: 12,
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: LIGHT.textPrimary,
    fontWeight: "600",
  },
  placeholderSection: {
    height: 200,
    backgroundColor: LIGHT.inputBg,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  placeholderText: {
    color: LIGHT.textSecondary,
    fontSize: 12,
  },
  pinWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  stationPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2f80ed",
  },
  incidentPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e4572e",
  },
  trackerBody: {
    flex: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    // Top-align so a wrapped value grows downward while its label stays
    // on the first line (center would float the label mid-value).
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    // Predictable label column: never shrinks into the value's space.
    flexShrink: 0,
  },
  detailValue: {
    // Value column: takes the remaining row width and wraps inside it —
    // long station names/addresses can no longer overflow the card or
    // collide with the label. Short values stay right-aligned.
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    color: LIGHT.textPrimary,
    fontWeight: "600",
    textAlign: "right",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  notesSection: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
  },
  notesText: {
    fontSize: 13,
    color: LIGHT.textPrimary,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  emptyPanel: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    width: "100%",
    backgroundColor: LIGHT.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LIGHT.border,
    borderStyle: "dashed",
  },
  emptyTitle: {
    fontSize: 16,
    color: LIGHT.textPrimary,
    fontWeight: "700",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    textAlign: "center",
  },
  routeChip: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    elevation: 5,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  routeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: LIGHT.textPrimary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardCategory: {
    fontSize: 15,
    fontWeight: "700",
    color: LIGHT.textPrimary,
    marginTop: 10,
  },
  listMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  listMetaText: {
    flex: 1,
    fontSize: 12,
    color: LIGHT.textSecondary,
  },
});
