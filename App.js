import React, { useState, useEffect, useCallback } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  BackHandler,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { House, FileText, Radio, History, WifiOff } from "lucide-react-native";
import HomeDashboard from "./src/screens/HomeDashboard";
import IncidentForm from "./src/screens/IncidentForm";
import DispatchTracker from "./src/screens/DispatchTracker";
import ResolvedLog from "./src/screens/ResolvedLog";
import ResolvedDetail from "./src/screens/ResolvedDetail";
import { THEMES } from "./lib/themes";
import { MAPBOX_TOKEN } from "./lib/config";

let Mapbox;
try {
  const mapbox = require("@rnmapbox/maps");
  Mapbox = mapbox.default || mapbox;
} catch {
  // Mapbox not available
}

const TABS = [
  { key: "home", label: "Home", icon: House },
  { key: "report", label: "Report", icon: FileText },
  { key: "track", label: "Track", icon: Radio },
  { key: "history", label: "History", icon: History },
];

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [incidentData, setIncidentData] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [resolvedIncident, setResolvedIncident] = useState(null);

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
      return false;
    });
    return () => sub.remove();
  }, [screen, goHome, goHistory]);

  function handleTabPress(tab) {
    if (tab === "home") {
      goHome();
    } else if (tab === "report") {
      goHome();
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
        <View style={styles.content}>
          {isOffline && (
            <View style={styles.offlineBanner}>
              <WifiOff size={16} color="#FFFFFF" />
              <View style={styles.offlineBody}>
                <Text style={styles.offlineTitle}>You're offline</Text>
                <Text style={styles.offlineText}>
                  An active internet connection is required to report and track
                  emergency incidents. Reconnect to continue submitting reports.
                </Text>
              </View>
            </View>
          )}

          {screen === "home" && <HomeDashboard onCategoryPress={navigateTo} />}
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
            <ResolvedLog onBack={goHistory} onSelect={openResolvedDetail} />
          )}
          {screen === "resolvedDetail" && (
            <ResolvedDetail incident={resolvedIncident} onBack={goHistory} />
          )}
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab() === tab.key;
            const activeColor =
              tab.key === "report"
                ? THEMES.fireRed
                : tab.key === "track"
                ? THEMES.mintGreen
                : THEMES.floodBlue;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => handleTabPress(tab.key)}
                activeOpacity={0.7}
              >
                <Icon size={20} color={isActive ? activeColor : THEMES.gray} />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && { color: activeColor, fontWeight: "700" },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: THEMES.gray,
    fontWeight: "500",
  },
});
