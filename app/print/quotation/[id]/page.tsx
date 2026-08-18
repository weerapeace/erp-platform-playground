"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame, ReportLayoutControls } from "@/components/report";
import { apiFetch } from "@/lib/api";
import {
  buildQuotationHtml as buildPrintableQuotationHtml,
  buildQuoteTemplateData as buildPrintableQuoteTemplateData,
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

  return {
    ...(q as QuotePrintDetail),
    // รูปที่แนบเองมาก่อนเสมอ — ไม่มีค่อย fallback เป็นรูปของ SKU ที่ผูกไว้
    lines: q.lines.map(line => (line.image_key
      ? { ...line, image_url: `/api/r2-image?key=${encodeURIComponent(line.image_key)}` }
      : { ...line, ...(line.sku ? imageBySku.get(line.sku) : undefined) })),
  };
}


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
    if (template && !useStandardLayout) {
      return buildReportHtml({
        paper_size: template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html: template.body_html,
        footer_html: template.footer_html,
        custom_css: template.custom_css,
      }, buildPrintableQuoteTemplateData(quote, origin), fileName);
    }
    return buildPrintableQuotationHtml(quote, origin, layout);
  }, [fileName, layout, origin, quote, template, useStandardLayout]);

  const updateLayout = (next: ReportLayoutSettings) => {
    setLayout(next);
    setUseStandardLayout(true);
    setLayoutDefaultMessage(null);
  };

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
        body: JSON.stringify({ entity_type: "qt", layout_settings: layout }),
      });
      const json = await res.json() as ReportLayoutDefaultResponse;
      if (!res.ok || json.error) throw new Error(json.error ?? "บันทึกค่าเริ่มต้นไม่สำเร็จ");
      if (json.data?.layout_settings) setLayout(reportLayoutFromStoredValue(json.data.layout_settings));
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
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
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
            />
            <PrintFrame html={html} fileName={fileName} />
          </>
        )}
      </div>
    </div>
  );
}
