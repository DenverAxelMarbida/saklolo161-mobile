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

// Citizen-facing privacy notice. Content rules for this file:
// - State only what the app and backend verifiably do (see comments).
// - Anything operational the code cannot answer (retention periods,
//   deletion process, privacy contact) is marked PENDING AGENCY REVIEW.
// - Refer to RA 10173 (Philippine Data Privacy Act of 2012) for review
//   without claiming certified compliance.
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

export default function PrivacyPolicy({ onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="privacy-back"
        >
          <ArrowLeft size={20} color={THEMES.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <Text style={styles.headerSubtitle}>How your report data is handled</Text>
        </View>
      </View>

      <ScrollView
        testID="privacy-scroll"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
        <View style={styles.draftBox} testID="privacy-draft-notice">
          <Text style={styles.draftTitle}>Draft notice</Text>
          <Text style={styles.draftText}>
            This notice is a draft pending review by the responsible
            Marikina City office, the privacy officer/DPO, and a legal
            adviser, with reference to the Philippine Data Privacy Act
            of 2012 (RA 10173). It does not claim certified compliance.
          </Text>
        </View>

        <Section title="1. Information you provide" testID="privacy-collect">
          {/* Verified: IncidentForm posts citizenPhone, category,
              location (lat/lng), notes, and attached photo/video files. */}
          <P>
            When you file a report, the app sends your mobile number,
            the incident category, your GPS location, any notes you
            type, and any photos or videos you attach.
          </P>
        </Section>

        <Section title="2. Why it is collected" testID="privacy-purpose">
          {/* Verified: reports are triaged/dispatched by agency staff;
              citizenPhone receives the confirmation + resolution SMS. */}
          <P>
            Your report is used to route the emergency to Marikina City
            responders, to show you status updates in the tracker, and
            to send you two text messages: a confirmation when your
            report is received and a notice when the incident is
            resolved.
          </P>
        </Section>

        <Section title="3. Tracking without an account" testID="privacy-tracking">
          {/* Verified: useIncidentPolling polls GET /api/incidents/:id;
              the app has no login (Hard Rule 1). */}
          <P>
            This app has no login. It follows your report using the
            incident ID it was given — no account or password is needed,
            and reading these policy screens collects no personal data.
          </P>
        </Section>

        <Section title="4. Where your data is kept" testID="privacy-storage">
          {/* Verified: Firebase RTDB incident records + evidence
              metadata; Firebase Storage photo/video blobs; AsyncStorage
              saved phone, recent IDs (max 5), resolved copies,
              failed-evidence retry queue. */}
          <P>
            On the service side, reports and their details are stored
            in Firebase: incident records in the Firebase database, and
            attached photos and videos in Firebase file storage. On your
            phone, the app keeps your saved number, your recent report
            IDs (at most five), copies of resolved reports for history,
            and any photos or videos still waiting to finish uploading.
          </P>
        </Section>

        <Section title="5. Who can see it" testID="privacy-access">
          {/* Verified: dispatcher dashboard is authenticated +
              agency-scoped; TriageModal renders citizenPhone. No app
              lock exists, so device holders see on-device data. */}
          <P>
            Authorized dispatchers see reports through the internal
            dashboard, limited to their agency, including the contact
            number on each report. Anyone holding your unlocked phone
            can open what this app saved on it, since the app itself
            has no lock screen or login.
          </P>
        </Section>

        <Section title="6. Retention, deletion, and sharing" testID="privacy-retention">
          {/* Verified absence: no DELETE endpoint, no retention/expiry
              job in the backend — PENDING AGENCY REVIEW. */}
          <P>
            How long reports are kept, how you can ask for a report to
            be deleted, and any sharing beyond emergency response are
            pending agency review. The app currently provides no
            in-app delete or retention controls.
          </P>
        </Section>

        <Section title="7. Questions and rights" testID="privacy-rights">
          {/* No privacy contact exists in code — PENDING. */}
          <P>
            A contact channel for privacy questions and requests is
            pending agency review and will be listed here once the
            responsible office provides it.
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
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
