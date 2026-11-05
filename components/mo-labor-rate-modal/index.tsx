"use client";

/**
 * ตั้งค่าแรงผลิต / ชิ้น ของใบสั่งผลิต — ของกลาง (ป๊อปเล็ก)
 * --------------------------------------------------------------------------
 * เจ้าของสั่ง 2026-11-05: กด "ยังไม่ตั้งค่าแรง" บนการ์ดบอร์ดจ่ายงาน → ตั้งได้ทันที
 * บันทึกผ่าน API เดิม (กติกาเดียวกับช่องค่าแรงในเช็กลิสต์ของบอร์ด):
 *   ทุกใบของรุ่นนี้ (แนะนำ) → POST /api/mo/est-labor { mo_id, rate_per_piece, scope: "parent", save_bom }
 *   ใบนี้ใบเดียว           → POST /api/mo/est-labor { mo_id, est_labor_cost = ราคา × จำนวน } (+ /api/bom/labor-rates ถ้าติ๊ก BOM)
 *   ติ๊ก "บันทึกเป็นราคากลางใน BOM" = ใบใหม่ของรุ่นนั้นได้ค่าแรงเลย ไม่ต้องตั้งซ้ำ
 * สิทธิ์: products.edit (API ตรวจซ้ำ + เขียน audit) — คนไม่มีสิทธิ์ ผู้เรียกไม่ควรเปิดป๊อปนี้
 *
 *   <MoLaborRateModal mo={{ id, mo_no, product_sku, product_name, qty, bom_code }} onClose={…} onSaved={reload} />
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { apiSave } from "@/lib/save-toast";

export type LaborRateMo = {
  id: string; mo_no: string; product_sku: string | null; product_name?: string | null;
  qty: number; bom_code?: string | null;
  /** ค่าแรง/ชิ้นที่มีอยู่ (ถ้ามี) — ใส่เป็นค่าตั้งต้น */
  rate?: number;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function MoLaborRateModal({ mo, onClose, onSaved }: {
  mo: LaborRateMo | null;
  onClose: () => void;
  /** บันทึกสำเร็จ → ให้หน้าแม่โหลดข้อมูลใหม่ */
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [rate, setRate] = useState("");
  const [scope, setScope] = useState<"parent" | "one">("parent");
  const [saveBom, setSaveBom] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!mo) return;
    setRate(mo.rate && mo.rate > 0 ? String(mo.rate) : ""); setScope("parent"); setSaveBom(true); setErr(null);
  }, [mo]);

  const n = Number(rate) || 0;
  const save = async () => {
    if (!mo || saving) return;
    if (!(n > 0)) { setErr("ใส่ค่าแรงต่อชิ้นก่อน (มากกว่า 0)"); return; }
    setSaving(true);
    try {
      if (scope === "parent") {
        const r = await apiSave<{ count?: number; bom_updated?: number }>(toast, "/api/mo/est-labor",
          { method: "POST", body: { mo_id: mo.id, rate_per_piece: n, scope: "parent", save_bom: saveBom } }, { quiet: true });
        if (!r.ok) { setErr(r.error ?? "บันทึกไม่สำเร็จ"); return; }
        toast.success(`ตั้งค่าแรง ฿${fmt(n)}/ชิ้น ให้ทุกใบของรุ่นนี้แล้ว ${r.data?.count ?? 0} ใบ${r.data?.bom_updated ? ` · เข้า BOM ${r.data.bom_updated} สูตร` : ""}`);
      } else {
        const r = await apiSave(toast, "/api/mo/est-labor",
          { method: "POST", body: { mo_id: mo.id, est_labor_cost: Math.round(n * (mo.qty || 0) * 100) / 100 } }, { quiet: true });
        if (!r.ok) { setErr(r.error ?? "บันทึกไม่สำเร็จ"); return; }
        if (saveBom && mo.product_sku) {
          const b = await apiSave(toast, "/api/bom/labor-rates", { method: "POST",
            body: { bom_code: mo.bom_code ?? undefined, product_sku: mo.product_sku, craftsman_id: null, craftsman_name: "ราคากลาง", rate: n } }, { quiet: true });
          if (!b.ok) toast.warning(`ตั้งค่าแรงใบนี้แล้ว แต่บันทึกเข้า BOM ไม่สำเร็จ: ${b.error ?? ""}`);
          else toast.success(`ตั้งค่าแรง ฿${fmt(n)}/ชิ้น แล้ว + เข้า BOM`);
        } else toast.success(`ตั้งค่าแรง ฿${fmt(n)}/ชิ้น แล้ว`);
      }
      onSaved?.(); onClose();
    } finally { setSaving(false); }
  };

  const radio = (on: boolean) => `flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? "border-violet-400 bg-violet-50/60" : "border-slate-200 hover:bg-slate-50"}`;
  return (
    <ERPModal open={!!mo} onClose={onClose} size="sm" title="ตั้งค่าแรงผลิต / ชิ้น"
      description={mo ? `${mo.product_sku ?? ""} · ${mo.mo_no} · ${fmt(mo.qty)} ชิ้น` : undefined}
      hasUnsavedChanges={rate.trim() !== "" && n !== (mo?.rate ?? 0)}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={saving}
            className="h-9 px-4 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      }>
      {mo && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] text-slate-500">ค่าแรงผลิต / ชิ้น (บาท)</span>
            <MoneyInput value={rate} onChange={(v) => { setRate(v); setErr(null); }} autoFocus placeholder="15"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-base tabular-nums focus:border-violet-500 focus:outline-none" />
            {err && <span className="mt-1 block text-[12px] text-rose-600">{err}</span>}
            {n > 0 && <span className="mt-1 block text-[12px] text-slate-500">ใบนี้รวม ฿{fmt(n * (mo.qty || 0))} ({fmt(mo.qty)} ชิ้น)</span>}
          </label>
          <div className="space-y-1.5">
            <label className={radio(scope === "parent")}>
              <input type="radio" checked={scope === "parent"} onChange={() => setScope("parent")} className="mt-0.5 accent-violet-600" />
              <span><b className="font-medium text-slate-800">ทุกใบของรุ่นนี้ที่ยังเปิด</b> <span className="ml-1 rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">แนะนำ</span>
                <span className="block text-[12px] text-slate-500">ทุกสีของรุ่นเดียวกัน ได้ค่าแรงเท่ากัน</span></span>
            </label>
            <label className={radio(scope === "one")}>
              <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} className="mt-0.5 accent-violet-600" />
              <span><b className="font-medium text-slate-800">ใบนี้ใบเดียว</b></span>
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={saveBom} onChange={(e) => setSaveBom(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
            <span>บันทึกเป็นราคากลางใน BOM <span className="ml-1 rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">แนะนำ</span>
              <span className="block text-[12px] text-slate-500">ใบสั่งผลิตใหม่ของรุ่นนี้ได้ค่าแรงเลย ไม่ต้องตั้งซ้ำ</span></span>
          </label>
        </div>
      )}
    </ERPModal>
  );
}
