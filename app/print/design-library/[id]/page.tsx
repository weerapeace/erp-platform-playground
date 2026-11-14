"use client";

/**
 * 🖨 Design Library — ใบสรุปแบบ (DESIGN BRIEF) ของ 1 สูตร → พิมพ์ / บันทึก PDF ไปแนบให้ GPT
 * รูปเส้นชี้ (รูปชิ้นส่วนใหญ่ให้ GPT เห็นชัด) + ตารางสรุป + ช่อง 4 ฝั่ง + prompt 3 ชุด
 * ตัวสร้างใบ = lib/design-library buildBriefHtml (เทสต์ได้) · กรอบพิมพ์ = ของกลาง PrintToolbar / PrintFrame
 * ?mode=vector = ใช้รูปลายเส้นของแม่แบบ (ถ้ามี) · ?cw=<id> = ชุดสี (ไม่ระบุ = สีหลัก) · สูตรมีชุดสี → ใบมีตารางชุดสีทุกสี
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PrintFrame, PrintToolbar } from "@/components/report";
import { ErrorState, LoadingState } from "@/components/state-views";
import { applyColorway, buildBriefHtml, cleanSpec, colorwayLabel } from "@/lib/design-library";
import { r2ImageUrl } from "@/lib/r2-image";
import { api, type RecipeBundle } from "@/components/design-library/shared";

function BriefInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const [vector, setVector] = useState(sp.get("mode") === "vector");
  const [cw, setCw] = useState<string | null>(sp.get("cw"));
  const [b, setB] = useState<RecipeBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<RecipeBundle>(`/api/design-library/bundle?recipe_id=${id}`).then(setB).catch((e: Error) => setErr(e.message));
  }, [id]);

  const html = useMemo(() => {
    if (!b) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const base = cleanSpec(b.recipe.spec);
    const has = base.colorways.length > 0;
    return buildBriefHtml({
      template: b.template, recipe: b.recipe, spec: applyColorway(base, cw), choices: b.choices, stock: b.stock, useVector: vector,
      baseSpec: has ? base : undefined, colorwayName: has ? colorwayLabel(base, cw) : null,
      img: (key, w) => `${origin}${r2ImageUrl(key, w) ?? ""}`,
      dateText: new Date(b.recipe.updated_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
    });
  }, [b, vector, cw]);

  if (err) return <div className="min-h-screen bg-slate-100 p-10"><ErrorState title="เปิดใบสรุปไม่สำเร็จ" hint={err} /></div>;
  if (!b) return <div className="min-h-screen bg-slate-100 p-10"><LoadingState label="กำลังเตรียมใบสรุป…" /></div>;
  const base = cleanSpec(b.recipe.spec);
  const fileName = `${b.template.code}-สูตร${b.recipe.seq}${base.colorways.length ? `-${colorwayLabel(base, cw)}` : ""}`;
  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar fileName={fileName} />
      {base.colorways.length > 0 && (
        <div className="no-print max-w-[840px] mx-auto mt-3 px-4 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          ชุดสี:
          {[{ id: null as string | null, name: colorwayLabel(base, null) }, ...base.colorways.map((c) => ({ id: c.id as string | null, name: c.name }))].map((c) => (
            <button key={c.id ?? "main"} type="button" onClick={() => setCw(c.id)} className={`h-8 px-3 rounded-lg border ${cw === c.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200"}`}>{c.name}</button>
          ))}
        </div>
      )}
      {b.template.vector_image_key && (
        <div className="no-print max-w-[840px] mx-auto mt-3 px-4 flex items-center gap-2 text-[13px] text-slate-600">
          รูปในใบ:
          <button type="button" onClick={() => setVector(false)} className={`h-8 px-3 rounded-lg border ${!vector ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200"}`}>รูปจริง</button>
          <button type="button" onClick={() => setVector(true)} className={`h-8 px-3 rounded-lg border ${vector ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200"}`}>Vector</button>
        </div>
      )}
      <div className="py-4 px-2"><PrintFrame html={html} fileName={fileName} fit /></div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-100" />}><BriefInner /></Suspense>;
}
