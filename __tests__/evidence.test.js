import {
  appendEvidence,
  MAX_EVIDENCE,
  updateEvidenceStatus,
} from "../lib/evidence";

jest.mock("axios", () => ({ post: jest.fn() }));
import axios from "axios";

describe("appendEvidence", () => {
  const photo = { kind: "photo", name: "a.jpg", uri: "file://a.jpg" };
  const video = { kind: "video", name: "a.mp4", uri: "file://a.mp4" };

  it("appends new items to the current list", () => {
    expect(appendEvidence([photo], [video])).toEqual([photo, video]);
  });

  it("supports the photo batch multi-select path", () => {
    const picked = [photo, { ...photo, name: "b.jpg" }];
    expect(appendEvidence([], picked)).toEqual(picked);
  });

  it("never exceeds the cap when bulk-picked photos overflow", () => {
    const list = [{ ...photo, name: "1.jpg" }, { ...photo, name: "2.jpg" }];
    const picked = [
      { ...photo, name: "3.jpg" },
      { ...photo, name: "4.jpg" },
      { ...photo, name: "5.jpg" },
      { ...photo, name: "6.jpg" },
      { ...photo, name: "7.jpg" },
    ];
    const result = appendEvidence(list, picked);
    expect(result.length).toBe(MAX_EVIDENCE);
    // earliest picked items kept in order, overflow dropped
    expect(result.map((f) => f.name)).toEqual([
      "1.jpg",
      "2.jpg",
      "3.jpg",
      "4.jpg",
      "5.jpg",
    ]);
  });

  it("appends a video one at a time alongside existing photos", () => {
    expect(appendEvidence([photo], [video])).toEqual([photo, video]);
  });
});

describe("updateEvidenceStatus", () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it("POSTs completion progress to the evidence-status endpoint", async () => {
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    await updateEvidenceStatus("INC-123", { evidenceUploading: false, evidenceFailedCount: 0 });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/incidents/INC-123/evidence-status"),
      { evidenceUploading: false, evidenceFailedCount: 0 },
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it("never rejects when the backend is unreachable", async () => {
    axios.post.mockRejectedValueOnce(new Error("network down"));
    await expect(
      updateEvidenceStatus("INC-123", { evidenceUploading: false, evidenceFailedCount: 1 })
    ).resolves.toBeUndefined();
  });
});