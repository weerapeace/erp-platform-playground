import { describe, expect, it } from "vitest";
import { applyListPrintPreset } from "@/lib/list-print";
import {
  SO_STATUS_PRESETS, buildSoStatusPrint, lineFlags, soStatusColumns, soStatusDefaults, soStatusOpts, statusWarnings,
  type SoStatusInput, type SoStatusLine, type SoStatusMo,
} from "@/lib/so-status-print";

// ข้อมูลจริงย่อจาก SO2569-11-002 (2026-11-06)
const mo = (mo_no: string, qty: number, over: Partial<SoStatusMo> = {}): SoStatusMo =>
  ({ mo_no, qty, status: "confirmed", shipped: 0, assignees: [], dispatched: false, due: null, printed: 0, bills: [], ...over });
const line = (line_no: number, sku: string, qty: number, over: Partial<SoStatusLine>): SoStatusLine =>
  ({ id: `l${line_no}`, line_no, sku, name: `สินค้า ${sku}`, qty, unit: "ชิ้น", image_url: "/api/r2-image?key=x&w=160", stage: 1, opened: qty, shipped: 0, mos: [mo(`MO-${line_no}`, qty)], group: "Good Goods กันยายน 69", ...over });

const LINES: SoStatusLine[] = [
  // ขาด 64 · ทำเสร็จ · ส่งบางส่วน
  line(1, "CTL006-02", 100, { stage: 3, opened: 36, shipped: 36, mos: [mo("MO-2026-00281", 36, { status: "done", shipped: 36, assignees: ["จับกลุ่ม"], dispatched: true, bills: [{ no: "ISG2569-09-008", date: "2026-09-20", qty: 36 }] })] }),
  line(3, "CTL008S-01-1", 20, {}),
  // ส่งครบ มีใบจ่ายงาน
  line(13, "CTL044-03", 20, { stage: 4, shipped: 20, mos: [mo("MO-2026-00334", 20, { status: "done", shipped: 20, assignees: ["โต๊ะขาล"], dispatched: true, printed: 2 })] }),
  // ส่งแล้วบางส่วน แต่ใบผลิตยังไม่จ่ายงาน
  line(34, "CTL104-03", 200, { shipped: 199, mos: [mo("MO-2026-00355", 200, { shipped: 199 })] }),
  // ยังไม่มีใบผลิต
  line(40, "CTL999-01", 5, { stage: 0, opened: 0, mos: [] }),
];
const INPUT: SoStatusInput = {
  header: { order_no: "SO2569-11-002", status: "confirmed", order_date: "2026-09-17", due_date: null, customer: "เซ็นทรัลทำ", seller: "โอ.เอส.จี. เทรดดิ้ง", po_no: null, sale_person: null },
  lines: LINES,
};
const build = (settings = soStatusDefaults()) => buildSoStatusPrint({ ...INPUT, settings, printedAt: "06/11/2569", origin: "https://x.test" });

describe("so-status-print — ธง / จุดที่ควรเช็ก", () => {
  it("ธงต่อรายการ", () => {
    expect(lineFlags(LINES[0]).map((f) => f.text)).toEqual(["เปิดผลิตขาด 64"]);
    expect(lineFlags(LINES[1])).toEqual([]);
    expect(lineFlags(LINES[2])).toEqual([]);
    expect(lineFlags(LINES[3]).map((f) => f.key)).toEqual(["ship_no_wo"]);
    expect(lineFlags(LINES[4]).map((f) => f.key)).toEqual(["no_mo"]);
  });
  it("กล่องเตือนหัวใบ", () => {
    const w = statusWarnings(INPUT);
    expect(w.map((x) => x.key)).toEqual(["no_mo", "under", "ship_no_wo", "no_due", "wo_unprinted"]);
    expect(w.find((x) => x.key === "under")?.text).toContain("CTL006-02 (36/100 · ขาด 64)");
    expect(w.find((x) => x.key === "ship_no_wo")?.text).toContain("รวม 199 ชิ้น");
    // รอจ่ายงาน (ขั้น 1) ที่ยังไม่พิมพ์ = CTL008S-01-1 + CTL104-03
    expect(w.find((x) => x.key === "wo_unprinted")?.text).toContain("2 ใบ");
  });
  it("มีกำหนดส่งที่หัวใบ = ไม่เตือนเรื่องกำหนดส่ง", () => {
    const w = statusWarnings({ ...INPUT, header: { ...INPUT.header, due_date: "2026-12-01" } });
    expect(w.some((x) => x.key === "no_due")).toBe(false);
  });
});

describe("so-status-print — ใบพิมพ์", () => {
  it("ค่าเริ่ม = ตารางขั้นตอน: จุดดำตรงขั้นที่ระบบบอก + ช่องติ๊ก 5 ช่องต่อแถว", () => {
    const r = build();
    expect(r.count).toBe(5);
    expect(r.html).toContain("ใบเช็กสถานะใบสั่งขาย");
    expect(r.html).toContain("จุดที่ระบบเห็นว่าควรเช็ก");
    expect(r.html).toContain("ติ๊กไม่ตรงจุดดำ");
    expect((r.html.match(/class="sdot"/g) ?? []).length).toBe(5 + 1);   // 1 ต่อแถว + คำอธิบาย
    expect(r.html).toContain("ส่ง 199");                                  // ช่องส่งแล้วบอกยอดส่งบางส่วน
    expect(r.html).toContain("https://x.test/api/r2-image?key=x");        // รูปต่อโดเมนให้ (พิมพ์จากแท็บใหม่ได้)
    expect(r.html).toContain("ผู้ตรวจนับ");
  });
  it("พิมพ์เฉพาะบางขั้น · กล่องตัวเลขยังนับทั้งใบ", () => {
    const s = soStatusDefaults();
    s.opts = { stages: [1, 2, 3] };
    const r = build(s);
    expect(r.count).toBe(3);
    expect(r.html).toContain("ใบนี้พิมพ์ 3 รายการ");
    expect(r.html).not.toContain("CTL044-03</div>");
    expect(soStatusOpts(s).summary).toBe(true);
  });
  it("แบบใบเช็กละเอียด: จัดกลุ่มตามขั้น (ทำเสร็จก่อน) มีช่าง/ใบขาย/เจอจริง ไม่มีช่อง 5 ขั้น", () => {
    const s = applyListPrintPreset(soStatusDefaults(), SO_STATUS_PRESETS[1], soStatusColumns());
    const r = build(s);
    expect(r.html).not.toContain('class="sdot"');
    expect(r.html).toContain("ISG2569-09-008");
    expect(r.html).toContain("จับกลุ่ม");
    expect(r.html).toContain("เจอจริง");
    const order = ["ทำเสร็จ รอส่ง", "เปิดผลิตแล้ว", "รอเปิดผลิต", "ส่งลูกค้าแล้ว"].map((t) => r.html.indexOf(`grp-name">${t}`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(r.html).not.toContain("grp-head grp-break");
  });
  it("แบบแยกแผ่น: ขึ้นแผ่นใหม่ทุกขั้น + หัวใบย่อบอกแผ่น", () => {
    const s = applyListPrintPreset(soStatusDefaults(), SO_STATUS_PRESETS[2], soStatusColumns());
    const r = build(s);
    expect((r.html.match(/grp-head grp-break/g) ?? []).length).toBe(3);
    expect(r.html).toContain("แผ่น 1/4");
    expect(r.html).toContain("แผ่น 4/4");
  });
  it("ข้อความจากข้อมูลถูก escape", () => {
    const r = buildSoStatusPrint({ ...INPUT, lines: [line(1, "X-1", 1, { name: "<b>แตก</b>" })], settings: soStatusDefaults(), printedAt: "x", origin: "" });
    expect(r.html).toContain("&lt;b&gt;แตก&lt;/b&gt;");
  });
});
