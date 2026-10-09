import React from "react";
import { render, screen } from "@testing-library/react-native";
import ResolvedLog from "../src/screens/ResolvedLog";
import { getResolvedIncidents } from "../lib/storage";

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

jest.mock("../lib/storage", () => ({
  getResolvedIncidents: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ResolvedLog loading states", () => {
  it("shows a skeleton instead of a blank screen while history loads", async () => {
    getResolvedIncidents.mockReturnValue(new Promise(() => {}));

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByTestId("resolved-skeleton")).toBeTruthy();
    expect(screen.queryByText("No resolved incidents yet")).toBeNull();
  });

  it("shows the empty message only after history finishes loading", async () => {
    getResolvedIncidents.mockResolvedValue([]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByText("No resolved incidents yet")).toBeTruthy();
    expect(screen.queryByTestId("resolved-skeleton")).toBeNull();
  });

  it("renders saved resolved incidents", async () => {
    getResolvedIncidents.mockResolvedValue([
      {
        incidentId: "INC-99",
        category: "Medical",
        status: "Resolved",
        timestamp: "2026-10-08T00:00:00.000Z",
        location: { address: "Barangka" },
      },
    ]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByText("INC-99")).toBeTruthy();
    expect(screen.queryByTestId("resolved-skeleton")).toBeNull();
    expect(screen.queryByText("No resolved incidents yet")).toBeNull();
  });
});
