/**
 * src/components/EvidenceGrid.js
 * --------------------------------------------------------------
 * The uploaded-evidence renderer shared by the History detail screen
 * (ResolvedDetail) and the Track incident detail (DispatchTracker).
 *
 * Extracted verbatim from ResolvedDetail so both screens show the
 * exact same treatment: images inline, videos via the expo-video
 * inline player (fullscreen + native controls), and a compact pill
 * fallback when a stored record has no resolvable URL.
 *
 * Screens own the card wrapper + "Evidence" title (their own card
 * language); this component renders only the grid of items. It
 * renders nothing for an empty/missing list, so callers gate on
 * evidence presence exactly as History always has.
 * --------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { resolveApiUrl } from "../../lib/config";
import { LIGHT } from "../../lib/themes";

function EvidenceVideo({ url }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.playbackRate = 1;
  });
  return (
    <VideoView
      player={player}
      testID="evidence-video"
      style={styles.evidenceVideo}
      allowsFullscreen
      nativeControls
    />
  );
}

/**
 * @param {{evidence?: Array<{fileId?: string, url?: string, mimeType?: string, sizeKb?: number}>}} props
 *        The incident's stored evidence records (GET /api/incidents/:id).
 * @returns {JSX.Element|null} the wrapped grid, or null when empty.
 */
export default function EvidenceGrid({ evidence }) {
  const files = evidence || [];
  if (files.length === 0) return null;
  return (
    <View style={styles.evidenceWrap} testID="evidence-grid">
      {files.map((file, idx) => {
        const url = resolveApiUrl(file?.url);
        const mimeType = file?.mimeType || "";
        const key = file?.fileId ?? `ev-${idx}`;
        if (url && mimeType.startsWith("image/")) {
          return (
            <Image
              key={key}
              source={{ uri: url }}
              testID="evidence-image"
              style={styles.evidenceImage}
              resizeMode="cover"
            />
          );
        }
        if (url && mimeType.startsWith("video/")) {
          return <EvidenceVideo key={key} url={url} />;
        }
        const kind = mimeType.startsWith("video/") ? "Video" : "Photo";
        return (
          <View key={key} style={styles.evidencePill}>
            <Text style={styles.evidencePillText}>
              {kind} · {file?.sizeKb ?? 0} KB
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  evidenceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  evidenceImage: {
    width: "48%",
    height: 140,
    borderRadius: 10,
    backgroundColor: LIGHT.inputBg,
  },
  evidenceVideo: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    backgroundColor: "#000000",
  },
  evidencePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT.inputBg,
    borderWidth: 1,
    borderColor: LIGHT.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  evidencePillText: {
    fontSize: 12,
    color: LIGHT.textSecondary,
  },
});
