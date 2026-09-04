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
} from "react-native";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Camera,
  Video,
  Send,
} from "lucide-react-native";
import axios from "axios";
import * as Location from "expo-location";
import { API_BASE_URL, MAPBOX_TOKEN, CATEGORY_DISPLAY, CATEGORY_COLORS } from "../../lib/config";
import { THEMES, LIGHT } from "../../lib/themes";
import { getSavedPhone, savePhone, saveIncidentId } from "../../lib/storage";

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

export default function IncidentForm({ selectedCategory, onBack, onSubmit }) {
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState(INITIAL_LOCATION);
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("locating"); // "locating" | "locked" | "failed"
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
        onSubmit(incident);
      }
    } catch (err) {
      Alert.alert(
        "Submission Failed",
        err.response?.data?.message || "Could not submit report. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const categoryColor = CATEGORY_COLORS[selectedCategory] || THEMES.darkNavy;
  const categoryLabel = CATEGORY_DISPLAY[selectedCategory] || selectedCategory;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Report</Text>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>Step 2 of 2</Text>
        </View>
      </View>

      <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
        <Text style={styles.categoryBadgeText}>{categoryLabel.toUpperCase()}</Text>
      </View>

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
            <TouchableOpacity onPress={acquireGps} style={styles.gpsRetryBtn} activeOpacity={0.7}>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Incident Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Category</Text>
          <View style={[styles.miniBadge, { backgroundColor: categoryColor }]}>
            <Text style={styles.miniBadgeText}>{categoryLabel.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Priority</Text>
          <Text style={styles.detailValue}>Standard</Text>
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
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+639XXXXXXXXX"
          placeholderTextColor={LIGHT.textSecondary}
          keyboardType="phone-pad"
        />

        <Text style={[styles.detailLabel, { marginTop: 12 }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Describe what you see..."
          placeholderTextColor={LIGHT.textSecondary}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Evidence</Text>
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} activeOpacity={0.7}>
            <Camera size={24} color={THEMES.gray} />
            <Text style={styles.evidenceLabel}>Add Photo</Text>
            <Text style={styles.evidenceStub}>Coming soon</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.evidenceBtn} activeOpacity={0.7}>
            <Video size={24} color={THEMES.gray} />
            <Text style={styles.evidenceLabel}>Add Video</Text>
            <Text style={styles.evidenceStub}>Coming soon</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.submitBtn,
          (loading || gpsStatus !== "locked") && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={loading || gpsStatus !== "locked"}
        activeOpacity={0.8}
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
      </TouchableOpacity>

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
  stepBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  stepText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "600",
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
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  evidenceRow: {
    flexDirection: "row",
    gap: 12,
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
  },
  evidenceLabel: {
    color: LIGHT.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  evidenceStub: {
    color: LIGHT.textSecondary,
    fontSize: 10,
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
