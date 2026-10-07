import React, { act } from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
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

describe("Report tab navigation", () => {
  it("goes straight to the reporting section (no alert) when no report exists", async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-report"));
    });

    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  }, 10000);

  it("routes from History to the reporting section without a dead-end alert", async () => {
    await renderApp();
    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-history"));
    });
    await screen.findByText("Resolved Incidents", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-report"));
    });

    // Home (the reporting section) replaces History — no modal, no alert.
    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByText("Resolved Incidents")).toBeNull();
  }, 10000);

  it("keeps existing report behavior (no alert) when a tracked report exists", async () => {
    require("../lib/storage").getRecentIncidentIds.mockResolvedValue([
      "INC-123",
    ]);
    await renderApp();
    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-history"));
    });
    await screen.findByText("Resolved Incidents", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-report"));
    });

    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  }, 10000);

  it("never calls the dispatcher-only list or submission APIs when opening Report", async () => {
    const axios = require("axios");
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-report"));
    });
    expect(
      await screen.findByText(HOME_GRID, {}, { timeout: 5000 })
    ).toBeTruthy();

    const listCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listCalls).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
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
