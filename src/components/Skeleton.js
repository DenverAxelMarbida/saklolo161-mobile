import React, { useEffect, useState } from "react";
import { Animated, AccessibilityInfo, View } from "react-native";

/**
 * Pulsing placeholder block for initial-load states. Respects the OS
 * reduce-motion setting: when enabled it renders a static block instead
 * of animating, so it never flashes motion at users who opted out.
 */
export default function Skeleton({
  height = 16,
  width = "100%",
  radius = 8,
  style,
  testID = "skeleton",
  accessibilityLabel = "Loading",
  // Dark-on-light default. On dark surfaces (e.g. the navy hero card)
  // callers MUST pass a lighter tint — this exact rgba blended over
  // #111A3A resolves to the background itself, i.e. an invisible block.
  color = "rgba(17,26,58,0.12)",
}) {
  const [opacity] = useState(() => new Animated.Value(0.4));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, opacity]);

  const boxStyle = {
    height,
    width,
    borderRadius: radius,
    backgroundColor: color,
  };

  if (reduceMotion) {
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessible
        style={[boxStyle, { opacity: 0.7 }, style]}
      />
    );
  }

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessible
      accessibilityState={{ busy: true }}
      style={[boxStyle, { opacity }, style]}
    />
  );
}
