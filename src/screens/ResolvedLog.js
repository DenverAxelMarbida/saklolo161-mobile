import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react-native";
import { THEMES, LIGHT } from "../../lib/themes";
import { getResolvedIncidents } from "../../lib/storage";

export default function ResolvedLog({ onBack }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await getResolvedIncidents();
      if (active) {
        setIncidents(list);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Resolved Incidents</Text>
          <Text style={styles.headerSubtitle}>Your past emergency reports</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={THEMES.floodBlue} size="large" />
        </View>
      ) : incidents.length === 0 ? (
        <View style={styles.center}>
          <ShieldCheck size={40} color={THEMES.mintGreen} />
          <Text style={styles.emptyTitle}>No resolved incidents yet</Text>
          <Text style={styles.emptyText}>
            Reports that get resolved by the dispatcher will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {incidents.map((inc) => (
            <View key={inc.incidentId} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.refNumber}>{inc.incidentId}</Text>
                <View style={styles.resolvedChip}>
                  <ShieldCheck size={12} color="#065F46" />
                  <Text style={styles.resolvedChipText}>RESOLVED</Text>
                </View>
              </View>
              <Text style={styles.category}>{inc.category}</Text>
              <View style={styles.metaRow}>
                <MapPin size={13} color={LIGHT.textSecondary} />
                <Text style={styles.address}>{inc.location?.address}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.time}>
                  Resolved{" "}
                  {inc.timestamp
                    ? new Date(inc.timestamp).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : ""}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
  headerTitle: {
    fontSize: 18,
    color: THEMES.white,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    color: THEMES.mintGreen,
    marginTop: 2,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
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
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
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
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: LIGHT.textPrimary,
    fontFamily: "monospace",
  },
  resolvedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  resolvedChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#065F46",
    letterSpacing: 0.5,
  },
  category: {
    fontSize: 15,
    fontWeight: "700",
    color: LIGHT.textPrimary,
    marginTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: LIGHT.textSecondary,
  },
  time: {
    fontSize: 11,
    color: LIGHT.textSecondary,
  },
});
