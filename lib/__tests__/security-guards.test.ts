import { afterEach, describe, expect, it, vi } from "vitest";

import { isSafeR2Key } from "@/lib/r2";
import { isTrustedCron } from "@/lib/cron-auth";

describe("isSafeR2Key", () => {
  it("accepts normal keys", () => {
    for (const k of ["product_skus/66779/2026-04-02-09-20-00/original", "design_sheet/abc-123/1700000000-x1y2z3.jpg", "a..b/c.d..e.png", "trash/x/y.webp"]) {
      expect(isSafeR2Key(k)).toBe(true);
    }
  });

  it("rejects dot segments that would escape the bucket", () => {
    for (const k of ["", "..", ".", "../other-bucket/x", "a/../../b", "a/./b", "a/.."]) {
      expect(isSafeR2Key(k)).toBe(false);
    }
  });
});

describe("isTrustedCron", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  const req = (headers: Record<string, string>) => new Request("https://example.test/api/cron/x", { headers });

  it("without CRON_SECRET: trusts the x-vercel-cron header (old behaviour)", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isTrustedCron(req({ "x-vercel-cron": "1" }))).toBe(true);
    expect(isTrustedCron(req({}))).toBe(false);
  });

  it("with CRON_SECRET: only the bearer secret counts, a forged header does not", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(isTrustedCron(req({ "x-vercel-cron": "1" }))).toBe(false);
    expect(isTrustedCron(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(isTrustedCron(req({ authorization: "Bearer s3cret-value" }))).toBe(true);
  });
});
