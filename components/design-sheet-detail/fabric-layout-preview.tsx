"use client";

// ============================================================
// FabricLayoutPreview — ภาพผังการวางชิ้นบนหน้าผ้า (จากผล packFabric) — ของกลาง
//   ใช้ที่: เครื่องคิดเลขผ้าในใบงานออกแบบ · ป๊อป ผัง ในใบสั่งผลิต · วางแผนตัดผ้า · คำนวณผ้า (/fabric-calc)
//   ผ้าม้วน: ผ้ายาวต่อเนื่อง · ผ้าผืน: แยกทีละผืน
//   แนวตั้ง เลื่อนขึ้นลง (เจ้าของขอ 2026-11-13 "ผ้าเป็นแนวตั้ง ลากขึ้นลง"): ผ้าทั้งม้วนเป็นแถบยาวเดียว อยู่ในกล่องสูงจำกัด
//     นิ้ว = ปัดขึ้นลงตามปกติ · เมาส์ = กดลากขึ้นลงได้ (หรือล้อเมาส์) · แถบเล็กขวา = ตำแหน่งที่ดูอยู่ แตะเพื่อกระโดด · บนกล่องบอกช่วงที่เห็น (ซม.)
//     (เดิม 2026-09-04: ตัดเป็นหน้า ๆ ช่วงละ ~2-3 ม. กด ‹ › — เลิกใช้)
//   ชิ้นเดียวกัน (ขนาดเดียวกัน) = สีเดียวกัน · ชี้เมาส์ดูขนาด · ↻ = ชิ้นที่หมุน 90°
//   ป้ายในกล่อง (เจ้าของขอ 2026-11-13): เลขชิ้นในวงกลม + ชื่อชิ้น + ขนาด · ตัวหนังสือย่อตามกล่อง ไม่ล้น · ชิ้นสูงแคบเขียนแนวตั้ง · เล็กมาก = เลขอย่างเดียว
//     numbers = เลขชิ้นจากผู้เรียก (ให้ตรงกับตาราง/ใบวิธีตัด — lib/fabric-cut-sheet pieceNumbers) · ไม่ส่ง = เรียงตามที่เจอในผัง
//
//   ⚠️ วาดด้วยหน่วย "ซม." ตรง ๆ ใน viewBox (ไม่คูณ scale เอง) — ภาพจึงไม่ถูกบีบเมื่อผ้ายาว
// ============================================================

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { FabricResult, FabricRow } from "@/lib/fabric-calc";
import { useT } from "@/components/i18n";

// สีชุดอ่านง่าย (ไล่เฉด ไม่ฉูดฉาด) — ใช้วนตามชนิดชิ้น
const PALETTE = [
  { fill: "#c7d2fe", stroke: "#6366f1", text: "#3730a3" },
  { fill: "#bbf7d0", stroke: "#22c55e", text: "#166534" },
  { fill: "#fed7aa", stroke: "#f97316", text: "#9a3412" },
  { fill: "#fbcfe8", stroke: "#ec4899", text: "#9d174d" },
  { fill: "#bae6fd", stroke: "#0ea5e9", text: "#075985" },
  { fill: "#fde68a", stroke: "#f59e0b", text: "#92400e" },
  { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#5b21b6" },
  { fill: "#a5f3fc", stroke: "#06b6d4", text: "#155e75" },
];

const W = 360;            // ความกว้างภาพตั้งต้น (px) — หน้าผ้าเต็มความกว้างนี้
const MAX_SHEETS = 10;    // ผ้าผืน: วาดไม่เกินกี่ผืน (ผืนที่เหลือหน้าตาเหมือนกัน)
const LABEL_H = 18;       // ความสูงป้ายเหนือแต่ละแถบ (px)

type Strip = { label: string; len: number; rows: FabricRow[] };

/** ป้ายที่เป็นแค่ขนาด เช่น "26×55" หรือ "26 x 55 ซม." (ไม่มีชื่อชิ้น) */
const SIZE_ONLY = /^\s*\d+(\.\d+)?\s*[×x]\s*\d+(\.\d+)?\s*(ซม\.|cm)?\s*$/;

export function FabricLayoutPreview({ result, faceWidthCm, sheetLengthCm, mode, numbers, width = W, maxHeight = 520 }: {
  result: FabricResult;
  faceWidthCm: number;
  sheetLengthCm?: number | null;
  mode: "roll" | "sheet";
  /** เลขชิ้น { key: เลข } ให้ตรงกับตารางชิ้น/ใบวิธีตัด · ไม่ส่ง = เรียงตามที่เจอในผัง */
  numbers?: Record<string, number>;
  /** ความกว้างภาพ (px) = หน้าผ้า */
  width?: number;
  /** ความสูงกล่องเลื่อน (px) */
  maxHeight?: number;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, h: 0, total: 1 });

  // สีต่อชนิดชิ้น (ตาม key ของบรรทัด)
  const colorOf = useMemo(() => {
    const keys = [...new Set(result.rows.flatMap((r) => r.items.map((i) => i.key)))];
    const m = new Map<string, typeof PALETTE[number]>();
    keys.forEach((k, i) => m.set(k, PALETTE[i % PALETTE.length]));
    return (k: string) => m.get(k) ?? PALETTE[0];
  }, [result.rows]);
  const numOf = useMemo(() => {
    if (numbers) return (k: string) => numbers[k];
    const keys = [...new Set(result.rows.flatMap((r) => r.items.map((i) => i.key)))];
    const m = new Map(keys.map((k, i) => [k, i + 1]));
    return (k: string) => m.get(k);
  }, [numbers, result.rows]);

  const scale = faceWidthCm > 0 ? width / faceWidthCm : 1;          // px ต่อ ซม.

  // แถบผ้า: ม้วน = แถบเดียว · ผืน = ทีละผืน (ไม่เกิน MAX_SHEETS)
  const totalSheets = mode === "sheet" ? (result.sheetsUsed ?? 0) : 1;
  const drawable = mode === "sheet" ? (result.sheetsDrawn ?? result.sheetsUsed ?? 0) : 1;
  const shownSheets = Math.min(drawable, MAX_SHEETS);
  const strips = useMemo<Strip[]>(() => {
    if (mode === "sheet" && drawable > 0) {
      return Array.from({ length: shownSheets }, (_, s) => ({
        label: t(`ผืนที่ ${s + 1}`, `Sheet ${s + 1}`), len: Number(sheetLengthCm) || 0,
        rows: result.rows.filter((r) => (r.sheetIndex ?? 0) === s).map((r) => ({ ...r, y: r.yInSheet ?? r.y })),
      }));
    }
    // ล็อตใหญ่ (จำลองบางส่วน) = วาดเท่าที่จำลองจริง · ปกติ = ยาวเท่าที่ใช้
    const drawn = result.rows.reduce((m, r) => Math.max(m, r.y + r.height), 0);
    const len = result.sampledFrom ? drawn : Math.max(drawn, result.usedLengthCm || 0);
    return [{ label: t("ผ้าม้วน (ต่อเนื่อง)", "Roll fabric (continuous)"), len: Math.max(1, len), rows: result.rows }];
  }, [mode, drawable, shownSheets, sheetLengthCm, result, t]);

  const sync = useCallback(() => {
    const el = box.current; if (!el) return;
    setView({ top: el.scrollTop, h: el.clientHeight, total: Math.max(1, el.scrollHeight) });
  }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = 0; sync(); }, [result, sync]);   // ผลใหม่ → กลับต้นผ้า
  useEffect(() => {   // ซ่อนอยู่แล้วโผล่ (เช่น ขั้น ③ ของหน้าคิดผ้า) / หมุนจอ → วัดขนาดใหม่
    const el = box.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sync()); ro.observe(el);
    return () => ro.disconnect();
  }, [sync, result.ok]);

  // เมาส์: กดลากขึ้นลง (นิ้วใช้การปัดปกติของเบราว์เซอร์ — touch-action: pan-y)
  const drag = useRef<{ y: number; top: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !box.current) return;
    drag.current = { y: e.clientY, top: box.current.scrollTop };
    try { box.current.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ */ }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { if (drag.current && box.current) box.current.scrollTop = drag.current.top - (e.clientY - drag.current.y); };
  const onUp = () => { drag.current = null; };

  if (!result.ok || result.rows.length === 0) return null;
  const fmt = (n: number) => Math.round(n * 10) / 10;

  const renderStrip = (st: Strip, key: number) => {
    const h = st.len;
    const gridN = Math.max(0, Math.floor(h / 10) + 1);
    return (
      <div key={key} className={key > 0 ? "mt-3" : ""}>
        <div className="sticky top-0 z-[1] bg-white/90 text-center text-[11px] text-slate-500" style={{ lineHeight: `${LABEL_H}px` }}>{st.label} · {t(`ยาว ${fmt(st.len)} ซม.`, `${fmt(st.len)} cm long`)}</div>
        <svg width={width} height={Math.max(24, h * scale)} viewBox={`0 0 ${faceWidthCm} ${h}`} preserveAspectRatio="none"
          className="block rounded border-2 border-slate-300 bg-slate-100" role="img" aria-label={t(`ผังการวาง ${st.label}`, `Layout ${st.label}`)}>
          <rect x={0} y={0} width={faceWidthCm} height={h} fill="#f1f5f9" />
          {Array.from({ length: gridN }, (_, i) => {
            const y = i * 10; const major = y % 50 === 0;
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={faceWidthCm} y2={y} stroke={major ? "#cbd5e1" : "#e2e8f0"} strokeWidth={(major ? 0.8 : 0.5) / scale} />
                {major && y > 0 && <text x={1.5} y={y - 1} fontSize={8 / scale} fill="#94a3b8">{y}</text>}
              </g>
            );
          })}
          {st.rows.flatMap((r) => r.items.map((it, ii) => {
            const c = colorOf(it.key);
            const no = numOf(it.key);
            const wPx = it.w * scale, hPx = it.h * scale;
            const vert = hPx > wPx * 1.6 && wPx < 70;          // ชิ้นสูงแคบ → เขียนแนวตั้ง
            const L = vert ? hPx : wPx, T = vert ? wPx : hPx;   // ความยาว/ความหนาของแนวตัวหนังสือ (px)
            const size = `${Math.round(it.w * 10) / 10}×${Math.round(it.h * 10) / 10}`;
            const named = !!it.label && !SIZE_ONLY.test(it.label);
            const main = `${it.rotated ? "↻ " : ""}${named ? it.label : size}`;
            const badge = no != null && Math.min(wPx, hPx) >= 12;
            const br = Math.min(7, Math.min(wPx, hPx) * 0.3);
            const room = L - (badge && !vert ? br * 2 + 4 : 0) - 4;
            const fs = Math.min(11, room / (main.length * 0.62 + 0.5), T * 0.42);   // ย่อให้พอดีกล่อง
            const showMain = fs >= 6;
            const subFs = Math.min(fs * 0.85, room / (size.length * 0.6 + 0.5));
            const showSub = showMain && named && T >= fs * 2.7 && subFs >= 5.5;
            const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
            const off = showSub ? (fs * 0.55) / scale : 0;
            const rot = vert ? `rotate(-90 ${cx} ${cy})` : undefined;
            return (
              <g key={`${r.y}-${ii}`}>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.8 / scale} rx={1.5 / scale}>
                  <title>{`${no != null ? `${no}. ` : ""}${named ? `${it.label} · ` : ""}`}{t(`${it.w}×${it.h} ซม.${it.rotated ? " (หมุน 90°)" : ""} · ตำแหน่ง ${fmt(it.y)} ซม.`, `${it.w}×${it.h} cm${it.rotated ? " (rotated 90°)" : ""} · position ${fmt(it.y)} cm`)}</title>
                </rect>
                {badge && (() => {
                  const bx = vert ? cx : it.x + (br + 2) / scale, by = it.y + (br + 2) / scale;
                  return <g>
                    <circle cx={bx} cy={by} r={br / scale} fill="#fff" stroke={c.stroke} strokeWidth={0.7 / scale} />
                    <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fontSize={(br * 1.2) / scale} fontWeight={700} fill={c.text}>{no}</text>
                  </g>;
                })()}
                {showMain && (
                  <text x={cx} y={cy - off} textAnchor="middle" dominantBaseline="middle" fontSize={fs / scale} fill={c.text} transform={rot}>{main}</text>
                )}
                {showSub && (
                  <text x={cx} y={cy + off} textAnchor="middle" dominantBaseline="middle" fontSize={subFs / scale} fill={c.text} opacity={0.8} transform={rot}>{size}</text>
                )}
              </g>
            );
          }))}
        </svg>
      </div>
    );
  };

  // ช่วงที่เห็นอยู่ (ซม.) — ผ้าม้วนแถบเดียว
  const rollLen = mode === "roll" ? strips[0]?.len ?? 0 : 0;
  const fromCm = Math.max(0, (view.top - LABEL_H) / scale), toCm = Math.min(rollLen, Math.max(0, (view.top + view.h - LABEL_H) / scale));
  const scrollable = view.total > view.h + 2;
  const thumbH = scrollable ? Math.max(8, (view.h / view.total) * 100) : 100, thumbTop = scrollable ? (view.top / view.total) * 100 : 0;
  const jump = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = box.current; if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.scrollTop = ((e.clientY - r.top) / r.height) * el.scrollHeight - el.clientHeight / 2;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          {t(`ผังการวาง — หน้าผ้า ${faceWidthCm} ซม. (แนวนอน) · ความยาวผ้าลงล่าง · ↻ = หมุนชิ้น 90° · ตัวเลขซ้าย = ระยะจากต้นผ้า (ซม.)`, `Layout — fabric width ${faceWidthCm} cm (horizontal) · fabric length runs down · ↻ = piece rotated 90° · left numbers = distance from fabric start (cm)`)}
        </p>
        <span className="text-[11px] text-slate-400">{scrollable ? t("ปัด/ลากขึ้นลงเพื่อเลื่อน", "Swipe/drag up or down to scroll") : t("พื้นที่เทา = เศษที่เหลือ", "Grey = leftover scrap")}</span>
      </div>
      {mode === "roll" && scrollable && (
        <div className="text-center text-[11.5px] font-medium text-indigo-600" data-layout-pos>{t(`ช่วง ${Math.round(fromCm)}–${Math.round(toCm)} ซม. จาก ${Math.round(rollLen).toLocaleString()} ซม.`, `Showing ${Math.round(fromCm)}–${Math.round(toCm)} of ${Math.round(rollLen).toLocaleString()} cm`)}</div>
      )}
      <div className="flex justify-center gap-1.5">
        <div ref={box} onScroll={sync} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="relative cursor-grab select-none overflow-y-auto overscroll-contain rounded-lg bg-white active:cursor-grabbing [scrollbar-width:thin]"
          style={{ maxHeight, width: width + 4, touchAction: "pan-y" }} data-layout-scroll>
          {strips.map((st, i) => renderStrip(st, i))}
        </div>
        {scrollable && (
          <div onClick={jump} className="relative w-2.5 shrink-0 cursor-pointer rounded-full bg-slate-100" style={{ height: view.h || maxHeight }} title={t("แตะเพื่อกระโดดไปช่วงนั้น", "Tap to jump there")}>
            <div className="absolute left-0 right-0 rounded-full bg-indigo-400/70" style={{ top: `${thumbTop}%`, height: `${thumbH}%` }} />
          </div>
        )}
      </div>
      {result.sampledFrom && (
        <p className="text-[11px] text-amber-600">{t(`* ล็อตใหญ่: จำลองวาง ${result.sampledFrom.simulated.toLocaleString()} จาก ${result.sampledFrom.total.toLocaleString()} ชิ้น แล้วขยายสัดส่วน — ผังที่เห็นคือช่วงต้นของผ้า ยอดที่ต้องสั่งคิดครบแล้ว`, `* Large lot: simulated ${result.sampledFrom.simulated.toLocaleString()} of ${result.sampledFrom.total.toLocaleString()} pcs and scaled up — the layout shown is the start of the fabric; the order quantity already covers everything`)}</p>
      )}
      {totalSheets > shownSheets && (
        <p className="text-[11px] text-amber-600">{t(`* แสดง ${shownSheets} จาก ${totalSheets} ผืน (ผืนที่เหลือวางแบบเดียวกัน) — ยอดที่ต้องสั่งด้านบนคิดครบทุกผืนแล้ว`, `* Showing ${shownSheets} of ${totalSheets} sheets (the rest use the same layout) — the order quantity above already covers every sheet`)}</p>
      )}
    </div>
  );
}
