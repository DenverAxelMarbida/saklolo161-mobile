import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Image,
  Animated,
  Easing,
} from "react-native";
import {
  Phone,
  MapPin,
  Sun,
  CloudSun,
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudFog,
  CloudSnow,
  Droplets,
  AlertTriangle,
  Shield,
  FileText,
  Flame,
  CloudRain,
  Siren,
} from "lucide-react-native";
import axios from "axios";
import { API_BASE_URL, CATEGORY_DISPLAY, CATEGORY_COLORS } from "../../lib/config";
import { THEMES, LIGHT } from "../../lib/themes";
import { DISTRESS_NUMBERS } from "../../lib/hotlines";
import Skeleton from "../components/Skeleton";
import { Enter, MOTION, usePressScale, useReducedMotion } from "../../lib/motion";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Emergency category tile: a gentle mount entrance (staggered across
// the grid) plus a restrained press scale-down. Both are guarded by
// reduce-motion — static content, activeOpacity still gives feedback.
function CategoryCard({ color, label, Icon, index, onPress }) {
  const reduced = useReducedMotion();
  const [entrance] = React.useState(() => new Animated.Value(reduced ? 1 : 0));
  const { scale, handlers } = usePressScale(0.965);

  React.useEffect(() => {
    if (reduced) {
      entrance.setValue(1);
      return undefined;
    }
    const timing = Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.card,
      delay: 150 + index * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    timing.start();
    return () => timing.stop();
  }, [reduced, entrance, index]);

  return (
    <AnimatedTouchable
      style={[
        styles.categoryCard,
        { backgroundColor: color },
        reduced
          ? null
          : {
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
                { scale },
              ],
            },
      ]}
      onPress={onPress}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Report ${label} emergency`}
    >
      <View style={styles.categoryIconWrap}>
        <Icon size={24} color={THEMES.white} />
      </View>
      <Text style={styles.categoryLabel}>{label.toUpperCase()}</Text>
    </AnimatedTouchable>
  );
}

// Distress hotline tile: press-scale only (the row shares one entrance).
function DistressButton({ number, onPress }) {
  const { scale, handlers } = usePressScale(0.975);
  const Icon = Phone;
  return (
    <AnimatedTouchable
      style={[styles.distressBtn, { transform: [{ scale }] }]}
      onPress={onPress}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Call ${number.label} at ${number.display}`}
    >
      <Icon size={18} color={DISTRESS_COLORS[number.key] || THEMES.fireRed} />
      <Text style={styles.distressLabel}>{number.label}</Text>
      <Text style={styles.distressNumber}>{number.display}</Text>
    </AnimatedTouchable>
  );
}

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

const DISTRESS_COLORS = {
  SAKLOLO_161: THEMES.darkNavy,
  MEDICAL_ARMMC_ER: CATEGORY_COLORS.MEDICAL,
  FIRE_BFP_MAIN: CATEGORY_COLORS.FIRE,
  FLOOD_RIVER: CATEGORY_COLORS.FLOOD,
  CRIME_PNP_HQ: CATEGORY_COLORS.CRIME,
};

const RISK_COLORS = {
  "LOW RISK": THEMES.mintGreen,
  "MEDIUM RISK": "#FBBF24",
  "HIGH RISK": THEMES.fireRed,
};

// The hero card is dark navy (#111A3A); the default skeleton tint is
// invisible on it, so the loading placeholders get a light one.
const HERO_SKELETON_TINT = "rgba(255,255,255,0.14)";

// Deterministic condition → graphic mapping, keyed off the same
// condition text the backend sends (OpenWeather `weather[0].main`
// values like "Thunderstorm", plus its "Partly Cloudy" fallback).
// The web WeatherCard maps these exact strings to the same semantic
// keys — keep the two in sync. Unknown text degrades to Cloud.
function weatherGraphicKey(condition = "") {
  const c = String(condition).toLowerCase();
  if (/thunder|storm|tornado|squall/.test(c)) return "storm";
  if (/drizzle/.test(c)) return "drizzle";
  if (/rain|shower/.test(c)) return "rain";
  if (/snow|sleet|hail/.test(c)) return "snow";
  if (/fog|mist|haze|smoke|smog|dust|sand|ash/.test(c)) return "fog";
  if (/clear|sun/.test(c)) return "clear";
  if (/partly/.test(c)) return "partly";
  if (/cloud|overcast/.test(c)) return "cloud";
  return "cloud";
}

const WEATHER_ICONS = {
  clear: Sun,
  partly: CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  drizzle: CloudDrizzle,
  storm: CloudLightning,
  fog: CloudFog,
  snow: CloudSnow,
};

export default function HomeDashboard({ onCategoryPress, onOpenPrivacy, onOpenTerms }) {
  const [weather, setWeather] = useState(null);
  const isFallback = weather === FALLBACK_WEATHER;
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    axios
      .get(`${API_BASE_URL}/api/weather-river`)
      .then((res) => {
        if (!active) return;
        // A successful initial response means the connection works —
        // any "Couldn't update" note from a pull-to-refresh that raced
        // this first load is stale by definition.
        setRefreshError(false);
        if (res.data?.data) {
          setWeather(res.data.data);
        } else {
          setWeather(FALLBACK_WEATHER);
        }
      })
      .catch(() => {
        if (!active) return;
        setWeather(FALLBACK_WEATHER);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/weather-river`);
      if (res.data?.data) {
        setWeather(res.data.data);
        setRefreshError(false);
      } else {
        setRefreshError(true);
      }
    } catch {
      setRefreshError(true);
      setWeather((current) =>
        current === null ? FALLBACK_WEATHER : current
      );
    }
    setRefreshing(false);
  }

  function handleDistressCall(number) {
    Linking.openURL(`tel:${number}`);
  }

  const riskColor = RISK_COLORS[weather?.riskLevel] || THEMES.mintGreen;
  const WeatherIcon =
    WEATHER_ICONS[weatherGraphicKey(weather?.condition)] || Cloud;

  return (
    <ScrollView
      testID="home-scroll"
      style={styles.container}
      refreshControl={
        <RefreshControl
          testID="home-refresh-control"
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={THEMES.darkNavy}
        />
      }
    >
      <Enter delay={0} dy={8}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>MARIKINA CITY MDRRMO</Text>
            <Text style={styles.title}>SAKLOLO 161</Text>
          </View>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Saklolo 161 logo"
          />
        </View>
      </Enter>

      <Enter delay={70} dy={12}>
        <View style={styles.heroCard}>
          {weather === null ? (
            <View
              testID="weather-loading"
              accessibilityLabel="Loading weather"
              accessible
            >
              <Skeleton height={44} width={140} radius={10} color={HERO_SKELETON_TINT} />
              <Skeleton
                height={18}
                width={200}
                radius={6}
                color={HERO_SKELETON_TINT}
                style={{ marginTop: 8 }}
              />
              <Skeleton
                height={14}
                width={240}
                radius={6}
                color={HERO_SKELETON_TINT}
                style={{ marginTop: 6 }}
              />
              <Skeleton
                height={26}
                width={110}
                radius={12}
                color={HERO_SKELETON_TINT}
                style={{ marginTop: 12 }}
              />
              <View style={styles.riverSection}>
                <Skeleton height={62} radius={12} color={HERO_SKELETON_TINT} style={{ flex: 1 }} />
                <Skeleton height={62} radius={12} color={HERO_SKELETON_TINT} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.weatherRow}>
                <Text style={styles.weatherLabel}>Current Weather</Text>
              </View>
              {/* Compact row: the small graphic supports the temperature
                  instead of competing with it — weather is informational,
                  not the dashboard's focal point. */}
              <View style={styles.weatherNow} testID="weather-now">
                <WeatherIcon size={36} color={THEMES.white} />
                <View style={styles.weatherNowText}>
                  <Text style={styles.temperature}>{weather.temperature}</Text>
                  <Text style={styles.condition}>{weather.condition}</Text>
                </View>
              </View>
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

            {isFallback && (
              <Text
                testID="weather-fallback-note"
                style={styles.weatherNote}
                accessibilityLabel="Showing sample weather because the live feed is unavailable"
              >
                Showing sample weather — live feed unavailable.
              </Text>
            )}
            {refreshError && (
              <Text
                testID="weather-refresh-error"
                style={styles.weatherNote}
                accessibilityLabel="Could not update weather, showing the last reading"
              >
                Couldn&apos;t update — showing last reading.
              </Text>
            )}
            </>
          )}
        </View>
      </Enter>

      <Enter delay={140} dy={8}>
        <Text style={styles.sectionTitle}>REPORT AN EMERGENCY</Text>
      </Enter>
      <View style={styles.categoryGrid}>
        {Object.entries(CATEGORY_DISPLAY).map(([key, label], index) => {
          const Icon = CATEGORY_ICONS[key];
          const color = CATEGORY_COLORS[key];
          return (
            <CategoryCard
              key={key}
              index={index}
              color={color}
              label={label}
              Icon={Icon}
              onPress={() => onCategoryPress(key)}
            />
          );
        })}
      </View>

      <Enter delay={330} dy={8}>
        <Text style={styles.sectionTitle}>QUICK DISTRESS CALL</Text>
      </Enter>
      <Enter delay={355} dy={8}>
        <View style={styles.distressRow}>
          {DISTRESS_NUMBERS.map((number) => (
            <DistressButton
              key={number.key}
              number={number}
              onPress={() => handleDistressCall(number.dial)}
            />
          ))}
        </View>
      </Enter>

      <Enter delay={400} dy={8}>
        <View style={styles.locationPill}>
          <MapPin size={14} color={THEMES.mintGreen} />
          <Text style={styles.locationText}>Marikina City, Philippines</Text>
        </View>
      </Enter>

      <Enter delay={420} dy={8}>
        <Text style={styles.sectionTitle}>ABOUT THIS APP</Text>
      </Enter>
      <Enter delay={435} dy={8}>
        <View style={styles.policyLinks}>
          <TouchableOpacity
            testID="link-privacy-policy"
            onPress={() => onOpenPrivacy?.()}
            accessibilityRole="button"
            accessibilityLabel="Open Privacy Policy"
            style={styles.policyLink}
          >
            <Shield size={16} color={THEMES.floodBlue} />
            <Text style={styles.policyLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="link-terms-of-use"
            onPress={() => onOpenTerms?.()}
            accessibilityRole="button"
            accessibilityLabel="Open Terms of Use"
            style={styles.policyLink}
          >
            <FileText size={16} color={THEMES.floodBlue} />
            <Text style={styles.policyLinkText}>Terms of Use</Text>
          </TouchableOpacity>
        </View>
      </Enter>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
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
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: THEMES.mintGreen,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: THEMES.darkNavy,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
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
  weatherNow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  weatherNowText: {
    flexShrink: 1,
  },
  temperature: {
    fontSize: 26,
    color: THEMES.white,
    fontWeight: "700",
  },
  condition: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 1,
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
  weatherNote: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 12,
    lineHeight: 15,
  },
  sectionTitle: {
    fontSize: 12,
    color: LIGHT.textSecondary,
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
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryLabel: {
    color: THEMES.white,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  distressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  distressBtn: {
    flexBasis: "30%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  distressLabel: {
    color: LIGHT.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  distressNumber: {
    color: LIGHT.textSecondary,
    fontSize: 10,
    fontWeight: "600",
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
  policyLinks: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  policyLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  policyLinkText: {
    color: LIGHT.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
});
