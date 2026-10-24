"use client";

/**
 * 🔗 จับคู่รหัสปลายทาง (เช่น BigSeller) ↔ SKU ใน ERP ทีละแถว — ใช้ในหน้า 🔄 ซิงค์สต๊อก
 * ป๊อปกลาง ERPModal + ตัวเลือก SKU กลาง (SkuPicker) · บันทึกผ่าน /api/stock-sync/match (มี audit)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";

export type MatchTarget = {
  id: string;
  external_sku: string;
  external_name: string | null;
  sku_id: string | null;
  sku_code: string | null;
  sku_name: string | null;
};

export function MatchSkuModal({ target, onClose, onSaved }: {
  target: MatchTarget | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [pick, setPick] = useState<SkuPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setPick(target?.sku_id ? { id: target.sku_id, code: target.sku_code ?? "", name: target.sku_name ?? target.sku_code ?? "" } : null);
  }, [target]);

  const dirty = (pick?.id ?? null) !== (target?.sku_id ?? null);

  const save = async (skuId: string | null) => {
    if (!target) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch("/api/stock-sync/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping_id: target.id, sku_id: skuId }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onSaved(skuId ? `จับคู่ ${target.external_sku} → ${j.sku_code} แล้ว` : `ยกเลิกจับคู่ ${target.external_sku} แล้ว`);
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={!!target} onClose={() => !saving && onClose()} size="md" defaultExpanded={false}
      title="🔗 จับคู่กับ SKU ใน ERP" hasUnsavedChanges={dirty}
      description="เลือกว่ารหัสนี้ในโปรแกรมเดิม คือสินค้าตัวไหนใน ERP — นำเข้าไฟล์รอบหน้าจะไม่ทับการจับคู่นี้"
      footer={
        <>
          {target?.sku_id && (
            <button onClick={() => save(null)} disabled={saving}
              className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 mr-auto">
              ยกเลิกจับคู่
            </button>
          )}
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
          <button onClick={() => save(pick?.id ?? null)} disabled={saving || !pick || !dirty}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saving ? "กำลังบันทึก..." : "บันทึกการจับคู่"}
          </button>
        </>
      }>
      {target && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-[11px] text-slate-500">รหัสในโปรแกรมเดิม</div>
            <div className="text-sm font-semibold text-slate-800 break-all">{target.external_sku}</div>
            {target.external_name && <div className="text-xs text-slate-500 mt-0.5">{target.external_name}</div>}
          </div>
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">SKU ใน ERP</div>
            <SkuPicker value={pick} onChange={setPick} placeholder="ค้นหารหัส / ชื่อสินค้า..." disabled={saving} />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
      )}
    </ERPModal>
  );
}
