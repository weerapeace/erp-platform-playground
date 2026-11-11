import { describe, expect, it } from "vitest";
import { fetchAllPages, FetchAllError, type PageResult } from "../fetch-all";

type Row = { n: number };
const rowsOf = (from: number, to: number, total: number): Row[] =>
  Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ n: from + i }));

/** ตัวจำลองคำขอ: failAt = ลำดับการเรียก (เริ่ม 1) ที่ให้พัง */
function source(total: number, failAt: number[] = []) {
  let calls = 0;
  const query = async (from: number, to: number): Promise<PageResult<Row>> => {
    calls++;
    if (failAt.includes(calls)) return { data: null, error: { message: "canceling statement due to statement timeout" } };
    return { data: rowsOf(from, to, total), error: null };
  };
  return { query, calls: () => calls };
}

describe("fetchAllPages — ดึงครบทุกหน้า", () => {
  it("เกิน 1,000 แถว → ไล่หน้าจนครบ", async () => {
    const s = source(2451);
    const out = await fetchAllPages<Row>(s.query);
    expect(out.length).toBe(2451);
    expect(out[2450].n).toBe(2450);
    expect(s.calls()).toBe(3);
  });

  it("หน้าไหนพัง → ลองซ้ำเอง 1 ครั้ง แล้วได้ครบ (ฐานข้อมูลช้าชั่วคราว)", async () => {
    const s = source(2451, [2]);   // หน้า 2 พังรอบแรก
    const out = await fetchAllPages<Row>(s.query, { retryDelayMs: 0 });
    expect(out.length).toBe(2451);
    expect(s.calls()).toBe(4);
  });

  it("พังซ้ำ (ไม่ strict) → คืนเท่าที่ได้เหมือนเดิม", async () => {
    const s = source(2451, [2, 3]);
    const out = await fetchAllPages<Row>(s.query, { retryDelayMs: 0 });
    expect(out.length).toBe(1000);
  });

  it("พังซ้ำ + strict → โยน FetchAllError (ห้ามใช้ข้อมูลไม่ครบ)", async () => {
    const s = source(2451, [1, 2]);   // หน้าแรกพังทั้งสองรอบ = เคส SKU ลูกได้ 0 ตัว
    const err = await fetchAllPages<Row>(s.query, { retryDelayMs: 0, strict: true }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchAllError);
    expect((err as FetchAllError).got).toBe(0);
    expect(String((err as Error).message)).toContain("statement timeout");
  });

  it("retries: 0 = ไม่ลองซ้ำ", async () => {
    const s = source(500, [1]);
    const out = await fetchAllPages<Row>(s.query, { retries: 0 });
    expect(out.length).toBe(0);
    expect(s.calls()).toBe(1);
  });
});
