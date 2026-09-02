import React, { useState } from "react";
import { StatusBar, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import HomeDashboard from "./src/screens/HomeDashboard";
import IncidentForm from "./src/screens/IncidentForm";
import DispatchTracker from "./src/screens/DispatchTracker";
import { THEMES } from "./lib/config";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [incidentId, setIncidentId] = useState(null);

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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor={THEMES.darkNavy} />
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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEMES.darkNavy,
  },
});
