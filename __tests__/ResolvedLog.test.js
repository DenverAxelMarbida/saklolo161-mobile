import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react-native";
import axios from "axios";
import ResolvedLog from "../src/screens/ResolvedLog";
import ResolvedDetail from "../src/screens/ResolvedDetail";
import { CATEGORY_COLORS } from "../lib/config";
import { THEMES } from "../lib/themes";
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

// EvidenceGrid (shared with Track) plays videos through expo-video —
// mock it with a visible marker so tests can assert video items.
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

jest.mock("axios", () => ({
  get: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  getResolvedIncidents: jest.fn(),
}));

function makeResolved(overrides = {}) {
  return {
    incidentId: "INC-1",
    category: "Fire",
    status: "Resolved",
    location: { address: "Ermita, Manila" },
    timestamp: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ResolvedLog", () => {
  it("renders every stored resolved incident with no fixed limit", async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      makeResolved({ incidentId: `INC-${i + 1}` })
    );
    getResolvedIncidents.mockResolvedValue(many);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
    await screen.findByText("INC-7");

    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(`INC-${i}`)).toBeTruthy();
    }
    expect(screen.getAllByText("RESOLVED")).toHaveLength(7);
    expect(screen.getAllByText("Ermita, Manila")).toHaveLength(7);
  });

  it("accents each card with its category color and label", async () => {
    const cases = [
      ["Medical", CATEGORY_COLORS.MEDICAL],
      ["Fire", CATEGORY_COLORS.FIRE],
      ["Flood", CATEGORY_COLORS.FLOOD],
      ["Crime", CATEGORY_COLORS.CRIME],
    ];
    getResolvedIncidents.mockResolvedValue(
      cases.map(([category], i) =>
        makeResolved({ incidentId: `INC-${i}`, category })
      )
    );

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
    await screen.findByText("INC-3");

    cases.forEach(([category, color], i) => {
      expect(screen.getByTestId(`history-card-INC-${i}`)).toHaveStyle({
        borderLeftColor: color,
        borderLeftWidth: 4,
      });
      expect(screen.getByText(category)).toBeTruthy();
    });
  });

  it("falls back safely for unknown or missing categories", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-UNK", category: "Alien" }),
      makeResolved({ incidentId: "INC-NO", category: undefined }),
    ]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
    await screen.findByText("INC-UNK");

    expect(screen.getByTestId("history-card-INC-UNK")).toHaveStyle({
      borderLeftColor: THEMES.crimeSlate,
    });
    expect(screen.getByTestId("history-card-INC-NO")).toHaveStyle({
      borderLeftColor: THEMES.crimeSlate,
    });
    expect(screen.getByText("Alien")).toBeTruthy();
  });

  it("normalizes category casing through the shared mapping", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-1", category: "Medical" }),
      makeResolved({ incidentId: "INC-2", category: "flood" }),
    ]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByText("Medical")).toBeTruthy();
    expect(screen.getByText("Flood")).toBeTruthy();
  });

  it("opens details with the full incident when a card is pressed", async () => {
    const onSelect = jest.fn();
    const incident = makeResolved({ incidentId: "INC-9" });
    getResolvedIncidents.mockResolvedValue([incident]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={onSelect} />);
    const card = await screen.findByTestId("history-card-INC-9");
    fireEvent.press(card);

    expect(onSelect).toHaveBeenCalledWith(incident);
  });

  it("never calls the dispatcher-only incident list endpoint", async () => {
    getResolvedIncidents.mockResolvedValue([makeResolved()]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
    await screen.findByText("INC-1");

    expect(axios.get).not.toHaveBeenCalled();
    const listEndpointCalls = axios.get.mock.calls.filter(
      ([url]) => typeof url === "string" && /\/api\/incidents\/?$/.test(url)
    );
    expect(listEndpointCalls).toHaveLength(0);
  });

  it("re-reads local storage on pull-to-refresh and updates the list", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-1" }),
    ]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
    await screen.findByText("INC-1");
    expect(getResolvedIncidents).toHaveBeenCalledTimes(1);

    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-1" }),
      makeResolved({ incidentId: "INC-2" }),
    ]);

    const scroll = screen.getByTestId("history-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    expect(getResolvedIncidents).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("INC-2")).toBeTruthy();
    // Local storage only — no server history endpoint exists.
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("renders the empty state inside a refreshable list when nothing is resolved yet", async () => {
    getResolvedIncidents.mockResolvedValue([]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(
      await screen.findByText("No Recent History", {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(
      screen.getByText("Your resolved reports will appear here.")
    ).toBeTruthy();
    expect(screen.getByTestId("history-empty-state")).toBeTruthy();
    expect(screen.queryByText("INC-1")).toBeNull();
    expect(screen.getByTestId("history-scroll").props.refreshControl).toBeTruthy();

    // Pull-to-refresh keeps working even when the list is empty.
    await act(async () => {
      await screen
        .getByTestId("history-scroll")
        .props.refreshControl.props.onRefresh();
    });
    expect(getResolvedIncidents).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("history-empty-state")).toBeTruthy();
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe("History evidence viewing (ResolvedDetail)", () => {
  it("renders uploaded evidence with the shared grid treatment", async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({
          evidence: [
            {
              fileId: "ev-img",
              mimeType: "image/jpeg",
              sizeKb: 120,
              url: "/api/incidents/INC-1/media",
            },
            {
              fileId: "ev-vid",
              mimeType: "video/mp4",
              sizeKb: 2048,
              url: "/api/incidents/INC-1/clip",
            },
            { fileId: "ev-bad", mimeType: "", sizeKb: 40 },
          ],
        })}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(screen.getAllByTestId("evidence-image")).toHaveLength(1);
    expect(screen.getByTestId("evidence-video")).toBeTruthy();
    expect(screen.getByText("Photo · 40 KB")).toBeTruthy();
  });

  it("shows no Evidence section when there is none", async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({ evidence: [] })}
        onBack={jest.fn()}
      />
    );

    expect(screen.queryByText("Evidence")).toBeNull();
    expect(screen.queryByTestId("evidence-grid")).toBeNull();
  });

  it("renders the stored citizen phone number in Overview", async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({ citizenPhone: "09218346260" })}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByText("Phone Number")).toBeTruthy();
    expect(screen.getByText("09218346260")).toBeTruthy();
  });

  it("shows a graceful dash when no phone number was stored", async () => {
    await render(<ResolvedDetail incident={makeResolved()} onBack={jest.fn()} />);

    // Label sits in a wrap View inside the row; the value is its sibling.
    const row = screen.getByText("Phone Number").parent.parent;
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("wraps long location/station/unit values without overlapping their labels", async () => {
    const LONG_STATION =
      "Marikina City Disaster Risk Reduction Management Office";
    const LONG_ADDRESS =
      "780 Quezon Boulevard Barangay 391, Manila, Philippines";
    const LONG_UNIT = "Rescue 161 Ambulance #1";

    await render(
      <ResolvedDetail
        incident={makeResolved({
          location: { address: LONG_ADDRESS, latitude: 14.6, longitude: 121 },
          dispatch: {
            stationName: LONG_STATION,
            assignedUnit: LONG_UNIT,
            estimatedTurnout: "2–5 mins",
          },
        })}
        onBack={jest.fn()}
      />
    );

    // Full text preserved in its value column (flex:1 → wraps, no cap).
    // The address also appears in the summary header; scope to its row.
    expect(screen.getByText(LONG_STATION)).toHaveStyle({
      flex: 1,
      textAlign: "right",
    });
    expect(screen.getByText(LONG_UNIT)).toBeTruthy();
    const locationRow = screen.getByText("Location").parent.parent;
    expect(within(locationRow).getByText(LONG_ADDRESS)).toHaveStyle({ flex: 1 });

    // Label column keeps its natural width; rows top-align so wrapped
    // values grow downward instead of colliding with the label.
    expect(screen.getByText("Station").parent).toHaveStyle({ flexShrink: 0 });
    expect(screen.getByText("Station").parent.parent).toHaveStyle({
      alignItems: "flex-start",
    });
  });
});

describe("ResolvedDetail — resolution timestamp row", () => {
  // Fixed past instant with an explicit +08:00 offset: tests compare
  // against the SAME locale formatter the screen uses, so the
  // expectation is timezone-agnostic while still pinning the
  // "MMM D, YYYY, h:mm A" shape (e.g. "Jun 15, 2025, 7:30 PM").
  const RESOLVED_ISO = "2025-06-15T19:30:00+08:00";
  const formatTs = (iso) =>
    new Date(iso).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  it('renders a "Resolved" row label', async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({ resolvedAt: RESOLVED_ISO })}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  it("renders the actual resolution timestamp in the established format", async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({ resolvedAt: RESOLVED_ISO })}
        onBack={jest.fn()}
      />
    );

    const expected = formatTs(RESOLVED_ISO);
    // Established project convention (same formatter as the Reported row):
    // en-PH medium date + short time -> "Jun 15, 2025, 7:30 PM".
    expect(expected).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M$/
    );

    const row = screen.getByText("Resolved").parent.parent;
    expect(within(row).getByText(expected)).toBeTruthy();
  });

  it("keeps Reported on the report time and Resolved on the resolution time", async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({
          timestamp: "2026-09-11T10:00:00.000Z",
          resolvedAt: RESOLVED_ISO,
        })}
        onBack={jest.fn()}
      />
    );

    const reportedRow = screen.getByText("Reported").parent.parent;
    const resolvedRow = screen.getByText("Resolved").parent.parent;

    expect(within(reportedRow).getByText(formatTs("2026-09-11T10:00:00.000Z")))
      .toBeTruthy();
    expect(within(resolvedRow).getByText(formatTs(RESOLVED_ISO))).toBeTruthy();
    // Distinct instants must render distinctly (proves the row reads
    // resolvedAt, not the report-created timestamp).
    expect(formatTs(RESOLVED_ISO)).not.toBe(
      formatTs("2026-09-11T10:00:00.000Z")
    );
  });

  it("gracefully falls back to an em dash when resolvedAt is missing", async () => {
    await render(<ResolvedDetail incident={makeResolved()} onBack={jest.fn()} />);

    const row = screen.getByText("Resolved").parent.parent;
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it('keeps "Report resolved by dispatcher" and places the row right after it', async () => {
    await render(
      <ResolvedDetail
        incident={makeResolved({ resolvedAt: RESOLVED_ISO })}
        onBack={jest.fn()}
      />
    );

    const hint = screen.getByText("Report resolved by dispatcher");
    const label = screen.getByText("Resolved");

    // hint lives in the banner's top row; the Resolved row is the very
    // next block inside that same banner container.
    expect(hint.parent.parent).toBe(label.parent.parent.parent);
  });
});

describe("ResolvedLog — resolved timestamp on history cards", () => {
  // Fixed instants; expectations are computed with the SAME locale
  // formatter the card uses, so assertions are timezone-agnostic.
  const RESOLVED_ISO = "2025-06-15T11:30:00.000Z";
  const OLDER_ISO = "2025-06-14T11:30:00.000Z";
  const formatTs = (iso) =>
    new Date(iso).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  async function renderLog() {
    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);
  }

  it("shows the resolved date/time on the card, sourced from resolvedAt", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-RT", resolvedAt: RESOLVED_ISO }),
    ]);

    await renderLog();
    await screen.findByText("INC-RT");

    expect(screen.getByText(`Resolved ${formatTs(RESOLVED_ISO)}`)).toBeTruthy();
    // The card reads resolvedAt, NOT the report-created timestamp.
    expect(screen.queryByText(`Resolved ${formatTs(makeResolved().timestamp)}`))
      .toBeNull();
  });

  it("shows an em dash when resolvedAt is missing (never a fabricated time)", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-NONE" }),
    ]);

    await renderLog();
    await screen.findByText("INC-NONE");

    expect(screen.getByText("Resolved —")).toBeTruthy();
  });

  it("lists the newest resolved incident first, older below it", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-OLDER", resolvedAt: OLDER_ISO }),
      makeResolved({ incidentId: "INC-NEWER", resolvedAt: RESOLVED_ISO }),
    ]);

    await renderLog();
    const refs = await screen.findAllByText(/^INC-/);

    expect(refs.map((r) => r.props.children)).toEqual([
      "INC-NEWER",
      "INC-OLDER",
    ]);
  });

  it("keeps records without resolvedAt below timed ones, in incoming order (no crash)", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-MISS-A" }), // no resolvedAt
      makeResolved({ incidentId: "INC-TIMED", resolvedAt: RESOLVED_ISO }),
      makeResolved({ incidentId: "INC-MISS-B" }), // no resolvedAt
    ]);

    await renderLog();
    const refs = await screen.findAllByText(/^INC-/);

    expect(refs.map((r) => r.props.children)).toEqual([
      "INC-TIMED",
      "INC-MISS-A",
      "INC-MISS-B",
    ]);
  });
});

describe("ResolvedLog — live production payload regression (captured 2026-10-07)", () => {
  const {
    PRODUCTION_INCIDENTS,
    PRODUCTION_SERVED_ORDER,
  } = require("../__fixtures__/production.incidents");
  const formatTs = (iso) =>
    new Date(iso).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  it("renders the real persisted resolvedAt on the card and sorts it first", async () => {
    // Mobile stores the RAW GET :id payload (useIncidentPolling), so the
    // fixtures go straight into storage — no normalization layer exists.
    getResolvedIncidents.mockResolvedValue(
      PRODUCTION_SERVED_ORDER.map((id) => PRODUCTION_INCIDENTS[id]),
    );

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    const expected = formatTs("2026-10-07T14:40:30.168Z");
    expect(await screen.findByText("INC-20261007-9431")).toBeTruthy();
    expect(screen.getByText(`Resolved ${expected}`)).toBeTruthy();

    // Newest (only dated record) first; historical production records
    // genuinely lack resolvedAt in the store -> em dash, stable order.
    const refs = await screen.findAllByText(/^INC-/);
    expect(refs.map((r) => r.props.children)).toEqual([
      "INC-20261007-9431",
      "INC-20261004-7190",
      "INC-20261005-1575",
      "INC-20261005-5320",
      "INC-20261007-5191",
    ]);
    expect(screen.getAllByText("Resolved —")).toHaveLength(4);
  });

  it("renders an em dash for an invalid resolvedAt string", async () => {
    getResolvedIncidents.mockResolvedValue([
      makeResolved({ incidentId: "INC-INVALID", resolvedAt: "not-a-timestamp" }),
    ]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    await screen.findByText("INC-INVALID");
    expect(screen.getByText("Resolved —")).toBeTruthy();
  });
});

describe("ResolvedLog loading states", () => {
  it("shows a skeleton instead of a blank screen while history loads", async () => {
    getResolvedIncidents.mockReturnValue(new Promise(() => {}));

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByTestId("resolved-skeleton")).toBeTruthy();
    expect(screen.queryByText("No Recent History")).toBeNull();
  });

  it("shows the empty message only after history finishes loading", async () => {
    getResolvedIncidents.mockResolvedValue([]);

    await render(<ResolvedLog onBack={jest.fn()} onSelect={jest.fn()} />);

    expect(
      await screen.findByText("No Recent History", {}, { timeout: 5000 })
    ).toBeTruthy();
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
    expect(screen.queryByText("No Recent History")).toBeNull();
  });
});
