import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

// Shared motion language for the citizen app. Durations follow the
// product brief: micro (press/feedback), small (row/label swaps),
// card (entrances), state (larger status transitions). Every animation
// in the app should pull its timing from here so the whole product
// moves with one voice.
export const MOTION = {
  micro: 150,
  small: 220,
  card: 280,
  state: 350,
};

// Single source of truth for the OS reduce-motion setting. Mirrors the
// listener pattern already proven in DispatchUnitVisual, but shared so
// every new animation honors the setting — reduced motion gets static
// (still fully rendered) content, never removed state information.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(!!enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduced(!!enabled)
    );
    return () => {
      mounted = false;
      if (sub && typeof sub.remove === "function") sub.remove();
    };
  }, []);

  return reduced;
}

// Mount-once entrance wrapper: gentle fade + rise. Never wraps an
// element that carries test-asserted styles — it is a pure container,
// so inner layout, testIDs, and parent/child query chains stay intact.
// When reduce motion is on, children render immediately at rest.
export function Enter({
  children,
  delay = 0,
  dy = 10,
  duration = MOTION.card,
  style,
  ...rest
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return undefined;
    }
    const timing = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    timing.start();
    return () => timing.stop();
  }, [reduced, delay, duration, progress]);

  if (reduced) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [dy, 0],
              }),
            },
          ],
        },
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

// Press micro-interaction: a restrained scale-down (default 3%) that
// reads as "responsive" without bouncing. Pair with the existing
// activeOpacity — opacity stays the fallback when reduce motion is on.
export function usePressScale(pressedScale = 0.97) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue, duration) => {
    if (reduced) return;
    Animated.timing(scale, {
      toValue,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return {
    scale,
    handlers: {
      onPressIn: () => animateTo(pressedScale, MOTION.micro),
      onPressOut: () => animateTo(1, MOTION.small),
    },
  };
}
