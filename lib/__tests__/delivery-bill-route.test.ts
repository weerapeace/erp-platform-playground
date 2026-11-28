/**
 * ★ 2026-11-22 ใบส่งของใช้ร่วมหลายใบ — API /api/purchasing/vouchers/<id>/bills บนฐานข้อมูลปลอม
 *   เคสจริง EK-18700926 อัปโหลดซ้ำใน PV2026-09-15-003 (DECORATIONS) + PV2026-09-16-002 (PAPER CARD)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

let tables: Record<string, Row[]>;

vi.mock("@/lib/api-auth", () => ({ guardApi: vi.fn(async () => null) }));
vi.mock("@/lib/supabase-auth-server", () => ({ supabaseFromRequest: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "n@x", user_metadata: { name: "narisara" } } } }) } }) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => fakeDb(tables) }));
vi.mock("@/lib/delivery-bill", async (orig) => ({
  ...((await orig()) as object),
  loadDescriptionRules: vi.fn(async () => []),
  parseDeliveryBillImage: vi.fn(),
}));
vi.mock("@/lib/file-ref", () => ({ isRefForCategory: () => true }));
vi.mock("@/lib/purchase-voucher-server", async (orig) => ({ ...((await orig()) as object), recomputeVoucher: vi.fn(async () => {}) }));

import { GET, POST, PATCH, DELETE } from "@/app/api/purchasing/vouchers/[id]/bills/route";
import { parseDeliveryBillImage } from "@/lib/delivery-bill";

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
    purchase_voucher_lines_v2: [
      { id: "L15-heart", voucher_id: V15, qty: 20, unit_price: 2, item_sku_id: "s-heart", kg_per_unit: null, cbm_per_unit: null, ship_method: null, is_active: true },
      { id: "L16-card", voucher_id: V16, qty: 6, unit_price: 5, item_sku_id: "s-card", kg_per_unit: null, cbm_per_unit: null, ship_method: null, is_active: true },
    ],
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
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L15-heart")!.kg_per_unit).toBeCloseTo(0.85 / 20, 9);   // กล่อง DECORATIONS 0.85 กก. ÷ 20 ชิ้น
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L15-heart")!.cbm_per_unit).toBeCloseTo(0.011 / 20, 9);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L16-card")!.kg_per_unit).toBeNull();                      // ใบอื่นไม่โดน
    expect(linesOf(B16)[0].applied_at).toBeTruthy();
    expect(linesOf(B16)[1].applied_at ?? null).toBeNull();
    expect(bill(B16).status).toBe("parsed");   // PAPER CARD ของ 09-16-002 ยังไม่ได้ใช้
  });
  it("★ 11-28 ไม่ต้องจับคู่สินค้า: 09-16-002 กดใช้ได้เลย → PAPER CARD ลงสินค้าของใบนั้น", async () => {
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, apply: true }), params(V16));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.rows).toEqual([1]);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L16-card")!.kg_per_unit).toBeCloseTo(2.81 / 6, 9);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L15-heart")!.kg_per_unit).toBeNull();
    expect(linesOf(B16)[0].applied_at ?? null).toBeNull();   // กล่องของ 09-15-003 ไม่ถูกติดใช้แล้วโดยใบนี้
  });
  it("ใบส่งของไม่มีกล่องของใบนี้ → ใช้ไม่ได้ บอกเหตุผล", async () => {
    (linesOf(B16)[1] as Row).hold = "parked";
    const res = await PATCH(req("http://t/api", "PATCH", { bill_id: B16, apply: true }), params(V16));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ไม่มีกล่องของใบนี้");
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

describe("★ 11-23 แบบ A ข้อ 2: อ่านใบส่งของแล้วชัด → จับคู่ + ใช้น้ำหนัก/คิวให้เลย · ย้อนได้", () => {
  const V30 = "00000000-0000-4000-8000-000000000030";
  beforeEach(() => {
    tables.purchase_vouchers_v2.push({ id: V30, pv_no: "PV2026-10-02-002", status: "draft", editing_at: null, voucher_date: "2026-10-02", is_active: true });
    tables.purchase_voucher_lines_v2.push(
      { id: "pin1", voucher_id: V30, qty: 3, unit_price: 1, item_sku_id: "s1", kg_per_unit: null, cbm_per_unit: null, ship_method: null, is_active: true },
      { id: "pin2", voucher_id: V30, qty: 3, unit_price: 3, item_sku_id: "s2", kg_per_unit: 0.01, cbm_per_unit: null, ship_method: null, is_active: true },
      { id: "fee", voucher_id: V30, qty: 1, unit_price: 50, item_sku_id: null, kg_per_unit: null, cbm_per_unit: null, ship_method: null, is_active: true });
    (parseDeliveryBillImage as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ raw: {}, parsed: { tracking_no: "EK-99990001", bill_date: "2026-10-08", marking: null, delivery_area: null, carrier_text: null, total_weight_kg: 0.13, total_m3: 0.0005, total_packages: 1,
      lines: [{ no: 1, stock: null, po_no: null, description: "METAL ACCY", pack: 1, package: "1-1", qty: 12, weight_kg: 0.13, m3: 0.0005, method: null, voucher_line_ids: [] }] } });
  });
  it("★ 11-28 อ่านแล้วใช้ให้เลย: เกลี่ยให้ทุกสินค้าตามมูลค่า (ไม่รวมค่าธรรมเนียม) + ใช้แล้ว + ส่งค่าเดิมกลับไว้ย้อน", async () => {
    const res = await POST(req("http://t/api", "POST", { r2_key: "delivery-bills/x.jpg" }), params(V30));
    const j = await res.json();
    expect(j.auto).toMatchObject({ applied: 2, rows: [0] });
    // มูลค่า pin1 ¥3 : pin2 ¥9 → กล่อง 0.13 กก. แบ่ง 1/4 : 3/4
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "pin1")!.kg_per_unit).toBeCloseTo((0.13 * 0.25) / 3, 9);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "pin2")!.kg_per_unit).toBeCloseTo((0.13 * 0.75) / 3, 9);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "fee")!.kg_per_unit).toBeNull();
    const nb = tables.purchase_delivery_bills.find((b) => b.voucher_id === V30)!;
    expect((nb.lines as Row[])[0].applied_at).toBeTruthy();
    expect(j.auto.before.find((x: Row) => x.id === "pin2").kg_per_unit).toBe(0.01);
    // ย้อน: คืนค่าเดิม + กล่องกลับเป็นยังไม่ได้ใช้
    const un = await POST(req("http://t/api", "POST", { action: "unapply", bill_id: nb.id, before: j.auto.before, rows: j.auto.rows }), params(V30));
    expect((await un.json()).ok).toBe(true);
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "pin2")!.kg_per_unit).toBe(0.01);
    expect((nb.lines as Row[])[0].applied_at ?? null).toBeNull();
  });
  it("★ 11-28 ใบนี้มีใบส่งของอื่นที่ใช้แล้ว → ใช้ให้เองโดยนับรวมกล่องทุกใบ (ใบที่สองไม่ทับใบแรก)", async () => {
    tables.purchase_delivery_bills.push({ id: "other", voucher_id: V30, kind: "carrier", is_active: true, status: "applied", lines: [{ no: 1, qty: 1, weight_kg: 0.87, m3: 0.0015, voucher_line_ids: [], applied_at: "2026-11-01T00:00:00Z" }] });
    const j = await (await POST(req("http://t/api", "POST", { r2_key: "delivery-bills/x.jpg" }), params(V30))).json();
    expect(j.auto).not.toBeNull();
    const p1 = tables.purchase_voucher_lines_v2.find((l) => l.id === "pin1")!, p2 = tables.purchase_voucher_lines_v2.find((l) => l.id === "pin2")!;
    expect(3 * Number(p1.kg_per_unit) + 3 * Number(p2.kg_per_unit)).toBeCloseTo(1.0, 6);    // 0.13 + 0.87 (ต่อชิ้นปัด 9 ตำแหน่ง)
    expect(3 * Number(p1.cbm_per_unit) + 3 * Number(p2.cbm_per_unit)).toBeCloseTo(0.002, 6);
  });
  it("เลขขนส่งซ้ำกับใบอื่น → ไม่ใช้ให้เอง (ถามใช้ร่วมก่อน)", async () => {
    tables.purchase_delivery_bills.push({ id: "dup", voucher_id: V16, kind: "carrier", tracking_no: "EK-99990001", is_active: true, lines: [] });
    const j = await (await POST(req("http://t/api", "POST", { r2_key: "delivery-bills/x.jpg" }), params(V30))).json();
    expect(j.duplicates.length).toBe(1);
    expect(j.auto).toBeNull();
  });
});

describe("★ 11-27 ใช้ร่วม เมื่อใบเดิมลบกล่องของใบอื่นไปแล้ว (เคสจริง EK-16661126)", () => {
  it("ใบเดิมเหลือแค่ BAG (ใบนั้นใช้แล้ว) → ใบนี้เพิ่ม DECORATIONS + ORNAMENT เข้าใบเดิมเป็นของใบนี้ + เอาใบซ้ำออก", async () => {
    const b16 = bill(B16), b15 = bill(B15);
    b16.lines = [{ no: 1, po_no: "4E261108/44", description: "BAG", qty: 1, weight_kg: 0.29, m3: 0.0026, voucher_line_ids: ["L16-bag"], applied_at: "2026-11-27T13:18:50Z" }];
    b16.status = "applied";
    b15.lines = [
      { no: 1, po_no: "4E261108/44", description: "BAG", qty: 1, weight_kg: 0.29, m3: 0.0026, voucher_line_ids: [] },
      { no: 2, po_no: "4E261108556", description: "DECORATIONS", qty: 5, weight_kg: 0.09, m3: 0.0007, voucher_line_ids: ["L15-a"] },
      { no: 3, po_no: "4E261108557", description: "ORNAMENT", qty: 3, weight_kg: 0.2, m3: 0.0015, voucher_line_ids: ["L15-b"], applied_at: "2026-11-27T13:26:13Z" },
    ];
    // กล่อง BAG ของใบเดิมใช้แล้ว → รับไม่ได้ · กล่องที่ใบเดิมไม่มี 2 กล่อง → เพิ่ม
    const res = await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [], add_rows: [1, 2], drop_bill_id: B15 }), params(V15));
    expect(await res.json()).toMatchObject({ ok: true, claimed: 0, added: 2, dropped: B15 });
    const ls = linesOf(B16);
    expect(ls.map((l) => [l.description, l.for_voucher_id ?? null])).toEqual([["BAG", null], ["DECORATIONS", V15], ["ORNAMENT", V15]]);
    expect(ls[1].voucher_line_ids).toEqual(["L15-a"]);
    expect(ls[2].applied_at).toBe("2026-11-27T13:26:13Z");   // ใช้แล้วยกไปด้วย
    expect(bill(B15).is_active).toBe(false);
  });
  it("เพิ่มกล่องโดยไม่มีใบซ้ำ = ไม่ยอม", async () => {
    const res = await POST(req("http://t/api", "POST", { action: "claim", bill_id: B16, rows: [], add_rows: [0] }), params(V15));
    expect(res.status).toBe(400);
  });
});
