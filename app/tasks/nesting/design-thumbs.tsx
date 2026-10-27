"use client";

/**
 * รูปจิ๋วของลายในงาน (หน้ารายการ) — สูงสุด 3 รูป + "+N" · ชี้ค้าง = กล่องรูปใหญ่ทุกลาย + ชื่อ + จำนวน
 *   ลายจากคลัง = รูปจากคลังไฟล์ (job.thumbs · ทุกเครื่องเห็น)
 *   ลายที่ลาก PNG เอง = รูปย่อจากตัวช่วยในเครื่อง (เครื่องที่ไม่มีไฟล์ = ไอคอนไม่มีรูป)
 *   ชิ้นที่แยกจากภาพเดียวกัน = 1 ลาย (รูปภาพเต็ม)
 * กล่องชี้ค้าง = ของกลาง HoverCardWrap (components/hover-card)
 */
import { useState } from "react";
import { HoverCardWrap } from "@/components/hover-card";
import { useT } from "@/components/i18n";
import { withImageWidth } from "@/lib/r2-image";
import { helperFileUrl } from "@/lib/nesting-helper";
import type { NestingItem } from "./data";

export type JobDesign = { id: string; title: string; qty: number; url: string | null; sha: string | null };

const SHOW = 3;
const HOVER_MAX = 12;

/** ลายในงาน (รวมชิ้นที่แยกจากภาพเดียวกัน · ลายเดียวกันหลายแถว = รวมจำนวน) */
export function jobDesigns(items: NestingItem[], thumbs: Record<string, string> = {}): JobDesign[] {
  const map = new Map<string, JobDesign>();
  for (const it of items) {
    const sha = it.piece?.source.sha ?? it.file?.sha ?? null;
    const id = it.piece ? `p:${it.piece.source.sha}` : it.asset_id ?? sha ?? it.key;
    const d = map.get(id);
    if (d) {
      d.qty = it.piece ? Math.max(d.qty, it.qty) : d.qty + it.qty;   // ชิ้นที่แยก = จำนวนเท่ากันทั้งกลุ่ม
      continue;
    }
    map.set(id, {
      id, sha, qty: it.qty,
      title: it.piece?.parent.title || it.title || it.file?.name || "",
      url: it.asset_id ? thumbs[it.asset_id] ?? null : null,
    });
  }
  return [...map.values()];
}

function Thumb({ d, size, helperReady, className = "" }: { d: JobDesign; size: number; helperReady: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = d.url ? withImageWidth(d.url, size * 3) ?? d.url : helperReady && d.sha ? helperFileUrl(d.sha, "thumb") : null;
  const box = { width: size, height: size };
  return (
    <span style={box} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white ring-2 ring-white ${className}`}>
      {src && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-contain" />
        : <span className="text-slate-300" style={{ fontSize: Math.round(size * 0.45) }}>🖼</span>}
    </span>
  );
}

export function DesignThumbs({ designs, helperReady }: { designs: JobDesign[]; helperReady: boolean }) {
  const t = useT();
  if (!designs.length) return null;
  const more = designs.length - SHOW;
  return (
    <HoverCardWrap enabled className="flex shrink-0 items-center" details={() => (
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">{t(`ลายในงานนี้ · ${designs.length} ลาย`, `Designs in this job · ${designs.length}`)}</p>
        <div className="grid grid-cols-3 gap-2">
          {designs.slice(0, HOVER_MAX).map((d) => (
            <div key={d.id} className="min-w-0 text-center">
              <Thumb d={d} size={88} helperReady={helperReady} className="!rounded-lg bg-slate-50 !ring-0" />
              <p className="mt-1 truncate text-[11px] text-slate-600" title={d.title}>{d.title || "—"}</p>
              <p className="text-[11px] text-slate-400">× {d.qty}</p>
            </div>
          ))}
        </div>
        {designs.length > HOVER_MAX && (
          <p className="mt-2 text-[11px] text-slate-400">{t(`และอีก ${designs.length - HOVER_MAX} ลาย — เปิดงานเพื่อดูทั้งหมด`, `and ${designs.length - HOVER_MAX} more — open the job to see all`)}</p>
        )}
      </div>
    )}>
      {designs.slice(0, SHOW).map((d, i) => <Thumb key={d.id} d={d} size={30} helperReady={helperReady} className={i ? "-ml-2" : ""} />)}
      {more > 0 && (
        <span className="-ml-2 inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-1 text-[11px] font-medium text-slate-600 ring-2 ring-white">+{more}</span>
      )}
    </HoverCardWrap>
  );
}
