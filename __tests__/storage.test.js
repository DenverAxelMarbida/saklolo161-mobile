import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  saveFailedEvidence,
  getFailedEvidence,
  clearFailedEvidence,
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