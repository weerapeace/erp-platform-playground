"use client";

/**
 * "BOM ทดลอง" + เครื่องคำนวณผ้าแบบวางตัดจริง — ใช้ในเครื่องคิดต้นทุน (/master/cost-calculator)
 *
 * แนวคิด 2 ระบบ (ตามที่เจ้าของสั่ง):
 *   📋 BOM จริง   = สูตรที่ใช้ผลิตจริง (แก้ที่หน้า BOM · กระทบการเบิกของ/ใบสั่งผลิต)
 *   🧪 BOM ทดลอง = บรรทัดที่เก็บไว้ "ในใบคิดต้นทุนใบนี้เท่านั้น" ไม่แตะสูตรจริง
 *                  ใช้ลองสูตรใหม่/เทียบวัสดุ/ตีราคาสินค้าที่ยังไม่มี BOM
 *
 * จุดต่างสำคัญ: บรรทัดทดลองคิดผ้าด้วย lib/nesting-calc (วางตัดจริง)
 *   ไม่ใช่ "เอาพื้นที่หาร" แบบ BOM จริง — ดูเหตุผล+ตัวเลขเทียบใน lib/nesting-calc.ts
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { nestCalc, nestExplain } from "@/lib/nesting-calc";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import type { BomComponent } from "@/app/api/bom/components/route";

const ComponentPicker = dynamic(() => import("@/components/material-picker").then((m) => m.ComponentPicker), { ssr: false });

/** 1 บรรทัดวัตถุดิบทดลอง — เก็บใน product_costings.scenario.trial_lines */
export type TrialLine = {
  key: string;
  sku: string | null;
  name: string;
  uom: string | null;
  unit_cost: number;         // ราคา/หน่วย (บาท)
  mode: "nest" | "manual";   // nest = คิดจากการวางตัด · manual = พิมพ์ปริมาณเอง
  // โหมด nest
  face_width_cm: number;     // หน้ากว้างผ้า
  cut_width: number;         // ชิ้นที่ตัด กว้าง
  cut_length: number;        // ชิ้นที่ตัด ยาว
  pieces: number;            // กี่ชิ้น ต่อสินค้า 1 ตัว
  waste_percent: number;
  divisor: number;           // ซม. ต่อ 1 หน่วย (หลา = 90)
  allow_rotate: boolean;     // หมุนชิ้น 90° ได้ไหม
  // โหมด manual
  qty_per: number;           // ใช้กี่หน่วย ต่อสินค้า 1 ตัว
};

export const emptyTrialLine = (i = 0): TrialLine => ({
  key: `t${i}_${Math.round(Math.random() * 1e9)}`,
  sku: null, name: "", uom: "หลา", unit_cost: 0,
  mode: "nest", face_width_cm: 0, cut_width: 0, cut_length: 0, pieces: 1,
  waste_percent: 0, divisor: 90, allow_rotate: false, qty_per: 0,
});

const num = (v: string) => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const baht = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * คิดปริมาณ/เงินของบรรทัดทดลอง (ต่อสินค้า 1 ตัว)
 * ⚠️ โหมด nest คิดจาก "ทั้งล็อต" แล้วหารกลับ — เศษแถวจะได้ถูกใช้ต่อโดยตัวถัดไป ไม่นับเป็นขยะทุกตัว
 */
export function trialLineCalc(l: TrialLine, lotQty: number) {
  if (l.mode === "manual") {
    const q = Number(l.qty_per) || 0;
    return { qtyPer: q, amount: Math.round(q * (Number(l.unit_cost) || 0) * 10000) / 10000, nest: null as ReturnType<typeof nestCalc> };
  }
  const lot = Math.max(1, Number(lotQty) || 1);
  const nest = nestCalc({
    face_width_cm: l.face_width_cm, cut_width: l.cut_width, cut_length: l.cut_length,
    pieces: (Number(l.pieces) || 0) * lot,               // ← ทั้งล็อต
    waste_percent: l.waste_percent, divisor: l.divisor, allow_rotate: l.allow_rotate,
  });
  if (!nest) return { qtyPer: 0, amount: 0, nest: null };
  const qtyPer = Math.round((nest.qty / lot) * 10000) / 10000;   // ← หารกลับเป็นต่อชิ้น
  return { qtyPer, amount: Math.round(qtyPer * (Number(l.unit_cost) || 0) * 10000) / 10000, nest };
}

const inp = "h-7 px-1.5 text-[12px] text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500";

// รหัส/เลขเวอร์ชันสูตร — ใช้กติกาเดียวกับ Wizard ดึงจากใบตีราคา (bom-from-cost-wizard)
const verNum = (v: string | null) => { const m = /(\d+)/.exec(v ?? ""); return m ? Number(m[1]) : 1; };
const verCode = (sku: string, n: number) => (n <= 1 ? `BOM-${sku}` : `BOM-${sku}_v.${n}`);

export function TrialBomEditor({
  lines, onChange, lotQty, realBomCode, productSku, productName, canEdit, onPushed,
}: {
  lines: TrialLine[];
  onChange: (next: TrialLine[]) => void;
  lotQty: number;
  realBomCode: string | null;
  productSku: string | null;
  productName?: string | null;
  canEdit?: boolean;
  /** เรียกหลังสร้างสูตรจริงสำเร็จ (ให้หน้าแม่โหลดข้อมูลใหม่) */
  onPushed?: () => void;
}) {
  const toast = useToast();
  const [pushOpen, setPushOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const calc = useMemo(() => lines.map((l) => trialLineCalc(l, lotQty)), [lines, lotQty]);
  const total = calc.reduce((a, c) => a + c.amount, 0);

  const patch = (key: string, p: Partial<TrialLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const del = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const add = () => onChange([...lines, emptyTrialLine(lines.length)]);

  /**
   * "⬆ เพิ่มเข้า BOM จริง" — สร้างสูตรใหม่จากบรรทัดทดลอง
   * ⚠️ ตั้งใจ "สร้างเวอร์ชันใหม่เสมอ" ไม่ทับสูตรเดิม — ของเก่าไม่หาย ย้อนกลับได้
   * ⚠️ ส่ง qty ที่คิดแบบ "วางตัดจริง" มาแล้ว + calc_mode="manual"
   *    เพราะ BOM จริงคิดด้วย area_face (พื้นที่หาร) ถ้าปล่อยให้คิดเองตัวเลขจะต่ำกว่าที่เห็นตรงนี้
   */
  const pushToRealBom = async () => {
    if (!productSku) { toast.error("ยังไม่ได้เลือกสินค้า"); return; }
    const usable = lines.filter((l, i) => l.sku && calc[i].qtyPer > 0);
    if (usable.length === 0) { toast.error("ยังไม่มีบรรทัดที่ใส่วัตถุดิบ+ปริมาณครบ"); return; }
    setPushing(true);
    try {
      // เวอร์ชันถัดไป (กันรหัสชนของเดิม)
      let n = 1;
      try {
        const vj = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(productSku)}`).then((r) => r.json());
        const vs = (vj.data ?? []) as { version: string | null }[];
        if (vs.length) n = Math.max(...vs.map((v) => verNum(v.version))) + 1;
      } catch { /* ไม่มีเวอร์ชันเดิม → v1 */ }

      const payload = {
        bom_code: verCode(productSku, n), version: `v${n}`, status: "draft",
        product_sku: productSku, product_name: productName ?? null,
        note: "สร้างจาก BOM ทดลอง (เครื่องคิดต้นทุน) — ปริมาณคิดแบบวางตัดจริงตามหน้ากว้าง",
        lines: usable.map((l, idx) => {
          const c = calc[lines.indexOf(l)];
          return {
            component_sku: l.sku, component_name: l.name || l.sku,
            qty: c.qtyPer, uom: l.uom,
            calc_mode: "manual",                 // ล็อกปริมาณที่คิดมาแล้ว (ดูเหตุผลด้านบน)
            pieces: l.mode === "nest" ? l.pieces : null,
            cut_width: l.mode === "nest" ? l.cut_width : null,
            cut_length: l.mode === "nest" ? l.cut_length : null,
            face_width_cm: l.mode === "nest" ? l.face_width_cm : null,
            waste_percent: l.waste_percent || null,
            source: "trial_bom", sequence: idx + 1,
          };
        }),
      };
      const j = await apiFetch("/api/bom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(`สร้างสูตรจริงแล้ว: ${payload.bom_code} (${usable.length} รายการ) — สถานะ “ร่าง”`);
      setPushOpen(false);
      onPushed?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างสูตรไม่สำเร็จ"); }
    finally { setPushing(false); }
  };

  // เลือกวัสดุ → เติม ราคา/หน่วย/หน้ากว้าง/เผื่อเสีย ให้อัตโนมัติ (เหมือนตัวแก้บรรทัด BOM)
  const onPick = (key: string, c: BomComponent) => patch(key, {
    sku: c.code, name: c.name,
    unit_cost: c.standard_price ?? 0,
    uom: c.uom_name ?? "หลา",
    face_width_cm: c.fabric_width_cm ?? 0,
    waste_percent: c.loss_percent ?? 0,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-slate-500">
          🧪 บรรทัดทดลอง <b className="text-slate-700">{lines.length}</b> รายการ · รวม <b className="text-slate-700">฿{baht(total)}</b>/ชิ้น
        </span>
        <span className="flex items-center gap-1.5">
          {canEdit && lines.length > 0 && (
            <button type="button" onClick={() => setPushOpen(true)}
              title="สร้างสูตร BOM จริงจากบรรทัดทดลองพวกนี้ (เป็นเวอร์ชันใหม่ ไม่ทับของเดิม)"
              className="h-7 px-2.5 text-[12px] border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50">⬆ เพิ่มเข้า BOM จริง</button>
          )}
          <button type="button" onClick={add} className="h-7 px-2.5 text-[12px] border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">+ เพิ่มวัตถุดิบ</button>
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="text-center py-4 text-[12px] text-slate-400 border border-dashed border-slate-200 rounded-lg">
          ยังไม่มีบรรทัดทดลอง — กด “+ เพิ่มวัตถุดิบ” เพื่อลองคิดต้นทุนโดยไม่แตะสูตรจริง
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const c = calc[i];
            const tooWide = l.mode === "nest" && !c.nest && l.face_width_cm > 0 && l.cut_width > 0 && l.cut_length > 0;
            return (
              <div key={l.key} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                {/* แถวบน: วัสดุ + ราคา + ลบ */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="flex-1 min-w-[180px]">
                    <ComponentPicker sku={l.sku ?? ""} name={l.name} onPick={(c) => onPick(l.key, c)} />
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-slate-400">
                    ฿/หน่วย
                    <input type="number" min={0} step="any" value={l.unit_cost || ""} onChange={(e) => patch(l.key, { unit_cost: num(e.target.value) })} className={`${inp} w-[72px]`} />
                  </label>
                  <button type="button" onClick={() => del(l.key)} title="ลบบรรทัด"
                    className="h-7 w-7 text-slate-300 hover:text-rose-600 rounded">✕</button>
                </div>

                {/* สลับวิธีคิด */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-slate-400">คิดจาก:</span>
                  {([["nest", "📐 วางตัดตามหน้ากว้าง"], ["manual", "✎ ใส่ปริมาณเอง"]] as const).map(([v, lb]) => (
                    <button key={v} type="button" onClick={() => patch(l.key, { mode: v })}
                      className={`px-2 py-0.5 rounded-full border ${l.mode === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{lb}</button>
                  ))}
                </div>

                {l.mode === "nest" ? (
                  <>
                    <div className="flex items-end gap-1.5 flex-wrap text-[11px] text-slate-400">
                      <label className="flex flex-col">หน้ากว้างผ้า<input type="number" min={0} step="any" value={l.face_width_cm || ""} onChange={(e) => patch(l.key, { face_width_cm: num(e.target.value) })} className={`${inp} w-[72px]`} /></label>
                      <span className="pb-1.5 text-slate-300">|</span>
                      <label className="flex flex-col">ตัดกว้าง<input type="number" min={0} step="any" value={l.cut_width || ""} onChange={(e) => patch(l.key, { cut_width: num(e.target.value) })} className={`${inp} w-[64px]`} /></label>
                      <label className="flex flex-col">ตัดยาว<input type="number" min={0} step="any" value={l.cut_length || ""} onChange={(e) => patch(l.key, { cut_length: num(e.target.value) })} className={`${inp} w-[64px]`} /></label>
                      <label className="flex flex-col">กี่ชิ้น<input type="number" min={0} step="any" value={l.pieces || ""} onChange={(e) => patch(l.key, { pieces: num(e.target.value) })} className={`${inp} w-[56px]`} /></label>
                      <label className="flex flex-col">เผื่อเสีย%<input type="number" min={0} step="any" value={l.waste_percent || ""} onChange={(e) => patch(l.key, { waste_percent: num(e.target.value) })} className={`${inp} w-[60px]`} /></label>
                      <label className="flex items-center gap-1 pb-1.5 cursor-pointer text-slate-500">
                        <input type="checkbox" checked={l.allow_rotate} onChange={(e) => patch(l.key, { allow_rotate: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
                        หมุนชิ้นได้ (ผ้าสีพื้น)
                      </label>
                    </div>

                    {/* ผลการวาง — บอกเป็นภาษาคน + เทียบสูตรเดิม */}
                    {tooWide ? (
                      <p className="text-[11px] text-rose-600">⚠️ ชิ้นนี้กว้างเกินหน้าผ้า วางไม่ได้ — ลดขนาด หรือติ๊ก “หมุนชิ้นได้”</p>
                    ) : c.nest ? (
                      <p className="text-[11px] text-emerald-700">
                        ✅ {nestExplain(c.nest, l.uom ?? "หลา")}
                        <span className="block text-slate-400">
                          ต่อสินค้า 1 ชิ้น = {fmt(c.qtyPer)} {l.uom} · เป็นเงิน ฿{baht(c.amount)}
                          {c.nest.areaQty > 0 && <> · <span title="สูตรเดิมคิดแบบเอาพื้นที่หาร ไม่คิดเศษริมม้วน">สูตรเดิมจะได้ {fmt(c.nest.areaQty / Math.max(1, lotQty))} (ต่ำกว่าจริง)</span></>}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400">กรอกหน้ากว้าง + ขนาดที่ตัด + จำนวนชิ้น เพื่อให้คำนวณ</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-end gap-1.5 flex-wrap text-[11px] text-slate-400">
                    <label className="flex flex-col">ใช้กี่ {l.uom ?? "หน่วย"} ต่อชิ้น
                      <input type="number" min={0} step="any" value={l.qty_per || ""} onChange={(e) => patch(l.key, { qty_per: num(e.target.value) })} className={`${inp} w-[90px]`} /></label>
                    <span className="pb-1.5 text-slate-500">= ฿{baht(c.amount)}/ชิ้น</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lines.length > 0 && (
        <p className="text-[11px] text-slate-400">
          💾 บรรทัดทดลองถูกเก็บพร้อมใบคิดต้นทุน — กด <b>บันทึก</b> (ขวาล่าง) แล้วเปิดสินค้านี้ครั้งหน้าจะยังอยู่
          {realBomCode && <> · ไม่แตะสูตรจริง ({realBomCode})</>}
        </p>
      )}

      {/* ยืนยันก่อนสร้างสูตรจริง — แตะข้อมูลที่ใช้ผลิต ต้องเห็นภาพก่อนกด */}
      <ERPModal open={pushOpen} onClose={() => !pushing && setPushOpen(false)} size="sm" title="⬆ เพิ่มเข้า BOM จริง"
        footer={<>
          <button onClick={() => setPushOpen(false)} disabled={pushing} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void pushToRealBom()} disabled={pushing} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{pushing ? "กำลังสร้าง…" : "สร้างสูตรจริง"}</button>
        </>}>
        <div className="space-y-2.5 text-sm text-slate-600">
          <p>สร้างสูตร BOM ของ <b className="text-slate-800">{productSku}</b> จากบรรทัดทดลอง <b className="text-emerald-700">{lines.filter((l, i) => l.sku && calc[i].qtyPer > 0).length}</b> รายการ</p>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            ✅ สร้างเป็น <b>เวอร์ชันใหม่</b> สถานะ “ร่าง” — สูตรเดิมไม่ถูกทับ ย้อนกลับได้<br />
            ✅ ปริมาณที่บันทึก = ตัวเลขที่คิดแบบ <b>วางตัดจริง</b> (ตรงกับที่เห็นตรงนี้)
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ บรรทัดจะถูกล็อกเป็น “ใส่ปริมาณเอง” ในสูตรจริง — เพราะสูตรจริงคิดผ้าแบบเอาพื้นที่หาร
            ถ้าปล่อยให้คิดเอง ตัวเลขจะต่ำกว่าความจริง · ถ้าแก้ขนาดที่หน้า BOM ทีหลัง ต้องแก้ปริมาณเองด้วย
          </div>
          {!canEdit && <p className="text-rose-600 text-xs">คุณไม่มีสิทธิ์แก้สูตร</p>}
        </div>
      </ERPModal>
    </div>
  );
}
