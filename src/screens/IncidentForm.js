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
import { API_BASE_URL, MAPBOX_TOKEN, CATEGORY_DISPLAY, CATEGORY_COLORS, THEMES } from "../../lib/config";
import { getSavedPhone, savePhone, saveIncidentId } from "../../lib/storage";

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
  const [gpsLocked, setGpsLocked] = useState(false);
  const locationFetched = useRef(false);
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
    (async () => {
      const saved = await getSavedPhone();
      if (saved) setPhone(saved);

      if (locationFetched.current) return;
      locationFetched.current = true;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = pos.coords;

          let address = "Marikina City, Philippines";
          try {
            const geocode = await Location.reverseGeocodeAsync({
              latitude,
              longitude,
            });
            if (geocode.length > 0) {
              const g = geocode[0];
              address = [g.name, g.street, g.city, g.region]
                .filter(Boolean)
                .join(", ");
            }
          } catch {
            // geocode failed, use default
          }

          setLocation({ latitude, longitude, address });
          setGpsLocked(true);
        }
      } catch {
        // GPS failed, use initial
      }
    })();
  }, []);

  async function handleSubmit() {
    if (!phone.trim()) {
      Alert.alert("Phone Required", "Enter your phone number to submit.");
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
        onSubmit(incident.incidentId);
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
                <Marker coordinate={[location.longitude, location.latitude]} />
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
          <View style={[styles.gpsBadge, gpsLocked && styles.gpsBadgeLocked]}>
            <Navigation size={10} color={gpsLocked ? THEMES.darkNavy : THEMES.white} />
            <Text style={[styles.gpsText, gpsLocked && styles.gpsTextLocked]}>
              GPS {gpsLocked ? "Locked" : "Pending"}
            </Text>
          </View>
          <Text style={styles.address}>{location.address}</Text>
          <Text style={styles.coords}>
            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </Text>
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
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="phone-pad"
        />

        <Text style={[styles.detailLabel, { marginTop: 12 }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Describe what you see..."
          placeholderTextColor="rgba(255,255,255,0.3)"
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
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={THEMES.white} />
        ) : (
          <>
            <Send size={18} color={THEMES.white} />
            <Text style={styles.submitText}>SUBMIT REPORT</Text>
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
  miniMapContainer: {
    borderRadius: 10,
    overflow: "hidden",
    height: 160,
  },
  miniMap: {
    height: 160,
    borderRadius: 10,
  },
  mapPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  mapPlaceholderText: {
    color: THEMES.gray,
    fontSize: 12,
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
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  gpsBadgeLocked: {
    backgroundColor: THEMES.mintGreen,
  },
  gpsText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEMES.white,
  },
  gpsTextLocked: {
    color: THEMES.darkNavy,
  },
  address: {
    fontSize: 13,
    color: THEMES.white,
  },
  coords: {
    fontSize: 11,
    color: THEMES.gray,
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: 12,
    color: THEMES.white,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
  },
  evidenceLabel: {
    color: THEMES.gray,
    fontSize: 12,
    fontWeight: "600",
  },
  evidenceStub: {
    color: "rgba(255,255,255,0.2)",
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
