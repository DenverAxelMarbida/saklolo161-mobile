import React from "react";
import { render, screen, act, within } from "@testing-library/react-native";
import axios from "axios";
import HomeDashboard from "../src/screens/HomeDashboard";

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
  get: jest.fn(() => Promise.reject(new Error("network down"))),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HomeDashboard weather fallback", () => {
  it("renders fallback weather values when the weather API fails", async () => {
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("28°C")).toBeTruthy();
    expect(screen.getByText("Partly Cloudy")).toBeTruthy();
    expect(screen.getByText("LOW RISK")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();
  });
});

describe("HomeDashboard logo", () => {
  it("renders the enlarged app logo from the shared asset", async () => {
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    const logo = screen.getByLabelText("Saklolo 161 logo");
    expect(logo.props.source).toEqual(require("../assets/icon.png"));
    expect(logo).toHaveStyle({ width: 56, height: 56 });
  });
});

describe("HomeDashboard pull-to-refresh", () => {
  it("re-fetches the existing weather/river monitoring data on refresh", async () => {
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);
    await screen.findByText("28°C", {}, { timeout: 5000 });
    expect(axios.get).toHaveBeenCalledTimes(1);

    const scroll = screen.getByTestId("home-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/weather-river")
    );
  });
});

describe("HomeDashboard weather graphics", () => {
  // The API only sends condition text (OpenWeather `weather[0].main`,
  // plus the backend's "Partly Cloudy" fallback) — these are the exact
  // values the backend can produce. The web WeatherCard maps the same
  // strings to the same semantic keys.
  function mockWeather(condition, temperature = "31°C") {
    axios.get.mockImplementation(() =>
      Promise.resolve({
        data: {
          data: {
            temperature,
            condition,
            humidity: "82%",
            wind: "12km/h",
            riverLevelMeters: 15.2,
            riverStatus: "Normal",
            alertLevel: "Alert Level 1 begins at 15m",
            riskLevel: "LOW RISK",
            timestamp: new Date().toISOString(),
          },
        },
      })
    );
  }

  function weatherGraphic() {
    return within(screen.getByTestId("weather-now"));
  }

  const CONDITION_CASES = [
    ["Clear", "icon-Sun"],
    ["Clouds", "icon-Cloud"],
    ["Partly Cloudy", "icon-CloudSun"],
    ["Rain", "icon-CloudRain"],
    ["Drizzle", "icon-CloudDrizzle"],
    ["Thunderstorm", "icon-CloudLightning"],
    ["Fog", "icon-CloudFog"],
    ["Mist", "icon-CloudFog"],
    ["Snow", "icon-CloudSnow"],
  ];

  for (const [condition, testID] of CONDITION_CASES) {
    it(`shows the ${testID} graphic for "${condition}"`, async () => {
      mockWeather(condition);
      await render(<HomeDashboard onCategoryPress={jest.fn()} />);
      await screen.findByText("31°C");

      expect(weatherGraphic().getByTestId(testID)).toBeTruthy();
      expect(screen.getByText(condition)).toBeTruthy();
    });
  }

  it("renders the temperature beside the small graphic", async () => {
    mockWeather("Thunderstorm", "31°C");
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("31°C")).toBeTruthy();
    expect(screen.getByText("Thunderstorm")).toBeTruthy();
    expect(weatherGraphic().getByTestId("icon-CloudLightning")).toBeTruthy();
  });

  it("falls back to the neutral cloud graphic for unknown condition text", async () => {
    mockWeather("Unrecognized Phenomenon");
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("Unrecognized Phenomenon")).toBeTruthy();
    expect(weatherGraphic().getByTestId("icon-Cloud")).toBeTruthy();
    expect(
      weatherGraphic().queryByTestId("icon-Sun")
    ).toBeNull();
  });

  it("keeps the fallback path on the same partly-cloudy graphic", async () => {
    // default axios mock rejects → FALLBACK_WEATHER ("Partly Cloudy");
    // restore it explicitly because jest.clearAllMocks() does not
    // reset implementations set by earlier tests in this file.
    axios.get.mockImplementation(() => Promise.reject(new Error("network down")));
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("Partly Cloudy")).toBeTruthy();
    expect(weatherGraphic().getByTestId("icon-CloudSun")).toBeTruthy();
  });
});