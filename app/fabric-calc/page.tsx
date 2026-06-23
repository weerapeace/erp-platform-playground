"use client";

/**
 * /fabric-calc — เครื่องคิดเลขผ้า 🧮 (App "งานอื่นๆ")
 *
 * คำนวณเร็วแบบ ad-hoc โดยใช้กฎเดียวกับ BOM (lib/bom-calc.ts):
 * เลือกกลุ่มวัตถุดิบ (เติมวิธีคิด/ตัวหาร/เผื่อเสีย) + พิมพ์/เลือกบล็อก กว้าง/ยาว/ชิ้น + หน้ากว้างผ้า
 * → ผ้าต่อ 1 ตัว × จำนวนผลิต = ผ้ารวม (ไม่บันทึก)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { fabricQty, type FabricCalcMethod } from "@/lib/bom-calc";

type Group = { id: string; code: string; name: string; calc_method: string; loss_percent: number; divisor: number | null; uom_default: string | null };
type Block = { id: string; code: string; width: number | null; length: number | null };
type Row = {
  key: string;
  group_id: string; group_name: string;
  calc_method: string; divisor: number; uom: string;
  block_code: string;
  pieces: number; cut_width: number; cut_length: number; face_width_cm: number; waste_percent: number;
};

const METHOD_LABEL: Record<string, string> = {
  area_face: "ผ้า (พื้นที่ ÷ หน้ากว้าง)", area_100: "พื้นที่", length: "ความยาว", count: "นับชิ้น", manual: "พิมพ์เอง",
};
const usesWidth = (m: string) => m === "area_100" || m === "area_face";
const usesLength = (m: string) => m === "length" || m === "area_100" || m === "area_face";
const usesFace = (m: string) => m === "area_face";
const r2 = (n: number) => Math.round(n * 100) / 100;

let _k = 0;
const newRow = (): Row => ({
  key: `r${_k++}`, group_id: "", group_name: "", calc_method: "area_face", divisor: 90, uom: "หลา",
  block_code: "", pieces: 1, cut_width: 0, cut_length: 0, face_width_cm: 0, waste_percent: 0,
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

  const pickGroup = (key: string, gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) { patch(key, { group_id: "", group_name: "" }); return; }
    patch(key, {
      group_id: g.id, group_name: g.name, calc_method: g.calc_method,
      divisor: g.divisor ?? 90, waste_percent: g.loss_percent ?? 0, uom: g.uom_default ?? "หลา",
    });
  };

  // ผ้าต่อ 1 ตัว ของแต่ละแถว
  const perUnit = (r: Row): number | null => fabricQty({
    calc_method: r.calc_method as FabricCalcMethod, divisor: r.divisor, waste_percent: r.waste_percent,
    pieces: r.pieces, cut_width: r.cut_width, cut_length: r.cut_length, face_width_cm: r.face_width_cm,
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
                <div key={r.key} className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <select value={r.group_id} onChange={(e) => pickGroup(r.key, e.target.value)}
                      className="flex-1 h-10 px-3 rounded-lg border border-indigo-200 bg-white text-sm outline-none focus:border-indigo-400">
                      <option value="">— เลือกชนิดวัตถุดิบ —</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <span className="text-xs text-indigo-400 whitespace-nowrap">{METHOD_LABEL[r.calc_method] ?? r.calc_method}</span>
                    <button onClick={() => removeRow(r.key)} className="text-slate-300 hover:text-red-500 text-lg px-1" title="ลบแถว">✕</button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <BlockSearch onPick={(b) => patch(r.key, { block_code: b.code, cut_width: b.width ?? r.cut_width, cut_length: b.length ?? r.cut_length })} current={r.block_code} />
                    <Num label="จำนวนชิ้น" value={r.pieces} onChange={(v) => patch(r.key, { pieces: v })} />
                    {usesWidth(r.calc_method) && <Num label="กว้าง (ซม.)" value={r.cut_width} onChange={(v) => patch(r.key, { cut_width: v })} />}
                    {usesLength(r.calc_method) && <Num label="ยาว (ซม.)" value={r.cut_length} onChange={(v) => patch(r.key, { cut_length: v })} />}
                    {usesFace(r.calc_method) && <Num label="หน้ากว้างผ้า (ซม.)" value={r.face_width_cm} onChange={(v) => patch(r.key, { face_width_cm: v })} />}
                    <Num label="เผื่อเสีย %" value={r.waste_percent} onChange={(v) => patch(r.key, { waste_percent: v })} />
                  </div>

                  <div className="mt-3 pt-3 border-t border-indigo-50 flex items-center justify-between text-sm">
                    <span className="text-slate-400">
                      ต่อ 1 ตัว: <span className="font-semibold text-indigo-600">{pu == null ? "— (กรอกไม่ครบ)" : `${r2(pu)} ${r.uom}`}</span>
                    </span>
                    <span className="text-slate-500">
                      × {qtyProduce || 0} = <span className="font-bold text-indigo-700">{pu == null ? "—" : `${r2(pu * (qtyProduce || 0))} ${r.uom}`}</span>
                    </span>
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
                {totals.map(([label, t]) => (
                  <div key={label} className="flex items-center justify-between text-sm border-b border-white/15 pb-1.5">
                    <span>{label} <span className="text-indigo-200 text-xs">({r2(t.perUnit)} {t.uom}/ตัว)</span></span>
                    <span className="font-bold text-lg">{r2(t.total)} {t.uom}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-400 mb-0.5">{label}</span>
      <input type="number" min={0} step="any" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-9 px-2 rounded-lg border border-indigo-200 text-right outline-none focus:border-indigo-400 text-sm" />
    </label>
  );
}

// ค้นบล็อกตัด (เลือกแล้วเติม กว้าง/ยาว) — ของกลาง /api/bom/cutting-blocks
function BlockSearch({ current, onPick }: { current: string; onPick: (b: Block) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Block[]>([]);
  const load = useCallback(async (s: string) => {
    const j = await apiFetch(`/api/bom/cutting-blocks?search=${encodeURIComponent(s)}`).then((r) => r.json());
    setRes((j.data ?? []) as Block[]);
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [open, q, load]);

  return (
    <label className="block relative">
      <span className="block text-[11px] font-medium text-slate-400 mb-0.5">บล็อกตัด (ถ้ามี)</span>
      <input value={open ? q : current} placeholder="🔍 ค้น/พิมพ์" onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="w-full h-9 px-2 rounded-lg border border-indigo-200 text-sm outline-none focus:border-indigo-400" />
      {open && res.length > 0 && (
        <div className="absolute z-20 mt-1 w-56 max-h-56 overflow-auto bg-white rounded-lg border border-indigo-100 shadow-xl">
          {res.map((b) => (
            <button key={b.id} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(b); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 flex justify-between">
              <span className="font-mono text-xs">{b.code}</span>
              <span className="text-slate-400 text-xs">{b.width ?? "?"}×{b.length ?? "?"}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
