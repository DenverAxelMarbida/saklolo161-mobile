import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  Animated,
} from "react-native";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Camera,
  Video,
  Images,
  Send,
  X,
} from "lucide-react-native";
import axios from "axios";
import * as Location from "expo-location";
import { API_BASE_URL, MAPBOX_TOKEN, CATEGORY_DISPLAY, CATEGORY_COLORS } from "../../lib/config";
import { THEMES, LIGHT } from "../../lib/themes";
import { getSavedPhone, savePhone, saveIncidentId, saveFailedEvidence, clearFailedEvidence } from "../../lib/storage";
import { Enter, MOTION, usePressScale } from "../../lib/motion";
import {
  pickEvidence,
  captureEvidence,
  appendEvidence,
  uploadEvidenceResilient,
  evidenceErrorMessage,
  updateEvidenceStatus,
  retryFailedEvidence,
  reportEvidenceAttempt,
  evidenceTooLarge,
  evidenceUploadLikelyToTimeOut,
  formatEvidenceSize,
  formatEvidenceDuration,
  MAX_CAPTURE_DURATION_MS,
  MAX_EVIDENCE,
} from "../../lib/evidence";

let MapView;
let MapboxCamera;
let PointAnnotation;
try {
  const mapbox = require("@rnmapbox/maps");
  const resolved = mapbox.default || mapbox;
  MapView = resolved.MapView;
  MapboxCamera = resolved.Camera;
  PointAnnotation = resolved.PointAnnotation;
} catch {
  // Mapbox not available
}

const INITIAL_LOCATION = {
  latitude: 14.6507,
  longitude: 121.1029,
  address: "Marikina City, Philippines",
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function IncidentForm({ selectedCategory, onBack, onSubmit }) {
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState(INITIAL_LOCATION);
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("locating"); // "locating" | "locked" | "failed"
  const [evidence, setEvidence] = useState([]);
  const [evidenceUploadFailed, setEvidenceUploadFailed] = useState(0);
  const [chooser, setChooser] = useState(null); // null | "photo" | "video"
  const [refreshing, setRefreshing] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // null | "phone" | "notes"
  const submitScale = usePressScale(0.98);
  const gpsAttempts = useRef(0);
  const cameraRef = useRef(null);

  function onMapLoaded() {
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 14,
        animationMode: "none",
      });
    }
  }

  useEffect(() => {
    if (cameraRef.current && gpsStatus === "locked") {
      cameraRef.current.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 14,
        animationMode: "flyTo",
      });
    }
  }, [location.latitude, location.longitude, gpsStatus]);

  async function acquireGps() {
    setGpsStatus("locating");
    gpsAttempts.current = 0;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsStatus("failed");
        return;
      }

      let pos = null;
      while (gpsAttempts.current < 3 && !pos) {
        gpsAttempts.current += 1;
        try {
          pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 8000,
            maximumAge: 10000,
          });
        } catch {
          // attempt failed — retry after a short pause for the next loop
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      if (!pos) {
        setGpsStatus("failed");
        return;
      }

      const { latitude, longitude } = pos.coords;

      let address = "Marikina City, Philippines";
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode.length > 0) {
          const g = geocode[0];
          address = [g.name, g.street, g.city, g.region].filter(Boolean).join(", ");
        }
      } catch {
        // geocode failed, use default
      }

      setLocation({ latitude, longitude, address });
      setGpsStatus("locked");
    } catch {
      setGpsStatus("failed");
    }
  }

  useEffect(() => {
    (async () => {
      const saved = await getSavedPhone();
      if (saved) setPhone(saved);
      acquireGps();
    })();
  }, []);

  // Pull-to-refresh only re-acquires GPS/location. Notes, phone, category
  // and evidence are deliberately untouched — refresh must never wipe an
  // in-progress form or submit anything.
  async function onRefresh() {
    setRefreshing(true);
    try {
      await acquireGps();
    } finally {
      setRefreshing(false);
    }
  }

  async function runChoice(kind, source) {
    setChooser(null);
    const picked =
      source === "camera"
        ? await captureEvidence(kind)
        : await pickEvidence(kind, { multiple: kind === "photo" });
    if (!picked.length) return;
    const accepted = picked.filter((item) => !evidenceTooLarge(item));
    const rejected = picked.length - accepted.length;
    if (rejected > 0) {
      Alert.alert(
        "Attachment Too Large",
        `${rejected} attachment${rejected === 1 ? "" : "s"} ${
          rejected === 1 ? "is" : "are"
        } over the 200MB upload limit and ${
          rejected === 1 ? "was" : "were"
        } skipped. Shorten the clip or lower the resolution.`
      );
    }
    if (!accepted.length) return;

    const attach = (items) => {
      setEvidence((current) => appendEvidence(current, items));
      setEvidenceUploadFailed(0);
    };

    // Pre-flight warning: on the pessimistic uplink these files can't
    // finish before their timeout. Let the citizen bail or re-record
    // instead of silently enqueueing an upload that will die mid-way.
    const risky = accepted.filter(evidenceUploadLikelyToTimeOut);
    if (risky.length) {
      Alert.alert(
        "Slow Upload",
        "This video is large and may take a while on a weak connection — the dispatcher may not get it. You can re-send it later.",
        [
          { text: "Don't attach", style: "cancel" },
          { text: "Attach anyway", onPress: () => attach(accepted) },
        ]
      );
      return;
    }
    attach(accepted);
  }

  async function handleSubmit() {
    if (!phone.trim()) {
      Alert.alert("Phone Required", "Enter your phone number to submit.");
      return;
    }
    if (gpsStatus !== "locked") {
      Alert.alert(
        "Location Not Ready",
        "Your GPS location has not been locked yet. Wait for it to finish, or tap Retry GPS."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/incidents`, {
        citizenPhone: phone.trim(),
        category: CATEGORY_DISPLAY[selectedCategory],
        notes: notes.trim(),
        // Tell the backend how many attachments this report expects so the
        // web dashboard can show "attachments still uploading".
        evidenceExpectedCount: evidence.length,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
        },
      });
      const incident = res.data?.data;
      if (incident?.incidentId) {
        await saveIncidentId(incident.incidentId);
        if (phone.trim() !== (await getSavedPhone())) {
          await savePhone(phone.trim());
        }
        // Evidence upload is non-blocking: fire it in the background and
        // navigate immediately. A failed upload never fails the report.
        // Each file gets bounded automatic retries for transient network
        // failures before it counts as failed (manual Retry stays after).
        if (evidence.length) {
          setEvidenceUploadFailed(0);
          const attachments = evidence;
          (async () => {
            const failedDetails = [];
            const failedFiles = [];
            for (let i = 0; i < attachments.length; i++) {
              const file = attachments[i];
              try {
                await uploadEvidenceResilient(incident.incidentId, file, {
                  index: i + 1,
                  count: attachments.length,
                  onAttempt: ({ attempt, total }) =>
                    reportEvidenceAttempt(incident.incidentId, attempt, total),
                });
              } catch (err) {
                failedFiles.push(file);
                failedDetails.push(
                  `${file.name} — ${evidenceErrorMessage(err)}`
                );
              }
            }
            if (failedFiles.length > 0) {
              // Persist the failed file objects so the Dispatch Tracker
              // can offer a Retry after this screen unmounts.
              await saveFailedEvidence(incident.incidentId, failedFiles);
            }
            // Always signal completion (even when nothing failed) so the
            // backend clears evidenceUploading and the dashboard stops
            // showing "attachments still uploading". evidenceAttempt resets
            // so a stale retry number never leaks into the next batch.
            await updateEvidenceStatus(incident.incidentId, {
              evidenceUploading: false,
              evidenceFailedCount: failedDetails.length,
              evidenceAttempt: 1,
            });
            if (failedDetails.length > 0) {
              setEvidenceUploadFailed(failedDetails.length);
              const tryAgain = async () => {
                const stillFailing = await retryFailedEvidence(
                  incident.incidentId,
                  failedFiles,
                  undefined,
                  {
                    onAttempt: ({ attempt, total }) =>
                      reportEvidenceAttempt(incident.incidentId, attempt, total),
                  }
                );
                if (stillFailing.length > 0) {
                  await saveFailedEvidence(incident.incidentId, stillFailing);
                  await updateEvidenceStatus(incident.incidentId, {
                    evidenceUploading: false,
                    evidenceFailedCount: stillFailing.length,
                    evidenceAttempt: 1,
                  });
                  Alert.alert(
                    "Retry Incomplete",
                    `${stillFailing.length} of ${failedFiles.length} attachments still couldn't upload. You can retry them from the Dispatch Tracker.`
                  );
                } else {
                  await clearFailedEvidence(incident.incidentId);
                  await updateEvidenceStatus(incident.incidentId, {
                    evidenceUploading: false,
                    evidenceFailedCount: 0,
                    evidenceAttempt: 1,
                  });
                  Alert.alert(
                    "Attachments Uploaded",
                    `All ${failedFiles.length} attachment${
                      failedFiles.length === 1 ? "" : "s"
                    } re-uploaded successfully.`
                  );
                }
              };
              Alert.alert(
                "Attachments Incomplete",
                `${failedDetails.length} of ${attachments.length} attachments failed to upload. Your report was still submitted.\n\n${failedDetails.join(
                  "\n"
                )}`,
                [
                  { text: "Done", style: "cancel" },
                  { text: "Retry Attachments", onPress: tryAgain },
                ]
              );
            }
          })();
        }
        onSubmit(incident);
      }
    } catch (err) {
      // Keep server-authored, user-facing messages; never surface raw
      // axios/network error strings ("Network Error", "timeout of…").
      Alert.alert(
        "Submission Failed",
        err.response?.data?.message ||
          "Unable to submit your report. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const categoryColor = CATEGORY_COLORS[selectedCategory] || THEMES.darkNavy;
  const categoryLabel = CATEGORY_DISPLAY[selectedCategory] || selectedCategory;

  return (
    <ScrollView
      testID="report-form-scroll"
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={THEMES.darkNavy}
        />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Report</Text>
      </View>

      <Enter delay={0} dy={6} duration={MOTION.small}>
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
          <Text style={styles.categoryBadgeText}>{categoryLabel.toUpperCase()}</Text>
        </View>
      </Enter>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        {MAPBOX_TOKEN ? (
          <View style={styles.miniMapContainer}>
            {MapView ? (
              <MapView
                style={styles.miniMap}
                styleURL="mapbox://styles/mapbox/streets-v12"
                scrollEnabled={false}
                rotateEnabled={false}
                onDidFinishLoadingMap={onMapLoaded}
              >
                {MapboxCamera && (
                  <MapboxCamera
                    ref={cameraRef}
                    defaultSettings={{
                      centerCoordinate: [
                        location.longitude,
                        location.latitude,
                      ],
                      zoomLevel: 14,
                    }}
                    animationMode="none"
                  />
                )}
                {PointAnnotation && (
                  <PointAnnotation
                    id="incident-location"
                    coordinate={[location.longitude, location.latitude]}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.pinWrap}>
                      <View style={styles.incidentPin} />
                    </View>
                  </PointAnnotation>
                )}
              </MapView>
            ) : (
              <View style={[styles.miniMap, styles.mapPlaceholder]}>
                <MapPin size={32} color={categoryColor} />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.miniMap, styles.mapPlaceholder]}>
            <MapPin size={32} color={categoryColor} />
            <Text style={styles.mapPlaceholderText}>Map unavailable</Text>
          </View>
        )}
        <View style={styles.locationInfo}>
          <View style={[styles.gpsBadge, gpsStatus === "locked" && styles.gpsBadgeLocked, gpsStatus === "failed" && styles.gpsBadgeError]}>
            <Navigation size={10} color={gpsStatus === "locked" ? THEMES.darkNavy : gpsStatus === "failed" ? THEMES.fireRed : LIGHT.textSecondary} />
            <Text style={[styles.gpsText, gpsStatus === "locked" && styles.gpsTextLocked, gpsStatus === "failed" && styles.gpsTextError]}>
              {gpsStatus === "locked"
                ? "GPS Locked"
                : gpsStatus === "failed"
                ? "GPS Failed"
                : "Acquiring GPS…"}
            </Text>
          </View>
          {gpsStatus !== "locked" && (
            <TouchableOpacity
              onPress={acquireGps}
              style={styles.gpsRetryBtn}
              activeOpacity={0.7}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Retry location"
            >
              <Navigation size={10} color={THEMES.darkNavy} />
              <Text style={styles.gpsRetryText}>
                {gpsStatus === "failed" ? "Retry GPS" : "Refresh GPS"}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.address, gpsStatus !== "locked" && { color: LIGHT.textSecondary }]}>
            {gpsStatus === "locked" ? location.address : "Waiting for your location…"}
          </Text>
          {gpsStatus === "locked" && (
            <Text style={styles.coords}>
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </Text>
          )}
        </View>
      </View>

      <Enter delay={60} dy={10}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Incident Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Category</Text>
          <View style={[styles.miniBadge, { backgroundColor: categoryColor }]}>
            <Text style={styles.miniBadgeText}>{categoryLabel.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reference</Text>
          <Text style={[styles.detailValue, { color: THEMES.gray }]}>
            Assigned on submit
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Timestamp</Text>
          <Text style={styles.detailValue}>
            {new Date().toLocaleString("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        </View>

        <Text style={[styles.detailLabel, { marginTop: 12 }]}>Phone Number</Text>
        <TextInput
          style={[
            styles.input,
            focusedField === "phone" && styles.inputFocused,
            focusedField === "phone" && { shadowColor: categoryColor },
          ]}
          value={phone}
          onChangeText={setPhone}
          onFocus={() => setFocusedField("phone")}
          onBlur={() => setFocusedField(null)}
          placeholder="+639XXXXXXXXX"
          placeholderTextColor={LIGHT.textSecondary}
          keyboardType="phone-pad"
        />

        <Text style={[styles.detailLabel, { marginTop: 12 }]}>Notes</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            focusedField === "notes" && styles.inputFocused,
            focusedField === "notes" && { shadowColor: categoryColor },
          ]}
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setFocusedField("notes")}
          onBlur={() => setFocusedField(null)}
          placeholder="Describe what you see..."
          placeholderTextColor={LIGHT.textSecondary}
          multiline
          numberOfLines={3}
        />
        </View>
      </Enter>

      <Enter delay={110} dy={10}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evidence</Text>
        {evidence.length > 0 && (
          <View style={styles.evidenceList}>
            {evidence.map((item, index) => (
              <View key={index} style={styles.evidencePreviewWrap}>
                {item.kind === "video" ? (
                  <View style={styles.evidenceVideoPlaceholder}>
                    <Video size={28} color={THEMES.floodBlue} />
                    <Text style={styles.evidenceVideoName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.evidenceVideoMeta}>
                      {item.fileSize
                        ? formatEvidenceSize(item.fileSize)
                        : "Size unknown"}
                      {item.durationMs
                        ? ` · ${formatEvidenceDuration(item.durationMs)}`
                        : ""}
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.evidenceThumb}
                    resizeMode="cover"
                  />
                )}
                <TouchableOpacity
                  onPress={() =>
                    setEvidence((current) =>
                      current.filter((_, i) => i !== index)
                    )
                  }
                  style={styles.evidenceRemoveBtn}
                  activeOpacity={0.8}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.kind === "video" ? "Remove video" : "Remove photo"
                  }
                >
                  <X size={14} color={THEMES.white} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.evidenceCount}>
              {evidence.length} of {MAX_EVIDENCE} attachments
            </Text>
          </View>
        )}
        <View style={styles.evidenceRow}>
          <TouchableOpacity
            style={[
              styles.evidenceBtn,
              evidence.length >= MAX_EVIDENCE && styles.evidenceBtnDisabled,
            ]}
            disabled={evidence.length >= MAX_EVIDENCE}
            activeOpacity={0.7}
            onPress={() => setChooser("photo")}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            accessibilityState={{ disabled: evidence.length >= MAX_EVIDENCE }}
          >
            <Camera size={24} color={THEMES.gray} />
            <Text style={styles.evidenceLabel}>Add Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.evidenceBtn,
              evidence.length >= MAX_EVIDENCE && styles.evidenceBtnDisabled,
            ]}
            disabled={evidence.length >= MAX_EVIDENCE}
            activeOpacity={0.7}
            onPress={() => setChooser("video")}
            accessibilityRole="button"
            accessibilityLabel="Add video"
            accessibilityState={{ disabled: evidence.length >= MAX_EVIDENCE }}
          >
            <Video size={24} color={THEMES.gray} />
            <Text style={styles.evidenceLabel}>Add Video</Text>
          </TouchableOpacity>
        </View>
        {evidenceUploadFailed > 0 && (
          <View style={styles.evidenceNote}>
            <Text style={styles.evidenceNoteText}>
              Some attachments failed to upload — your report was still
              submitted. The dispatcher may ask you to resend them.
            </Text>
          </View>
        )}
        </View>
      </Enter>

      <Modal
        visible={chooser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChooser(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setChooser(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              Add {chooser === "video" ? "Video" : "Photo"}
            </Text>
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => chooser && runChoice(chooser, "camera")}
              accessibilityRole="button"
            >
              {chooser === "video" ? (
                <Video size={22} color={THEMES.darkNavy} />
              ) : (
                <Camera size={22} color={THEMES.darkNavy} />
              )}
              <Text style={styles.sheetOptionText}>
                {chooser === "video"
                  ? `Record a video (up to ${MAX_CAPTURE_DURATION_MS / 60000} min)`
                  : "Take a photo"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetOption}
              activeOpacity={0.7}
              onPress={() => chooser && runChoice(chooser, "library")}
              accessibilityRole="button"
            >
              <Images size={22} color={THEMES.darkNavy} />
              <Text style={styles.sheetOptionText}>Choose from library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetOption, styles.sheetCancel]}
              activeOpacity={0.7}
              onPress={() => setChooser(null)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Enter delay={150} dy={10}>
        <AnimatedTouchable
          style={[
            styles.submitBtn,
            (loading || gpsStatus !== "locked") && styles.submitBtnDisabled,
            { transform: [{ scale: submitScale.scale }] },
          ]}
          onPress={handleSubmit}
          onPressIn={submitScale.handlers.onPressIn}
          onPressOut={submitScale.handlers.onPressOut}
          disabled={loading || gpsStatus !== "locked"}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={
            loading
              ? "Submitting your report"
              : gpsStatus !== "locked"
              ? "Submit report — location not ready yet"
              : "Submit emergency report"
          }
          accessibilityState={{ disabled: loading || gpsStatus !== "locked" }}
        >
          {loading ? (
            <ActivityIndicator color={THEMES.white} />
          ) : (
            <>
              <Send size={18} color={THEMES.white} />
              <Text style={styles.submitText}>
                {gpsStatus !== "locked"
                  ? gpsStatus === "failed"
                    ? "WAITING FOR GPS"
                    : "ACQUIRING LOCATION…"
                  : "SUBMIT REPORT"}
              </Text>
            </>
          )}
        </AnimatedTouchable>
      </Enter>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
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
  headerTitle: {
    flex: 1,
    fontSize: 17,
    color: THEMES.white,
    fontWeight: "700",
  },
  categoryBadge: {
    alignSelf: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: THEMES.white,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
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
  cardTitle: {
    fontSize: 14,
    color: LIGHT.textPrimary,
    fontWeight: "700",
    marginBottom: 12,
  },
  miniMapContainer: {
    borderRadius: 10,
    overflow: "hidden",
    height: 240,
  },
  miniMap: {
    height: 240,
    borderRadius: 10,
  },
  mapPlaceholder: {
    backgroundColor: LIGHT.inputBg,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  mapPlaceholderText: {
    color: LIGHT.textSecondary,
    fontSize: 12,
  },
  pinWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  incidentPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e4572e",
  },
  locationInfo: {
    marginTop: 10,
    gap: 4,
  },
  gpsBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: LIGHT.inputBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  gpsBadgeLocked: {
    backgroundColor: THEMES.mintGreen,
  },
  gpsBadgeError: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: THEMES.fireRed,
  },
  gpsText: {
    fontSize: 10,
    fontWeight: "700",
    color: LIGHT.textSecondary,
  },
  gpsTextLocked: {
    color: THEMES.darkNavy,
    fontWeight: "800",
  },
  gpsTextError: {
    color: THEMES.fireRed,
    fontWeight: "800",
  },
  gpsRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 4,
  },
  gpsRetryText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEMES.darkNavy,
  },
  address: {
    fontSize: 13,
    color: LIGHT.textPrimary,
    fontWeight: "500",
  },
  coords: {
    fontSize: 11,
    color: LIGHT.textSecondary,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    // Label keeps a predictable width; long values own the rest and
    // wrap inside their own column instead of overlapping the label.
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    color: LIGHT.textPrimary,
    fontWeight: "600",
    textAlign: "right",
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniBadgeText: {
    color: THEMES.white,
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    backgroundColor: LIGHT.inputBg,
    borderRadius: 10,
    padding: 12,
    color: LIGHT.textPrimary,
    fontSize: 14,
    marginTop: 6,
  },
  // Focus reads as a soft category-tinted halo — no border-width
  // change, so the layout never shifts while typing.
  inputFocused: {
    backgroundColor: LIGHT.bg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  evidenceRow: {
    flexDirection: "row",
    gap: 12,
  },
  evidenceList: {
    gap: 10,
    marginBottom: 12,
  },
  evidenceBtn: {
    flex: 1,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: LIGHT.border,
    borderStyle: "dashed",
    flexDirection: "row",
  },
  evidenceBtnDisabled: {
    opacity: 0.4,
  },
  evidenceLabel: {
    color: LIGHT.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  evidenceCount: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 2,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,26,58,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    gap: 10,
    shadowColor: "#111A3A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: LIGHT.textPrimary,
    marginBottom: 4,
    textAlign: "center",
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    padding: 16,
  },
  sheetOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: LIGHT.textPrimary,
  },
  sheetCancel: {
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingVertical: 12,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEMES.fireRed,
    textAlign: "center",
  },
  evidencePreviewWrap: {
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    overflow: "hidden",
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  evidenceThumb: {
    width: "100%",
    height: 160,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  evidenceVideoPlaceholder: {
    width: "100%",
    height: 160,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  evidenceVideoName: {
    color: LIGHT.textSecondary,
    fontSize: 11,
    paddingHorizontal: 12,
  },
  evidenceVideoMeta: {
    color: LIGHT.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  evidenceRemoveBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(17,26,58,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  evidenceNote: {
    marginTop: 10,
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
  },
  evidenceNoteText: {
    color: THEMES.medicalOrange,
    fontSize: 12,
    fontWeight: "600",
  },
  submitBtn: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: THEMES.fireRed,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: THEMES.white,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});

