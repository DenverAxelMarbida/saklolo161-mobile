import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { THEMES } from "../../lib/themes";
import { Enter, MOTION } from "../../lib/motion";

/**
 * App-level startup screen. The native expo-splash-screen config can only
 * render an image + background color (no text), so the brand name is shown
 * here right after the native splash hides — same dark navy background and
 * the same shared logo asset, so the handoff reads as one screen.
 */
export default function StartupSplash() {
  return (
    <View style={styles.container} testID="startup-splash">
      {/* Gentle brand settle — the handoff from the native splash. */}
      <Enter delay={80} dy={0} duration={MOTION.state}>
        <View style={styles.brandBlock}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Saklolo 161 logo"
          />
          <Text style={styles.title}>Saklolo 161</Text>
        </View>
      </Enter>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEMES.darkNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBlock: {
    alignItems: "center",
  },
  logo: {
    width: 128,
    height: 128,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: THEMES.white,
    marginTop: 18,
    letterSpacing: 0.5,
  },
});
