/**
 * lib/stepper.js
 * Dispatch tracker stepper definition. The stepper is a pure reflection
 * of the incident's `status` string returned by polling — it never
 * advances itself or times into a step nothing has set.
 */

export const STEPS = ["Pending", "Dispatched", "En Route", "Resolved"];

export const STEP_INDEX = {
  Pending: 0,
  Dispatched: 1,
  "En Route": 2,
  Resolved: 3,
};

/**
 * Map an incident status to its stepper index.
 * Unknown/undefined statuses default to index 0 (Pending) — never to a
 * more advanced step than the status string actually encodes.
 * @param {string|undefined} status
 * @returns {number}
 */
export function stepIndexFor(status) {
  return STEP_INDEX[status] ?? 0;
}