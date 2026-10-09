import React from "react";
import {
  render,
  screen,
  fireEvent,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import HomeDashboard from "../src/screens/HomeDashboard";
import axios from "axios";

// RN's jest preset replaces RefreshControl with a mock that renders
// <RCTRefreshControl /> with NO props (no testID/onRefresh), making
// pull-to-refresh untestable. Forward the props instead.
jest.mock(
  "react-native/Libraries/Components/RefreshControl/RefreshControl",
  () => {
    const ReactMock = require("react");
    return {
      __esModule: true,
      default: (props) =>
        ReactMock.createElement("RCTRefreshControl", props),
    };
  }
);

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

const LIVE_WEATHER = {
  temperature: "31°C",
  condition: "Sunny",
  humidity: "70%",
  wind: "5km/h",
  riverLevelMeters: 14.1,
  riverStatus: "Normal",
  alertLevel: "Alert Level 1 begins at 15m",
  riskLevel: "LOW RISK",
  timestamp: "2026-10-09T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HomeDashboard weather states", () => {
  it("renders fallback weather values when the weather API fails", async () => {
    axios.get.mockRejectedValue(new Error("network down"));

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("28°C")).toBeTruthy();
    expect(screen.getByText("Partly Cloudy")).toBeTruthy();
    expect(screen.getByText("LOW RISK")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();
    expect(screen.getByTestId("weather-fallback-note")).toBeTruthy();
  });

  it("shows a loading placeholder while the weather request is in flight", async () => {
    axios.get.mockReturnValue(new Promise(() => {}));

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(screen.getByTestId("weather-loading")).toBeTruthy();
    expect(screen.queryByText("28°C")).toBeNull();
    expect(screen.queryByText("Partly Cloudy")).toBeNull();
    expect(screen.queryByTestId("weather-fallback-note")).toBeNull();
  });

  it("keeps the last reading when pull-to-refresh fails", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: LIVE_WEATHER } })
      .mockRejectedValueOnce(new Error("refresh failed"));

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("31°C")).toBeTruthy();

    fireEvent(screen.getByTestId("home-refresh-control"), "refresh");

    expect(await screen.findByTestId("weather-refresh-error")).toBeTruthy();
    expect(screen.getByText("31°C")).toBeTruthy();
    expect(screen.queryByText("28°C")).toBeNull();
  });

  it("clears a stale refresh error once the initial fetch finally succeeds", async () => {
    let resolveInitial;
    axios.get
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
      )
      .mockRejectedValueOnce(new Error("refresh failed"));

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    // A pull-to-refresh while the first load is still hanging fails…
    fireEvent(screen.getByTestId("home-refresh-control"), "refresh");
    expect(await screen.findByTestId("weather-refresh-error")).toBeTruthy();
    // …and falls back to sample values (the initial load is still pending).
    expect(screen.getByText("28°C")).toBeTruthy();

    // …and the initial load then lands with live data: the stale
    // "Couldn't update" note must not outlive the state it described.
    resolveInitial({ data: { data: LIVE_WEATHER } });

    expect(await screen.findByText("31°C")).toBeTruthy();
    expect(screen.queryByTestId("weather-refresh-error")).toBeNull();
    expect(screen.queryByTestId("weather-loading")).toBeNull();
  });

  it("keeps live weather that lands while a failed refresh is in flight", async () => {
    let resolveInitial;
    let rejectRefresh;
    axios.get
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectRefresh = reject;
        })
      );

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    // Pull-to-refresh while the first load is still pending: this
    // invocation closes over weather === null.
    fireEvent(screen.getByTestId("home-refresh-control"), "refresh");

    // Live data lands BEFORE the refresh request fails.
    resolveInitial({ data: { data: LIVE_WEATHER } });
    expect(await screen.findByText("31°C")).toBeTruthy();

    // The late rejection must not overwrite the live reading with the
    // sample fallback — even though the refresh handler started while
    // no weather had loaded yet.
    rejectRefresh(new Error("refresh failed"));

    expect(await screen.findByTestId("weather-refresh-error")).toBeTruthy();
    expect(screen.getByText("31°C")).toBeTruthy();
    expect(screen.queryByText("28°C")).toBeNull();
    expect(screen.queryByTestId("weather-fallback-note")).toBeNull();
  });

  it("tints the hero skeletons so they are visible on the navy card", async () => {
    axios.get.mockReturnValue(new Promise(() => {}));

    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    const loading = screen.getByTestId("weather-loading");
    const skeletons = within(loading).getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    for (const skeleton of skeletons) {
      // heroCard is dark navy (#111A3A): the default dark tint would be
      // mathematically invisible there — the placeholder must lighten.
      expect(
        StyleSheet.flatten(skeleton.props.style).backgroundColor
      ).toBe("rgba(255,255,255,0.14)");
    }
  });
});
