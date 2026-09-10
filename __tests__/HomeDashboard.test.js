import React from "react";
import { render, screen } from "@testing-library/react-native";
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

describe("HomeDashboard weather fallback", () => {
  it("renders fallback weather values when the weather API fails", async () => {
    await render(<HomeDashboard onCategoryPress={jest.fn()} />);

    expect(await screen.findByText("28°C")).toBeTruthy();
    expect(screen.getByText("Partly Cloudy")).toBeTruthy();
    expect(screen.getByText("LOW RISK")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();
  });
});