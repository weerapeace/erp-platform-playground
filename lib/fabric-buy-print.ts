/**
 * ใบสรุป "คิดผ้าก่อนซื้อ" (พิมพ์ A4) — สรุปตัวเลข · ค่าที่ตั้ง · ชิ้นตัด · เทียบหน้ากว้าง · ผังการวาง
 * ผังใช้ layoutSvg ตัวเดียวกับใบตัดผ้า (lib/fabric-plan-print) · ใช้ที่: app/fabric-calc (ปุ่มพิมพ์ → printReportHtmlInNewWindow)
 */
import { layoutSvg } from "./fabric-plan-print";
import type { BuyInput, BuyResult, WidthCompareRow } from "./fabric-buy";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });

export type FabricBuyPrintMeta = { title: string; date: string; fabric_name: string | null; source_label: string | null };

export function renderFabricBuyHtml(input: BuyInput, res: BuyResult, compare: WidthCompareRow[], meta: FabricBuyPrintMeta): string {
  const u = esc(res.unit_label);
  const sheet = input.form === "sheet";
  const roundLabel = sheet ? "ผืนเต็ม" : input.round === "roll" ? `ม้วนเต็ม (ม้วนละ ${fmt(Number(input.roll_length) || 0)} ${u})` : input.round === "none" ? "ไม่ปัด" : `${u}เต็ม`;
  const kpi = [
    ["ต้องใช้ (รวมเผื่อเสีย)", `${fmt(res.need)} ${u}`],
    ["ควรซื้อ (ปัดแล้ว)", `${fmt(res.need_rounded)} ${u}${res.rolls ? ` · ${res.rolls} ม้วน` : ""}`],
    ["สต็อกมี", `${fmt(res.stock)} ${u}`],
    ["ต้องซื้อเพิ่ม", `${fmt(res.to_buy)} ${u}`],
    ...(res.cost_buy != null ? [["งบซื้อเพิ่ม", `฿${fmt(res.cost_buy, 0)}`]] : []),
    ...(res.cost_per_unit != null ? [["ค่าผ้าต่อใบ", `฿${fmt(res.cost_per_unit)}`]] : []),
    ["ใช้ต่อใบ", `${fmt(res.per_unit_cm, 1)} ซม.`],
    ["ใช้ผ้าคุ้ม", `${fmt(res.efficiency_pct, 1)}%`],
  ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const settings = [
    ["จำนวนผลิต", `${fmt(input.qty, 0)} ใบ`],
    ["หน้ากว้างเต็ม / ใช้ได้จริง", `${fmt(input.face_width_cm, 1)} / ${fmt(res.usable_width_cm, 1)} ซม. (หักริม ${fmt(Number(input.trim_cm) || 0, 1)})`],
    ["มาเป็น", sheet ? `ผืน (ยาว ${fmt(Number(input.sheet_length_cm) || 0, 1)} ซม.)` : "ม้วน"],
    ["ทางผ้า", input.allow_rotate === false ? "ห้ามหมุน" : "หมุนได้"],
    ["เว้นระหว่างชิ้น", `${fmt(Number(input.gap_cm) || 0, 1)} ซม.`],
    ["เผื่อเสีย / หดตัว", `${fmt(Number(input.waste_pct) || 0, 1)}% / ${fmt(Number(input.shrink_pct) || 0, 1)}%`],
    ["ปัดขึ้น", roundLabel],
    ["ราคา", Number(input.price) > 0 ? `฿${fmt(Number(input.price))} / ${u}` : "-"],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  const pieces = input.pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && p.per_unit > 0)
    .map((p) => `<tr><td>${esc(p.label || "-")}</td><td class="n">${fmt(p.width_cm, 1)} × ${fmt(p.length_cm, 1)}</td><td class="n">${fmt(p.per_unit, 0)}</td><td class="n">${fmt(p.per_unit * input.qty, 0)}</td><td>${p.no_rotate ? "ห้ามหมุน" : ""}</td></tr>`).join("");
  const cmp = compare.length > 1 ? `<h3>เทียบหน้ากว้าง</h3><table><thead><tr><th>หน้ากว้าง</th><th class="n">ราคา/${u}</th><th class="n">ต้องใช้</th><th class="n">ปัดแล้ว</th><th class="n">คุ้ม %</th><th class="n">งบ</th></tr></thead><tbody>${compare.map((c) => c.result.ok
    ? `<tr${c.best ? ' class="best"' : ""}><td>${fmt(c.face_width_cm, 1)} ซม.${c.best ? " ★" : ""}</td><td class="n">${c.price != null ? fmt(c.price) : "-"}</td><td class="n">${fmt(c.result.need)}</td><td class="n">${fmt(c.result.need_rounded)}</td><td class="n">${fmt(c.result.efficiency_pct, 1)}</td><td class="n">${c.price != null ? `฿${fmt(c.result.need_rounded * c.price, 0)}` : "-"}</td></tr>`
    : `<tr><td>${fmt(c.face_width_cm, 1)} ซม.</td><td colspan="5">${esc(c.result.error ?? "วางไม่ได้")}</td></tr>`).join("")}</tbody></table>` : "";
  const lay = res.layout?.ok ? layoutSvg(res.layout, res.usable_width_cm, sheet ? Number(input.sheet_length_cm) || null : null) : "";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>
    @page{size:A4;margin:10mm}
    body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:11px}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #0f172a;padding-bottom:4px;margin-bottom:6px}
    .t{font-size:18px;font-weight:700}.sub{font-size:13px;font-weight:600}.meta{text-align:right}.sm{font-size:9.5px;color:#64748b}
    h3{font-size:12px;margin:8px 0 3px}
    .kpi{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.kpi div{border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px}.kpi span{display:block;font-size:9px;color:#64748b}.kpi b{font-size:13px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #cbd5e1;padding:2px 4px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:9.5px;font-weight:600}.n{text-align:right}.best td{background:#ecfdf5;font-weight:600}
    .two{display:flex;gap:8px}.two>div{flex:1;min-width:0}.strip{margin-bottom:4px;break-inside:avoid}.sl{font-size:9px;color:#64748b}
  </style></head><body>
    <header><div><div class="t">สรุปคิดผ้าก่อนซื้อ</div><div class="sub">${esc(meta.fabric_name ?? "ผ้า (ไม่ระบุรหัส)")}</div>${meta.source_label ? `<div class="sm">ชิ้นตัดจาก: ${esc(meta.source_label)}</div>` : ""}</div>
      <div class="meta"><div>วันที่ ${esc(meta.date)}</div><div class="sm">ตัวเลขประมาณจากการวางชิ้นแบบกรอบสี่เหลี่ยม</div></div></header>
    <div class="kpi">${kpi}</div>
    <div class="two"><div><h3>ค่าที่ตั้ง</h3><table><tbody>${settings}</tbody></table></div>
      <div><h3>ชิ้นตัด</h3><table><thead><tr><th>ชิ้น</th><th class="n">กว้าง×ยาว (ซม.)</th><th class="n">ต่อใบ</th><th class="n">รวม</th><th></th></tr></thead><tbody>${pieces}</tbody></table></div></div>
    ${cmp}
    ${lay ? `<h3>ผังการวาง</h3>${lay}` : ""}
  </body></html>`;
}
