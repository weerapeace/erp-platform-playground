import { describe, expect, it } from "vitest";
import { dropStatus, hiddenDropCodes, liveDropByCode, normalizeDropInput, orderDrops } from "../website-new-drops";

const NOW = Date.parse("2026-10-20T03:00:00Z");
const d = (id: string, start: string, end: string | null, codes: string[], hide = true) => ({ id, startAt: start, endAt: end, codes, hideUntilStart: hide });

describe("🆕 มาใหม่เป็นชุด", () => {
  it("สถานะตามเวลา", () => {
    expect(dropStatus(d("a", "2026-10-21T00:00:00Z", null, []), NOW)).toBe("upcoming");
    expect(dropStatus(d("a", "2026-10-01T00:00:00Z", null, []), NOW)).toBe("live");
    expect(dropStatus(d("a", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z", []), NOW)).toBe("ended");
  });

  it("เรียงหน้า /new: ใกล้เปิดก่อน · เปิดแล้วล่าสุดก่อน", () => {
    const o = orderDrops([d("old", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z", []), d("next2", "2026-11-05T00:00:00Z", null, []), d("cur", "2026-10-15T00:00:00Z", null, []), d("next1", "2026-10-25T00:00:00Z", null, [])], NOW);
    expect(o.upcoming.map((x) => x.id)).toEqual(["next1", "next2"]);
    expect(o.started.map((x) => x.id)).toEqual(["cur", "old"]);
  });

  it("ซ่อนสินค้าจนถึงเวลาเปิด (ยกเว้นอยู่ในชุดที่เปิดแล้วด้วย / ไม่ได้ตั้งซ่อน)", () => {
    const h = hiddenDropCodes([d("up", "2026-10-25T00:00:00Z", null, ["A", "b"]), d("up2", "2026-10-26T00:00:00Z", null, ["C"], false), d("live", "2026-10-01T00:00:00Z", null, ["B"])], NOW);
    expect([...h]).toEqual(["A"]);
  });

  it("ป้ายใหม่: รุ่นในชุดที่เปิดอยู่ (หลายชุด = ชุดล่าสุด) · ชุดที่จบแล้วไม่นับ", () => {
    const m = liveDropByCode([d("l1", "2026-10-01T00:00:00Z", null, ["A", "B"]), d("l2", "2026-10-15T00:00:00Z", "2026-11-15T00:00:00Z", ["B"]), d("end", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", ["C"])], NOW);
    expect(m.get("A")?.id).toBe("l1");
    expect(m.get("B")?.id).toBe("l2");
    expect(m.has("C")).toBe(false);
  });

  it("ตรวจค่าก่อนบันทึก", () => {
    expect(normalizeDropInput({ startAt: "2026-10-25T03:00:00Z" }).ok).toBe(false);
    expect(normalizeDropInput({ title: "ชุด" }).ok).toBe(false);
    expect(normalizeDropInput({ title: "ชุด", startAt: "2026-10-25T03:00:00Z", endAt: "2026-10-24T03:00:00Z" }).ok).toBe(false);
    const ok = normalizeDropInput({ title: " ชุดปลาย ต.ค. ", startAt: "2026-10-25T03:00:00Z", codes: ["roar01", "ROAR01", "bad code"] });
    expect(ok.ok && ok.value.codes).toEqual(["ROAR01"]);
    expect(ok.ok && ok.value.hideUntilStart).toBe(true);
  });
});
