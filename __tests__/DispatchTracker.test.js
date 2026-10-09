import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react-native";
import DispatchTracker from "../src/screens/DispatchTracker";
import axios from "axios";
import { getRecentIncidentIds } from "../lib/storage";

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

jest.mock("axios", () => ({
  get: jest.fn(),
}));

jest.mock("@rnmapbox/maps", () => ({}));

jest.mock("../lib/storage", () => ({
  getRecentIncidentIds: jest.fn(),
  getFailedEvidence: jest.fn(() => Promise.resolve([])),
  clearFailedEvidence: jest.fn(),
  saveFailedEvidence: jest.fn(),
  saveResolvedIncident: jest.fn(),
  removeIncidentId: jest.fn(),
}));

jest.mock("../lib/evidence", () => ({
  retryFailedEvidence: jest.fn(),
  updateEvidenceStatus: jest.fn(),
}));

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

describe("DispatchTracker recent-IDs picker", () => {
  it("shows a loading state while recent IDs are being read", async () => {
    await render(<DispatchTracker onBack={jest.fn()} />);

    expect(await screen.findByTestId("picker-loading")).toBeTruthy();
    expect(screen.queryByText("No recent incidents found.")).toBeNull();
  });

  it("shows the empty message only after recent IDs finish loading", async () => {
    getRecentIncidentIds.mockResolvedValue([]);

    await render(<DispatchTracker onBack={jest.fn()} />);

    expect(await screen.findByText("No recent incidents found.")).toBeTruthy();
    expect(screen.queryByTestId("picker-loading")).toBeNull();
  });

  it("lists recent incident IDs once loading completes", async () => {
    getRecentIncidentIds.mockResolvedValue(["INC-2", "INC-1"]);

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
