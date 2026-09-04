import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  MapPin,
} from "lucide-react-native";
import { MAPBOX_TOKEN } from "../../lib/config";
import { THEMES, LIGHT } from "../../lib/themes";
import { getRecentIncidentIds } from "../../lib/storage";
import useIncidentPolling from "../hooks/useIncidentPolling";

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

const STEPS = ["Pending", "Dispatched", "En Route", "Resolved"];

const STEP_INDEX = {
  Pending: 0,
  Dispatched: 1,
  "En Route": 2,
  Resolved: 3,
};

// Static demo station coordinate (Marikina City) — mirrors the web
// dashboard's STATION_COORDS. A real build would source this from the
// station record returned by the backend.
const STATION_COORDS = { lat: 14.6455, lng: 121.101 };

export default function DispatchTracker({
  incidentId: propId,
  initialIncident,
  onBack,
}) {
  const [incidentId, setIncidentId] = useState(propId);
  const [recentIds, setRecentIds] = useState([]);
  const [showPicker, setShowPicker] = useState(!propId);
  const cameraRef = useRef(null);

  // Immediately use the incident passed in from the submit screen so the
  // map shows the pinned location + route without waiting for the poll.
  // Polling still runs in parallel to pick up live status updates.
  const { incident, error, notFound } = useIncidentPolling(incidentId);
  const liveIncident = incident || initialIncident;

  // Stable camera target so re-renders (10s polling) don't re-center the
  // map over the user's manual pan/swipe. Only recompute when the actual
  // coordinates change (primitive deps keep identity stable per incident).
  const incidentLng = liveIncident?.location?.longitude;
  const incidentLat = liveIncident?.location?.latitude;
  const cameraDefaults = React.useMemo(() => {
    if (!liveIncident) return null;
    return {
      centerCoordinate: [
        (STATION_COORDS.lng + (incidentLng ?? 0)) / 2,
        (STATION_COORDS.lat + (incidentLat ?? 0)) / 2,
      ],
      zoomLevel: 13,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentLng, incidentLat]);

  useEffect(() => {
    if (!propId && !initialIncident) {
      (async () => {
        const ids = await getRecentIncidentIds();
        setRecentIds(ids);
        if (ids.length === 1) {
          setIncidentId(ids[0]);
          setShowPicker(false);
        }
      })();
    }
  }, [propId, initialIncident]);

  function handleSelectId(id) {
    setIncidentId(id);
    setShowPicker(false);
  }

  const currentStepIdx = liveIncident
    ? STEP_INDEX[liveIncident.status] ?? 0
    : -1;

  return (
    <View style={styles.container}>
      {showPicker ? (
        <View style={styles.pickerContainer}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <ArrowLeft size={20} color={THEMES.white} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Select an Incident</Text>
          <Text style={styles.pickerSubtitle}>
            Choose a recent report to track its status.
          </Text>
          {recentIds.length === 0 ? (
            <Text style={styles.emptyText}>No recent incidents found.</Text>
          ) : (
            <ScrollView>
              {recentIds.map((id) => (
                <TouchableOpacity
                  key={id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectId(id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerItemId}>{id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={{ height: 40 }} />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <ArrowLeft size={20} color={THEMES.white} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.refNumber}>{incidentId || "New"}</Text>
              <Text style={styles.headerTitle}>Dispatch Tracker</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          {notFound && (
            <View style={styles.notFoundBanner}>
              <Text style={styles.notFoundTitle}>Report no longer tracked</Text>
              <Text style={styles.notFoundText}>
                This report is no longer available from the dispatcher
                system. You can still see it in your history.
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!liveIncident && !error && !notFound && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={THEMES.mintGreen} size="large" />
              <Text style={styles.loadingText}>Fetching status...</Text>
            </View>
          )}

          {liveIncident && (
            <View style={styles.trackerBody}>
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
                    {ShapeSource && LineLayer && (
                      <ShapeSource
                        id="routeSource"
                        shape={{
                          type: "Feature",
                          properties: {},
                          geometry: {
                            type: "LineString",
                            coordinates: [
                              [STATION_COORDS.lng, STATION_COORDS.lat],
                              [
                                liveIncident.location.longitude,
                                liveIncident.location.latitude,
                              ],
                            ],
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
                    {PointAnnotation && (
                      <PointAnnotation
                        id="station-location"
                        coordinate={[STATION_COORDS.lng, STATION_COORDS.lat]}
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

              <ScrollView
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
              >
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

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Incident Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>
                    {liveIncident.category}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          liveIncident.status === "Resolved"
                            ? THEMES.mintGreen
                            : liveIncident.status === "Dispatched"
                            ? "#FBBF24"
                            : liveIncident.status === "En Route"
                            ? THEMES.floodBlue
                            : THEMES.gray,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            liveIncident.status === "Pending"
                              ? THEMES.white
                              : THEMES.darkNavy,
                        },
                      ]}
                    >
                      {liveIncident.status.toUpperCase()}
                    </Text>
                  </View>
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
                      <Text style={styles.detailLabel}>Turnout</Text>
                      <Text style={styles.detailValue}>
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
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    color: LIGHT.textPrimary,
    fontWeight: "700",
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
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
  },
  detailLabel: {
    fontSize: 13,
    color: LIGHT.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    color: LIGHT.textPrimary,
    fontWeight: "600",
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
  pickerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pickerTitle: {
    fontSize: 20,
    color: LIGHT.textPrimary,
    fontWeight: "700",
    marginTop: 16,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  emptyText: {
    color: LIGHT.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  pickerItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  pickerItemId: {
    color: LIGHT.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "monospace",
  },
});
