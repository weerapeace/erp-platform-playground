import { describe, expect, it } from "vitest";
import { matchSales, matchShipDate, matchText, type MatchMo, type SaleLine } from "../mo-sales-match";

// ข้อมูลจริงกลุ่ม CTL098 (2026-10-31)
const L = (id: string, so: string, date: string, sku: string, qty: number): SaleLine => ({ id, sale_id: `h-${so}`, so_number: so, date, customer: "เซ็นทรัล", sku, qty });
const M = (no: string, sku: string, qty: number, created: string): MatchMo => ({ id: `id-${no}`, mo_no: no, sku, qty, created_at: created });

const lines: SaleLine[] = [
  L("a", "ISG2569-08-001", "2026-08-05", "CTL098-04-S", 14),
  L("b", "ISG2569-10-020", "2026-10-17", "CTL098-04-S", 30),
  L("c", "ISG2569-10-025", "2026-10-22", "CTL098-04-S", 20),
  L("d", "ISG2569-10-020", "2026-10-17", "CTL098-01-S", 80),
  L("e", "ISG2569-10-020", "2026-10-17", "CTL098-03-S", 20),
  L("f", "ISG2569-10-019", "2026-10-17", "CTL098-03-M", 20),
];
const mos: MatchMo[] = [
  M("MO-00209", "CTL098-04-S", 50, "2026-08-15T03:00:00Z"),
  M("MO-00349", "CTL098-04-S", 40, "2026-09-17T03:00:00Z"),
  M("MO-00207", "CTL098-01-S", 80, "2026-08-15T03:00:00Z"),
  M("MO-00348", "CTL098-03-S", 20, "2026-09-17T03:00:00Z"),
  M("MO-00208", "CTL098-03-S", 20, "2026-08-15T03:00:00Z"),
  M("MO-00210", "CTL098-03-M", 30, "2026-08-15T03:00:00Z"),
];

describe("matchSales — จับคู่ใบสั่งผลิตกับใบขาย", () => {
  const r = matchSales(mos, lines, []);
  it("จำนวนตรงบรรทัดเดียว = ตรงจำนวน", () => {
    expect(r.get("MO-00207")).toMatchObject({ kind: "exact", covered: 80 });
    expect(matchText(r.get("MO-00207")!.suggest)).toBe("ISG2569-10-020 · 80 ชิ้น");
  });
  it("ไม่นับใบขายก่อนวันเปิดใบ · หลายบรรทัดรวมกันได้ (30 + 20)", () => {
    const x = r.get("MO-00209")!;
    expect(x.kind).toBe("exact");
    expect(x.suggest.map((s) => s.line.id)).toEqual(["b", "c"]);
    expect(matchShipDate(x.suggest)).toBe("2026-10-22");
  });
  it("ใบเก่าได้ก่อน — ใบใหม่ไม่เหลือให้จับ", () => {
    expect(r.get("MO-00208")!.kind).toBe("exact");
    expect(r.get("MO-00348")!.kind).toBe("none");
    expect(r.get("MO-00349")!.kind).toBe("none");
  });
  it("ได้บางส่วน", () => {
    expect(r.get("MO-00210")).toMatchObject({ kind: "partial", covered: 20 });
  });
  it("ที่ผูกไว้แล้ว = ไม่เสนอใหม่ + ตัดยอดบรรทัดออกก่อน", () => {
    const r2 = matchSales(mos, lines, [{ mo_id: "id-MO-00348", sale_line_id: "e", qty: 20 }]);
    expect(r2.get("MO-00348")).toMatchObject({ kind: "linked", covered: 20 });
    expect(r2.get("MO-00208")!.kind).toBe("none");   // บรรทัด e ถูกผูกให้ 00348 แล้ว
  });
  it("เวลาเปิดใบตามเวลาไทย (เปิด 23:30 ไทย = วันนั้น)", () => {
    const r3 = matchSales([M("MO-X", "CTL098-01-S", 80, "2026-10-17T16:30:00Z")], lines, []);   // = 17 ต.ค. 23:30 ไทย
    expect(r3.get("MO-X")!.kind).toBe("exact");
  });
});
