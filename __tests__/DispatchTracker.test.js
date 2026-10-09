import React from "react";
import {
  render,
  screen,
  within,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react-native";
import { AccessibilityInfo, BackHandler } from "react-native";
import axios from "axios";
import DispatchTracker from "../src/screens/DispatchTracker";
import useIncidentPolling from "../src/hooks/useIncidentPolling";
import {
  CATEGORY_COLORS,
  CATEGORY_DISPLAY,
  API_BASE_URL,
} from "../lib/config";
import { THEMES } from "../lib/themes";
import {
  getRecentIncidentIds,
  getFailedEvidence,
  clearFailedEvidence,
} from "../lib/storage";
import {
  retryFailedEvidence,
  updateEvidenceStatus,
  reportEvidenceAttempt,
  evidenceEtaSeconds,
  getRecentEvidenceEvent,
} from "../lib/evidence";

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

// Track's evidence card shares History's EvidenceGrid, which pulls in
// expo-video for inline playback. Mock it with a visible marker so the
// tests can assert video items without a native player.
jest.mock("expo-video", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return {
    useVideoPlayer: jest.fn(() => ({})),
    VideoView: (props) =>
      ReactMock.createElement(
        Text,
        { testID: props.testID || "evidence-video" },
        "video"
      ),
  };
});

const DEFAULT_HOOK_VALUE = {
  incident: null,
  error: null,
  notFound: false,
  refetch: jest.fn(() => Promise.resolve()),
};

jest.mock("../src/hooks/useIncidentPolling", () =>
  jest.fn(() => ({
    incident: null,
    error: null,
    notFound: false,
    refetch: jest.fn(() => Promise.resolve()),
  }))
);

jest.mock("../lib/storage", () => ({
  getRecentIncidentIds: jest.fn(() => Promise.resolve([])),
  getFailedEvidence: jest.fn(() => Promise.resolve([])),
  clearFailedEvidence: jest.fn(() => Promise.resolve()),
  saveFailedEvidence: jest.fn(() => Promise.resolve([])),
  saveResolvedIncident: jest.fn(() => Promise.resolve()),
  removeIncidentId: jest.fn(() => Promise.resolve()),
}));

jest.mock("../lib/evidence", () => ({
  retryFailedEvidence: jest.fn(() => Promise.resolve([])),
  updateEvidenceStatus: jest.fn(() => Promise.resolve()),
  reportEvidenceAttempt: jest.fn(() => Promise.resolve()),
  // Live progress bus: tests grab `listener` and push synthetic events.
  subscribeEvidenceProgress: jest.fn((listener) => {
    mockProgressListener = listener;
    return () => {
      if (mockProgressListener === listener) {
        mockProgressListener = null;
      }
    };
  }),
  getRecentEvidenceEvent: jest.fn(() => null),
  evidenceProgressPercent: jest.fn((loaded, total) => {
    const t = Number(total) || 0;
    if (!(t > 0)) return null;
    return Math.min(100, Math.floor(((Number(loaded) || 0) / t) * 100));
  }),
  evidenceEtaSeconds: jest.fn(() => null),
  formatEvidenceSize: jest.fn((bytes) => {
    const n = Number(bytes) || 0;
    if (n <= 0) return "0 MB";
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }),
  formatEvidenceDuration: jest.fn((ms) => `${Math.round((ms || 0) / 1000)}s`),
  formatUploadDuration: jest.fn((ms) =>
    ms > 0 ? `${((ms / 1000) || 0).toFixed(1)} sec` : null
  ),
}));
let mockProgressListener = null;

jest.mock("axios", () => ({
  get: jest.fn(),
}));

jest.mock("@rnmapbox/maps", () => ({}));

const INCIDENT = {
  incidentId: "INC-77",
  category: "Flood",
  status: "Dispatched",
  timestamp: "2026-10-09T00:00:00.000Z",
  location: { longitude: 121.1, latitude: 14.6, address: "Marikina City" },
  station: { coords: { lat: 14.65, lng: 121.1 } },
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockReturnValue(new Promise(() => {}));
  getRecentIncidentIds.mockReturnValue(new Promise(() => {}));
});

function makeDispatchedIncident(overrides = {}) {
  return {
    incidentId: "INC-20260911-7659",
    category: "Fire",
    status: "Dispatched",
    location: {
      latitude: 14.5958,
      longitude: 120.9772,
      address: "Ermita, Manila",
    },
    notes: "",
    timestamp: "2026-09-11T10:00:00.000Z",
    evidence: [],
    evidenceUploading: false,
    evidenceExpectedCount: 0,
    evidenceFailedCount: 0,
    dispatch: {
      stationId: "FIRE_BFP_MAIN",
      stationName: "BFP Main",
      assignedUnit: "BFP-01",
      estimatedTurnout: "2–5 mins",
      dispatchedAt: "2026-09-11T10:05:00.000Z",
      arrivalEtaMinutes: 66,
    },
    station: {
      id: "FIRE_BFP_MAIN",
      name: "BFP Main",
      coords: { lat: 14.633094158302429, lng: 121.09756704853923 },
    },
    ...overrides,
  };
}

function renderTracker(incident) {
  return render(
    <DispatchTracker
      incidentId={incident.incidentId}
      initialIncident={incident}
      onBack={jest.fn()}
    />
  );
}

function renderList() {
  return render(
    <DispatchTracker incidentId={null} initialIncident={null} onBack={jest.fn()} />
  );
}

// Routes axios.get by URL: per-incident IDs resolve from the given map,
// /api/routes resolves a small geometry, everything else rejects. Mirrors
// how the app uses the existing citizen endpoints (never the list route).
function mockIncidentEndpointsById(incidentsById) {
  axios.get.mockImplementation((url) => {
    const match = /\/api\/incidents\/([^/?]+)$/.exec(String(url));
    if (match) {
      const data = incidentsById[match[1]];
      if (data) return Promise.resolve({ data: { data } });
      return Promise.reject(new Error("not found"));
    }
    if (String(url).includes("/api/routes")) {
      return Promise.resolve({
        data: {
          data: {
            geometry: {
              type: "LineString",
              coordinates: [
                [121.0975, 14.6331],
                [120.9772, 14.5958],
              ],
            },
            distanceMeters: 22300,
            durationSeconds: 3960,
          },
        },
      });
    }
    return Promise.reject(new Error("unexpected url"));
  });
}

function routeCallCount() {
  return axios.get.mock.calls.filter(([url]) =>
    String(url).includes("/api/routes")
  ).length;
}

describe("DispatchTracker ETA rows", () => {
  it("shows the server-computed driving ETA plus the station readiness string", async () => {
    axios.get.mockRejectedValue(new Error("network down"));

    await renderTracker(makeDispatchedIncident());

    expect((await screen.findByTestId("driving-eta")).props.children).toBe(
      "~66 min"
    );
    expect(screen.getByTestId("station-readiness").props.children).toBe(
      "2–5 mins"
    );
  });

  it("falls back to the live route duration when the dispatch stamp is missing", async () => {
    axios.get.mockResolvedValue({
      data: {
        data: {
          geometry: {
            type: "LineString",
            coordinates: [
              [121.0975, 14.6331],
              [120.9772, 14.5958],
            ],
          },
          distanceMeters: 22300,
          durationSeconds: 3960,
        },
      },
    });

    const incident = makeDispatchedIncident();
    delete incident.dispatch.arrivalEtaMinutes;

    await renderTracker(incident);

    expect((await screen.findByTestId("driving-eta")).props.children).toBe(
      "~66 min"
    );
    expect(screen.getByTestId("station-readiness").props.children).toBe(
      "2–5 mins"
    );
  });

  it("does not show ETA/readiness rows before a dispatch exists", async () => {
    axios.get.mockRejectedValue(new Error("network down"));

    const incident = makeDispatchedIncident();
    incident.dispatch = null;
    incident.station = null;

    await renderTracker(incident);

    expect(screen.queryByTestId("driving-eta")).toBeNull();
    expect(screen.queryByTestId("station-readiness")).toBeNull();
  });
});

describe("Track incident card", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockRejectedValue(new Error("network down"));
  });

  it("shows reference, category, status, location and reported time", async () => {
    await renderTracker(makeDispatchedIncident());
    const card = await screen.findByTestId("track-incident-card");

    expect(within(card).getByText("INC-20260911-7659")).toBeTruthy();
    expect(within(card).getByText("Fire")).toBeTruthy();
    expect(within(card).getByText("DISPATCHED")).toBeTruthy();
    expect(within(card).getByText("Ermita, Manila")).toBeTruthy();
    expect(within(card).getByText("Reported")).toBeTruthy();
  });

  it("keeps polling the same incident id as before", async () => {
    await renderTracker(makeDispatchedIncident());
    await screen.findByTestId("track-incident-card");

    expect(useIncidentPolling).toHaveBeenCalledWith("INC-20260911-7659");
  });

  Object.keys(CATEGORY_DISPLAY).forEach((key) => {
    it(`accents the card for ${key} using the shared color map`, async () => {
      await renderTracker(
        makeDispatchedIncident({ category: CATEGORY_DISPLAY[key] })
      );
      const card = await screen.findByTestId("track-incident-card");

      expect(card).toHaveStyle({
        borderLeftColor: CATEGORY_COLORS[key],
        borderLeftWidth: 4,
      });
      expect(within(card).getByText(CATEGORY_DISPLAY[key])).toBeTruthy();
    });
  });

  it("falls back to the slate accent for an unknown category", async () => {
    await renderTracker(makeDispatchedIncident({ category: "Alien" }));
    const card = await screen.findByTestId("track-incident-card");

    expect(card).toHaveStyle({ borderLeftColor: THEMES.crimeSlate });
    expect(within(card).getByText("Alien")).toBeTruthy();
  });

  it("falls back safely when the category is missing", async () => {
    await renderTracker(makeDispatchedIncident({ category: undefined }));
    const card = await screen.findByTestId("track-incident-card");

    expect(card).toHaveStyle({ borderLeftColor: THEMES.crimeSlate });
  });

  it("reflects status changes in the card status pill", async () => {
    await renderTracker(makeDispatchedIncident({ status: "Resolved" }));

    expect(await screen.findByText("RESOLVED")).toBeTruthy();
  });

  it("never calls the dispatcher-only incident list endpoint", async () => {
    await renderTracker(makeDispatchedIncident());
    await screen.findByTestId("track-incident-card");

    const listCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listCalls).toHaveLength(0);
  });
});
describe("Track incident list (cards instead of a bare-ID picker)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
    getRecentIncidentIds.mockResolvedValue([]);
    axios.get.mockRejectedValue(new Error("network down"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders tracked incidents as cards with id, category, status, location and reported time", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A", "INC-B"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A" }),
      "INC-B": makeDispatchedIncident({
        incidentId: "INC-B",
        category: "Medical",
        status: "Pending",
      }),
    });

    await renderList();

    const cardA = await screen.findByTestId("track-card-INC-A");
    expect(screen.getByTestId("track-card-INC-B")).toBeTruthy();

    // The bare-ID picker is gone.
    expect(screen.queryByText("Select an Incident")).toBeNull();
    expect(screen.queryByText("No recent incidents found.")).toBeNull();

    expect(within(cardA).getByText("INC-A")).toBeTruthy();
    expect(within(cardA).getByText("Fire")).toBeTruthy();
    expect(within(cardA).getByText("DISPATCHED")).toBeTruthy();
    expect(within(cardA).getByText("Ermita, Manila")).toBeTruthy();
    expect(within(cardA).getByText(/Reported/)).toBeTruthy();
  });

  it("selects a card to open the existing tracking view and back returns to the list", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A" }),
    });
    useIncidentPolling.mockImplementation(() => ({
      incident: makeDispatchedIncident({ incidentId: "INC-A" }),
      error: null,
      notFound: false,
      refetch: jest.fn(() => Promise.resolve()),
    }));

    await renderList();
    await fireEvent.press(await screen.findByTestId("track-card-INC-A"));
    // Flush the route fetch + selection state inside act.
    await act(async () => {});

    // Existing detail view + polling contract (single per-id argument).
    expect(await screen.findByTestId("track-incident-card")).toBeTruthy();
    expect(useIncidentPolling).toHaveBeenCalledWith("INC-A");
    expect(screen.queryByText("Select an Incident")).toBeNull();

    // Header back returns to the card list (not home, no stale detail).
    await fireEvent.press(screen.getByTestId("icon-ArrowLeft"));
    expect(await screen.findByTestId("track-card-INC-A")).toBeTruthy();
    expect(screen.queryByTestId("track-incident-card")).toBeNull();
  });

  it("android hardware back from the detail view returns to the list", async () => {
    const handlers = [];
    jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((event, fn) => {
        if (event === "hardwareBackPress") handlers.push(fn);
        return { remove: jest.fn() };
      });
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A" }),
    });
    useIncidentPolling.mockImplementation(() => ({
      incident: makeDispatchedIncident({ incidentId: "INC-A" }),
      error: null,
      notFound: false,
      refetch: jest.fn(() => Promise.resolve()),
    }));

    await renderList();
    await fireEvent.press(await screen.findByTestId("track-card-INC-A"));
    await act(async () => {});
    await screen.findByTestId("track-incident-card");

    expect(handlers.length).toBeGreaterThan(0);
    let handled = false;
    await act(async () => {
      handled = handlers[handlers.length - 1]();
    });
    expect(handled).toBe(true);

    expect(await screen.findByTestId("track-card-INC-A")).toBeTruthy();
    expect(screen.queryByTestId("track-incident-card")).toBeNull();
  });

  Object.keys(CATEGORY_DISPLAY).forEach((key) => {
    it(`accents the card for ${key} using the shared color map`, async () => {
      getRecentIncidentIds.mockResolvedValue(["INC-A"]);
      mockIncidentEndpointsById({
        "INC-A": makeDispatchedIncident({
          incidentId: "INC-A",
          category: CATEGORY_DISPLAY[key],
        }),
      });

      await renderList();
      const card = await screen.findByTestId("track-card-INC-A");

      expect(card).toHaveStyle({
        borderLeftColor: CATEGORY_COLORS[key],
        borderLeftWidth: 4,
      });
      expect(within(card).getByText(CATEGORY_DISPLAY[key])).toBeTruthy();
    });
  });

  it("falls back to the slate accent for an unknown category", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A", category: "Alien" }),
    });

    await renderList();
    const card = await screen.findByTestId("track-card-INC-A");

    expect(card).toHaveStyle({ borderLeftColor: THEMES.crimeSlate });
    expect(within(card).getByText("Alien")).toBeTruthy();
  });

  it("falls back safely when the category is missing", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A", category: undefined }),
    });

    await renderList();
    const card = await screen.findByTestId("track-card-INC-A");

    expect(card).toHaveStyle({ borderLeftColor: THEMES.crimeSlate });
    expect(within(card).queryByText(/Reported/)).toBeTruthy();
  });

  it("shows the empty state when there are no tracked incidents", async () => {
    getRecentIncidentIds.mockResolvedValue([]);

    await renderList();

    expect(await screen.findByTestId("track-empty-state")).toBeTruthy();
    expect(screen.getByText("No Recent Incidents")).toBeTruthy();
    expect(
      screen.getByText("Your recent reports will appear here when available.")
    ).toBeTruthy();
    expect(screen.queryByText("Select an Incident")).toBeNull();
    expect(screen.queryByText("No recent incidents found.")).toBeNull();
  });

  it("uses the per-incident endpoint for cards and never the dispatcher list endpoint", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A" }),
    });

    await renderList();
    await screen.findByTestId("track-card-INC-A");

    expect(axios.get).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/incidents/INC-A`
    );
    const listCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listCalls).toHaveLength(0);
  });

  it("keeps an ID-only card (no invented details) when a per-incident fetch fails", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-LOST"]);
    axios.get.mockRejectedValue(new Error("network down"));

    await renderList();
    const card = await screen.findByTestId("track-card-INC-LOST");

    expect(within(card).getByText("INC-LOST")).toBeTruthy();
    expect(within(card).queryByText(/Reported/)).toBeNull();
    expect(
      within(card).queryByText(/DISPATCHED|PENDING|EN ROUTE|RESOLVED/)
    ).toBeNull();
  });

  it("re-fetches card details on pull-to-refresh", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-A"]);
    mockIncidentEndpointsById({
      "INC-A": makeDispatchedIncident({ incidentId: "INC-A" }),
    });

    await renderList();
    await screen.findByTestId("track-card-INC-A");
    expect(axios.get).toHaveBeenCalledTimes(1);

    const scroll = screen.getByTestId("track-list-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});

describe("Track detail pull-to-refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
    getRecentIncidentIds.mockResolvedValue([]);
    axios.get.mockRejectedValue(new Error("network down"));
  });

  it("re-fetches the selected incident through refetch and recomputes the route", async () => {
    const refetchMock = jest.fn(() => Promise.resolve());
    useIncidentPolling.mockImplementation(() => ({
      incident: makeDispatchedIncident(),
      error: null,
      notFound: false,
      refetch: refetchMock,
    }));
    getRecentIncidentIds.mockResolvedValue(["INC-20260911-7659"]);
    mockIncidentEndpointsById({
      "INC-20260911-7659": makeDispatchedIncident(),
    });

    await renderList();
    await fireEvent.press(
      await screen.findByTestId("track-card-INC-20260911-7659")
    );
    await act(async () => {});
    await screen.findByTestId("track-incident-card");

    const before = routeCallCount();

    const scroll = screen.getByTestId("track-detail-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(routeCallCount()).toBe(before + 1);
    // Selected incident is preserved throughout.
    expect(screen.getByTestId("track-incident-card")).toBeTruthy();
    expect(useIncidentPolling).toHaveBeenCalledWith("INC-20260911-7659");
  });
});

describe("Evidence progress display and manual retry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
    getRecentIncidentIds.mockResolvedValue([]);
    axios.get.mockRejectedValue(new Error("network down"));
  });

  it("shows an aggregate uploading state while attachments are inbound", async () => {
    await renderTracker(
      makeDispatchedIncident({
        evidence: [],
        evidenceUploading: true,
        evidenceExpectedCount: 2,
        evidenceFailedCount: 0,
      })
    );

    expect(
      await screen.findByText("⏳ Attaching evidence 0/2…")
    ).toBeTruthy();
    expect(screen.queryByText(/Evidence uploaded/)).toBeNull();
  });

  it("confirms uploaded evidence once every attachment is in", async () => {
    await renderTracker(
      makeDispatchedIncident({
        evidence: [
          {
            fileId: "ev-1",
            mimeType: "image/jpeg",
            sizeKb: 120,
            url: "/api/incidents/INC/media",
            uploadedAt: "2026-09-11T10:06:00.000Z",
          },
        ],
        evidenceUploading: false,
        evidenceExpectedCount: 1,
        evidenceFailedCount: 0,
      })
    );

    expect(await screen.findByText("✓ Evidence uploaded (1)")).toBeTruthy();
    expect(screen.queryByText(/Attaching evidence/)).toBeNull();
  });

  it("marks evidence as uploading again during a manual retry, then off", async () => {
    const failedFile = {
      uri: "file://a.jpg",
      name: "a.jpg",
      mimeType: "image/jpeg",
    };
    getFailedEvidence.mockResolvedValue([failedFile]);

    await renderTracker(
      makeDispatchedIncident({ evidenceFailedCount: 1, evidence: [] })
    );

    await fireEvent.press(
      screen.getByLabelText("Retry failed attachments")
    );
    await waitFor(() =>
      expect(updateEvidenceStatus).toHaveBeenCalledTimes(2)
    );

    // First ping tells the dashboard attachments are inbound again (and
    // resets any stale retry-attempt number)…
    expect(updateEvidenceStatus).toHaveBeenNthCalledWith(1, "INC-20260911-7659", {
      evidenceUploading: true,
      evidenceAttempt: 1,
    });
    // …the final ping reports the real outcome and leaves attempt at 1.
    expect(updateEvidenceStatus).toHaveBeenLastCalledWith(
      "INC-20260911-7659",
      { evidenceUploading: false, evidenceFailedCount: 0, evidenceAttempt: 1 }
    );
    expect(retryFailedEvidence).toHaveBeenCalledWith(
      "INC-20260911-7659",
      [failedFile],
      expect.any(Function),
      expect.objectContaining({ onAttempt: expect.any(Function) })
    );
    expect(clearFailedEvidence).toHaveBeenCalledWith("INC-20260911-7659");
    // Progress UI ends in the retrying state (banner gone, no failure left).
    await waitFor(() =>
      expect(screen.queryByLabelText("Retry failed attachments")).toBeNull()
    );
  });
});

describe("Live evidence progress panel (byte-level)", () => {
  const uploadingIncident = () =>
    makeDispatchedIncident({
      evidence: [],
      evidenceUploading: true,
      evidenceExpectedCount: 2,
      evidenceFailedCount: 0,
    });

  async function pushEvent(event) {
    await act(async () => {
      if (mockProgressListener) mockProgressListener(event);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
    getRecentIncidentIds.mockResolvedValue([]);
    axios.get.mockRejectedValue(new Error("network down"));
    evidenceEtaSeconds.mockReturnValue(null);
    getRecentEvidenceEvent.mockReturnValue(null);
    mockProgressListener = null;
  });

  afterEach(() => {
    mockProgressListener = null;
  });

  it("shows bar, percent and bytes from real byte-level events", async () => {
    await renderTracker(uploadingIncident());

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      index: 1,
      count: 2,
      name: "a.jpg",
      loaded: 500000,
      total: 1000000,
      elapsedMs: 2000,
    });

    const panel = await screen.findByTestId("evidence-progress-panel");
    expect(panel).toBeTruthy();
    expect(screen.getByText("Uploading evidence (1 of 2)…")).toBeTruthy();
    const bar = screen.getByTestId("evidence-progress-bar");
    expect(bar.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: "50%" })])
    );
    expect(screen.getByText("50% • 0.5 MB / 1.0 MB")).toBeTruthy();
    // No ETA without a measured estimate (evidenceEtaSeconds → null).
    expect(screen.queryByText(/remaining/)).toBeNull();
    // Poll fallback one-liner must not double up with the live panel.
    expect(screen.queryByText(/Attaching evidence/)).toBeNull();
  });

  it("appends a measured ETA only when the helper confirms it", async () => {
    await renderTracker(uploadingIncident());
    evidenceEtaSeconds.mockReturnValue(4);

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 750000,
      total: 1000000,
      rate: 65536,
      estimated: 3.9,
      elapsedMs: 5000,
    });

    expect(await screen.findByText(/About 4 sec remaining/)).toBeTruthy();
  });

  it("hides the bar and shows the next attempt while retrying", async () => {
    await renderTracker(uploadingIncident());

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 900000,
      total: 1000000,
      elapsedMs: 4000,
    });
    expect(await screen.findByText("90% • 0.9 MB / 1.0 MB")).toBeTruthy();

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "retrying",
      attempt: 2,
      failedAttempt: 1,
      attempts: 3,
    });

    expect(
      await screen.findByText("Connection interrupted — retrying…")
    ).toBeTruthy();
    expect(screen.getByText("Attempt 2 of 3")).toBeTruthy();
    expect(screen.queryByTestId("evidence-progress-bar")).toBeNull();
    // The failed attempt's 90% must not linger on screen.
    expect(screen.queryByText(/90%/)).toBeNull();
  });

  it("restarts the bar at 0% for the new attempt (no stale jump-back)", async () => {
    await renderTracker(uploadingIncident());

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 900000,
      total: 1000000,
      elapsedMs: 4000,
    });
    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "retrying",
      attempt: 2,
      failedAttempt: 1,
      attempts: 3,
    });
    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 2,
      attempts: 3,
      loaded: 0,
      total: 1000000,
      elapsedMs: 0,
    });

    const bar = await screen.findByTestId("evidence-progress-bar");
    expect(bar.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: "0%" })])
    );
    expect(screen.queryByText("Attempt 2 of 3")).toBeNull();
    expect(screen.queryByText(/90%/)).toBeNull();
  });

  it("never fakes a percentage when the total bytes are unknown", async () => {
    await renderTracker(uploadingIncident());

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 524288,
      total: undefined,
      elapsedMs: 3000,
    });

    expect(await screen.findByText("0.5 MB sent…")).toBeTruthy();
    expect(screen.queryByTestId("evidence-progress-bar")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("shows the measured duration after a successful upload", async () => {
    await renderTracker(
      makeDispatchedIncident({
        evidence: [
          {
            fileId: "ev-1",
            mimeType: "image/jpeg",
            sizeKb: 3072,
            url: "/api/x/media",
            uploadedAt: "2026-09-11T10:06:00.000Z",
          },
        ],
        evidenceUploading: false,
        evidenceExpectedCount: 1,
        evidenceFailedCount: 0,
      })
    );

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "done",
      attempt: 1,
      attempts: 3,
      durationMs: 8400,
      total: 3145728,
      loaded: 3145728,
    });

    expect(await screen.findByText("✓ Evidence uploaded (1)")).toBeTruthy();
    expect(screen.getByText("3.0 MB • 8.4 sec")).toBeTruthy();
  });

  it("shows no fabricated duration for a reconciled (already-stored) file", async () => {
    await renderTracker(
      makeDispatchedIncident({
        evidence: [
          {
            fileId: "ev-1",
            mimeType: "image/jpeg",
            sizeKb: 100,
            url: "/api/x/media",
          },
        ],
        evidenceUploading: false,
        evidenceExpectedCount: 1,
        evidenceFailedCount: 0,
      })
    );

    await pushEvent({
      incidentId: "INC-20260911-7659",
      phase: "done",
      attempt: 1,
      attempts: 3,
      reconciled: true,
    });

    expect(await screen.findByText("✓ Evidence uploaded (1)")).toBeTruthy();
    expect(screen.queryByText(/sec/)).toBeNull();
  });

  it("adopts the cached last event when it mounts mid-upload", async () => {
    getRecentEvidenceEvent.mockReturnValue({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 250000,
      total: 1000000,
      elapsedMs: 2500,
      at: Date.now(),
    });

    await renderTracker(uploadingIncident());

    expect(await screen.findByTestId("evidence-progress-panel")).toBeTruthy();
    expect(screen.getByText("25% • 0.2 MB / 1.0 MB")).toBeTruthy();
    expect(getRecentEvidenceEvent).toHaveBeenCalledWith("INC-20260911-7659");
  });

  it("unsubscribes from the progress bus on unmount", async () => {
    const { unmount } = await renderTracker(uploadingIncident());
    expect(mockProgressListener).toEqual(expect.any(Function));
    await act(async () => {
      unmount();
    });
    expect(mockProgressListener).toBeNull();
  });

  it("ignores events for a different incident", async () => {
    await renderTracker(uploadingIncident());

    await pushEvent({
      incidentId: "INC-OTHER",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 500000,
      total: 1000000,
      elapsedMs: 2000,
    });

    expect(screen.queryByTestId("evidence-progress-panel")).toBeNull();
    expect(await screen.findByText(/Attaching evidence 0\/2/)).toBeTruthy();
  });
});

describe("Dispatch unit visual (vehicle banner)", () => {
  it.each([
    ["Medical", "icon-Ambulance"],
    ["Fire", "icon-Truck"],
    ["Crime", "icon-CarFront"],
    ["Flood", "icon-Ship"],
  ])("shows the %s vehicle with 'Unit dispatched' when Dispatched", async (category, iconId) => {
    await renderTracker(makeDispatchedIncident({ category }));

    expect(screen.getByTestId("dispatch-unit-visual")).toBeTruthy();
    expect(screen.getByTestId(iconId)).toBeTruthy();
    expect(screen.getByText("Unit dispatched")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-unit-motion-lines")).toBeNull();
  });

  it("shows 'Unit is on the way' with motion lines when En Route", async () => {
    await renderTracker(makeDispatchedIncident({ status: "En Route" }));

    expect(screen.getByTestId("dispatch-unit-visual")).toBeTruthy();
    expect(screen.getByText("Unit is on the way")).toBeTruthy();
    expect(screen.getByTestId("dispatch-unit-motion-lines")).toBeTruthy();
  });

  it.each(["Pending", "Resolved", "Alien"])(
    "renders no banner for status %s",
    async (status) => {
      await renderTracker(makeDispatchedIncident({ status }));
      expect(screen.queryByTestId("dispatch-unit-visual")).toBeNull();
    }
  );

  it("renders no banner in the list view", async () => {
    await renderList();
    expect(screen.queryByTestId("dispatch-unit-visual")).toBeNull();
  });

  it("renders the static variant when reduce motion is enabled", async () => {
    // Swap the method instead of jest.spyOn: RN's isReduceMotionEnabled is
    // already a mock, spyOn returns that same instance, and mockRestore()
    // would wipe the shared implementation for every later test in this
    // file (breaking their AccessibilityInfo calls). Reassign + restore
    // the original reference so nothing else is mutated.
    const original = AccessibilityInfo.isReduceMotionEnabled;
    AccessibilityInfo.isReduceMotionEnabled = jest.fn(() =>
      Promise.resolve(true)
    );
    try {
      await renderTracker(makeDispatchedIncident({ status: "En Route" }));
      await act(async () => {});

      expect(screen.getByTestId("dispatch-unit-visual")).toBeTruthy();
      expect(screen.getByText("Unit is on the way")).toBeTruthy();
      expect(screen.queryByTestId("dispatch-unit-motion-lines")).toBeNull();
    } finally {
      AccessibilityInfo.isReduceMotionEnabled = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Evidence success banner + uploaded-evidence card (detail view).
// ---------------------------------------------------------------------------

// Push a synthetic progress-bus event (module-level listener captured by
// the lib/evidence mock above).
async function pushTrackerEvent(event) {
  await act(async () => {
    if (mockProgressListener) mockProgressListener(event);
  });
}

function successIncident(overrides = {}) {
  return makeDispatchedIncident({
    evidence: [
      {
        fileId: "ev-1",
        mimeType: "image/jpeg",
        sizeKb: 120,
        url: "/api/incidents/INC-20260911-7659/media",
        uploadedAt: "2026-09-11T10:06:00.000Z",
      },
    ],
    evidenceUploading: false,
    evidenceExpectedCount: 1,
    evidenceFailedCount: 0,
    ...overrides,
  });
}

function evidenceTestSetup() {
  jest.clearAllMocks();
  useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
  getRecentIncidentIds.mockResolvedValue([]);
  getRecentEvidenceEvent.mockReturnValue(null);
  axios.get.mockRejectedValue(new Error("network down"));
}

describe("Evidence success banner auto-dismiss", () => {
  beforeEach(evidenceTestSetup);

  afterEach(() => {
    jest.useRealTimers();
  });

  it("dismisses the success banner about 3 seconds after it appears", async () => {
    jest.useFakeTimers();
    await renderTracker(successIncident());

    expect(screen.getByText("✓ Evidence uploaded (1)")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText("✓ Evidence uploaded (1)")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/Evidence uploaded/)).toBeNull();
  });

  it("never dismisses the banner while an upload is in progress", async () => {
    jest.useFakeTimers();
    await renderTracker(successIncident());
    expect(screen.getByText("✓ Evidence uploaded (1)")).toBeTruthy();

    await pushTrackerEvent({
      incidentId: "INC-20260911-7659",
      phase: "uploading",
      attempt: 1,
      attempts: 3,
      loaded: 100,
      total: 1000,
    });

    // The dismiss clock is suspended for the whole in-flight window.
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(screen.getByText("✓ Evidence uploaded (1)")).toBeTruthy();

    // Settling the upload restarts a full 3-second window.
    await pushTrackerEvent({
      incidentId: "INC-20260911-7659",
      phase: "done",
      attempt: 1,
      attempts: 3,
      loaded: 1000,
      total: 1000,
      durationMs: 500,
    });
    await act(async () => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText("✓ Evidence uploaded (1)")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/Evidence uploaded/)).toBeNull();
  });

  it("clears the dismiss timer on unmount (no stale timers)", async () => {
    jest.useFakeTimers();
    // React keeps its own internal timers around, so jest.getTimerCount()
    // can't prove cleanup — track the banner's exact 3000ms handle instead.
    const setSpy = jest.spyOn(global, "setTimeout");
    const clearSpy = jest.spyOn(global, "clearTimeout");
    try {
      const { unmount } = await renderTracker(successIncident());
      const bannerTimers = setSpy.mock.calls
        .map((call, i) => ({ delay: call[1], handle: setSpy.mock.results[i]?.value }))
        .filter(({ delay }) => delay === 3000)
        .map(({ handle }) => handle);
      expect(bannerTimers.length).toBeGreaterThan(0);

      await act(async () => {
        unmount();
      });
      for (const handle of bannerTimers) {
        expect(clearSpy.mock.calls.some((call) => call[0] === handle)).toBe(true);
      }
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe("Uploaded evidence in Track detail", () => {
  beforeEach(evidenceTestSetup);

  it("renders the uploaded evidence card with History's visuals", async () => {
    await renderTracker(
      successIncident({
        evidence: [
          {
            fileId: "ev-img",
            mimeType: "image/jpeg",
            sizeKb: 120,
            url: "/api/incidents/INC-20260911-7659/media",
          },
          {
            fileId: "ev-vid",
            mimeType: "video/mp4",
            sizeKb: 2048,
            url: "/api/incidents/INC-20260911-7659/clip",
          },
          { fileId: "ev-bad", mimeType: "", sizeKb: 40 },
        ],
        evidenceExpectedCount: 3,
      })
    );

    expect(await screen.findByTestId("track-evidence-card")).toBeTruthy();
    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(screen.getAllByTestId("evidence-image")).toHaveLength(1);
    expect(screen.getByTestId("evidence-video")).toBeTruthy();
    expect(screen.getByText("Photo · 40 KB")).toBeTruthy();
    // The incident/status card is untouched by the new section.
    expect(screen.getByTestId("track-incident-card")).toBeTruthy();
  });

  it("shows no evidence section when nothing has been uploaded", async () => {
    await renderTracker(makeDispatchedIncident());

    expect(screen.queryByTestId("track-evidence-card")).toBeNull();
    expect(screen.queryByTestId("evidence-grid")).toBeNull();
  });

  it("surfaces evidence uploaded while on Track once the poll catches up", async () => {
    const uploading = makeDispatchedIncident({
      evidence: [],
      evidenceUploading: true,
      evidenceExpectedCount: 1,
      evidenceFailedCount: 0,
    });
    const { rerender } = await renderTracker(uploading);

    expect(screen.queryByTestId("track-evidence-card")).toBeNull();
    expect(screen.queryByText(/Evidence uploaded/)).toBeNull();

    await pushTrackerEvent({
      incidentId: uploading.incidentId,
      phase: "done",
      attempt: 1,
      attempts: 1,
      loaded: 1024,
      total: 1024,
      durationMs: 900,
    });
    // The bus reports the upload finished, but the poll hasn't delivered
    // the stored record yet — still no card or banner.
    expect(screen.queryByTestId("track-evidence-card")).toBeNull();

    const settled = {
      ...uploading,
      evidence: [
        {
          fileId: "ev-new",
          mimeType: "image/jpeg",
          sizeKb: 1,
          url: "/api/incidents/INC-20260911-7659/media",
        },
      ],
      evidenceUploading: false,
      evidenceFailedCount: 0,
    };
    useIncidentPolling.mockImplementation(() => ({
      ...DEFAULT_HOOK_VALUE,
      incident: settled,
    }));
      rerender(
        <DispatchTracker
          incidentId={uploading.incidentId}
          initialIncident={settled}
          onBack={jest.fn()}
      />
    );

    expect(await screen.findByText("✓ Evidence uploaded (1)")).toBeTruthy();
    expect(screen.getByTestId("track-evidence-card")).toBeTruthy();
    expect(screen.getAllByTestId("evidence-image")).toHaveLength(1);
  });
});

describe("Track incident details — citizen phone and resilient rows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Earlier describes leave a live poll incident behind; this block
    // renders the initialIncident prop instead, so reset to empty.
    useIncidentPolling.mockImplementation(() => ({ ...DEFAULT_HOOK_VALUE }));
    axios.get.mockRejectedValue(new Error("network down"));
  });

  it("renders the canonical citizenPhone from the per-incident payload", async () => {
    await renderTracker(makeDispatchedIncident({ citizenPhone: "09218346260" }));
    await screen.findByTestId("track-incident-card");

    expect(screen.getByText("Phone Number")).toBeTruthy();
    expect(screen.getByText("09218346260")).toBeTruthy();
  });

  it("shows a graceful dash when the incident carries no phone number", async () => {
    await renderTracker(makeDispatchedIncident());
    await screen.findByTestId("track-incident-card");

    const label = screen.getByText("Phone Number");
    expect(within(label.parent).getByText("—")).toBeTruthy();
  });

  it("wraps long Station/Location/Unit values in their column without overlap or truncation", async () => {
    const LONG_STATION =
      "Marikina City Disaster Risk Reduction Management Office";
    const LONG_ADDRESS =
      "780 Quezon Boulevard Barangay 391, Manila, Philippines";
    const LONG_UNIT = "Rescue 161 Ambulance #1";

    await renderTracker(
      makeDispatchedIncident({
        location: { latitude: 14.5958, longitude: 120.9772, address: LONG_ADDRESS },
        dispatch: {
          stationId: "FIRE_BFP_MAIN",
          stationName: LONG_STATION,
          assignedUnit: LONG_UNIT,
          estimatedTurnout: "2–5 mins",
          arrivalEtaMinutes: 66,
        },
      })
    );
    await screen.findByTestId("track-incident-card");

    // Full text survives — nothing is ellipsis-truncated or line-capped.
    expect(screen.getByText(LONG_STATION)).toBeTruthy();
    expect(screen.getByText(LONG_UNIT)).toBeTruthy();
    // The address also appears in the route card; scope to its detail row.
    const locationRow = screen.getByText("Location").parent;
    const address = within(locationRow).getByText(LONG_ADDRESS);
    expect(address.props.numberOfLines).toBeUndefined();

    // Value column owns the remaining row width and wraps inside it…
    expect(screen.getByText(LONG_STATION)).toHaveStyle({
      flex: 1,
      flexShrink: 1,
      textAlign: "right",
    });
    expect(address).toHaveStyle({ flex: 1, flexShrink: 1 });
    // …while the label column keeps its predictable width.
    expect(screen.getByText("Station")).toHaveStyle({ flexShrink: 0 });
    expect(screen.getByText("Location")).toHaveStyle({ flexShrink: 0 });
  });
});

describe("DispatchTracker recent-IDs picker", () => {
  it("shows a loading state while recent IDs are being read", async () => {
    await render(<DispatchTracker onBack={jest.fn()} />);

    expect(await screen.findByTestId("picker-loading")).toBeTruthy();
    expect(screen.queryByText("No recent incidents found.")).toBeNull();
  });

  it("shows the empty state only after recent IDs finish loading", async () => {
    getRecentIncidentIds.mockResolvedValue([]);

    await render(<DispatchTracker onBack={jest.fn()} />);

    expect(await screen.findByTestId("track-empty-state")).toBeTruthy();
    expect(screen.queryByTestId("picker-loading")).toBeNull();
  });

  it("lists recent incident IDs once loading completes", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-2", "INC-1"]);
    mockIncidentEndpointsById({
      "INC-2": makeDispatchedIncident({ incidentId: "INC-2" }),
      "INC-1": makeDispatchedIncident({ incidentId: "INC-1" }),
    });

    await render(<DispatchTracker onBack={jest.fn()} />);

    expect(await screen.findByText("INC-2")).toBeTruthy();
    expect(screen.getByText("INC-1")).toBeTruthy();
    expect(screen.queryByTestId("picker-loading")).toBeNull();
  });
});

describe("DispatchTracker route indicator", () => {
  it("shows a calculating-route chip while route geometry is in flight", async () => {
    let resolveRoute;
    axios.get.mockImplementation((url) => {
      if (url.includes("/api/routes")) {
        return new Promise((resolve) => {
          resolveRoute = resolve;
        });
      }
      return Promise.resolve({ data: { data: INCIDENT } });
    });

    await render(
      <DispatchTracker
        incidentId="INC-77"
        initialIncident={INCIDENT}
        onBack={jest.fn()}
      />
    );

    expect(await screen.findByTestId("route-chip")).toBeTruthy();
    expect(screen.getByText("Calculating route\u2026")).toBeTruthy();

    await act(async () => {
      resolveRoute({
        data: {
          data: { geometry: { coordinates: [[121.1, 14.65], [121.1, 14.6]] } },
        },
      });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("route-chip")).toBeNull()
    );
  });
});
