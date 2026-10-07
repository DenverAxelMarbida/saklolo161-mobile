import {
  appendEvidence,
  MAX_EVIDENCE,
  updateEvidenceStatus,
  retryFailedEvidence,
  uploadEvidence,
  uploadEvidenceResilient,
  findMatchingEvidenceRecord,
  evidenceErrorKind,
  isTransientEvidenceError,
  evidenceErrorMessage,
  retryDelayMs,
  EVIDENCE_RETRY_ATTEMPTS,
  evidenceTimeoutFor,
  MAX_CAPTURE_DURATION_MS,
  formatEvidenceSize,
  formatEvidenceDuration,
  estimateUploadSeconds,
  evidenceUploadLikelyToTimeOut,
  subscribeEvidenceProgress,
  getRecentEvidenceEvent,
  reportEvidenceAttempt,
  evidenceProgressPercent,
  evidenceEtaSeconds,
  formatUploadDuration,
} from "../lib/evidence";

jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn() }));
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
// ---------------------------------------------------------------------------
// Automatic retry / error classification / duplicate-safe reconciliation
// ---------------------------------------------------------------------------

function timeoutError() {
  return Object.assign(new Error("timeout of 60000ms exceeded"), {
    code: "ECONNABORTED",
  });
}

function httpError(status, message = "server says") {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message } },
  });
}

function networkResetError() {
  return Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
}

function makeFile(overrides = {}) {
  return {
    uri: "file:///cache/a.jpg",
    name: "a.jpg",
    mimeType: "image/jpeg",
    fileSize: 500 * 1024,
    ...overrides,
  };
}

describe("evidenceErrorKind", () => {
  it("classifies timeouts, network resets and 5xx as retryable kinds", () => {
    expect(evidenceErrorKind(timeoutError())).toBe("timeout");
    expect(evidenceErrorKind(networkResetError())).toBe("network");
    expect(evidenceErrorKind(httpError(503))).toBe("server");
    expect(evidenceErrorKind(httpError(408))).toBe("timeout");
  });

  it("classifies rate limiting, missing incidents and 4xx as permanent", () => {
    expect(evidenceErrorKind(httpError(429))).toBe("rate_limited");
    expect(evidenceErrorKind(httpError(404))).toBe("not_found");
    expect(evidenceErrorKind(httpError(400, "bad file"))).toBe("client");
  });

  it("flags the pre-flight oversize rejection", async () => {
    try {
      await uploadEvidence(
        "INC-1",
        makeFile({ name: "big.mp4", fileSize: 201 * 1024 * 1024 })
      );
      throw new Error("should have rejected");
    } catch (err) {
      expect(evidenceErrorKind(err)).toBe("too_large");
    }
  });

  it("marks unknown errors as unknown (never blindly retried)", () => {
    expect(evidenceErrorKind(new Error("boom"))).toBe("unknown");
    expect(evidenceErrorKind(undefined)).toBe("unknown");
  });
});

describe("isTransientEvidenceError", () => {
  it("retries only timeouts, network failures and 5xx", () => {
    expect(isTransientEvidenceError(timeoutError())).toBe(true);
    expect(isTransientEvidenceError(networkResetError())).toBe(true);
    expect(isTransientEvidenceError(httpError(500))).toBe(true);
  });

  it("never retries 4xx validation failures or rate limiting", () => {
    expect(isTransientEvidenceError(httpError(400))).toBe(false);
    expect(isTransientEvidenceError(httpError(404))).toBe(false);
    expect(isTransientEvidenceError(httpError(429))).toBe(false);
    expect(isTransientEvidenceError(new Error("boom"))).toBe(false);
  });
});

describe("evidenceErrorMessage", () => {
  it("returns distinct citizen-safe wording per failure kind", () => {
    expect(evidenceErrorMessage(timeoutError())).toMatch(/taking too long/i);
    expect(evidenceErrorMessage(networkResetError())).toMatch(/network/i);
    expect(evidenceErrorMessage(httpError(500))).toBe(
      "Evidence upload temporarily failed. Please try again."
    );
    expect(evidenceErrorMessage(httpError(429))).toMatch(/wait a few minutes/i);
    expect(evidenceErrorMessage(new Error("boom"))).toBe(
      "Evidence couldn't be uploaded. You can retry."
    );
  });

  it("never leaks raw axios error text", () => {
    const raw = httpError(500, "Internal server error");
    const message = evidenceErrorMessage(raw);
    expect(message).not.toMatch(/Request failed with status code/);
    expect(message).not.toMatch(/axios/i);
  });

  it("keeps the oversize detail message", async () => {
    try {
      await uploadEvidence(
        "INC-1",
        makeFile({ name: "big.mp4", fileSize: 201 * 1024 * 1024 })
      );
    } catch (err) {
      expect(evidenceErrorMessage(err)).toMatch(/too large to upload/i);
    }
  });
});

describe("retryDelayMs", () => {
  it("grows exponentially after each failed attempt", () => {
    expect(retryDelayMs(1, () => 0)).toBe(1500);
    expect(retryDelayMs(2, () => 0)).toBe(3000);
  });

  it("stays bounded (backoff cap + jitter ceiling)", () => {
    expect(retryDelayMs(1, () => 1)).toBe(2000);
    expect(retryDelayMs(2, () => 1)).toBe(3500);
    expect(retryDelayMs(99, () => 1)).toBeLessThanOrEqual(4000);
    expect(retryDelayMs(99, () => 0)).toBeLessThanOrEqual(3500);
  });

  it("adds jitter between 0 and 500ms", () => {
    const low = retryDelayMs(1, () => 0);
    const high = retryDelayMs(1, () => 1);
    expect(high - low).toBe(500);
  });
});

describe("uploadEvidence multipart payload", () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it("rejects oversized media before any network request", async () => {
    await expect(
      uploadEvidence(
        "INC-1",
        makeFile({ name: "big.mp4", mimeType: "video/mp4", fileSize: 201 * 1024 * 1024 })
      )
    ).rejects.toThrow(/too large to upload/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("preserves MIME type and filename in the multipart body", async () => {
    axios.post.mockResolvedValue({ data: { data: { fileId: "ev-1" } } });
    // Probe append() directly: the jest environment's WHATWG FormData
    // stringifies object values, while the real RN runtime passes the
    // {uri,name,type} map through to the native uploader.
    const appendSpy = jest.spyOn(FormData.prototype, "append");
    try {
      await uploadEvidence(
        "INC-1",
        makeFile({ name: "clip.mp4", mimeType: "video/mp4" })
      );
      const [fieldName, value] = appendSpy.mock.calls[0];
      expect(fieldName).toBe("file");
      expect(value).toEqual({
        uri: "file:///cache/a.jpg",
        name: "clip.mp4",
        type: "video/mp4",
      });
    } finally {
      appendSpy.mockRestore();
    }
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/incidents/INC-1/evidence"),
      expect.anything(),
      expect.objectContaining({ timeout: evidenceTimeoutFor(makeFile()) })
    );
  });
});

describe("uploadEvidenceResilient", () => {
  const sleep = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    axios.post.mockReset();
    axios.get.mockReset();
    sleep.mockClear();
  });

  it("returns on the first successful attempt without sleeping", async () => {
    axios.post.mockResolvedValue({ data: { data: { fileId: "ev-1" } } });

    const result = await uploadEvidenceResilient("INC-1", makeFile(), { sleep });

    expect(result).toEqual({ fileId: "ev-1" });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("automatically retries a transient timeout and succeeds", async () => {
    axios.post
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-2" } } });

    const result = await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
    });

    expect(result).toEqual({ fileId: "ev-2" });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it("automatically retries temporary 5xx server errors", async () => {
    axios.post
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-3" } } });

    const result = await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
    });

    expect(result).toEqual({ fileId: "ev-3" });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it("does not retry a permanent 4xx validation failure", async () => {
    axios.post.mockRejectedValueOnce(httpError(400, "bad file"));

    await expect(
      uploadEvidenceResilient("INC-1", makeFile(), { sleep })
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry rate limiting (429) — it would worsen it", async () => {
    axios.post.mockRejectedValueOnce(httpError(429));

    await expect(
      uploadEvidenceResilient("INC-1", makeFile(), { sleep })
    ).rejects.toMatchObject({ response: { status: 429 } });
    expect(evidenceErrorKind(httpError(429))).toBe("rate_limited");
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });


  it("gives up after EVIDENCE_RETRY_ATTEMPTS with growing backoff", async () => {
    axios.post.mockRejectedValue(timeoutError());

    await expect(
      uploadEvidenceResilient("INC-1", makeFile(), { sleep, rand: () => 0 })
    ).rejects.toMatchObject({ code: "ECONNABORTED" });
    expect(axios.post).toHaveBeenCalledTimes(EVIDENCE_RETRY_ATTEMPTS);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1500, 3000]);
  });

  it("reconciles instead of duplicating when the response was lost", async () => {
    // Attempt 1 times out but actually succeeded server-side.
    axios.post.mockRejectedValueOnce(timeoutError());
    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          evidence: [
            { fileId: "ev-real", mimeType: "image/jpeg", sizeKb: 500 },
          ],
        },
      },
    });

    const result = await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
    });

    // Returns the REAL stored record — not a fabricated success.
    expect(result).toEqual({
      fileId: "ev-real",
      mimeType: "image/jpeg",
      sizeKb: 500,
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/incidents/INC-1"),
      expect.anything()
    );
    // No second upload → no duplicate evidence record, no wasted budget.
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("re-uploads when the incident holds no matching record", async () => {
    axios.post
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-new" } } });
    axios.get.mockResolvedValueOnce({ data: { data: { evidence: [] } } });

    const result = await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
    });

    expect(result).toEqual({ fileId: "ev-new" });
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("skips reconciliation when the file size is unknown (no safe match)", async () => {
    axios.post
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-2" } } });

    const result = await uploadEvidenceResilient(
      "INC-1",
      makeFile({ fileSize: 0 }),
      { sleep, rand: () => 0 }
    );

    expect(result).toEqual({ fileId: "ev-2" });
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("treats a failed reconciliation lookup as 'not found' and retries", async () => {
    axios.post
      .mockRejectedValueOnce(networkResetError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-2" } } });
    axios.get.mockRejectedValueOnce(new Error("lookup down"));

    const result = await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
    });

    expect(result).toEqual({ fileId: "ev-2" });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("reports attempt progress through onAttempt", async () => {
    axios.post
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-2" } } });
    const seen = [];

    await uploadEvidenceResilient("INC-1", makeFile(), {
      sleep,
      rand: () => 0,
      onAttempt: (info) => seen.push(info),
    });

    expect(seen).toEqual([
      { attempt: 1, total: EVIDENCE_RETRY_ATTEMPTS },
      { attempt: 2, total: EVIDENCE_RETRY_ATTEMPTS },
    ]);
  });
});

describe("findMatchingEvidenceRecord", () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it("returns null without a lookup when the size is unknown", async () => {
    const record = await findMatchingEvidenceRecord("INC-1", makeFile({ fileSize: 0 }));
    expect(record).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("matches on mimeType and rounded sizeKb only", async () => {
    axios.get.mockResolvedValue({
      data: {
        data: {
          evidence: [
            { fileId: "ev-a", mimeType: "video/mp4", sizeKb: 500 },
            { fileId: "ev-b", mimeType: "image/jpeg", sizeKb: 500 },
          ],
        },
      },
    });

    const hit = await findMatchingEvidenceRecord("INC-1", makeFile());
    expect(hit?.fileId).toBe("ev-b");

    // Same MIME but a different size must NOT match.
    const miss = await findMatchingEvidenceRecord(
      "INC-1",
      makeFile({ mimeType: "video/mp4", fileSize: 999 * 1024 })
    );
    expect(miss).toBeNull();
  });

  it("returns null when the incident lookup fails", async () => {
    axios.get.mockRejectedValue(new Error("network down"));
    expect(await findMatchingEvidenceRecord("INC-1", makeFile())).toBeNull();
  });
});


describe("evidence progress bus", () => {
  const sleep = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    axios.post.mockReset();
    axios.get.mockReset();
    sleep.mockClear();
  });

  it("delivers events to subscribers and stops after unsubscribe", async () => {
    const seen = [];
    const unsub = subscribeEvidenceProgress((e) => {
      if (e.incidentId === "INC-unsub") seen.push(e);
    });
    unsub();

    axios.post.mockResolvedValueOnce({ data: { data: { fileId: "ev-1" } } });
    await uploadEvidenceResilient("INC-unsub", makeFile(), { sleep });

    expect(seen).toEqual([]);
  });

  it("a throwing subscriber never breaks the upload or other listeners", async () => {
    const bad = subscribeEvidenceProgress(() => {
      throw new Error("boom");
    });
    const good = jest.fn();
    const goodUnsub = subscribeEvidenceProgress(good);
    try {
      axios.post.mockResolvedValueOnce({ data: { data: { fileId: "ev-1" } } });
      await expect(
        uploadEvidenceResilient("INC-throw", makeFile(), { sleep })
      ).resolves.toEqual({ fileId: "ev-1" });
      expect(good).toHaveBeenCalled();
    } finally {
      bad();
      goodUnsub();
    }
  });

  it("emits uploading → retrying → uploading → done with batch meta", async () => {
    axios.post
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce({ data: { data: { fileId: "ev-2" } } });
    const events = [];
    const unsub = subscribeEvidenceProgress((e) => {
      if (e.incidentId === "INC-seq") events.push(e);
    });
    try {
      await uploadEvidenceResilient("INC-seq", makeFile(), {
        sleep,
        rand: () => 0,
        index: 2,
        count: 3,
      });
    } finally {
      unsub();
    }

    const phases = events.map((e) => e.phase);
    expect(phases[0]).toBe("uploading");
    expect(events[0]).toMatchObject({
      attempt: 1,
      loaded: 0,
      index: 2,
      count: 3,
      attempts: EVIDENCE_RETRY_ATTEMPTS,
    });
    const retry = events.find((e) => e.phase === "retrying");
    expect(retry).toMatchObject({ attempt: 2, failedAttempt: 1 });
    // Attempt 2 restarts its own uploading event before the final done.
    expect(phases.indexOf("retrying")).toBeLessThan(phases.lastIndexOf("uploading"));
    const done = events[events.length - 1];
    expect(done.phase).toBe("done");
    expect(done.attempt).toBe(2);
    expect(typeof done.durationMs).toBe("number");
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(done.index).toBe(2);
    expect(done.count).toBe(3);
  });

  it("re-emits transport byte progress as events (measured, not guessed)", async () => {
    axios.post.mockImplementationOnce((url, body, config) => {
      config.onUploadProgress?.({
        loaded: 400,
        total: 1000,
        rate: 250,
        estimated: 2.4,
        lengthComputable: true,
      });
      return Promise.resolve({ data: { data: { fileId: "ev-1" } } });
    });
    const events = [];
    const unsub = subscribeEvidenceProgress((e) => {
      if (e.incidentId === "INC-prog") events.push(e);
    });
    try {
      await uploadEvidenceResilient("INC-prog", makeFile({ fileSize: 1000 }), {
        sleep,
      });
    } finally {
      unsub();
    }

    const mid = events.find((e) => e.loaded === 400);
    expect(mid).toMatchObject({
      phase: "uploading",
      attempt: 1,
      total: 1000,
      rate: 250,
      estimated: 2.4,
    });
    expect(typeof mid.elapsedMs).toBe("number");
    expect(events[events.length - 1].phase).toBe("done");
  });

  it("emits a failed event with citizen-safe wording, never raw axios text", async () => {
    const raw = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: {} },
    });
    axios.post.mockRejectedValue(raw);
    const events = [];
    const unsub = subscribeEvidenceProgress((e) => {
      if (e.incidentId === "INC-fail") events.push(e);
    });
    try {
      await expect(
        uploadEvidenceResilient("INC-fail", makeFile(), { sleep })
      ).rejects.toMatchObject({ response: { status: 400 } });
    } finally {
      unsub();
    }

    const failed = events.find((e) => e.phase === "failed");
    expect(failed).toMatchObject({ attempt: 1 });
    expect(failed.message).toBe("Evidence couldn't be uploaded. You can retry.");
    expect(failed.message).not.toMatch(/Request failed/);
  });

  it("marks a reconciled upload done without a fabricated duration", async () => {
    axios.post.mockRejectedValueOnce(timeoutError());
    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          evidence: [
            { fileId: "ev-real", mimeType: "image/jpeg", sizeKb: 500 },
          ],
        },
      },
    });
    const events = [];
    const unsub = subscribeEvidenceProgress((e) => {
      if (e.incidentId === "INC-recon") events.push(e);
    });
    try {
      await uploadEvidenceResilient("INC-recon", makeFile(), {
        sleep,
        rand: () => 0,
      });
    } finally {
      unsub();
    }

    const done = events.find((e) => e.phase === "done");
    expect(done.reconciled).toBe(true);
    expect(done.durationMs).toBeUndefined();
  });

  it("caches the latest event per incident for late-mounting screens", async () => {
    axios.post.mockResolvedValueOnce({ data: { data: { fileId: "ev-9" } } });
    await uploadEvidenceResilient("INC-cache", makeFile(), { sleep });

    expect(getRecentEvidenceEvent("INC-cache")).toMatchObject({
      phase: "done",
      incidentId: "INC-cache",
    });
    expect(getRecentEvidenceEvent("INC-never")).toBeNull();
  });

  it("expires cached events older than the 5-minute TTL", async () => {
    const nowSpy = jest.spyOn(Date, "now");
    const t0 = 1800000000000;
    try {
      nowSpy.mockReturnValue(t0);
      axios.post.mockResolvedValueOnce({ data: { data: { fileId: "ev-8" } } });
      await uploadEvidenceResilient("INC-ttl", makeFile(), { sleep });
      expect(getRecentEvidenceEvent("INC-ttl")).toMatchObject({
        phase: "done",
      });

      nowSpy.mockReturnValue(t0 + 5 * 60 * 1000 + 1);
      expect(getRecentEvidenceEvent("INC-ttl")).toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("uploadEvidence onUploadProgress wiring", () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it("forwards axios upload progress to opts.onProgress", async () => {
    axios.post.mockImplementationOnce((url, body, config) => {
      config.onUploadProgress?.({
        loaded: 500,
        total: 1000,
        lengthComputable: true,
      });
      return Promise.resolve({ data: { data: { fileId: "ev-1" } } });
    });
    const seen = [];

    await uploadEvidence("INC-1", makeFile(), {
      onProgress: (d) => seen.push(d),
    });

    expect(seen).toEqual([{ loaded: 500, total: 1000, lengthComputable: true }]);
  });

  it("does not attach onUploadProgress when no callback is given", async () => {
    axios.post.mockResolvedValueOnce({ data: { data: { fileId: "ev-1" } } });
    await uploadEvidence("INC-1", makeFile());
    expect(axios.post.mock.calls[0][2].onUploadProgress).toBeUndefined();
  });
});

describe("evidenceProgressPercent", () => {
  it("returns null when the total is unknown (no fabricated percent)", () => {
    expect(evidenceProgressPercent(500, 0)).toBeNull();
    expect(evidenceProgressPercent(500)).toBeNull();
    expect(evidenceProgressPercent(500, undefined)).toBeNull();
  });

  it("floors to a whole percent", () => {
    expect(evidenceProgressPercent(500000, 1000000)).toBe(50);
    expect(evidenceProgressPercent(999, 1000)).toBe(99);
  });

  it("clamps at 100% and never goes negative", () => {
    expect(evidenceProgressPercent(2000000, 1000000)).toBe(100);
    expect(evidenceProgressPercent(-10, 1000)).toBe(0);
    expect(evidenceProgressPercent(0, 1000)).toBe(0);
  });
});

describe("evidenceEtaSeconds", () => {
  const base = { total: 1000000, loaded: 500000, elapsedMs: 2000, estimated: 4 };

  it("returns null when the total is unknown or the file is complete", () => {
    expect(evidenceEtaSeconds({ ...base, total: 0 })).toBeNull();
    expect(evidenceEtaSeconds({ ...base, loaded: 1000000 })).toBeNull();
    expect(evidenceEtaSeconds({ ...base, loaded: 0 })).toBeNull();
  });

  it("waits out startup jitter (elapsed < 1s or barely any bytes moved)", () => {
    expect(evidenceEtaSeconds({ ...base, elapsedMs: 500 })).toBeNull();
    // 5% of 1MB is 50,000 bytes — below that the rate is noise.
    expect(evidenceEtaSeconds({ ...base, loaded: 40000 })).toBeNull();
  });

  it("rounds a measured estimate to whole seconds", () => {
    expect(evidenceEtaSeconds(base)).toBe(4);
    expect(evidenceEtaSeconds({ ...base, estimated: 4.6 })).toBe(5);
  });

  it("derives from the measured rate when axios sent no estimate", () => {
    expect(
      evidenceEtaSeconds({ ...base, estimated: undefined, rate: 250000 })
    ).toBe(2);
    expect(
      evidenceEtaSeconds({ ...base, estimated: undefined, rate: 0 })
    ).toBeNull();
  });

  it("rejects estimates outside the trustworthy 1s..10min window", () => {
    expect(evidenceEtaSeconds({ ...base, estimated: 0.4 })).toBeNull();
    expect(evidenceEtaSeconds({ ...base, estimated: 601 })).toBeNull();
  });
});

describe("formatUploadDuration", () => {
  it("formats sub-minute durations with one decimal", () => {
    expect(formatUploadDuration(8400)).toBe("8.4 sec");
    expect(formatUploadDuration(1500)).toBe("1.5 sec");
  });

  it("falls back to the compact format for minutes", () => {
    expect(formatUploadDuration(90000)).toBe("1m 30s");
  });

  it("returns null for missing or non-positive durations", () => {
    expect(formatUploadDuration(0)).toBeNull();
    expect(formatUploadDuration(undefined)).toBeNull();
    expect(formatUploadDuration(-100)).toBeNull();
  });
});

describe("reportEvidenceAttempt", () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  it("skips attempt 1 (the server already tracks evidenceUploading)", async () => {
    await reportEvidenceAttempt("INC-ping-a", 1, 3);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("pings attempt >= 2 with the attempt fields", async () => {
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    await reportEvidenceAttempt("INC-ping-b", 2, 3);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/incidents/INC-ping-b/evidence-status"),
      {
        evidenceUploading: true,
        evidenceAttempt: 2,
        evidenceAttemptsTotal: 3,
      },
      expect.anything()
    );
  });

  it("throttles repeat pings for the same incident within 60s", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });

    await reportEvidenceAttempt("INC-ping-c", 2, 3);
    await reportEvidenceAttempt("INC-ping-c", 3, 3);

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("pings again once the throttle window has passed", async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    const nowSpy = jest.spyOn(Date, "now");
    try {
      const t0 = 1800000000000;
      nowSpy.mockReturnValue(t0);
      await reportEvidenceAttempt("INC-ping-d", 2, 3);
      nowSpy.mockReturnValue(t0 + 61 * 1000);
      await reportEvidenceAttempt("INC-ping-d", 3, 3);

      expect(axios.post).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("never rejects when the status endpoint fails", async () => {
    axios.post.mockRejectedValueOnce(new Error("net down"));

    await expect(reportEvidenceAttempt("INC-ping-e", 2, 3)).resolves.toBeUndefined();
  });

  it("ignores malformed attempts and missing incident ids", async () => {
    await reportEvidenceAttempt("INC-ping-f", 0, 3);
    await reportEvidenceAttempt(null, 2, 3);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
