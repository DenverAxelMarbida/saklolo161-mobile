import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Shield, FileText, ChevronRight } from "lucide-react-native";
import { THEMES, LIGHT } from "../../lib/themes";
import { Enter } from "../../lib/motion";

// About tab: app identity plus the legal entry points. The Privacy
// Policy and Terms of Use live here (moved out of the Home footer) so
// they have room to breathe on small screens; both documents open as
// scrollable screens and return here.
export default function AboutScreen({ onOpenPrivacy, onOpenTerms }) {
  return (
    <ScrollView testID="about-scroll" style={styles.container}>
      <Enter delay={0} dy={8}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MARIKINA CITY MDRRMO</Text>
          <Text style={styles.title}>SAKLOLO 161</Text>
          <Text style={styles.subtitle}>
            Citizen emergency reporting for Marikina City
          </Text>
        </View>
      </Enter>

      <Enter delay={70} dy={8}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About this app</Text>
          <Text style={styles.body}>
            Report an emergency from the Home tab, then follow it from the
            Track tab with your incident ID. No account or login is needed
            — your phone number identifies your reports.
          </Text>
          <Text testID="about-version" style={styles.version}>
            Version 1.0.0
          </Text>
        </View>
      </Enter>

      <Enter delay={140} dy={8}>
        <Text style={styles.sectionTitle}>LEGAL &amp; PRIVACY</Text>
      </Enter>
      <Enter delay={160} dy={8}>
        <View style={styles.docList}>
          <TouchableOpacity
            testID="link-privacy-policy"
            onPress={() => onOpenPrivacy?.()}
            accessibilityRole="button"
            accessibilityLabel="Open Privacy Policy"
            style={styles.docRow}
            activeOpacity={0.7}
          >
            <Shield size={20} color={THEMES.floodBlue} />
            <View style={styles.docText}>
              <Text style={styles.docTitle}>Privacy Policy</Text>
              <Text style={styles.docSubtitle}>
                How your report data is handled
              </Text>
            </View>
            <ChevronRight size={18} color={LIGHT.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="link-terms-of-use"
            onPress={() => onOpenTerms?.()}
            accessibilityRole="button"
            accessibilityLabel="Open Terms of Use"
            style={styles.docRow}
            activeOpacity={0.7}
          >
            <FileText size={20} color={THEMES.floodBlue} />
            <View style={styles.docText}>
              <Text style={styles.docTitle}>Terms of Use</Text>
              <Text style={styles.docSubtitle}>
                Rules for using Saklolo 161
              </Text>
            </View>
            <ChevronRight size={18} color={LIGHT.textSecondary} />
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
  header: {
    backgroundColor: THEMES.darkNavy,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
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
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: LIGHT.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    color: LIGHT.textPrimary,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: LIGHT.textPrimary,
    lineHeight: 19,
  },
  version: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    fontWeight: "600",
    marginTop: 12,
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
  docList: {
    marginHorizontal: 16,
    gap: 10,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  docText: {
    flex: 1,
  },
  docTitle: {
    color: LIGHT.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  docSubtitle: {
    color: LIGHT.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
