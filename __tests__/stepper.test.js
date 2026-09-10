import { STEPS, STEP_INDEX, stepIndexFor } from "../lib/stepper";

describe("DispatchTracker stepper logic", () => {
  it("defines the four status steps in order", () => {
    expect(STEPS).toEqual(["Pending", "Dispatched", "En Route", "Resolved"]);
  });

  it("maps every recognized status string to its exact index", () => {
    STEPS.forEach((status, idx) => {
      expect(STEP_INDEX[status]).toBe(idx);
      expect(stepIndexFor(status)).toBe(idx);
    });
  });

  it("never auto-advances: unknown/empty statuses stop at Pending (0)", () => {
    expect(stepIndexFor(undefined)).toBe(0);
    expect(stepIndexFor(null)).toBe(0);
    expect(stepIndexFor("UnknownStatus")).toBe(0);
  });

  it("never reports a step ahead of what the status string encodes", () => {
    // A 'Pending' incident is never shown past step 0; 'Dispatched' past 1.
    expect(stepIndexFor("Pending")).toBeLessThanOrEqual(0);
    expect(stepIndexFor("Dispatched")).toBeLessThanOrEqual(1);
    expect(stepIndexFor("En Route")).toBeLessThanOrEqual(2);
    expect(stepIndexFor("Resolved")).toBeLessThanOrEqual(3);
  });
});