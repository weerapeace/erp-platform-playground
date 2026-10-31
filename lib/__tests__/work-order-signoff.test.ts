import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BLANK_DATE, signoffHtml } from "@/lib/print-signoff";
import { buildReportHtml, buildReportHtmlMulti } from "@/lib/template";
import {
  WO_DEFAULT_COLUMNS, WO_DEFAULT_EXTRAS, WO_DEFAULT_SIGNOFF, buildWoHtmlData, buildWorkOrderTemplate,
  normalizeWoColumns, woBoxSheets, woSectionDataList, woSignoffBoxes, type MoDetail, type WoPrintColumns,
} from "@/lib/work-order-print";

// ข้อมูลจริงจาก DB (2026-10-31)
const NOT_DISPATCHED: MoDetail = { id: "a", mo_no: "MO-2026-00421", product_sku: "WK45-05", qty: 30, status: "draft", created_at: "2026-10-12T05:08:40Z", work_orders: [] };
const TWO_CRAFTSMEN: MoDetail = {
  id: "b", mo_no: "MO-2026-00014", product_sku: "PIX39-01", qty: 30, status: "draft", created_at: "2026-06-16T13:16:08Z",
  work_orders: [{ wo_no: "WO-2026-00136", department_name: "จับกลุ่ม", assignee_type: "craftsman", assignee_name: "ภิรมย์ ชัยดี (ลม), โสภา สุริโย (แพง)",
    assignees: [{ id: "1", name: "ภิรมย์ ชัยดี (ลม)" }, { id: "2", name: "โสภา สุริโย (แพง)" }], qty: 30, dispatch_date: "2026-08-15" }],
};
const THREE_WOS: MoDetail = {
  id: "c", mo_no: "MO-2026-00040", product_sku: "CTL104-04", qty: 200, status: "draft", created_at: "2026-06-17T13:32:35Z",
  work_orders: [
    { wo_no: "WO-2026-00046", department_name: "ช่างเหมา", assignee_type: "department", assignee_name: "ช่างเหมา", assignees: [], qty: 50, dispatch_date: "2026-08-15" },
    { wo_no: "WO-2026-00047", department_name: "ช่างเหมา", assignee_type: "department", assignee_name: "ช่างเหมา", assignees: [], qty: 50, dispatch_date: "2026-08-15" },
    { wo_no: "WO-2026-00048", department_name: "โต๊ะขาล", assignee_type: "department", assignee_name: "โต๊ะขาล", assignees: [], qty: 100, dispatch_date: "2026-08-15" },
  ],
};
const QTY_CHANGED: MoDetail = {
  id: "d", mo_no: "MO-2026-00307", product_sku: "PIX12-13", qty: 15, status: "draft", created_at: "2026-09-07T05:10:56Z",
  prep_done_at: "2026-10-31T01:53:23Z", cut_done_at: "2026-10-31T01:53:23Z", qty_from: 20, qty_change_reason: "ของไม่พอ",
  work_orders: [{ wo_no: "WO-2026-00153", department_name: "โต๊ะแต๋ว", assignee_type: "department", assignee_name: "โต๊ะแต๋ว", assignees: [], qty: 15, dispatch_date: null }],
};

const titles = (mo: MoDetail, so = WO_DEFAULT_SIGNOFF, ex = WO_DEFAULT_EXTRAS) => woSignoffBoxes(mo, so, ex).map((b) => b.title);

describe("กล่องลงชื่อใบสั่งงานผลิต", () => {
  it("ค่าเริ่มต้น: ผู้สั่ง + หัวหน้า + ตัด/เตรียม + ช่างว่าง 2 กล่องเมื่อยังไม่จ่ายงาน", () => {
    expect(titles(NOT_DISPATCHED)).toEqual(["ผู้สั่งผลิต", "หัวหน้าอนุมัติ", "แผนกตัด/เตรียม", "ช่างรับงาน", "ช่างรับงาน"]);
  });

  it("ใบเดียวหลายช่าง: เซ็นแยกรายคน หรือช่องเดียว", () => {
    const each = woSignoffBoxes(TWO_CRAFTSMEN, WO_DEFAULT_SIGNOFF, WO_DEFAULT_EXTRAS).find((b) => b.note === "WO-2026-00136")!;
    expect(each.lines.filter((l) => l.kind === "sign")).toHaveLength(2);
    const one = woSignoffBoxes(TWO_CRAFTSMEN, { ...WO_DEFAULT_SIGNOFF, multi: "one" }, WO_DEFAULT_EXTRAS).find((b) => b.note === "WO-2026-00136")!;
    expect(one.lines.filter((l) => l.kind === "sign")).toHaveLength(1);
    // จ่ายแล้ว → ไม่มีกล่องว่าง (extra = 0)
    expect(titles(TWO_CRAFTSMEN).filter((t) => t === "ช่างรับงาน")).toHaveLength(1);
  });

  it("1 กล่องต่อใบจ่ายงาน · รวมโต๊ะเดียวกันได้", () => {
    expect(titles(THREE_WOS).filter((t) => t === "ช่างรับงาน")).toHaveLength(3);
    const merged = woSignoffBoxes(THREE_WOS, { ...WO_DEFAULT_SIGNOFF, merge: true }, WO_DEFAULT_EXTRAS).filter((b) => b.title === "ช่างรับงาน");
    expect(merged).toHaveLength(2);
    expect(merged[0].note).toBe("WO-2026-00046, WO-2026-00047");
    expect(merged[0].lines[0]).toMatchObject({ kind: "text", right: "รับ 100 ชิ้น" });
  });

  it("วันที่: เขียนมือ = ช่องว่าง · เติมจากระบบ = ใช้วันที่ที่รู้ ไม่มีก็ว่าง", () => {
    const blank = signoffHtml(woSignoffBoxes(QTY_CHANGED, WO_DEFAULT_SIGNOFF, WO_DEFAULT_EXTRAS));
    expect(blank).toContain(BLANK_DATE);
    expect(blank).not.toContain("2569");
    const filled = woSignoffBoxes(QTY_CHANGED, { ...WO_DEFAULT_SIGNOFF, date: "fill" }, WO_DEFAULT_EXTRAS);
    const prep = filled.find((b) => b.title === "แผนกตัด/เตรียม")!;
    expect(prep.lines.find((l) => l.kind === "date")).toMatchObject({ value: expect.stringContaining("2569") });
    const worker = filled.find((b) => b.title === "ช่างรับงาน")!;   // ใบจ่ายงานไม่มีวันจ่าย → ยังว่าง
    expect(worker.lines.find((l) => l.kind === "date")).toMatchObject({ value: null });
  });

  it("ข้อความจากข้อมูลถูก escape", () => {
    const html = signoffHtml([{ title: "<b>x</b>", lines: [{ kind: "text", text: "a & <i>" }] }]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; &lt;i&gt;");
  });
});

describe("กล่องไหนโชว์ · อยู่แผ่นไหน (แยกใบ)", () => {
  const split = (extra: object = {}) => normalizeWoColumns({
    sections: { summary: true, lines: true, detail: true, signature: true, split: true },
    signoff: { prep: "split" }, extras: { qc: true, note: true }, ...extra,
  });
  const sheetBoxes = (cols: WoPrintColumns) => woSectionDataList(buildWoHtmlData(QTY_CHANGED, null, cols), cols)
    .map((d) => (String(d.signoff_html).match(/sgn-head"><span>([^<]+)</g) ?? []).map((m) => m.replace(/.*<span>/, "").replace("<", "")));

  it("ค่าเริ่มต้น: เตรียม→ใบสรุป · ตัด→ใบบล็อกตัด · ช่าง+QC→ใบรายละเอียด", () => {
    expect(sheetBoxes(split())).toEqual([
      ["ผู้สั่งผลิต", "หัวหน้าอนุมัติ", "เตรียมวัตถุดิบ"],
      ["ตัด"],
      ["ช่างรับงาน", "QC ตรวจรับ"],
    ]);
    const docs = woSectionDataList(buildWoHtmlData(QTY_CHANGED, null, split()), split());
    expect(String(docs[2].wo_extras_html)).toContain("หมายเหตุถึงช่าง");
    expect(String(docs[0].wo_extras_html)).toBe("");
  });

  it("ซ่อนเฉพาะกล่องเตรียม · ย้ายกล่องช่างไปใบบล็อกตัด", () => {
    const cols = split({ signoff: { prep: "split", prep_show: false, place: { worker: { lines: true, detail: false } } } });
    expect(sheetBoxes(cols)).toEqual([["ผู้สั่งผลิต", "หัวหน้าอนุมัติ"], ["ตัด", "ช่างรับงาน"], ["QC ตรวจรับ"]]);
  });

  it("แผ่นที่เลือกไม่ได้พิมพ์ = ไปแผ่นสุดท้ายที่พิมพ์ (ไม่หายเงียบ)", () => {
    const cols = normalizeWoColumns({ sections: { summary: true, lines: true, detail: false, signature: true, split: true } });
    expect(woBoxSheets("worker", cols)).toEqual(["lines"]);
    expect(woBoxSheets("prepcut", cols)).toEqual(["summary", "lines"]);
    const html = buildReportHtmlMulti(buildWorkOrderTemplate(cols), woSectionDataList(buildWoHtmlData(NOT_DISPATCHED, null, cols), cols));
    expect(html.match(/ช่างรับงาน/g)).toHaveLength(2);   // กล่องว่าง 2 กล่อง อยู่ใบบล็อกตัดใบเดียว ไม่ซ้ำ
  });

  it("ใบเดียว (ไม่แยก) = ทุกกล่องที่โชว์อยู่ในใบเดียว ไม่สนตั้งค่าแผ่น", () => {
    const cols = normalizeWoColumns({ signoff: { place: { worker: { summary: false, lines: false, detail: false } } } });
    const docs = woSectionDataList(buildWoHtmlData(NOT_DISPATCHED, null, cols), cols);
    expect(docs).toHaveLength(1);
    expect(String(docs[0].signoff_html)).toContain("ช่างรับงาน");
  });
});

describe("ตารางบล็อกตัด: เฉพาะแถวที่มีกว้าง x ยาว", () => {
  // แบบเดียวกับใบจริงในรูปเจ้าของ: ซิป (ไม่มีขนาด) · แค่กว้าง · แค่ยาว · ครบกว้าง x ยาว 2 แถว
  const MIXED: MoDetail = {
    id: "m", mo_no: "MO-T", qty: 35, materials: [
      { component_sku: "ZIP-1", component_name: "ซิปไนล่อน", material_type: "ซิป", qty_per: 0.27, uom: "หลา" },
      { component_sku: "W-ONLY", component_name: "แถบกว้างอย่างเดียว", material_type: "ตัวเสริม", cut_width: 5, qty_per: 0.1, uom: "หลา" },
      { component_sku: "L-ONLY", component_name: "แถบยาวอย่างเดียว", material_type: "ตัวเสริม", cut_length: 30, qty_per: 0.1, uom: "หลา" },
      { component_sku: "FT-004", component_name: "ฟองน้ำ 4 มิล", material_type: "ตัวเสริม", cut_block_code: "C1-2-269", cut_width: 42, cut_length: 41, pieces: 1, qty_per: 0.18, uom: "Units" },
      { component_sku: "V465-2", component_name: "ผ้ากิงกิต", material_type: "ผ้า", cut_block_code: "C1-2-260", cut_width: 13, cut_length: 38, pieces: 1, qty_per: 0.05, uom: "หลา" },
    ],
  };
  const render = (cols: WoPrintColumns) => {
    const data = woSectionDataList(buildWoHtmlData(MIXED, null, cols), cols)[0];
    return buildReportHtml(buildWorkOrderTemplate(cols), data);
  };

  it("ปิดอยู่ (ค่าเริ่ม) = โชว์ครบทุกแถว", () => {
    const html = render(normalizeWoColumns(null));
    for (const c of ["ZIP-1", "W-ONLY", "L-ONLY", "FT-004", "V465-2"]) expect(html).toContain(c);
    expect(html).not.toContain("ไม่แสดง");
  });

  it("เปิด = เหลือเฉพาะกว้าง x ยาว · เรียงลำดับใหม่ · บอกจำนวนที่ซ่อน", () => {
    const cols = normalizeWoColumns({ lines_cut_only: true, sections: { summary: false } });
    const data = buildWoHtmlData(MIXED, null, cols);
    expect((data.lines as { code: string; idx: string }[]).map((l) => [l.idx, l.code])).toEqual([["1", "FT-004"], ["2", "V465-2"]]);   // เรียงตามชนิด: ตัวเสริม ก่อน ผ้า
    const html = render(cols);
    expect(html).not.toContain("ZIP-1");
    expect(html).not.toContain("W-ONLY");
    expect(html).not.toContain("L-ONLY");
    expect(html).toContain("ไม่แสดง 3 รายการที่ไม่มีขนาดตัด");
  });

  it("ใบที่ไม่มีแถวกว้าง x ยาวเลย = ข้อความแจ้งแทนตารางเปล่า", () => {
    const cols = normalizeWoColumns({ lines_cut_only: true });
    const noCut: MoDetail = { ...MIXED, materials: MIXED.materials!.slice(0, 3) };
    const html = buildReportHtml(buildWorkOrderTemplate(cols), woSectionDataList(buildWoHtmlData(noCut, null, cols), cols)[0]);
    expect(html).toContain("ใบนี้ไม่มีรายการที่มีขนาดตัด");
  });
});

describe("หัวใบ + ค่าที่บันทึกไว้", () => {
  it("ค่าเก่า (ไม่มี header/signoff/extras) ได้ค่าเริ่มต้น · ลำดับกล่องหัวซ่อมให้ครบ", () => {
    const n = normalizeWoColumns({ header: { order: ["meta", "meta", "bogus"], photo_mm: 999, show: { qr: false } } });
    expect(n.header!.order).toEqual(["meta", "photo", "product", "qty"]);
    expect(n.header!.photo_mm).toBe(60);
    expect(n.header!.show.qr).toBe(false);
    expect(n.header!.show.company).toBe(true);
    expect(n.signoff).toEqual(WO_DEFAULT_SIGNOFF);
    expect(n.extras).toEqual(WO_DEFAULT_EXTRAS);
  });

  it("ค่าเริ่มต้นได้หัวใบหน้าตาเดิม (คอลัมน์ 55mm 1.3fr 28mm 50mm)", () => {
    const tpl = buildWorkOrderTemplate(normalizeWoColumns(null));
    expect(tpl.custom_css).toContain("grid-template-columns: 55mm 1.3fr 28mm 50mm");
    expect(tpl.custom_css).toContain("grid-template-columns: 46mm 1.3fr 22mm 44mm");
    expect(tpl.header_html).toContain("{{mo_number}}");
    expect(tpl.footer_html).toBe("");
  });

  it("ปิดช่อง = ไม่อยู่ในใบ · จำนวนเดิมขึ้นเมื่อเคยแก้", () => {
    const cols: WoPrintColumns = normalizeWoColumns({ header: { show: { qr: false, company: false } } });
    const html = buildReportHtml(buildWorkOrderTemplate(cols), { ...buildWoHtmlData(QTY_CHANGED, null, cols), qr_html: "<i>QR</i>" });
    expect(html).not.toContain("<i>QR</i>");
    expect(html).not.toContain("หจก.ไอ.เอส.จี.");
    expect(html).toContain("เดิม 20<span class=\"qty-orig-why\">ของไม่พอ</span>");
    expect(html).toContain("ลงชื่อรับ-ส่งงาน");
  });

  it("บาร์โค้ดเส้น: เปิดอยู่ค่าเริ่ม · วางแถบล่างคู่กำหนดส่ง · ปิดได้แยกจาก QR", () => {
    const on = buildWorkOrderTemplate(normalizeWoColumns(null)).header_html;
    expect(on).toContain("{{{barcode_html}}}");
    expect(on).toContain('<div class="wo-barcode-text">{{mo_number}}</div>');
    expect(on).toContain("{{{qr_html}}}");
    const off = buildWorkOrderTemplate(normalizeWoColumns({ header: { show: { barcode: false } } })).header_html;
    expect(off).not.toContain("barcode_html");
    expect(off).toContain("{{{qr_html}}}");
    expect(off).toContain("กำหนดส่ง");
    // ปิดทั้งบาร์โค้ดและกำหนดส่ง = ไม่มีแถบล่าง
    const none = buildWorkOrderTemplate(normalizeWoColumns({ header: { show: { barcode: false, due: false } } })).header_html;
    expect(none).not.toContain("wo-due");
  });

  it("ขนาดหัวใบ: ปกติไม่ปล่อย CSS เพิ่ม · กะทัดรัด/เล็กสุดย่อตอนพิมพ์ · บรรทัดเดียว", () => {
    const css = (header: object) => buildWorkOrderTemplate(normalizeWoColumns({ header })).custom_css ?? "";
    expect(css({})).not.toContain("doc-head-inline");
    expect(css({ size: "compact" })).toContain("padding-top: 6mm !important");
    expect(css({ size: "tight" })).toContain("padding-top: 5mm !important");
    expect(normalizeWoColumns({ header: { size: "huge" } }).header!.size).toBe("normal");
    const inline = buildWorkOrderTemplate(normalizeWoColumns({ header: { title_inline: true } })).header_html;
    expect(inline).toContain('<div class="doc-head-inline"><div class="doc-title">ใบสั่งงานผลิต</div><div class="company-name">');
    expect(css({ title_inline: true })).toContain(".doc-head-inline {");
  });

  it("ปิด 'กล่องลงชื่อ' ในส่วนที่จะพิมพ์ = ไม่มีกล่องเลย", () => {
    const cols = normalizeWoColumns({ sections: { signature: false }, extras: { returns: true } });
    const data = buildWoHtmlData(NOT_DISPATCHED, null, cols);
    expect(data.signoff_html).toBe("");
    expect(data.wo_extras_html).toBe("");
  });

  // เขียนไฟล์ HTML ไว้เปิดดูด้วยตา: WO_PREVIEW_DIR=<โฟลเดอร์> npx vitest run lib/__tests__/work-order-signoff.test.ts
  it.skipIf(!process.env.WO_PREVIEW_DIR)("เขียนตัวอย่างใบพิมพ์", () => {
    const all = normalizeWoColumns({ extras: { qc: true, returns: true, note: true } });
    const cases: [string, MoDetail, WoPrintColumns][] = [
      ["a-default", NOT_DISPATCHED, normalizeWoColumns(null)],
      ["b-two-craftsmen", TWO_CRAFTSMEN, all],
      ["c-three-wos-top-fill", THREE_WOS, { ...all, signoff: { ...WO_DEFAULT_SIGNOFF, pos: "top", date: "fill", prep: "split" } }],
      ["d-qty-changed", QTY_CHANGED, { ...WO_DEFAULT_COLUMNS, header: { ...normalizeWoColumns(null).header!, photo_mm: 30, order: ["meta", "product", "qty", "photo"] } }],
    ];
    for (const [name, mo, cols] of cases) {
      const html = buildReportHtml(buildWorkOrderTemplate(cols), { ...buildWoHtmlData(mo, null, cols), qr_html: "" });
      writeFileSync(`${process.env.WO_PREVIEW_DIR}/${name}.html`, html, "utf8");
    }
    // ขนาดหัวใบ 3 แบบ (รูป/บรรทัดเดียวตามปุ่มในแผง)
    for (const [size, photo_mm, title_inline] of [["normal", 46, false], ["compact", 34, true], ["tight", 26, true]] as const) {
      const cols = normalizeWoColumns({ header: { size, photo_mm, title_inline } });
      const html = buildReportHtml(buildWorkOrderTemplate(cols), { ...buildWoHtmlData(NOT_DISPATCHED, null, cols), qr_html: "" });
      writeFileSync(`${process.env.WO_PREVIEW_DIR}/g-size-${size}.html`, html, "utf8");
    }
    // แยกใบ 3 แผ่น — กล่องกระจายตามแผ่น
    const split = normalizeWoColumns({ sections: { summary: true, lines: true, detail: true, signature: true, split: true }, signoff: { prep: "split" }, extras: { qc: true, note: true } });
    const docs = woSectionDataList(buildWoHtmlData(TWO_CRAFTSMEN, null, split), split);
    writeFileSync(`${process.env.WO_PREVIEW_DIR}/e-split.html`, buildReportHtmlMulti(buildWorkOrderTemplate(split), docs), "utf8");
  });
});
