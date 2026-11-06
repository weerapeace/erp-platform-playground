import { describe, expect, it } from "vitest";
import { MY_WATCHES_MAX, parseMyWatches, watchLabel, watchMatches } from "@/lib/my-watches";

const B1 = "11111111-1111-1111-1111-111111111111";
const B2 = "22222222-2222-2222-2222-222222222222";

describe("การเตือนของฉัน", () => {
  it("อ่านค่าที่บันทึกไว้ · ทิ้งค่าเพี้ยน · จำกัดจำนวน", () => {
    const p = parseMyWatches({ list: [
      { id: "w1", source: "design_pending", brand_ids: [B1, "bad", B1], when: "stale" },
      { id: "w2", source: "nope" },
      { id: "w3", source: "design_pending", when: "weird", on: false, bounce: false, name: "  งานด่วน  " },
    ] });
    expect(p.list).toEqual([
      { id: "w1", source: "design_pending", brand_ids: [B1], when: "stale", on: true, bounce: true },
      { id: "w3", source: "design_pending", brand_ids: [], when: "all", on: false, bounce: false, name: "งานด่วน" },
    ]);
    expect(parseMyWatches({ list: Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, source: "design_pending" })) }).list).toHaveLength(MY_WATCHES_MAX);
    expect(parseMyWatches(null).list).toEqual([]);
  });
  it("กรองตามแบรนด์ + เงื่อนไข", () => {
    const it1 = { brand_id: B1, urgent: true, stale: 2, waitingCount: 0 };
    const it2 = { brand_id: B2, urgent: false, stale: 9, waitingCount: 1 };
    expect(watchMatches({ brand_ids: [], when: "all" }, it1)).toBe(true);
    expect(watchMatches({ brand_ids: [B2], when: "all" }, it1)).toBe(false);
    expect(watchMatches({ brand_ids: [], when: "flagged" }, it2)).toBe(false);
    expect(watchMatches({ brand_ids: [], when: "stale" }, it2)).toBe(true);
    expect(watchMatches({ brand_ids: [B1, B2], when: "waiting" }, it2)).toBe(true);
    expect(watchMatches({ brand_ids: [B1], when: "all" }, { ...it1, brand_id: null })).toBe(false);
  });
  it("ชื่อที่โชว์", () => {
    const names: Record<string, string> = { [B1]: "Pixie Dustie", [B2]: "Louis Montini" };
    const w = { id: "w", source: "design_pending", brand_ids: [B1, B2], when: "stale" as const, on: true, bounce: true };
    expect(watchLabel(w, (id) => names[id])).toBe("งานออกแบบ Pixie Dustie, Louis Montini · ไม่ขยับเกิน 7 วัน");
    expect(watchLabel({ ...w, brand_ids: [], when: "all" }, () => undefined)).toBe("งานออกแบบ ทุกแบรนด์");
    expect(watchLabel({ ...w, name: "ของฉัน" }, () => undefined)).toBe("ของฉัน");
  });
});
