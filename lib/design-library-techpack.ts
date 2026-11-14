/**
 * 📚 Design Library — ใบสั่งทำตัวอย่างให้ช่าง (Tech pack) · pure (เทสต์ lib/design-library-techpack.test.ts)
 *
 * ใช้ระบบแม่แบบเอกสารกลาง: entity_type "dl_techpack" (แก้หน้าตาที่ /admin/report-templates) · ไม่มีแม่แบบใน DB = DEFAULT_DL_TECHPACK_TEMPLATE
 * buildTechpackData → ตัวแปร Mustache: ข้อความ {{x}} · บล็อก HTML {{{x_html}}} · ลูป {{#materials}}…{{/materials}}
 * ต่างจากใบสรุป (DESIGN BRIEF — ส่ง GPT): ไม่มี prompt · ไม่มีราคา · มีจำนวนวัสดุ + ช่องเซ็น
 * หน้าพิมพ์: /print/design-library/[id]/techpack?cw=<ชุดสี>
 */
import {
  bothUnits, calloutSvg, colorwayTableHtml, handleLength, MAIN_COLORWAY_LABEL, PANELS, pickInfo, pickThumbSvg, pocketPanelSvg, usesHwColor, categoryOf, bodyPickOf,
  type BriefInput, type Choice, type Spec,
} from "@/lib/design-library";
import type { CostLine } from "@/lib/design-library-cost";

export const TECHPACK_ENTITY = "dl_techpack";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const qtyText = (n: number) => (n > 0 ? n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "");

export type TechpackInput = {
  template: BriefInput["template"]; recipe: BriefInput["recipe"];
  /** สูตรตามชุดสี (applyColorway แล้ว) · baseSpec = สูตรเต็ม (ตารางชุดสี) */
  spec: Spec; baseSpec: Spec; colorwayName: string | null;
  choices: Choice[];
  /** บรรทัดวัสดุจาก estimateCost (ใช้แค่ ปริมาณ/หน่วย — ไม่พิมพ์ราคา) */
  lines: CostLine[];
  /** รูปผลจาก GPT ล่าสุดของชุดสีนี้ (4 มุม / ข้างใน) */
  renders: { grid4?: string | null; inside?: string | null };
  img: (key: string, w: number) => string;
  dateText: string; bagType: string;
};

export function buildTechpackData(t: TechpackInput): Record<string, unknown> {
  const { spec, template: tp, recipe: r } = t;
  const hw = t.choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const body = bodyPickOf(spec);
  const imgTag = (key: string | null | undefined, cls: string) => (key ? `<img class="${cls}" src="${esc(t.img(key, 1400))}" alt="" />` : "");
  const brief: BriefInput = { template: tp, recipe: r, spec, choices: t.choices, stock: {}, useVector: !!tp.vector_image_key, img: t.img, dateText: t.dateText };

  // วัสดุ: บรรทัดจากตัวคิดปริมาณ (รวมผ้าซ้ำแล้ว) + โน้ตของจุด
  const lineByPin = new Map(t.lines.filter((l) => l.pinIndex != null).map((l) => [l.pinIndex!, l]));
  const materials = spec.pins.map((p, i) => {
    const cat = categoryOf(t.choices, p.cat);
    const l = lineByPin.get(i);
    const sameAsBody = p.pick?.kind === "same_as_body";
    const isHw = usesHwColor(cat);
    const info = pickInfo(p.pick, { bodyPick: body });
    const merged = !l && t.lines.find((x) => x.key === `area:${p.cat}`);   // ผ้าหมวดเดียวกันจุดที่ 2+ = รวมในบรรทัดแรกแล้ว
    return {
      idx: i + 1, part: cat?.name ?? (p.cat || "—"),
      code: info.code === "LOGO" ? "" : info.code, name: sameAsBody ? "ใช้วัสดุเดียวกับตัวกระเป๋า" : (info.name || (p.note ? "" : "ยังไม่เลือก")),
      color: isHw && hw ? `สีอะไหล่ ${hw.name}` : p.pick?.kind === "color" ? `${p.pick.code}${p.pick.hex ? ` ${p.pick.hex}` : ""}` : "",
      qty: l ? qtyText(l.qty) : sameAsBody ? "(รวมในผ้าตัว)" : merged ? `(รวมในจุดที่ ${merged.pinIndex! + 1})` : "", uom: l && l.qty > 0 ? l.uom : "",
      how: l?.detail ?? "",
      note: p.note,
      thumb_html: pickThumbSvg(p.pick, `width="64" height="64"`, t.img, { bodyPick: body, hwHex: hw?.hex, isHw }),
    };
  });

  const pocketsHtml = PANELS.map((p) => {
    const boxes = spec.pockets[p.key];
    const notes = boxes.map((x, i) => {
      const tt = t.choices.find((c) => c.list_key === "pocket_type" && c.code === x.type);
      return `<div class="tp-pk-n">${i + 1}) ${esc(tt?.name ?? "ช่อง")} ${bothUnits(x.w)} × ${bothUnits(x.h)} · ห่างบน ${x.y} ซม. · ห่างซ้าย ${x.x} ซม.${x.note ? ` · ${esc(x.note)}` : ""}</div>`;
    }).join("");
    return `<div class="tp-pk">${pocketPanelSvg(spec, p.key, t.choices)}${notes}</div>`;
  }).join("");

  const h = spec.handle;
  return {
    code: tp.code, template_name: tp.name, bag_type: t.bagType, recipe_no: r.seq, recipe_name: r.name ?? "",
    colorway: t.colorwayName ?? MAIN_COLORWAY_LABEL, has_colorways: t.baseSpec.colorways.length > 0,
    date_th: t.dateText, made_by: r.created_by_name ?? "", note: r.note ?? "", has_note: !!r.note,
    size_w: bothUnits(spec.size.w), size_h: bothUnits(spec.size.h), size_d: bothUnits(spec.size.d),
    strap: spec.size.strap > 0 ? bothUnits(spec.size.strap) : "ไม่มี",
    handle_count: h.count > 0 ? `${h.count} หู` : "ไม่มีหู", has_handle: h.count > 0,
    handle_drop: bothUnits(h.drop), handle_w: bothUnits(h.w), handle_gap: bothUnits(h.gap),
    handle_total: `${bothUnits(handleLength(h))}${h.total > 0 ? "" : " (ประมาณ)"}`,
    hw_color: hw?.name ?? "—",
    photo_html: imgTag(tp.image_key, "tp-photo"), vector_html: imgTag(tp.vector_image_key, "tp-photo"),
    render_html: imgTag(t.renders.grid4, "tp-render"), inside_html: imgTag(t.renders.inside, "tp-render"),
    has_renders: !!(t.renders.grid4 || t.renders.inside),
    callout_html: calloutSvg(brief),
    materials, material_count: materials.length,
    pockets_html: pocketsHtml, pocket_count: PANELS.reduce((s, p) => s + spec.pockets[p.key].length, 0),
    colorway_table_html: t.baseSpec.colorways.length ? colorwayTableHtml(t.baseSpec, t.choices, t.img) : "",
  };
}

// ─── แม่แบบเริ่มต้น (แก้ได้ที่ /admin/report-templates เอกสาร "ใบสั่งทำตัวอย่าง (Design Library)") ───
export const DEFAULT_DL_TECHPACK_TEMPLATE = {
  header_html: `<div class="tp-hd">
  <div><div class="tp-title">ใบสั่งทำตัวอย่าง</div><div class="tp-sub">SAMPLE ORDER · Design Library</div></div>
  <div class="tp-meta"><b>{{code}}</b> · {{template_name}}<br/>สูตร #{{recipe_no}} {{recipe_name}}{{#has_colorways}} · <b>{{colorway}}</b>{{/has_colorways}}<br/>{{date_th}}{{#made_by}} · ผู้สั่ง {{made_by}}{{/made_by}}</div>
</div>`,
  body_html: `<div class="tp-top">
  <div class="tp-callout">{{{callout_html}}}</div>
</div>
<table class="tp-kv">
  <tr><th>ประเภท</th><td>{{bag_type}}</td><th>สีอะไหล่ทั้งใบ</th><td>{{hw_color}}</td></tr>
  <tr><th>กว้าง</th><td>{{size_w}}</td><th>สูง</th><td>{{size_h}}</td></tr>
  <tr><th>หนา (ข้าง)</th><td>{{size_d}}</td><th>สายยาว</th><td>{{strap}}</td></tr>
  <tr><th>หู</th><td>{{handle_count}}</td><th>ความยาวรวมหู</th><td>{{#has_handle}}{{handle_total}}{{/has_handle}}</td></tr>
  {{#has_handle}}<tr><th>ความสูงหู</th><td>{{handle_drop}}</td><th>กว้างหู / ระยะห่าง</th><td>{{handle_w}} / {{handle_gap}}</td></tr>{{/has_handle}}
</table>
{{#has_note}}<div class="tp-note"><b>หมายเหตุ:</b> {{note}}</div>{{/has_note}}
<h4>วัสดุ ({{material_count}} จุด)</h4>
<table class="tp-mat">
  <thead><tr><th style="width:6%">#</th><th style="width:11%">รูป</th><th style="width:14%">ส่วน</th><th>รหัส · ชื่อ</th><th style="width:15%">สี</th><th style="width:13%">จำนวน</th><th style="width:20%">โน้ต</th></tr></thead>
  <tbody>{{#materials}}<tr><td>{{idx}}</td><td>{{{thumb_html}}}</td><td>{{part}}</td><td><b>{{code}}</b> {{name}}<div class="tp-how">{{how}}</div></td><td>{{color}}</td><td>{{qty}} {{uom}}</td><td>{{note}}</td></tr>{{/materials}}</tbody>
</table>
<div class="tp-hint">จำนวนเป็นค่าประมาณจากขนาด (รวมเผื่อเสียแล้ว) — ช่างตรวจกับแพทเทิร์นจริงก่อนตัด</div>
<h4>ช่อง ({{pocket_count}} ช่อง)</h4>
<div class="tp-pks">{{{pockets_html}}}</div>
{{{colorway_table_html}}}
{{#has_renders}}<h4>รูปตัวอย่างที่ต้องการ</h4><div class="tp-renders">{{{render_html}}}{{{inside_html}}}</div>{{/has_renders}}
<div class="tp-sign">
  <div><div class="tp-line"></div>ผู้สั่งทำ / วันที่</div>
  <div><div class="tp-line"></div>ช่างทำตัวอย่าง / วันที่รับ</div>
  <div><div class="tp-line"></div>ผู้ตรวจตัวอย่าง / วันที่</div>
</div>`,
  footer_html: ``,
  custom_css: `
.doc { padding: 9mm 11mm; font-size: 10pt; }
.tp-hd { display: flex; gap: 4mm; border-bottom: 0.5mm solid #1f1f1f; padding-bottom: 2mm; margin-bottom: 3mm; }
.tp-title { font-size: 17pt; font-weight: 700; } .tp-sub { color: #666; font-size: 9pt; }
.tp-meta { margin-left: auto; text-align: right; color: #333; font-size: 9.5pt; line-height: 1.5; }
.tp-callout svg { max-height: 120mm; }
h4 { font-size: 11pt; margin: 4mm 0 1.5mm; border-bottom: 0.15mm solid #ccc; padding-bottom: 1mm; }
.tp-kv { width: 100%; border-collapse: collapse; margin-top: 2mm; }
.tp-kv th, .tp-kv td { border: 0.15mm solid #d4d4d4; padding: 1.2mm 2mm; text-align: left; }
.tp-kv th { background: #f6f4ef; color: #555; font-weight: 500; width: 17%; }
.tp-note { margin-top: 2mm; padding: 1.5mm 2mm; background: #faeeda; border-radius: 1mm; }
.tp-mat { width: 100%; border-collapse: collapse; }
.tp-mat th, .tp-mat td { border-bottom: 0.15mm solid #e2e2e2; padding: 1mm; text-align: left; vertical-align: middle; }
.tp-mat th { color: #777; font-weight: 400; font-size: 9pt; }
.tp-mat tr { break-inside: avoid; }
.tp-how { color: #999; font-size: 8pt; }
.tp-hint { color: #888; font-size: 8.5pt; margin-top: 1mm; }
.tp-pks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; } .tp-pk-n { font-size: 8.5pt; color: #444; }
.tp-renders { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; }
.tp-render { width: 100%; max-height: 80mm; object-fit: contain; border: 0.15mm solid #e2e2e2; }
.tp-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 10mm; text-align: center; color: #555; font-size: 9pt; break-inside: avoid; }
.tp-line { border-bottom: 0.2mm solid #333; height: 12mm; margin-bottom: 1.5mm; }
table { page-break-inside: auto; } h4 { break-after: avoid; }
`,
};

/** ข้อมูลตัวอย่างสำหรับหน้าแก้แม่แบบ (/admin/report-templates) — ของสมมุติ */
export const DL_TECHPACK_SAMPLE_DATA: Record<string, unknown> = {
  code: "HANB-001", template_name: "กระเป๋าถือ ทรงกล่อง", bag_type: "กระเป๋าถือ", recipe_no: 3, recipe_name: "หนังมิ้นต์",
  colorway: "สีมิ้นต์", has_colorways: true, date_th: "14 พ.ย. 2569", made_by: "ทีมออกแบบ", note: "ขอบเย็บสองเส้น", has_note: true,
  size_w: "30 cm (11.8 in)", size_h: "22 cm (8.7 in)", size_d: "12 cm (4.7 in)", strap: "ไม่มี",
  handle_count: "2 หู", has_handle: true, handle_drop: "18 cm (7.1 in)", handle_w: "3 cm (1.2 in)", handle_gap: "12 cm (4.7 in)", handle_total: "54 cm (21.3 in) (ประมาณ)",
  hw_color: "ทอง", photo_html: "", vector_html: "", render_html: "", inside_html: "", has_renders: false,
  callout_html: `<div style="height:60mm;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#999">รูปกระเป๋า + เส้นชี้ทุกจุด</div>`,
  materials: [
    { idx: 1, part: "ตัวกระเป๋า", code: "PU-S12", name: "ซาฟเฟียโน่ มิ้นต์", color: "", qty: "0.62", uom: "หลา", how: "ผ้า 4,120 ตร.ซม. · หน้า 150 ซม. · เผื่อเสีย 25%", note: "", thumb_html: "" },
    { idx: 2, part: "อะไหล่", code: "HW-03", name: "ห่วงตัว D", color: "สีอะไหล่ ทอง", qty: "1", uom: "ชิ้น", how: "1 ชิ้นต่อจุด", note: "", thumb_html: "" },
  ],
  material_count: 2, pockets_html: "", pocket_count: 0, colorway_table_html: "",
};
