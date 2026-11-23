"use client";

/**
 * ของอ้างอิงจากกระดานแคนวาสของแบรนด์ (Design Dashboard มุมมอง "แคนวาส") — โชว์ในใบงาน (เจ้าของเลือกข้อ 4 · 2026-11-23)
 * รูป / ลิงก์ / ข้อความ ที่ลากลูกศรผูกกับการ์ดใบงานนี้บนกระดานแบรนด์ → โชว์เป็นแถบในแท็บข้อมูลงาน (ดูอย่างเดียว · แก้ที่กระดาน)
 * ไม่มีของผูก = ไม่โชว์อะไรเลย (ไม่กินที่) · อ่านกระดานผ่าน /api/canvas-sketch (สิทธิ์ตามกระดาน)
 * ตรรกะหาของที่ผูก: lib/design-brand-canvas.ts refsForSheet (มีเทสต์)
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { refsForSheet, type CanvasEl, type SheetRef } from "@/lib/design-brand-canvas";

export function BrandCanvasRefs({ sheetId, brandId }: { sheetId: string; brandId: string | null | undefined }) {
  const t = useT();
  const [refs, setRefs] = useState<SheetRef[]>([]);
  useEffect(() => {
    setRefs([]);
    if (!brandId) return;
    let alive = true;
    apiFetch(`/api/canvas-sketch?entity_type=design_brand_canvas&entity_id=${encodeURIComponent(brandId)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const scene = (j?.scene ?? null) as { elements?: CanvasEl[]; files?: Record<string, { dataURL?: string }> } | null;
        if (!scene?.elements) return;
        const files = scene.files ?? {};
        setRefs(refsForSheet(scene.elements, sheetId, (fid) => { const u = files[fid]?.dataURL; return typeof u === "string" && !u.startsWith("data:") ? u : null; }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [sheetId, brandId]);

  if (!refs.length) return null;
  const board = `/master/design-dashboard?brand=${encodeURIComponent(brandId ?? "")}&view=canvas`;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-violet-700">
        <Icon value="i:brush" /> {t(`อ้างอิงจากกระดานแบรนด์ (${refs.length})`, `References from the brand canvas (${refs.length})`)}
        <a href={board} target="_blank" rel="noopener noreferrer" className="ml-auto text-violet-600 hover:underline">{t("เปิดกระดาน ↗", "Open canvas ↗")}</a>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {refs.map((r) => r.kind === "image" ? (
          r.url ? <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" title={t("เปิดรูป", "Open image")}>
            <img src={r.url} alt="" loading="lazy" className="h-16 w-16 rounded-md border border-white bg-white object-cover shadow-sm" />
          </a> : <span key={r.id} className="flex h-16 w-16 items-center justify-center rounded-md bg-white text-[10px] text-slate-400">{t("รูป", "Image")}</span>
        ) : r.kind === "link" ? (
          <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noopener noreferrer"
            className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-white bg-white px-2 py-1 text-[11px] text-blue-700 shadow-sm hover:underline">
            <Icon value="i:link" /> <span className="truncate">{r.text || (r.url ?? "").replace(/^https?:\/\/(www\.)?/, "")}</span>
          </a>
        ) : (
          <span key={r.id} className="max-w-[240px] whitespace-pre-wrap rounded-md border border-white bg-white px-2 py-1 text-[11px] text-slate-700 shadow-sm">{r.text}</span>
        ))}
      </div>
    </div>
  );
}
