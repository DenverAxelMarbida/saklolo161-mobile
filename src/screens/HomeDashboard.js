import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from "react-native";
import {
  Phone,
  MapPin,
  Cloud,
  Droplets,
  AlertTriangle,
  Shield,
  Flame,
  CloudRain,
  Siren,
} from "lucide-react-native";
import axios from "axios";
import { API_BASE_URL, CATEGORY_DISPLAY, CATEGORY_COLORS, THEMES } from "../../lib/config";
import { DISTRESS_NUMBERS } from "../../lib/hotlines";

const FALLBACK_WEATHER = {
  temperature: "28°C",
  condition: "Partly Cloudy",
  humidity: "82%",
  wind: "12km/h",
  riverLevelMeters: 15.2,
  riverStatus: "Normal",
  alertLevel: "Alert Level 1 begins at 15m",
  riskLevel: "LOW RISK",
  timestamp: new Date().toISOString(),
};

const CATEGORY_ICONS = {
  MEDICAL: Shield,
  FIRE: Flame,
  FLOOD: CloudRain,
  CRIME: Siren,
};

const RISK_COLORS = {
  "LOW RISK": THEMES.mintGreen,
  "MEDIUM RISK": "#FBBF24",
  "HIGH RISK": THEMES.fireRed,
};

export default function HomeDashboard({ onCategoryPress }) {
  const [weather, setWeather] = useState(FALLBACK_WEATHER);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/weather-river`)
      .then((res) => {
        if (res.data?.data) setWeather(res.data.data);
      })
      .catch(() => setWeather(FALLBACK_WEATHER));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/weather-river`);
      if (res.data?.data) {
        setWeather(res.data.data);
      }
    } catch {
      setWeather(FALLBACK_WEATHER);
    }
    setRefreshing(false);
  }

  function handleDistressCall(number) {
    Linking.openURL(`tel:${number}`);
  }

  const riskColor = RISK_COLORS[weather.riskLevel] || THEMES.mintGreen;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={THEMES.white}
        />
      }
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>MARIKINA CITY MDRRMO</Text>
          <Text style={styles.title}>SAKLOLO 161</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>MC</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.weatherRow}>
          <Cloud size={20} color={THEMES.white} />
          <Text style={styles.weatherLabel}>Current Weather</Text>
        </View>
        <Text style={styles.temperature}>{weather.temperature}</Text>
        <Text style={styles.condition}>{weather.condition}</Text>
        <Text style={styles.weatherDetail}>
          Humidity: {weather.humidity} | Wind: {weather.wind}
        </Text>

        <View style={[styles.riskPill, { backgroundColor: riskColor }]}>
          <AlertTriangle size={12} color={THEMES.darkNavy} />
          <Text style={styles.riskText}>{weather.riskLevel}</Text>
        </View>

        <View style={styles.riverSection}>
          <View style={styles.riverCard}>
            <Droplets size={16} color={THEMES.floodBlue} />
            <View>
              <Text style={styles.riverLabel}>River Level</Text>
              <Text style={styles.riverValue}>
                {weather.riverLevelMeters}m
              </Text>
            </View>
          </View>
          <View style={styles.riverCard}>
            <MapPin size={16} color={THEMES.mintGreen} />
            <View>
              <Text style={styles.riverLabel}>River Status</Text>
              <Text style={styles.riverValue}>{weather.riverStatus}</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>REPORT AN EMERGENCY</Text>
      <View style={styles.categoryGrid}>
        {Object.entries(CATEGORY_DISPLAY).map(([key, label]) => {
          const Icon = CATEGORY_ICONS[key];
          const color = CATEGORY_COLORS[key];
          return (
            <TouchableOpacity
              key={key}
              style={[styles.categoryCard, { borderColor: color }]}
              onPress={() => onCategoryPress(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIconWrap, { backgroundColor: color }]}>
                <Icon size={24} color={THEMES.white} />
              </View>
              <Text style={styles.categoryLabel}>{label.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>QUICK DISTRESS CALL</Text>
      <View style={styles.distressRow}>
        {Object.entries(DISTRESS_NUMBERS).map(([key, number]) => (
          <TouchableOpacity
            key={key}
            style={styles.distressBtn}
            onPress={() => handleDistressCall(number)}
            activeOpacity={0.7}
          >
            <Phone size={18} color={THEMES.white} />
            <Text style={styles.distressLabel}>{key.replace("_", " ")}</Text>
            <Text style={styles.distressNumber}>{number}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.locationPill}>
        <MapPin size={14} color={THEMES.mintGreen} />
        <Text style={styles.locationText}>Marikina City, Philippines</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1429",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: THEMES.darkNavy,
  },
  eyebrow: {
    fontSize: 11,
    color: THEMES.mintGreen,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    color: THEMES.white,
    fontWeight: "800",
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEMES.mintGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: THEMES.darkNavy,
    fontWeight: "700",
    fontSize: 14,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: THEMES.darkNavy,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  weatherLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  temperature: {
    fontSize: 42,
    color: THEMES.white,
    fontWeight: "700",
  },
  condition: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  weatherDetail: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  riskPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 12,
  },
  riskText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEMES.darkNavy,
  },
  riverSection: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  riverCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
  },
  riverLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  riverValue: {
    fontSize: 14,
    color: THEMES.white,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  categoryCard: {
    width: "47%",
    backgroundColor: THEMES.darkNavy,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  categoryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryLabel: {
    color: THEMES.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  distressRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
  },
  distressBtn: {
    flex: 1,
    backgroundColor: THEMES.darkNavy,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  distressLabel: {
    color: THEMES.white,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  distressNumber: {
    color: THEMES.fireRed,
    fontSize: 16,
    fontWeight: "800",
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 24,
    backgroundColor: "rgba(16,185,129,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  locationText: {
    color: THEMES.mintGreen,
    fontSize: 12,
    fontWeight: "500",
  },
});
