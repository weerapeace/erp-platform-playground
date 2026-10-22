/**
 * ใบสั่งตัวอย่าง (Design Sheet) — โหมด "เน้น Comment ลูกค้า" ของหน้าพิมพ์ /print/design-sheet/[id]
 *   • รูปหลักย่อเป็นรูปเล็ก (วางข้างกล่องรายละเอียดงาน)
 *   • Comment ลูกค้า = การ์ดเต็มความกว้าง + รูปแนบที่ติ๊กเลือกแสดงใหญ่ (1/2/3 รูปต่อแถว)
 * หัว/ท้ายใบ + CSS ยืมจากเทมเพลต design_sheet ตัวหลัก (แก้ที่เดียว ได้ทั้งสองโหมด) · เนื้อกลาง = DS_COMMENT_FOCUS_BODY
 * ถ้ามีเทมเพลต entity design_sheet template_key='comment_focus' ใน DB → หน้าพิมพ์ใช้ตัวนั้นทั้งใบแทน
 * pure (ไม่แตะ DOM/เน็ต) → เทสได้ที่ lib/__tests__/design-sheet-print.test.ts
 */

export const DS_PRINT_MODES = ["standard", "comments"] as const;
export type DsPrintMode = (typeof DS_PRINT_MODES)[number];

export const DS_COMMENT_COLS = ["1", "2", "3"] as const;   // จำนวนรูปต่อแถวในการ์ด comment
export type DsCommentCols = (typeof DS_COMMENT_COLS)[number];

export const DS_COMMENT_FOCUS_TEMPLATE_KEY = "comment_focus";

// ความสูงรูปสูงสุดต่อขนาด (มม.) — A4 เหลือที่เขียนราว 257 มม.
const MAX_IMG_H_MM: Record<DsCommentCols, number> = { "1": 150, "2": 85, "3": 60 };

/** key ของรูปแนบ comment 1 รูป (รูปแนบไม่มี id ในข้อมูล comment → ใช้ comment id + url) */
export const commentImageKey = (commentId: string, url: string) => `${commentId}|${url}`;

/** ข้อความจากผู้ใช้ → escape HTML + ปีกกา (กัน {{token}} ในข้อความโดนแทนค่าตอนเรนเดอร์เทมเพลต) */
const escText = (v: unknown) => String(v ?? "").replace(/[&<>"'{}]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" }[c]!));

/**
 * เลือก comment + รูปที่จะพิมพ์ — เก็บแบบ "ตัดออก" (ค่าเริ่มต้น = พิมพ์ครบทุก comment ทุกรูป)
 * idx = ลำดับเดิมในใบงาน (ตัด comment ไหนออก เลขที่เหลือยังตรงกับในระบบ)
 */
export function selectCommentsForPrint<T extends { id: string; images: string[] }>(
  comments: T[],
  skipComments: ReadonlySet<string>,
  skipImages: ReadonlySet<string>,
): Array<{ comment: T; idx: number; images: string[] }> {
  return comments.flatMap((c, i) => skipComments.has(c.id) ? [] : [{
    comment: c,
    idx: i + 1,
    images: c.images.filter((u) => !skipImages.has(commentImageKey(c.id, u))),
  }]);
}

export type CommentFocusCard = { idx: number; date_th: string; body: string; images: string[] };

/** การ์ด comment ทั้งหมด (HTML) — images = url เต็มที่พร้อมใส่ใบแล้ว */
export function buildCommentCardsHtml(cards: CommentFocusCard[], cols: DsCommentCols): string {
  const maxH = MAX_IMG_H_MM[cols] ?? MAX_IMG_H_MM["2"];
  return cards.map((c) => {
    const n = Math.max(1, Math.min(Number(cols) || 2, c.images.length));
    const figs = c.images.map((src) =>
      `<figure style="margin:0;border:1px solid #e2e8f0;border-radius:4px;padding:2px;display:flex;align-items:center;justify-content:center;background:#fff;break-inside:avoid;page-break-inside:avoid;">` +
      `<img src="${escText(src)}" alt="รูปประกอบ comment ${c.idx}" style="max-width:100%;max-height:${maxH}mm;object-fit:contain;display:block;" /></figure>`).join("");
    const body = c.body.trim()
      ? `<div style="padding:6px 8px;font-size:13px;line-height:1.55;white-space:pre-wrap;">${escText(c.body.trim())}</div>`
      : "";
    const grid = figs
      ? `<div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:6px;padding:${body ? "0 8px 8px" : "8px"};">${figs}</div>`
      : "";
    const count = c.images.length ? `<span style="float:right;color:#94a3b8;font-size:11px;">รูปแนบ ${c.images.length} รูป</span>` : "";
    return `<div style="border:1px solid #cbd5e1;border-radius:8px;margin-bottom:8px;">` +
      `<div style="background:#f1f5f9;border-bottom:1px solid #e2e8f0;border-radius:8px 8px 0 0;padding:4px 8px;font-size:12px;break-after:avoid;page-break-after:avoid;">` +
      `<b>#${c.idx}</b> · <span style="color:#475569;">${escText(c.date_th)}</span>${count}</div>${body}${grid}</div>`;
  }).join("");
}

/** รูปหลักแบบย่อ (ตาราง 2 คอลัมน์ ช่องละ 26 มม.) */
export function buildMainThumbsHtml(items: Array<{ src: string; alt?: string }>): string {
  const imgs = items.filter((i) => i.src.trim());
  if (imgs.length === 0) return "";
  const cols = Math.min(2, imgs.length);
  return `<div style="display:grid;grid-template-columns:repeat(${cols},26mm);gap:4px;">` +
    imgs.map((i) => `<img src="${escText(i.src)}" alt="${escText(i.alt ?? "design image")}" style="width:26mm;height:26mm;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;background:#fff;" />`).join("") +
    `</div>`;
}

/** เนื้อกลางของโหมดเน้น Comment (Mustache แบบเดียวกับเทมเพลตใน DB) */
export const DS_COMMENT_FOCUS_BODY = `<table style="width:100%;font-size:12px;margin:10px 0;border-collapse:collapse;">
  <tr><td style="width:14%;color:#64748b;padding:3px 0;">ชื่องาน</td><td style="font-weight:600;">{{name}}</td><td style="width:14%;color:#64748b;">แบรนด์</td><td style="width:22%;">{{brand_name}}</td></tr>
  <tr><td style="color:#64748b;padding:3px 0;">วันที่สั่ง</td><td>{{order_date_th}}</td><td style="color:#64748b;">กำหนดเสร็จ</td><td>{{deadline_th}}</td></tr>
  <tr><td style="color:#64748b;padding:3px 0;">สถานะ</td><td>{{status_label}}</td><td style="color:#64748b;">Note</td><td>{{note}}</td></tr>
</table>
<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
{{#detail_html}}<div style="flex:1;min-width:0;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:8px;"><div style="color:#64748b;font-size:11px;margin-bottom:4px;">รายละเอียดงาน</div>{{{detail_html}}}</div>{{/detail_html}}
{{#main_thumbs_html}}<div style="flex:0 0 auto;"><div style="color:#64748b;font-size:11px;margin-bottom:4px;">รูปงานออกแบบ</div>{{{main_thumbs_html}}}</div>{{/main_thumbs_html}}
</div>
<div style="font-size:13px;font-weight:700;margin:2px 0 6px;">Comment ลูกค้า</div>
{{{comment_cards_html}}}
{{^comment_cards_html}}<div style="font-size:12px;color:#94a3b8;padding:6px;">— ไม่มี comment ที่เลือกพิมพ์ —</div>{{/comment_cards_html}}`;
