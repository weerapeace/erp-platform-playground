"use client";

// แผงเลือกรูปทรง flowchart (ใช้ภายใน components/flowchart-board เท่านั้น)
//   - ปุ่ม "รูปทรง ▾" บนแถบเครื่องมือ: กด = วางกลางจอ · ลาก = วางตรงจุดที่ปล่อย (ข้อ 4) · แถวบน = ใช้ล่าสุด (ข้อ 3)
//   - ปุ่ม "รูปทรง" บนแถบเหนือกล่อง: เปลี่ยนรูปทรงกล่องเดิม (ข้อ 1) — รวม กล่อง / เริ่ม-จบ / คำถาม
//   ชี้ที่รูปทรง = บอกความหมายมาตรฐาน (ข้อ 2) · รูปทรงจากทะเบียน lib/flowchart-shapes

import { useState } from "react";
import { FLOW_SHAPES, flowShapeOf } from "@/lib/flowchart-shapes";

export const SHAPE_DRAG_MIME = "application/x-flow-shape";

/** รูปทรงพื้นฐานเดิมของกระดาน (ใช้ในเมนูเปลี่ยนรูปทรง) */
const BASIC: { key: "step" | "start" | "question"; th: string; en: string; meanTh: string; meanEn: string; d: string }[] = [
  { key: "step",     th: "กล่อง",       en: "Box",      meanTh: "ขั้นตอน 1 อย่าง", meanEn: "One step", d: "M1,1 H99 V59 H1 Z" },
  { key: "start",    th: "เริ่ม / จบ",   en: "Start/end", meanTh: "จุดเริ่มหรือจุดจบ", meanEn: "Where the flow starts or ends", d: "M30,1 H70 A29,29 0 0 1 70,59 H30 A29,29 0 0 1 30,1 Z" },
  { key: "question", th: "คำถาม",      en: "Decision", meanTh: "แยกทาง ใช่ / ไม่ใช่", meanEn: "Branch yes / no", d: "M50,1 L99,30 L50,59 L1,30 Z" },
];

/** ไอคอนรูปทรงเล็ก (SVG) */
export function ShapeIcon({ k, w = 40, h = 26 }: { k: string; w?: number; h?: number }) {
  const b = BASIC.find((x) => x.key === k);
  const s = b ? null : flowShapeOf(k);
  const common = { stroke: "currentColor", strokeWidth: 1.6, vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg width={w} height={h} viewBox="0 0 100 60" preserveAspectRatio="none" className="overflow-visible text-violet-500" aria-hidden="true">
      {b ? <path d={b.d} fill="#f5f3ff" {...common} /> : <>
        {s!.fill.map((d) => <path key={d} d={d} fill="#f5f3ff" {...common} />)}
        {(s!.line ?? []).map((d) => <path key={d} d={d} fill="none" {...common} />)}
      </>}
    </svg>
  );
}

type Item = { key: string; th: string; en: string; meanTh: string; meanEn: string };

export function ShapePalette({ t, onPick, recent = [], includeBasic = false, draggable = false, current }: {
  t: (th: string, en: string) => string;
  onPick: (key: string) => void;
  /** key ที่ใช้ล่าสุด (โชว์แถวบน) */
  recent?: string[];
  includeBasic?: boolean;
  draggable?: boolean;
  /** รูปทรงตอนนี้ของกล่อง (ไฮไลต์) */
  current?: string;
}) {
  const all: Item[] = [...(includeBasic ? BASIC : []), ...FLOW_SHAPES];
  const recents = recent.map((k) => all.find((x) => x.key === k)).filter((x): x is Item => !!x);
  const [hint, setHint] = useState<Item | null>(null);
  const cell = (s: Item, small = false) => (
    <button key={s.key} type="button" onClick={() => onPick(s.key)} onMouseEnter={() => setHint(s)} onFocus={() => setHint(s)}
      draggable={draggable} onDragStart={draggable ? (e) => { e.dataTransfer.setData(SHAPE_DRAG_MIME, s.key); e.dataTransfer.effectAllowed = "copy"; } : undefined}
      title={t(s.meanTh, s.meanEn)}
      className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10.5px] leading-tight text-slate-700 hover:bg-violet-50 ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${current === s.key ? "bg-violet-100 ring-1 ring-violet-300" : ""}`}>
      <ShapeIcon k={s.key} w={small ? 34 : 40} h={small ? 22 : 26} />
      <span className="w-full truncate text-center">{t(s.th, s.en)}</span>
    </button>
  );
  return (
    <div className="w-[300px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {recents.length > 0 && (
        <>
          <div className="px-1 pb-0.5 text-[10.5px] text-slate-400">{t("ใช้ล่าสุด", "Recent")}</div>
          <div className="mb-1 grid grid-cols-4 gap-0.5 border-b border-slate-100 pb-1">{recents.map((s) => cell(s, true))}</div>
        </>
      )}
      <div className="grid grid-cols-4 gap-0.5">{all.map((s) => cell(s))}</div>
      <div className="mt-1 min-h-[30px] border-t border-slate-100 px-1 pt-1 text-[11px] leading-snug text-slate-500">
        {hint ? <><b className="text-slate-700">{t(hint.th, hint.en)}</b> — {t(hint.meanTh, hint.meanEn)}</>
          : draggable ? t("กด = วางกลางจอ · ลากไปวางตรงจุดที่ต้องการได้ · ชี้ = ดูความหมาย", "Click to add · drag onto the board · hover for the meaning")
          : t("ชี้ที่รูปทรงเพื่อดูความหมาย", "Hover a shape for its meaning")}
      </div>
    </div>
  );
}
