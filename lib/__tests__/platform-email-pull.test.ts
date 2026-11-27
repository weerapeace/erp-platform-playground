import { describe, expect, it } from "vitest";
import { autoSinceSec, boxAlerts, normalizeBoxes, pullQuery, type PullBox, type PullBoxRun } from "@/lib/platform-email/pull";

describe("กล่องเมลที่ ERP ดึงเอง", () => {
  it("normalizeBoxes: อีเมลตัวเล็ก · ตัดซ้ำ/ไม่ใช่อีเมล · ชื่อว่าง = ใช้อีเมล", () => {
    const out = normalizeBoxes([
      { email: " IG.Shop@Gmail.com ", label: "", enabled: true },
      { email: "ig.shop@gmail.com", label: "ซ้ำ" },
      { email: "not-an-email" },
      null,
      { email: "lm@gmail.com", label: "Louis", enabled: false, added_at: "2026-11-27T00:00:00Z" },
    ]);
    expect(out.map((b) => b.email)).toEqual(["ig.shop@gmail.com", "lm@gmail.com"]);
    expect(out[0].label).toBe("ig.shop@gmail.com");
    expect(out[1].enabled).toBe(false);
    expect(normalizeBoxes("x")).toEqual([]);
  });
  it("pullQuery: คำค้นเดิม + after: · ว่าง = ค่าเริ่มต้น", () => {
    expect(pullQuery("from:shopee", 1700000000.9)).toBe("from:shopee after:1700000000");
    expect(pullQuery("", 5)).toBe("from:(shopee OR lazada) after:5");
  });
  it("autoSinceSec: ย้อน 6 ชม.จากรอบที่สำเร็จ แต่ไม่เกิน 3 วัน · ไม่เคยสำเร็จ = 3 วัน", () => {
    const now = Date.parse("2026-11-27T12:00:00Z");
    const nowSec = now / 1000;
    expect(autoSinceSec(null, now)).toBe(nowSec - 3 * 86400);
    expect(autoSinceSec("2026-11-27T11:45:00Z", now)).toBe(Date.parse("2026-11-27T05:45:00Z") / 1000);
    expect(autoSinceSec("2026-11-01T00:00:00Z", now)).toBe(nowSec - 3 * 86400);
  });
  it("boxAlerts: เชื่อมหลุด = เตือนทันที · ล้ม ≥2 รอบ = เตือน · พักกล่อง/สำเร็จ = ไม่เตือน", () => {
    const box = (email: string, enabled = true): PullBox => ({ email, label: email, enabled, added_at: "" });
    const run = (p: Partial<PullBoxRun>): PullBoxRun => ({ at: "", ok: false, fetched: 0, created: 0, remaining: 0, last_ok_at: null, fails: 1, ...p });
    const alerts = boxAlerts(
      [box("a@x.co"), box("b@x.co"), box("c@x.co"), box("d@x.co", false), box("e@x.co")],
      { "a@x.co": run({ reconnect: true }), "b@x.co": run({ fails: 2, error: "boom" }), "c@x.co": run({ fails: 1 }), "d@x.co": run({ reconnect: true }), "e@x.co": run({ ok: true, fails: 0 }) },
    );
    expect(alerts.map((a) => a.key)).toEqual(["mail-reconnect:a@x.co", "mail-fail:b@x.co"]);
  });
});
