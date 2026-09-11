import React from "react";
import { render, screen } from "@testing-library/react-native";
import axios from "axios";
import DispatchTracker from "../src/screens/DispatchTracker";

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

jest.mock("../src/hooks/useIncidentPolling", () => () => ({
  incident: null,
  error: null,
  notFound: false,
}));

jest.mock("../lib/storage", () => ({
  getRecentIncidentIds: jest.fn(() => Promise.resolve([])),
  getFailedEvidence: jest.fn(() => Promise.resolve([])),
  clearFailedEvidence: jest.fn(() => Promise.resolve()),
  saveFailedEvidence: jest.fn(() => Promise.resolve([])),
}));

jest.mock("../lib/evidence", () => ({
  retryFailedEvidence: jest.fn(() => Promise.resolve([])),
  updateEvidenceStatus: jest.fn(() => Promise.resolve()),
}));

jest.mock("axios", () => ({
  get: jest.fn(),
}));

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