"use client";

/**
 * GroupRefSkusModal — ผูก "สินค้าตัวแทน" (SKU จัดซื้อ) ให้แต่ละกลุ่มวัสดุ (เฟส 2 Group cost)
 * ใช้ดึงราคาซื้อจริงล่าสุด (GR→PO) ตอนตีราคาแบบกลุ่ม
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { GroupRef, SkuLite } from "@/app/api/design-sheets/group-ref-skus/route";
import type { SkuPickerValue } from "@/components/pickers";

export function GroupRefSkusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [skus, setSkus] = useState<Record<string, SkuLite>>({});
  const [loading, setLoading] = useState(false);
  const [pickFor, setPickFor] = useState<GroupRef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch("/api/design-sheets/group-ref-skus").then((r) => r.json());
      if (!j.error) { setGroups((j.data ?? []) as GroupRef[]); setSkus((j.skus ?? {}) as Record<string, SkuLite>); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const saveGroup = async (code: string, ids: string[]) => {
    setGroups((gs) => gs.map((g) => (g.code === code ? { ...g, ref_sku_ids: ids } : g)));
    const j = await apiFetch("/api/design-sheets/group-ref-skus", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, sku_ids: ids }),
    }).then((r) => r.json());
    if (j.error) { toast.error(j.error); void load(); } else toast.success("บันทึกสินค้าตัวแทนแล้ว");
  };

  const onPicked = (picked: SkuPickerValue[]) => {
    if (!pickFor) return;
    // เพิ่ม SKU ใหม่เข้า + จำชื่อไว้โชว์
    setSkus((m) => { const n = { ...m }; for (const s of picked) n[s.id] = { id: s.id, code: s.code, name: s.name }; return n; });
    const ids = [...new Set([...pickFor.ref_sku_ids, ...picked.map((s) => s.id)])];
    void saveGroup(pickFor.code, ids);
    setPickFor(null);
  };

  const removeSku = (code: string, skuId: string) => {
    const g = groups.find((x) => x.code === code); if (!g) return;
    void saveGroup(code, g.ref_sku_ids.filter((id) => id !== skuId));
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="🔗 ผูกสินค้าจัดซื้อ (ตัวแทนต่อกลุ่ม)" size="lg" storageKey="group-ref-skus">
        <p className="text-xs text-slate-500 mb-3">เลือก SKU จัดซื้อ 1–3 ตัวเป็น “ตัวแทน” ของแต่ละกลุ่ม → ระบบจะดึง <b>ราคาซื้อจริงล่าสุด</b> (จากใบรับของ→PO) ของตัวพวกนั้นมาเป็นฐานราคาตอนตีราคาแบบกลุ่ม</p>
        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g.code} className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700">{g.name} <code className="text-[10px] text-slate-400">{g.code}</code></div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.ref_sku_ids.length === 0 && <span className="text-[11px] text-slate-300">— ยังไม่ผูกสินค้า —</span>}
                    {g.ref_sku_ids.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-amber-50 border border-amber-200 text-amber-700 rounded">
                        {skus[id]?.code ?? id.slice(0, 8)}
                        <button type="button" onClick={() => removeSku(g.code, id)} className="text-amber-300 hover:text-rose-500 leading-none">✕</button>
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setPickFor(g)}
                  className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">＋ เลือกสินค้า</button>
              </div>
            ))}
            {groups.length === 0 && <div className="py-8 text-center text-slate-400 text-sm">— ยังไม่มีกลุ่มวัสดุ —</div>}
          </div>
        )}
      </ERPModal>
      <SkuMultiPickerModal open={!!pickFor} onClose={() => setPickFor(null)}
        excludeIds={pickFor?.ref_sku_ids ?? []} onConfirm={onPicked} />
    </>
  );
}
