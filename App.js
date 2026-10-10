import React, { useState, useEffect, useCallback } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  BackHandler,
  Animated,
  Easing,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { House, FileText, Radio, History, WifiOff } from "lucide-react-native";
import HomeDashboard from "./src/screens/HomeDashboard";
import IncidentForm from "./src/screens/IncidentForm";
import DispatchTracker from "./src/screens/DispatchTracker";
import ResolvedLog from "./src/screens/ResolvedLog";
import ResolvedDetail from "./src/screens/ResolvedDetail";
import PrivacyPolicy from "./src/screens/PrivacyPolicy";
import TermsOfUse from "./src/screens/TermsOfUse";
import StartupSplash from "./src/components/StartupSplash";
import { THEMES } from "./lib/themes";
import { MAPBOX_TOKEN } from "./lib/config";
import { useReducedMotion } from "./lib/motion";

let Mapbox;
try {
  const mapbox = require("@rnmapbox/maps");
  Mapbox = mapbox.default || mapbox;
} catch {
  // Mapbox not available
}

// `activeLabel` is the active tab's TEXT ink only — the brand icon
// colors fail WCAG AA as 10px text (mint ≈2.5:1, red/blue ≈3.8:1 on
// white), so the icon keeps its brand color while the label darkens.
// `a11yLabel` gives screen readers an action-oriented name.
const TABS = [
  { key: "home", label: "Home", icon: House, a11yLabel: "Open Home", activeLabel: "#1D4ED8" },
  { key: "report", label: "Report", icon: FileText, a11yLabel: "Report emergency", activeLabel: "#B91C1C" },
  { key: "track", label: "Track", icon: Radio, a11yLabel: "Open Track", activeLabel: "#047857" },
  { key: "history", label: "History", icon: History, a11yLabel: "Open History", activeLabel: "#1D4ED8" },
];

const SPLASH_DURATION_MS = 1500;

// One bottom-nav tab: a top indicator bar that eases in on activation
// plus a short opacity settle on the icon/label. Motion is decorative
// only — colors, labels, testIDs, roles, and selected state are
// untouched, and reduce motion renders the final state immediately.
function TabItem({ tab, isActive, activeColor, onPress }) {
  const reduced = useReducedMotion();
  const indicator = React.useRef(new Animated.Value(0)).current;
  const settle = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      indicator.setValue(isActive ? 1 : 0);
      settle.setValue(1);
      return undefined;
    }
    Animated.timing(indicator, {
      toValue: isActive ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (isActive) {
      settle.setValue(0.55);
      Animated.timing(settle, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
    return undefined;
  }, [isActive, reduced, indicator, settle]);

  const Icon = tab.icon;
  return (
    <TouchableOpacity
      style={styles.tabItem}
      testID={`tab-${tab.key}`}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityLabel={tab.a11yLabel}
      accessibilityState={{ selected: isActive }}
    >
      {isActive ? (
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              backgroundColor: activeColor,
              opacity: indicator,
              transform: [{ scaleX: indicator }],
            },
          ]}
        />
      ) : null}
      <Animated.View style={[styles.tabContent, { opacity: settle }]}>
        <Icon size={20} color={isActive ? activeColor : THEMES.gray} />
        <Text
          style={[
            styles.tabLabel,
            isActive && { color: tab.activeLabel, fontWeight: "700" },
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [incidentData, setIncidentData] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [resolvedIncident, setResolvedIncident] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (MAPBOX_TOKEN && Mapbox && typeof Mapbox.setAccessToken === "function") {
      Mapbox.setAccessToken(MAPBOX_TOKEN);
    }
  }, []);

  // Track connectivity so the app can warn the user that an internet
  // connection is required to report/track incidents. Clear the banner
  // automatically as soon as the device is back online.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline =
        state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, []);

  function navigateTo(category) {
    setSelectedCategory(category);
    setScreen("form");
  }

  function navigateToTracker(incident) {
    setIncidentData(incident || null);
    setScreen("tracker");
  }

  const goHome = useCallback(() => {
    setScreen("home");
    setSelectedCategory(null);
    setIncidentData(null);
    setResolvedIncident(null);
  }, []);

  function goTracker() {
    setSelectedCategory(null);
    setIncidentData(null);
    setScreen("tracker");
  }

  function openResolvedDetail(incident) {
    setResolvedIncident(incident || null);
    setScreen("resolvedDetail");
  }

  // Policy screens are informational only: no login, no new personal
  // data. They open from the Home footer and return there.
  function openPrivacyPolicy() {
    setScreen("privacy");
  }

  function openTermsOfUse() {
    setScreen("terms");
  }

  const goHistory = useCallback(() => {
    setSelectedCategory(null);
    setIncidentData(null);
    setResolvedIncident(null);
    setScreen("history");
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "resolvedDetail") {
        goHistory();
        return true;
      }
      if (screen === "form" || screen === "tracker" || screen === "history") {
        goHome();
        return true;
      }
      if (screen === "privacy" || screen === "terms") {
        goHome();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, goHome, goHistory]);

  function handleReportPress() {
    // Report always lands on the reporting section (Home): with a tracked
    // report that's where recent incidents live, and with none the
    // category grid is the entry point for creating one. The old dead-end
    // "No report yet" alert is gone by design — Home IS that section.
    goHome();
  }

  function handleTabPress(tab) {
    if (tab === "home") {
      goHome();
    } else if (tab === "report") {
      handleReportPress();
    } else if (tab === "track") {
      goTracker();
    } else if (tab === "history") {
      goHistory();
    }
  }

  function activeTab() {
    if (screen === "tracker") return "track";
    if (screen === "form") return "report";
    if (screen === "history" || screen === "resolvedDetail") return "history";
    return "home";
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor={THEMES.darkNavy} />
        {booting ? (
          <StartupSplash />
        ) : (
          <>
            <View style={styles.content}>
              {isOffline && (
                <View style={styles.offlineBanner}>
                  <WifiOff size={16} color="#FFFFFF" />
                  <View style={styles.offlineBody}>
                    <Text style={styles.offlineTitle}>You're offline</Text>
                    <Text style={styles.offlineText}>
                      An active internet connection is required to report and
                      track emergency incidents. Reconnect to continue
                      submitting reports.
                    </Text>
                  </View>
                </View>
              )}

              {screen === "home" && (
                <HomeDashboard
                  onCategoryPress={navigateTo}
                  onOpenPrivacy={openPrivacyPolicy}
                  onOpenTerms={openTermsOfUse}
                />
              )}
              {screen === "form" && (
                <IncidentForm
                  selectedCategory={selectedCategory}
                  onBack={goHome}
                  onSubmit={navigateToTracker}
                />
              )}
              {screen === "tracker" && (
                <DispatchTracker
                  incidentId={incidentData?.incidentId || null}
                  initialIncident={incidentData}
                  onBack={goHome}
                />
              )}
              {screen === "history" && (
                <ResolvedLog onBack={goHome} onSelect={openResolvedDetail} />
              )}
              {screen === "resolvedDetail" && (
                <ResolvedDetail incident={resolvedIncident} onBack={goHistory} />
              )}
              {screen === "privacy" && <PrivacyPolicy onBack={goHome} />}
              {screen === "terms" && <TermsOfUse onBack={goHome} />}
            </View>

            <View style={styles.tabBar} accessibilityRole="tablist">
              {TABS.map((tab) => {
                const isActive = activeTab() === tab.key;
                const activeColor =
                  tab.key === "report"
                    ? THEMES.fireRed
                    : tab.key === "track"
                    ? THEMES.mintGreen
                    : THEMES.floodBlue;
                return (
                  <TabItem
                    key={tab.key}
                    tab={tab}
                    isActive={isActive}
                    activeColor={activeColor}
                    onPress={() => handleTabPress(tab.key)}
                  />
                );
              })}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#B45309",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offlineBody: {
    flex: 1,
  },
  offlineTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  offlineText: {
    color: "#FDE68A",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingBottom: 6,
    paddingTop: 4,
    shadowColor: "#111A3A",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  tabIndicator: {
    position: "absolute",
    top: 0,
    width: 22,
    height: 2.5,
    borderRadius: 2,
  },
  tabContent: {
    alignItems: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: THEMES.gray,
    fontWeight: "500",
  },
});
