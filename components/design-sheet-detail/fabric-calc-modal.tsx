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
import { useT } from "@/components/i18n";

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
  const t = useT();
  // วัสดุที่เลือกได้ = บรรทัดที่มีกว้าง×ยาว (ตัดได้จริง) จัดกลุ่มตามชื่อวัสดุ
  const materials = useMemo(() => {
    const m = new Map<string, { name: string; lines: CalcLine[] }>();
    for (const l of lines) {
      if (n(l.width_cm) <= 0 || n(l.length_cm) <= 0) continue;
      const key = (l.item_name ?? "").trim() || t("(ไม่ระบุวัสดุ)", "(No material)");
      if (!m.has(key)) m.set(key, { name: key, lines: [] });
      m.get(key)!.lines.push(l);
    }
    return [...m.values()].sort((a, b) => b.lines.length - a.lines.length);
  }, [lines, t]);

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
    label: t(`${n(l.width_cm)}×${n(l.length_cm)} ซม.`, `${n(l.width_cm)}×${n(l.length_cm)} cm`),
    width_cm: n(l.width_cm),
    length_cm: n(l.length_cm),
    qty: Math.max(0, n(l.pieces) || 0) * Math.max(1, orderQty),
  })), [cur, orderQty, t]);

  const result = useMemo(() => packFabric({
    pieces, faceWidthCm: faceWidth, allowRotate: rotate, wastePercent: waste, gapCm: gap,
    sheetLengthCm: mode === "sheet" ? sheetLength : null,
  }), [pieces, faceWidth, rotate, waste, gap, mode, sheetLength]);

  const piecePerUnit = (cur?.lines ?? []).reduce((s, l) => s + Math.max(0, n(l.pieces)), 0);
  const inCls = "h-9 w-full px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <ERPModal open onClose={onClose} title={t("🧮 คำนวณจำนวนผ้า", "🧮 Fabric calculator")} size="lg"
      description={t("จำลองการวางชิ้นจริงบนหน้าผ้า แล้วบอกว่าต้องใช้ผ้าเท่าไหร่ (แม่นกว่าเอาพื้นที่มาหาร)", "Simulates laying the real pieces on the fabric width, then tells you how much fabric you need (more accurate than dividing by area)")}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">{t("ปิด", "Close")}</button>}>
      {materials.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{t("ยังไม่มีบรรทัดที่กรอก กว้าง×ยาว — กรอกขนาดชิ้นในตารางตีราคาก่อน", "No lines with width×length yet — enter piece sizes in the costing table first")}</p>
      ) : (
        <div className="space-y-4">
          {/* เลือกวัสดุ + จำนวนผลิต */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-[12px] text-slate-500 sm:col-span-2">{t("วัสดุที่จะคำนวณ", "Material to calculate")}
              <select value={matName} onChange={(e) => setMatName(e.target.value)} className={`${inCls} mt-1`}>
                {materials.map((m) => <option key={m.name} value={m.name}>{m.name} ({t(`${m.lines.length} บรรทัด`, `${m.lines.length} lines`)})</option>)}
              </select>
            </label>
            <label className="text-[12px] text-slate-500">{t("ผลิตกี่ใบ", "Units to produce")}
              <input type="number" min={1} value={orderQty} onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value) || 1))} className={`${inCls} mt-1 text-right`} />
            </label>
          </div>

          <p className="text-[12px] text-slate-500 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
            {t("สูตรนี้ใช้", "This recipe uses")} <b className="text-slate-700">{t(`${piecePerUnit} ชิ้น`, `${piecePerUnit} pcs`)}</b>{t("/ใบ · ผลิต", "/unit · producing")} {orderQty} {t("ใบ = ต้องตัดทั้งหมด", "units = cut a total of")} <b className="text-slate-700">{t(`${result.totalPieces} ชิ้น`, `${result.totalPieces} pcs`)}</b>
          </p>

          {/* แบบผ้า */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMode("roll")} className={`h-9 px-3.5 text-[13px] font-medium rounded-lg border ${mode === "roll" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>{t("🧵 ผ้าเมตร/หลา (ต่อเนื่อง)", "🧵 Roll fabric by m/yd (continuous)")}</button>
            <button onClick={() => setMode("sheet")} className={`h-9 px-3.5 text-[13px] font-medium rounded-lg border ${mode === "sheet" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>{t("🟦 ผ้าผืน (ขนาดตายตัว)", "🟦 Fabric sheet (fixed size)")}</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-[12px] text-slate-500">{t("หน้ากว้างผ้า (ซม.)", "Fabric width (cm)")}
              <input type="number" min={1} step="any" value={faceWidth} onChange={(e) => setFaceWidth(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
            {mode === "sheet" && (
              <label className="text-[12px] text-slate-500">{t("ยาวต่อผืน (ซม.)", "Length per sheet (cm)")}
                <input type="number" min={1} step="any" value={sheetLength} onChange={(e) => setSheetLength(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
              </label>
            )}
            <label className="text-[12px] text-slate-500">{t("เผื่อเสีย %", "Waste allowance %")}
              <input type="number" min={0} step="any" value={waste} onChange={(e) => setWaste(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
            <label className="text-[12px] text-slate-500">{t("เว้นรอยตัด (ซม.)", "Cutting gap (cm)")}
              <input type="number" min={0} step="any" value={gap} onChange={(e) => setGap(Number(e.target.value) || 0)} className={`${inCls} mt-1 text-right`} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            {t("หมุนชิ้นได้ 90° (ผ้าไม่มีลายทิศทาง — ถ้าผ้ามีลายต้องวางตามลาย ให้เอาติ๊กออก)", "Pieces can rotate 90° (non-directional fabric — untick if the fabric has a pattern that must follow its direction)")}
          </label>

          {/* ผลลัพธ์ */}
          {!result.ok ? (
            <div className="px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-800">⚠️ {result.error}</div>
          ) : (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {mode === "roll" ? (
                  <>
                    <Stat label={t("ต้องใช้ผ้า", "Fabric needed")} value={t(`${fmt(result.yards)} หลา`, `${fmt(result.yards)} yd`)} big />
                    <Stat label={t("เท่ากับ", "Equals")} value={t(`${fmt(result.meters)} เมตร`, `${fmt(result.meters)} m`)} />
                  </>
                ) : (
                  <>
                    <Stat label={t("ต้องใช้", "Needed")} value={t(`${result.sheets ?? 0} ผืน`, `${result.sheets ?? 0} sheets`)} big />
                    <Stat label={t("ผืนละ", "Per sheet")} value={t(`${fmt(faceWidth, 0)}×${fmt(sheetLength, 0)} ซม.`, `${fmt(faceWidth, 0)}×${fmt(sheetLength, 0)} cm`)} />
                  </>
                )}
                <Stat label={t("ความยาวที่วางจริง", "Actual laid length")} value={t(`${fmt(result.usedLengthCm, 1)} ซม.`, `${fmt(result.usedLengthCm, 1)} cm`)} hint={t(`${result.rows.length} แถว`, `${result.rows.length} rows`)} />
                {/* วัดคุณภาพการวางล้วน ๆ (ยังไม่รวมเผื่อเสีย) — เลขเดิมรวมเผื่อเสียเลยดูแย่กว่าความจริง */}
                <Stat label={t("วางได้คุ้ม (ไม่รวมเผื่อเสีย)", "Layout efficiency (excl. waste allowance)")} value={`${fmt(result.packEfficiencyPercent, 1)}%`}
                  hint={result.packEfficiencyPercent >= 85 ? t("ดีมาก", "Very good") : result.packEfficiencyPercent >= 75 ? t("ดี", "Good") : result.packEfficiencyPercent >= 60 ? t("พอใช้", "Fair") : t("เศษเยอะ", "High waste")} />
              </div>
              {result.sampledFrom && (
                <p className="mt-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {t(`ℹ️ งานล็อตใหญ่ (${result.sampledFrom.total.toLocaleString("th-TH")} ชิ้น) — ระบบจำลองการวางจาก ${result.sampledFrom.simulated.toLocaleString("th-TH")} ชิ้นแล้วขยายผลตามสัดส่วน (การวางซ้ำรูปแบบเดิม ตัวเลขจึงใกล้เคียงของจริง)`, `ℹ️ Large lot (${result.sampledFrom.total.toLocaleString("th-TH")} pcs) — the system simulated ${result.sampledFrom.simulated.toLocaleString("th-TH")} pcs and scaled up proportionally (the layout repeats, so the numbers are close to reality)`)}
                </p>
              )}
              {/* ผ้าที่ต้องซื้อหายไปไหนบ้าง — แยก "เศษจากการวาง" ออกจาก "เผื่อเสียที่เราตั้งเอง" */}
              <div className="mt-3 pt-3 border-t border-emerald-200/70 space-y-1 text-[11.5px] text-slate-600">
                <div className="font-medium text-slate-700">{t("ผ้าที่ต้องซื้อ 100% แบ่งเป็น", "Fabric to buy (100%) breaks down into")}</div>
                <WasteBar
                  piece={result.pieceAreaCm2 / Math.max(1, result.fabricAreaCm2) * 100}
                  packWaste={Math.max(0, (result.usedLengthCm * faceWidth - result.pieceAreaCm2)) / Math.max(1, result.fabricAreaCm2) * 100}
                  allowance={Math.max(0, result.lengthWithWasteCm - result.usedLengthCm) * faceWidth / Math.max(1, result.fabricAreaCm2) * 100}
                />
                <p className="text-slate-400">
                  {t(`* “เศษจากการวาง” คือช่องว่างที่ตัดชิ้นอื่นไม่ได้ · “เผื่อเสีย ${fmt(waste, 0)}%” คือส่วนที่เราตั้งเผื่อไว้เอง (ลดได้ที่ช่องเผื่อเสีย)`, `* “Layout scrap” is gaps where no other piece fits · “Waste allowance ${fmt(waste, 0)}%” is the buffer you set yourself (lower it in the waste allowance box)`)}
                </p>
              </div>

              {/* ทำไมเหลือเศษ — ขนาดชิ้นกับหน้ากว้างผ้าไม่ลงตัว (บอกให้รู้ว่าแก้ที่ไหนได้) */}
              {(result.fitHints?.length ?? 0) > 0 && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11.5px] text-amber-800 space-y-0.5">
                  <div className="font-medium">{t(`ทำไมยังเหลือเศษ — ขนาดชิ้นกับหน้าผ้า ${fmt(faceWidth, 0)} ซม. ไม่ลงตัว`, `Why there is scrap — piece sizes don't fit evenly into the ${fmt(faceWidth, 0)} cm fabric width`)}</div>
                  {result.fitHints!.map((h, i) => (
                    <div key={i}>
                      • {t("ชิ้น", "Piece")} <b>{h.label}</b> {t(`วางได้ ${h.perRow} ชิ้น/แถว → เหลือแถบว่างกว้าง`, `fits ${h.perRow} pcs/row → leaves an empty strip of`)} <b>{t(`${fmt(h.leftoverCm, 1)} ซม.`, `${fmt(h.leftoverCm, 1)} cm`)}</b>
                      {h.suggestFaceCm ? <> · {t("ถ้าใช้ผ้าหน้ากว้าง", "with a fabric width of")} <b>{t(`${h.suggestFaceCm} ซม.`, `${h.suggestFaceCm} cm`)}</b> {t(`จะวางได้ ${h.perRow + 1} ชิ้น/แถว`, `you could fit ${h.perRow + 1} pcs/row`)}</> : null}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-[11.5px] text-slate-500">
                {t(`เทียบวิธีเดิม (เอาพื้นที่ ÷ หน้ากว้าง) = ${fmt(result.naiveYards)} หลา ·`, `Old method (area ÷ width) = ${fmt(result.naiveYards)} yd ·`)}
                {t("วิธีนี้คิดเศษที่ตัดไม่ได้ด้วย จึงมักมากกว่า", "this method also counts unusable scrap, so it is usually higher by")} {result.naiveYards > 0 ? `${fmt((result.yards / result.naiveYards - 1) * 100, 0)}%` : "—"}
                {mode === "roll" && <> · {t(`1 หลา = ${YARD_CM} ซม.`, `1 yd = ${YARD_CM} cm`)}</>}
                {result.strategiesTried ? <> · {t(`ระบบลองวาง ${result.strategiesTried} แบบแล้วเลือกแบบที่ประหยัดผ้าที่สุด`, `tried ${result.strategiesTried} layouts and picked the one that uses the least fabric`)}</> : null}
              </p>
            </div>
          )}

          {/* ภาพผังการวาง (เฟส 2) */}
          {result.ok && (
            <div className="rounded-xl border border-slate-200 p-3">
              <button onClick={() => setShowLayout((v) => !v)}
                className="w-full flex items-center justify-between text-[13px] font-medium text-slate-700">
                <span>{t("🖼️ ดูผังการวางบนหน้าผ้า", "🖼️ View layout on fabric")}</span>
                <span className="text-[11px] text-slate-400">{showLayout ? t("▲ ซ่อน", "▲ Hide") : t("▼ แสดง", "▼ Show")}</span>
              </button>
              {showLayout && <div className="mt-3"><FabricLayoutPreview result={result} faceWidthCm={faceWidth} sheetLengthCm={mode === "sheet" ? sheetLength : null} mode={mode} /></div>}
            </div>
          )}

          {/* รายการชิ้น */}
          {cur && (
            <details className="rounded-lg border border-slate-200">
              <summary className="px-3 py-2 text-[12.5px] text-slate-600 cursor-pointer">{t(`ชิ้นที่ต้องตัด (${cur.lines.length} แบบ)`, `Pieces to cut (${cur.lines.length} types)`)}</summary>
              <div className="px-3 pb-2 max-h-[30vh] overflow-y-auto">
                {cur.lines.map((l, i) => (
                  <div key={l.key || i} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0 text-[12.5px]">
                    <span className="text-slate-700 tabular-nums">{n(l.width_cm)} × {n(l.length_cm)} {t("ซม.", "cm")}</span>
                    <span className="text-slate-400">× {n(l.pieces) || 0} {t("ชิ้น/ใบ", "pcs/unit")}</span>
                    <span className="ml-auto font-medium text-slate-600 tabular-nums">= {(n(l.pieces) || 0) * orderQty} {t("ชิ้น", "pcs")}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="text-[11px] text-slate-400">{t("* เป็นการประมาณเพื่อตีราคา (วางแนวตรงเป็นแถว) — ช่างตัดจริงวางสลับฟันปลาอาจประหยัดกว่านี้เล็กน้อย", "* An estimate for costing (pieces laid straight in rows) — a real cutter staggering pieces may save a little more")}</p>
        </div>
      )}
    </ERPModal>
  );
}

/** แถบสัดส่วน: ชิ้นจริง / เศษจากการวาง / เผื่อเสีย (รวม = ผ้าที่ต้องซื้อ) */
function WasteBar({ piece, packWaste, allowance }: { piece: number; packWaste: number; allowance: number }) {
  const t = useT();
  const p = Math.max(0, piece), w = Math.max(0, packWaste), a = Math.max(0, allowance);
  const sum = p + w + a || 1;
  const pct = (v: number) => `${(v / sum) * 100}%`;
  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-200">
        <div style={{ width: pct(p) }} className="bg-emerald-500" title={t("ชิ้นงานจริง", "Actual pieces")} />
        <div style={{ width: pct(w) }} className="bg-rose-300" title={t("เศษจากการวาง", "Layout scrap")} />
        <div style={{ width: pct(a) }} className="bg-amber-300" title={t("เผื่อเสีย", "Waste allowance")} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 mr-1" />{t("ชิ้นงานจริง", "Actual pieces")} {(p / sum * 100).toFixed(1)}%</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-rose-300 mr-1" />{t("เศษจากการวาง", "Layout scrap")} {(w / sum * 100).toFixed(1)}%</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-300 mr-1" />{t("เผื่อเสีย", "Waste allowance")} {(a / sum * 100).toFixed(1)}%</span>
      </div>
    </>
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
