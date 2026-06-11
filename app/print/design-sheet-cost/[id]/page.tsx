"use client";

/**
 * พิมพ์ใบตีราคาต้นทุน (Design Sheet) — เอกสารภายใน
 * การ์ดสรุปต้นทุน (แยกตามชนิด + ค่าใช้จ่ายเพิ่ม + ต้นทุนสินค้ารวม) + ตารางวัตถุดิบจัดกลุ่มตามชนิด
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet_cost') — แก้หน้าตาที่ /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const baht = (n: number | null | undefined) =>
  n != null ? Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
const num = (n: number | null | undefined, dp = 0) =>
  n != null ? Number(n).toLocaleString("th-TH", { maximumFractionDigits: dp }) : "—";

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null; cost_extra?: Array<{ label: string; amount: number }> };

function buildData(sheet: Sheet, lines: CostLine[]): Record<string, unknown> {
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
        amount_th:     baht(l.amount),
        note:          l.note ?? "",
      })),
    };
  });

  const materialTotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const extras = (Array.isArray(sheet.cost_extra) ? sheet.cost_extra : [])
    .filter((c) => (Number(c.amount) || 0) !== 0)
    .map((c) => ({ label: c.label || "ค่าใช้จ่าย", amount_th: baht(c.amount) }));
  const extraTotal = (Array.isArray(sheet.cost_extra) ? sheet.cost_extra : []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const grand = materialTotal + extraTotal;

  return {
    code:             sheet.code ?? "",
    name:             sheet.name ?? "",
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

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    return buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(sheet, lines),
    );
  }, [sheet, lines, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
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
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
