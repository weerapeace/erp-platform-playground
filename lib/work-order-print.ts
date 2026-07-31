/**
 * ของกลาง — สร้างข้อมูล/เทมเพลตสำหรับ "พิมพ์ใบสั่งงานผลิต" (work order)
 * ใช้ร่วมกัน: หน้าพิมพ์เดี่ยว /print/work-order/[id] และ พิมพ์รวม /print/work-order?ids=...
 * เดิมโค้ดนี้ฝังอยู่ในหน้าพิมพ์เดี่ยว — ย้ายมาเป็นของกลางเพื่อไม่ให้เขียนซ้ำ
 */
import type { ReportTemplate } from "@/lib/template";

export const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  confirmed: "ยืนยันแล้ว",
  in_progress: "กำลังผลิต",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export type MoMat = {
  component_sku?: string | null;
  component_name?: string | null;
  material_type?: string | null;
  cut_block_code?: string | null;
  cut_width?: number | null;
  cut_length?: number | null;
  pieces?: number | null;
  qty_per?: number | null;
  uom?: string | null;
  size_label?: string | null;   // กลุ่ม C: บล็อกนี้ของไซส์ไหน (null = ใช้ทุกไซส์)
  image_url?: string | null;    // รูปวัตถุดิบ (มาจาก /api/mo/[id] — skus_v2.cover_image_r2_key)
};
export type MoSummary = {
  component_sku?: string | null;
  component_name?: string | null;
  material_type?: string | null;
  qty_per?: number | null;
  uom?: string | null;
  image_url?: string | null;
};
export type ProductSpecRow = { key: string; label: string; value: string; order?: number };
export type ProductSpecGroup = { label: string; items: { code: string; name: string; count: number }[] };
export type ProductSpec = {
  image_url?: string | null;     // รูปหลัก (ระดับบนสุด ไม่ผูกกับ parent)
  parent?: {
    name?: string | null;
    family?: string | null;
    size_summary?: string | null;
    work_instruction_notes?: string | null;
    image_url?: string | null;
  } | null;
  legacy?: ProductSpecRow[];
  model_attrs?: ProductSpecRow[];
  sku_attrs?: ProductSpecRow[];
  bom_materials?: ProductSpecGroup[];
};
export type MoDetail = {
  id: string;
  mo_no: string;
  product_sku?: string | null;
  product_name?: string | null;
  qty?: number | null;
  due_date?: string | null;
  status?: string | null;
  bom_version?: string | null;
  note?: string | null;
  created_at?: string | null;
  materials?: MoMat[];
  summary?: MoSummary[];
  size_breakdown?: { label: string; qty: number }[] | null;   // กลุ่ม C: จำนวนต่อไซส์
};

/**
 * สร้าง QR Code เป็น data-URL (offline ไม่ต้องต่อเน็ต) → คืน <img> สำหรับฝังในเทมเพลต
 * โหลด lib qrcode แบบ dynamic เฉพาะตอนเรียก (ไม่กระทบ bundle หลัก)
 */
export async function woQrHtml(url: string): Promise<string> {
  if (!url) return "";
  try {
    const QR = (await import("qrcode")).default;
    const dataUrl = await QR.toDataURL(url, { margin: 0, width: 200, errorCorrectionLevel: "M" });
    return `<img class="wo-qr" src="${dataUrl}" alt="QR ใบสั่งงาน" />`;
  } catch { return ""; }
}

export const thaiDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const numTh = (n: number) => Number(n || 0).toLocaleString("th-TH");
const text = (value: unknown) => String(value ?? "").trim();
const dash = (value: unknown) => text(value) || "-";
const esc = (value: unknown) => text(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function photoHtml(url?: string | null) {
  return url ? `<img src="${esc(url)}" alt="รูปสินค้า" />` : `<div class="photo-empty">ไม่มีรูป</div>`;
}

function matImgHtml(url?: string | null) {
  return url ? `<img class="mat-img" src="${esc(url)}" alt="" />` : "";
}

/* ─────────────── ตั้งค่าคอลัมน์ตารางวัตถุดิบ (ของกลาง) ───────────────
 * เก็บเป็นค่ากลางของระบบใน ui_config key "wo_print_columns" → ทุกคนพิมพ์ได้หน้าตาเดียวกัน
 * ผู้ใช้ปรับได้จากปุ่ม "⚙ ตั้งค่าตาราง" ในหน้าพิมพ์ (เปิด/ปิดคอลัมน์ + ความกว้าง %)
 */
export type WoColumn = { key: string; label: string; width: number; show: boolean };
export type WoPrintColumns = { summary: WoColumn[]; lines: WoColumn[] };

export const WO_DEFAULT_COLUMNS: WoPrintColumns = {
  summary: [
    { key: "image", label: "รูป", width: 12, show: true },
    { key: "material_type", label: "ชนิด", width: 12, show: true },
    { key: "code", label: "รหัส", width: 20, show: true },
    { key: "component_name", label: "วัตถุดิบ", width: 34, show: true },
    { key: "required", label: "รวมต้องใช้", width: 12, show: true },
    { key: "uom", label: "หน่วย", width: 10, show: true },
  ],
  lines: [
    { key: "image", label: "รูป", width: 8, show: true },
    { key: "idx", label: "ลำดับ", width: 5, show: true },
    { key: "code", label: "รหัส", width: 13, show: true },
    { key: "component_name", label: "วัตถุดิบ", width: 19, show: true },
    { key: "material_type", label: "ชนิด", width: 8, show: true },
    { key: "cut_block_code", label: "บล็อกตัด", width: 8, show: true },
    { key: "cut_size", label: "กว้าง x ยาว", width: 11, show: true },
    { key: "total_pieces", label: "ยอดรวมชิ้น", width: 10, show: true },
    { key: "required", label: "รวมต้องใช้", width: 10, show: true },
    { key: "uom", label: "หน่วย", width: 8, show: true },
  ],
};

// เนื้อในช่องของแต่ละคอลัมน์ (คลาส + ตัวแปร Mustache) — ที่เดียว ใช้ทั้ง 2 ตาราง
const CELL: Record<string, { cls: string; body: string }> = {
  image: { cls: "img-cell", body: "{{{image_html}}}" },
  idx: { cls: "text-center", body: "{{idx}}" },
  code: { cls: "code-cell", body: "{{code}}" },
  component_name: { cls: "", body: "{{component_name}}" },
  material_type: { cls: "", body: "{{material_type}}" },
  cut_block_code: { cls: "text-center", body: "{{cut_block_code}}" },
  cut_size: { cls: "text-center", body: "{{cut_size}}" },
  total_pieces: { cls: "text-right", body: "{{total_pieces}}" },
  required: { cls: "text-right", body: "{{required}}" },
  uom: { cls: "text-center", body: "{{uom}}" },
};
// ตารางสรุปจัดชนิดกลาง / ลำดับไม่มี — override เฉพาะที่ต่าง
const SUMMARY_CELL_OVERRIDE: Record<string, Partial<{ cls: string }>> = { material_type: { cls: "" }, uom: { cls: "text-center" } };

/** รวมค่าที่ผู้ใช้บันทึกไว้เข้ากับค่าเริ่มต้น — คอลัมน์ใหม่ที่เพิ่มทีหลังจะไม่หาย, คีย์แปลกปลอมถูกทิ้ง */
export function normalizeWoColumns(raw: unknown): WoPrintColumns {
  const pick = (defs: WoColumn[], saved: unknown): WoColumn[] => {
    const map = new Map<string, Partial<WoColumn>>();
    if (Array.isArray(saved)) {
      for (const s of saved) {
        const k = typeof s === "object" && s !== null ? String((s as { key?: unknown }).key ?? "") : "";
        if (k) map.set(k, s as Partial<WoColumn>);
      }
    }
    const merged = defs.map((d) => {
      const s = map.get(d.key);
      const w = Number(s?.width);
      return { ...d, width: Number.isFinite(w) && w > 0 ? Math.min(80, w) : d.width, show: s?.show === undefined ? d.show : !!s.show };
    });
    // เรียงตามลำดับที่บันทึกไว้ (ถ้ามี) — คอลัมน์ที่ยังไม่เคยบันทึกไปต่อท้าย
    const order = [...map.keys()];
    return merged.sort((a, b) => {
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  };
  const obj = (raw ?? {}) as { summary?: unknown; lines?: unknown };
  return { summary: pick(WO_DEFAULT_COLUMNS.summary, obj.summary), lines: pick(WO_DEFAULT_COLUMNS.lines, obj.lines) };
}

const colsHtml = (cols: WoColumn[], summary: boolean) => {
  const shown = cols.filter((c) => c.show);
  const use = shown.length > 0 ? shown : cols;   // ปิดหมด = กันตารางว่าง ให้กลับไปโชว์ทั้งหมด
  const total = use.reduce((n, c) => n + c.width, 0) || 1;
  const th = use.map((c) => `<th style="width:${r2((c.width / total) * 100)}%">${esc(c.label)}</th>`).join("\n        ");
  const td = use.map((c) => {
    const base = CELL[c.key] ?? { cls: "", body: "" };
    const cls = summary ? (SUMMARY_CELL_OVERRIDE[c.key]?.cls ?? base.cls) : base.cls;
    return `<td${cls ? ` class="${cls}"` : ""}>${base.body}</td>`;
  }).join("\n        ");
  return { th, td };
};

function specLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    materials: "วัตถุดิบ", lining: "ซับใน", zipper: "ซิป", strap: "สาย", thread: "ด้าย", spares: "อะไหล่", logo: "โลโก้/พิมพ์",
  };
  return labels[key] ?? fallback;
}

export function woScalars(mo: MoDetail, spec: ProductSpec | null): Record<string, string> {
  const size = spec?.parent?.size_summary || "-";
  const note = mo.note || spec?.parent?.work_instruction_notes || "-";
  return {
    mo_number: mo.mo_no,
    status_label: STATUS_LABELS[mo.status ?? ""] ?? (mo.status ?? "-"),
    created_at_th: thaiDate(mo.created_at),
    due_date_th: thaiDate(mo.due_date),
    product_sku: mo.product_sku ?? "",
    product_name: spec?.parent?.name || mo.product_name || mo.product_sku || "",
    product_size: size,
    qty: numTh(Number(mo.qty) || 0),
    bom_version: mo.bom_version || "-",
    note,
  };
}

// เรียงวัตถุดิบแบบเดียวกันทุกที่ (ตาราง HTML + ตาราง pdfme) — แยกออกมาให้ zip รูปเข้าแถวได้ตรงกัน
function sortedMaterials(mo: MoDetail): MoMat[] {
  return [...(mo.materials ?? [])].sort((a, b) => {
    const byType = dash(a.material_type).localeCompare(dash(b.material_type), "th");
    if (byType !== 0) return byType;
    const byName = dash(a.component_name ?? a.component_sku).localeCompare(dash(b.component_name ?? b.component_sku), "th");
    if (byName !== 0) return byName;
    return dash(a.cut_block_code).localeCompare(dash(b.cut_block_code), "th", { numeric: true });
  });
}

export function woTableRows(mo: MoDetail): string[][] {
  const qty = Number(mo.qty) || 0;
  return sortedMaterials(mo).map((mat, index) => {
    const width = Number(mat.cut_width) || 0;
    const length = Number(mat.cut_length) || 0;
    const pieces = Number(mat.pieces) || 0;
    const qtyPer = Number(mat.qty_per) || 0;
    return [
      String(index + 1),
      mat.component_name ?? "",
      mat.material_type ?? "",
      mat.cut_block_code || "-",
      width && length ? `${width} x ${length}` : "-",
      pieces ? numTh(pieces * qty) : "-",
      numTh(r2(qtyPer * qty)),
      mat.uom ?? "",
      mat.component_sku ?? "",   // [8] รหัสวัตถุดิบ (ต่อท้าย กัน pdfme columns เดิมเลื่อน)
    ];
  });
}

function materialSummaryRows(mo: MoDetail) {
  const qty = Number(mo.qty) || 0;
  const source = (mo.summary?.length ? mo.summary : mo.materials) ?? [];
  const grouped = new Map<string, { material_type: string; code: string; component_name: string; required: number; uom: string; image_url: string | null }>();
  source.forEach((row) => {
    const materialType = dash(row.material_type);
    const componentName = dash(row.component_name ?? row.component_sku);
    const code = dash(row.component_sku);
    const uom = dash(row.uom);
    const key = `${materialType}|${componentName}|${uom}`;
    const prev = grouped.get(key) ?? { material_type: materialType, code, component_name: componentName, required: 0, uom, image_url: row.image_url ?? null };
    prev.required += (Number(row.qty_per) || 0) * qty;
    if (!prev.image_url && row.image_url) prev.image_url = row.image_url;   // แถวแรกที่มีรูปชนะ
    grouped.set(key, prev);
  });
  return [...grouped.values()]
    .sort((a, b) => `${a.material_type}${a.component_name}`.localeCompare(`${b.material_type}${b.component_name}`, "th"))
    .map((row) => ({ ...row, required: numTh(r2(row.required)), image_html: matImgHtml(row.image_url) }));
}

function productSpecRows(spec: ProductSpec | null) {
  const rows: { label: string; value: string; order: number }[] = [];
  (spec?.legacy ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: specLabel(row.key, row.label), value, order: row.order ?? index });
  });
  (spec?.model_attrs ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: row.label, value, order: 100 + (row.order ?? index) });
  });
  (spec?.sku_attrs ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: row.label, value, order: 200 + (row.order ?? index) });
  });
  (spec?.bom_materials ?? []).forEach((group, index) => {
    const value = group.items.map((item) => `${item.name}${item.count > 1 ? ` (${item.count} บล็อก)` : ""}`).join(", ");
    if (value) rows.push({ label: group.label, value, order: 300 + index });
  });
  return rows.sort((a, b) => a.order - b.order).slice(0, 12);
}

export function buildWoHtmlData(mo: MoDetail, spec: ProductSpec | null): Record<string, unknown> {
  const mats = sortedMaterials(mo);   // ลำดับเดียวกับ woTableRows → zip รูปเข้าแถวได้ตรงตัว
  const lines = woTableRows(mo).map((row, i) => ({
    idx: row[0], component_name: row[1], material_type: row[2], cut_block_code: row[3],
    cut_size: row[4], total_pieces: row[5], required: row[6], uom: row[7], code: row[8] || "-",
    image_html: matImgHtml(mats[i]?.image_url),
  }));
  return {
    ...woScalars(mo, spec),
    product_image_html: photoHtml(spec?.image_url ?? spec?.parent?.image_url),
    material_summary: materialSummaryRows(mo),
    product_spec_rows: productSpecRows(spec),
    lines,
  };
}

// เนื้อเอกสารส่วนตาราง — สร้างจาก "ตั้งค่าคอลัมน์" (ที่เดียว ไม่มีตารางซ้ำในไฟล์)
function woBodyHtml(cols: WoPrintColumns): string {
  const s = colsHtml(cols.summary, true);
  const l = colsHtml(cols.lines, false);
  return `<section class="summary-section">
  <div class="section-title">สรุปวัตถุดิบที่ต้องใช้</div>
  <table class="summary-table">
    <thead>
      <tr>
        ${s.th}
      </tr>
    </thead>
    <tbody>
      {{#material_summary}}
      <tr>
        ${s.td}
      </tr>
      {{/material_summary}}
    </tbody>
  </table>
</section>

<section>
  <div class="section-title">รายการวัตถุดิบ / บล็อกตัด</div>
  <table class="doc-table">
    <thead>
      <tr>
        ${l.th}
      </tr>
    </thead>
    <tbody>
      {{#lines}}
      <tr>
        ${l.td}
      </tr>
      {{/lines}}
    </tbody>
  </table>
</section>

<section class="product-detail">
  <div class="detail-photo">{{{product_image_html}}}</div>
  <div class="detail-main">
    <div class="detail-title">{{product_name}}</div>
    <div class="detail-sub">ขนาด: {{product_size}}</div>
    <table class="detail-table">
      {{#product_spec_rows}}
      <tr>
        <td class="detail-label">{{label}}</td>
        <td>{{value}}</td>
      </tr>
      {{/product_spec_rows}}
    </table>
    <div class="note-box"><span class="label">วิธีทำ / หมายเหตุ:</span> {{note}}</div>
  </div>
</section>`;
}

/** สร้างเทมเพลตใบสั่งงานผลิตตาม "ตั้งค่าคอลัมน์" (ไม่ส่ง = ใช้ค่าเริ่มต้น) */
export function buildWorkOrderTemplate(columns?: WoPrintColumns | null): ReportTemplate {
  return { ...WORKORDER_PRINT_TEMPLATE, body_html: woBodyHtml(columns ?? WO_DEFAULT_COLUMNS) };
}

export const WORKORDER_PRINT_TEMPLATE: ReportTemplate = {
  paper_size: "A4",
  orientation: "portrait",
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div>
</div>
<div class="doc-title">ใบสั่งงานผลิต</div>
<section class="wo-hero">
  <div class="wo-photo">{{{product_image_html}}}</div>
  <div class="wo-product">
    <div class="muted">สินค้า</div>
    <div class="product-name">{{product_name}}</div>
    <div class="product-code">{{product_sku}}</div>
    <div class="product-size">{{product_size}}</div>
  </div>
  <div class="wo-qty">
    <div class="muted">จำนวนผลิต</div>
    <div class="qty-big">{{qty}}</div>
    <div>ชิ้น · สูตร {{bom_version}}</div>
  </div>
  <div class="wo-meta">
    <div class="wo-meta-text">
      <div><span class="label">เลขที่:</span> {{mo_number}}</div>
      <div><span class="label">วันที่สั่ง:</span> {{created_at_th}}</div>
      <div><span class="label">กำหนดส่ง:</span> {{due_date_th}}</div>
      <div><span class="label">สถานะ:</span> {{status_label}}</div>
    </div>
    <div class="wo-qr-box">{{{qr_html}}}</div>
  </div>
</section>`,
  body_html: woBodyHtml(WO_DEFAULT_COLUMNS),
  footer_html: `<section class="signatures">
  <div class="signature">ผู้สั่งผลิต</div>
  <div class="signature">ผู้รับงานผลิต</div>
</section>`,
  custom_css: `
.doc { font-size: 10.5px; color: #111827; }
.doc-header { text-align: center; line-height: 1.2; margin-bottom: 4mm; }
.company-name { font-size: 12px; font-weight: 700; color: #475569; }
.doc-title { text-align: center; font-size: 24px; font-weight: 800; margin: 3mm 0 5mm; }
.muted { color: #64748b; font-size: 10px; }
.label { font-weight: 700; }
.wo-hero { display: grid; grid-template-columns: 55mm 1.3fr 28mm 50mm; gap: 3mm; border: 1px solid #111; padding: 3mm; margin-bottom: 4mm; align-items: center; }
.detail-photo { border: 1px solid #cbd5e1; background: #f8fafc; display: grid; place-items: center; overflow: hidden; }
.detail-photo img { width: 100%; height: 100%; object-fit: contain; }
/* รูปหัวเอกสาร: เห็นเต็มทั้งใบ ไม่ตัด — กรอบหุ้มพอดีตัวรูป (คงสัดส่วน ย่อให้พอดีพื้นที่) */
.wo-photo { display: flex; align-items: center; justify-content: center; }
.wo-photo img { display: block; max-width: 100%; max-height: 52mm; width: auto; height: auto; border: 1px solid #cbd5e1; background: #fff; }
.photo-empty { color: #94a3b8; font-size: 10px; text-align: center; }
.product-name { font-size: 13px; font-weight: 300; font-style: italic; line-height: 1.3; color: #334155; }
.product-code { margin-top: 1.5mm; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 19px; font-weight: 800; letter-spacing: 0.5px; color: #0f172a; }
.product-size { margin-top: 1mm; color: #334155; }
.wo-qty { text-align: center; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 1mm 2mm; }
.qty-big { font-size: 30px; font-weight: 900; line-height: 1; }
.wo-meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; line-height: 1.55; }
.wo-qr-box { flex-shrink: 0; }
.wo-qr { width: 18mm; height: 18mm; display: block; }
.section-title { font-size: 12px; font-weight: 800; margin: 3mm 0 1.5mm; }
.summary-section { page-break-inside: avoid; break-inside: avoid; }
.summary-table, .doc-table, .detail-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.summary-table th, .summary-table td, .doc-table th, .doc-table td { border: 1px solid #111; padding: 1.2mm 1mm; vertical-align: middle; }
.summary-table th, .doc-table th { text-align: center; font-weight: 800; background: #f1f5f9; }
.summary-table { margin-bottom: 3mm; }
.text-center { text-align: center; }
.text-right { text-align: right; }
/* ช่องรูปวัตถุดิบ — เห็นเต็มใบ ไม่ตัด · ไม่มีรูป = เว้นว่าง ไม่ดันความสูงแถว */
.img-cell { text-align: center; padding: 0.6mm !important; }
.mat-img { display: inline-block; max-width: 100%; max-height: 13mm; width: auto; height: auto; object-fit: contain; }
.code-cell { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 8.5px; line-height: 1.2; color: #334155; white-space: normal; word-break: break-all; overflow-wrap: anywhere; padding-left: 1mm !important; padding-right: 1mm !important; }
.product-detail { margin-top: 5mm; display: grid; grid-template-columns: 28mm 1fr; gap: 3mm; border-top: 1px solid #cbd5e1; padding-top: 3mm; page-break-inside: avoid; break-inside: avoid; }
.detail-photo { width: 28mm; height: 24mm; }
.detail-title { font-size: 12px; font-weight: 800; margin-bottom: 1mm; }
.detail-sub { color: #64748b; margin-bottom: 1.5mm; }
.detail-table td { border: 0; border-bottom: 1px solid #e2e8f0; padding: 1mm 0; vertical-align: top; }
.detail-label { width: 28mm; color: #64748b; font-weight: 700; }
.note-box { margin-top: 2mm; min-height: 10mm; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36mm; margin-top: 18mm; padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.signature { text-align: center; border-top: 1px solid #111; padding-top: 2mm; font-weight: 700; }
@media print {
  .doc { padding: 8mm 9mm !important; font-size: 9.2px; }
  .doc-header { margin-bottom: 1.5mm; }
  .company-name { font-size: 10px; }
  .doc-title { font-size: 20px; margin: 1.5mm 0 2.5mm; }
  .wo-hero { grid-template-columns: 46mm 1.3fr 22mm 44mm; gap: 2mm; padding: 2mm; margin-bottom: 2mm; }
  .wo-photo img { max-height: 44mm; }
  .wo-qr { width: 15mm; height: 15mm; }
  .product-name { font-size: 11px; }
  .product-code { font-size: 16px; margin-top: 1mm; }
  .product-size { margin-top: 0.5mm; }
  .qty-big { font-size: 22px; }
  .section-title { font-size: 10px; margin: 1.5mm 0 1mm; }
  .summary-table th, .summary-table td, .doc-table th, .doc-table td { padding: 0.6mm 0.7mm; }
  .code-cell { font-size: 7.5px; padding-left: 0.6mm !important; padding-right: 0.6mm !important; }
  .img-cell { padding: 0.3mm !important; }
  .mat-img { max-height: 10mm; }
  .summary-table { margin-bottom: 1.5mm; }
  .product-detail { margin-top: 2mm; gap: 2mm; grid-template-columns: 22mm 1fr; padding-top: 2mm; }
  .detail-photo { width: 22mm; height: 17mm; }
  .detail-title { font-size: 10px; margin-bottom: 0.5mm; }
  .detail-sub { margin-bottom: 0.5mm; }
  .detail-table td { padding: 0.35mm 0; line-height: 1.25; }
  .detail-label { width: 24mm; }
  .note-box { margin-top: 0.8mm; min-height: 0; }
  .signatures { margin-top: 7mm; padding: 0 22mm; gap: 28mm; }
  .signature { padding-top: 1mm; }
}
`,
};
