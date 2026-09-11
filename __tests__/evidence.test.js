import {
  appendEvidence,
  MAX_EVIDENCE,
  updateEvidenceStatus,
  retryFailedEvidence,
  evidenceTimeoutFor,
  MAX_CAPTURE_DURATION_MS,
  formatEvidenceSize,
  formatEvidenceDuration,
  estimateUploadSeconds,
  evidenceUploadLikelyToTimeOut,
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

describe("evidenceTimeoutFor", () => {
  it("uses the generous 5-minute default when size is unknown", () => {
    expect(evidenceTimeoutFor({})).toBe(300000);
    expect(evidenceTimeoutFor()).toBe(300000);
  });

  it("never goes below the 1-minute floor for small files", () => {
    expect(evidenceTimeoutFor({ fileSize: 1024 })).toBe(60000);
  });

  it("caps at 10 minutes for large files", () => {
    expect(evidenceTimeoutFor({ fileSize: 1024 * 1024 * 1024 })).toBe(600000);
  });

  it("scales with file size in between the bounds", () => {
    // 10 MB at the assumed uplink rate (~64 KB/s)
    expect(evidenceTimeoutFor({ fileSize: 10 * 1024 * 1024 })).toBe(160000);
  });
});

describe("capture duration cap", () => {
  it("keeps in-app video recording to 2 minutes", () => {
    expect(MAX_CAPTURE_DURATION_MS).toBe(120000);
  });
});

describe("formatEvidenceSize", () => {
  it("formats bytes as megabytes with one decimal", () => {
    expect(formatEvidenceSize(0)).toBe("0 MB");
    expect(formatEvidenceSize(24.5 * 1024 * 1024)).toBe("24.5 MB");
    expect(formatEvidenceSize(200 * 1024 * 1024)).toBe("200.0 MB");
  });
});

describe("formatEvidenceDuration", () => {
  it("formats milliseconds as a compact duration", () => {
    expect(formatEvidenceDuration(0)).toBe("0s");
    expect(formatEvidenceDuration(45000)).toBe("45s");
    expect(formatEvidenceDuration(65000)).toBe("1m 05s");
    expect(formatEvidenceDuration(120000)).toBe("2m 00s");
  });
});

describe("estimateUploadSeconds", () => {
  it("returns 0 when size is unknown or zero", () => {
    expect(estimateUploadSeconds({})).toBe(0);
    expect(estimateUploadSeconds({ fileSize: 0 })).toBe(0);
  });

  it("estimates at the pessimistic uplink rate (~64 KB/s)", () => {
    expect(estimateUploadSeconds({ fileSize: 10 * 1024 * 1024 })).toBe(160);
    expect(estimateUploadSeconds({ fileSize: 150 * 1024 * 1024 })).toBe(2400);
  });
});

describe("evidenceUploadLikelyToTimeOut", () => {
  it("warns only for files that exceed their own timeout budget", () => {
    // 150 MB at ~512 Kbps ~ 40 min, way over the 10-min cap
    expect(
      evidenceUploadLikelyToTimeOut({ fileSize: 150 * 1024 * 1024 })
    ).toBe(true);
  });

  it("is safe for mid-size and small files", () => {
    // 30 MB and 10 MB finish within their scaled timeouts on the same link
    expect(
      evidenceUploadLikelyToTimeOut({ fileSize: 30 * 1024 * 1024 })
    ).toBe(false);
    expect(
      evidenceUploadLikelyToTimeOut({ fileSize: 10 * 1024 * 1024 })
    ).toBe(false);
  });

  it("is safe when size is unknown", () => {
    expect(evidenceUploadLikelyToTimeOut({})).toBe(false);
    expect(evidenceUploadLikelyToTimeOut()).toBe(false);
  });
});

describe("retryFailedEvidence", () => {
  const file = (name) => ({ uri: `file://${name}`, name, mimeType: "image/jpeg" });

  beforeEach(() => {
    axios.post.mockReset();
  });

  it("re-attempts each file and reports per-attempt progress", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    const files = [file("a.jpg"), file("b.jpg")];
    const progress = [];

    const remaining = await retryFailedEvidence(
      "INC-123",
      files,
      (p) => progress.push(p)
    );

    expect(remaining).toEqual([]);
    expect(progress).toEqual([
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
    // each file got its own upload request
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/incidents/INC-123/evidence"),
      expect.anything(),
      expect.objectContaining({ timeout: evidenceTimeoutFor(file("a.jpg")) })
    );
  });

  it("returns only the files that still fail", async () => {
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.post.mockRejectedValueOnce(new Error("upload failed"));
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg")];

    const remaining = await retryFailedEvidence("INC-123", files);

    expect(remaining).toEqual([file("b.jpg")]);
  });

  it("works without a progress callback", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });

    const remaining = await retryFailedEvidence("INC-123", [file("a.jpg")]);

    expect(remaining).toEqual([]);
  });
});