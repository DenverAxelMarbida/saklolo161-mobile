import { renderHook, act } from "@testing-library/react-native";
import axios from "axios";
import useIncidentPolling from "../src/hooks/useIncidentPolling";
import { API_BASE_URL } from "../lib/config";

jest.mock("axios", () => ({
  get: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  saveResolvedIncident: jest.fn(() => Promise.resolve()),
  removeIncidentId: jest.fn(() => Promise.resolve()),
}));

const INCIDENT_URL = `${API_BASE_URL}/api/incidents/INC-1`;

describe("useIncidentPolling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    axios.get.mockResolvedValue({
      data: { data: { incidentId: "INC-1", status: "Pending" } },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("polls the same per-incident endpoint every 10 seconds and never the list endpoint", async () => {
    const { unmount } = await renderHook(() => useIncidentPolling("INC-1"));
    await act(async () => {});

    expect(axios.get).toHaveBeenCalledWith(INCIDENT_URL);
    expect(axios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(axios.get).toHaveBeenCalledTimes(2);

    const listCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listCalls).toHaveLength(0);
    unmount();
  });

  it("refetch() runs one immediate pass of the same fetch for manual refresh", async () => {
    const { result, unmount } = await renderHook(() => useIncidentPolling("INC-1"));
    await act(async () => {});
    expect(axios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get).toHaveBeenLastCalledWith(INCIDENT_URL);
    expect(result.current.incident).toEqual({
      incidentId: "INC-1",
      status: "Pending",
    });
    unmount();
  });
});
