/**
 * ใบจ่ายงานเหมา (พิมพ์ให้ช่างเหมา) — 1 คน = 1 แผ่น: รายการงาน · จำนวน · ราคา · รวมเงิน · ช่องเขียนรับคืน · ลงชื่อผู้จ่าย/ผู้รับ
 * ใช้ที่หน้า /print/piecework (?batch= จ่ายชุดเดียวกัน · ?ids= เลือกเอง เช่น งานค้างของคนหนึ่งในแท็บ "รับงานคืน")
 */
import { escapeHtml as esc } from "@/lib/list-print";

export type PwPrintRow = {
  id: string; mo_no: string; job_name: string; rate: number; total_qty: number; status: string; done_qty: number | null;
  assignee_name: string | null; dispatched_at: string | null; created_at: string;
  product_sku?: string | null; product_name?: string | null; image_url?: string | null;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thDate = (d: string | null) => {
  if (!d) return "";
  const x = new Date(d.length === 10 ? `${d}T00:00:00+07:00` : d);
  return isNaN(x.getTime()) ? "" : x.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
};

/** แบ่งแถวตามคนรับ (เรียงตามชื่อ) */
export function pwGroupByPerson(rows: PwPrintRow[]): { name: string; rows: PwPrintRow[]; qty: number; money: number }[] {
  const m = new Map<string, PwPrintRow[]>();
  for (const r of rows) { const k = (r.assignee_name ?? "").trim() || "— ยังไม่ระบุคน —"; m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")).map(([name, rs]) => ({
    name, rows: rs,
    qty: rs.reduce((a, r) => a + (Number(r.total_qty) || 0), 0),
    money: Math.round(rs.reduce((a, r) => a + (Number(r.total_qty) || 0) * (Number(r.rate) || 0), 0) * 100) / 100,
  }));
}

export function renderPieceworkSlipsHtml(rows: PwPrintRow[], opts: { title: string; company?: string | null; batchLabel?: string | null; showImages?: boolean }): string {
  const groups = pwGroupByPerson(rows);
  const img = opts.showImages !== false;
  const pages = groups.map((g) => {
    const date = thDate(g.rows.map((r) => r.dispatched_at ?? r.created_at).sort()[0] ?? null);
    const body = g.rows.map((r, i) => `<tr>
      <td class="c">${i + 1}</td>
      ${img ? `<td class="im">${r.image_url ? `<img src="${esc(r.image_url)}" alt="">` : ""}</td>` : ""}
      <td><div class="sku">${esc(r.product_sku ?? "")}</div><div class="nm">${esc(r.product_name ?? "")}</div><div class="mo">${esc(r.mo_no)}</div></td>
      <td>${esc(r.job_name)}</td>
      <td class="n">${fmt(r.total_qty)}</td>
      <td class="n">${fmt(r.rate)}</td>
      <td class="n b">${fmt(r.total_qty * r.rate)}</td>
      <td class="w">${r.status === "done" ? fmt(r.done_qty ?? r.total_qty) : ""}</td>
    </tr>`).join("");
    return `<section class="pg">
      <header>
        <div><div class="t">ใบจ่ายงานเหมา</div>${opts.company ? `<div class="co">${esc(opts.company)}</div>` : ""}</div>
        <div class="meta"><div>ผู้รับเหมา <b>${esc(g.name)}</b></div><div>วันที่จ่าย ${esc(date)}</div>${opts.batchLabel ? `<div class="sm">ชุด ${esc(opts.batchLabel)}</div>` : ""}</div>
      </header>
      <table>
        <thead><tr><th class="c">#</th>${img ? "<th></th>" : ""}<th>สินค้า / ใบสั่งผลิต</th><th>งานเหมา</th><th class="n">จำนวน</th><th class="n">฿/ชิ้น</th><th class="n">เงิน</th><th class="w">รับคืน</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="${img ? 4 : 3}" class="r">รวม ${g.rows.length} รายการ</td><td class="n b">${fmt(g.qty)}</td><td></td><td class="n b">${fmt(g.money)}</td><td></td></tr></tfoot>
      </table>
      <div class="sign"><div>ผู้จ่ายงาน ........................................<br><span>วันที่ ............/............/............</span></div><div>ผู้รับงาน (${esc(g.name)}) ........................................<br><span>วันที่รับคืน ............/............/............</span></div></div>
    </section>`;
  }).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    @page{size:A4;margin:12mm}
    body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:12px}
    .pg{page-break-after:always;padding:4px}.pg:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:6px;margin-bottom:8px}
    .t{font-size:20px;font-weight:700}.co{font-size:11px;color:#475569}.meta{text-align:right;font-size:12px;line-height:1.6}.meta b{font-size:15px}.sm{font-size:10px;color:#64748b}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px 6px;vertical-align:middle}th{background:#f1f5f9;font-size:11px;text-align:left}
    .c{text-align:center;width:22px}.n{text-align:right;white-space:nowrap}.b{font-weight:700}.r{text-align:right}.w{width:64px}
    .im{width:44px;padding:2px}.im img{width:40px;height:40px;object-fit:cover;border-radius:4px;display:block}
    .sku{font-family:ui-monospace,monospace;font-size:11px;font-weight:600}.nm{font-size:11px;color:#334155}.mo{font-size:10px;color:#64748b}
    tfoot td{background:#f8fafc}
    .sign{display:flex;justify-content:space-between;gap:24px;margin-top:28px;font-size:12px;line-height:2}.sign span{font-size:11px;color:#64748b}
  </style></head><body>${pages || '<p style="padding:24px;color:#64748b">ไม่มีรายการงานเหมา</p>'}</body></html>`;
}
