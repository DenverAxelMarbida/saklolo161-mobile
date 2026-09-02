import React, { useState, useEffect } from "react";
import { StatusBar, StyleSheet, View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { House, FileText, Radio } from "lucide-react-native";
import HomeDashboard from "./src/screens/HomeDashboard";
import IncidentForm from "./src/screens/IncidentForm";
import DispatchTracker from "./src/screens/DispatchTracker";
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
];

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [incidentId, setIncidentId] = useState(null);

  useEffect(() => {
    if (MAPBOX_TOKEN && Mapbox && typeof Mapbox.setAccessToken === "function") {
      Mapbox.setAccessToken(MAPBOX_TOKEN);
    }
  }, []);

  function navigateTo(category) {
    setSelectedCategory(category);
    setScreen("form");
  }

  function navigateToTracker(id) {
    setIncidentId(id);
    setScreen("tracker");
  }

  function goHome() {
    setScreen("home");
    setSelectedCategory(null);
    setIncidentId(null);
  }

  function handleTabPress(tab) {
    if (tab === "home") {
      goHome();
    } else if (tab === "report") {
      goHome();
    } else if (tab === "track") {
      setSelectedCategory(null);
      setIncidentId(null);
      setScreen("tracker");
    }
  }

  function activeTab() {
    if (screen === "tracker") return "track";
    if (screen === "form") return "report";
    return "home";
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor={THEMES.darkNavy} />
        <View style={styles.content}>
          {screen === "home" && <HomeDashboard onCategoryPress={navigateTo} />}
          {screen === "form" && (
            <IncidentForm
              selectedCategory={selectedCategory}
              onBack={goHome}
              onSubmit={navigateToTracker}
            />
          )}
          {screen === "tracker" && (
            <DispatchTracker incidentId={incidentId} onBack={goHome} />
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
                <Icon size={22} color={isActive ? activeColor : THEMES.gray} />
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
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    color: THEMES.gray,
    fontWeight: "500",
  },
});
