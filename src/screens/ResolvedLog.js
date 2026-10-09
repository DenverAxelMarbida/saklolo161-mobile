import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react-native";
import { THEMES, LIGHT } from "../../lib/themes";
import { CATEGORY_DISPLAY, CATEGORY_COLORS } from "../../lib/config";
import { getResolvedIncidents } from "../../lib/storage";
import Skeleton from "../components/Skeleton";
import { Enter, MOTION } from "../../lib/motion";
import { formatTimestamp, resolvedTime } from "../../lib/format";

export default function ResolvedLog({ onBack, onSelect }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadList() {
    const list = await getResolvedIncidents();
    setIncidents(list);
  }

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

  // Pull-to-refresh re-reads the local resolved-incident storage — no
  // server history endpoint exists or is needed.
  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadList();
    } finally {
      setRefreshing(false);
    }
  }

  // Newest resolved first, keyed strictly on resolvedAt. Display-side
  // only — storage keeps its insertion order untouched. Missing/garbage
  // resolvedAt maps to epoch (sinks below timed records, incoming order
  // among themselves; the comparator never throws).
  const sorted = useMemo(
    () => [...incidents].sort((a, b) => resolvedTime(b) - resolvedTime(a)),
    [incidents],
  );

  return (
    <View style={styles.container}>
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
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Resolved Incidents</Text>
          <Text style={styles.headerSubtitle}>Your past emergency reports</Text>
        </View>
      </View>

      {loading ? (
        <View
          style={styles.skeletonList}
          testID="resolved-skeleton"
          accessibilityLabel="Loading resolved incidents"
          accessible
        >
          <Skeleton height={130} radius={14} style={{ marginBottom: 12 }} />
          <Skeleton height={130} radius={14} style={{ marginBottom: 12 }} />
          <Skeleton height={130} radius={14} />
        </View>
      ) : (
        <ScrollView
          testID="history-scroll"
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            incidents.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={THEMES.darkNavy}
            />
          }
        >
          {            incidents.length === 0 ? (
            <View style={styles.emptyBlock} testID="history-empty-state">
              <ShieldCheck size={48} color={THEMES.mintGreen} />
              <Text style={styles.emptyTitle}>No Recent History</Text>
              <Text style={styles.emptyText}>
                Your resolved reports will appear here.
              </Text>
            </View>
          ) : (
            sorted.map((inc, index) => {
            const categoryKey = (inc.category || "").toUpperCase();
            const categoryLabel =
              CATEGORY_DISPLAY[categoryKey] || inc.category;
            const categoryColor =
              CATEGORY_COLORS[categoryKey] || THEMES.crimeSlate;
            return (
              // Staggered settle — capped so longer lists never feel
              // like they are making the user wait.
              <Enter
                key={inc.incidentId}
                delay={Math.min(index, 8) * 40}
                dy={10}
                duration={MOTION.card}
              >
              <TouchableOpacity
                testID={`history-card-${inc.incidentId}`}
                style={[
                  styles.card,
                  { borderLeftWidth: 4, borderLeftColor: categoryColor },
                ]}
                onPress={() => onSelect && onSelect(inc)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.refNumber}>{inc.incidentId}</Text>
                  <View style={styles.resolvedChip}>
                    <ShieldCheck size={12} color="#065F46" />
                    <Text style={styles.resolvedChipText}>RESOLVED</Text>
                  </View>
                </View>
                <Text style={styles.category}>{categoryLabel}</Text>
                <View style={styles.metaRow}>
                  <MapPin size={13} color={LIGHT.textSecondary} />
                  <Text style={styles.address}>{inc.location?.address}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.time}>
                    Resolved {formatTimestamp(inc.resolvedAt) || "—"}
                  </Text>
                </View>
                <View style={styles.detailHint}>
                  <Text style={styles.detailHintText}>View details</Text>
                </View>
              </TouchableOpacity>
              </Enter>
            );
            })
          )}
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
  skeletonList: {
    flex: 1,
    padding: 16,
  },
  emptyBlock: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    // Designed panel rather than bare text floating on the background.
    backgroundColor: LIGHT.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LIGHT.border,
    borderStyle: "dashed",
    marginHorizontal: 4,
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
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
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
  detailHint: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LIGHT.border,
    alignItems: "flex-end",
  },
  detailHintText: {
    fontSize: 12,
    color: THEMES.floodBlue,
    fontWeight: "700",
  },
});
