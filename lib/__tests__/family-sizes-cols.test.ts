import { describe, expect, it } from "vitest";

import {
  FAMILY_DEFAULT_SETTINGS, FAMILY_DEFAULT_SIZES, familySizeCss, normalizeFamilySettings, normalizeFamilySizes,
  type FamilyInput, type FamilyWorkOrder,
} from "@/lib/family-print";
import { TRACK_DEFAULT_EXTRAS, buildFamilyTrack, normalizeTrackCols, trackDefaultCols, trackRouteBodyHtml, type TrackOptions } from "@/lib/family-track";

const TODAY = "2026-10-31";
const wo = (p: Partial<FamilyWorkOrder>): FamilyWorkOrder => ({
  id: "w", wo_no: "WO-x", who: "โต๊ะเสถียร", dept: "โต๊ะเสถียร", is_craftsman: false, qty: 30, dispatch_date: "2026-10-20", due_date: null,
  labor_cost: 1500, received: 0, qc_pulled: 0, status: "dispatched", submissions: [], qc: { good: 0, defect: 0, repairing: 0 }, ...p,
});
// รุ่น BPU04 แบบย่อ (2 สี 2 ใบ) — พอให้ได้หัวตาราง/ลำดับช่องของใบติดตามงาน
function bpu04(): FamilyInput {
  return {
    key: "BPU04", parent: { code: "BPU04", name: "Louis Montini (Nikita)", image_url: null },
    mos: ["06", "07"].map((s, i) => ({
      id: `id-${s}`, mo_no: `MO-2026-0047${9 + i}`, product_sku: `BPU04-${s}`, qty: 30, status: "draft",
      track: { prep_done: false, prep_at: null, cut_done: false, cut_at: null, internal_due: null, materials_issued: false, finished_received: false, skipped: [],
        work_orders: [wo({ wo_no: `WO-2026-0020${i}` })] },
    })),
    skus: ["06", "07"].map((s) => ({ code: `BPU04-${s}`, variant: s, image_url: null })),
    buy: [], cut: [],
  };
}
const t = buildFamilyTrack(bpu04(), TODAY);
const opt = (o: Partial<TrackOptions> = {}): TrackOptions => ({ extras: TRACK_DEFAULT_EXTRAS, blank: false, printed: "", today: TODAY, barcode: "both", ...o });
const heads = (html: string) => [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
const widths = (html: string) => [...html.matchAll(/<col style="width:([\d.]+)%" \/>/g)].map((m) => Number(m[1]));

describe("ขนาดแต่ละจุด (ใบรวมทั้งรุ่น)", () => {
  it("ค่าเริ่ม = ไม่ปล่อย CSS เพิ่ม (หน้าตาเดิม)", () => {
    expect(familySizeCss(FAMILY_DEFAULT_SIZES)).toBe("");
    expect(normalizeFamilySettings(null).sizes).toEqual(FAMILY_DEFAULT_SIZES);
  });

  it("เปลี่ยนจุดไหน ปล่อยแค่จุดนั้น · ทั้งบนจอและตอนพิมพ์ · รูป 0 = ซ่อน", () => {
    const css = familySizeCss({ ...FAMILY_DEFAULT_SIZES, qr: 16, head_img: 0, margin: 5 });
    expect(css).toContain(".fp-bc-qr .wo-qr { width: 16mm; height: 16mm; }");
    expect(css).toContain(".fp-skuimg { display: none !important; }");
    expect(css).toContain(".doc { padding: 5mm 6mm !important; }");
    expect(css).toContain("@media print");
    expect(css).not.toContain(".product-code");
  });

  it("ค่าเพี้ยน/เกินช่วง ถูกบีบเข้าช่วง · ค่าที่ไม่ได้ส่ง = ค่าเริ่ม", () => {
    const z = normalizeFamilySizes({ qr: 99, mo_no: "abc", pad: "huge", bc_h: 6 });
    expect(z.qr).toBe(20);
    expect(z.mo_no).toBe(FAMILY_DEFAULT_SIZES.mo_no);
    expect(z.pad).toBe("normal");
    expect(z.bc_h).toBe(6);
  });
});

describe("คอลัมน์ใบติดตามงาน (แบบ A)", () => {
  it("ค่าเริ่ม = ลำดับ/ความกว้างเดิม (ช่องเลขใบกว้างตามบาร์โค้ด)", () => {
    const html = trackRouteBodyHtml(t, opt());
    expect(heads(html)).toEqual(["สี", "ใบสั่งผลิต", "เตรียม - ตัด", "จ่ายงาน", "ค่าแรง", "รับงาน", "ดี / เสีย", "ค้าง / กำหนดส่ง", "ลงชื่อช่าง"]);
    expect(trackDefaultCols("qr").find((c) => c.key === "mo")!.width).toBe(36);
  });

  it("ย้ายลำดับ · เปลี่ยนชื่อหัว · ย่อช่องเลขใบ · ปิดช่องหลัก", () => {
    // แผงบันทึกรายการครบทุกคอลัมน์เสมอ — สลับ สี/เลขใบ · ตั้งชื่อ · ย่อเลขใบเหลือ 30 · ปิดค่าแรง
    const base = trackDefaultCols("both");
    const saved = [base[1], base[0], ...base.slice(2)].map((c) =>
      c.key === "mo" ? { ...c, label: "เลขใบ", width: 30 } : c.key === "labor" ? { ...c, show: false } : c);
    const cols = normalizeTrackCols(saved, "both");
    const html = trackRouteBodyHtml(t, opt({ cols }));
    const h = heads(html);
    expect(h.slice(0, 3)).toEqual(["เลขใบ", "สี", "เตรียม - ตัด"]);
    expect(h).not.toContain("ค่าแรง");
    // แต่ละแถวมีช่องเท่าหัวตาราง (ไม่เลื่อน) — แถวแรกของสีมี "สี" ด้วย
    const firstRow = html.split("<tbody>")[1].split("</tr>")[0];
    expect((firstRow.match(/<td/g) ?? []).length).toBe(h.length);
    expect(widths(html)[0]).toBeCloseTo((30 / (30 + 30 + 25 + 38 + 32 + 18 + 22 + 24)) * 100, 0);
  });

  it("ช่องเสริมเปิด/ปิดตามปุ่มบนแถบเสมอ (ไม่สน show ที่บันทึก)", () => {
    const cols = normalizeTrackCols([{ key: "sign", label: "ลงชื่อ", width: 24, show: false }], "both");
    expect(heads(trackRouteBodyHtml(t, opt({ cols })))).toContain("ลงชื่อ");
    expect(heads(trackRouteBodyHtml(t, opt({ cols, extras: { ...TRACK_DEFAULT_EXTRAS, sign: false } })))).not.toContain("ลงชื่อ");
  });

  it("คอลัมน์ใหม่ที่ยังไม่เคยบันทึกแทรกตรงตำแหน่งค่าเริ่ม · คีย์แปลกทิ้ง · ปิดหมด = ค่าเริ่ม", () => {
    const n = normalizeTrackCols([{ key: "bogus", label: "x", width: 9, show: true }, { key: "recv", label: "รับ", width: 32, show: true }], "both");
    expect(n.map((c) => c.key)).toEqual(["sku", "mo", "prep", "dispatch", "labor", "recv", "gb", "late", "qc", "mat", "pay", "sign"]);
    const allOff = trackDefaultCols("both").map((c) => ({ ...c, show: false }));
    expect(heads(trackRouteBodyHtml(t, opt({ cols: allOff, extras: { ...TRACK_DEFAULT_EXTRAS, gb: false, late: false, sign: false } }))).length).toBeGreaterThan(0);
  });

  it("บันทึกเป็นค่ากลาง: track_cols ผ่าน normalizeFamilySettings ได้ · ค่าเริ่ม null", () => {
    expect(FAMILY_DEFAULT_SETTINGS.track_cols).toBeNull();
    const s = normalizeFamilySettings({ track_cols: [{ key: "mo", label: "<b>", width: 40, show: true }, { nope: 1 }] });
    expect(s.track_cols).toEqual([{ key: "mo", label: "<b>", width: 40, show: true }]);
    // ชื่อหัวที่พิมพ์เองถูก escape ตอนพิมพ์
    expect(trackRouteBodyHtml(t, opt({ cols: normalizeTrackCols(s.track_cols, "both") }))).toContain("<th>&lt;b&gt;</th>");
  });
});
