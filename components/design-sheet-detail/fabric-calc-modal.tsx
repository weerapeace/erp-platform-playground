"use client";

// ============================================================
// FabricCalcModal — "คำนวณจำนวนผ้า" จากบรรทัดตีราคา
//   เลือกวัสดุ (ผ้า) → ใส่จำนวนที่จะผลิต → บอกว่าใช้ผ้ากี่หลา / กี่ผืน
//   คิดจากการ "จำลองวางชิ้นบนหน้าผ้า" (lib/fabric-calc) ไม่ใช่เอาพื้นที่มาหารเฉย ๆ
// ============================================================

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { packFabric, YARD_CM, type FabricPiece } from "@/lib/fabric-calc";
import { FabricLayoutPreview } from "./fabric-layout-preview";

export type CalcLine = {
  key: string;
  item_id?: string | null;
  item_name?: string | null;
  width_cm?: number | null;
  length_cm?: number | null;
  pieces?: number | null;
  face_width_cm?: number | null;
  waste_percent?: number | null;
  uom?: string | null;
};

const n = (v: unknown) => Number(v) || 0;
const fmt = (v: number, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("th-TH");

export function FabricCalcModal({ lines, onClose }: { lines: CalcLine[]; onClose: () => void }) {
  // วัสดุที่เลือกได้ = บรรทัดที่มีกว้าง×ยาว (ตัดได้จริง) จัดกลุ่มตามชื่อวัสดุ
  const materials = useMemo(() => {
    const m = new Map<string, { name: string; lines: CalcLine[] }>();
    for (const l of lines) {
      if (n(l.width_cm) <= 0 || n(l.length_cm) <= 0) continue;
      const key = (l.item_name ?? "").trim() || "(ไม่ระบุวัสดุ)";
      if (!m.has(key)) m.set(key, { name: key, lines: [] });
      m.get(key)!.lines.push(l);
    }
    return [...m.values()].sort((a, b) => b.lines.length - a.lines.length);
  }, [lines]);

  const [matName, setMatName] = useState(materials[0]?.name ?? "");
  const cur = materials.find((x) => x.name === matName) ?? materials[0];

  const [orderQty, setOrderQty] = useState(1);            // ผลิตกี่ใบ
  const [mode, setMode] = useState<"roll" | "sheet">("roll");
  const [faceWidth, setFaceWidth] = useState<number>(() => n(materials[0]?.lines.find((l) => n(l.face_width_cm) > 0)?.face_width_cm) || 100);
  const [sheetLength, setSheetLength] = useState(180);     // ผ้าผืน: ยาวต่อผืน
  const [rotate, setRotate] = useState(true);             // ผ้าไม่มีลายทิศทาง → หมุนชิ้นได้
  const [waste, setWaste] = useState<number>(() => n(materials[0]?.lines[0]?.waste_percent) || 10);
  const [gap, setGap] = useState(0.5);                    // เว้นรอยตัด
  const [showLayout, setShowLayout] = useState(true);     // โชว์ภาพผังการวาง

  // ชิ้นที่ต้องตัด = แต่ละบรรทัด × จำนวนที่ผลิต
  const pieces: FabricPiece[] = useMemo(() => (cur?.lines ?? []).map((l, i) => ({
    key: l.key || `p${i}`,
    label: `${n(l.width_cm)}×${n(l.length_cm)} ซม.`,
    width_cm: n(l.width_cm),
    length_cm: n(l.length_cm),
    qty: Math.max(0, n(l.pieces) || 0) * Math.max(1, orderQty),
  })), [cur, orderQty]);

  const result = useMemo(() => packFabric({
    pieces, faceWidthCm: faceWidth, allowRotate: rotate, wastePercent: waste, gapCm: gap,
    sheetLengthCm: mode === "sheet" ? sheetLength : null,
  }), [pieces, faceWidth, rotate, waste, gap, mode, sheetLength]);

  const piecePerUnit = (cur?.lines ?? []).reduce((s, l) => s + Math.max(0, n(l.pieces)), 0);
  const inCls = "h-9 w-full px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <ERPModal open onClose={onClose} title="🧮 คำนวณจำนวนผ้า" size="lg"
      description="จำลองการวางชิ้นจริงบนหน้าผ้า แล้วบอกว่าต้องใช้ผ้าเท่าไหร่ (แม่นกว่าเอาพื้นที่มาหาร)"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">ปิด</button>}>
      {materials.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีบรรทัดที่กรอก กว้าง×ยาว — กรอกขนาดชิ้นในตารางตีราคาก่อน</p>
      ) : (
        <div className="space-y-4">
          {/* เลือกวัสดุ + จำนวนผลิต */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-[12px] text-slate-500 sm:col-span-2">วัสดุที่จะคำนวณ
              <select value={matName} onChange={(e) => setMatName(e.target.value)} className={`${inCls} mt-1`}>
                {materials.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.lines.length} บรรทัด)</option>)}
              </select>
            </label>
            <label className="text-[12px] text-slate-500">ผลิตกี่ใบ
              <input type="number" min={1} value={orderQty} onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value) || 1))} className={`${inCls} mt-1 text-right`} />
            </label>
          </div>

          <p className="text-[12px] text-slate-500 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
            สูตรนี้ใช้ <b className="text-slate-700">{piecePerUnit} ชิ้น</b>/ใบ · ผลิต {orderQty} ใบ = ต้องตัดทั้งหมด <b className="text-slate-700">{result.totalPieces} ชิ้น</b>
          </p>

          {/* แบบผ้า */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMode("roll")} className={`h-9 px-3.5 text-[13px] font-medium rounded-lg border ${mode === "roll" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>🧵 ผ้าเมตร/หลา (ต่อเนื่อง)</button>
            <button onClick={() => setMode("sheet")} className={`h-9 px-3.5 text-[13px] font-medium rounded-lg border ${mode === "sheet" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>🟦 ผ้าผืน (ขนาดตายตัว)</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-[12px] text-slate-500">หน้ากว้างผ้า (ซม.)
              <input type="number" min={1} step="any" value={faceWidth} onChange={(e) => setFaceWidth(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
            {mode === "sheet" && (
              <label className="text-[12px] text-slate-500">ยาวต่อผืน (ซม.)
                <input type="number" min={1} step="any" value={sheetLength} onChange={(e) => setSheetLength(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
              </label>
            )}
            <label className="text-[12px] text-slate-500">เผื่อเสีย %
              <input type="number" min={0} step="any" value={waste} onChange={(e) => setWaste(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
            <label className="text-[12px] text-slate-500">เว้นรอยตัด (ซม.)
              <input type="number" min={0} step="any" value={gap} onChange={(e) => setGap(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            หมุนชิ้นได้ 90° (ผ้าไม่มีลายทิศทาง — ถ้าผ้ามีลายต้องวางตามลาย ให้เอาติ๊กออก)
          </label>

          {/* ผลลัพธ์ */}
          {!result.ok ? (
            <div className="px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-800">⚠️ {result.error}</div>
          ) : (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {mode === "roll" ? (
                  <>
                    <Stat label="ต้องใช้ผ้า" value={`${fmt(result.yards)} หลา`} big />
                    <Stat label="เท่ากับ" value={`${fmt(result.meters)} เมตร`} />
                  </>
                ) : (
                  <>
                    <Stat label="ต้องใช้" value={`${result.sheets ?? 0} ผืน`} big />
                    <Stat label="ผืนละ" value={`${fmt(faceWidth, 0)}×${fmt(sheetLength, 0)} ซม.`} />
                  </>
                )}
                <Stat label="ความยาวที่วางจริง" value={`${fmt(result.usedLengthCm, 1)} ซม.`} hint={`${result.rows.length} แถว`} />
                <Stat label="ใช้ผ้าคุ้ม" value={`${fmt(result.utilizationPercent, 1)}%`} hint={result.utilizationPercent >= 75 ? "ดี" : result.utilizationPercent >= 55 ? "พอใช้" : "เศษเยอะ"} />
              </div>
              {result.sampledFrom && (
                <p className="mt-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ℹ️ งานล็อตใหญ่ ({result.sampledFrom.total.toLocaleString("th-TH")} ชิ้น) — ระบบจำลองการวางจาก {result.sampledFrom.simulated.toLocaleString("th-TH")} ชิ้นแล้วขยายผลตามสัดส่วน (การวางซ้ำรูปแบบเดิม ตัวเลขจึงใกล้เคียงของจริง)
                </p>
              )}
              <p className="mt-3 pt-3 border-t border-emerald-200/70 text-[11.5px] text-slate-500">
                เทียบวิธีเดิม (เอาพื้นที่ ÷ หน้ากว้าง) = {fmt(result.naiveYards)} หลา ·
                วิธีนี้คิดเศษที่ตัดไม่ได้ด้วย จึงมักมากกว่า {result.naiveYards > 0 ? `${fmt((result.yards / result.naiveYards - 1) * 100, 0)}%` : "—"}
                {mode === "roll" && <> · 1 หลา = {YARD_CM} ซม.</>}
              </p>
            </div>
          )}

          {/* ภาพผังการวาง (เฟส 2) */}
          {result.ok && (
            <div className="rounded-xl border border-slate-200 p-3">
              <button onClick={() => setShowLayout((v) => !v)}
                className="w-full flex items-center justify-between text-[13px] font-medium text-slate-700">
                <span>🖼️ ดูผังการวางบนหน้าผ้า</span>
                <span className="text-[11px] text-slate-400">{showLayout ? "▲ ซ่อน" : "▼ แสดง"}</span>
              </button>
              {showLayout && <div className="mt-3"><FabricLayoutPreview result={result} faceWidthCm={faceWidth} sheetLengthCm={mode === "sheet" ? sheetLength : null} mode={mode} /></div>}
            </div>
          )}

          {/* รายการชิ้น */}
          {cur && (
            <details className="rounded-lg border border-slate-200">
              <summary className="px-3 py-2 text-[12.5px] text-slate-600 cursor-pointer">ชิ้นที่ต้องตัด ({cur.lines.length} แบบ)</summary>
              <div className="px-3 pb-2 max-h-[30vh] overflow-y-auto">
                {cur.lines.map((l, i) => (
                  <div key={l.key || i} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0 text-[12.5px]">
                    <span className="text-slate-700 tabular-nums">{n(l.width_cm)} × {n(l.length_cm)} ซม.</span>
                    <span className="text-slate-400">× {n(l.pieces) || 0} ชิ้น/ใบ</span>
                    <span className="ml-auto font-medium text-slate-600 tabular-nums">= {(n(l.pieces) || 0) * orderQty} ชิ้น</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="text-[11px] text-slate-400">* เป็นการประมาณเพื่อตีราคา (วางแนวตรงเป็นแถว) — ช่างตัดจริงวางสลับฟันปลาอาจประหยัดกว่านี้เล็กน้อย</p>
        </div>
      )}
    </ERPModal>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`font-bold text-slate-800 mt-0.5 ${big ? "text-[22px] text-emerald-700" : "text-[15px]"}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-slate-400">{hint}</div>}
    </div>
  );
}
