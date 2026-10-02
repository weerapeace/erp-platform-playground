"use client";

/**
 * พิมพ์ "ใบนำเสนอ A4" ของใบงานออกแบบ (สำหรับเสนอลูกค้า) — 1-2 หน้า ตามที่จัดไว้ในแผง 📄 ใบนำเสนอ
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='ds_present') · ไม่มีใน DB = DEFAULT_DS_PRESENT_TEMPLATE
 * ไม่มีข้อมูลต้นทุน/ตีราคาในหน้านี้เลย (lib/design-sheet-present ไม่ส่งฟิลด์เหล่านั้นเข้าเทมเพลต)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { buildPresentData, DEFAULT_DS_PRESENT_TEMPLATE } from "@/lib/design-sheet-present";
import { loadPresentBundle, type PresentBundle } from "@/lib/design-sheet-present-client";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

type Tpl = ReportTemplate;
const defaultTpl = (): Tpl => ({ paper_size: "A4", orientation: "portrait", ...DEFAULT_DS_PRESENT_TEMPLATE });

export default function PrintDesignSheetPresentPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [bundle, setBundle] = useState<PresentBundle | null>(null);
  const [tpl, setTpl] = useState<Tpl>(defaultTpl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const b = await loadPresentBundle(id);
      if (!alive) return;
      setBundle(b);
      try {
        const t = await apiFetch("/api/admin/report-templates?entity_type=ds_present").then((r) => r.json() as Promise<ReportTemplatesResponse>);
        const tpls = (t.data ?? []).filter((x: ReportTemplateRow) => x.active);
        const pick = tpls.find((x) => x.is_default) ?? tpls[0];
        if (alive && pick) setTpl({ paper_size: pick.paper_size as ReportTemplate["paper_size"], orientation: pick.orientation as ReportTemplate["orientation"], header_html: pick.header_html, body_html: pick.body_html, footer_html: pick.footer_html, custom_css: pick.custom_css });
      } catch { /* ใช้เทมเพลตเริ่มต้น */ }
    })().catch((e) => { if (alive) setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const fileName = docFileName("ใบนำเสนอ", bundle?.sheet.code ?? null);
  const html = useMemo(() => (bundle ? buildReportHtml(tpl, buildPresentData(bundle.presentation, bundle.ctx), fileName) : ""), [bundle, tpl, fileName]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
      <div className="px-4 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : error || !bundle ? <div className="py-20 text-center text-red-500">⚠️ {error ?? "ไม่พบใบงาน"}</div>
          : (
            <>
              {bundle.isNew && <div className="mx-auto mb-3 max-w-[840px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">ใบนี้ยังไม่ได้จัดใบนำเสนอ — แสดงแบบเริ่มต้น (รูปปก + ชื่องาน) · จัดได้จากปุ่ม 📄 ใบนำเสนอ A4 ในใบงาน</div>}
              <PrintFrame html={html} fileName={fileName} />
            </>
          )}
      </div>
    </div>
  );
}
