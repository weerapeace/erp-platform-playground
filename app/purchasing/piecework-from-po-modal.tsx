"use client";

/**
 * Modal: ทำรายการในใบสั่งซื้อให้เป็น "งานเหมารายชิ้น" (ย้อนกลับ)
 * → สร้างงานในทะเบียนกลาง + ผูกเข้า BOM ของสินค้า (ถ้าระบุ SKU)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export type PieceFromPoInit = { job_name: string; rate: number; product_sku?: string } | null;

export function PieceworkFromPoModal({ init, onClose }: { init: PieceFromPoInit; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [rate, setRate] = useState(0);
  const [isDetail, setIsDetail] = useState(false);
  const [note, setNote] = useState("");
  const [sku, setSku] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (init) { setName(init.job_name); setRate(init.rate || 0); setSku(init.product_sku ?? ""); setIsDetail(false); setNote(""); }
  }, [init]);

  const submit = async () => {
    if (!name.trim()) { toast.error("กรุณาระบุชื่องาน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/piecework/from-po", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_name: name.trim(), rate, is_detail: isDetail, note: note.trim() || null, product_sku: sku.trim() || null }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      if (j.warn) toast.success(j.warn);
      else if (j.attached) toast.success(`สร้างงานเหมา “${name.trim()}” และผูกเข้า BOM แล้ว`);
      else toast.success(`สร้างงานเหมา “${name.trim()}” เข้าทะเบียนแล้ว`);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={init !== null} onClose={onClose} size="sm" title="🧵 ทำเป็นงานเหมารายชิ้น"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 mr-auto">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "สร้างงานเหมา"}</button>
      </>}>
      <div className="space-y-3">
        <p className="text-[12px] text-slate-500">สร้างงานนี้เข้าทะเบียนงานเหมากลาง และผูกเข้า BOM ของสินค้า (ถ้ากรอกรหัสสินค้า)</p>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ชื่องาน</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/ชิ้น (บาท)</label>
            <input type="number" inputMode="decimal" value={rate || ""} onChange={(e) => setRate(Number(e.target.value) || 0)} className="w-full h-9 px-3 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={isDetail} onChange={(e) => setIsDetail(e.target.checked)} className="w-4 h-4 accent-indigo-600" /> งานละเอียด
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ผูกเข้า BOM สินค้า (รหัสสินค้า — ไม่บังคับ)</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="เช่น TTM061-04" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[11px] text-slate-400 mt-1">ถ้ากรอก ระบบจะเพิ่มงานนี้เข้าตารางงานเหมาใน BOM ที่ใช้งานของสินค้านั้น</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>
    </ERPModal>
  );
}
