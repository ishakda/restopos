import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS_TRANSITIONS,
  canTransition,
  handoverStatusFor,
  isOpenStatus,
  nextPrimaryStatus,
} from "@/lib/order-status";
import { ORDER_STATUSES } from "@/lib/constants";

describe("order status transitions", () => {
  it("follows the spec lifecycle", () => {
    expect(canTransition("confirmed", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready")).toBe(true);
    expect(canTransition("ready", "served")).toBe(true);
    expect(canTransition("ready", "out_for_delivery")).toBe(true);
    expect(canTransition("served", "completed")).toBe(true);
  });

  it("supports kitchen recall (ready → preparing)", () => {
    expect(canTransition("ready", "preparing")).toBe(true);
  });

  it("terminal states go nowhere", () => {
    expect(ORDER_STATUS_TRANSITIONS.completed).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
    expect(canTransition("completed", "preparing")).toBe(false);
  });

  it("no backwards flow except recall", () => {
    expect(canTransition("preparing", "confirmed")).toBe(false);
    expect(canTransition("served", "ready")).toBe(false);
  });

  it("every status is covered by the map", () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe("nextPrimaryStatus", () => {
  it("dine-in path ends at served → completed", () => {
    expect(nextPrimaryStatus("confirmed", "dine_in")).toBe("preparing");
    expect(nextPrimaryStatus("ready", "dine_in")).toBe("served");
    expect(nextPrimaryStatus("served", "dine_in")).toBe("completed");
  });
  it("delivery path goes out_for_delivery", () => {
    expect(nextPrimaryStatus("ready", "delivery")).toBe("out_for_delivery");
    expect(handoverStatusFor("delivery")).toBe("out_for_delivery");
  });
  it("terminal states return null", () => {
    expect(nextPrimaryStatus("completed", "takeaway")).toBeNull();
    expect(nextPrimaryStatus("cancelled", "takeaway")).toBeNull();
  });
});

describe("isOpenStatus", () => {
  it("open vs closed", () => {
    expect(isOpenStatus("confirmed")).toBe(true);
    expect(isOpenStatus("out_for_delivery")).toBe(true);
    expect(isOpenStatus("completed")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
  });
});
