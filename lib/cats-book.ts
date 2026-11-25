/**
 * 🐾 สมุดสุขภาพแมว — สร้างหน้าพิมพ์ A4 (pure · ทดสอบได้) · เจ้าของเลือก 2026-11-25 (ข้อ 5)
 *   1 ตัว = 1 หน้า (หลายตัว = หลายหน้าในไฟล์เดียว) · ใช้ตัวห่อเอกสารกลาง lib/template buildReportHtmlMulti
 *   หัวข้อเลือกได้: ข้อมูลตัว (บังคับ) · วัคซีน · ยาถ่ายพยาธิ/หยดเห็บ · น้ำหนัก · หาหมอ · ค่าใช้จ่าย
 *   หน้าพิมพ์ = app/misc/cats/book (พรีวิว PrintFrame · พิมพ์/PDF · บันทึก JPG ของกลาง) — หน้าดูอย่างเดียว ไม่เปลี่ยนข้อมูล
 */
import { ageText, SEX_LABEL, TREATMENT_LABEL, type Cat, type CatsData } from "@/lib/cats";
import { costEntries, COST_CATEGORY_LABEL } from "@/lib/cats-costs";
import { sinceText } from "@/lib/cats-extras";
import { escapeHtml as esc } from "@/lib/list-print";
import { buildReportHtmlMulti, type ReportTemplate } from "@/lib/template";

export type BookSection = "vaccinations" | "treatments" | "weights" | "vet" | "costs";
export const BOOK_SECTIONS: { key: BookSection; label: string; default: boolean }[] = [
  { key: "vaccinations", label: "วัคซีน", default: true },
  { key: "treatments", label: "ถ่ายพยาธิ / หยดเห็บหมัด", default: true },
  { key: "weights", label: "น้ำหนัก", default: true },
  { key: "vet", label: "หาหมอ", default: true },
  { key: "costs", label: "ค่าใช้จ่าย", default: false },
];

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** 2026-11-25 → 25 พ.ย. 69 */
export const thDate = (ymd: string | null | undefined) => {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
};
const money = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

const CSS = `
.cb { font-size: 12.5px; color: #1e293b; }
.cb-head { display: flex; gap: 16px; align-items: center; }
.cb-photo { width: 120px; height: 120px; border-radius: 12px; object-fit: cover; flex: none; background: #fde7cf; }
.cb-name { font-size: 24px; font-weight: 700; margin: 0 0 2px; }
.cb-meta { color: #475569; line-height: 1.6; }
.cb-sec { margin: 14px 0 4px; font-size: 14px; font-weight: 700; border-bottom: 2px solid #1e293b; padding-bottom: 2px; }
.cb table { width: 100%; border-collapse: collapse; }
.cb th, .cb td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.cb th { font-weight: 600; color: #64748b; font-size: 11.5px; }
.cb td.r, .cb th.r { text-align: right; }
.cb .muted { color: #94a3b8; }
.cb .note { margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 6px; color: #92400e; }
.cb-chart { display: block; width: 100%; height: 90px; margin-top: 4px; }
.cb-foot { margin-top: 14px; color: #94a3b8; font-size: 10.5px; text-align: right; }
`;

function weightSvg(points: { date: string; kg: number }[]): string {
  if (points.length < 2) return "";
  const W = 700, H = 90, P = 18;
  const min = Math.min(...points.map((p) => p.kg)), max = Math.max(...points.map((p) => p.kg));
  const span = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (kg: number) => H - P - ((kg - min) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3" fill="#0f766e"/>`).join("");
  const labels = [0, points.length - 1].map((i) => `<text x="${x(i).toFixed(1)}" y="${(y(points[i].kg) - 6).toFixed(1)}" font-size="11" text-anchor="${i ? "end" : "start"}" fill="#334155">${points[i].kg} กก.</text>`).join("");
  return `<svg class="cb-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#0f766e" stroke-width="2"/>${dots}${labels}</svg>`;
}

const table = (head: string[], rows: string[][], rightCols: number[] = []) => rows.length
  ? `<table><thead><tr>${head.map((h, i) => `<th class="${rightCols.includes(i) ? "r" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${rightCols.includes(i) ? "r" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  : `<p class="muted">ยังไม่มีบันทึก</p>`;

/** หน้าของแมว 1 ตัว (HTML ภายใน .doc) */
export function catBookBody(cat: Cat, data: CatsData, sections: Set<BookSection>, today: string, photoSrc: string | null): string {
  const clinic = (id: string | null) => esc(data.clinics.find((c) => c.id === id)?.name ?? "");
  const age = ageText(cat.birth_date, today);
  const since = sinceText(cat.adopted_date, today);
  const weights = data.weights.filter((w) => w.is_active && w.cat_id === cat.id).sort((a, b) => a.date.localeCompare(b.date));
  const last = weights[weights.length - 1];
  const meta = [
    [cat.sex ? SEX_LABEL[cat.sex] : "", cat.neutered ? "ทำหมันแล้ว" : "ยังไม่ทำหมัน", cat.breed, cat.color].filter(Boolean).map((v) => esc(v)).join(" · "),
    cat.birth_date ? `เกิด ${thDate(cat.birth_date)}${age ? ` (${esc(age)})` : ""}` : "",
    cat.adopted_date ? `รับเลี้ยง ${thDate(cat.adopted_date)}${since ? ` (อยู่บ้านมา ${esc(since)})` : ""}` : "",
    cat.microchip ? `ไมโครชิป ${esc(cat.microchip)}` : "",
    last ? `น้ำหนักล่าสุด ${Number(last.weight_kg)} กก. (${thDate(last.date)})` : "",
  ].filter(Boolean);
  let html = `<div class="cb"><div class="cb-head">${photoSrc ? `<img class="cb-photo" src="${esc(photoSrc)}" alt="" crossorigin="anonymous" />` : `<div class="cb-photo"></div>`}
<div><h1 class="cb-name">${esc(cat.name)}</h1><div class="cb-meta">${meta.map((m) => `<div>${m}</div>`).join("")}</div></div></div>`;
  if (cat.note) html += `<div class="note">${esc(cat.note)}</div>`;

  if (sections.has("vaccinations")) {
    const rows = data.vaccinations.filter((v) => v.is_active && v.cat_id === cat.id).sort((a, b) => b.date_given.localeCompare(a.date_given))
      .map((v) => [thDate(v.date_given), esc(v.vaccine_name), clinic(v.clinic_id), thDate(v.next_due_date)]);
    html += `<div class="cb-sec">วัคซีน</div>${table(["วันที่ฉีด", "วัคซีน", "คลินิก", "นัดครั้งถัดไป"], rows)}`;
  }
  if (sections.has("treatments")) {
    const rows = data.treatments.filter((t) => t.is_active && t.cat_id === cat.id).sort((a, b) => b.date_given.localeCompare(a.date_given))
      .map((t) => [thDate(t.date_given), TREATMENT_LABEL[t.type], esc(t.product), thDate(t.next_due_date)]);
    html += `<div class="cb-sec">ถ่ายพยาธิ / หยดเห็บหมัด</div>${table(["วันที่ให้", "ชนิด", "ยา", "ครั้งถัดไป"], rows)}`;
  }
  if (sections.has("weights")) {
    const recent = weights.slice(-12);
    html += `<div class="cb-sec">น้ำหนัก</div>${weightSvg(recent.map((w) => ({ date: w.date, kg: Number(w.weight_kg) })))}`;
    html += table(["วันที่", "น้ำหนัก (กก.)"], [...recent].reverse().slice(0, 6).map((w) => [thDate(w.date), String(Number(w.weight_kg))]), [1]);
  }
  if (sections.has("vet")) {
    const rows = data.vet_visits.filter((x) => x.is_active && x.cat_id === cat.id).sort((a, b) => b.date.localeCompare(a.date))
      .map((x) => [thDate(x.date), clinic(x.clinic_id), [x.symptoms ? `อาการ: ${esc(x.symptoms)}` : "", x.diagnosis ? `วินิจฉัย: ${esc(x.diagnosis)}` : "", x.medicines ? `ยา: ${esc(x.medicines)}` : ""].filter(Boolean).join("<br>")]);
    html += `<div class="cb-sec">หาหมอ</div>${table(["วันที่", "คลินิก", "รายละเอียด"], rows)}`;
  }
  if (sections.has("costs")) {
    const entries = costEntries(data).filter((e) => e.catIds?.length === 1 && e.catIds[0] === cat.id).sort((a, b) => b.date.localeCompare(a.date));
    const total = entries.reduce((n, e) => n + e.amount, 0);
    html += `<div class="cb-sec">ค่าใช้จ่ายเฉพาะตัว${entries.length ? ` · รวม ${money(total)} บาท` : ""}</div>`;
    html += table(["วันที่", "หมวด", "รายการ", "บาท"], entries.slice(0, 15).map((e) => [thDate(e.date), COST_CATEGORY_LABEL[e.category], esc(e.label), money(e.amount)]), [3]);
  }
  html += `<div class="cb-foot">สมุดสุขภาพแมว · พิมพ์ ${thDate(today)}</div></div>`;
  return html;
}

/** เอกสารเต็ม (หลายตัว = หลายหน้า) */
export function buildCatBook(cats: Cat[], data: CatsData, sections: Set<BookSection>, today: string, photoSrc: (cat: Cat) => string | null): string {
  const tpl: ReportTemplate = { paper_size: "A4", orientation: "portrait", header_html: "", body_html: "{{{body}}}", footer_html: "", custom_css: CSS };
  const title = cats.length === 1 ? `สมุดสุขภาพ ${cats[0].name}` : "สมุดสุขภาพแมว";
  return buildReportHtmlMulti(tpl, cats.map((c) => ({ body: catBookBody(c, data, sections, today, photoSrc(c)) })), title);
}
