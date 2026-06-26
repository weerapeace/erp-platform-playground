"use client";

/**
 * พิมพ์ "ใบงานเข็มขัด" — /print/belt-work-order?mos=MO-2026-00069,MO-2026-00070
 * รวมหลายใบสั่งผลิต (MO) รุ่นเดียวกัน → ตารางไซส์รวม + สเปก (ดึงจาก product-spec)
 * ของกลาง: ระบบพิมพ์ (buildReportHtml + PrintFrame) · A4 แนวตั้ง
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { BeltWorkOrder, BeltWoRow } from "@/app/api/mo/belt-work-order/route";
import type { ProductSpec } from "@/app/api/product-spec/route";
import { buildBeltDiagramSvg, type BeltTailShape, type BeltLayout } from "@/lib/belt-diagram";

const TEMPLATE: ReportTemplate = {
  paper_size: "A4",
  orientation: "portrait",
  header_html: `<div class="bw-head">
    <div>
      <div class="bw-title">ใบงานผลิตเข็มขัด</div>
      <div class="bw-sub">รวมใบสั่งผลิต {{mo_count}} ใบ (สเปกเดียวกัน)</div>
    </div>
    <div class="bw-no">
      <div><span class="k">ใบงานที่</span> {{mos_text}}</div>
      <div class="bw-sub">พิมพ์ {{printed_at}}</div>
    </div>
  </div>`,
  body_html: `<table class="bw-meta">
    <tr><td class="k">แบรนด์</td><td class="v">{{brand}}</td><td class="k">วันที่สั่ง</td><td class="v">{{order_date}}</td></tr>
    <tr><td class="k">รุ่น</td><td class="v">{{model}}</td><td class="k">กำหนดส่ง</td><td class="v">{{due_text}}</td></tr>
    {{#detail}}<tr><td class="k">รายละเอียด</td><td class="v" colspan="3">{{detail}}</td></tr>{{/detail}}
  </table>
  {{#warnings}}<div class="bw-warn">⚠ {{value}}</div>{{/warnings}}
  <div class="bw-section">จำนวนต่อไซส์</div>
  <table class="bw-size">
    <thead><tr><th class="lcol">หนัง / สี</th>{{#sizes}}<th>{{label}}</th>{{/sizes}}<th class="sum">รวม</th></tr></thead>
    <tbody>
      {{#rows}}<tr><td class="lcol">{{label}} <span class="mo">· {{mo_short}}</span>{{{leather}}}</td>{{#cells}}<td>{{v}}</td>{{/cells}}<td class="sum">{{total}}</td></tr>{{/rows}}
      <tr class="trow"><td class="lcol">รวมทุก MO</td>{{#total_cells}}<td>{{v}}</td>{{/total_cells}}<td class="sum">{{grand}}</td></tr>
    </tbody>
  </table>
  {{#has_color_detail}}<div class="bw-section">รายละเอียดสี / หัวเข็มขัด / ขอบ-ด้าย</div>
  <table class="bw-cdet">
    <thead><tr><th class="imgc">รูปสินค้า</th><th class="lcol">รหัส / สี</th><th class="bkcol">หัวเข็มขัด (รหัส+รูป)</th><th>ขอบ</th><th>ด้าย</th></tr></thead>
    <tbody>{{#color_rows}}<tr><td class="imgc">{{{img_cell}}}</td><td class="lcol">{{label}} <span class="mo">· {{mo_short}}</span></td><td class="bkcol">{{{buckle_cell}}}</td><td>{{edge}}</td><td>{{thread}}</td></tr>{{/color_rows}}</tbody>
  </table>{{/has_color_detail}}
  {{#has_spec}}<div class="bw-section">สเปก</div>
  <table class="bw-spec">{{#specs}}<tr><td class="k">{{label}}</td><td class="v">{{value}}</td></tr>{{/specs}}</table>{{/has_spec}}
  <div class="bw-section">รูปประกอบ (จากสเปก)</div>
  <div class="bw-belt">{{{belt_svg}}}</div>`,
  footer_html: "",
  custom_css: `
.doc { font-size: 11px; color: #111827; }
.bw-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.bw-title { font-size: 18px; font-weight: 800; }
.bw-sub { font-size: 10px; color: #6b7280; }
.bw-no { text-align: right; font-size: 11px; }
.k { color: #6b7280; }
.bw-meta { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
.bw-meta td { padding: 1mm 2mm; vertical-align: top; }
.bw-meta td.k { width: 18mm; white-space: nowrap; }
.bw-meta td.v { font-weight: 600; }
.bw-warn { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 10px; padding: 1.5mm 2mm; border-radius: 2px; margin-bottom: 2mm; }
.bw-section { font-size: 12px; font-weight: 800; margin: 3mm 0 1.5mm; }
.bw-size { width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 4mm; }
.bw-size th, .bw-size td { border: 1px solid #94a3b8; padding: 1.2mm; font-size: 10.5px; }
.bw-size th { background: #f1f5f9; font-weight: 700; }
.bw-size .lcol { text-align: left; }
.bw-size .sum { background: #f8fafc; font-weight: 700; }
.bw-size .trow td { background: #eef2ff; font-weight: 800; }
.bw-size .mo { color: #94a3b8; font-size: 9px; }
.bw-cdet { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
.bw-cdet th, .bw-cdet td { border: 1px solid #cbd5e1; padding: 1.2mm 1.5mm; font-size: 9px; vertical-align: top; text-align: left; word-break: break-word; }
.bw-cdet th { background: #f1f5f9; font-weight: 700; }
.bw-cdet .lcol { white-space: nowrap; font-weight: 700; }
.bw-cdet .mo { color: #94a3b8; font-size: 8px; font-weight: 400; }
.bw-cdet .imgc { width: 16mm; text-align: center; padding: 1mm; }
.bw-cdet img.thumb { width: 14mm; height: 14mm; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 3px; display: block; margin: 0 auto; background: #fff; }
.bw-cdet .bkcol { width: 34mm; }
.bw-cdet .bkimg { width: 13mm; height: 13mm; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 3px; float: left; margin: 0 2mm 0 0; background: #fff; }
.bw-cdet .bkname { font-weight: 700; }
.bw-cdet .bkcode { font-family: ui-monospace, monospace; color: #475569; font-size: 8.5px; }
.bw-cdet .bkmiss { color: #94a3b8; font-size: 8px; }
.bw-size .lsub { font-size: 8.5px; color: #475569; font-weight: 400; white-space: normal; }
.bw-spec { width: 100%; border-collapse: collapse; }
.bw-spec td { padding: 1mm 2mm; border-bottom: 1px solid #e5e7eb; }
.bw-spec td.k { width: 35mm; white-space: nowrap; }
.bw-belt { margin-top: 2mm; border: 1px solid #e5e7eb; border-radius: 4px; padding: 3mm; }
.bw-belt svg { width: 100%; height: auto; }
@media print { .doc { padding: 12mm 12mm !important; } }`,
};

const FMT_OPT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const fmtDate = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("th-TH", FMT_OPT); };

// รายละเอียดหนัง/สี แยกเป็นคอลัมน์: หนังบน/หนังล่าง/ขอบ/ด้าย (ดึงจาก sku_attrs + legacy ของ SKU นั้น)
function beltColorParts(s: ProductSpec | undefined): { top: string; bot: string; edge: string; thread: string } {
  const all = s ? [...s.sku_attrs, ...s.legacy] : [];
  const pick = (re: RegExp) => all.find((f) => re.test(f.label))?.value || "";
  return { top: pick(/หนังบน/) || "—", bot: pick(/หนังล่าง/) || "—", edge: pick(/ริม|ขอบ/) || "—", thread: pick(/ด้าย/) || "—" };
}
// หัวเข็มขัดต่อ SKU (ดูทั้ง model + sku + legacy เผื่อรุ่นต่างหัว)
function beltBuckle(s: ProductSpec | undefined): string {
  const all = s ? [...s.model_attrs, ...s.sku_attrs, ...s.legacy] : [];
  return all.find((f) => /หัวเข็มขัด|ประเภทหัว/.test(f.label))?.value || "—";
}
// รูปต่อ SKU → ใส่ origin เต็ม (กัน path สั้นไม่ขึ้นในหน้าต่าง Blob/iframe) + ย่อ
const ORIGIN = () => (typeof window !== "undefined" ? window.location.origin : "");
const beltImgCell = (url: string | null | undefined) =>
  url ? `<img class="thumb" src="${url.startsWith("/") ? ORIGIN() : ""}${url}${url.includes("?") ? "&" : "?"}w=160" alt="" />` : "—";
const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const absImg = (url: string | null | undefined) => (url ? `${url.startsWith("/") ? ORIGIN() : ""}${url}${url.includes("?") ? "&" : "?"}w=120` : "");

function BeltWorkOrderInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const mos = useMemo(() => (sp.get("mos") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [bw, setBw] = useState<BeltWorkOrder | null>(null);
  const [spec, setSpec] = useState<ProductSpec | null>(null);
  const [skuSpecs, setSkuSpecs] = useState<Record<string, ProductSpec>>({});
  const [beltImgs, setBeltImgs] = useState<{ strap?: string | null; hole?: string | null; frontLogo?: string | null; backLogo?: string | null; holeBackOnly?: boolean }>({});
  const [beltLayout, setBeltLayout] = useState<BeltLayout>({});
  useEffect(() => { apiFetch("/api/mo/belt-layout").then((r) => r.json()).then((j) => setBeltLayout((j.layout ?? {}) as BeltLayout)).catch(() => {}); }, []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mos.length) { setError("ไม่ได้เลือกใบสั่งผลิต"); return; }
    let on = true;
    apiFetch(`/api/mo/belt-work-order?mos=${encodeURIComponent(mos.join(","))}`)
      .then((r) => r.json())
      .then(async (data: BeltWorkOrder) => {
        if (!on) return;
        if (data.error) throw new Error(data.error);
        setBw(data);
        // ดึงสเปกของทุก SKU (ต่อสี) พร้อมกัน → ใช้ทำบรรทัดย่อย หนังบน/ล่าง/ขอบ/ด้าย
        const uniq = [...new Set(data.rows.map((r) => r.product_sku).filter(Boolean))];
        const entries = await Promise.all(uniq.map(async (code) => {
          const s = await apiFetch(`/api/product-spec?sku=${encodeURIComponent(code)}`).then((r) => r.json()).catch(() => null);
          return [code, s && !s.error ? (s as ProductSpec) : null] as const;
        }));
        if (!on) return;
        const map: Record<string, ProductSpec> = {};
        for (const [code, s] of entries) if (s) map[code] = s;
        setSkuSpecs(map);
        const firstSku = data.rows[0]?.product_sku;
        const fs = firstSku ? map[firstSku] : undefined;
        if (fs) setSpec(fs);
        // จับคู่รูปจริง (ทรงปลายหาง/ลายรู/โลโก้) จากค่าที่เลือกในสเปก → ตารางหลัก
        if (fs) {
          const v = (re: RegExp) => fs.model_attrs.find((x) => re.test(x.label))?.value ?? "";
          const qs = new URLSearchParams({ tail: v(/^ปลายหาง/), hole: v(/เจาะรู/), frontLogo: v(/ด้านหน้า/), backLogo: v(/ด้านหลัง/) });
          const bi = await apiFetch(`/api/mo/belt-component-images?${qs}`).then((r) => r.json()).catch(() => null);
          if (on && bi && !bi.error) setBeltImgs(bi);
        }
      })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); });
    return () => { on = false; };
  }, [mos]);

  const html = useMemo(() => {
    if (!bw) return "";
    const sizes = bw.sizes;
    const specFields = spec ? [...spec.model_attrs, ...spec.legacy] : [];
    // รายละเอียด = ค่าของ "รูปแบบเข็มขัด" · และซ่อน 3 ฟิลด์นี้ออกจากตารางสเปก
    const HIDE_SPEC = /รูปแบบเข็มขัด|ระยะถึงปลายสาย|ห่างโลโก้จากปลาย/;
    const detail = specFields.find((f) => /รูปแบบเข็มขัด/.test(f.label))?.value || "";
    const visibleSpecs = specFields.filter((f) => !HIDE_SPEC.test(f.label));
    // บรรทัดหนัง (บน/ล่าง) ใต้รหัสในตารางจำนวนต่อไซส์
    const leatherSub = (sp: ProductSpec | undefined) => {
      const p = beltColorParts(sp); const parts: string[] = [];
      if (p.top && p.top !== "—") parts.push(`บน: ${escHtml(p.top)}`);
      if (p.bot && p.bot !== "—") parts.push(`ล่าง: ${escHtml(p.bot)}`);
      return parts.length ? `<div class="lsub">${parts.join(" · ")}</div>` : "";
    };
    // หัวเข็มขัด: รูป+ชื่อ+รหัส (จาก BOM) · ไม่มีใน BOM → fallback ชื่อจากสเปก
    const buckleCellOf = (r: BeltWoRow) => {
      const sp = skuSpecs[r.product_sku];
      const name = r.buckle_name || beltBuckle(sp);
      const code = r.buckle_code || "";
      if (!name || name === "—") return `<span class="bkmiss">—</span>`;
      const img = r.buckle_image ? `<img class="bkimg" src="${absImg(r.buckle_image)}" alt="" />` : "";
      const miss = (!r.buckle_image && code) ? `<div class="bkmiss">ยังไม่มีรูป</div>` : "";
      return `${img}<div class="bkname">${escHtml(name)}</div>${code ? `<div class="bkcode">${escHtml(code)}</div>` : ""}${miss}`;
    };
    const colorRows = bw.rows.map((r) => {
      const sp = skuSpecs[r.product_sku]; const p = beltColorParts(sp);
      const imgUrl = sp?.image_url || sp?.parent?.image_url || null;
      return { label: r.label, mo_short: r.mo_no.split("-").pop() || r.mo_no, img_cell: beltImgCell(imgUrl), buckle_cell: buckleCellOf(r), edge: p.edge, thread: p.thread,
        has_info: !!imgUrl || !!r.buckle_name || (p.edge !== "—") || (p.thread !== "—") };
    });
    // เฟส 3b: ดึงตัวเลขวาดรูปจากช่องสเปก (จับด้วยป้ายชื่อ) — ไม่เจอ → ใช้ค่า default ในตัววาด
    const bf = spec ? [...spec.model_attrs, ...spec.legacy, ...spec.sku_attrs] : [];
    const bnum = (re: RegExp) => { const f = bf.find((x) => re.test(x.label)); const m = f && String(f.value).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : undefined; };
    const tailTxt = bf.find((x) => /ปลายหาง/.test(x.label))?.value ?? "";
    const tailShape: BeltTailShape = /ปากเป|ปากเปิด/.test(tailTxt) ? "duckbill" : /แหลม/.test(tailTxt) ? "pointed" : /ตรง/.test(tailTxt) ? "straight" : "duckbill";
    const data = {
      mo_count: bw.mos.length,
      mos_text: bw.mos.join(", "),
      printed_at: new Date().toLocaleDateString("th-TH", FMT_OPT),
      order_date: new Date().toLocaleDateString("th-TH", FMT_OPT),
      brand: bw.brand || "—",
      model: bw.parent_code ? `${bw.parent_code} · ${bw.parent_name || ""}`.replace(/ · $/, "") : (bw.parent_name || "—"),
      due_text: bw.due_dates.length ? bw.due_dates.map(fmtDate).join(", ") : "—",
      detail,
      warnings: bw.warnings,
      sizes: sizes.map((label) => ({ label })),
      rows: bw.rows.map((r) => ({
        label: r.label,
        mo_short: r.mo_no.split("-").pop() || r.mo_no,
        total: r.total,
        leather: leatherSub(skuSpecs[r.product_sku]),
        cells: sizes.map((s) => ({ v: r.by_size[s] || "" })),
      })),
      total_cells: sizes.map((s) => ({ v: bw.totals_by_size[s] || 0 })),
      grand: bw.grand_total,
      has_color_detail: colorRows.some((r) => r.has_info),
      color_rows: colorRows,
      has_spec: visibleSpecs.length > 0,
      specs: visibleSpecs.map((f) => ({ label: f.label, value: f.value })),
      // เฟส 3b: รูปวาดจากตัวเลขจริงในช่องสเปก (จำนวนรู/ระยะ/ห่างโลโก้/ปลายหาง) — ไม่กรอก → ใช้ค่า default
      belt_svg: buildBeltDiagramSvg({ brandText: bw.brand || bw.parent_name || bw.parent_code || "", holeCount: bnum(/จำนวนรู/), holeSpacingIn: bnum(/ห่างรู/), toEndIn: bnum(/ปลายสาย|ถึงปลาย/), logoDistIn: bnum(/ห่างโลโก้|ระยะโลโก้/), tailShape, strapImg: beltImgs.strap, holeImg: beltImgs.hole, holeBackOnly: beltImgs.holeBackOnly, frontLogoImg: beltImgs.frontLogo, backLogoImg: beltImgs.backLogo, layout: beltLayout }),
    };
    return buildReportHtml(TEMPLATE, data);
  }, [bw, spec, skuSpecs, beltImgs, beltLayout]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ ใบงานเข็มขัด · {mos.length} ใบสั่งผลิต</span>
        <div className="flex-1" />
        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : !bw ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} />}
      </div>
    </div>
  );
}

export default function BeltWorkOrderPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><BeltWorkOrderInner /></Suspense>;
}
