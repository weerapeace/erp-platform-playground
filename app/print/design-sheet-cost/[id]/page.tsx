"use client";

/**
 * พิมพ์ใบตีราคาต้นทุน (Design Sheet) — เอกสารภายใน · พรีวิวซ้าย + แผงตั้งค่าการพิมพ์ขวา (ของกลาง DocPrintPanel)
 *
 * ตั้งค่าได้ (เจ้าของขอ 2026-11-11): คอลัมน์ (เปิด/ปิด · ชื่อหัว · ลำดับ · กว้าง มม.) · รายการวัตถุดิบ ทุกบรรทัด / รวมตามวัสดุ / รวมตามชนิด / ไม่โชว์
 *   · สรุปต้นทุน แยกตามชนิด / ค่าแรง / ค่าโสหุ้ย / อื่น ๆ + โชว์รายละเอียด · ช่องเซ็น
 *   ไม่กดบันทึก = ใช้กับใบนี้ · "บันทึกเป็นค่าเริ่มต้น" = ทุกคน (ui_config doc_print_design_sheet_cost · สิทธิ์ products.edit)
 *   ข้อมูลลงแม่แบบสร้างที่ lib/design-sheet-cost-print (buildCostPrintData) · แม่แบบต้องมี {{{cost_summary_html}}} + {{{lines_table}}}
 *   (แม่แบบเก่าที่เขียนตารางเอง ยังพิมพ์ได้เหมือนเดิม แต่ปรับจากแผงไม่ได้)
 *
 * กรองตาม "ไซส์/แท็บ" (parent_code) — ค่าเริ่มต้นจาก ?parent= (ไซส์ที่กำลังดูตอนกดพิมพ์) · ไม่มี = ทั้งหมด
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet_cost') — แก้หน้าตาที่ /admin/report-templates
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { attachColumnResize } from "@/components/report/list-print-frame";
import { DocPrintPanel, measureDocColumns, useDocPrintPrefs } from "@/components/doc-print-settings";
import { Icon } from "@/components/icon";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, buildReportImageGridHtml } from "@/lib/template";
import { DOC_COLUMNS, defaultPrefs, type DocPrintPrefs } from "@/lib/doc-print-prefs";
import { COST_PRINT_ENTITY, buildCostPrintData, templateSupportsCostSettings } from "@/lib/design-sheet-cost-print";
import type { CostPreset } from "@/lib/design-cost-presets";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import type { PriceItem } from "@/app/api/design-sheets/price-items/route";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";

const ALL = "__ALL__";
const FLEX_KEYS = new Set((DOC_COLUMNS[COST_PRINT_ENTITY] ?? []).filter((c) => c.flex).map((c) => c.key));
const halfMm = (mm: number) => Math.round(mm * 2) / 2;
const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const pkey = (s: string | null | undefined) => s ?? "";

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null; cost_extra?: unknown; order_qty?: unknown };
/** รูปในใบงาน (ทุกแหล่ง: แกลเลอรี/รายละเอียด/คอมเมนต์) — เลือกติดไปกับใบพิมพ์ได้ */
type SheetImage = { key: string; url: string; source_label: string; is_primary: boolean };

/** วางบล็อกรูปท้าย <main> เมื่อแม่แบบไม่มีช่อง {{{images_html}}} ของตัวเอง (อยู่ในกรอบกระดาษเสมอ) */
function injectImages(html: string, block: string): string {
  if (!block) return html;
  return html.includes("</main>") ? html.replace("</main>", `${block}</main>`) : html.replace("</body>", `${block}</body>`);
}

export default function PrintDesignSheetCostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [sheet, setSheet]         = useState<Sheet | null>(null);
  const genLabel = generalLabelOf(sheet?.cost_general_label as string | null | undefined);   // ชื่อแท็บ "ทั่วไป" ที่ตั้งเองของใบ
  const [lines, setLines]         = useState<CostLine[]>([]);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [sel, setSel]             = useState<string>(ALL);   // ไซส์/แท็บที่เลือกพิมพ์ (ALL = ทุกไซส์)
  const [images, setImages]       = useState<SheetImage[]>([]);
  const [picked, setPicked]       = useState<string[]>([]);   // รูปที่เลือกให้ติดไปกับใบพิมพ์ (เรียงตามที่กด)
  const [imgCols, setImgCols]     = useState<1 | 2>(2);
  const [presets, setPresets]     = useState<CostPreset[] | null>(null);   // ราคากลาง → รายละเอียดค่าแรงตัด/โสหุ้ย
  const [cutRates, setCutRates]   = useState<Map<string, number | null>>(new Map());   // ค่าตัดต่อชิ้นของวัสดุ
  const [panelOpen, setPanelOpen] = useState(true);
  const { prefs, setPrefs, saved, setSaved } = useDocPrintPrefs(COST_PRINT_ENTITY);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("parent");
    if (p != null) setSel(p);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/cost-lines`).then((r) => r.json()),
      apiFetch(`/api/admin/report-templates?entity_type=${COST_PRINT_ENTITY}`).then((r) => r.json()),
    ])
      .then(([sRes, lRes, tRes]) => {
        if (sRes.error) throw new Error(sRes.error);
        setSheet(sRes.data as Sheet);
        if (!lRes.error) setLines((lRes.data ?? []) as CostLine[]);
        setTemplates(((tRes as ReportTemplatesResponse).data ?? []).filter((t) => t.active));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  // ข้อมูลรอง (ไม่บล็อกการแสดงใบ): รูปในใบงาน · ราคากลาง + ค่าตัดของวัสดุ (ใช้เฉพาะตอนเปิด "โชว์รายละเอียด")
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/design-sheets/${id}/images`).then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data)) setImages(j.data as SheetImage[]); }).catch(() => {});
    apiFetch("/api/design-sheets/cost-presets").then((r) => r.json())
      .then((j) => { if (alive) setPresets(Array.isArray(j?.data) ? j.data as CostPreset[] : []); }).catch(() => { if (alive) setPresets([]); });
    apiFetch("/api/design-sheets/price-items").then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j?.data)) setCutRates(new Map((j.data as PriceItem[]).map((it) => [it.id, it.cut_rate]))); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // พรีวิวหน่วง ~200ms (iframe โหลดใหม่ทุกครั้งที่ html เปลี่ยน) — แบบเดียวกับใบวางบิล
  const [viewPrefs, setViewPrefs] = useState<DocPrintPrefs | null>(null);
  useEffect(() => {
    if (!prefs) return;
    const t = setTimeout(() => setViewPrefs(prefs), viewPrefs ? 200 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- หน่วงตาม prefs อย่างเดียว
  }, [prefs]);

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) { const k = pkey(l.parent_code); counts.set(k, (counts.get(k) ?? 0) + 1); }
    return [...counts.entries()]
      .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([key, count]) => ({ key, label: costTabLabel(key, genLabel), count }));
  }, [lines, genLabel]);
  const shownLines = useMemo(() => (sel === ALL ? lines : lines.filter((l) => pkey(l.parent_code) === sel)), [lines, sel]);

  const template = templates.find((t) => t.id === prefs?.template_id) ?? templates.find((t) => t.is_default) ?? templates[0] ?? null;
  const tableSupported = templateSupportsCostSettings(template);
  const fileName = docFileName("ใบตีราคาต้นทุน", sheet ? String(sheet.code ?? "") : null);

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    const items = picked.map((k) => images.find((im) => im.key === k)).filter(Boolean) as SheetImage[];
    const grid = buildReportImageGridHtml(items.map((im) => ({ src: im.url, alt: im.source_label })), { columns: imgCols });
    const block = grid ? `<section class="print-images"><h3 style="font-size:12px;margin:4mm 0 1mm;color:#334155;">รูปประกอบ</h3>${grid}</section>` : "";
    const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;
    const data = buildCostPrintData({
      sheet: { code: sheet.code, name: sheet.name, brand_name: brand?.name ?? null, order_date: sheet.order_date as string | null,
        deadline: sheet.deadline as string | null, cost_extra: sheet.cost_extra, order_qty: sheet.order_qty },
      lines: shownLines, sel: sel === ALL ? null : sel, sizeLabel: sel === ALL ? null : costTabLabel(sel, genLabel),
      prefs: viewPrefs ?? defaultPrefs(COST_PRINT_ENTITY), presets, cutRateOf: (iid) => cutRates.get(iid) ?? null,
      tabLabel: (k) => costTabLabel(k, genLabel), imagesHtml: block, dateTh: thaiDate,
    });
    const rendered = buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      data,
    );
    const tplPlaces = /images_html/.test(`${template.header_html}${template.body_html}${template.footer_html}`);
    return tplPlaces ? rendered : injectImages(rendered, block);
  }, [sheet, shownLines, template, sel, picked, images, imgCols, genLabel, viewPrefs, presets, cutRates]);

  // ลากขอบหัวคอลัมน์บนพรีวิว → ตั้งความกว้าง (แบบเดียวกับใบวางบิล)
  const docRef = useRef<Document | null>(null);
  const onDocLoad = useCallback((d: Document) => {
    docRef.current = d;
    attachColumnResize(d, {
      table: ".doc-t",
      freeze: true,
      onResize: (key, mm, all) => setPrefs((p) => {
        if (!p) return p;
        const widths = { ...(p.widths ?? {}) };
        for (const [k, v] of Object.entries(all ?? {})) if (!FLEX_KEYS.has(k)) widths[k] = halfMm(v);
        widths[key] = halfMm(mm);
        return { ...p, widths };
      }),
      onReset: (key) => setPrefs((p) => {
        if (!p?.widths) return p;
        const widths = { ...p.widths };
        delete widths[key];
        return { ...p, widths: Object.keys(widths).length ? widths : undefined };
      }),
    });
  }, [setPrefs]);
  const autoFit = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const widths = measureDocColumns(d, ".doc-t");
    if (Object.keys(widths).length) setPrefs((p) => (p ? { ...p, widths } : p));
  }, [setPrefs]);

  const ready = !loading && !!sheet && !!template;
  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
      {ready && (
        <div className="no-print flex justify-end px-4 pt-3">
          <button type="button" onClick={() => setPanelOpen((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs ${panelOpen
              ? "border-blue-600 bg-blue-600 font-medium text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Icon name="settings" /> ตั้งค่าการพิมพ์
          </button>
        </div>
      )}
      <div className="flex items-start gap-4 px-4 py-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          ) : error || !sheet ? (
            <div className="py-20 text-center text-red-500"><Icon name="warning" /> {error ?? "ไม่พบใบงาน"}</div>
          ) : !template ? (
            <div className="py-20 text-center text-amber-600">
              <Icon name="warning" /> ยังไม่มี template ใบตีราคาต้นทุน — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
            </div>
          ) : (
            <>
              {tabs.length > 1 && (
                <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-sm font-medium text-slate-700">เลือกไซส์ที่จะพิมพ์:</span>
                    <button onClick={() => setSel(ALL)}
                      className={`h-8 rounded-lg border px-3 text-sm ${sel === ALL ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      ทั้งหมด <span className="text-xs text-slate-400">({lines.length})</span>
                    </button>
                    {tabs.map((t) => (
                      <button key={t.key} onClick={() => setSel(t.key)}
                        className={`h-8 rounded-lg border px-3 text-sm ${sel === t.key ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {t.label} <span className="text-xs text-slate-400">({t.count})</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">แถบนี้ไม่ติดไปกับกระดาษที่พิมพ์ · เลือกไซส์แล้วใบจะเหลือเฉพาะบรรทัดและค่าใช้จ่ายของไซส์นั้น</p>
                </div>
              )}
              {images.length > 0 && (
                <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">รูปประกอบในใบพิมพ์:</span>
                    <span className="text-xs text-slate-400">กดรูปเพื่อเลือก/เอาออก · เลือกแล้ว {picked.length} รูป</span>
                    {picked.length > 0 && (
                      <>
                        <span className="ml-2 text-xs text-slate-500">ต่อแถว:</span>
                        {([1, 2] as const).map((c) => (
                          <button key={c} onClick={() => setImgCols(c)}
                            className={`h-7 rounded-md border px-2 text-xs ${imgCols === c ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c} รูป</button>
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
              <PrintFrame html={html} fileName={fileName} fit onDocLoad={onDocLoad} />
            </>
          )}
        </div>
        {panelOpen && prefs && ready && (
          <aside className="no-print sticky top-16 max-h-[calc(100vh-5rem)] w-80 shrink-0 overflow-y-auto">
            <DocPrintPanel entityType={COST_PRINT_ENTITY} templates={templates} prefs={prefs} saved={saved}
              onChange={setPrefs} onSaved={setSaved} onAutoFit={autoFit} tableSupported={tableSupported} />
          </aside>
        )}
      </div>
    </div>
  );
}
