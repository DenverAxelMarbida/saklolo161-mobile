import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { THEMES, LIGHT } from "../../lib/themes";

// Citizen-facing terms of use. Content rules for this file:
// - State only verifiable behavior (see comments); never publish an
//   unverified emergency number or an unsupported legal consequence.
// - Operational details the code cannot answer (emergency
//   instructions, consequences for abuse) are marked PENDING AGENCY
//   REVIEW. Refer to RA 10173 for review without claiming compliance.
// - This is a DRAFT until reviewed by the responsible Marikina City
//   office, privacy officer/DPO, and legal adviser.
function Section({ title, testID, children }) {
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        testID={testID}
        style={styles.sectionTitle}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function P({ children }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export default function TermsOfUse({ onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="terms-back"
        >
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Terms of Use</Text>
          <Text style={styles.headerSubtitle}>Report responsibly</Text>
        </View>
      </View>

      <ScrollView
        testID="terms-scroll"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
        <View style={styles.draftBox} testID="terms-draft-notice">
          <Text style={styles.draftTitle}>Draft notice</Text>
          <Text style={styles.draftText}>
            These terms are a draft pending review by the responsible
            Marikina City office, the privacy officer/DPO, and a legal
            adviser, with reference to the Philippine Data Privacy Act
            of 2012 (RA 10173). Reading these terms collects no personal
            data and requires no login.
          </Text>
        </View>

        <Section title="1. Real emergencies only" testID="terms-genuine">
          {/* Verified: reports go straight to dispatcher triage. */}
          <P>
            Use Saklolo 161 only to report genuine emergencies in
            Marikina City. Every submission goes to a dispatcher queue
            for triage and possible dispatch of responders.
          </P>
        </Section>

        <Section title="2. Accurate information, reachable number" testID="terms-accurate">
          {/* Verified: confirmation + resolution SMS go to the
              submitted citizenPhone; trackers poll by incident ID. */}
          <P>
            Describe what is happening as accurately as you can, keep
            your location services on so responders get the right
            place, and give a mobile number that can receive text
            messages — your confirmation and resolution notices, and
            your report tracking, depend on it.
          </P>
        </Section>

        <Section title="3. False or abusive reports" testID="terms-abuse">
          {/* Verified technical measure only: per-phone rate limiting
              (~3 reports / 10 min). Legal consequences: PENDING. */}
          <P>
            Do not file test, false, prank, or abusive reports — they
            take responders away from real emergencies. To protect the
            queue, the service technically limits how many reports one
            number can file in a short period. Any further consequences
            are pending agency and legal review.
          </P>
        </Section>

        <Section title="4. Response times vary" testID="terms-response">
          {/* Verified: DispatchTracker renders "~X min" estimates from
              GET /api/routes with fallbacks — never a promise. */}
          <P>
            How fast help arrives depends on the emergency, traffic,
            and unit availability. Arrival times shown in the tracker
            are estimates, marked with ~, and are not a promise of an
            exact arrival time.
          </P>
        </Section>

        <Section title="5. If danger is immediate" testID="terms-immediate">
          {/* Verified: HomeDashboard renders a Quick Distress Call
              section with a SAKLOLO 161 call button. Detailed
              emergency instructions: PENDING AGENCY REVIEW. */}
          <P>
            If life or property is in immediate danger, use the Quick
            Distress Call buttons on the Home screen of this app to call
            for help directly. Step-by-step emergency instructions are
            pending agency review and are not stated here.
          </P>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEMES.darkNavy,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  backBtn: {
    padding: 6,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: THEMES.white,
    fontSize: 17,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#C7D0E8",
    fontSize: 12,
    marginTop: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingBottom: 40,
  },
  draftBox: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  draftTitle: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "800",
  },
  draftText: {
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    color: LIGHT.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  paragraph: {
    color: LIGHT.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
});
