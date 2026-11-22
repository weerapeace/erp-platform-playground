/**
 * ★ 2026-11-22 ใบส่งของใช้ร่วมหลายใบ — API /api/purchasing/vouchers/<id>/bills บนฐานข้อมูลปลอม
 *   เคสจริง EK-18700926 อัปโหลดซ้ำใน PV2026-09-15-003 (DECORATIONS) + PV2026-09-16-002 (PAPER CARD)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

let tables: Record<string, Row[]>;
const applied: { voucher: string; lines: Row[] }[] = [];

vi.mock("@/lib/api-auth", () => ({ guardApi: vi.fn(async () => null) }));
vi.mock("@/lib/supabase-auth-server", () => ({ supabaseFromRequest: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "n@x", user_metadata: { name: "narisara" } } } }) } }) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => fakeDb(tables) }));
vi.mock("@/lib/delivery-bill", async (orig) => ({
  ...((await orig()) as object),
  applyDeliveryBill: vi.fn(async (_a: unknown, voucherId: string, bill: { lines: Row[] }) => { applied.push({ voucher: voucherId, lines: bill.lines }); return bill.lines.length; }),
  loadDescriptionRules: vi.fn(async () => []),
  parseDeliveryBillImage: vi.fn(),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/purchasing/vouchers/[id]/bills/route";

const V15 = "00000000-0000-4000-8000-000000000015", V16 = "00000000-0000-4000-8000-000000000016";
const B15 = "00000000-0000-4000-8000-0000000000b1", B16 = "00000000-0000-4000-8000-0000000000b2";
const req = (url: string, method: string, body?: unknown) => {
  const r = new Request(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }) as unknown as { nextUrl: URL };
  (r as { nextUrl: URL }).nextUrl = new URL(url);
  return r as never;
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const bill = (id: string) => tables.purchase_delivery_bills.find((b) => b.id === id)!;
const linesOf = (id: string) => bill(id).lines as Row[];
const rows = () => [
  { no: 1, description: "DECORATIONS /ORNAMENT", qty: 20, weight_kg: 0.85, m3: 0.011, voucher_line_ids: [] as string[] },
  { no: 2, description: "PAPER CARD", qty: 6, weight_kg: 2.81, m3: 0.0093, voucher_line_ids: [] as string[] },
];

beforeEach(() => {
  applied.length = 0;
  tables = {
    purchase_vouchers_v2: [
      { id: V15, pv_no: "PV2026-09-15-003", status: "confirmed", editing_at: "2026-11-22T12:00:00Z", voucher_date: "2026-09-15", is_active: true },
      { id: V16, pv_no: "PV2026-09-16-002", status: "confirmed", editing_at: "2026-11-22T12:00:00Z", voucher_date: "2026-09-16", is_active: true },
    ],
    purchase_delivery_bills: [
      { id: B16, voucher_id: V16, kind: "carrier", tracking_no: "EK-18700926", is_active: true, status: "parsed", created_at: "2026-11-22T10:58:43Z", updated_at: "2026-11-22T10:58:43Z", lines: rows() },
      { id: B15, voucher_id: V15, kind: "carrier", tracking_no: "EK-18700926", is_active: true, status: "parsed", created_at: "2026-11-22T11:01:26Z", updated_at: "2026-11-22T11:01:26Z",
        lines: rows().map((r, i) => (i === 0 ? { ...r, voucher_line_ids: ["L15-heart"] } : r)) },
    ],
    purchase_voucher_lines_v2: [],
    goods_receipts_v2: [],
    audit_logs: [],
  };
});

describe("ใช้ร่วม (ข้อเสนอ 1) — เคสจริง EK-18700926", () => {
  it("GET เห็นสำเนาซ้ำในใบอื่น พร้อมแถว", async () => {
    const j = await (await GET(req(`http://t/api?x=1`, "GET"), params(V15))).json();
    expect(j.duplicates).toHaveLength(1);
    expect(j.duplicates[0]).toMatchObject({ bill_id: B16, pv_no: "PV2026-09-16-002", rows: 2 });
    expect(j.duplicates[0].lines.map((l: Row) => l.owner)).toEqual([V16, V16]);
  });
  it("09-15-003 กด ใช้ร่วมกับ 09-16-002 → รับกล่อง DECORATIONS + ยกการจับคู่มา + เอาใบซ้ำออก (เก็บไว้)", async () => {
    const res = await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [0], drop_bill_id: B15 }), params(V15));
    expect(await res.json()).toMatchObject({ ok: true, claimed: 1, dropped: B15 });
    expect(linesOf(B16)[0]).toMatchObject({ for_voucher_id: V15, hold: null, voucher_line_ids: ["L15-heart"] });
    expect(linesOf(B16)[1].for_voucher_id ?? null).toBeNull();   // PAPER CARD ยังเป็นของ 09-16-002 (เจ้าของบิล)
    expect(bill(B15).is_active).toBe(false);
    expect(tables.audit_logs.some((a) => a.action === "delete" && a.entity_id === B15)).toBe(true);
    // ตอนนี้ 09-15-003 เห็นบิลของ 09-16-002 (ใช้ร่วม) ไม่ต้องอัปโหลดซ้ำ
    const j = await (await GET(req("http://t/api?x=1", "GET"), params(V15))).json();
    expect(j.data.map((b: Row) => b.id)).toEqual([B16]);
  });
  it("ใบยืนยันแล้วที่ไม่ได้เปิดแก้ → รับแถวไม่ได้ (ต้องกด แก้ไขใบ ก่อน)", async () => {
    tables.purchase_vouchers_v2[0].editing_at = null;
    const res = await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [0], drop_bill_id: B15 }), params(V15));
    expect(res.status).toBe(400);
    expect(linesOf(B16)[0].for_voucher_id).toBeUndefined();
  });
});

describe("ใช้น้ำหนัก/คิว เฉพาะแถวของใบนั้น", () => {
  beforeEach(async () => { await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [0], drop_bill_id: B15 }), params(V15)); });
  it("09-15-003 กดใช้ → ลงแค่กล่อง DECORATIONS · ติด ใช้แล้ว เฉพาะแถวนั้น", async () => {
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, apply: true }), params(V15));
    expect((await res.json()).ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0].voucher).toBe(V15);
    expect(applied[0].lines.map((l) => l.description)).toEqual(["DECORATIONS /ORNAMENT"]);
    expect(linesOf(B16)[0].applied_at).toBeTruthy();
    expect(linesOf(B16)[1].applied_at ?? null).toBeNull();
    expect(bill(B16).status).toBe("parsed");   // PAPER CARD ของ 09-16-002 ยังไม่ได้ใช้
  });
  it("แถวของใบนี้ยังไม่ได้จับคู่ → ใช้ไม่ได้ บอกเหตุผล", async () => {
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, apply: true }), params(V16));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ยังไม่ได้จับคู่");
  });
  it("กันบันทึกทับ: อีกใบเพิ่งแก้บิลเดียวกัน → 409 ให้โหลดใหม่", async () => {
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, lines: linesOf(B16), expected_updated_at: "2026-11-22T10:58:43Z" }), params(V16));
    expect(res.status).toBe(409);
    expect((await res.json()).stale).toBe(true);
  });
  it("ลบแถว + บันทึก = หายจริง + ลงประวัติ (บั๊กเดิม: ไม่เคยบันทึก)", async () => {
    const cur = linesOf(B16);
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, lines: [cur[0]], expected_updated_at: bill(B16).updated_at }), params(V16));
    expect((await res.json()).ok).toBe(true);
    expect(linesOf(B16)).toHaveLength(1);
    expect(tables.audit_logs.some((a) => a.entity_id === B16 && JSON.stringify(a.metadata).includes("rows"))).toBe(true);
  });
});

describe("ถอดใบส่งของ", () => {
  beforeEach(async () => { await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [0], drop_bill_id: B15 }), params(V15)); });
  it("ใบที่ใช้ร่วมถอด → กล่องของใบนั้นไปพักไว้ บิลยังอยู่", async () => {
    const res = await DELETE(req(`http://t/api?bill_id=${B16}`, "DELETE"), params(V15));
    expect((await res.json()).detached).toBe(true);
    expect(linesOf(B16)[0]).toMatchObject({ hold: "parked", for_voucher_id: null, voucher_line_ids: [] });
    expect(bill(B16).is_active).toBe(true);
  });
  it("เจ้าของบิลถอด แต่ใบอื่นยังมีกล่อง → ยกบิลให้ใบนั้น", async () => {
    const res = await DELETE(req(`http://t/api?bill_id=${B16}`, "DELETE"), params(V16));
    expect((await res.json()).detached).toBe(true);
    expect(bill(B16)).toMatchObject({ voucher_id: V15, is_active: true });
    expect(linesOf(B16)[0].for_voucher_id ?? null).toBeNull();   // ตอนนี้ 09-15-003 เป็นเจ้าของบิลเอง
    expect(linesOf(B16)[1].hold).toBe("parked");                  // PAPER CARD ของ 09-16-002 ไปพักไว้
  });
});

describe("กล่องที่พักไว้ (ข้อเสนอ 4)", () => {
  it("ใบที่ยังไม่มีใบส่งของ เห็นกล่องที่พักไว้ในช่วงวันใกล้กัน แล้วรับเข้าใบได้", async () => {
    const V20 = "00000000-0000-4000-8000-000000000020";
    tables.purchase_vouchers_v2.push({ id: V20, pv_no: "PV2026-09-20-001", status: "draft", editing_at: null, voucher_date: "2026-09-20", is_active: true });
    bill(B16).bill_date = "2026-09-21";
    (bill(B16).lines as Row[])[1] = { ...(bill(B16).lines as Row[])[1], hold: "parked" };
    const j = await (await GET(req("http://t/api?x=1", "GET"), params(V20))).json();
    expect(j.parked).toHaveLength(1);
    expect(j.parked[0].rows.map((r: Row) => r.description)).toEqual(["PAPER CARD"]);
    const res = await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [1] }), params(V20));
    expect((await res.json()).ok).toBe(true);
    expect(linesOf(B16)[1]).toMatchObject({ for_voucher_id: V20, hold: null });
  });
});
