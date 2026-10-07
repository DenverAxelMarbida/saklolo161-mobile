import React, { act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as Location from "expo-location";
import axios from "axios";
import IncidentForm from "../src/screens/IncidentForm";
import * as evidenceLib from "../lib/evidence";
import * as storageLib from "../lib/storage";

jest.mock("lucide-react-native", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    {
      get: (_, prop) => (props) =>
        ReactMock.createElement(
          Text,
          { testID: `icon-${String(prop)}` },
          String(prop)
        ),
    }
  );
});

// GPS never resolves during the tests: the form stays in its
// "acquiring" state so the exact wording is assertable.
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(() => new Promise(() => {})),
  getCurrentPositionAsync: jest.fn(() => new Promise(() => {})),
  reverseGeocodeAsync: jest.fn(() => new Promise(() => {})),
  Accuracy: { Balanced: 3 },
}));

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.reject(new Error("network down"))),
  post: jest.fn(() => Promise.reject(new Error("network down"))),
}));

jest.mock("../lib/storage", () => ({
  getSavedPhone: jest.fn(() => Promise.resolve(null)),
  savePhone: jest.fn(() => Promise.resolve()),
  saveIncidentId: jest.fn(() => Promise.resolve()),
  saveFailedEvidence: jest.fn(() => Promise.resolve()),
  clearFailedEvidence: jest.fn(() => Promise.resolve()),
}));

jest.mock("../lib/evidence", () => ({
  pickEvidence: jest.fn(() => Promise.resolve([])),
  captureEvidence: jest.fn(() => Promise.resolve([])),
  appendEvidence: jest.fn((list, items) => [...list, ...items]),
  uploadEvidence: jest.fn(() => Promise.resolve()),
  uploadEvidenceResilient: jest.fn(() => Promise.resolve({ fileId: "ev-1" })),
  evidenceErrorMessage: jest.fn(
    (err) => err?.message || "Evidence couldn't be uploaded. You can retry."
  ),
  updateEvidenceStatus: jest.fn(() => Promise.resolve()),
  retryFailedEvidence: jest.fn(() => Promise.resolve([])),
  reportEvidenceAttempt: jest.fn(() => Promise.resolve()),
  evidenceTooLarge: jest.fn(() => false),
  evidenceUploadLikelyToTimeOut: jest.fn(() => false),
  formatEvidenceSize: jest.fn((size) => String(size)),
  formatEvidenceDuration: jest.fn((ms) => String(ms)),
  MAX_CAPTURE_DURATION_MS: 60000,
  MAX_EVIDENCE: 5,
}));

beforeAll(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
});

function renderForm() {
  return render(
    <IncidentForm
      selectedCategory="MEDICAL"
      onBack={jest.fn()}
      onSubmit={jest.fn()}
    />
  );
}

describe("GPS/location text encoding", () => {
  it("renders clean readable GPS strings with no mojibake", async () => {
    await renderForm();

    expect(await screen.findByText("Acquiring GPS\u2026")).toBeTruthy();
    expect(screen.getByText("Waiting for your location\u2026")).toBeTruthy();
    expect(screen.getByText("ACQUIRING LOCATION\u2026")).toBeTruthy();
    expect(screen.getByText("Refresh GPS")).toBeTruthy();
    expect(screen.queryByText("Retry GPS")).toBeNull();

    expect(screen.queryByText(/\u00e2\u20ac/)).toBeNull();
    expect(screen.queryByText(/\u00e2\u20ac\u009d/)).toBeNull();
  });
});

describe("Report header", () => {
  it("shows Emergency Report without the step indicator and keeps the back button working", async () => {
    const onBack = jest.fn();
    await render(
      <IncidentForm
        selectedCategory="MEDICAL"
        onBack={onBack}
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText("Emergency Report")).toBeTruthy();
    expect(screen.queryByText("Step 2 of 2")).toBeNull();

    await fireEvent.press(screen.getByTestId("icon-ArrowLeft"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("Report form pull-to-refresh", () => {
  it("re-acquires location without wiping unsaved form data or submitting", async () => {
    await renderForm();

    await waitFor(() =>
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1)
    );

    const notes = screen.getByPlaceholderText("Describe what you see...");
    await fireEvent.changeText(notes, "Fire on the second floor");
    const phone = screen.getByPlaceholderText("+639XXXXXXXXX");
    await fireEvent.changeText(phone, "+639171234567");

    const scroll = screen.getByTestId("report-form-scroll");
    expect(scroll.props.refreshControl).toBeTruthy();
    await act(async () => {
      scroll.props.refreshControl.props.onRefresh();
    });

    // Location state was reacquired...
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
    // ...but nothing the citizen typed was touched...
    expect(
      screen.getByPlaceholderText("Describe what you see...").props.value
    ).toBe("Fire on the second floor");
    expect(
      screen.getByPlaceholderText("+639XXXXXXXXX").props.value
    ).toBe("+639171234567");
    // ...the category badge, evidence area and submit flow are intact...
    expect(screen.getAllByText("MEDICAL").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(
      screen.queryByText("SUBMIT REPORT") ||
        screen.queryByText("ACQUIRING LOCATION\u2026")
    ).toBeTruthy();
    // ...and nothing was submitted or fetched.
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe("Submission flow with evidence", () => {
  function creationCalls() {
    return axios.post.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/incidents")
    );
  }

  async function attachOnePhotoAndSubmit(onSubmit) {
    // GPS resolves to a locked fix for this flow.
    Location.requestForegroundPermissionsAsync.mockResolvedValue({
      status: "granted",
      granted: true,
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 14.65, longitude: 121.1 },
    });
    Location.reverseGeocodeAsync.mockResolvedValue([
      { name: "Marikina", street: "Shoe Ave", city: "Marikina City", region: null },
    ]);
    evidenceLib.pickEvidence.mockResolvedValue([
      {
        uri: "file://evidence.jpg",
        name: "evidence.jpg",
        mimeType: "image/jpeg",
        kind: "photo",
        fileSize: 204800,
      },
    ]);

    await render(
      <IncidentForm
        selectedCategory="MEDICAL"
        onBack={jest.fn()}
        onSubmit={onSubmit}
      />
    );

    await screen.findByText("SUBMIT REPORT");

    // Attach one photo through the chooser sheet.
    fireEvent.press(screen.getByText("Add Photo"));
    fireEvent.press(await screen.findByText("Choose from library"));
    await screen.findByText("1 of 5 attachments");

    await fireEvent.changeText(
      screen.getByPlaceholderText("+639XXXXXXXXX"),
      "+639171234567"
    );
    await fireEvent.press(screen.getByText("SUBMIT REPORT"));
  }

  it("creates the incident exactly once, then uploads in the background", async () => {
    axios.post.mockImplementation((url) =>
      String(url).endsWith("/api/incidents")
        ? Promise.resolve({ data: { data: { incidentId: "INC-NEW" } } })
        : Promise.resolve({ data: { data: { fileId: "ev-1" } } })
    );
    const onSubmit = jest.fn();

    await attachOnePhotoAndSubmit(onSubmit);

    // Incident creation happens exactly once — never per attachment.
    await waitFor(() => expect(creationCalls()).toHaveLength(1));
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/incidents$/),
      expect.objectContaining({ evidenceExpectedCount: 1 })
    );

    // Evidence upload runs through the resilient uploader and reports
    // completion on the shared progress contract.
    await waitFor(() =>
      expect(evidenceLib.uploadEvidenceResilient).toHaveBeenCalledTimes(1)
    );
    expect(evidenceLib.uploadEvidenceResilient).toHaveBeenCalledWith(
      "INC-NEW",
      expect.objectContaining({ name: "evidence.jpg", mimeType: "image/jpeg" }),
      expect.objectContaining({ index: 1, count: 1, onAttempt: expect.any(Function) })
    );
    // Retry attempts beyond the first are reported for the web dashboard
    // (attempt 1 is skipped — the server already knows uploads started).
    const resilientOpts = evidenceLib.uploadEvidenceResilient.mock.calls[0][2];
    resilientOpts.onAttempt({ attempt: 1, total: 3 });
    resilientOpts.onAttempt({ attempt: 2, total: 3 });
    await waitFor(() =>
      expect(evidenceLib.reportEvidenceAttempt).toHaveBeenCalledWith(
        "INC-NEW",
        2,
        3
      )
    );
    expect(evidenceLib.reportEvidenceAttempt).toHaveBeenCalledWith(
      "INC-NEW",
      1,
      3
    );
    await waitFor(() =>
      expect(evidenceLib.updateEvidenceStatus).toHaveBeenCalledWith(
        "INC-NEW",
        { evidenceUploading: false, evidenceFailedCount: 0, evidenceAttempt: 1 }
      )
    );

    expect(storageLib.saveIncidentId).toHaveBeenCalledWith("INC-NEW");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: "INC-NEW" })
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      "Attachments Incomplete",
      expect.anything(),
      expect.anything()
    );
  });

  it("never blocks submission when uploads fail and surfaces a citizen-safe reason", async () => {
    axios.post.mockImplementation((url) =>
      String(url).endsWith("/api/incidents")
        ? Promise.resolve({ data: { data: { incidentId: "INC-NEW" } } })
        : Promise.resolve({ data: { data: { fileId: "ev-1" } } })
    );
    evidenceLib.uploadEvidenceResilient.mockRejectedValueOnce(
      Object.assign(new Error("timeout of 60000ms exceeded"), {
        code: "ECONNABORTED",
      })
    );
    evidenceLib.evidenceErrorMessage.mockReturnValue(
      "Upload is taking too long. Check your connection and retry."
    );
    const onSubmit = jest.fn();

    await attachOnePhotoAndSubmit(onSubmit);

    // The report itself still succeeds — evidence failure never blocks it.
    await waitFor(() => expect(creationCalls()).toHaveLength(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Failure is recorded on the shared progress contract for the web
    // dashboard, and the file is persisted for manual Retry later.
    await waitFor(() =>
      expect(evidenceLib.updateEvidenceStatus).toHaveBeenCalledWith(
        "INC-NEW",
        {
          evidenceUploading: false,
          evidenceFailedCount: 1,
          evidenceAttempt: 1,
        }
      )
    );
    expect(storageLib.saveFailedEvidence).toHaveBeenCalledWith("INC-NEW", [
      expect.objectContaining({ name: "evidence.jpg" }),
    ]);

    // Citizen sees the differentiated message, not raw axios text.
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Attachments Incomplete",
        expect.stringContaining(
          "Upload is taking too long. Check your connection and retry."
        ),
        expect.anything()
      )
    );
    const [, alertBody] = Alert.alert.mock.calls.find(
      ([title]) => title === "Attachments Incomplete"
    );
    expect(alertBody).not.toMatch(/ECONNABORTED|timeout of/);
    // Still only one incident creation despite the failed attachment.
    expect(creationCalls()).toHaveLength(1);
  });
});

describe("Report screen citizen-facing content", () => {
  it("has no Priority row in Incident Details, keeping the other rows", async () => {
    await renderForm();

    expect(screen.getByText("Incident Details")).toBeTruthy();
    // The citizen never sees or sets priority — it's dispatcher data.
    expect(screen.queryByText("Priority")).toBeNull();
    expect(screen.queryByText("Standard")).toBeNull();

    // Removal was surgical: the neighbouring metadata rows remain.
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getByText("Reference")).toBeTruthy();
    expect(screen.getByText("Timestamp")).toBeTruthy();
    expect(screen.getByText("Phone Number")).toBeTruthy();
  });

  it("preserves the entered phone number in the submitted incident payload", async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({
      status: "granted",
      granted: true,
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 14.65, longitude: 121.1 },
    });
    Location.reverseGeocodeAsync.mockResolvedValue([
      { name: "Marikina", street: "Shoe Ave", city: "Marikina City", region: null },
    ]);
    axios.post.mockResolvedValue({
      data: { data: { incidentId: "INC-PHONE-TEST" } },
    });

    await renderForm();
    await screen.findByText("SUBMIT REPORT");

    await fireEvent.changeText(
      screen.getByPlaceholderText("+639XXXXXXXXX"),
      "09218346260"
    );
    await fireEvent.press(screen.getByText("SUBMIT REPORT"));

    await waitFor(() =>
      expect(
        axios.post.mock.calls.filter(([url]) =>
          String(url).endsWith("/api/incidents")
        )
      ).toHaveLength(1)
    );
    const creation = axios.post.mock.calls.find(([url]) =>
      String(url).endsWith("/api/incidents")
    );
    // The canonical field the backend stores/returns — the same value
    // Track, History, and the web dashboard later render.
    expect(creation[1]).toEqual(
      expect.objectContaining({ citizenPhone: "09218346260" })
    );
  });
});
