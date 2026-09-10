import { CATEGORY_DISPLAY, CATEGORY_COLORS } from "../lib/config";

describe("CATEGORY_DISPLAY round-trip", () => {
  const keys = Object.keys(CATEGORY_DISPLAY);

  it("covers exactly the four categories", () => {
    expect(keys).toEqual(["MEDICAL", "FIRE", "FLOOD", "CRIME"]);
  });

  it("every key has a Title Case display label and a design-token color", () => {
    for (const key of keys) {
      expect(typeof CATEGORY_DISPLAY[key]).toBe("string");
      expect(CATEGORY_DISPLAY[key].length).toBeGreaterThan(0);
      expect(CATEGORY_COLORS[key]).toMatch(/^#(?:[0-9a-fA-F]{6})$/);
    }
  });

  it("labels match the backend's Title Case category values exactly", () => {
    expect(CATEGORY_DISPLAY.MEDICAL).toBe("Medical");
    expect(CATEGORY_DISPLAY.FIRE).toBe("Fire");
    expect(CATEGORY_DISPLAY.FLOOD).toBe("Flood");
    expect(CATEGORY_DISPLAY.CRIME).toBe("Crime");
  });
});