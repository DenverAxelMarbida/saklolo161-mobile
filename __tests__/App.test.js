import React, { act } from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import App from "../App";

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

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

// GPS locks instantly so the pull-up form's Submit button is enabled
// as soon as the sheet mounts.
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 14.6507, longitude: 121.1029 },
  })),
  reverseGeocodeAsync: jest.fn(async () => []),
  Accuracy: { Balanced: 3 },
}));

jest.mock("expo-video", () => ({
  useVideoPlayer: jest.fn(() => ({})),
  VideoView: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default || mock;
});

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.reject(new Error("network down"))),
  post: jest.fn(() => Promise.reject(new Error("network down"))),
}));

jest.mock("../lib/storage", () => ({
  getSavedPhone: jest.fn(() => Promise.resolve(null)),
  savePhone: jest.fn(() => Promise.resolve()),
  saveIncidentId: jest.fn(() => Promise.resolve()),
  getRecentIncidentIds: jest.fn(() => Promise.resolve([])),
  removeIncidentId: jest.fn(() => Promise.resolve()),
  getResolvedIncidents: jest.fn(() => Promise.resolve([])),
  saveResolvedIncident: jest.fn(() => Promise.resolve()),
  getFailedEvidence: jest.fn(() => Promise.resolve([])),
  saveFailedEvidence: jest.fn(() => Promise.resolve()),
  clearFailedEvidence: jest.fn(() => Promise.resolve()),
}));

const HOME_GRID = "REPORT AN EMERGENCY";

beforeAll(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
  const storage = require("../lib/storage");
  storage.getRecentIncidentIds.mockResolvedValue([]);
  storage.getResolvedIncidents.mockResolvedValue([]);
});

async function renderApp() {
  const view = await render(<App />);
  await screen.findByText(HOME_GRID, {}, { timeout: 5000 });
  return view;
}

describe("App startup splash", () => {
  it("shows the startup splash first, then the home dashboard", async () => {
    await render(<App />);

    expect(screen.getByText("Saklolo 161")).toBeTruthy();
    expect(screen.queryByText(HOME_GRID)).toBeNull();

    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(screen.queryByText("Saklolo 161")).toBeNull();
  }, 10000);
});

describe("Bottom tab bar", () => {
  it("shows exactly four tabs — Home, Track, History, About — and no Report tab", async () => {
    await renderApp();

    expect(screen.getByTestId("tab-home")).toBeTruthy();
    expect(screen.getByTestId("tab-track")).toBeTruthy();
    expect(screen.getByTestId("tab-history")).toBeTruthy();
    expect(screen.getByTestId("tab-about")).toBeTruthy();
    expect(screen.queryByTestId("tab-report")).toBeNull();
  }, 10000);
});

describe("Pull-up emergency report", () => {
  async function openFormFromCategory() {
    await renderApp();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Report Fire emergency"));
    });
    await screen.findByText("Emergency Report", {}, { timeout: 5000 });
  }

  it("opens the report form from a Home category tap with the category preselected", async () => {
    await openFormFromCategory();

    expect(screen.getByText("Emergency Report")).toBeTruthy();
    expect(screen.getAllByText("FIRE").length).toBeGreaterThan(0);
  }, 10000);

  it("hides the bottom tab bar while the form is open", async () => {
    await openFormFromCategory();

    expect(screen.queryByTestId("tab-home")).toBeNull();
    expect(screen.queryByTestId("tab-track")).toBeNull();
    expect(screen.queryByTestId("tab-history")).toBeNull();
  }, 10000);

  it("presents the report sheet as a visible modal when a category is tapped", async () => {
    await renderApp();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Report Fire emergency"));
    });

    // The sheet is a native modal: visible + sliding up natively, so it
    // cannot strand off-screen the way a hand-rolled overlay could.
    // Visibility here means the modal is presented with the form in it
    // — text queries alone can't prove a custom overlay is on-screen,
    // but a presented modal is on-screen by platform guarantee.
    const sheet = screen.getByTestId("report-sheet");
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.animationType).toBe("slide");
    expect(screen.getByText("Emergency Report")).toBeTruthy();
    expect(screen.getAllByText("FIRE").length).toBeGreaterThan(0);
  }, 10000);

  it("closes the form back to Home without submitting or calling any API", async () => {
    await openFormFromCategory();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Go back"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Emergency Report")).toBeNull()
    );

    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(screen.getByTestId("tab-home")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();

    const axios = require("axios");
    const listCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listCalls).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
  }, 10000);

  it("dismisses the modal instantly on close with no leftover overlay", async () => {
    await openFormFromCategory();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Go back"));
    });

    // Instant dismiss: no closing transition, so no blocker element and
    // no stuck sheet can exist afterwards.
    await waitFor(() =>
      expect(screen.queryByText("Emergency Report")).toBeNull()
    );
    expect(screen.queryByTestId("report-sheet")).toBeNull();
    expect(screen.getByTestId("tab-home")).toBeTruthy();
    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
  }, 10000);

  it("handles Android hardware back while the form is open, even on a double-fire", async () => {
    // Capture the BackHandler listener so the test can drive the exact
    // path a hardware back press takes.
    const { BackHandler } = require("react-native");
    let hardwareBackHandler = null;
    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((event, handler) => {
        if (event === "hardwareBackPress") hardwareBackHandler = handler;
        return { remove: jest.fn() };
      });

    try {
      await openFormFromCategory();
      const onRequestClose =
        screen.getByTestId("report-sheet").props.onRequestClose;

      // Hardware back while open: the listener consumes it and closes.
      let handled;
      await act(async () => {
        handled = hardwareBackHandler();
      });
      expect(handled).toBe(true);

      // A late duplicate close signal from the OS is a guarded no-op.
      await act(async () => {
        onRequestClose();
      });

      await waitFor(() =>
        expect(screen.queryByText("Emergency Report")).toBeNull()
      );
      expect(screen.getByTestId("tab-home")).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    } finally {
      // Targeted restore only — jest.restoreAllMocks() would also kill
      // the file-level Alert.alert spy.
      spy.mockRestore();
    }
  }, 10000);

  it("opens Track with the new incident after a successful submission", async () => {
    const axios = require("axios");
    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          incidentId: "INC-77",
          category: "Fire",
          status: "Pending",
          location: {
            latitude: 14.6507,
            longitude: 121.1029,
            address: "Marikina City, Philippines",
          },
          timestamp: "2026-10-10T10:00:00.000Z",
          notes: "",
          evidence: [],
        },
      },
    });
    await openFormFromCategory();

    // GPS locks instantly in this suite — wait for the locked state
    // so Submit is enabled.
    await screen.findByText("GPS Locked", {}, { timeout: 5000 });
    await fireEvent.changeText(
      screen.getByPlaceholderText("+639XXXXXXXXX"),
      "+639171234567"
    );
    await act(async () => {
      fireEvent.press(screen.getByText("SUBMIT REPORT"));
    });

    expect(
      await screen.findByText("Dispatch Tracker", {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(screen.queryByText("Emergency Report")).toBeNull();
    expect(screen.getByTestId("tab-track").props.accessibilityState.selected).toBe(
      true
    );
    expect(require("../lib/storage").saveIncidentId).toHaveBeenCalledWith(
      "INC-77"
    );
  }, 10000);

  it("keeps the form open with entered data when submission fails", async () => {
    const axios = require("axios");
    axios.post.mockRejectedValueOnce(new Error("network down"));
    await openFormFromCategory();

    await screen.findByText("GPS Locked", {}, { timeout: 5000 });
    await fireEvent.changeText(
      screen.getByPlaceholderText("+639XXXXXXXXX"),
      "+639171234567"
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Describe what you see..."),
      "Smoke near the warehouse"
    );
    await act(async () => {
      fireEvent.press(screen.getByText("SUBMIT REPORT"));
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Submission Failed",
        expect.any(String)
      )
    );
    // Form stays up, tab bar stays hidden, typed data is retained.
    expect(screen.getByText("Emergency Report")).toBeTruthy();
    expect(screen.queryByTestId("tab-home")).toBeNull();
    expect(screen.getByPlaceholderText("+639XXXXXXXXX").props.value).toBe(
      "+639171234567"
    );
    expect(
      screen.getByPlaceholderText("Describe what you see...").props.value
    ).toBe("Smoke near the warehouse");
  }, 10000);
});

describe("About tab", () => {
  async function openAbout() {
    await renderApp();
    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-about"));
    });
    await screen.findByTestId("about-scroll", {}, { timeout: 5000 });
  }

  it("shows the About screen with branding and both policy links", async () => {
    await openAbout();

    expect(screen.getByText("SAKLOLO 161")).toBeTruthy();
    expect(screen.getByTestId("about-version")).toBeTruthy();
    expect(screen.getByTestId("link-privacy-policy")).toBeTruthy();
    expect(screen.getByTestId("link-terms-of-use")).toBeTruthy();
    expect(screen.getByTestId("tab-about").props.accessibilityState.selected).toBe(true);
  }, 10000);

  it("opens the Privacy Policy from About and returns via back", async () => {
    await openAbout();

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-privacy-policy"));
    });
    expect(await screen.findByTestId("privacy-scroll")).toBeTruthy();
    expect(screen.getByTestId("privacy-draft-notice")).toBeTruthy();
    // About stays the selected tab while a document is open.
    expect(screen.getByTestId("tab-about").props.accessibilityState.selected).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacy-back"));
    });
    expect(await screen.findByTestId("about-scroll")).toBeTruthy();
  }, 10000);

  it("opens the Terms of Use from About and returns via back", async () => {
    await openAbout();

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-terms-of-use"));
    });
    expect(await screen.findByTestId("terms-scroll")).toBeTruthy();
    expect(screen.getByTestId("terms-draft-notice")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("terms-back"));
    });
    expect(await screen.findByTestId("about-scroll")).toBeTruthy();
  }, 10000);
});

describe("History back navigation", () => {
  const resolvedFixture = {
    incidentId: "INC-9",
    category: "Fire",
    status: "Resolved",
    location: {
      address: "Ermita, Manila",
      latitude: 14.6,
      longitude: 121.0,
    },
    timestamp: "2026-09-11T10:00:00.000Z",
    evidence: [],
    notes: "",
  };

  it("returns from a history incident detail back to the history list", async () => {
    require("../lib/storage").getResolvedIncidents.mockResolvedValue([
      resolvedFixture,
    ]);
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-history"));
    });
    const card = await screen.findByTestId("history-card-INC-9", {}, { timeout: 5000 });
    await act(async () => {
      fireEvent.press(card);
    });

    expect(
      await screen.findByText("Incident Details", {}, { timeout: 5000 })
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("icon-ArrowLeft"));
    });

    // Back lands on the list — intact, not Home, no stale detail.
    expect(
      await screen.findByText("Resolved Incidents", {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(screen.getByTestId("history-card-INC-9")).toBeTruthy();
    expect(screen.queryByText("Incident Details")).toBeNull();
    expect(screen.queryByText(HOME_GRID)).toBeNull();
  }, 10000);

  it("history list back button returns to the home dashboard", async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-history"));
    });
    await screen.findByText("Resolved Incidents", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("icon-ArrowLeft"));
    });

    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(screen.queryByText("Resolved Incidents")).toBeNull();
  }, 10000);
});
