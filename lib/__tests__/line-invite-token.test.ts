import { describe, expect, it } from "vitest";
import { lineInviteLink, signLineInviteToken, verifyLineInviteToken } from "@/lib/line-invite-token";
import { signApprovalToken } from "@/lib/approval-token";

const EMP = "0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const NOW = Date.UTC(2026, 9, 31, 10, 0, 0);
const DAY = 86400 * 1000;

describe("line invite token (บัตร QR สมัคร LINE)", () => {
  it("verifies a fresh token and returns the employee + dates", () => {
    const token = signLineInviteToken(EMP, 14, NOW);
    const v = verifyLineInviteToken(token, NOW + DAY);
    expect(v?.employeeId).toBe(EMP);
    expect(v?.iat).toBe(Math.floor(NOW / 1000));
    expect(v?.exp).toBe(Math.floor(NOW / 1000) + 14 * 86400);
  });

  it("rejects an expired token", () => {
    const token = signLineInviteToken(EMP, 14, NOW);
    expect(verifyLineInviteToken(token, NOW + 15 * DAY)).toBeNull();
  });

  it("rejects a tampered employee id or signature", () => {
    const token = signLineInviteToken(EMP, 14, NOW);
    const [b64, sig] = token.split(".");
    const forged = Buffer.from(Buffer.from(b64, "base64url").toString("utf8").replace(EMP, "11111111-2222-4333-8444-555555555555")).toString("base64url");
    expect(verifyLineInviteToken(`${forged}.${sig}`, NOW)).toBeNull();
    expect(verifyLineInviteToken(`${b64}.${sig.slice(0, -1)}x`, NOW)).toBeNull();
    expect(verifyLineInviteToken(`${token}.extra`, NOW)).toBeNull();
  });

  it("does not accept an approval-page token as an invite", () => {
    expect(verifyLineInviteToken(signApprovalToken(EMP), NOW)).toBeNull();
  });

  it("returns null for garbage input", () => {
    for (const bad of ["", "abc", ".", "a.b", null, undefined, 123]) {
      expect(verifyLineInviteToken(bad as unknown as string, NOW)).toBeNull();
    }
  });

  it("builds a LIFF link that carries the token as ?join=", () => {
    const token = signLineInviteToken(EMP, 14, NOW);
    const link = lineInviteLink(token);
    expect(link).toMatch(/^https:\/\/liff\.line\.me\/[^?]+\?join=/);
    expect(link.endsWith(token)).toBe(true);
    // ต้องสั้นพอให้ QR บนบัตรขนาดเล็กยังสแกนง่าย
    expect(link.length).toBeLessThan(220);
  });
});
