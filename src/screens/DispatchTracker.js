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
import { MAPBOX_TOKEN, THEMES } from "../../lib/config";
import { getRecentIncidentIds } from "../../lib/storage";
import useIncidentPolling from "../hooks/useIncidentPolling";

let MapView;
let MapboxCamera;
let Marker;
try {
  const mapbox = require("@rnmapbox/maps");
  const resolved = mapbox.default || mapbox;
  MapView = resolved;
  MapboxCamera = resolved.Camera;
  Marker = resolved.Marker;
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

export default function DispatchTracker({ incidentId: propId, onBack }) {
  const [incidentId, setIncidentId] = useState(propId);
  const [recentIds, setRecentIds] = useState([]);
  const [showPicker, setShowPicker] = useState(!propId);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!propId) {
      (async () => {
        const ids = await getRecentIncidentIds();
        setRecentIds(ids);
        if (ids.length === 1) {
          setIncidentId(ids[0]);
          setShowPicker(false);
        }
      })();
    }
  }, [propId]);

  const { incident, error } = useIncidentPolling(incidentId);

  function handleSelectId(id) {
    setIncidentId(id);
    setShowPicker(false);
  }

  function onMapLoaded() {
    if (cameraRef.current && incident) {
      cameraRef.current.setCamera({
        centerCoordinate: [
          incident.location.longitude,
          incident.location.latitude,
        ],
        zoomLevel: 14,
        animationMode: "none",
      });
    }
  }

  const currentStepIdx = incident
    ? STEP_INDEX[incident.status] ?? 0
    : -1;

  return (
    <ScrollView style={styles.container}>
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
            recentIds.map((id) => (
              <TouchableOpacity
                key={id}
                style={styles.pickerItem}
                onPress={() => handleSelectId(id)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerItemId}>{id}</Text>
              </TouchableOpacity>
            ))
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
              <Text style={styles.refNumber}>{incidentId}</Text>
              <Text style={styles.headerTitle}>Dispatch Tracker</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!incident && !error && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={THEMES.mintGreen} size="large" />
              <Text style={styles.loadingText}>Fetching status...</Text>
            </View>
          )}

          {incident && (
            <>
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
                            <Circle size={16} color="rgba(255,255,255,0.2)" />
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
                <Text style={styles.cardTitle}>Incident Location</Text>
                {MAPBOX_TOKEN && MapView ? (
                  <View style={styles.mapContainer}>
                    <MapView
                      style={styles.map}
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
                              incident.location.longitude,
                              incident.location.latitude,
                            ],
                            zoomLevel: 14,
                          }}
                          animationMode="none"
                        />
                      )}
                      <Marker
                        coordinate={[
                          incident.location.longitude,
                          incident.location.latitude,
                        ]}
                      />
                    </MapView>
                  </View>
                ) : (
                  <View style={[styles.mapContainer, styles.mapPlaceholder]}>
                    <MapPin size={32} color={THEMES.mintGreen} />
                    <Text style={styles.placeholderText}>
                      {incident.location.address}
                    </Text>
                  </View>
                )}
                <Text style={styles.address}>{incident.location.address}</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Incident Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{incident.category}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          incident.status === "Resolved"
                            ? THEMES.mintGreen
                            : incident.status === "Dispatched"
                            ? "#FBBF24"
                            : incident.status === "En Route"
                            ? THEMES.floodBlue
                            : "rgba(255,255,255,0.1)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            incident.status === "Pending"
                              ? THEMES.white
                              : THEMES.darkNavy,
                        },
                      ]}
                    >
                      {incident.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {incident.dispatch && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Station</Text>
                      <Text style={styles.detailValue}>
                        {incident.dispatch.stationName}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Unit</Text>
                      <Text style={styles.detailValue}>
                        {incident.dispatch.assignedUnit}
                      </Text>
                    </View>
                  </>
                )}
                {incident.notes ? (
                  <View style={styles.notesSection}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.notesText}>{incident.notes}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reported</Text>
                  <Text style={styles.detailValue}>
                    {new Date(incident.timestamp).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Text>
                </View>
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1429",
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
    backgroundColor: "rgba(255,255,255,0.06)",
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
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  stepLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "600",
  },
  stepLabelComplete: {
    color: THEMES.white,
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 20,
    marginHorizontal: 4,
  },
  stepLineComplete: {
    backgroundColor: THEMES.mintGreen,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: THEMES.darkNavy,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    fontSize: 14,
    color: THEMES.white,
    fontWeight: "700",
    marginBottom: 12,
  },
  mapContainer: {
    borderRadius: 10,
    overflow: "hidden",
    height: 180,
  },
  map: {
    height: 180,
    borderRadius: 10,
  },
  mapPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  placeholderText: {
    color: THEMES.gray,
    fontSize: 12,
  },
  address: {
    fontSize: 13,
    color: THEMES.white,
    marginTop: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  detailLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
  detailValue: {
    fontSize: 13,
    color: THEMES.white,
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
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  notesText: {
    fontSize: 13,
    color: THEMES.white,
    marginTop: 4,
  },
  pickerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pickerTitle: {
    fontSize: 20,
    color: THEMES.white,
    fontWeight: "700",
    marginTop: 16,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: THEMES.gray,
    marginTop: 4,
    marginBottom: 20,
  },
  emptyText: {
    color: THEMES.gray,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  pickerItem: {
    backgroundColor: THEMES.darkNavy,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pickerItemId: {
    color: THEMES.white,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "monospace",
  },
});
