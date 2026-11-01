import { describe, it, expect } from "vitest";
import { defaultRevert, defaultShelf, revertAllForm, revertBlock, runMove, shipRecs, unshipPlan, type MoveInfo } from "./sales-move-plan";
import { ceBuild } from "./catch-up-edit-plan";
import type { CatchUpSnapshot, CatchUpWo, CatchUpSub } from "@/app/api/mo/catch-up/route";

// แบบข้อมูลจริง (2026-11-01): ใบที่ผูกใบขายแล้วทุกใบถูกอัปเดตย้อนหลังครบชุด — ใบจ่าย 1 ใบ · ส่งคืน 1 รอบ (รอลงค่าแรง) · ส่งออก "ขายออก" 1 ครั้ง
const wo = (o: Partial<CatchUpWo> = {}): CatchUpWo => ({ id: "w1", wo_no: "WO-1", qty: 20, received_qty: 20, qc_pulled_qty: 20, status: "done",
  department_name: "โต๊ะแต๋ว", assignee_name: "โต๊ะแต๋ว", dispatch_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z", labor_cost: 0,
  assignee_type: "department", assignee_id: null, department_id: "d1", note: null, assignees: [], ...o });
const sub = (o: Partial<CatchUpSub> = {}): CatchUpSub => ({ id: "s1", wo_id: "w1", wo_no: "WO-1", qty: 20, wage: null, submitted_at: "2026-10-10", craftsman_name: "โต๊ะแต๋ว", info_pending: true, created_at: "", ...o });
const snap = (o: { subs?: CatchUpSub[]; qcItems?: CatchUpSnapshot["qcItems"]; mo?: Partial<CatchUpSnapshot["mo"]> } = {}): CatchUpSnapshot => ({
  mo: { id: "m1", mo_no: "MO-2026-00335", product_sku: "CTL044-02", product_name: "กระเป๋า", qty: 20, status: "draft", due_date: null, internal_due_date: null,
    has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, prep_done: true, cut_done: true, skipped: {}, bom_code: null, note: null,
    prep_done_at: "2026-09-30T05:00:00Z", cut_done_at: "2026-09-30T05:00:00Z", sized: false, ...o.mo },
  progress: null, materials: [], wos: [wo()], shelves: [], shelf: { good: 0, defect: 0, repairing: 0 }, shelfAt: [], rates: [], reasons: [],
  past: { mo: [], model: [] }, sales: { so: [], dn: [] }, subs: o.subs ?? [sub()], qcItems: o.qcItems ?? [],
});
const info = (o: Partial<MoveInfo> = {}): MoveInfo => ({
  mo: { id: "m1", mo_no: "MO-2026-00335", qty: 20, status: "draft", product_sku: "CTL044-02" },
  links: [{ id: "k1", sale_line_id: "L1", so_number: "ISG2569-10-024", sale_date: "2026-10-22", qty: 20 }],
  ships: shipRecs([{ id: "a1", action: "qc.ship", created_at: "2026-10-22T05:00:00Z", metadata: { mo_no: "MO-2026-00335", qty: 20, mode: "sell" } }]),
  shelves: [{ id: "sh-wait", name: "งานรอตรวจ", kind: "store" }, { id: "sh-defect", name: "ชั้นของเสีย รอซ่อม", kind: "defect" }, { id: "sh-done", name: "QC แล้ว", kind: "store" }],
  ...o,
});

describe("ย้อนการส่งออก", () => {
  it("หักที่ย้อนไปแล้ว · ใหม่ก่อน", () => {
    const s = shipRecs([
      { id: "a1", action: "qc.ship", created_at: "2026-10-01T00:00:00Z", metadata: { qty: 30, mode: "sell" } },
      { id: "a2", action: "qc.ship", created_at: "2026-10-05T00:00:00Z", metadata: { qty: 10, mode: "sales_wh", shelf_id: "x" } },
      { id: "u1", action: "qc.unship", created_at: "2026-10-06T00:00:00Z", metadata: { ship_audit_id: "a1", qty: 12 } },
    ]);
    expect(s.map((x) => [x.id, x.left, x.shelf_id])).toEqual([["a2", 10, "x"], ["a1", 18, null]]);
    // ระบุจำนวน = เอาจากที่ "ขายออก" ก่อน (ส่วนเข้าคลังขายไม่ใช่ของใบขายนี้) · ทั้งหมด = ทุกครั้ง ใหม่ก่อน
    expect(unshipPlan(s, 15)).toEqual([{ id: "a1", qty: 15 }]);
    expect(unshipPlan(s, 25)).toEqual([{ id: "a1", qty: 18 }, { id: "a2", qty: 7 }]);
    expect(unshipPlan(s, null)).toEqual([{ id: "a2", qty: 10 }, { id: "a1", qty: 18 }]);
  });
  it("ชั้นตั้งต้น = ชั้นที่ส่งออกไป (ถ้าจดไว้) ไม่งั้นชั้นเก็บของชั้นสุดท้าย (ไม่ใช่ชั้นของเสีย)", () => {
    expect(defaultShelf(info())).toBe("sh-done");
    expect(defaultShelf(info({ ships: shipRecs([{ id: "a1", action: "qc.ship", created_at: "", metadata: { qty: 5, shelf_id: "sh-wait" } }]) }))).toBe("sh-wait");
  });
});

describe("เลือกว่าใบเดิมจะกลับเป็นแบบไหน", () => {
  const a = (o: Partial<Parameters<typeof revertBlock>[1]> = {}) => ({ info: info(), snap: snap(), lineId: "L1", qty: 20, ...o });
  it("ข้อมูลจริงทั่วไป: ย้อนเป็นรอจ่ายได้ (ตั้งต้น)", () => {
    expect(revertBlock("wait", a())).toBeNull();
    expect(defaultRevert(a())).toBe("wait");
  });
  it("ยังผูกใบขายอื่นอยู่ → ย้อนทั้งใบไม่ได้ เหลือของกลับขึ้นชั้น", () => {
    const two = info({ links: [...info().links, { id: "k2", sale_line_id: "L2", so_number: "ISG2569-10-030", sale_date: null, qty: 10 }] });
    expect(revertBlock("wait", a({ info: two }))).toMatch(/ISG2569-10-030/);
    expect(defaultRevert(a({ info: two }))).toBe("qc");
  });
  it("รอบส่งคืนลงค่าแรงแล้ว (นับเข้าค่าแรงช่าง) → ห้ามย้อนเป็นรอจ่าย", () => {
    expect(revertBlock("wait", a({ snap: snap({ subs: [sub({ info_pending: false, wage: 600 })] }) }))).toMatch(/฿600/);
  });
  it("ยังไม่ได้ส่งออก → ของกลับขึ้นชั้นไม่ได้ · ใบปิดแล้ว → ย้อนไม่ได้ทั้งสองทาง · ไม่แตะ เลือกได้เสมอ", () => {
    expect(revertBlock("qc", a({ info: info({ ships: [] }) }))).toMatch(/ยังไม่ได้ส่งออก/);
    const done = info({ mo: { ...info().mo, status: "done" } });
    expect(revertBlock("wait", a({ info: done }))).toMatch(/ปิดงานแล้ว/);
    expect(revertBlock("qc", a({ info: done }))).toMatch(/ปิดงานแล้ว/);
    expect(revertBlock("none", a({ info: done }))).toBeNull();
  });
  it("ฟอร์มย้อนทั้งหมด = ย้อนของบนชั้น → ลบรอบส่งคืน → ยกเลิกใบจ่าย → เอาติ๊กเตรียม/ตัดออก (ใช้ตัวแก้ไขใบงานเดิม)", () => {
    const s = snap({ qcItems: [{ id: "i1", wo_id: "w1", qty: 20, status: "good", shelf_name: "QC แล้ว", reason: null, created_at: "" }] });
    const b = ceBuild(s, revertAllForm(s), { departments: [], people: [] });
    expect(b.errors).toEqual([]);
    expect(b.ops.map((o) => o.kind)).toEqual(["qc_back", "sub_del", "wo_cancel", "ready", "ready"]);
  });
});

describe("บันทึกการย้าย (ลำดับเรียก API)", () => {
  const mk = (fail?: (url: string, body: unknown, method?: string) => boolean) => {
    const calls: string[] = [];
    const api = async (url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
      const b = body as Record<string, unknown> | null;
      calls.push(`${method} ${url.split("?")[0]}${b?.action ? `:${b.action}` : ""}${b?.mo_no ? `:${b.mo_no}` : ""}${url.includes("?") ? `?${url.split("?")[1]}` : ""}`);
      if (fail?.(url, body, method)) throw new Error("ไม่ผ่าน");
      return {};
    };
    return { calls, api };
  };
  // หลังเอาของกลับขึ้นชั้น ตัวแก้ไขใบงานเห็นของที่เพิ่งกลับมา
  const after = snap({ qcItems: [{ id: "back1", wo_id: "w1", qty: 20, status: "good", shelf_name: "QC แล้ว", reason: null, created_at: "" }] });

  it("ยังไม่ได้ทำ: ถอด → ผูกใบใหม่ → ของกลับขึ้นชั้น → ตัวแก้ไขใบงานย้อนทั้งหมด", async () => {
    const { calls, api } = mk();
    const res = await runMove({ info: info(), lineId: "L1", soNumber: "ISG2569-10-024", qty: 20, to: { mo_no: "MO-2026-00182", relink: false },
      revert: "wait", shelfId: "sh-done", api, loadSnap: async () => after });
    expect(res.every((x) => x.ok)).toBe(true);
    expect(calls).toEqual([
      "DELETE /api/mo/sales-match?mo_no=MO-2026-00335&sale_line_id=L1",
      "POST /api/mo/sales-match:MO-2026-00182",
      "POST /api/qc-warehouse/items:unship",
      "POST /api/qc-warehouse/items:return_queue",
      "DELETE /api/mo/submissions?id=s1&via=cu_edit&label=" + encodeURIComponent("ลบรอบส่งคืน WO-1 20 ชิ้น (10 ต.ค. 69 · โต๊ะแต๋ว)"),
      "DELETE /api/mo/work-orders/w1?via=cu_edit&label=" + encodeURIComponent("ยกเลิกใบจ่าย WO-1 (20 ชิ้น · โต๊ะแต๋ว)"),
      "PATCH /api/mo/m1/mark-ready",
      "PATCH /api/mo/m1/mark-ready",
    ]);
  });

  it("ใบปลายทางผูกใบขายอื่นอยู่ = ถอดของเดิมก่อน · ไม่แตะ = หยุดหลังผูก", async () => {
    const { calls, api } = mk();
    await runMove({ info: info(), lineId: "L1", soNumber: "ISG2569-10-024", qty: 20, to: { mo_no: "MO-2026-00218", relink: true },
      revert: "none", shelfId: null, api, loadSnap: async () => after });
    expect(calls).toEqual([
      "DELETE /api/mo/sales-match?mo_no=MO-2026-00335&sale_line_id=L1",
      "DELETE /api/mo/sales-match?mo_no=MO-2026-00218",
      "POST /api/mo/sales-match:MO-2026-00218",
    ]);
  });

  it("ผูกใบใหม่ไม่ได้ → ผูกกลับใบเดิม แล้วหยุด (ไม่ย้อนสถานะ)", async () => {
    const { calls, api } = mk((url, body, method) => method === "POST" && (body as { mo_no?: string })?.mo_no === "MO-2026-00182");
    const res = await runMove({ info: info(), lineId: "L1", soNumber: "ISG2569-10-024", qty: 20, to: { mo_no: "MO-2026-00182", relink: false },
      revert: "wait", shelfId: null, api, loadSnap: async () => after });
    expect(calls.at(-1)).toBe("POST /api/mo/sales-match:MO-2026-00335");
    expect(res.map((x) => x.ok)).toEqual([true, false, true]);
  });

  it("ของกลับขึ้นชั้น: ย้อนเท่าจำนวนที่ย้าย ไม่เรียกตัวแก้ไขใบงาน", async () => {
    const { calls, api } = mk();
    await runMove({ info: info(), lineId: "L1", soNumber: "ISG2569-10-024", qty: 12, to: { mo_no: "MO-2026-00182", relink: false },
      revert: "qc", shelfId: "sh-wait", api, loadSnap: async () => { throw new Error("ไม่ควรเรียก"); } });
    expect(calls.slice(2)).toEqual(["POST /api/qc-warehouse/items:unship"]);
  });
});
