"use client";

/**
 * 🖨 Design Library — ใบสั่งทำตัวอย่างให้ช่าง ของ 1 สูตร (?cw=<ชุดสี> · ไม่ระบุ = สีหลัก)
 * รูปเส้นชี้ · ขนาด 2 หน่วย · วัสดุ + จำนวนประมาณ (ไม่มีราคา) · ช่อง 4 ฝั่ง · ตารางชุดสี · รูปที่ต้องการ · ช่องเซ็น
 * ใช้ระบบแม่แบบเอกสารกลาง entity_type "dl_techpack" (แก้หน้าตาที่ /admin/report-templates) · ไม่มีใน DB = DEFAULT_DL_TECHPACK_TEMPLATE
 * ข้อมูลลงแม่แบบ = lib/design-library-techpack buildTechpackData · ปริมาณ = lib/design-library-cost estimateCost (ไม่ส่งราคา)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PrintFrame, PrintToolbar } from "@/components/report";
import { ErrorState, LoadingState } from "@/components/state-views";
import { applyColorway, bagTypeOf, cleanSpec, colorwayLabel } from "@/lib/design-library";
import { calcSettingsFrom, estimateCost } from "@/lib/design-library-cost";
import { buildTechpackData, DEFAULT_DL_TECHPACK_TEMPLATE, TECHPACK_ENTITY } from "@/lib/design-library-techpack";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { docFileName } from "@/lib/print-filename";
import { r2ImageUrl } from "@/lib/r2-image";
import { api, type RecipeBundle } from "@/components/design-library/shared";
import type { ReportTemplateRow } from "@/app/api/admin/report-templates/route";

const defaultTpl = (): ReportTemplate => ({ paper_size: "A4", orientation: "portrait", ...DEFAULT_DL_TECHPACK_TEMPLATE });

function TechpackInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [cw, setCw] = useState<string | null>(sp.get("cw"));
  const [b, setB] = useState<RecipeBundle | null>(null);
  const [tpl, setTpl] = useState<ReportTemplate>(defaultTpl);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<RecipeBundle>(`/api/design-library/bundle?recipe_id=${id}`).then(setB).catch((e: Error) => setErr(e.message));
    api<ReportTemplateRow[]>(`/api/admin/report-templates?entity_type=${TECHPACK_ENTITY}`).then((rows) => {
      const list = (rows ?? []).filter((x) => x.active);
      const pick = list.find((x) => x.is_default) ?? list[0];
      if (pick) setTpl({ paper_size: pick.paper_size as ReportTemplate["paper_size"], orientation: pick.orientation as ReportTemplate["orientation"], header_html: pick.header_html, body_html: pick.body_html, footer_html: pick.footer_html, custom_css: pick.custom_css });
    }).catch(() => { /* ใช้แม่แบบเริ่มต้น */ });
  }, [id]);

  const base = useMemo(() => (b ? cleanSpec(b.recipe.spec) : null), [b]);
  const fileName = b && base ? docFileName("ใบสั่งทำตัวอย่าง", `${b.template.code}-สูตร${b.recipe.seq}${base.colorways.length ? `-${colorwayLabel(base, cw)}` : ""}`) : "ใบสั่งทำตัวอย่าง";
  const html = useMemo(() => {
    if (!b || !base) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const spec = applyColorway(base, cw);
    const est = estimateCost(spec, b.choices, { materials: b.materials ?? {}, prices: {}, calc: calcSettingsFrom(b.calc ?? []), cost: { ...base.cost, price: {} } });
    const latest = (view: string) => b.renders.filter((r) => r.view_key === view && (r.colorway_id ?? null) === cw).sort((x, y) => y.version - x.version)[0]?.image_key ?? null;
    const data = buildTechpackData({
      template: b.template, recipe: b.recipe, spec, baseSpec: base, colorwayName: base.colorways.length ? colorwayLabel(base, cw) : null,
      choices: b.choices, lines: est.lines, renders: { grid4: latest("grid4"), inside: latest("inside") },
      img: (key, w) => `${origin}${r2ImageUrl(key, w) ?? ""}`,
      dateText: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
      bagType: bagTypeOf(b.choices, b.template.category)?.name ?? b.template.category ?? "—",
    });
    return buildReportHtml(tpl, data, fileName);
  }, [b, base, cw, tpl, fileName]);

  if (err) return <div className="min-h-screen bg-slate-100 p-10"><ErrorState title="เปิดใบสั่งทำตัวอย่างไม่สำเร็จ" hint={err} /></div>;
  if (!b || !base) return <div className="min-h-screen bg-slate-100 p-10"><LoadingState label="กำลังเตรียมใบสั่งทำตัวอย่าง…" /></div>;
  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar fileName={fileName} />
      <div className="no-print max-w-[840px] mx-auto mt-3 px-4 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
        {base.colorways.length > 0 && <>
          ชุดสี:
          {[{ id: null as string | null, name: colorwayLabel(base, null) }, ...base.colorways.map((c) => ({ id: c.id as string | null, name: c.name }))].map((c) => (
            <button key={c.id ?? "main"} type="button" onClick={() => setCw(c.id)} className={`h-8 px-3 rounded-lg border ${cw === c.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200"}`}>{c.name}</button>
          ))}
        </>}
        <a href="/admin/report-templates" target="_blank" rel="noopener" className="ml-auto text-indigo-700 hover:underline">แก้หน้าตาใบนี้ (แม่แบบเอกสาร)</a>
      </div>
      <div className="py-4 px-2"><PrintFrame html={html} fileName={fileName} fit /></div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-100" />}><TechpackInner /></Suspense>;
}
