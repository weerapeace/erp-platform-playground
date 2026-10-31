import { describe, expect, it } from "vitest";

import { buildReportHtmlMulti } from "@/lib/template";
import { buildFamilyTemplate, type FamilyBuyLine, type FamilyInput, type FamilyMo, type FamilyWorkOrder } from "@/lib/family-print";
import {
  TRACK_CSS, TRACK_DEFAULT_EXTRAS, buildFamilyTrack, daysSince, familyTrackHtmlData, normalizeTrackExtras, trackBuckets, type TrackOptions,
} from "@/lib/family-track";

const TODAY = "2026-10-31";
const wo = (p: Partial<FamilyWorkOrder>): FamilyWorkOrder => ({
  id: p.wo_no ?? "w", wo_no: "WO-x", who: "โต๊ะเสถียร", dept: "โต๊ะเสถียร", is_craftsman: false, qty: 0, dispatch_date: null, due_date: null,
  labor_cost: null, received: 0, qc_pulled: 0, status: "dispatched", submissions: [], qc: { good: 0, defect: 0, repairing: 0 }, ...p,
});
type Spec = { mo: string; sku: string; qty: number; prepAt: string | null; disp: string | null; recv: string | null; woNo: string };
// ข้อมูลจริงจาก DB (2026-10-31) — รุ่น TTM130 ใบเปิด 8 ใบ 5 สี จ่ายโต๊ะเสถียรทั้งหมด เรต 50/ชิ้น
const SPECS: Spec[] = [
  { mo: "00098", sku: "01", qty: 50, prepAt: null, disp: "2026-08-15", recv: null, woNo: "WO-2026-00106" },
  { mo: "00363", sku: "01", qty: 50, prepAt: "2026-10-31", disp: null, recv: "2026-10-21", woNo: "WO-2026-00163" },
  { mo: "00099", sku: "02", qty: 40, prepAt: null, disp: "2026-08-15", recv: "2026-08-10", woNo: "WO-2026-00107" },
  { mo: "00364", sku: "02", qty: 30, prepAt: "2026-10-31", disp: null, recv: "2026-10-21", woNo: "WO-2026-00164" },
  { mo: "00100", sku: "03", qty: 30, prepAt: null, disp: "2026-08-15", recv: "2026-08-10", woNo: "WO-2026-00108" },
  { mo: "00365", sku: "03", qty: 40, prepAt: "2026-10-31", disp: null, recv: "2026-10-21", woNo: "WO-2026-00167" },
  { mo: "00366", sku: "04", qty: 10, prepAt: "2026-10-31", disp: null, recv: "2026-10-31", woNo: "WO-2026-00172" },
  { mo: "00367", sku: "05", qty: 10, prepAt: "2026-10-31", disp: null, recv: "2026-10-21", woNo: "WO-2026-00179" },
];
const sumLine = (mo: string, ready: boolean): FamilyBuyLine => ({
  mo_no: mo, code: "LEATHER", name: "หนังวัว", type: "หนัง", uom: "ฟุต", qty_per: 1, required: 1, remaining: 0, status: ready ? "ready" : "have", po_nos: [], seq: 1, image_url: null,
});
function ttm130(): FamilyInput {
  const mos: FamilyMo[] = SPECS.map((s) => ({
    id: `id-${s.mo}`, mo_no: `MO-2026-${s.mo}`, product_sku: `TTM130-${s.sku}`, qty: s.qty, status: "draft",
    track: {
      prep_done: !!s.prepAt, prep_at: s.prepAt, cut_done: !!s.prepAt, cut_at: s.prepAt, internal_due: null, materials_issued: true, finished_received: false, skipped: [],
      work_orders: [wo({ wo_no: s.woNo, qty: s.qty, dispatch_date: s.disp, labor_cost: s.qty * 50, received: s.recv ? s.qty : 0, status: s.recv ? "done" : "dispatched",
        submissions: s.recv ? [{ date: s.recv, qty: s.qty, wage: s.qty * 50, who: "โต๊ะเสถียร" }] : [] })],
    },
  }));
  return {
    key: "TTM130", parent: { code: "TTM130", name: "กระเป๋าสตางค์ผู้ชาย หนังวัวแท้", image_url: null },
    mos, skus: ["01", "02", "03", "04", "05"].map((s) => ({ code: `TTM130-${s}`, variant: s, image_url: null })),
    buy: SPECS.map((s) => sumLine(`MO-2026-${s.mo}`, !!s.prepAt)), cut: [],
  };
}
const OPT: TrackOptions = { extras: TRACK_DEFAULT_EXTRAS, blank: false, printed: "31 ต.ค. 69", today: TODAY };

describe("buildFamilyTrack — TTM130 จริง", () => {
  const t = buildFamilyTrack(ttm130(), TODAY);

  it("ยอดรวม: 260 ชิ้น · ค่าแรง 13,000 · รับ 210 · ค้างที่ช่าง 50", () => {
    expect(t.stats).toMatchObject({ skus: 5, mos: 8, qty: 260, labor: 13000, dispatched: 260, received: 210, outstanding: 50, undispatched: 0 });
    expect(t.groups.map((g) => g.mos.length)).toEqual([2, 2, 2, 1, 1]);
  });

  it("แยกตามสถานะ: อยู่ที่ช่าง 1 ใบ (00098) · รับแล้วรอ QC 7 ใบ", () => {
    const b = trackBuckets(t);
    expect(b.atWorker.map((x) => x.w.wo_no)).toEqual(["WO-2026-00106"]);
    expect(b.received.map((m) => m.mo.mo_no.slice(-5))).toEqual(["00363", "00099", "00364", "00100", "00365", "00366", "00367"]);
    expect(b.pre).toHaveLength(0);
    expect(b.toDispatch).toHaveLength(0);
  });

  it("จับข้อมูลที่ควรเช็กได้ตรงกับที่เจอใน DB", () => {
    const by = Object.fromEntries(t.issues.map((i) => [i.key, i.mos]));
    expect(by.no_dispatch_date).toEqual(["00363", "00364", "00365", "00366", "00367"]);
    expect(by.recv_before_dispatch).toEqual(["00099", "00100"]);
    expect(by.dispatched_unprepped).toEqual(["00098", "00099", "00100"]);
    expect(by.long_outstanding).toEqual(["00098"]);
    expect(by.received_open).toHaveLength(7);
    expect(by.no_labor).toBeUndefined();
  });

  it("นับวันค้างจากวันจ่าย (เวลาไทย ไม่เพี้ยนข้ามเดือน)", () => {
    expect(daysSince("2026-08-15", TODAY)).toBe(77);
    expect(daysSince(null, TODAY)).toBeNull();
  });
});

describe("กติกาขั้นงาน (เหมือนบอร์ด)", () => {
  it("จ่ายไปบางส่วน → อยู่ทั้ง 'อยู่ที่ช่าง' และ 'รอจ่ายงาน'", () => {
    const inp = ttm130();
    inp.mos = [{ ...inp.mos[1], track: { ...inp.mos[1].track!, work_orders: [wo({ wo_no: "WO-A", qty: 20, dispatch_date: "2026-10-30", status: "dispatched" })] } }];
    const b = trackBuckets(buildFamilyTrack(inp, TODAY));
    expect(b.atWorker.map((x) => x.w.wo_no)).toEqual(["WO-A"]);
    expect(b.toDispatch.map((m) => m.remaining)).toEqual([30]);
  });

  it("แอดมินข้ามเตรียม/ตัด → พร้อมจ่ายแม้ยังไม่ติ๊ก · ยังไม่ข้าม = รอเตรียม", () => {
    const inp = ttm130();
    const base = { ...inp.mos[0].track!, work_orders: [] };
    inp.mos = [
      { ...inp.mos[0], track: { ...base, skipped: ["prep", "cut"] } },
      { ...inp.mos[2], track: { ...base } },
    ];
    const b = trackBuckets(buildFamilyTrack(inp, TODAY));
    expect(b.toDispatch.map((m) => m.mo.mo_no)).toEqual(["MO-2026-00098"]);
    expect(b.pre.map((m) => m.mo.mo_no)).toEqual(["MO-2026-00099"]);
  });

  it("ไม่มีสูตร → ใช้ติ๊กระดับใบ", () => {
    const inp = { ...ttm130(), buy: [] };
    const t = buildFamilyTrack(inp, TODAY);
    expect(t.groups[0].mos.map((m) => m.prep.state)).toEqual(["todo", "done"]);
  });
});

describe("HTML ใบพิมพ์", () => {
  const t = buildFamilyTrack(ttm130(), TODAY);

  it("แบบ A: กลุ่มตามสี · ค้าง 77 วัน · วันจ่ายที่ไม่มีในระบบเป็นช่องเขียน · ลายเซ็นช่าง", () => {
    const html = familyTrackHtmlData(t, "route", OPT).body_html as string;
    expect(html).toContain("TTM130-01");
    expect(html).toContain("ค้าง 77 วัน");
    expect(html).toContain("ไม่มีในระบบ");
    expect(html).toContain("ลงชื่อช่าง");
    expect(html).toContain("ข้อมูลในระบบที่ควรเช็ก");
    expect(html).not.toContain("จ่ายเงินค่าแรง");
    const more = familyTrackHtmlData(t, "route", { ...OPT, extras: { ...OPT.extras, pay: true, sign: false } }).body_html as string;
    expect(more).toContain("จ่ายเงินค่าแรง");
    expect(more).not.toContain("ลงชื่อช่าง");
    // เปิดครบทุกช่อง → ความกว้างคอลัมน์รวมกัน = 100% (ไม่ล้นขอบกระดาษ)
    const all = familyTrackHtmlData(t, "route", { ...OPT, extras: normalizeTrackExtras({ gb: true, rounds: true, late: true, qc: true, mat: true, pay: true, sign: true }) }).body_html as string;
    const widths = [...all.matchAll(/<col style="width:([\d.]+)%"/g)].map((x) => Number(x[1]));
    expect(widths).toHaveLength(12);
    expect(Math.abs(widths.reduce((n, w) => n + w, 0) - 100)).toBeLessThan(0.5);
  });

  it("แบบ A (ปรับตามเจ้าของ): ไม่มีแถวหัวสี · ช่องสีคร่อมทุกใบของสี · เลขใบเต็ม + บาร์โค้ด", () => {
    const codes = { "MO-2026-00098": { line: "<svg class=\"wo-barcode-svg\"></svg>", qr: "<img class=\"wo-qr\">" } };
    const html = familyTrackHtmlData(t, "route", { ...OPT, barcode: "both", codes }).body_html as string;
    expect(html.match(/class="tr-gh"/g)).toHaveLength(1);   // เหลือแค่แถวรวมท้ายตาราง
    expect(html).toContain('class="tr-skucell" rowspan="2"');   // TTM130-01 มี 2 ใบ
    expect(html).toContain('<div class="tr-mo">MO-2026-00098</div>');
    expect(html).toContain("fp-bc-line");
    expect(html).toContain("wo-qr");
    const qrOnly = familyTrackHtmlData(t, "route", { ...OPT, barcode: "qr", codes }).body_html as string;
    expect(qrOnly).not.toContain("fp-bc-line");
    const blank = familyTrackHtmlData(t, "route", { ...OPT, blank: true, barcode: "both", codes }).body_html as string;
    expect(blank).not.toContain("wo-qr");   // ฟอร์มเปล่าไม่พิมพ์บาร์โค้ด
  });

  it("แบบ A: 'ของยังขาด' เตือนเฉพาะใบที่ยังไม่จ่ายงาน", () => {
    const inp = ttm130();
    inp.buy = inp.buy.map((l) => ({ ...l, remaining: 5, status: "buy" as const }));
    inp.mos[1] = { ...inp.mos[1], track: { ...inp.mos[1].track!, work_orders: [] } };
    const html = familyTrackHtmlData(buildFamilyTrack(inp, TODAY), "route", OPT).body_html as string;
    expect(html.match(/ของยังขาด/g)).toHaveLength(1);
  });

  it("แบบ A: ใบที่มีหลายใบจ่ายงาน → ช่องเลขใบ/เตรียมคร่อมแถว (rowspan)", () => {
    const inp = ttm130();
    inp.mos[0] = { ...inp.mos[0], track: { ...inp.mos[0].track!, work_orders: [wo({ wo_no: "WO-1", qty: 25 }), wo({ wo_no: "WO-2", qty: 25 })] } };
    const html = familyTrackHtmlData(buildFamilyTrack(inp, TODAY), "route", OPT).body_html as string;
    expect(html).toContain('rowspan="2"');
  });

  it("แบบ D: 4 กลุ่มสถานะ · ฟอร์มเปล่าไม่มีข้อมูลระบบ", () => {
    const html = familyTrackHtmlData(t, "status", OPT).body_html as string;
    for (const h of ["รอของ / เตรียม / ตัด", "รอจ่ายงาน", "อยู่ที่ช่าง — รอรับงาน", "รับแล้ว — รอ QC / เข้าคลัง"]) expect(html).toContain(h);
    expect(html).toContain("77 วัน");
    const blank = familyTrackHtmlData(t, "status", { ...OPT, blank: true });
    expect(blank.body_html as string).not.toContain("โต๊ะเสถียร");
    expect(blank.body_html as string).not.toContain("ข้อมูลในระบบที่ควรเช็ก");
    expect(blank.head_html as string).toContain("ฟอร์มเปล่า");
  });

  it("ประกอบเป็นเอกสารได้ (A + D ต่อกัน 2 แผ่น)", () => {
    const html = buildReportHtmlMulti(buildFamilyTemplate("landscape", TRACK_CSS), [familyTrackHtmlData(t, "route", OPT), familyTrackHtmlData(t, "status", OPT)], "x");
    expect(html.match(/class="doc-page"/g)).toHaveLength(2);
    expect(html).toContain("ใบติดตามงานผลิต");
    expect(html).toContain("ใบงานตามสถานะ");
  });

  it("ค่าที่จำไว้เพี้ยน → ใช้ค่าเริ่ม", () => {
    expect(normalizeTrackExtras({ gb: false, pay: "yes", junk: 1 })).toEqual({ ...TRACK_DEFAULT_EXTRAS, gb: false });
    expect(normalizeTrackExtras(null)).toEqual(TRACK_DEFAULT_EXTRAS);
  });
});
