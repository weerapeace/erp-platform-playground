"use client";

/**
 * พิมพ์ใบตีราคาต้นทุน (Design Sheet) — เอกสารภายใน
 * การ์ดสรุปต้นทุน (แยกตามชนิด + ค่าใช้จ่ายเพิ่ม + ต้นทุนสินค้ารวม) + ตารางวัตถุดิบจัดกลุ่มตามชนิด
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet_cost') — แก้หน้าตาที่ /admin/report-templates
 *
 * กรองตาม "ไซส์/แท็บ" (parent_code) ได้ — เลือกไซส์ไหนพิมพ์เฉพาะไซส์นั้น (บรรทัด + ค่าแรง + ยอดรวม)
 *   ค่าเริ่มต้นเปิดจาก ?parent= (ไซส์ที่กำลังดูตอนกดพิมพ์) · ไม่มี = ทั้งหมด
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, buildReportImageGridHtml } from "@/lib/template";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";

const ALL = "__ALL__";
const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const baht = (n: number | null | undefined) =>
  n != null ? Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
const num = (n: number | null | undefined, dp = 0) =>
  n != null ? Number(n).toLocaleString("th-TH", { maximumFractionDigits: dp }) : "—";
const pkey = (s: string | null | undefined) => s ?? "";
const parentLabel = (k: string) => (k === "" ? "ทั่วไป" : k);

/** ราคาต่อ 1 ชิ้นของวัสดุนั้น = ยอดรวมบรรทัด ÷ จำนวนชิ้น (บรรทัดที่ไม่ได้นับเป็นชิ้น → "—") */
const perPiece = (l: CostLine): number | null =>
  (l.amount != null && l.pieces != null && l.pieces > 0) ? Math.round((l.amount / l.pieces) * 100) / 100 : null;

/**
 * ราคาวัสดุต่อ 1 หลา (หน่วยที่ซื้อจริง) — ให้คนอ่านเทียบราคาผ้าได้
 * - บรรทัดที่คิดเป็นหลาอยู่แล้ว (uom = หลา) → ราคา/หน่วย คือ ฿/หลา ตรง ๆ
 * - บรรทัดชนิด "ชิ้น" (uom = cm², ราคา/หน่วย = ฿/cm²) → 1 หลา = หน้ากว้าง × divisor cm²
 *   ⇒ ฿/หลา = ราคา/cm² × หน้ากว้าง × divisor  (ไม่มีหน้ากว้าง = คิดไม่ได้ → "—")
 */
const perYard = (l: CostLine): number | null => {
  if (l.unit_price == null) return null;
  const uom = (l.uom ?? "").trim();
  if (uom === "cm²" || uom === "cm2") {
    const d = l.divisor || 90;
    return l.face_width_cm ? Math.round(l.unit_price * l.face_width_cm * d * 100) / 100 : null;
  }
  return uom.includes("หลา") ? Math.round(l.unit_price * 100) / 100 : null;
};

type CostExtra = { label: string; amount: number };
type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null; cost_extra?: unknown };

const normExtras = (a: unknown): CostExtra[] =>
  (Array.isArray(a) ? a : []).map((c) => ({ label: String((c as CostExtra)?.label ?? ""), amount: Number((c as CostExtra)?.amount) || 0 }));

// ดึงค่าใช้จ่ายเพิ่มของไซส์ที่เลือก — รองรับทั้ง array (เก่า = ของ "ทั่วไป") และ object {parentKey: [...]} (ใหม่ แยกไซส์)
function extrasForParent(rawCe: unknown, sel: string): CostExtra[] {
  if (Array.isArray(rawCe)) return sel === ALL || sel === "" ? normExtras(rawCe) : [];
  if (rawCe && typeof rawCe === "object") {
    if (sel === ALL) return Object.values(rawCe as Record<string, unknown>).flatMap((v) => normExtras(v));
    return normExtras((rawCe as Record<string, unknown>)[sel]);
  }
  return [];
}

/** รูปในใบงาน (ทุกแหล่ง: แกลเลอรี/รายละเอียด/คอมเมนต์) — เลือกติดไปกับใบพิมพ์ได้ */
type SheetImage = { key: string; url: string; source_label: string; is_primary: boolean };

/**
 * วางบล็อกรูปเข้าไปในเอกสาร เมื่อเทมเพลตไม่มีช่อง {{{images_html}}} ของตัวเอง
 * แทรกท้าย <main> = อยู่ในกรอบกระดาษเสมอ (ไม่หลุดออกนอก .doc)
 */
function injectImages(html: string, block: string): string {
  if (!block) return html;
  return html.includes("</main>") ? html.replace("</main>", `${block}</main>`) : html.replace("</body>", `${block}</body>`);
}

function buildData(sheet: Sheet, lines: CostLine[], extrasArr: CostExtra[], sizeLabel: string | null, imagesHtml = ""): Record<string, unknown> {
  const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;

  // จัดกลุ่มวัสดุตามชนิด
  const gmap = new Map<string, CostLine[]>();
  for (const l of lines) { const k = l.group_name || "ไม่ระบุชนิด"; gmap.set(k, [...(gmap.get(k) ?? []), l]); }
  const groups = [...gmap.entries()].map(([group_name, ls]) => {
    const subtotal = ls.reduce((s, l) => s + (l.amount || 0), 0);
    return {
      group_name,
      subtotal_th: baht(subtotal),
      lines: ls.map((l) => ({
        item_name:     l.item_name ?? "",
        dims:          (l.width_cm != null && l.length_cm != null) ? `${num(l.width_cm)}×${num(l.length_cm)}` : "—",
        pieces:        l.pieces != null ? num(l.pieces) : "—",
        waste:         l.waste_percent != null ? `${num(l.waste_percent)}%` : "—",
        qty:           l.qty != null ? num(l.qty, 4) : "—",
        uom:           l.uom ?? "",
        unit_price_th: l.unit_price != null ? num(l.unit_price, 4) : "—",
        per_piece_th:  perPiece(l) != null ? baht(perPiece(l)) : "—",   // ฿ ต่อ 1 ชิ้นของวัสดุนี้
        per_yard_th:   perYard(l) != null ? baht(perYard(l)) : "—",     // ฿ ต่อ 1 หลา (หน่วยที่ซื้อจริง)
        amount_th:     baht(l.amount),
        note:          l.note ?? "",
      })),
    };
  });

  const materialTotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const extras = extrasArr.filter((c) => (Number(c.amount) || 0) !== 0)
    .map((c) => ({ label: c.label || "ค่าใช้จ่าย", amount_th: baht(c.amount) }));
  const extraTotal = extrasArr.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const grand = materialTotal + extraTotal;

  return {
    code:             sheet.code ?? "",
    name:             `${sheet.name ?? ""}${sizeLabel ? ` — ${sizeLabel}` : ""}`,
    brand_name:       brand?.name ?? "—",
    order_date_th:    thaiDate(sheet.order_date as string | null),
    deadline_th:      thaiDate(sheet.deadline as string | null),
    print_date_th:    thaiDate(new Date().toISOString()),
    cost_groups:      groups.map((g) => ({ label: g.group_name, subtotal_th: g.subtotal_th })),
    material_total_th: baht(materialTotal),
    extras,
    has_extras:       extras.length > 0,
    grand_total_th:   baht(grand),
    groups,
    no_lines:         lines.length === 0,
    images_html:      imagesHtml,          // เทมเพลตจะวางเองก็ได้ด้วย {{{images_html}}}
    has_images:       imagesHtml !== "",
  };
}

export default function PrintDesignSheetCostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [sheet, setSheet]       = useState<Sheet | null>(null);
  const [lines, setLines]       = useState<CostLine[]>([]);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [sel, setSel]           = useState<string>(ALL);   // ไซส์/แท็บที่เลือกพิมพ์ (ALL = ทุกไซส์)
  const [images, setImages]     = useState<SheetImage[]>([]);        // รูปทั้งหมดในใบงาน (ทุกแหล่ง)
  const [picked, setPicked]     = useState<string[]>([]);            // รูปที่เลือกให้ติดไปกับใบพิมพ์ (เรียงตามที่กด)
  const [imgCols, setImgCols]   = useState<1 | 2>(2);                // วางกี่รูปต่อแถว

  // ค่าเริ่มต้นจาก ?parent= (ไซส์ที่กำลังดูตอนกดพิมพ์) — อ่านฝั่ง client
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("parent");
    if (p != null) setSel(p);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/cost-lines`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=design_sheet_cost").then((r) => r.json()),
    ])
      .then(([sRes, lRes, tRes]) => {
        if (sRes.error) throw new Error(sRes.error);
        setSheet(sRes.data as Sheet);
        if (!lRes.error) setLines((lRes.data ?? []) as CostLine[]);
        const tpls = ((tRes as ReportTemplatesResponse).data ?? []).filter((t) => t.active);
        setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  // รูปในใบงาน (ทุกแหล่ง) — ไว้ให้เลือกติดไปกับใบพิมพ์ (ไม่เลือกอะไร = ใบเหมือนเดิมทุกอย่าง)
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/design-sheets/${id}/images`).then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data)) setImages(j.data as SheetImage[]); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // ไซส์/แท็บที่มีในบรรทัด (เรียง "ทั่วไป" ก่อน) + จำนวนบรรทัดต่อไซส์
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) { const k = pkey(l.parent_code); counts.set(k, (counts.get(k) ?? 0) + 1); }
    return [...counts.entries()]
      .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([key, count]) => ({ key, label: parentLabel(key), count }));
  }, [lines]);

  const shownLines = useMemo(() => (sel === ALL ? lines : lines.filter((l) => pkey(l.parent_code) === sel)), [lines, sel]);

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    const sizeLabel = sel === ALL ? null : parentLabel(sel);
    const extras = extrasForParent(sheet.cost_extra, sel);
    // รูปที่เลือก → กริดรูปของกลาง (ตัวเดียวกับใบพิมพ์อื่น) · เรียงตามลำดับที่กดเลือก
    const items = picked.map((k) => images.find((im) => im.key === k)).filter(Boolean) as SheetImage[];
    const grid = buildReportImageGridHtml(items.map((im) => ({ src: im.url, alt: im.source_label })), { columns: imgCols });
    const block = grid ? `<section class="print-images"><h3 style="font-size:12px;margin:4mm 0 1mm;color:#334155;">รูปประกอบ</h3>${grid}</section>` : "";
    const rendered = buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(sheet, shownLines, extras, sizeLabel, block),
    );
    // เทมเพลตวางเองไหม ({{{images_html}}}) — ถ้าไม่ ให้ระบบแทรกท้ายเนื้อหาให้
    const tplPlaces = /images_html/.test(`${template.header_html}${template.body_html}${template.footer_html}`);
    return tplPlaces ? rendered : injectImages(rendered, block);
  }, [sheet, shownLines, template, sel, picked, images, imgCols]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={docFileName("ใบตีราคาต้นทุน", sheet ? String(sheet.code ?? "") : null)} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !sheet ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบใบงาน"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template ใบตีราคาต้นทุน — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <>
            {tabs.length > 1 && (
              <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-700 mr-1">📐 เลือกไซส์ที่จะพิมพ์:</span>
                  <button onClick={() => setSel(ALL)}
                    className={`h-8 px-3 text-sm rounded-lg border ${sel === ALL ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    ทั้งหมด <span className="text-xs text-slate-400">({lines.length})</span>
                  </button>
                  {tabs.map((t) => (
                    <button key={t.key} onClick={() => setSel(t.key)}
                      className={`h-8 px-3 text-sm rounded-lg border ${sel === t.key ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {t.label} <span className="text-xs text-slate-400">({t.count})</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">แถบนี้ไม่ติดไปกับกระดาษที่พิมพ์ · เลือกไซส์แล้วใบจะเหลือเฉพาะบรรทัด/ค่าแรง/ยอดรวมของไซส์นั้น</p>
              </div>
            )}
            {/* เลือกรูปประกอบที่จะติดไปกับใบพิมพ์ (แถบนี้ไม่ติดไปกับกระดาษ) */}
            {images.length > 0 && (
              <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-700">🖼️ รูปประกอบในใบพิมพ์:</span>
                  <span className="text-xs text-slate-400">กดรูปเพื่อเลือก/เอาออก · เลือกแล้ว {picked.length} รูป</span>
                  {picked.length > 0 && (
                    <>
                      <span className="ml-2 text-xs text-slate-500">ต่อแถว:</span>
                      {([1, 2] as const).map((c) => (
                        <button key={c} onClick={() => setImgCols(c)}
                          className={`h-7 px-2 text-xs rounded-md border ${imgCols === c ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c} รูป</button>
                      ))}
                      <button onClick={() => setPicked([])} className="ml-auto h-7 px-2 text-xs text-slate-500 hover:text-rose-600">ล้างที่เลือก</button>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {images.map((im) => {
                    const idx = picked.indexOf(im.key);
                    return (
                      <button key={im.key} type="button" title={im.source_label}
                        onClick={() => setPicked((p) => (p.includes(im.key) ? p.filter((k) => k !== im.key) : [...p, im.key]))}
                        className={`relative h-20 w-20 overflow-hidden rounded-lg border-2 bg-white ${idx >= 0 ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt={im.source_label} className="h-full w-full object-contain" />
                        {idx >= 0 && <span className="absolute left-0.5 top-0.5 rounded bg-indigo-600 px-1 text-[10px] font-medium text-white">{idx + 1}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">รูปจะไปต่อท้ายตารางวัตถุดิบ · เรียงตามลำดับที่กดเลือก · ไม่เลือก = ใบเหมือนเดิม</p>
              </div>
            )}

            <PrintFrame html={html} fileName={docFileName("ใบตีราคาต้นทุน", sheet ? String(sheet.code ?? "") : null)} />
          </>
        )}
      </div>
    </div>
  );
}
