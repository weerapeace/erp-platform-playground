import { describe, expect, it } from "vitest";
import {
  OVERLAP_MS, catalogAgeText, catalogRefreshKey, finishRefreshState, isCatalogStale, normalizeRefreshState, planRefreshWindow,
} from "@/lib/catalog-refresh-plan";

const NOW = Date.parse("2026-11-21T10:00:00Z");
const H = 3600_000;

describe("catalog-refresh-plan", () => {
  it("คีย์ + อ่านค่าเสีย = สถานะว่าง", () => {
    expect(catalogRefreshKey("lazada", "b1")).toBe("catalog_refresh:lazada:b1");
    expect(normalizeRefreshState(null)).toEqual({ last_done_at: null, run: null, last_at: null, ok: true, error: null });
    expect(normalizeRefreshState({ last_done_at: "x", run: { since: "bad" } }).run).toBeNull();
  });

  it("ไม่เคยมีรอบ + ไม่รู้เวลาดึงเต็ม = ไม่ดึง · รู้เวลาดึงเต็ม = เริ่มจากตรงนั้นถอยเผื่อ", () => {
    const s = normalizeRefreshState(null);
    expect(planRefreshWindow(s, NOW, null)).toBeNull();
    const full = NOW - 8 * 24 * H;   // ดึงแบบเต็มครั้งล่าสุด 8 วันก่อน (เคส LY22)
    expect(planRefreshWindow(s, NOW, full)).toEqual({ sinceMs: full - OVERLAP_MS, startedAtMs: NOW, cursor: "", resumed: false });
  });

  it("มีรอบครบล่าสุด → เริ่มจาก last_done_at (ไม่ใช้เวลาดึงเต็ม)", () => {
    const s = normalizeRefreshState({ last_done_at: new Date(NOW - H).toISOString() });
    expect(planRefreshWindow(s, NOW, NOW - 99 * H)?.sinceMs).toBe(NOW - H - OVERLAP_MS);
  });

  it("รอบค้าง (หมดเวลากลางทาง) → ทำต่อช่วงเวลาเดิม + cursor เดิม · ค้างนานเกิน 6 ชม. = เริ่มใหม่", () => {
    const run = { since: new Date(NOW - 5 * H).toISOString(), started_at: new Date(NOW - H).toISOString(), cursor: "1:50" };
    const s = normalizeRefreshState({ last_done_at: new Date(NOW - 5 * H).toISOString(), run });
    expect(planRefreshWindow(s, NOW, null)).toEqual({ sinceMs: NOW - 5 * H, startedAtMs: NOW - H, cursor: "1:50", resumed: true });
    const old = normalizeRefreshState({ last_done_at: new Date(NOW - 9 * H).toISOString(), run: { ...run, started_at: new Date(NOW - 7 * H).toISOString() } });
    expect(planRefreshWindow(old, NOW, null)?.resumed).toBe(false);
  });

  it("จบครบ = last_done_at เป็นเวลาเริ่มรอบ · ค้าง/พลาด = เก็บรอบไว้ทำต่อ ไม่ขยับ last_done_at", () => {
    const prev = normalizeRefreshState({ last_done_at: new Date(NOW - 2 * H).toISOString() });
    const done = finishRefreshState(prev, { sinceMs: NOW - 2 * H, startedAtMs: NOW - 60_000, cursor: "", done: true, error: null, saved: 3 }, NOW);
    expect(done.last_done_at).toBe(new Date(NOW - 60_000).toISOString());
    expect(done.run).toBeNull();
    const part = finishRefreshState(prev, { sinceMs: NOW - 2 * H, startedAtMs: NOW - 60_000, cursor: "2:100", done: false, error: "429", saved: 1 }, NOW);
    expect(part.last_done_at).toBe(prev.last_done_at);
    expect(part.run?.cursor).toBe("2:100");
    expect(part.ok).toBe(false);
  });

  it("เก่าไหม + ข้อความอายุ", () => {
    expect(isCatalogStale(null, NOW)).toBe(true);
    expect(isCatalogStale(new Date(NOW - H).toISOString(), NOW)).toBe(false);
    expect(isCatalogStale(new Date(NOW - 3 * H).toISOString(), NOW)).toBe(true);
    expect(catalogAgeText(null, NOW)).toBe("ยังไม่เคยดึง");
    expect(catalogAgeText(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe("20 นาทีก่อน");
    expect(catalogAgeText(new Date(NOW - 3 * H).toISOString(), NOW)).toBe("3 ชม.ก่อน");
    expect(catalogAgeText(new Date(NOW - 8 * 24 * H).toISOString(), NOW)).toBe("8 วันก่อน");
  });
});
