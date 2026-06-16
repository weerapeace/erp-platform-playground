"use client";

/**
 * PriceItemSkusModal — ผูก SKU จัดซื้อเข้ากับ "วัสดุตีราคา" แต่ละตัว (one-to-many)
 * วัสดุตีราคา = "กลุ่ม" เอง · ดึงราคาซื้อจริงล่าสุด/เฉลี่ย (GR→PO) ของ SKU ที่ผูกมาเป็นฐานราคา
 * 1 SKU สังกัดได้วัสดุเดียว
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { PriceItem } from "@/app/api/design-sheets/price-items/route";
import type { SkuLite } from "@/app/api/design-sheets/price-item-skus/route";
import type { SkuPickerValue } from "@/components/pickers";

export function PriceItemSkusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<PriceItem[]>([]);
  const [links, setLinks] = useState<Record<string, string[]>>({});
  const [skus, setSkus] = useState<Record<string, SkuLite>>({});
  const [loading, setLoading] = useState(false);
  const [pickFor, setPickFor] = useState<PriceItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pi, ps] = await Promise.all([
        apiFetch("/api/design-sheets/price-items").then((r) => r.json()),
        apiFetch("/api/design-sheets/price-item-skus").then((r) => r.json()),
      ]);
      if (!pi.error) setItems((pi.data ?? []) as PriceItem[]);
      if (!ps.error) { setLinks((ps.links ?? {}) as Record<string, string[]>); setSkus((ps.skus ?? {}) as Record<string, SkuLite>); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const saveItem = async (itemId: string, ids: string[]) => {
    setLinks((m) => ({ ...m, [itemId]: ids }));
    const j = await apiFetch("/api/design-sheets/price-item-skus", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, sku_ids: ids }),
    }).then((r) => r.json());
    if (j.error) { toast.error(j.error); void load(); } else toast.success("บันทึก SKU ที่ผูกแล้ว");
  };

  const onPicked = (picked: SkuPickerValue[]) => {
    if (!pickFor) return;
    setSkus((m) => { const n = { ...m }; for (const s of picked) n[s.id] = { id: s.id, code: s.code, name: s.name }; return n; });
    const ids = [...new Set([...(links[pickFor.id] ?? []), ...picked.map((s) => s.id)])];
    void saveItem(pickFor.id, ids);
    setPickFor(null);
  };

  const removeSku = (itemId: string, skuId: string) => {
    void saveItem(itemId, (links[itemId] ?? []).filter((id) => id !== skuId));
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="🔗 ผูก SKU เข้าวัสดุตีราคา" size="lg" storageKey="price-item-skus">
        <p className="text-xs text-slate-500 mb-3">
          เลือก SKU จัดซื้อมาผูกกับวัสดุตีราคาแต่ละตัว → ระบบดึง <b>ราคาซื้อจริงล่าสุด/เฉลี่ย</b> (จากใบรับของ→PO) ของ SKU ที่ผูกมาเป็นฐานราคาตอนตีราคา · 1 SKU สังกัดได้วัสดุเดียว
        </p>
        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const ids = links[it.id] ?? [];
              return (
                <div key={it.id} className="flex items-start gap-2 p-2.5 border border-slate-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">
                      {it.name} {it.code && <code className="text-[10px] text-slate-400">{it.code}</code>}
                      {it.sku_latest_price != null && (
                        <span className="ml-2 text-[11px] text-emerald-600">ล่าสุด {it.sku_latest_price.toLocaleString()} {it.sku_latest_currency ?? ""}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ids.length === 0 && <span className="text-[11px] text-slate-300">— ยังไม่ผูก SKU —</span>}
                      {ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-amber-50 border border-amber-200 text-amber-700 rounded">
                          {skus[id]?.code ?? id.slice(0, 8)}
                          <button type="button" onClick={() => removeSku(it.id, id)} className="text-amber-300 hover:text-rose-500 leading-none">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => setPickFor(it)}
                    className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">＋ เลือก SKU</button>
                </div>
              );
            })}
            {items.length === 0 && <div className="py-8 text-center text-slate-400 text-sm">— ยังไม่มีวัสดุตีราคา —</div>}
          </div>
        )}
      </ERPModal>
      <SkuMultiPickerModal open={!!pickFor} onClose={() => setPickFor(null)}
        excludeIds={pickFor ? (links[pickFor.id] ?? []) : []} onConfirm={onPicked} />
    </>
  );
}
