/**
 * ใบพิมพ์ "คิดผ้าก่อนซื้อ" (A4) — เลือกได้ว่าพิมพ์ใบไหน ส่วนไหน ผ้าไหน ผังช่วงไหน (เจ้าของเลือกแบบ A จาก widget 2026-11-17)
 *
 *   ใบส่งจัดซื้อ   = 1 หน้า ตารางผ้าที่ต้องสั่ง (ผ้า/รหัส/ต้องใช้/ควรซื้อ/สต็อก/ต้องสั่ง/ม้วน/ราคา/งบ/ร้าน) + ช่องเซ็น (lib/print-signoff)
 *   ใบสรุปคิดผ้า  = 1 ผ้า = 1 หน้า · แบบ A: กล่อง "ต้องซื้อเพิ่ม" ตัวใหญ่ + กล่องตัวเลขย่อย → ค่าที่ตั้ง | ชิ้นตัด → เทียบหน้ากว้าง → ผังการวางเป็นภาพย่อ
 *   ใบวิธีตัด     = ส่ง section จาก lib/fabric-cut-sheet (cutSheetSection) มาต่อท้ายไฟล์เดียวกันได้
 *
 *   ผังภาพย่อ: ผ้าม้วนแบ่งช่วงละ 90 ซม. (เท่าใบวิธีตัด) · ผ้าผืน = ผืนละภาพ · เลือกช่วงที่จะพิมพ์ได้ (layoutPick) · 2–4 ภาพต่อแถว
 *   ใช้ที่: app/fabric-calc/print-setup.tsx (หน้าปรับก่อนพิมพ์ = PrintSetupDialog ของกลาง) · เทสต์ lib/__tests__/fabric-buy.test.ts
 */
import type { BuyInput, BuyResult, WidthCompareRow } from "./fabric-buy";
import type { FabricItem, FabricResult } from "./fabric-calc";
import { signoffHtml, SIGNOFF_CSS, BLANK_DATE } from "./print-signoff";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });
const COLORS = [["#c7d2fe", "#4f46e5"], ["#bbf7d0", "#16a34a"], ["#fed7aa", "#ea580c"], ["#fbcfe8", "#db2777"], ["#bae6fd", "#0284c7"], ["#fde68a", "#d97706"], ["#ddd6fe", "#7c3aed"], ["#a5f3fc", "#0891b2"]];
export const LAYOUT_SEG_CM = 90;

// ── ผังการวาง → ช่วง (ภาพย่อ) ─────────────────────────────────────────────
export type LayoutSeg = { index: number; label: string; len: number; items: FabricItem[] };

/** แบ่งผังเป็นช่วง: ผ้าม้วน = ช่วงละ 90 ซม. (ตามความยาวที่วาดได้จริง) · ผ้าผืน = ผืนละช่วง */
export function layoutSegments(res: FabricResult | null | undefined, sheetL: number | null): LayoutSeg[] {
  if (!res?.ok) return [];
  if (sheetL && sheetL > 0) {
    const n = res.sheetsDrawn ?? res.sheetsUsed ?? 1;
    return Array.from({ length: n }, (_, s) => ({
      index: s, label: `ผืนที่ ${s + 1}`, len: sheetL,
      items: res.rows.filter((r) => (r.sheetIndex ?? 0) === s).flatMap((r) => r.items.map((i) => ({ ...i, y: i.y - r.y + (r.yInSheet ?? r.y) }))),
    }));
  }
  const all = res.rows.flatMap((r) => r.items);
  const total = all.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const out: LayoutSeg[] = [];
  for (let from = 0, i = 0; from < total - 1e-6; from += LAYOUT_SEG_CM, i++) {
    const len = Math.min(LAYOUT_SEG_CM, total - from);
    out.push({ index: i, label: `${fmt(from, 0)}–${fmt(from + len, 0)} ซม.`, len, items: all.filter((it) => it.y < from + len - 1e-6 && it.y + it.h > from + 1e-6).map((it) => ({ ...it, y: it.y - from })) });
  }
  return out;
}

let clipSeq = 0;
/** ภาพย่อ 1 ช่วง — viewBox หน่วย ซม. · กว้างบนกระดาษ widthMm */
function segThumb(seg: LayoutSeg, face: number, widthMm: number, colorOf: (k: string) => string[]): string {
  const k = widthMm / face;   // มม. ต่อ ซม.
  const sw = 0.25 / k;
  const body = seg.items.map((it) => {
    const [fill, stroke] = colorOf(it.key);
    let s = `<rect x="${it.x.toFixed(2)}" y="${it.y.toFixed(2)}" width="${it.w.toFixed(2)}" height="${it.h.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw.toFixed(3)}"/>`;
    const fsMm = Math.min(2.4, (it.w * k) / Math.max(1, it.label.length * 0.62 + 1), it.h * k * 0.45);
    if (fsMm >= 1.3) s += `<text x="${(it.x + it.w / 2).toFixed(2)}" y="${(it.y + it.h / 2).toFixed(2)}" font-size="${(fsMm / k).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#0f172a">${esc(it.label)}</text>`;
    return s;
  }).join("");
  const clip = `fbc${++clipSeq}`;
  return `<svg viewBox="0 0 ${face} ${seg.len}" width="${widthMm.toFixed(1)}mm" height="${(seg.len * k).toFixed(1)}mm"><defs><clipPath id="${clip}"><rect width="${face}" height="${seg.len}"/></clipPath></defs><rect width="${face}" height="${seg.len}" fill="#f8fafc" stroke="#64748b" stroke-width="${sw.toFixed(3)}"/><g clip-path="url(#${clip})">${body}</g></svg>`;
}

/** ภาพย่อจิ๋วของทุกช่วง (ให้หน้าปรับก่อนพิมพ์ทำปุ่มเลือกช่วง) · max = จำกัดจำนวน (ผังยาวมาก) */
export function layoutSegPickThumbs(res: FabricResult | null | undefined, face: number, sheetL: number | null, widthMm = 12, max = 60): { index: number; label: string; svg: string }[] {
  const segs = layoutSegments(res, sheetL);
  if (!(face > 0)) return [];
  const keys = [...new Set(segs.flatMap((s) => s.items.map((i) => i.key)))];
  const colorOf = (key: string) => COLORS[Math.max(0, keys.indexOf(key)) % COLORS.length];
  return segs.slice(0, max).map((s) => ({ index: s.index, label: s.label, svg: segThumb({ ...s, items: s.items.map((i) => ({ ...i, label: "" })) }, face, widthMm, colorOf) }));
}

/** ผังเป็นภาพย่อหลายช่วงต่อแถว · pick = เลขช่วงที่จะพิมพ์ (null = 3 ช่วงแรก) */
export function layoutThumbsHtml(res: FabricResult | null | undefined, face: number, sheetL: number | null, pick: number[] | null, cols: number): string {
  const segs = layoutSegments(res, sheetL);
  if (!segs.length || !(face > 0)) return "";
  const want = pick == null ? segs.slice(0, 3) : segs.filter((s) => pick.includes(s.index));
  if (!want.length) return "";
  const c = Math.max(2, Math.min(4, Math.round(cols)));
  const widthMm = (186 - (c - 1) * 4) / c;
  const keys = [...new Set(segs.flatMap((s) => s.items.map((i) => i.key)))];
  const colorOf = (key: string) => COLORS[Math.max(0, keys.indexOf(key)) % COLORS.length];
  const cells = want.map((s) => `<figure class="th">${segThumb(s, face, widthMm, colorOf)}<figcaption>${segs.length > 1 ? `ช่วง ${s.index + 1}/${segs.length} · ` : ""}${esc(s.label)}</figcaption></figure>`).join("");
  const note = [
    want.length < segs.length ? `แสดง ${want.length} จาก ${segs.length} ${sheetL ? "ผืน" : "ช่วง"} — ที่เหลือวางลักษณะเดียวกัน` : "",
    res?.sampledFrom ? `ล็อตใหญ่: ผังนี้จำลอง ${fmt(res.sampledFrom.simulated, 0)} จาก ${fmt(res.sampledFrom.total, 0)} ชิ้น แล้วขยายผล` : "",
  ].filter(Boolean).join(" · ");
  return `<div class="thg" style="grid-template-columns:repeat(${c},minmax(0,1fr))">${cells}</div>${note ? `<p class="sm">* ${esc(note)}</p>` : ""}`;
}

// ── ตัวเลือกการพิมพ์ ───────────────────────────────────────────────────────
export type FabricPrintSections = { kpi: boolean; settings: boolean; pieces: boolean; compare: boolean; layout: boolean };
export type FabricPrintOpts = {
  po: boolean;                                // ใบส่งจัดซื้อ
  summary: boolean;                           // ใบสรุปคิดผ้า
  sections: FabricPrintSections;
  layoutPick: Record<string, number[]>;       // key ผ้า → ช่วงที่เลือก (ไม่มี = 3 ช่วงแรก)
  thumbCols: number;                          // ภาพย่อต่อแถว 2–4
};
export const DEFAULT_FABRIC_PRINT: FabricPrintOpts = {
  po: true, summary: true,
  sections: { kpi: true, settings: true, pieces: true, compare: false, layout: true },
  layoutPick: {}, thumbCols: 3,
};

export type FabricPrintItem = {
  key: string;                    // กุญแจผ้า (รหัสวัตถุดิบ / หน้ากว้าง) — ใช้จำช่วงผังที่เลือก
  input: BuyInput; res: BuyResult; compare?: WidthCompareRow[];
  fabric_name: string;
  colors?: string[];              // ทั้งตระกูล: ใช้ในสีไหน
};
export type FabricPrintMeta = {
  title: string; date: string;
  heading?: string | null;        // ชื่องาน (ทั้งตระกูล = Parent SKU)
  source_label?: string | null;   // ชิ้นตัดมาจากไหน
  colors_line?: string | null;    // ทั้งตระกูล: จำนวนต่อสี
  qr_html?: string | null;        // QR ลิงก์กลับหน้าคำนวณ (มีเมื่อบันทึกแล้ว)
};

const sheetLenOf = (input: BuyInput) => (input.form === "sheet" ? Number(input.sheet_length_cm) || null : null);

/** ใบส่งจัดซื้อ — ผ้าทุกตัวที่เลือกในตารางเดียว + รวมงบ + ช่องเซ็น */
function poSheet(items: FabricPrintItem[], meta: FabricPrintMeta): string {
  const fam = items.some((i) => i.colors?.length);
  let total = 0, anyPrice = false;
  const rows = items.map((it, n) => {
    const r = it.res, u = esc(r.unit_label);
    const price = Number(it.input.price) || 0;
    if (r.ok && r.cost_buy != null) { total += r.cost_buy; anyPrice = true; }
    const name = `<b>${esc(it.fabric_name)}</b>${fam && it.colors?.length ? `<div class="sm">ใช้ในสี ${esc(it.colors.join(", "))} · ผลิต ${fmt(it.input.qty, 0)} ใบ</div>` : ""}`;
    if (!r.ok) return `<tr><td class="c">${n + 1}</td><td>${name}</td><td colspan="8" class="short">${esc(r.error ?? "คำนวณไม่ได้")}</td></tr>`;
    const buy = r.to_buy > 0;
    return `<tr${buy ? "" : ' class="enough"'}><td class="c">${n + 1}</td><td>${name}</td><td class="n">${fmt(r.need)}</td><td class="n">${fmt(r.need_rounded)}</td><td class="n">${fmt(r.stock)}</td>
      <td class="n big">${buy ? `${fmt(r.to_buy)} <small>${u}</small>` : "พอแล้ว"}</td><td class="n">${buy && r.rolls ? fmt(r.rolls, 0) : "-"}</td><td class="n">${price > 0 ? fmt(price) : "-"}</td><td class="n">${buy && r.cost_buy != null ? `฿${fmt(r.cost_buy, 0)}` : "-"}</td><td class="blank"></td></tr>`;
  }).join("");
  const unitHead = [...new Set(items.map((i) => i.res.unit_label))].join("/");
  const sign = signoffHtml([
    { title: "ผู้ขอซื้อ", lines: [{ kind: "sign" }, { kind: "date" }] },
    { title: "ผู้อนุมัติ", lines: [{ kind: "sign" }, { kind: "date" }] },
    { title: "ฝ่ายจัดซื้อ (รับเรื่อง)", lines: [{ kind: "sign" }, { kind: "write", label: "สั่งแล้ววันที่", value: BLANK_DATE }] },
  ]);
  return `<section class="pg">
    <header><div><div class="t">ใบส่งจัดซื้อ — ผ้าที่ต้องสั่ง</div>${meta.heading ? `<div class="sub">${esc(meta.heading)}</div>` : ""}${meta.colors_line ? `<div class="sm">${esc(meta.colors_line)}</div>` : ""}${meta.source_label ? `<div class="sm">ชิ้นตัดจาก: ${esc(meta.source_label)}</div>` : ""}</div>
      <div class="meta">${meta.qr_html ? `<div class="qr">${meta.qr_html}<div>สแกนดูที่มา</div></div>` : ""}<div><div>วันที่ ${esc(meta.date)}</div>${anyPrice ? `<div class="tot">งบรวม <b>฿${fmt(total, 0)}</b></div>` : ""}</div></div></header>
    <table class="po"><thead><tr><th class="c">#</th><th>ผ้า</th><th class="n">ต้องใช้</th><th class="n">ควรซื้อ</th><th class="n">สต็อกมี</th><th class="n">ต้องสั่ง</th><th class="n">ม้วน</th><th class="n">ราคา/${esc(unitHead)}</th><th class="n">งบ</th><th>ร้าน / หมายเหตุ</th></tr></thead>
      <tbody>${rows}</tbody>${anyPrice ? `<tfoot><tr><td colspan="8" class="n"><b>รวมงบซื้อเพิ่ม</b></td><td class="n"><b>฿${fmt(total, 0)}</b></td><td></td></tr></tfoot>` : ""}</table>
    <p class="sm">หน่วย: ${esc(unitHead)} · "ต้องใช้" รวมเผื่อเสียแล้ว · "ควรซื้อ" ปัดขึ้นตามที่ตั้ง · "ต้องสั่ง" = ควรซื้อ − สต็อก · ตัวเลขประมาณจากการวางชิ้นบนผ้า</p>
    ${sign}
  </section>`;
}

/** ใบสรุปคิดผ้า (แบบ A) — 1 ผ้า = 1 หน้า */
function summarySheet(it: FabricPrintItem, meta: FabricPrintMeta, o: FabricPrintOpts): string {
  const { input, res } = it;
  const u = esc(res.unit_label);
  const sheet = input.form === "sheet";
  const s = o.sections;
  const buy = res.to_buy > 0;
  const big = `<div class="kb${buy ? "" : " ok"}"><span>${buy ? "ต้องซื้อเพิ่ม" : "สต็อกพอ ไม่ต้องซื้อ"}</span><b>${buy ? `${fmt(res.to_buy)} ${u}` : "0"}</b><em>${[res.rolls && buy ? `${fmt(res.rolls, 0)} ม้วน` : "", res.cost_buy != null && buy ? `งบ ฿${fmt(res.cost_buy, 0)}` : ""].filter(Boolean).join(" · ") || "&nbsp;"}</em></div>`;
  const small = [
    ["ต้องใช้จริง (รวมเผื่อเสีย)", `${fmt(res.need)} ${u}`],
    ["ควรซื้อ (ปัดแล้ว)", `${fmt(res.need_rounded)} ${u}`],
    ["สต็อกมี", `${fmt(res.stock)} ${u}`],
    ["ใช้ผ้าคุ้ม", `${fmt(res.efficiency_pct, 1)}%`],
    sheet ? ["ใช้ต่อใบ", `${fmt(res.per_unit, 3)} ผืน`] : ["ใช้ต่อใบ", `${fmt(res.per_unit_cm, 1)} ซม.`],
    ...(res.cost_per_unit != null ? [["ค่าผ้าต่อใบ", `฿${fmt(res.cost_per_unit)}`]] : []),
  ].map(([k, v]) => `<div class="ks"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const kpi = s.kpi ? (res.ok ? `<div class="kg">${big}${small}</div>` : `<p class="short">${esc(res.error ?? "คำนวณไม่ได้")}</p>`) : "";

  const repeat = Number(input.repeat_cm) || 0;
  const roundLabel = sheet ? "ผืนเต็ม" : input.round === "roll" ? `ม้วนเต็ม (${fmt(Number(input.roll_length) || 0)} ${u})` : input.round === "none" ? "ไม่ปัด" : `${u}เต็ม`;
  const settings = s.settings ? `<div><h3>ค่าที่ตั้ง</h3><table class="kv"><tbody>${[
    ["จำนวนผลิต", `${fmt(input.qty, 0)} ใบ`],
    ["หน้ากว้าง เต็ม / ใช้ได้", `${fmt(input.face_width_cm, 1)} / ${fmt(res.usable_width_cm, 1)} ซม.`],
    ["มาเป็น", sheet ? `ผืน ยาว ${fmt(Number(input.sheet_length_cm) || 0, 1)} ซม.` : "ม้วน"],
    ["ทางผ้า", input.allow_rotate === false ? "ห้ามหมุน" : "หมุนได้"],
    ["เผื่อเสีย / หดตัว", `${fmt(Number(input.waste_pct) || 0, 1)}% / ${fmt(Number(input.shrink_pct) || 0, 1)}%`],
    ...(Number(input.gap_cm) > 0 ? [["เว้นระหว่างชิ้น", `${fmt(Number(input.gap_cm), 1)} ซม.`]] : []),
    ...(repeat > 0 ? [["ลายซ้ำ", `${fmt(repeat, 1)} ซม.`]] : []),
    ["ปัดขึ้น", roundLabel],
    ["ราคา", Number(input.price) > 0 ? `฿${fmt(Number(input.price))} / ${u}` : "-"],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div>` : "";

  const pieceRows = input.pieces.filter((p) => p.width_cm > 0 && p.length_cm > 0 && (p.per_unit > 0 || (p.total ?? 0) > 0)).map((p, i) => {
    const tot = (p.total ?? 0) > 0 ? p.total! : p.per_unit * input.qty;
    const tags = [p.no_rotate ? "ห้ามหมุน" : "", repeat > 0 && p.match ? "ตรงลาย" : ""].filter(Boolean).join(" · ");
    return `<tr><td class="c">${i + 1}</td><td>${esc(p.label || "-")}${tags ? ` <span class="sm">${tags}</span>` : ""}</td><td class="n">${fmt(p.width_cm, 1)} × ${fmt(p.length_cm, 1)}</td><td class="n">${fmt(p.per_unit, 2)}</td><td class="n">${fmt(tot, 0)}</td></tr>`;
  }).join("");
  const pieces = s.pieces ? `<div><h3>ชิ้นตัด</h3><table><thead><tr><th class="c">#</th><th>ชิ้น</th><th class="n">กว้าง × ยาว ซม.</th><th class="n">ต่อใบ</th><th class="n">รวม</th></tr></thead><tbody>${pieceRows}</tbody></table></div>` : "";
  const two = settings || pieces ? `<div class="two${settings && pieces ? "" : " one"}">${settings}${pieces}</div>` : "";

  const cmpRows = it.compare ?? [];
  const cmp = s.compare && cmpRows.length > 1 ? `<h3>เทียบหน้ากว้าง</h3><table><thead><tr><th>หน้ากว้าง</th><th class="n">ราคา/${u}</th><th class="n">ต้องใช้</th><th class="n">ปัดแล้ว</th><th class="n">คุ้ม %</th><th class="n">งบ</th></tr></thead><tbody>${cmpRows.map((c) => c.result.ok
    ? `<tr${c.best ? ' class="best"' : ""}><td>${fmt(c.face_width_cm, 1)} ซม.${c.best ? " ★ คุ้มสุด" : ""}</td><td class="n">${c.price != null ? fmt(c.price) : "-"}</td><td class="n">${fmt(c.result.need)}</td><td class="n">${fmt(c.result.need_rounded)}</td><td class="n">${fmt(c.result.efficiency_pct, 1)}</td><td class="n">${c.price != null ? `฿${fmt(c.result.need_rounded * c.price, 0)}` : "-"}</td></tr>`
    : `<tr><td>${fmt(c.face_width_cm, 1)} ซม.</td><td colspan="5">${esc(c.result.error ?? "วางไม่ได้")}</td></tr>`).join("")}</tbody></table>` : "";

  const thumbs = s.layout ? layoutThumbsHtml(res.layout, res.usable_width_cm, sheetLenOf(input), o.layoutPick[it.key] ?? null, o.thumbCols) : "";
  const lay = thumbs ? `<h3>ผังการวาง <span class="sm">(ด้านกว้างของภาพ = หน้าผ้า ${fmt(res.usable_width_cm, 1)} ซม. · ความยาวผ้าไล่ลง)</span></h3>${thumbs}` : "";

  return `<section class="pg">
    <header><div><div class="t">สรุปคิดผ้าก่อนซื้อ</div><div class="sub">${esc(it.fabric_name)}</div>
      <div class="sm">${[meta.heading, it.colors?.length ? `ใช้ในสี ${it.colors.join(", ")}` : "", meta.source_label ? `ชิ้นตัดจาก ${meta.source_label}` : ""].filter(Boolean).map((x) => esc(String(x))).join(" · ")}</div></div>
      <div class="meta">${meta.qr_html ? `<div class="qr">${meta.qr_html}</div>` : ""}<div><div>วันที่ ${esc(meta.date)}</div><div class="sm">ประมาณจากการวางชิ้นบนผ้า</div></div></div></header>
    ${kpi}${two}${cmp}${lay}
  </section>`;
}

const CSS = `
    @page{size:A4;margin:10mm}
    body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;color:#0f172a;margin:0;font-size:11px}
    .pg{page-break-after:always}.pg:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:0.4mm solid #0f172a;padding-bottom:4px;margin-bottom:8px}
    .t{font-size:18px;font-weight:700}.sub{font-size:13px;font-weight:600}.sm{font-size:9.5px;color:#64748b;font-weight:400}
    .meta{display:flex;gap:8px;align-items:flex-start;text-align:right}.tot{font-size:12px;margin-top:2px}
    .qr{text-align:center;font-size:8px;color:#64748b}.qr img{width:17mm;height:17mm;display:block}
    h3{font-size:12px;margin:10px 0 4px}
    table{width:100%;border-collapse:collapse;margin-bottom:4px}
    th,td{border:0;border-bottom:0.15mm solid #cbd5e1;padding:3px 4px;text-align:left;vertical-align:top}
    thead th{background:#f1f5f9;font-size:9.5px;font-weight:600;border-bottom:0.25mm solid #94a3b8}
    .n{text-align:right}.c{text-align:center;width:6mm}.short{color:#be123c;font-weight:600}.best td{background:#ecfdf5;font-weight:600}
    .kv th{background:none;width:42%;color:#475569;font-weight:400;font-size:10.5px}
    .kg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2mm;margin-bottom:2mm}
    .kb{grid-column:span 2;grid-row:span 2;background:#eef2ff;border:0.3mm solid #a5b4fc;border-radius:2mm;padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center}
    .kb.ok{background:#f0fdf4;border-color:#86efac}.kb span{font-size:11px;color:#475569}.kb b{font-size:28px;line-height:1.15;color:#3730a3}.kb.ok b{color:#166534}.kb em{font-style:normal;font-size:12px;color:#334155}
    .ks{border:0.2mm solid #cbd5e1;border-radius:1.5mm;padding:1.5mm 2.5mm}.ks span{display:block;font-size:9px;color:#64748b}.ks b{font-size:13px}
    .two{display:grid;grid-template-columns:minmax(0,0.85fr) minmax(0,1.15fr);gap:5mm}.two.one{grid-template-columns:1fr}
    .thg{display:grid;gap:4mm;align-items:start}.th{margin:0;break-inside:avoid}.th svg{display:block}.th figcaption{font-size:9px;color:#64748b;margin-top:1mm;text-align:center}
    .po td{padding:4px}.po .big{font-size:14px;font-weight:700;color:#3730a3;white-space:nowrap}.po .big small{font-size:10px;font-weight:400;color:#475569}
    .po .enough td{color:#64748b}.po .enough .big{color:#166534;font-size:11px}.po .blank{width:28mm}
    .po tfoot td{border-top:0.3mm solid #0f172a;border-bottom:0;font-size:12px}
    ${SIGNOFF_CSS}`;

const wrap = (title: string, body: string, extraCss = "") => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${extraCss}${CSS}
  </style></head><body>${body || '<p style="padding:20mm;text-align:center;color:#94a3b8">ยังไม่ได้เลือกใบที่จะพิมพ์</p>'}</body></html>`;

/**
 * ประกอบใบพิมพ์ทั้งไฟล์ — ใบส่งจัดซื้อ (หน้าแรก) → ใบสรุปรายผ้า → ใบวิธีตัด (cut = section จาก cutSheetSection + CUT_SHEET_CSS)
 * ⚠️ CSS ใบวิธีตัดวางก่อน CSS ใบนี้ (กฎตาราง/หัวใบของใบนี้ชนะ · class ของใบวิธีตัดไม่ชนกัน)
 */
export function renderFabricPrintHtml(items: FabricPrintItem[], meta: FabricPrintMeta, o: FabricPrintOpts, cut?: { html: string; css: string }): string {
  const parts = [
    o.po && items.length ? poSheet(items, meta) : "",
    o.summary ? items.map((it) => summarySheet(it, meta, o)).join("") : "",
    cut?.html ?? "",
  ];
  return wrap(meta.title, parts.join(""), cut?.html ? cut.css : "");
}

// ── ตัวเดิม (คงชื่อไว้ให้ที่อื่น/เทสต์เรียกได้) ───────────────────────────
export type FabricBuyPrintMeta = { title: string; date: string; fabric_name: string | null; source_label: string | null };
export function renderFabricBuyHtml(input: BuyInput, res: BuyResult, compare: WidthCompareRow[], meta: FabricBuyPrintMeta): string {
  return renderFabricPrintHtml([{ key: "one", input, res, compare, fabric_name: meta.fabric_name ?? "ผ้า (ไม่ระบุรหัส)" }],
    { title: meta.title, date: meta.date, source_label: meta.source_label },
    { ...DEFAULT_FABRIC_PRINT, po: false, sections: { ...DEFAULT_FABRIC_PRINT.sections, compare: true } });
}
