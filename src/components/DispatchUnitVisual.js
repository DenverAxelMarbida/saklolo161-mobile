/**
 * src/components/DispatchUnitVisual.js
 * --------------------------------------------------------------
 * Compact status banner for the Dispatch Tracker's detail view:
 * a category vehicle glyph + one short status line that tells the
 * citizen, at a glance, whether help is *present* (Dispatched) or
 * *on the way* (En Route).
 *
 * - Vehicle is chosen strictly from the incident category:
 *     MEDICAL → Ambulance, FIRE → Truck,
 *     CRIME   → CarFront,  FLOOD → Ship   (lucide-react-native)
 * - Motion uses React Native's core Animated with the native
 *   driver only: a one-shot ~280 ms settle for Dispatched, and a
 *   subtle ~1.4 s horizontal glide + alternating motion-line pulse
 *   for En Route. Nothing animates for Pending/Resolved/unknown.
 * - AccessibilityInfo's reduce-motion setting swaps in the static
 *   variant; the loop is stopped on status change and unmount.
 * - Purely display: derives from the polled `status` string the
 *   tracker already renders (never advances status itself).
 * --------------------------------------------------------------
 */

import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ambulance, CarFront, Ship, Truck } from "lucide-react-native";
import { CATEGORY_COLORS } from "../../lib/config";
import { THEMES } from "../../lib/themes";

export const VEHICLE_ICONS = {
  MEDICAL: Ambulance,
  FIRE: Truck,
  CRIME: CarFront,
  FLOOD: Ship,
};

const VEHICLE_LABELS = {
  MEDICAL: "Emergency medical unit",
  FIRE: "Fire truck",
  CRIME: "Police car",
  FLOOD: "Rescue boat",
};

// Short, fixed copy — ETA details stay in the card's Driving ETA row.
const STATUS_COPY = {
  Dispatched: "Unit dispatched",
  "En Route": "Unit is on the way",
};

const SETTLE_MS = 280;
const GLIDE_MS = 700; // half-cycle; full glide cycle = 2 × GLIDE_MS ≈ 1.4s
const GLIDE_PX = 3;

/**
 * @param {{category?: string, status?: string}} props category is the
 * UPPERCASE key (tracker's `categoryKey`); status is the raw polled string.
 * @returns {JSX.Element|null} banner only for Dispatched / En Route.
 */
export default function DispatchUnitVisual({ category, status }) {
  const VehicleIcon = VEHICLE_ICONS[category];
  const copy = STATUS_COPY[status];
  if (!VehicleIcon || !copy) return null;
  return (
    <UnitBanner
      VehicleIcon={VehicleIcon}
      category={category}
      status={status}
      copy={copy}
    />
  );
}

function UnitBanner({ VehicleIcon, category, status, copy }) {
  const color = CATEGORY_COLORS[category] || THEMES.darkNavy;
  const label = `${VEHICLE_LABELS[category] || "Response unit"}. ${copy}`;

  const [reduceMotion, setReduceMotion] = useState(false);
  // Animated.Value instances are created once and mutated in place, so a
  // lazy useState keeps them stable without reading a ref during render.
  const [settle] = useState(() => new Animated.Value(1));
  const [glide] = useState(() => new Animated.Value(0));
  const [lineA] = useState(() => new Animated.Value(0));

  // Honor the OS-level reduce-motion preference (static variant).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      if (mounted) setReduceMotion(!!enabled);
    });
    return () => {
      mounted = false;
      if (typeof sub === "function") sub();
      else sub?.remove?.();
    };
  }, []);

  // DISPATCHED: one-time settle/fade, then completely static.
  useEffect(() => {
    if (status !== "Dispatched" || reduceMotion) {
      settle.setValue(1);
      return undefined;
    }
    settle.setValue(0);
    const timing = Animated.timing(settle, {
      toValue: 1,
      duration: SETTLE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    timing.start();
    return () => timing.stop();
  }, [status, reduceMotion, settle]);

  // EN ROUTE: subtle horizontal glide + alternating motion-line pulse.
  // Native-driven loop; stopped (and values reset) whenever the status
  // leaves En Route, reduce-motion flips on, or the screen unmounts.
  useEffect(() => {
    if (status !== "En Route" || reduceMotion) {
      glide.setValue(0);
      lineA.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(glide, {
            toValue: 1,
            duration: GLIDE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glide, {
            toValue: 0,
            duration: GLIDE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(lineA, {
            toValue: 1,
            duration: GLIDE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(lineA, {
            toValue: 0,
            duration: GLIDE_MS,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      glide.setValue(0);
      lineA.setValue(0);
    };
  }, [status, reduceMotion, glide, lineA]);

  const isEnRoute = status === "En Route" && !reduceMotion;
  const showSettle = status === "Dispatched" && !reduceMotion;
  const translateX = glide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, GLIDE_PX],
  });
  const lineB = lineA.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View
      testID="dispatch-unit-visual"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={label}
      style={[styles.banner, { backgroundColor: `${color}1A`, borderLeftColor: color }]}
    >
      <Animated.View
        testID="dispatch-unit-vehicle"
        style={[
          styles.iconWrap,
          showSettle && {
            opacity: settle,
            transform: [
              {
                translateY: settle.interpolate({
                  inputRange: [0, 1],
                  outputRange: [4, 0],
                }),
              },
            ],
          },
          isEnRoute && { transform: [{ translateX }] },
        ]}
      >
        <VehicleIcon size={26} color={color} strokeWidth={2.25} />
      </Animated.View>

      {isEnRoute && (
        <Animated.View
          testID="dispatch-unit-motion-lines"
          style={styles.lines}
          pointerEvents="none"
        >
          <Animated.View
            style={[styles.line, { width: 10, opacity: lineA, backgroundColor: color }]}
          />
          <Animated.View
            style={[styles.line, { width: 6, opacity: lineB, backgroundColor: color }]}
          />
        </Animated.View>
      )}

      <Text style={styles.copy} numberOfLines={1} testID="dispatch-unit-copy">
        {copy}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  iconWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  lines: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  line: {
    height: 2,
    borderRadius: 1,
  },
  copy: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: THEMES.darkNavy,
  },
});
