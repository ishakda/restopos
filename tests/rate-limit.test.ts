import { beforeEach, describe, expect, it } from "vitest";

import { _resetRateLimiter, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimiter());

  it("allows up to the limit then blocks", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    expect(rateLimit("a", 5, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 5, 60_000).allowed).toBe(true);
  });
});
