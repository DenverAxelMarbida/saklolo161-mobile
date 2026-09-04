import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import {
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Clock,
  Building2,
  Truck,
  Timer,
  FileText,
} from "lucide-react-native";
import { THEMES, LIGHT } from "../../lib/themes";
import {
  CATEGORY_DISPLAY,
  CATEGORY_COLORS,
  MAPBOX_TOKEN,
} from "../../lib/config";

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

function formatTimestamp(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ResolvedDetail({ incident, onBack }) {
  const rawCategory = incident.category;
  const categoryKey = (rawCategory || "").toUpperCase();
  const categoryDisplay = CATEGORY_DISPLAY[categoryKey] || rawCategory;
  const categoryColor = CATEGORY_COLORS[categoryKey] || THEMES.crimeSlate;

  const lat = incident.location?.latitude;
  const lng = incident.location?.longitude;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.refNumber}>{incident.incidentId}</Text>
          <Text style={styles.headerTitle}>Incident Details</Text>
        </View>
        <View style={styles.resolvedChip}>
          <ShieldCheck size={12} color="#065F46" />
          <Text style={styles.resolvedChipText}>RESOLVED</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category banner */}
        <View style={[styles.banner, { borderLeftColor: categoryColor }]}>
          <View
            style={[
              styles.categoryChip,
              { backgroundColor: `${categoryColor}1F` },
            ]}
          >
            <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
            <Text style={[styles.categoryText, { color: categoryColor }]}>
              {categoryDisplay}
            </Text>
          </View>
          <Text style={styles.bannerHint}>Report resolved by dispatcher</Text>
        </View>

        {/* Map / location */}
        {MAPBOX_TOKEN && MapView && lat && lng ? (
          <View style={styles.mapSection}>
            <MapView
              style={styles.map}
              styleURL="mapbox://styles/mapbox/streets-v12"
              scrollEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              {MapboxCamera && (
                <MapboxCamera
                  defaultSettings={{
                    centerCoordinate: [lng, lat],
                    zoomLevel: 14,
                  }}
                />
              )}
              {PointAnnotation && (
                <PointAnnotation
                  id="resolved-location"
                  coordinate={[lng, lat]}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.pinWrap}>
                    <View style={[styles.pin, { backgroundColor: categoryColor }]} />
                  </View>
                </PointAnnotation>
              )}
            </MapView>
            <View style={styles.addressOverlay} pointerEvents="none">
              <MapPin size={14} color={categoryColor} />
              <Text style={styles.addressText} numberOfLines={2}>
                {incident.location?.address || "Location on map"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.mapSection}>
            <View style={styles.placeholderMap}>
              <MapPin size={28} color={categoryColor} />
              <Text style={styles.placeholderText}>
                {incident.location?.address || "Location unavailable"}
              </Text>
            </View>
          </View>
        )}

        {/* Details card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overview</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailLabelWrap}>
              <MapPin size={15} color={LIGHT.textSecondary} />
              <Text style={styles.detailLabel}>Location</Text>
            </View>
            <Text style={styles.detailValue}>
              {incident.location?.address || "—"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailLabelWrap}>
              <Clock size={15} color={LIGHT.textSecondary} />
              <Text style={styles.detailLabel}>Reported</Text>
            </View>
            <Text style={styles.detailValue}>
              {formatTimestamp(incident.timestamp) || "—"}
            </Text>
          </View>

          {incident.dispatch && (
            <>
              <View style={styles.detailRow}>
                <View style={styles.detailLabelWrap}>
                  <Building2 size={15} color={LIGHT.textSecondary} />
                  <Text style={styles.detailLabel}>Station</Text>
                </View>
                <Text style={styles.detailValue}>
                  {incident.dispatch.stationName || "—"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailLabelWrap}>
                  <Truck size={15} color={LIGHT.textSecondary} />
                  <Text style={styles.detailLabel}>Unit</Text>
                </View>
                <Text style={styles.detailValue}>
                  {incident.dispatch.assignedUnit || "—"}
                </Text>
              </View>
              {incident.dispatch.estimatedTurnout && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelWrap}>
                    <Timer size={15} color={LIGHT.textSecondary} />
                    <Text style={styles.detailLabel}>Turnout</Text>
                  </View>
                  <Text style={styles.detailValue}>
                    {incident.dispatch.estimatedTurnout}
                  </Text>
                </View>
              )}
            </>
          )}

          {incident.notes ? (
            <View style={styles.notesBlock}>
              <View style={styles.detailLabelWrap}>
                <FileText size={15} color={LIGHT.textSecondary} />
                <Text style={styles.detailLabel}>Notes</Text>
              </View>
              <Text style={styles.notesText}>{incident.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
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
    gap: 12,
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
    fontFamily: "monospace",
  },
  headerTitle: {
    fontSize: 18,
    color: THEMES.white,
    fontWeight: "700",
    marginTop: 1,
  },
  resolvedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  resolvedChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: THEMES.mintGreen,
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  bannerHint: {
    fontSize: 11,
    color: LIGHT.textSecondary,
  },
  mapSection: {
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  map: {
    flex: 1,
  },
  addressOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
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
  placeholderMap: {
    flex: 1,
    backgroundColor: LIGHT.inputBg,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  placeholderText: {
    color: LIGHT.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  pinWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 14,
    color: LIGHT.textPrimary,
    fontWeight: "700",
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
    gap: 12,
  },
  detailLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: LIGHT.textSecondary,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: LIGHT.textPrimary,
    fontWeight: "600",
    textAlign: "right",
  },
  notesBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.border,
    gap: 6,
  },
  notesText: {
    fontSize: 13,
    color: LIGHT.textPrimary,
    lineHeight: 19,
    marginTop: 4,
  },
});
