/**
 * 📋 สรุปงาน (ใบงานออกแบบ) — ของกลาง · ฟังก์ชันล้วน (ใช้ได้ทั้งหน้าจอและ API)
 * ชนิดข้อมูล · คอลัมน์ที่เลือกโชว์ได้ · ตรวจค่าก่อนบันทึก · แตก "1 ใบงาน → หลายแถวตามรูป" · หน้าตาสรุป (HTML ชุดเดียว)
 * หน้าตาเดียวใช้ทั้ง: ตัวอย่างบนจอ (iframe) · พิมพ์/PDF · แปลงเป็นรูป (lib/html-to-png) — แก้ที่นี่เปลี่ยนทุกที่
 * ฉบับลูกค้า: ตัดคอลัมน์ภายในอัตโนมัติ (ไม่ขยับกี่วัน / โน้ตภายใน / รายละเอียด) · ไม่มีต้นทุนในสรุปนี้เลย
 * doc: docs/design-sheet-summary.md
 */

export type SummaryAudience = "internal" | "customer";

export type SummaryItem = {
  sheet_id: string;
  /** รูปที่เลือก (ลิงก์ในระบบ /api/r2-image?key=…) เรียงตามลำดับที่กดเลือก */
  images: string[];
  /** true = แยก 1 แถวต่อรูป (เช่น กระเป๋า 3 ใบในงานเดียว) */
  split: boolean;
  /** ชื่อที่โชว์ — split: ต่อรูป · ไม่ split: [0] = ชื่อแทนชื่อใบงาน (ว่าง = ใช้ชื่อใบงาน) */
  labels: string[];
  /** หมายเหตุ (โชว์ได้ทั้ง 2 ฉบับ) — split: ต่อรูป · ไม่ split: [0] */
  notes: string[];
};

export type SummaryDoc = {
  title: string;
  audience: SummaryAudience;
  columns: string[];
  items: SummaryItem[];
  note: string;
};

export type SavedSummary = SummaryDoc & {
  id: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type SummaryListItem = { id: string; title: string; audience: SummaryAudience; item_count: number; updated_at: string; created_by_name: string | null };

/** ข้อมูลใบงานที่ใช้วาดสรุป (ดึงสดตอนเปิด) */
export type SummarySheetInfo = {
  id: string; code: string; name: string;
  brand_name: string | null; brand_color: string | null;
  status: string; status_label: string; status_color: string; closed: boolean;
  deadline: string | null; updated_at: string;
  note: string | null; detail_excerpt: string | null;
};

// ---- คอลัมน์ที่เลือกโชว์ได้ ----
export const SUMMARY_COLUMNS: { key: string; label: string; internalOnly?: boolean; hint?: string }[] = [
  { key: "image",     label: "รูป" },
  { key: "code",      label: "เลขที่" },
  { key: "name",      label: "ชื่องาน" },
  { key: "brand",     label: "แบรนด์" },
  { key: "status",    label: "สถานะ" },
  { key: "deadline",  label: "กำหนดส่ง" },
  { key: "row_note",  label: "หมายเหตุ", hint: "พิมพ์เองต่อแถวในป๊อปนี้" },
  { key: "stale",     label: "ไม่ขยับกี่วัน", internalOnly: true },
  { key: "sheet_note", label: "โน้ตภายใน", internalOnly: true, hint: "โน้ตจากใบงาน" },
  { key: "detail",    label: "รายละเอียดงาน", internalOnly: true },
];
const COL_KEYS = new Set(SUMMARY_COLUMNS.map((c) => c.key));
const INTERNAL_ONLY = new Set(SUMMARY_COLUMNS.filter((c) => c.internalOnly).map((c) => c.key));
export const DEFAULT_SUMMARY_COLUMNS: Record<SummaryAudience, string[]> = {
  internal: ["image", "code", "name", "brand", "status", "deadline", "stale", "row_note"],
  customer: ["image", "name", "brand", "deadline", "row_note"],
};
export const AUDIENCE_LABEL: Record<SummaryAudience, string> = { internal: "ฉบับภายใน", customer: "ฉบับลูกค้า" };

/** คอลัมน์ที่โชว์จริง (ฉบับลูกค้าตัดคอลัมน์ภายในเสมอ) เรียงตาม SUMMARY_COLUMNS */
export function visibleColumns(doc: Pick<SummaryDoc, "audience" | "columns">) {
  const want = new Set(doc.columns);
  return SUMMARY_COLUMNS.filter((c) => want.has(c.key) && !(doc.audience === "customer" && c.internalOnly));
}

// ---- ตรวจค่าก่อนบันทึก (ใช้ทั้งหน้าจอและ API) ----
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isImageUrl = (u: unknown): u is string => typeof u === "string" && u.startsWith("/api/r2-image?key=") && u.length < 600;
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function normalizeSummaryDoc(raw: unknown): { value: SummaryDoc } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = clip(r.title, 120);
  if (!title) return { error: "ตั้งชื่อสรุปก่อน เช่น สรุปส่งคุณเต้ง 21 ต.ค." };
  const audience: SummaryAudience = r.audience === "customer" ? "customer" : "internal";
  const columns = Array.isArray(r.columns) ? [...new Set(r.columns.filter((c): c is string => typeof c === "string" && COL_KEYS.has(c)))] : [];
  if (columns.length === 0) return { error: "เลือกข้อมูลที่จะโชว์อย่างน้อย 1 อย่าง" };
  const rawItems = Array.isArray(r.items) ? r.items : [];
  if (rawItems.length === 0) return { error: "ยังไม่มีใบงานในสรุป" };
  if (rawItems.length > 100) return { error: "ใบงานในสรุปเดียวมากเกินไป (ไม่เกิน 100 ใบ)" };
  const seen = new Set<string>();
  const items: SummaryItem[] = [];
  for (const x of rawItems) {
    const o = (x ?? {}) as Record<string, unknown>;
    const sheet_id = String(o.sheet_id ?? "");
    if (!UUID_RE.test(sheet_id) || seen.has(sheet_id)) continue;
    seen.add(sheet_id);
    const images = Array.isArray(o.images) ? [...new Set(o.images.filter(isImageUrl))].slice(0, 12) : [];
    const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, 12).map((s) => clip(s, n)) : []);
    items.push({ sheet_id, images, split: o.split === true && images.length >= 2, labels: strs(o.labels, 120), notes: strs(o.notes, 300) });
  }
  if (items.length === 0) return { error: "ยังไม่มีใบงานในสรุป" };
  return { value: { title, audience, columns, items, note: clip(r.note, 600) } };
}

// ---- แตกเป็นแถว ----
export type SummaryRow = { key: string; sheet: SummarySheetInfo | null; sheetId: string; images: string[]; title: string; note: string };

export function expandRows(doc: Pick<SummaryDoc, "items">, sheets: Map<string, SummarySheetInfo>): SummaryRow[] {
  const rows: SummaryRow[] = [];
  for (const it of doc.items) {
    const sheet = sheets.get(it.sheet_id) ?? null;
    const baseName = sheet?.name ?? "(ไม่พบใบงาน)";
    if (it.split && it.images.length >= 2) {
      it.images.forEach((img, i) => {
        const label = (it.labels[i] ?? "").trim() || `ชิ้นที่ ${i + 1}`;
        rows.push({ key: `${it.sheet_id}:${i}`, sheet, sheetId: it.sheet_id, images: [img], title: `${baseName} — ${label}`, note: (it.notes[i] ?? "").trim() });
      });
    } else {
      rows.push({ key: it.sheet_id, sheet, sheetId: it.sheet_id, images: it.images, title: (it.labels[0] ?? "").trim() || baseName, note: (it.notes[0] ?? "").trim() });
    }
  }
  return rows;
}

// ---- หน้าตาสรุป (HTML + style ในบรรทัด → ใช้ได้ทั้ง iframe / พิมพ์ / แปลงเป็นรูป) ----
const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#94a3b8");
const thDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
const thShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const todayTH = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const staleDays = (updatedAt: string) => {
  const d = new Date(new Date(updatedAt).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((new Date(`${todayTH()}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / 86400000));
};
/** ขอรูปย่อจาก proxy (?w=) ให้เบา */
const thumb = (url: string, w: number) => (url.startsWith("/api/r2-image?") && !/[?&]w=/.test(url) ? `${url}&w=${w}` : url);

export const SUMMARY_FONT = "'Sarabun','Leelawadee UI','Segoe UI',Tahoma,Arial,sans-serif";

/** เนื้อสรุป (div เดียว) — ใช้ทำรูป (ไม่ต้องมี <html>) */
export function renderSummaryBody(doc: SummaryDoc, sheets: Map<string, SummarySheetInfo>, now = new Date()): string {
  const cols = visibleColumns(doc);
  const rows = expandRows(doc, sheets);
  const customer = doc.audience === "customer";
  const imgCol = cols.some((c) => c.key === "image");
  const textCols = cols.filter((c) => c.key !== "image");

  const cell = (row: SummaryRow, key: string): string => {
    const s = row.sheet;
    switch (key) {
      case "code": return esc(s?.code ?? "—");
      case "name": return `<b style="color:#0f172a;">${esc(row.title)}</b>${!customer && s?.closed ? ` <span style="font-size:11px;color:#94a3b8;">(ปิดงานแล้ว)</span>` : ""}`;
      case "brand": return s?.brand_name ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${safeColor(s.brand_color)};margin-right:5px;"></span>${esc(s.brand_name)}` : "—";
      case "status": return s ? `<span style="display:inline-block;white-space:nowrap;padding:2px 8px;border-radius:999px;font-size:11px;background:${safeColor(s.status_color)}1f;color:${safeColor(s.status_color)};">${esc(s.status_label)}</span>` : "—";
      case "deadline": return s?.deadline ? `<span style="white-space:nowrap;">${esc(thShort(s.deadline))}</span>` : "—";
      case "row_note": return row.note ? esc(row.note) : "";
      case "stale": { if (!s) return "—"; const d = staleDays(s.updated_at); return d === 0 ? "วันนี้" : `${d} วัน`; }
      case "sheet_note": return s?.note ? esc(s.note) : "";
      case "detail": return s?.detail_excerpt ? esc(s.detail_excerpt) : "";
      default: return "";
    }
  };

  const th = (label: string, extra = "") => `<th style="text-align:left;padding:8px 8px;font-size:12px;font-weight:bold;color:#475569;background:#f1f5f9;border-bottom:1px solid #e2e8f0;${extra}">${esc(label)}</th>`;
  const head = `<tr>${th("#", "width:28px;text-align:center;")}${imgCol ? th("รูป") : ""}${textCols.map((c) => th(c.label)).join("")}</tr>`;
  const body = rows.map((row, i) => {
    const imgs = row.images.length
      ? row.images.map((u) => `<img src="${esc(thumb(u, row.images.length > 1 ? 160 : 240))}" alt="" style="width:${row.images.length > 1 ? 72 : 110}px;height:${row.images.length > 1 ? 72 : 110}px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;margin:0 4px 4px 0;vertical-align:top;background:#f8fafc;" />`).join("")
      : `<div style="width:110px;height:110px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;color:#94a3b8;font-size:11px;display:flex;align-items:center;justify-content:center;">ไม่มีรูป</div>`;
    const bg = i % 2 ? "background:#fcfcfd;" : "";
    return `<tr style="${bg}page-break-inside:avoid;break-inside:avoid;">
      <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-size:12px;vertical-align:top;">${i + 1}</td>
      ${imgCol ? `<td style="padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:${row.images.length > 1 ? 240 : 120}px;">${imgs}</td>` : ""}
      ${textCols.map((c) => `<td style="padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:13px;color:#334155;line-height:1.45;">${cell(row, c.key)}</td>`).join("")}
    </tr>`;
  }).join("");

  const sheetCount = new Set(rows.map((r) => r.sheetId)).size;
  return `<div style="font-family:${SUMMARY_FONT};color:#0f172a;background:#ffffff;padding:24px;max-width:960px;box-sizing:border-box;">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
    <div>
      <div style="font-size:22px;font-weight:bold;line-height:1.3;">${esc(doc.title)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:2px;">สรุปงานออกแบบ · ${rows.length} รายการ${sheetCount !== rows.length ? ` (จาก ${sheetCount} ใบงาน)` : ""}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#64748b;white-space:nowrap;">${esc(thDate(now))}${customer ? "" : `<div style="margin-top:2px;display:inline-block;padding:1px 8px;border-radius:999px;background:#f1f5f9;color:#475569;">${AUDIENCE_LABEL[doc.audience]}</div>`}</div>
  </div>
  ${doc.note ? `<div style="font-size:13px;color:#334155;background:#f8fafc;border-radius:8px;padding:8px 12px;margin-bottom:12px;white-space:pre-wrap;">${esc(doc.note)}</div>` : ""}
  ${rows.length === 0
    ? `<div style="padding:32px;text-align:center;color:#94a3b8;font-size:14px;">ยังไม่มีรายการ</div>`
    : `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">${head}${body}</table>`}
</div>`;
}

/** เอกสารเต็ม (มี <html>/<title> = ชื่อไฟล์ PDF) — ใช้ iframe ตัวอย่าง + พิมพ์ */
export function renderSummaryHtml(doc: SummaryDoc, sheets: Map<string, SummarySheetInfo>, now = new Date()): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.title || "สรุปงาน")}</title>
<style>@page{size:A4;margin:10mm;}html,body{margin:0;background:#f1f5f9;}@media print{html,body{background:#ffffff;}}</style></head>
<body><div style="max-width:960px;margin:0 auto;background:#ffffff;">${renderSummaryBody(doc, sheets, now)}</div></body></html>`;
}
