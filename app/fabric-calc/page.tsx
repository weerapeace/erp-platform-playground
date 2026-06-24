"use client";

/**
 * /fabric-calc — เครื่องคิดเลขผ้า 🧮 (App "งานอื่นๆ")
 *
 * คำนวณเร็วแบบ ad-hoc โดยใช้กฎเดียวกับ BOM (lib/bom-calc.ts):
 * เลือกกลุ่มวัตถุดิบ (เติมวิธีคิด/ตัวหาร/เผื่อเสีย) + พิมพ์/เลือกบล็อก กว้าง/ยาว/ชิ้น + หน้ากว้างผ้า
 * → ผ้าต่อ 1 ตัว × จำนวนผลิต = ผ้ารวม (ไม่บันทึก)
 */

import { useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { fabricQty, type FabricCalcMethod } from "@/lib/bom-calc";

type Group = { id: string; code: string; name: string; calc_method: string; loss_percent: number; divisor: number | null; uom_default: string | null };
type Row = {
  key: string;
  group_id: string; group_name: string;
  calc_method: string; divisor: number; uom: string;
  pieces: number; cut_width: number; cut_length: number; face_width_cm: number; waste_percent: number;
  sheet_width: number; sheet_length: number;   // ขนาดผืนเต็ม (area_sheet)
};

// กลุ่มที่คิดแบบ "พื้นที่ตัด ÷ พื้นที่ผืนเต็ม = กี่ผืน" (ผ้าชิ้น/ตัวเสริม/ลายพิมพ์)
const SHEET_CODES = new Set(["fabric_piece", "print", "reinforce"]);

const METHOD_LABEL: Record<string, string> = {
  area_face: "ผ้าม้วน (พื้นที่ ÷ หน้ากว้าง)", area_sheet: "ผ้าชิ้น (พื้นที่ ÷ ผืนเต็ม)", area_100: "พื้นที่", length: "ความยาว", count: "นับชิ้น", manual: "พิมพ์เอง",
};
// อธิบายวิธีคิดของแต่ละชนิด — โชว์ให้ผู้ใช้เข้าใจว่าทำไมต้องกรอกช่องไหน
const METHOD_HELP: Record<string, string> = {
  area_face:  "ผ้าม้วน: (กว้าง×ยาว×ชิ้น) ÷ หน้ากว้างผ้า ÷ ตัวหาร แล้วบวกเผื่อเสีย",
  area_sheet: "ผ้าชิ้น/แผ่น: พื้นที่ที่ตัด ÷ พื้นที่ผืนเต็ม = ใช้กี่ผืน (บวกเผื่อเสีย)",
  area_100:   "คิดตามพื้นที่: (กว้าง×ยาว×ชิ้น) ÷ ตัวหาร แล้วบวกเผื่อเสีย",
  length:     "คิดตามความยาว: ยาว ÷ ตัวหาร แล้วบวกเผื่อเสีย",
  count:      "นับเป็นชิ้น: ใช้ตามจำนวนชิ้น",
  manual:     "กรอกปริมาณเอง",
};
const usesWidth = (m: string) => m === "area_100" || m === "area_face" || m === "area_sheet";
const usesLength = (m: string) => m === "length" || m === "area_100" || m === "area_face" || m === "area_sheet";
const usesFace = (m: string) => m === "area_face";
const usesSheet = (m: string) => m === "area_sheet";
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const toMeter = (yard: number) => r2(yard * 0.9144);

// อธิบายการคำนวณพร้อมตัวเลขจริง (ว่าคำนวณจากอะไร)
function explainCalc(r: Row, pu: number | null): string {
  if (pu == null) return "กรอกข้อมูลให้ครบก่อน";
  const k = `(1+${r.waste_percent || 0}%)`;
  const res = `= ${r4(pu)} ${r.uom}`;
  switch (r.calc_method) {
    case "count":      return `จำนวนชิ้น ${r.pieces} ${res}`;
    case "length":     return `ยาว ${r.cut_length} × ${k} ÷ ${r.divisor} ${res}`;
    case "area_100":   return `(กว้าง ${r.cut_width} × ยาว ${r.cut_length} × ชิ้น ${r.pieces}) × ${k} ÷ ${r.divisor} ${res}`;
    case "area_face":  return `(กว้าง ${r.cut_width} × ยาว ${r.cut_length} × ชิ้น ${r.pieces}) × ${k} ÷ หน้ากว้าง ${r.face_width_cm} ÷ ${r.divisor} ${res}`;
    case "area_sheet": return `(ตัด ${r.cut_width}×${r.cut_length}×${r.pieces}) × ${k} ÷ ผืนเต็ม (${r.sheet_width}×${r.sheet_length}=${r.sheet_width * r.sheet_length}) ${res}`;
    default:           return "กรอกปริมาณเอง";
  }
}

let _k = 0;
const newRow = (): Row => ({
  key: `r${_k++}`, group_id: "", group_name: "", calc_method: "area_face", divisor: 90, uom: "หลา",
  pieces: 1, cut_width: 0, cut_length: 0, face_width_cm: 0, waste_percent: 0, sheet_width: 0, sheet_length: 0,
});

export default function FabricCalcPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [qtyProduce, setQtyProduce] = useState(1);

  useEffect(() => {
    apiFetch("/api/bom/material-groups").then((r) => r.json()).then((j) => setGroups(j.data ?? [])).catch(() => {});
  }, []);

  const patch = (key: string, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  const duplicateRow = (key: string) => setRows((prev) => {
    const i = prev.findIndex((r) => r.key === key);
    if (i < 0) return prev;
    const next = [...prev];
    next.splice(i + 1, 0, { ...prev[i], key: `r${_k++}` });
    return next;
  });

  const pickGroup = (key: string, gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) { patch(key, { group_id: "", group_name: "" }); return; }
    // ผ้าชิ้น/ตัวเสริม/ลายพิมพ์ → คิดแบบ พื้นที่ตัด ÷ พื้นที่ผืนเต็ม (หน่วยเป็น "ผืน")
    const isSheet = SHEET_CODES.has(g.code);
    patch(key, {
      group_id: g.id, group_name: g.name,
      calc_method: isSheet ? "area_sheet" : g.calc_method,
      divisor: g.divisor ?? 90, waste_percent: g.loss_percent ?? 0,
      uom: isSheet ? "ผืน" : (g.uom_default ?? "หลา"),
    });
  };

  // ผ้าต่อ 1 ตัว ของแต่ละแถว
  const perUnit = (r: Row): number | null => fabricQty({
    calc_method: r.calc_method as FabricCalcMethod, divisor: r.divisor, waste_percent: r.waste_percent,
    pieces: r.pieces, cut_width: r.cut_width, cut_length: r.cut_length, face_width_cm: r.face_width_cm,
    sheet_width: r.sheet_width, sheet_length: r.sheet_length,
  });

  // รวมตามหน่วย+ชนิด
  const totals = useMemo(() => {
    const m = new Map<string, { uom: string; perUnit: number; total: number }>();
    for (const r of rows) {
      const pu = perUnit(r); if (pu == null) continue;
      const label = r.group_name || "ไม่ระบุชนิด";
      const cur = m.get(label) ?? { uom: r.uom, perUnit: 0, total: 0 };
      cur.perUnit += pu; cur.total += pu * (qtyProduce || 0);
      m.set(label, cur);
    }
    return Array.from(m.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, qtyProduce]);

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-indigo-50 to-slate-50">
        <div className="max-w-5xl mx-auto p-5 sm:p-8">
          <h1 className="text-2xl font-bold text-indigo-700 flex items-center gap-2 mb-1">🧮 คำนวณผ้า</h1>
          <p className="text-sm text-indigo-400 mb-5">คิดเร็วๆ ว่าต้องใช้ผ้าเท่าไหร่ — ใช้สูตรเดียวกับ BOM (ไม่บันทึก)</p>

          {/* จำนวนผลิต */}
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 mb-4 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">จำนวนที่จะผลิต</span>
            <input type="number" min={0} value={qtyProduce} onChange={(e) => setQtyProduce(Number(e.target.value))}
              className="w-32 h-10 px-3 rounded-lg border border-indigo-200 text-right outline-none focus:border-indigo-400 text-lg font-semibold" />
            <span className="text-sm text-slate-400">ตัว</span>
          </div>

          {/* แถวคำนวณ */}
          <div className="space-y-3">
            {rows.map((r) => {
              const pu = perUnit(r);
              return (
                <div key={r.key} className="bg-white rounded-xl border border-indigo-100 shadow-sm p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <select value={r.group_id} onChange={(e) => pickGroup(r.key, e.target.value)}
                      className="flex-1 h-9 px-2 rounded-lg border border-indigo-200 bg-white text-sm outline-none focus:border-indigo-400">
                      <option value="">— เลือกชนิดวัตถุดิบ —</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <span className="text-[11px] text-indigo-400 whitespace-nowrap cursor-help" title={METHOD_HELP[r.calc_method] ?? ""}>{METHOD_LABEL[r.calc_method] ?? r.calc_method} ⓘ</span>
                    <button onClick={() => duplicateRow(r.key)} className="text-slate-300 hover:text-indigo-500 text-base px-0.5" title="ก๊อปแถวนี้">⧉</button>
                    <button onClick={() => removeRow(r.key)} className="text-slate-300 hover:text-red-500 text-lg px-0.5" title="ลบแถว">✕</button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <Num label="ชิ้น" value={r.pieces} onChange={(v) => patch(r.key, { pieces: v })} />
                    {usesWidth(r.calc_method) && <Num tone={usesSheet(r.calc_method) ? "cut" : "default"} label={usesSheet(r.calc_method) ? "ตัดกว้าง(ซม.)" : "กว้าง(ซม.)"} value={r.cut_width} onChange={(v) => patch(r.key, { cut_width: v })} />}
                    {usesLength(r.calc_method) && <Num tone={usesSheet(r.calc_method) ? "cut" : "default"} label={usesSheet(r.calc_method) ? "ตัดยาว(ซม.)" : "ยาว(ซม.)"} value={r.cut_length} onChange={(v) => patch(r.key, { cut_length: v })} />}
                    {usesFace(r.calc_method) && <Num label="หน้ากว้าง(ซม.)" value={r.face_width_cm} onChange={(v) => patch(r.key, { face_width_cm: v })} />}
                    {usesSheet(r.calc_method) && <Num tone="sheet" label="ผืนกว้าง(ซม.)" value={r.sheet_width} onChange={(v) => patch(r.key, { sheet_width: v })} />}
                    {usesSheet(r.calc_method) && <Num tone="sheet" label="ผืนยาว(ซม.)" value={r.sheet_length} onChange={(v) => patch(r.key, { sheet_length: v })} />}
                    {r.calc_method !== "count" && <Num label="เผื่อเสีย%" value={r.waste_percent} onChange={(v) => patch(r.key, { waste_percent: v })} />}
                  </div>

                  {/* สูตร + ผล (บรรทัดเดียว compact) */}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-indigo-600/70 break-all flex-1 min-w-0">🧮 {explainCalc(r, pu)}</span>
                    <span className="whitespace-nowrap text-slate-400">×{qtyProduce || 0} = <span className="font-bold text-indigo-700 text-sm">{pu == null ? "—" : `${r2(pu * (qtyProduce || 0))} ${r.uom}`}</span></span>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={() => setRows((prev) => [...prev, newRow()])}
            className="mt-3 h-10 px-4 rounded-full border-2 border-dashed border-indigo-200 text-indigo-500 text-sm font-medium hover:bg-indigo-50">
            + เพิ่มผ้า/วัตถุดิบ
          </button>

          {/* สรุปรวม */}
          {totals.length > 0 && (
            <div className="mt-6 bg-indigo-600 text-white rounded-2xl shadow-lg p-5">
              <h2 className="font-bold mb-3 flex items-center gap-2">📦 ผ้าที่ต้องใช้ทั้งหมด ({qtyProduce || 0} ตัว)</h2>
              <div className="space-y-1.5">
                {totals.map(([label, t]) => {
                  const yieldPer = t.perUnit > 0 ? Math.floor(1 / t.perUnit) : 0;
                  return (
                    <div key={label} className="border-b border-white/15 pb-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        <span className="font-bold text-lg">{r2(t.total)} {t.uom}{t.uom === "หลา" && <span className="text-indigo-200 text-xs font-normal"> (≈ {toMeter(t.total)} ม.)</span>}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-indigo-200 mt-0.5">
                        <span>ใช้ {r4(t.perUnit)} {t.uom}/ตัว</span>
                        <span>📐 1 {t.uom} ทำได้ ~{yieldPer.toLocaleString()} ตัว</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}

const NUM_TONES: Record<string, { label: string; input: string }> = {
  default: { label: "text-slate-400",   input: "border-indigo-200 focus:border-indigo-400" },
  cut:     { label: "text-amber-600",   input: "border-amber-300 bg-amber-50/50 focus:border-amber-500" },     // ชิ้นที่ตัด
  sheet:   { label: "text-emerald-600", input: "border-emerald-300 bg-emerald-50/50 focus:border-emerald-500" }, // ผืนเต็ม
};
function Num({ label, value, onChange, tone = "default" }: { label: string; value: number; onChange: (v: number) => void; tone?: "default" | "cut" | "sheet" }) {
  const t = NUM_TONES[tone];
  return (
    <label className="block">
      <span className={`block text-[10px] font-medium mb-0.5 truncate ${t.label}`}>{label}</span>
      <input type="number" min={0} step="any" value={value === 0 ? "" : value} placeholder="0"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={`w-full h-8 px-2 rounded-lg border text-right outline-none text-sm ${t.input}`} />
    </label>
  );
}
