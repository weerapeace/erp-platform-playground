"use client";

// ============================================================
// FabricLayoutPreview — ภาพผังการวางชิ้นบนหน้าผ้า (จากผล packFabric) — ของกลาง
//   ใช้ที่: เครื่องคิดเลขผ้าในใบงานออกแบบ · ป๊อป 🧵 ผัง ในใบสั่งผลิต
//   ผ้าม้วน: ผ้ายาวต่อเนื่อง · ผ้าผืน: แยกทีละผืน
//   ผ้ายาวมาก (หลายสิบเมตร) → "ตัดเป็นหน้า ๆ" ช่วงละ ~2-3 เมตร กด ‹ › ดูทีละหน้า (เจ้าของขอ 2026-09-04)
//   ชิ้นเดียวกัน (ขนาดเดียวกัน) = สีเดียวกัน · ชี้เมาส์ดูขนาด · ↻ = ชิ้นที่หมุน 90°
//
//   ⚠️ วาดด้วยหน่วย "ซม." ตรง ๆ ใน viewBox (ไม่คูณ scale เอง) — ภาพจึงไม่ถูกบีบเมื่อผ้ายาว
//      (เวอร์ชันก่อนจำกัดสูง 900px แล้ว preserveAspectRatio ย่อทั้งภาพ → ดูเหมือนเศษเทาเยอะทั้งที่คุ้ม 97%)
// ============================================================

import { useMemo, useState, useEffect } from "react";
import type { FabricResult, FabricRow } from "@/lib/fabric-calc";

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

const W = 360;            // ความกว้างภาพ (px) — หน้าผ้าเต็มความกว้างนี้
const PAGE_PX = 560;      // ความสูงภาพต่อหน้า (px) → ความยาวผ้าต่อหน้า = PAGE_PX / scale (หน้าผ้า 150 ≈ 233 ซม./หน้า)
const MAX_SHEETS = 10;    // ผ้าผืน: วาดไม่เกินกี่ผืน (ผืนที่เหลือหน้าตาเหมือนกัน)

type Page = { stripLabel: string; stripIndex: number; from: number; to: number; rows: FabricRow[]; stripLen: number };

export function FabricLayoutPreview({ result, faceWidthCm, sheetLengthCm, mode }: {
  result: FabricResult;
  faceWidthCm: number;
  sheetLengthCm?: number | null;
  mode: "roll" | "sheet";
}) {
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);

  // สีต่อชนิดชิ้น (ตาม key ของบรรทัด)
  const colorOf = useMemo(() => {
    const keys = [...new Set(result.rows.flatMap((r) => r.items.map((i) => i.key)))];
    const m = new Map<string, typeof PALETTE[number]>();
    keys.forEach((k, i) => m.set(k, PALETTE[i % PALETTE.length]));
    return (k: string) => m.get(k) ?? PALETTE[0];
  }, [result.rows]);

  const scale = faceWidthCm > 0 ? W / faceWidthCm : 1;          // px ต่อ ซม.
  const segCm = Math.max(faceWidthCm, Math.round(PAGE_PX / scale)); // ความยาวผ้าต่อหน้า (ซม.)

  // แบ่งเป็น "ผืน" (strip) — ผ้าม้วน = ผืนเดียวยาวเท่าที่ใช้ · ผ้าผืน = ทีละผืน (ไม่เกิน MAX_SHEETS)
  const totalSheets = mode === "sheet" ? (result.sheetsUsed ?? 0) : 1;
  const drawable = mode === "sheet" ? (result.sheetsDrawn ?? result.sheetsUsed ?? 0) : 1;
  const shownSheets = Math.min(drawable, MAX_SHEETS);
  const pages = useMemo<Page[]>(() => {
    const strips: { label: string; height: number; rows: FabricRow[] }[] = [];
    if (mode === "sheet" && drawable > 0) {
      for (let s = 0; s < shownSheets; s++) {
        strips.push({ label: `ผืนที่ ${s + 1}`, height: Number(sheetLengthCm) || 0,
          rows: result.rows.filter((r) => (r.sheetIndex ?? 0) === s).map((r) => ({ ...r, y: r.yInSheet ?? r.y })) });
      }
    } else {
      strips.push({ label: "ผ้าม้วน (ต่อเนื่อง)", height: result.usedLengthCm, rows: result.rows });
    }
    // ตัดแต่ละผืนเป็นหน้า ๆ ช่วงละ segCm — ชิ้นที่คร่อมขอบหน้าถูกวาดต่อในหน้าถัดไปเอง (svg ตัดขอบให้)
    const out: Page[] = [];
    strips.forEach((st, si) => {
      const n = Math.max(1, Math.ceil(st.height / segCm));
      for (let p = 0; p < n; p++) {
        const from = p * segCm, to = Math.min(st.height, (p + 1) * segCm);
        out.push({ stripLabel: st.label, stripIndex: si, from, to, stripLen: st.height,
          rows: st.rows.filter((r) => r.y < to && r.y + r.height > from) });
      }
    });
    return out;
  }, [mode, drawable, shownSheets, sheetLengthCm, result, segCm]);

  useEffect(() => { setPage(0); }, [result]);   // ผลใหม่ → กลับหน้าแรก

  if (!result.ok || result.rows.length === 0) return null;
  const cur = pages[Math.min(page, pages.length - 1)];
  const fmt = (n: number) => Math.round(n * 10) / 10;

  const renderPage = (pg: Page, key: string | number) => {
    const h = pg.to - pg.from;
    const gridStart = Math.ceil(pg.from / 10) * 10;
    const gridN = Math.max(0, Math.floor((pg.to - gridStart) / 10) + 1);
    return (
      <div key={key} className="shrink-0">
        <div className="text-[11px] text-slate-500 mb-1 text-center">
          {pg.stripLabel} · ช่วง {fmt(pg.from)}–{fmt(pg.to)} ซม.{pg.stripLen > segCm ? ` (ยาวทั้งหมด ${fmt(pg.stripLen)} ซม.)` : ""}
        </div>
        {/* วาดในหน่วย ซม. ตรง ๆ: viewBox = [0, from, หน้าผ้า, ความยาวช่วงนี้] → ไม่ถูกบีบ ไม่ว่าผ้าจะยาวแค่ไหน */}
        <svg width={W} height={Math.max(24, h * scale)} viewBox={`0 ${pg.from} ${faceWidthCm} ${h}`} preserveAspectRatio="none"
          className="border-2 border-slate-300 rounded bg-slate-100 block" role="img" aria-label={`ผังการวาง ${pg.stripLabel} ${fmt(pg.from)}-${fmt(pg.to)} ซม.`}>
          <rect x={0} y={pg.from} width={faceWidthCm} height={h} fill="#f1f5f9" />
          {Array.from({ length: gridN }, (_, i) => {
            const y = gridStart + i * 10; const major = y % 50 === 0;
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={faceWidthCm} y2={y} stroke={major ? "#cbd5e1" : "#e2e8f0"} strokeWidth={(major ? 0.8 : 0.5) / scale} />
                {major && <text x={1.5} y={y - 1} fontSize={8 / scale} fill="#94a3b8">{y}</text>}
              </g>
            );
          })}
          {pg.rows.flatMap((r) => r.items.map((it, ii) => {
            const c = colorOf(it.key);
            const showText = it.w * scale > 34 && it.h * scale > 14;
            return (
              <g key={`${r.y}-${ii}`}>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.8 / scale} rx={1.5 / scale}>
                  <title>{`${it.w}×${it.h} ซม.${it.rotated ? " (หมุน 90°)" : ""} · ตำแหน่ง ${fmt(it.y)} ซม.`}</title>
                </rect>
                {showText && (
                  <text x={it.x + it.w / 2} y={it.y + it.h / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(9, it.h * scale * 0.5) / scale} fill={c.text}>
                    {it.rotated ? "↻ " : ""}{Math.round(it.w)}×{Math.round(it.h)}
                  </text>
                )}
              </g>
            );
          }))}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[12px] text-slate-500">
          🧵 ผังการวาง — หน้าผ้า {faceWidthCm} ซม. (แนวนอน) · ความยาวผ้าลงล่าง · ↻ = หมุนชิ้น 90° · ตัวเลขซ้าย = ระยะจากต้นผ้า (ซม.)
        </p>
        <span className="text-[11px] text-slate-400">พื้นที่เทาในกรอบ = เศษที่เหลือ</span>
      </div>

      {pages.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {!showAll && (
            <>
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}
                className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">‹</button>
              <span className="text-sm text-slate-700">หน้า <b>{Math.min(page, pages.length - 1) + 1}</b> / {pages.length}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))} disabled={page >= pages.length - 1}
                className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">›</button>
              <label className="text-[11px] text-slate-500 flex items-center gap-1">ไปหน้า
                <input type="number" min={1} max={pages.length} value={Math.min(page, pages.length - 1) + 1}
                  onChange={(e) => setPage(Math.min(pages.length - 1, Math.max(0, (Number(e.target.value) || 1) - 1)))}
                  className="w-14 h-7 px-1 text-sm text-center border border-slate-200 rounded" />
              </label>
              <span className="text-[11px] text-slate-400">· หน้าละ ~{segCm} ซม.</span>
            </>
          )}
          <button type="button" onClick={() => setShowAll((v) => !v)}
            className={`ml-auto h-8 px-3 text-[12px] rounded-lg border ${showAll ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {showAll ? "◧ ดูทีละหน้า" : "▤ เรียงทุกหน้าต่อกัน"}
          </button>
        </div>
      )}

      {showAll
        ? <div className="flex gap-3 overflow-x-auto pb-2">{pages.map((pg, i) => renderPage(pg, i))}</div>
        : <div className="flex justify-center">{cur && renderPage(cur, page)}</div>}

      {pages.length > 1 && !showAll && (
        <p className="text-[11px] text-slate-400">* ชิ้นที่คร่อมขอบล่างของหน้า จะวาดต่อที่ขอบบนของหน้าถัดไป</p>
      )}
      {result.sampledFrom && (
        <p className="text-[11px] text-amber-600">* ล็อตใหญ่: จำลองวาง {result.sampledFrom.simulated.toLocaleString()} จาก {result.sampledFrom.total.toLocaleString()} ชิ้น แล้วขยายสัดส่วน — ผังที่เห็นคือช่วงต้นของผ้า ยอดที่ต้องสั่งคิดครบแล้ว</p>
      )}
      {totalSheets > shownSheets && (
        <p className="text-[11px] text-amber-600">* แสดง {shownSheets} จาก {totalSheets} ผืน (ผืนที่เหลือวางแบบเดียวกัน) — ยอดที่ต้องสั่งด้านบนคิดครบทุกผืนแล้ว</p>
      )}
    </div>
  );
}
