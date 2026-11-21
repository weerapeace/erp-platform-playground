/**
 * ★ 2026-11-21 รวมใบยืนยันแล้ว → แยกใบกลับ (เคสจริง ร้านผ้ากำมะหยี่ PV2026-11-03-002 + PV2026-11-11-003) — ทดสอบ API บนฐานข้อมูลปลอม
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Row } from "./fake-db";

let tables: Record<string, Row[]>;
let actor = { id: "u1", name: "narisara wannasoot", email: "n@x" };
const revisions: Row[] = [];

vi.mock("@/lib/api-auth", () => ({ guardApi: vi.fn(async () => null) }));
vi.mock("@/lib/supabase-auth-server", () => ({
  supabaseFromRequest: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor.id, email: actor.email, user_metadata: { name: actor.name } } } }) }, rpc: async () => ({ data: { role: "staff" } }) }),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => fakeDb(tables) }));
vi.mock("@/lib/seller-bill", () => ({ syncSellerBillExtras: vi.fn(async () => ({ updated: false, fx: null })) }));
vi.mock("@/lib/document-revisions", () => ({
  VOUCHER_ENTITY: "purchase_vouchers_v2",
  getRevision: vi.fn(async (_a: unknown, _e: string, id: string, rev: number) => revisions.find((r) => r.entityId === id && r.revNo === rev) ?? null),
  saveRevision: vi.fn(async (_a: unknown, r: Row) => { revisions.push(r); }),
  listRevisions: vi.fn(async () => []),
}));
vi.mock("@/lib/voucher-writeback", () => ({ writeBackVoucherPrices: vi.fn() }));
vi.mock("@/lib/purchase-voucher-server", async (orig) => ({
  cancelEditMergeBlock: ((await orig()) as { cancelEditMergeBlock: unknown }).cancelEditMergeBlock,
  lastMergeEvent: vi.fn(async (_a: unknown, id: string) => {
    const rows = tables.audit_logs.filter((r) => r.entity_id === id && (r.action === "merge" || r.action === "split"));
    const r = rows[rows.length - 1];
    return r ? { id: String(r.id), action: r.action, created_at: String(r.created_at ?? new Date().toISOString()), metadata: r.metadata as Row } : null;
  }),
  recomputeVoucher: vi.fn(async () => {}),
  assignVoucherNumber: vi.fn(async () => null),
  fetchVoucher: vi.fn(async () => ({})),
  restoreVoucherSnapshot: vi.fn(async () => {}),
  snapshotVoucher: vi.fn(async (_a: unknown, id: string) => ({ header: tables.purchase_vouchers_v2.find((v) => v.id === id), lines: [], bills: [] })),
  // เหมือนของจริง: การรวมล่าสุดที่ยังไม่แยก (ฐานปลอมเรียงตามลำดับที่ใส่ → แถวท้ายสุด = ล่าสุด)
  findOpenMerge: vi.fn(async (_a: unknown, id: string) => {
    const rows = tables.audit_logs.filter((r) => r.entity_id === id && (r.action === "merge" || r.action === "split"));
    const r = rows[rows.length - 1];
    return r && r.action === "merge" ? { id: String(r.id), created_at: String(r.created_at), metadata: r.metadata as Row } : null;
  }),
}));

import { POST as mergePost } from "@/app/api/purchasing/vouchers/merge/route";
import { POST as splitPost } from "@/app/api/purchasing/vouchers/[id]/split/route";
import { POST as revisePost } from "@/app/api/purchasing/vouchers/[id]/revise/route";

const req = (body: unknown) => new Request("http://t/api", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const OLD = "00000000-0000-4000-8000-000000000001", NEW = "00000000-0000-4000-8000-000000000002", DRF = "00000000-0000-4000-8000-000000000003";
void OLD; void NEW; void DRF;
const V = (id: string) => tables.purchase_vouchers_v2.find((v) => v.id === id)!;

beforeEach(() => {
  revisions.length = 0;
  actor = { id: "u1", name: "narisara wannasoot", email: "n@x" };
  const base = { seller_name: "ร้านผ้ากำมะหยี่", seller_partner_id: "P", currency: "RMB", fx_rate: 5.2, china_bill_id: null, shipping_bill_id: null, shipping_payment_status: "unpaid", is_active: true, revision: 1, confirmed_by: "narisara wannasoot", confirmed_at: "2026-11-21T12:14:00Z", note: null };
  tables = {
    purchase_vouchers_v2: [
      { ...base, id: "00000000-0000-4000-8000-000000000001", pv_no: "PV2026-11-03-002", status: "confirmed", voucher_date: "2026-11-03", editing_at: null, editing_by: null, edit_reason: null, seller_ship_foreign: null },
      { ...base, id: "00000000-0000-4000-8000-000000000002", pv_no: "PV2026-11-11-003", status: "confirmed", voucher_date: "2026-11-11", editing_at: "2026-11-21T12:20:25Z", editing_by: "narisara wannasoot", edit_reason: "แอดมินแก้ — ไม่ระบุเหตุผล", seller_ship_foreign: 8 },
      { ...base, id: "00000000-0000-4000-8000-000000000003", pv_no: "PV2026-11-12-001", status: "draft", voucher_date: "2026-11-12", editing_at: null, editing_by: null, edit_reason: null },
    ],
    purchase_voucher_lines_v2: [
      { id: "L-old", voucher_id: "00000000-0000-4000-8000-000000000001", sort_order: 1, is_active: true },
      { id: "L-new", voucher_id: "00000000-0000-4000-8000-000000000002", sort_order: 1, is_active: true },
      { id: "L-new2", voucher_id: "00000000-0000-4000-8000-000000000002", sort_order: 2, is_active: true },
      { id: "L-drf", voucher_id: "00000000-0000-4000-8000-000000000003", sort_order: 1, is_active: true },
    ],
    purchase_delivery_bills: [
      { id: "B-old", voucher_id: "00000000-0000-4000-8000-000000000001", lines: [{ voucher_line_ids: ["L-old"] }], is_active: true },
      { id: "B-new", voucher_id: "00000000-0000-4000-8000-000000000002", lines: [{ voucher_line_ids: ["L-new", "L-new2"] }], is_active: true },
    ],
    goods_receipts_v2: [],
    audit_logs: [],
  };
});

describe("รวมใบยืนยันแล้ว (API /api/purchasing/vouchers/merge)", () => {
  it("เคสจริง: คนที่กำลังแก้ใบหนึ่งกดรวม → ใบหลัก = เก่าสุด เข้าโหมดแก้ไข · ย้ายรายการ+บิลทั้งแถว · ใบที่ถูกรวมยกเลิกแต่เก็บเลข", async () => {
    const res = await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"] }));
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, target_id: "00000000-0000-4000-8000-000000000001", editing: true, moved: { lines: 2, bills: 1 } });
    expect(tables.purchase_voucher_lines_v2.filter((l) => l.voucher_id === "00000000-0000-4000-8000-000000000001").map((l) => l.id).sort()).toEqual(["L-new", "L-new2", "L-old"]);
    expect(tables.purchase_delivery_bills.find((b) => b.id === "B-new")!.voucher_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(V("00000000-0000-4000-8000-000000000001")).toMatchObject({ status: "confirmed", editing_by: "narisara wannasoot", edit_reason: "รวมใบ PV2026-11-11-003", seller_ship_foreign: 8 });
    expect(V("00000000-0000-4000-8000-000000000002")).toMatchObject({ status: "cancelled", pv_no: "PV2026-11-11-003", is_active: true, editing_at: null });
    expect(String(V("00000000-0000-4000-8000-000000000002").note)).toContain("[รวมเข้า PV2026-11-03-002]");
    expect(revisions.map((r) => r.entityId)).toEqual(["00000000-0000-4000-8000-000000000001"]);   // เก็บเวอร์ชันก่อนรวมไว้
    const merge = tables.audit_logs.find((a) => a.action === "merge")!;
    expect((merge.metadata as Row).split_data).toBeTruthy();
  });
  it("คนอื่นกำลังแก้ใบหนึ่งอยู่ → กันไว้ บอกเหตุผล (ไม่มีอะไรถูกย้าย)", async () => {
    actor = { id: "u2", name: "owner", email: "o@x" };
    const res = await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("กำลังถูกแก้โดย narisara wannasoot");
    expect(tables.purchase_voucher_lines_v2.find((l) => l.id === "L-new")!.voucher_id).toBe("00000000-0000-4000-8000-000000000002");
  });
  it("ใบร่างที่ถูกรวม = คืนเลข (กติกาเดิม) · ซ่อนจากรายการ", async () => {
    await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"] }));
    expect(V("00000000-0000-4000-8000-000000000003")).toMatchObject({ status: "cancelled", pv_no: null, is_active: false });
  });
  it("จ่ายแล้ว (ผูกบิลโอนจีน) → รวมไม่ได้", async () => {
    V("00000000-0000-4000-8000-000000000001").china_bill_id = "cb1";
    const res = await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ผูกบิลโอนเงินจีนแล้ว");
  });
});

describe("หลังรวม: กันยกเลิกการแก้ + แยกใบกลับ", () => {
  it("กด ยกเลิกการแก้ ที่ใบหลักหลังรวม → ไม่ยอม (กันรายการที่ย้ายเข้ามาหาย)", async () => {
    await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"] }));
    const res = await revisePost(req({ action: "cancel" }), params("00000000-0000-4000-8000-000000000001"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("แยกใบกลับ");
  });
  it("แยกใบกลับ → ใบที่ถูกรวมกลับมาเลขเดิม สถานะเดิม (รวมโหมดแก้ที่ค้างอยู่) · รายการ+บิลกลับใบเดิม ลำดับเดิม · ใบหลักคืนยอดเดิม", async () => {
    await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"] }));
    const res = await splitPost(req({}), params("00000000-0000-4000-8000-000000000001"));
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, still_editing: true });
    expect(tables.purchase_voucher_lines_v2.filter((l) => l.voucher_id === "00000000-0000-4000-8000-000000000002").map((l) => [l.id, l.sort_order])).toEqual([["L-new", 1], ["L-new2", 2]]);
    expect(tables.purchase_delivery_bills.find((b) => b.id === "B-new")!.voucher_id).toBe("00000000-0000-4000-8000-000000000002");
    expect(V("00000000-0000-4000-8000-000000000002")).toMatchObject({ status: "confirmed", pv_no: "PV2026-11-11-003", is_active: true, editing_by: "narisara wannasoot", edit_reason: "แอดมินแก้ — ไม่ระบุเหตุผล", seller_ship_foreign: 8 });
    expect(V("00000000-0000-4000-8000-000000000001")).toMatchObject({ seller_ship_foreign: null });
    expect(tables.audit_logs.some((a) => a.action === "split" && a.entity_id === "00000000-0000-4000-8000-000000000001")).toBe(true);
    // แยกแล้ว ยกเลิกการแก้ได้ตามปกติ
    const cancel = await revisePost(req({ action: "cancel" }), params("00000000-0000-4000-8000-000000000001"));
    expect(cancel.status).not.toBe(409);
  });
  it("รวม → บันทึกแล้ว → กดแก้ใหม่ → แยกใบกลับ → ยกเลิกการแก้ ไม่ได้ (จะดึงค่าส่งตอนรวมกลับมาซ้ำ) ให้กด บันทึก แทน", async () => {
    const OLDV = "00000000-0000-4000-8000-000000000001";
    await mergePost(req({ ids: ["00000000-0000-4000-8000-000000000002", OLDV] }));
    // โหมดแก้เริ่มหลังรวม (บันทึกการแก้ไขหลังรวมแล้ว กด แก้ไขใบ ใหม่) + ยังไม่แยก → ยกเลิกได้ (เวอร์ชันที่คืนมีรายการที่รวมแล้ว)
    V(OLDV).editing_at = new Date(Date.now() + 60_000).toISOString();
    expect((await revisePost(req({ action: "cancel" }), params(OLDV))).status).not.toBe(409);
    // กดแก้ใหม่อีกรอบ แล้วแยกใบกลับระหว่างแก้ → ยกเลิกการแก้ ไม่ได้
    const mergeRow = tables.audit_logs.find((a) => a.action === "merge")!;
    mergeRow.metadata = { ...(mergeRow.metadata as Row), merged_at: new Date(Date.now() - 5000).toISOString() };
    V(OLDV).editing_at = new Date(Date.now() - 1000).toISOString();
    expect((await splitPost(req({}), params(OLDV))).status).toBe(200);
    const res = await revisePost(req({ action: "cancel" }), params(OLDV));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("บันทึกการแก้ไข");
  });
  it("การรวมเก่า (ไม่มี split_data) → แยกอัตโนมัติไม่ได้ บอกตรง ๆ", async () => {
    tables.audit_logs.push({ id: "a-old", action: "merge", entity_type: "purchase_vouchers_v2", entity_id: "00000000-0000-4000-8000-000000000001", created_at: "2026-11-15T00:00:00Z", metadata: { merged_pv_nos: ["PV2026-10-16-001"] } });
    V("00000000-0000-4000-8000-000000000001").editing_at = "2026-11-21T00:00:00Z";
    const res = await splitPost(req({}), params("00000000-0000-4000-8000-000000000001"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("แยกอัตโนมัติไม่ได้");
  });
});
