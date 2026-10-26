"use client";

/**
 * 🗂️ ตั้งหมวดกลางให้หลายสินค้า — ป๊อปของหน้า ลงสินค้าบนแพลตฟอร์ม
 * ใช้ตัวเลือกหมวดกลางเดิม (CentralCategoryPicker: ค้นหา/เพิ่มหมวด/จับคู่หมวดกับแต่ละร้านได้ในตัว)
 * บันทึกผ่าน PATCH /api/product-platforms { set_platform_category, parent_sku_ids } (มีประวัติต่อสินค้า)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { CentralCategoryPicker } from "@/components/central-category-picker";
import { apiFetch } from "@/lib/api";

export function BulkCategoryDialog({ open, rows, platformName, onClose, onDone }: {
  open: boolean;
  rows: { id: string; code: string }[];
  platformName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [catId, setCatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setCatId(null); setError(null); } }, [open]);

  const apply = async () => {
    if (!catId) return;
    setBusy(true); setError(null);
    try {
      const ids = rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 500) {
        const res = await apiFetch("/api/product-platforms", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ set_platform_category: true, parent_sku_ids: ids.slice(i, i + 500), platform_category_id: catId }),
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error);
      }
      onDone(`ตั้งหมวดกลางให้ ${rows.length.toLocaleString()} สินค้าแล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !busy && onClose()} size="md" defaultExpanded={false} storageKey="platform-listing-bulk-category"
      title="🗂️ ตั้งหมวดกลางให้หลายสินค้า" hasUnsavedChanges={!!catId}
      description={`หมวดบน ${platformName} จะมาจากการจับคู่หมวดกลาง → หมวดของร้าน (ทำครั้งเดียวต่อหมวด ใช้กับทุกสินค้าในหมวดนั้น)`}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={apply} disabled={busy || !catId} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {busy ? "กำลังบันทึก..." : `ตั้งหมวดให้ ${rows.length.toLocaleString()} สินค้า`}
          </button>
        </>
      }>
      <div className="space-y-3">
        <div className="text-sm text-slate-700">เลือกไว้ <b>{rows.length.toLocaleString()}</b> สินค้า{rows.length <= 6 ? `: ${rows.map((r) => r.code).join(", ")}` : ""}</div>
        <CentralCategoryPicker value={catId} onChange={setCatId} disabled={busy} placeholder="— เลือกหมวดกลาง —" />
        <p className="text-xs text-slate-500">ยังไม่มีหมวดที่ต้องการ: กด "➕ เพิ่มหมวดใหม่" ในช่องเลือกได้เลย · หมวดนี้ยังไม่จับคู่กับ {platformName}: กดปุ่มจับคู่หมวดข้างช่องเลือก</p>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      </div>
    </ERPModal>
  );
}
