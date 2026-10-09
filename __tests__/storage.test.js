import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  saveFailedEvidence,
  getFailedEvidence,
  clearFailedEvidence,
  saveResolvedIncident,
  getResolvedIncidents,
  saveIncidentId,
  getRecentIncidentIds,
  removeIncidentId,
} from "../lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("failed-evidence retry persistence", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const file = (name) => ({ uri: `file://${name}`, name, mimeType: "image/jpeg" });

  it("round-trips files saved for an incident", async () => {
    const files = [file("a.jpg"), file("b.mp4")];
    await saveFailedEvidence("INC-1", files);

    expect(await getFailedEvidence("INC-1")).toEqual(files);
  });

  it("isolates files by incident id", async () => {
    await saveFailedEvidence("INC-1", [file("a.jpg")]);
    await saveFailedEvidence("INC-2", [file("b.jpg")]);

    expect(await getFailedEvidence("INC-1")).toEqual([file("a.jpg")]);
    expect(await getFailedEvidence("INC-2")).toEqual([file("b.jpg")]);
  });

  it("returns an empty array for an incident with none saved", async () => {
    expect(await getFailedEvidence("INC-X")).toEqual([]);
  });

  it("caps the stored files at the evidence cap", async () => {
    const many = Array.from({ length: 9 }, (_, i) => file(`${i}.jpg`));
    await saveFailedEvidence("INC-1", many);

    expect(await getFailedEvidence("INC-1")).toHaveLength(5);
  });

  it("clears only the given incident's files", async () => {
    await saveFailedEvidence("INC-1", [file("a.jpg")]);
    await saveFailedEvidence("INC-2", [file("b.jpg")]);

    await clearFailedEvidence("INC-1");

    expect(await getFailedEvidence("INC-1")).toEqual([]);
    expect(await getFailedEvidence("INC-2")).toEqual([file("b.jpg")]);
  });

  it("treats a clear of a missing incident as a no-op", async () => {
    await clearFailedEvidence("INC-404");
    expect(await getFailedEvidence("INC-404")).toEqual([]);
  });
});

describe("resolved incident history", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const resolved = (id) => ({
    incidentId: id,
    category: "Fire",
    status: "Resolved",
    location: { address: "Ermita, Manila" },
    timestamp: "2026-09-11T10:00:00.000Z",
  });

  it("keeps every resolved incident, with no fixed limit", async () => {
    for (let i = 1; i <= 7; i++) {
      await saveResolvedIncident(resolved(`INC-${i}`));
    }

    const stored = await getResolvedIncidents();
    expect(stored).toHaveLength(7);
    expect(stored[0].incidentId).toBe("INC-7");
    expect(stored[6].incidentId).toBe("INC-1");
  });

  it("does not duplicate an already-stored incident", async () => {
    await saveResolvedIncident(resolved("INC-1"));
    await saveResolvedIncident(resolved("INC-2"));
    await saveResolvedIncident(resolved("INC-1"));

    const stored = await getResolvedIncidents();
    expect(stored.map((i) => i.incidentId)).toEqual(["INC-2", "INC-1"]);
  });

  it("returns an empty array when nothing is stored", async () => {
    expect(await getResolvedIncidents()).toEqual([]);
  });
});

describe("active incident tracking list", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("still caps tracked ids at 5, most recent first", async () => {
    for (let i = 1; i <= 7; i++) {
      await saveIncidentId(`INC-${i}`);
    }

    expect(await getRecentIncidentIds()).toEqual([
      "INC-7",
      "INC-6",
      "INC-5",
      "INC-4",
      "INC-3",
    ]);
  });

  it("removes a tracked id when it resolves (polling handoff)", async () => {
    await saveIncidentId("INC-1");
    await saveIncidentId("INC-2");
    await removeIncidentId("INC-2");

    expect(await getRecentIncidentIds()).toEqual(["INC-1"]);
  });
});