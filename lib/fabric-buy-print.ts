/**
 * ใบสรุป "คิดผ้าก่อนซื้อ" (พิมพ์ A4) — สรุปตัวเลข · ค่าที่ตั้ง · ชิ้นตัด · เทียบหน้ากว้าง · ผังการวาง
 *   ผ้าเดียว = renderFabricBuyHtml · ทั้งตระกูล (หลายผ้า) = renderFabricBuyFamilyHtml (หน้าสรุปทุกผ้า + 1 ผ้า = 1 หน้า)
 * ผังใช้ layoutSvg ตัวเดียวกับใบตัดผ้า (lib/fabric-plan-print) · ใช้ที่: app/fabric-calc (ปุ่มพิมพ์ → printReportHtmlInNewWindow)
 */
import { layoutSvg } from "./fabric-plan-print";
import type { BuyInput, BuyResult, WidthCompareRow } from "./fabric-buy";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });

export type FabricBuyPrintMeta = { title: string; date: string; fabric_name: string | null; source_label: string | null };

const CSS = `
    @page{size:A4;margin:10mm}
    body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:11px}
    .pg{page-break-after:always}.pg:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #0f172a;padding-bottom:4px;margin-bottom:6px}
    .t{font-size:18px;font-weight:700}.sub{font-size:13px;font-weight:600}.meta{text-align:right}.sm{font-size:9.5px;color:#64748b}
    h3{font-size:12px;margin:8px 0 3px}
    .kpi{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.kpi div{border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px}.kpi span{display:block;font-size:9px;color:#64748b}.kpi b{font-size:13px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #cbd5e1;padding:2px 4px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:9.5px;font-weight:600}.n{text-align:right}.best td{background:#ecfdf5;font-weight:600}.short{color:#be123c;font-weight:600}
    .two{display:flex;gap:8px}.two>div{flex:1;min-width:0}.strip{margin-bottom:4px;break-inside:avoid}.sl{font-size:9px;color:#64748b}`;

const wrap = (title: string, body: string) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}
  </style></head><body>${body}</body></html>`;

/** 1 ผ้า = 1 หน้า (ส่วนเนื้อหา) */
function fabricSection(input: BuyInput, res: BuyResult, compare: WidthCompareRow[], meta: FabricBuyPrintMeta, extra?: string): string {
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
    sheet ? ["ใช้ต่อใบ", `${fmt(res.per_unit, 3)} ผืน`] : ["ใช้ต่อใบ", `${fmt(res.per_unit_cm, 1)} ซม.`],
    ["ใช้ผ้าคุ้ม", `${fmt(res.efficiency_pct, 1)}%`],
  ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const repeat = Number(input.repeat_cm) || 0;
  const settings = [
    ["จำนวนผลิต", `${fmt(input.qty, 0)} ใบ`],
    ["หน้ากว้างเต็ม / ใช้ได้จริง", `${fmt(input.face_width_cm, 1)} / ${fmt(res.usable_width_cm, 1)} ซม. (หักริม ${fmt(Number(input.trim_cm) || 0, 1)})`],
    ["มาเป็น", sheet ? `ผืน (ยาว ${fmt(Number(input.sheet_length_cm) || 0, 1)} ซม.)` : "ม้วน"],
    ["ทางผ้า", input.allow_rotate === false ? "ห้ามหมุน" : "หมุนได้"],
    ["เว้นระหว่างชิ้น", `${fmt(Number(input.gap_cm) || 0, 1)} ซม.`],
    ["เผื่อเสีย / หดตัว", `${fmt(Number(input.waste_pct) || 0, 1)}% / ${fmt(Number(input.shrink_pct) || 0, 1)}%`],
    ...(repeat > 0 ? [["ลายซ้ำ", `${fmt(repeat, 1)} ซม.`]] : []),
    ["ปัดขึ้น", roundLabel],
    ["ราคา", Number(input.price) > 0 ? `฿${fmt(Number(input.price))} / ${u}` : "-"],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  const pieces = input.pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && (p.per_unit > 0 || (p.total ?? 0) > 0))
    .map((p) => {
      const tot = (p.total ?? 0) > 0 ? p.total! : p.per_unit * input.qty;
      const tags = [p.no_rotate ? "ห้ามหมุน" : "", repeat > 0 && p.match ? "ตรงลาย" : ""].filter(Boolean).join(" · ");
      return `<tr><td>${esc(p.label || "-")}</td><td class="n">${fmt(p.width_cm, 1)} × ${fmt(p.length_cm, 1)}</td><td class="n">${fmt(p.per_unit, 2)}</td><td class="n">${fmt(tot, 0)}</td><td>${tags}</td></tr>`;
    }).join("");
  const cmp = compare.length > 1 ? `<h3>เทียบหน้ากว้าง</h3><table><thead><tr><th>หน้ากว้าง</th><th class="n">ราคา/${u}</th><th class="n">ต้องใช้</th><th class="n">ปัดแล้ว</th><th class="n">คุ้ม %</th><th class="n">งบ</th></tr></thead><tbody>${compare.map((c) => c.result.ok
    ? `<tr${c.best ? ' class="best"' : ""}><td>${fmt(c.face_width_cm, 1)} ซม.${c.best ? " ★" : ""}</td><td class="n">${c.price != null ? fmt(c.price) : "-"}</td><td class="n">${fmt(c.result.need)}</td><td class="n">${fmt(c.result.need_rounded)}</td><td class="n">${fmt(c.result.efficiency_pct, 1)}</td><td class="n">${c.price != null ? `฿${fmt(c.result.need_rounded * c.price, 0)}` : "-"}</td></tr>`
    : `<tr><td>${fmt(c.face_width_cm, 1)} ซม.</td><td colspan="5">${esc(c.result.error ?? "วางไม่ได้")}</td></tr>`).join("")}</tbody></table>` : "";
  const lay = res.layout?.ok ? layoutSvg(res.layout, res.usable_width_cm, sheet ? Number(input.sheet_length_cm) || null : null) : "";
  return `<section class="pg">
    <header><div><div class="t">สรุปคิดผ้าก่อนซื้อ</div><div class="sub">${esc(meta.fabric_name ?? "ผ้า (ไม่ระบุรหัส)")}</div>${meta.source_label ? `<div class="sm">ชิ้นตัดจาก: ${esc(meta.source_label)}</div>` : ""}${extra ?? ""}</div>
      <div class="meta"><div>วันที่ ${esc(meta.date)}</div><div class="sm">ตัวเลขประมาณจากการวางชิ้นแบบกรอบสี่เหลี่ยม</div></div></header>
    ${res.ok ? `<div class="kpi">${kpi}</div>` : `<p class="short">${esc(res.error ?? "คำนวณไม่ได้")}</p>`}
    <div class="two"><div><h3>ค่าที่ตั้ง</h3><table><tbody>${settings}</tbody></table></div>
      <div><h3>ชิ้นตัด</h3><table><thead><tr><th>ชิ้น</th><th class="n">กว้าง×ยาว (ซม.)</th><th class="n">ต่อใบ</th><th class="n">รวม</th><th></th></tr></thead><tbody>${pieces}</tbody></table></div></div>
    ${cmp}
    ${lay ? `<h3>ผังการวาง</h3>${lay}` : ""}
  </section>`;
}

export function renderFabricBuyHtml(input: BuyInput, res: BuyResult, compare: WidthCompareRow[], meta: FabricBuyPrintMeta): string {
  return wrap(meta.title, fabricSection(input, res, compare, meta));
}

export type FamilyPrintRow = { input: BuyInput; res: BuyResult; fabric_name: string; colors: string[] };

/** ทั้งตระกูล: หน้าแรก = ตารางสรุปทุกผ้า (ต้องซื้อ/งบรวม) · ตามด้วยหน้ารายผ้า */
export function renderFabricBuyFamilyHtml(rows: FamilyPrintRow[], meta: { title: string; date: string; parent_label: string; colors: { label: string; qty: number }[] }): string {
  const totalBuy = rows.reduce((s, r) => s + (r.res.cost_buy ?? 0), 0);
  const colorTxt = meta.colors.filter((c) => c.qty > 0).map((c) => `${esc(c.label)} ${fmt(c.qty, 0)}`).join(" · ");
  const body = rows.map((r) => {
    const u = esc(r.res.unit_label);
    return r.res.ok
      ? `<tr><td>${esc(r.fabric_name)}</td><td>${esc(r.colors.join(", "))}</td><td class="n">${fmt(r.input.qty, 0)}</td><td class="n">${fmt(r.res.need)} ${u}</td><td class="n">${fmt(r.res.need_rounded)} ${u}</td><td class="n">${fmt(r.res.stock)}</td><td class="n${r.res.to_buy > 0 ? " short" : ""}">${r.res.to_buy > 0 ? `${fmt(r.res.to_buy)} ${u}` : "พอ"}</td><td class="n">${r.res.cost_buy != null ? `฿${fmt(r.res.cost_buy, 0)}` : "-"}</td></tr>`
      : `<tr><td>${esc(r.fabric_name)}</td><td>${esc(r.colors.join(", "))}</td><td class="n">${fmt(r.input.qty, 0)}</td><td colspan="5" class="short">${esc(r.res.error ?? "คำนวณไม่ได้")}</td></tr>`;
  }).join("");
  const summary = `<section class="pg">
    <header><div><div class="t">สรุปผ้าที่ต้องซื้อ (ทั้งตระกูล)</div><div class="sub">${esc(meta.parent_label)}</div><div class="sm">จำนวนต่อสี: ${colorTxt || "-"}</div></div>
      <div class="meta"><div>วันที่ ${esc(meta.date)}</div><div>งบซื้อเพิ่มรวม <b>฿${fmt(totalBuy, 0)}</b></div></div></header>
    <table><thead><tr><th>ผ้า</th><th>ใช้ในสี</th><th class="n">ใบ</th><th class="n">ต้องใช้</th><th class="n">ควรซื้อ</th><th class="n">สต็อก</th><th class="n">ต้องซื้อเพิ่ม</th><th class="n">งบ</th></tr></thead><tbody>${body}</tbody></table>
  </section>`;
  const pages = rows.map((r) => fabricSection(r.input, r.res, [], { title: meta.title, date: meta.date, fabric_name: r.fabric_name, source_label: meta.parent_label }, `<div class="sm">ใช้ในสี: ${esc(r.colors.join(", "))}</div>`)).join("");
  return wrap(meta.title, summary + pages);
}
