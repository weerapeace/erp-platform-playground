/**
 * 📧 แม่แบบอีเมลรายงาน (ของกลาง · ฟังก์ชันล้วน ไม่แตะฐานข้อมูล)
 * รับ "รายงานที่ประกอบแล้ว" (BuiltReport จากแหล่งข้อมูลไหนก็ได้) → หัวเรื่อง + HTML + ข้อความล้วน
 * HTML แบบตาราง + style ในบรรทัด (อีเมลส่วนใหญ่ไม่อ่าน <style>/CSS ภายนอก) กว้างสุด 600px อ่านบนมือถือได้
 * รูปต้องเป็นลิงก์เต็ม (https://…) เปิดได้โดยไม่ต้อง login — Gmail โชว์ทันที · Outlook บางเครื่องถามก่อนโหลดรูป
 */
import { linkLabel, type TaskLink } from "@/lib/record-tasks";

export type ReportTone = "danger" | "warn" | "muted" | "good";

/** ข้อมูลรองของแถว เรียงตามที่ผู้ตั้งค่าเลือก · meta ที่อยู่ติดกันรวมเป็นบรรทัดเดียวคั่นด้วย " · "
 *  meta = บรรทัดเทา (แบรนด์ · กำหนดส่ง) · note = กล่องเหลือง 📝 · tag = ป้ายฟ้า ⏳ · small = ข้อความเล็กจาง
 *  links = 🔗 ลิงก์ของข้อที่รอ (เช่น ร้านที่จะซื้อของ) — HTML กดได้ · ข้อความล้วน/รูปใช้ text */
export type ReportPart = { kind: "meta" | "note" | "tag" | "small" | "links"; text: string; links?: { title: string; links: TaskLink[] }[] };
export type ReportRow = {
  id: string;
  imageUrl: string | null;
  title: string;
  code?: string | null;
  parts: ReportPart[];
  flag?: { text: string; tone: ReportTone } | null;   // ป้ายขวา เช่น "เกิน 3 วัน" / "ไม่ขยับ 14 วัน"
  link: string | null;
  /** ปุ่มขวา เช่น "เปิดใบงาน" (null = ไม่โชว์ปุ่ม แต่กดชื่อ/รูปยังเปิดได้) */
  linkLabel?: string | null;
};
/** label ว่าง = ไม่มีหัวกลุ่ม (ไม่จัดกลุ่ม) */
export type ReportSection = { key: string; label: string; color: string | null; total: number; rows: ReportRow[] };
export type ReportStat = { label: string; value: number; tone?: ReportTone };
export type BuiltReport = {
  heading: string;               // หัวในอีเมล เช่น "งานออกแบบที่ค้างอยู่"
  subjectCore: string;           // ใช้ในหัวเรื่องแบบเดิม เช่น "งานออกแบบที่ค้าง 48 งาน"
  total: number;                 // ทั้งหมดที่ตรงตัวกรอง
  shown: number;                 // ที่โชว์ในอีเมล (≤ max_rows)
  stats: ReportStat[];
  /** แถบนับแยกกลุ่มใต้ตัวเลขสรุป เช่น แยกตามสถานะ (ไม่ใส่ = ไม่โชว์) */
  breakdown?: { label: string; color: string | null; count: number }[];
  /** โชว์ช่องรูปหน้าแถวไหม */
  showImages: boolean;
  sections: ReportSection[];
  viewAllLink: string | null;
  viewAllLabel: string;
  emptyText: string;             // ข้อความตอนไม่มีงาน
  /** ค่าสำหรับ {คำ} ในหัวเรื่องที่ตั้งเอง */
  tokens: Record<string, string | number>;
  /** จำนวนงานที่มีข้อมูลแต่ละช่องจริง (โชว์ในหน้าตั้งค่า ช่วยตัดสินใจว่าจะโชว์ช่องไหน) */
  fieldFill?: Record<string, number>;
  /** จำนวนงานเกินกำหนด (Discord ใช้ตัดสินว่าจะแท็กทีมไหม) */
  overdue?: number;
  /** เรคคอร์ดในรายงานที่มีเช็กลิสต์ค้าง (เรียงตามความด่วน) — Discord ทำเป็นการ์ดพร้อมปุ่มติ๊ก */
  checklist?: {
    moduleKey: string;
    records: { id: string; title: string; description: string; imageUrl: string | null; link: string | null }[];
  };
  /** 🔔 ป๊อปตอนเข้า ERP (lib/email-report/popup): ทุกงานในรายงาน เรียงตามความด่วน · path = ลิงก์ในระบบ (ไม่ใช่ลิงก์เต็ม) */
  popup?: { viewAllPath: string; items: PopupSourceItem[] };
};
/** urgent = เกินกำหนด/ใกล้กำหนด · waiting = ข้อเช็กลิสต์ที่ค้าง (มีชื่อผู้รับผิดชอบต่อท้าย) · brand/status/due/note = ข้อมูลที่เลือกโชว์ได้ในป๊อป */
export type PopupSourceItem = {
  id: string; title: string; code: string | null; path: string; imageUrl: string | null;
  flag: { text: string; tone: ReportTone }; urgent: boolean; overdue: boolean; waiting: string[];
  brand: string | null; status: string | null; due: string | null; note: string | null;
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

/** หัวเรื่องที่ตั้งเอง: แทน {คำ} ด้วยค่าจริง (คำที่ไม่รู้จักคงไว้) · ตัดขึ้นบรรทัดทิ้ง กันแทรกหัวอีเมล */
export function fillSubject(template: string, tokens: Record<string, string | number>): string {
  return template
    .replace(/\{([^{}]{1,30})\}/g, (m, k: string) => {
      const v = tokens[k.trim()];
      return v === undefined ? m : typeof v === "number" ? v.toLocaleString("th-TH") : v;
    })
    .replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

/** ข้อมูลรองของแถว → HTML (meta ติดกันรวมบรรทัดเดียว) */
function partsHtml(parts: ReportPart[]): string {
  const out: string[] = [];
  let meta: string[] = [];
  const flush = () => { if (meta.length) { out.push(`<div style="font-size:12px;color:#64748b;margin-top:2px;">${meta.map(esc).join(" · ")}</div>`); meta = []; } };
  for (const p of parts) {
    if (p.kind === "meta") { meta.push(p.text); continue; }
    flush();
    if (p.kind === "note") out.push(`<div style="font-size:12px;color:#92400e;background:#fffbeb;border-radius:4px;padding:3px 6px;margin-top:4px;">📝 ${esc(p.text)}</div>`);
    else if (p.kind === "links") {
      const a = (l: TaskLink) => `<a href="${esc(l.url)}" style="color:#1d4ed8;text-decoration:underline;">${esc(linkLabel(l))}</a>`;
      out.push(`<div style="font-size:12px;color:#475569;margin-top:3px;">🔗 ${(p.links ?? []).map((g) => `${esc(g.title)}: ${g.links.map(a).join(" · ")}`).join(" &nbsp;|&nbsp; ")}</div>`);
    }
    else if (p.kind === "tag") out.push(`<div style="margin-top:4px;"><span style="display:inline-block;font-size:12px;color:#1d4ed8;background:#eff6ff;border-radius:4px;padding:2px 6px;">⏳ ${esc(p.text)}</span></div>`);
    else out.push(`<div style="font-size:12px;color:#94a3b8;margin-top:2px;">${esc(p.text)}</div>`);
  }
  flush();
  return out.join("");
}

export function renderReportEmail(r: BuiltReport, ctx: {
  reportName: string;
  scheduleLabel: string;         // เช่น "จ–ส · 08:00 น."
  manageUrl: string | null;      // ลิงก์หน้า "ส่งอีเมลรายงาน"
  /** หัวเรื่องที่ตั้งเอง (ว่าง = แบบเดิม) */
  subjectTemplate?: string;
  /** ข้อความเกริ่นบนสุด */
  intro?: string;
  now?: Date;
}): { subject: string; html: string; text: string } {
  const now = ctx.now ?? new Date();
  const defaultSubject = `${r.subjectCore} · ${thaiDateLabel(now, "short")}`;
  const custom = ctx.subjectTemplate?.trim()
    ? fillSubject(ctx.subjectTemplate, { ...r.tokens, "วันที่": thaiDateLabel(now, "short"), "ชื่อรายงาน": ctx.reportName })
    : "";
  const subject = custom || defaultSubject;
  const intro = (ctx.intro ?? "").trim();
  const font = "font-family:'Sarabun','Leelawadee UI','Segoe UI',Tahoma,Arial,sans-serif;";
  const hasRight = r.sections.some((s) => s.rows.some((x) => x.flag || x.linkLabel));

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
    // ไม่โชว์รูป → ช่องซ้ายเหลือแค่ระยะขอบ (คงตาราง 3 ช่องไว้ให้หัวกลุ่ม colspan=3 ตรงกันทุกโปรแกรมอีเมล)
    const left = r.showImages
      ? `<td width="68" valign="top" style="padding:8px 0 8px 16px;border-bottom:1px solid #f1f5f9;">${link ? `<a href="${esc(link)}" style="text-decoration:none;">${thumb}</a>` : thumb}</td>`
      : `<td width="8" style="padding:0;border-bottom:1px solid #f1f5f9;"></td>`;
    const linkLabel = link && row.linkLabel ? row.linkLabel : null;
    return `
      <tr>
        ${left}
        <td valign="top" style="padding:8px 8px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:bold;color:#0f172a;line-height:1.35;">${link ? `<a href="${esc(link)}" style="color:#0f172a;text-decoration:none;">${title}</a>` : title}</div>
          ${partsHtml(row.parts)}
        </td>
        <td width="${hasRight ? 110 : 8}" valign="top" align="right" style="padding:8px ${hasRight ? 16 : 0}px 8px 0;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
          ${row.flag ? `<div style="font-size:12px;color:${TONE_COLOR[row.flag.tone]};">${esc(row.flag.text)}</div>` : ""}
          ${linkLabel ? `<a href="${esc(link)}" style="display:inline-block;margin-top:4px;font-size:12px;color:#2563eb;text-decoration:none;">${esc(linkLabel)} →</a>` : ""}
        </td>
      </tr>`;
  };

  const sectionsHtml = r.sections.filter((s) => s.rows.length > 0).map((s) => `
    ${s.label ? `<tr><td colspan="3" style="padding:8px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:bold;color:#334155;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${safeColor(s.color ?? "")};margin-right:6px;"></span>${esc(s.label)} · ${s.total.toLocaleString("th-TH")} งาน${s.total > s.rows.length ? ` <span style="font-weight:normal;color:#94a3b8;">(โชว์ ${s.rows.length})</span>` : ""}
    </td></tr>` : `<tr><td colspan="3" style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>`}
    ${s.rows.map(rowHtml).join("")}`).join("");

  const breakdown = (r.breakdown ?? []).filter((b) => b.count > 0);
  const breakdownHtml = breakdown.length ? `
  <tr><td colspan="3" style="padding:0 16px 12px 16px;font-size:12px;color:#64748b;">
    ${breakdown.map((b) => `<span style="display:inline-block;margin-right:12px;white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${safeColor(b.color ?? "")};margin-right:4px;"></span>${esc(b.label)} ${b.count.toLocaleString("th-TH")}</span>`).join("")}
  </td></tr>` : "";
  const introHtml = intro ? `
    <div style="font-size:14px;color:#334155;background:#f8fafc;border-left:3px solid #2563eb;padding:8px 10px;margin-top:10px;">${esc(intro).replace(/\n/g, "<br>")}</div>` : "";

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
    <div style="font-size:13px;color:#64748b;margin-top:2px;">${esc(ctx.reportName)} · ${esc(thaiDateLabel(now))}</div>${introHtml}
  </td></tr>
  ${r.stats.length ? `<tr><td colspan="3" style="padding:6px 12px 14px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${statCells}</tr></table></td></tr>` : `<tr><td colspan="3" style="padding:0 0 8px 0;font-size:0;line-height:0;">&nbsp;</td></tr>`}${breakdownHtml}
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

  const lines: string[] = [r.heading, `${ctx.reportName} · ${thaiDateLabel(now)}`, ""];
  if (intro) lines.push(intro, "");
  if (r.stats.length) lines.push(r.stats.map((s) => `${s.label}: ${s.value}`).join(" · "));
  if (breakdown.length) lines.push(breakdown.map((b) => `${b.label} ${b.count}`).join(" · "));
  lines.push("");
  if (r.total === 0) lines.push(r.emptyText);
  for (const s of r.sections) {
    if (s.rows.length === 0) continue;
    if (s.label) lines.push(`■ ${s.label} (${s.total} งาน)`);
    for (const row of s.rows) {
      lines.push(`- ${row.code ? `${row.code} ` : ""}${row.title}${row.flag ? ` [${row.flag.text}]` : ""}${row.link ? ` ${row.link}` : ""}`);
      const sub = row.parts.map((p) => (p.kind === "note" ? `📝 ${p.text}` : p.kind === "tag" ? `⏳ ${p.text}` : p.kind === "links" ? `🔗 ${p.text}` : p.text));
      if (sub.length) lines.push(`  ${sub.join(" · ")}`);
    }
    lines.push("");
  }
  if (r.total > r.shown) lines.push(`แสดง ${r.shown} จาก ${r.total} งาน`);
  if (viewAll) lines.push(`${r.viewAllLabel}: ${viewAll}`);
  lines.push("", `ส่งอัตโนมัติจากระบบ ERP (${ctx.scheduleLabel})`);
  return { subject, html, text: lines.join("\n") };
}
