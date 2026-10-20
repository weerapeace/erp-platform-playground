/**
 * 📧 แม่แบบอีเมลรายงาน (ของกลาง · ฟังก์ชันล้วน ไม่แตะฐานข้อมูล)
 * รับ "รายงานที่ประกอบแล้ว" (BuiltReport จากแหล่งข้อมูลไหนก็ได้) → หัวเรื่อง + HTML + ข้อความล้วน
 * HTML แบบตาราง + style ในบรรทัด (อีเมลส่วนใหญ่ไม่อ่าน <style>/CSS ภายนอก) กว้างสุด 600px อ่านบนมือถือได้
 * รูปต้องเป็นลิงก์เต็ม (https://…) เปิดได้โดยไม่ต้อง login — Gmail โชว์ทันที · Outlook บางเครื่องถามก่อนโหลดรูป
 */

export type ReportTone = "danger" | "warn" | "muted" | "good";

export type ReportRow = {
  id: string;
  imageUrl: string | null;
  title: string;
  code?: string | null;
  meta?: string | null;          // บรรทัดรอง เช่น "Good Goods · กำหนดส่ง 18 ต.ค."
  note?: string | null;          // โน้ตสั้น
  flag?: { text: string; tone: ReportTone } | null;   // ป้ายขวา เช่น "เกิน 3 วัน" / "ไม่ขยับ 14 วัน"
  link: string | null;
};
export type ReportSection = { key: string; label: string; color: string; total: number; rows: ReportRow[] };
export type ReportStat = { label: string; value: number; tone?: ReportTone };
export type BuiltReport = {
  heading: string;               // หัวในอีเมล เช่น "งานออกแบบที่ค้างอยู่"
  subjectCore: string;           // ใช้ในหัวเรื่อง เช่น "งานออกแบบที่ค้าง 48 งาน"
  total: number;                 // ทั้งหมดที่ตรงตัวกรอง
  shown: number;                 // ที่โชว์ในอีเมล (≤ max_rows)
  stats: ReportStat[];
  sections: ReportSection[];
  viewAllLink: string | null;
  viewAllLabel: string;
  emptyText: string;             // ข้อความตอนไม่มีงาน
};

const TONE_COLOR: Record<ReportTone, string> = { danger: "#dc2626", warn: "#d97706", muted: "#64748b", good: "#059669" };

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#94a3b8");
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);

export function thaiDateLabel(now: Date, style: "long" | "short" = "long"): string {
  return now.toLocaleDateString("th-TH", style === "long"
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }
    : { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

export function renderReportEmail(r: BuiltReport, ctx: {
  reportName: string;
  scheduleLabel: string;         // เช่น "จ–ส · 08:00 น."
  manageUrl: string | null;      // ลิงก์หน้า "ส่งอีเมลรายงาน"
  now?: Date;
}): { subject: string; html: string; text: string } {
  const now = ctx.now ?? new Date();
  const subject = `${r.subjectCore} · ${thaiDateLabel(now, "short")}`;
  const font = "font-family:'Sarabun','Leelawadee UI','Segoe UI',Tahoma,Arial,sans-serif;";

  const statCells = r.stats.map((s) => `
    <td width="${Math.floor(100 / Math.max(1, r.stats.length))}%" style="padding:4px;">
      <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;">
        <div style="font-size:22px;font-weight:bold;line-height:1.2;color:${s.tone ? TONE_COLOR[s.tone] : "#0f172a"};">${s.value.toLocaleString("th-TH")}</div>
        <div style="font-size:12px;color:#64748b;">${esc(s.label)}</div>
      </div>
    </td>`).join("");

  const rowHtml = (row: ReportRow) => {
    const img = safeUrl(row.imageUrl);
    const link = safeUrl(row.link);
    const thumb = img
      ? `<img src="${esc(img)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:6px;border:1px solid #e2e8f0;object-fit:cover;background:#f1f5f9;">`
      : `<div style="width:56px;height:56px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;"></div>`;
    const title = `${row.code ? `<span style="color:#94a3b8;font-size:12px;">${esc(row.code)}</span> ` : ""}${esc(row.title)}`;
    return `
      <tr>
        <td width="68" valign="top" style="padding:8px 0 8px 16px;border-bottom:1px solid #f1f5f9;">${link ? `<a href="${esc(link)}" style="text-decoration:none;">${thumb}</a>` : thumb}</td>
        <td valign="top" style="padding:8px 8px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:bold;color:#0f172a;line-height:1.35;">${link ? `<a href="${esc(link)}" style="color:#0f172a;text-decoration:none;">${title}</a>` : title}</div>
          ${row.meta ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(row.meta)}</div>` : ""}
          ${row.note ? `<div style="font-size:12px;color:#92400e;background:#fffbeb;border-radius:4px;padding:3px 6px;margin-top:4px;">📝 ${esc(row.note)}</div>` : ""}
        </td>
        <td width="110" valign="top" align="right" style="padding:8px 16px 8px 0;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
          ${row.flag ? `<div style="font-size:12px;color:${TONE_COLOR[row.flag.tone]};">${esc(row.flag.text)}</div>` : ""}
          ${link ? `<a href="${esc(link)}" style="display:inline-block;margin-top:4px;font-size:12px;color:#2563eb;text-decoration:none;">เปิดใบงาน →</a>` : ""}
        </td>
      </tr>`;
  };

  const sectionsHtml = r.sections.filter((s) => s.rows.length > 0).map((s) => `
    <tr><td colspan="3" style="padding:8px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:bold;color:#334155;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${safeColor(s.color)};margin-right:6px;"></span>${esc(s.label)} · ${s.total.toLocaleString("th-TH")} งาน${s.total > s.rows.length ? ` <span style="font-weight:normal;color:#94a3b8;">(โชว์ ${s.rows.length})</span>` : ""}
    </td></tr>
    ${s.rows.map(rowHtml).join("")}`).join("");

  const viewAll = safeUrl(r.viewAllLink);
  const manage = safeUrl(ctx.manageUrl);
  const moreNote = r.total > r.shown ? `แสดง ${r.shown.toLocaleString("th-TH")} จาก ${r.total.toLocaleString("th-TH")} งาน · ` : "";

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;${font}color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(r.subjectCore)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;${font}">
  <tr><td colspan="3" style="padding:18px 16px 6px 16px;">
    <div style="font-size:20px;font-weight:bold;color:#0f172a;">${esc(r.heading)}</div>
    <div style="font-size:13px;color:#64748b;margin-top:2px;">${esc(ctx.reportName)} · ${esc(thaiDateLabel(now))}</div>
  </td></tr>
  <tr><td colspan="3" style="padding:6px 12px 14px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${statCells}</tr></table></td></tr>
  ${r.total === 0
    ? `<tr><td colspan="3" style="padding:24px 16px;text-align:center;font-size:14px;color:#059669;border-top:1px solid #e2e8f0;">${esc(r.emptyText)}</td></tr>`
    : sectionsHtml}
  <tr><td colspan="3" style="padding:12px 16px;text-align:center;font-size:12px;color:#64748b;">
    ${moreNote}${viewAll ? `<a href="${esc(viewAll)}" style="color:#2563eb;text-decoration:none;">${esc(r.viewAllLabel)} →</a>` : ""}
  </td></tr>
  <tr><td colspan="3" style="padding:10px 16px 14px 16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
    อีเมลนี้ส่งอัตโนมัติจากระบบ ERP (${esc(ctx.scheduleLabel)})${manage ? ` · เปลี่ยนผู้รับหรือเวลาได้ที่ <a href="${esc(manage)}" style="color:#94a3b8;">ตั้งค่า → ส่งอีเมลรายงาน</a>` : ""}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const lines: string[] = [r.heading, `${ctx.reportName} · ${thaiDateLabel(now)}`, "", r.stats.map((s) => `${s.label}: ${s.value}`).join(" · "), ""];
  if (r.total === 0) lines.push(r.emptyText);
  for (const s of r.sections) {
    if (s.rows.length === 0) continue;
    lines.push(`■ ${s.label} (${s.total} งาน)`);
    for (const row of s.rows) lines.push(`- ${row.code ? `${row.code} ` : ""}${row.title}${row.flag ? ` [${row.flag.text}]` : ""}${row.link ? ` ${row.link}` : ""}`);
    lines.push("");
  }
  if (r.total > r.shown) lines.push(`แสดง ${r.shown} จาก ${r.total} งาน`);
  if (viewAll) lines.push(`${r.viewAllLabel}: ${viewAll}`);
  lines.push("", `ส่งอัตโนมัติจากระบบ ERP (${ctx.scheduleLabel})`);
  return { subject, html, text: lines.join("\n") };
}
