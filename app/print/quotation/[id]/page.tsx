"use client";

import { LoadingState } from "@/components/state-views";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame, ReportLayoutControls } from "@/components/report";
import { usePrintPartEditor } from "@/components/print-part-style";
import { PrintPresetMenu } from "@/components/print-presets";
import { usePrintBlocksEditor } from "@/components/print-blocks-editor";
import { printBlockPartDefs } from "@/lib/print-blocks";
import { QuotationFormModal } from "@/components/quotation-form-modal";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { QUOTE_CARD_PARTS, stripPerCardStyles } from "@/lib/print-part-style";
import { apiFetch } from "@/lib/api";
import {
  buildQuotationHtml as buildPrintableQuotationHtml,
  buildQuoteTemplateData as buildPrintableQuoteTemplateData,
  quoteCardImgMm,
} from "@/lib/quotation-print";
import { DEFAULT_REPORT_LAYOUT, reportLayoutFromStoredValue, type ReportLayoutSettings } from "@/lib/report-layout";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtml } from "@/lib/template";
import type { ReportLayoutDefaultResponse } from "@/app/api/admin/report-layout-defaults/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { QuoteDetail, QuoteLine } from "@/app/api/quotations/route";

type QuoteLinePrint = QuoteLine & {
  image_url?: string | null;
  image_key?: string | null;
};

type QuotePrintDetail = Omit<QuoteDetail, "lines"> & {
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_tax_id?: string | null;
  lines: QuoteLinePrint[];
};

type SkuPickerItem = {
  code?: string | null;
  image_url?: string | null;
  image_key?: string | null;
};


async function enrichQuoteImages(q: QuoteDetail): Promise<QuotePrintDetail> {
  const skuCodes = Array.from(new Set(q.lines.map(line => line.sku).filter(Boolean))) as string[];
  const imageBySku = new Map<string, Pick<QuoteLinePrint, "image_url" | "image_key">>();

  await Promise.all(skuCodes.map(async (code) => {
    const params = new URLSearchParams({ search: code, limit: "8", sales_only: "false" });
    const res = await apiFetch(`/api/pickers/skus?${params.toString()}`);
    const json = await res.json().catch(() => ({ data: [] }));
    const items = (json.data ?? []) as SkuPickerItem[];
    const match = items.find(item => item.code === code) ?? items[0];
    if (match) {
      imageBySku.set(code, {
        image_url: match.image_url ?? null,
        image_key: match.image_key ?? null,
      });
    }
  }));

  // ข้อมูลจาก SKU ที่ผูก (วัสดุ ซิป …) — ช่องที่เพิ่มในการ์ด (lib/print-blocks)
  const extras = await apiFetch(`/api/quotations/${q.id}/print-extras`).then(res => res.json()).catch(() => ({ skus: {} }));
  const skuFields = ((extras as { skus?: Record<string, Record<string, unknown>> }).skus ?? {});

  return {
    ...(q as QuotePrintDetail),
    // รูปที่แนบเองมาก่อนเสมอ — ไม่มีค่อย fallback เป็นรูปของ SKU ที่ผูกไว้
    lines: q.lines.map(line => ({
      ...(line.image_key
        ? { ...line, image_url: `/api/r2-image?key=${encodeURIComponent(line.image_key)}` }
        : { ...line, ...(line.sku ? imageBySku.get(line.sku) : undefined) }),
      sku_fields: line.sku ? skuFields[line.sku] ?? null : null,
    })),
  };
}


// จำค่าที่ตั้งรายใบ (ต่อ browser): "ไม่รวมยอดทั้งหมด" + การเรียงรายการ — เปิดพิมพ์ใบเดิมซ้ำไม่ต้องตั้งใหม่
type PerQuoteView = Partial<Pick<ReportLayoutSettings, (typeof PER_QUOTE_FIELDS)[number]>>;
const PER_QUOTE_FIELDS = ["showTotals", "sortBy", "sortDesc", "sortGroupByNote", "lineStyle", "cardsPerRow", "showCustomer", "showQty", "showLineTotal",
  "manualOrder", "showCardNo", "showCustomerApproval", "cardNameAdjPx", "cardNoteAdjPx", "cardPriceAdjPx", "headerAdjPx", "partStyles", "cardFields", "cardOrder", "pageBlocks"] as const;
const sameValue = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i])
  : a && b && typeof a === "object" && typeof b === "object" ? JSON.stringify(a) === JSON.stringify(b) : a === b);
const viewKey = (id: string) => `qt-print-view:${id}`;
const legacyHideTotalsKey = (id: string) => `qt-print-hide-totals:${id}`;
const readPerQuoteView = (id: string): PerQuoteView | null => {
  try {
    const raw = localStorage.getItem(viewKey(id));
    if (raw) return JSON.parse(raw) as PerQuoteView;
    return localStorage.getItem(legacyHideTotalsKey(id)) === "1" ? { showTotals: false } : null;
  } catch { return null; }
};
const writePerQuoteView = (id: string, layout: ReportLayoutSettings) => {
  try {
    const v: PerQuoteView = {};
    for (const k of PER_QUOTE_FIELDS) if (!sameValue(layout[k], DEFAULT_REPORT_LAYOUT[k])) (v as Record<string, unknown>)[k] = layout[k];
    if (Object.keys(v).length) localStorage.setItem(viewKey(id), JSON.stringify(v)); else localStorage.removeItem(viewKey(id));
    localStorage.removeItem(legacyHideTotalsKey(id));
  } catch { /* ไม่มี storage ก็แค่ไม่จำ */ }
};

export default function PrintQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [quote, setQuote] = useState<QuotePrintDetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [origin, setOrigin] = useState("");
  const [layout, setLayout] = useState<ReportLayoutSettings>(DEFAULT_REPORT_LAYOUT);
  const [useStandardLayout, setUseStandardLayout] = useState(false);
  const [savingLayoutDefault, setSavingLayoutDefault] = useState(false);
  const [layoutDefaultMessage, setLayoutDefaultMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/quotations/${id}`).then(res => res.json()),
      apiFetch("/api/admin/report-templates?entity_type=qt").then(res => res.json()).catch(() => ({ data: [] })),
      apiFetch("/api/admin/report-layout-defaults?entity_type=qt").then(res => res.json()).catch(() => ({ data: null })),
    ])
      .then(async ([quoteJson, templateJson, layoutDefaultJson]) => {
        if (quoteJson.error) throw new Error(quoteJson.error);
        const enriched = await enrichQuoteImages(quoteJson.data as QuoteDetail);
        const templates = ((templateJson as ReportTemplatesResponse).data ?? []).filter(item => item.active);
        const published = templates.find(item => item.is_default) ?? templates[0] ?? null;
        const defaultLayout = (layoutDefaultJson as ReportLayoutDefaultResponse).data?.layout_settings;
        if (alive) setQuote(enriched);
        if (alive) setTemplate(published);
        if (alive && defaultLayout) {
          setLayout(reportLayoutFromStoredValue(defaultLayout));
          setUseStandardLayout(true);
          setLayoutDefaultMessage("ใช้ค่าเริ่มต้นที่บันทึกไว้");
        }
        const perQuote = alive ? readPerQuoteView(id) : null;
        if (perQuote) {
          setLayout(current => reportLayoutFromStoredValue({ ...current, ...perQuote }));
          setUseStandardLayout(true);
        }
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดเอกสารไม่ได้");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [id]);

  // ชื่อไฟล์ตอนบันทึก PDF — "ใบเสนอราคา - QT-202607-0005" (ของกลาง lib/print-filename)
  const fileName = useMemo(() => docFileName("ใบเสนอราคา", quote?.quote_number), [quote?.quote_number]);

  const html = useMemo(() => {
    if (!quote) return "";
    // แบบการ์ดรูปใหญ่ สร้างจากโค้ดเสมอ (แม่แบบในฐานข้อมูลเป็นแบบตาราง)
    if (template && !useStandardLayout && layout.lineStyle !== "cards") {
      return buildReportHtml({
        paper_size: template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html: template.body_html,
        footer_html: template.footer_html,
        custom_css: template.custom_css,
      }, buildPrintableQuoteTemplateData(quote, origin, layout), fileName);
    }
    return buildPrintableQuotationHtml(quote, origin, layout);
  }, [fileName, layout, origin, quote, template, useStandardLayout]);

  // รายการสำหรับแผง "สลับรายการ" (ชื่อ · ตัวเลือก/รุ่น · ราคา) — ตามลำดับที่บันทึก
  const printLines = useMemo(() => (quote?.lines ?? []).map(line => ({
    label: line.product_name,
    sub: [line.note, line.unit_price != null ? `${Number(line.unit_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท` : null].filter(Boolean).join(" · ") || null,
  })), [quote]);

  const updateLayout = (next: ReportLayoutSettings) => {
    if (PER_QUOTE_FIELDS.some(k => !sameValue(next[k], layout[k]))) writePerQuoteView(id, next);
    setLayout(next);
    setUseStandardLayout(true);
    setLayoutDefaultMessage(null);
  };

  // กดกล่องในใบแล้วแก้หน้าตา (แบบการ์ดเท่านั้น · ของกลาง components/print-part-style · เจ้าของขอ 2026-11-20)
  // จัดหน้าเอง: ช่องในการ์ด + กล่องบนหน้า (ของกลาง components/print-blocks-editor · เจ้าของขอ 2026-11-20)
  const blocksEditor = usePrintBlocksEditor({
    cardFields: layout.cardFields, cardOrder: layout.cardOrder, pageBlocks: layout.pageBlocks,
    onChange: (p) => updateLayout({ ...layout, ...p }),
  });
  const partEditor = usePrintPartEditor({
    parts: [...QUOTE_CARD_PARTS, ...printBlockPartDefs(layout.cardFields, layout.pageBlocks)],
    onSlot: blocksEditor.onSlot,
    extra: blocksEditor.extra,
    value: layout.partStyles,
    onChange: (partStyles) => updateLayout({ ...layout, partStyles }),
    enabled: layout.lineStyle === "cards",
    defaultImgMm: quoteCardImgMm(layout.cardsPerRow),
  });

  // แบบที่บันทึก (เมนู "แบบ" · ของกลาง PrintPresetMenu ในระบบมุมมองที่บันทึก) — ไม่พาค่าเฉพาะใบนี้ (ลำดับที่ลากเอง · ซ่อนเฉพาะการ์ด)
  const presetConfig = (): Record<string, unknown> => {
    const { manualOrder: _order, ...rest } = layout;
    return { ...rest, partStyles: stripPerCardStyles(layout.partStyles) };
  };
  const applyPreset = (cfg: Record<string, unknown>) => {
    const perCard = Object.fromEntries(Object.entries(layout.partStyles).filter(([k]) => k.includes("#")));
    const next = reportLayoutFromStoredValue({ ...cfg, manualOrder: layout.manualOrder });
    updateLayout({ ...next, partStyles: { ...next.partStyles, ...perCard } });
  };

  // แก้ใบเสนอราคาจากหน้าพิมพ์ (ป๊อปฟอร์มกลางตัวเดียวกับหน้าใบเสนอราคา) → บันทึกแล้วโหลดใบใหม่ ใบพิมพ์อัปเดตตาม
  const reloadQuote = async () => {
    const json = await apiFetch(`/api/quotations/${id}`).then(res => res.json());
    if (json.error) throw new Error(json.error);
    setQuote(await enrichQuoteImages(json.data as QuoteDetail));
  };
  const isDraft = quote?.status === "draft";

  const loadDefaultLayout = async () => {
    setLayoutDefaultMessage("กำลังโหลดค่าเริ่มต้น...");
    try {
      const res = await apiFetch("/api/admin/report-layout-defaults?entity_type=qt");
      const json = await res.json() as ReportLayoutDefaultResponse;
      if (!res.ok || json.error) throw new Error(json.error ?? "โหลดค่าเริ่มต้นไม่สำเร็จ");
      if (!json.data) {
        setLayoutDefaultMessage("ยังไม่มีค่าเริ่มต้นที่บันทึกไว้");
        return;
      }
      setLayout(reportLayoutFromStoredValue(json.data.layout_settings));
      setUseStandardLayout(true);
      setLayoutDefaultMessage("ใช้ค่าเริ่มต้นที่บันทึกไว้");
    } catch (err) {
      setLayoutDefaultMessage(err instanceof Error ? err.message : "โหลดค่าเริ่มต้นไม่สำเร็จ");
    }
  };

  const saveDefaultLayout = async () => {
    setSavingLayoutDefault(true);
    setLayoutDefaultMessage(null);
    try {
      const res = await apiFetch("/api/admin/report-layout-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "qt", layout_settings: { ...layout, partStyles: stripPerCardStyles(layout.partStyles) } }),
      });
      const json = await res.json() as ReportLayoutDefaultResponse;
      if (!res.ok || json.error) throw new Error(json.error ?? "บันทึกค่าเริ่มต้นไม่สำเร็จ");
      // ค่าเฉพาะการ์ดของใบนี้ยังอยู่ (ไม่ได้บันทึกเป็นค่าเริ่มต้น)
      if (json.data?.layout_settings) setLayout(cur => ({ ...reportLayoutFromStoredValue(json.data!.layout_settings), partStyles: { ...reportLayoutFromStoredValue(json.data!.layout_settings).partStyles, ...Object.fromEntries(Object.entries(cur.partStyles).filter(([k]) => k.includes("#"))) } }));
      setUseStandardLayout(true);
      setLayoutDefaultMessage("บันทึกค่าเริ่มต้นแล้ว");
    } catch (err) {
      setLayoutDefaultMessage(err instanceof Error ? err.message : "บันทึกค่าเริ่มต้นไม่สำเร็จ");
    } finally {
      setSavingLayoutDefault(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={quote ? fileName : undefined} />
      <div className="py-6 px-4">
        {loading ? (
          <LoadingState />
        ) : error || !quote ? (
          <div className="text-center py-20 text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
        ) : (
          <>
            <ReportLayoutControls
              value={layout}
              onChange={updateLayout}
              onSaveDefault={saveDefaultLayout}
              onUseDefault={loadDefaultLayout}
              savingDefault={savingLayoutDefault}
              defaultMessage={layoutDefaultMessage}
              lines={printLines}
              cardFieldsPanel={blocksEditor.cardPanel}
              leading={<PrintPresetMenu tableId="print:qt" storageKey={`qt-print-preset:${id}`} getConfig={presetConfig} onApply={applyPreset}
                onSetDefault={saveDefaultLayout} onUseDefault={loadDefaultLayout} savingDefault={savingLayoutDefault} />}
              trailing={(
                <button type="button" onClick={() => isDraft && setEditOpen(true)} disabled={!isDraft}
                  title={isDraft ? "แก้ลูกค้า รายการ ราคา ในใบนี้" : "ใบที่ส่งลูกค้าแล้ว/ปิดแล้ว แก้ไม่ได้ — แก้ได้เฉพาะใบร่าง (ใบที่ส่งแล้วใช้ \"ไม่ผ่าน · เปิดใบใหม่แทน\" ในใบงาน)"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400">
                  <Icon value="i:edit" className="text-[15px]" />แก้ใบเสนอราคา
                </button>
              )}
            />
            {partEditor.bar}
            <PrintFrame html={html} fileName={fileName} onDocLoad={partEditor.onDocLoad} />
            {partEditor.panel}
            {blocksEditor.modal}
            <QuotationFormModal open={editOpen} quote={editOpen ? quote : null} defaultSalePerson={user?.name ?? ""} actor={user?.name}
              onClose={() => setEditOpen(false)}
              onSaved={async () => { setEditOpen(false); try { await reloadQuote(); } catch (e) { setError(e instanceof Error ? e.message : "โหลดใบใหม่ไม่สำเร็จ"); } }} />
          </>
        )}
      </div>
    </div>
  );
}
