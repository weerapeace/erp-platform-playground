"use client";

/**
 * 📚 Design Library — ทุนประมาณสด (เห็นเฉพาะคนมีสิทธิ์ products.cost.view)
 * บรรทัดวัสดุคิดจากสูตร (ชุดสีที่เลือก) → ปริมาณอัตโนมัติ (แก้เองได้) × ราคาทุน SKU (ไม่มี = ใส่เอง) + ค่าแรง + ค่าอื่น ๆ
 * กฎคิดเลข: lib/design-library-cost estimateCost (ใช้สูตรกลาง calcCostQty + bomMaterialCost) · ราคา: GET /api/design-library/cost
 * ค่าที่แก้เก็บใน spec.cost (บันทึกพร้อมสูตรด้วย SaveBar) — ราคาที่ใส่เองผูกกับ "รหัสของ" จึงใช้ร่วมทุกชุดสี
 */
import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Icon } from "@/components/icon";
import { calcSettingsFrom, estimateCost, type MaterialInfo } from "@/lib/design-library-cost";
import type { Choice, RecipeCost, Spec } from "@/lib/design-library";
import { api } from "./shared";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n; };

export function CostPanel({ spec, cost, choices, materials, calcRows, skuIds, colorway, readOnly, onChange }: {
  /** สูตรตามชุดสีที่เลือก */
  spec: Spec; cost: RecipeCost; choices: Choice[];
  materials: Record<string, MaterialInfo>; calcRows: Parameters<typeof calcSettingsFrom>[0];
  /** SKU ทุกชุดสี (ดึงราคาครั้งเดียว) */
  skuIds: string[]; colorway: string | null; readOnly: boolean;
  onChange: (cost: RecipeCost) => void;
}) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const need = skuIds.filter((x) => !loaded.has(x));
  const needKey = need.join(",");
  useEffect(() => {
    if (!needKey) return;
    let alive = true;
    api<{ prices: Record<string, number> }>(`/api/design-library/cost?sku_ids=${needKey}`)
      .then((d) => { if (!alive) return; setPrices((p) => ({ ...p, ...d.prices })); setLoaded((s) => new Set([...s, ...needKey.split(",")])); setErr(null); })
      .catch((e: Error) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [needKey]);

  const calc = useMemo(() => calcSettingsFrom(calcRows), [calcRows]);
  const est = useMemo(() => estimateCost(spec, choices, { materials, prices, calc, cost }), [spec, choices, materials, prices, calc, cost]);
  const setQty = (key: string, v: number | null) => { const qty = { ...cost.qty }; if (v == null) delete qty[key]; else qty[key] = v; onChange({ ...cost, qty }); };
  const setPrice = (key: string, v: number | null) => { const price = { ...cost.price }; if (v == null || v === 0) delete price[key]; else price[key] = v; onChange({ ...cost, price }); };
  const cell = "py-1.5 px-1.5 align-middle";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[14px] font-medium text-slate-800 flex items-center gap-2"><Icon value="i:coin" />ทุนประมาณ{colorway && <span className="text-indigo-700 font-normal">· {colorway}</span>}</span>
        <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">เห็นเฉพาะคนมีสิทธิ์ดูต้นทุน</span>
        <span className="ml-auto text-[18px] font-semibold text-slate-900">{baht(est.total)} <span className="text-[13px] font-normal text-slate-500">บาท/ใบ</span></span>
      </div>
      <p className="text-[12px] text-slate-500 mb-2">ประมาณจากขนาดกระเป๋า (ชิ้นตัดแบบเดียวกับสตูดิโอแพทเทิร์น) · ปริมาณ/ราคาแก้เองได้ ช่องว่าง = ใช้ค่าอัตโนมัติ · ใบงานจริงตีราคาละเอียดอีกครั้ง</p>
      {err && <div className="text-[12.5px] text-rose-700 bg-rose-50 rounded px-2 py-1 mb-2">{err}</div>}
      {est.areas.clamped && <div className="text-[12.5px] text-amber-800 bg-amber-50 rounded px-2 py-1 mb-2">ขนาดนี้เกินช่วงของแม่แบบทรงในสตูดิโอ — พื้นที่ผ้าคิดจากขนาดที่ใกล้ที่สุด ควรแก้ปริมาณผ้าเอง</div>}
      {est.missing > 0 && <div className="text-[12.5px] text-amber-800 bg-amber-50 rounded px-2 py-1 mb-2">ขาดราคา {est.missing} รายการ — ใส่ราคาเองในช่อง “ราคา/หน่วย” (หรือไปใส่ราคาทุนที่ SKU) ยอดรวมยังไม่ครบ</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse min-w-[720px]">
          <thead><tr className="text-slate-500 text-left">
            <th className={`${cell} font-normal`}>รายการ</th><th className={`${cell} font-normal w-32`}>จำนวน</th><th className={`${cell} font-normal w-16`}>หน่วย</th>
            <th className={`${cell} font-normal w-36`}>ราคา/หน่วย</th><th className={`${cell} font-normal w-28 text-right`}>รวม</th>
          </tr></thead>
          <tbody>
            {est.lines.map((l) => (
              <tr key={l.key} className="border-t border-slate-100">
                <td className={cell}>
                  <div className="text-slate-800">{l.pinIndex != null && <span className="text-slate-400 mr-1">{l.pinIndex + 1}.</span>}{l.catName} · {l.code ? `${l.code} ` : ""}{l.name}</div>
                  <div className="text-[11px] text-slate-400">{l.detail}</div>
                </td>
                <td className={cell}>
                  <input type="number" min={0} step="any" disabled={readOnly} value={cost.qty[l.key] ?? ""} placeholder={l.autoQty != null ? qtyText(l.autoQty) : "ใส่เอง"}
                    onChange={(e) => setQty(l.key, numOrNull(e.target.value))} className="w-full h-8 px-2 border border-slate-200 rounded-md text-right disabled:bg-slate-50" />
                </td>
                <td className={`${cell} text-slate-500`}>{l.uom}</td>
                <td className={cell}>
                  <MoneyInput value={cost.price[l.priceKey] ?? ""} disabled={readOnly} placeholder={l.priceSource === "sku" ? baht(l.unitPrice) : "ใส่ราคา"}
                    onChange={(raw) => setPrice(l.priceKey, numOrNull(raw))} className="w-full h-8 px-2 border border-slate-200 rounded-md text-right" />
                  <div className={`text-[10.5px] mt-0.5 ${l.priceSource === "none" ? "text-amber-700" : "text-slate-400"}`}>{l.priceSource === "sku" ? "ราคาทุนจาก SKU" : l.priceSource === "manual" ? "ใส่เอง" : "ยังไม่มีราคา"}</div>
                </td>
                <td className={`${cell} text-right tabular-nums ${l.priceSource === "none" && l.qty > 0 ? "text-slate-300" : "text-slate-800"}`}>{baht(l.amount)}</td>
              </tr>
            ))}
            {!est.lines.length && <tr><td colSpan={5} className="py-4 text-center text-slate-400">ยังไม่มีจุดที่เลือกหมวด — เพิ่มจุดบนรูปก่อน</td></tr>}
            <tr className="border-t border-slate-200"><td className={`${cell} text-slate-600`} colSpan={4}>รวมวัสดุ</td><td className={`${cell} text-right font-medium tabular-nums`}>{baht(est.materials)}</td></tr>
            <tr className="border-t border-slate-100">
              <td className={`${cell} text-slate-600`} colSpan={3}>ค่าแรงเย็บ/ใบ</td>
              <td className={cell}><MoneyInput value={cost.labor || ""} disabled={readOnly} placeholder="0.00" onChange={(raw) => onChange({ ...cost, labor: numOrNull(raw) ?? 0 })} className="w-full h-8 px-2 border border-slate-200 rounded-md text-right" /></td>
              <td className={`${cell} text-right tabular-nums`}>{baht(est.labor)}</td>
            </tr>
            {cost.extras.map((x, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className={cell} colSpan={3}>
                  <div className="flex items-center gap-1">
                    <input value={x.label} disabled={readOnly} maxLength={80} placeholder="เช่น ค่าบรรจุ / ค่าขนส่ง" onChange={(e) => onChange({ ...cost, extras: cost.extras.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })}
                      className="flex-1 h-8 px-2 border border-slate-200 rounded-md disabled:bg-slate-50" />
                    {!readOnly && <button type="button" onClick={() => onChange({ ...cost, extras: cost.extras.filter((_, k) => k !== i) })} className="h-8 w-8 rounded-md text-rose-600 hover:bg-rose-50" aria-label="ลบค่าใช้จ่ายนี้"><Icon value="i:trash" /></button>}
                  </div>
                </td>
                <td className={cell}><MoneyInput value={x.amount || ""} disabled={readOnly} placeholder="0.00" onChange={(raw) => onChange({ ...cost, extras: cost.extras.map((y, k) => (k === i ? { ...y, amount: numOrNull(raw) ?? 0 } : y)) })} className="w-full h-8 px-2 border border-slate-200 rounded-md text-right" /></td>
                <td className={`${cell} text-right tabular-nums`}>{baht(x.amount)}</td>
              </tr>
            ))}
            {!readOnly && cost.extras.length < 20 && (
              <tr><td colSpan={5} className={cell}><button type="button" onClick={() => onChange({ ...cost, extras: [...cost.extras, { label: "", amount: 0 }] })} className="h-7 px-2.5 text-[12px] rounded-md border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เพิ่มค่าใช้จ่ายอื่น</button></td></tr>
            )}
            <tr className="border-t-2 border-slate-300"><td className={`${cell} font-medium text-slate-800`} colSpan={4}>รวมทุนประมาณ/ใบ</td><td className={`${cell} text-right font-semibold tabular-nums`}>{baht(est.total)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
