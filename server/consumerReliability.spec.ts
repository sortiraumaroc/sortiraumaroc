import { describe, expect, it } from "vitest";

import { computeReliabilityScoreV1, scoreToReliabilityLevel } from "./consumerReliability";

describe("consumerReliability v1", () => {
  it("should keep a strong score when there are no no-shows", () => {
    const score = computeReliabilityScoreV1({ checkedInCount: 0, noShowsCount: 0 });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(scoreToReliabilityLevel(score)).toMatch(/excellent|good/);
  });

  it("should drop to fragile after one no-show", () => {
    const score = computeReliabilityScoreV1({ checkedInCount: 0, noShowsCount: 1 });
    expect(score).toBeLessThan(50);
    expect(scoreToReliabilityLevel(score)).toBe("fragile");
  });

  it("should slightly improve score with check-ins (capped)", () => {
    const base = computeReliabilityScoreV1({ checkedInCount: 0, noShowsCount: 0 });
    const withCheckins = computeReliabilityScoreV1({ checkedInCount: 10, noShowsCount: 0 });
    expect(withCheckins).toBeGreaterThan(base);
    expect(withCheckins).toBeLessThanOrEqual(100);
  });

  it("should classify score ranges into expected levels", () => {
    expect(scoreToReliabilityLevel(90)).toBe("excellent");
    expect(scoreToReliabilityLevel(75)).toBe("good");
    expect(scoreToReliabilityLevel(55)).toBe("medium");
    expect(scoreToReliabilityLevel(10)).toBe("fragile");
  });
});
