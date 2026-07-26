"use client";

/**
 * SkuShopSelect — ของกลาง: เลือก "ร้าน (ผู้จำหน่าย)" ของรายการซื้อ โดยดึงจาก **ตารางร้านที่จำหน่ายของ SKU นั้น**
 *
 *  - แถวชิป = ร้านที่ขายสินค้านี้ (★ ร้านหลักขึ้นก่อน + โชว์ราคา) → กดเลือกได้ทันที (ได้ราคามาด้วย)
 *  - ถ้าร้านที่ต้องการยังไม่อยู่ในรายการ → เลือกจาก "ร้านทั้งหมด" ด้านล่าง
 *    ระบบจะ **เพิ่มร้านนั้นเข้ารายการร้านของสินค้านี้ให้อัตโนมัติ** (ไม่ต้องกดปุ่มแยก)
 *
 * ใช้ที่: หน้าสั่งซื้อ (การ์ด/ป๊อปแก้ไขรายการ) · ที่อื่นที่ต้องเลือกร้านของสินค้า
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SupplierPicker } from "@/components/supplier-picker";

type Shop = { id: string; partner_id: string | null; partner_name: string; price: number | null; currency: string; is_default: boolean; supplier_sku: string | null };
const curSym = (c: string) => (["RMB", "YUAN", "CNY"].includes(String(c).toUpperCase()) ? "¥" : "฿");

export function SkuShopSelect({
  skuId, valueId, valueName, suppliers, onPick, onAddNew, reloadSignal, disabled,
}: {
  skuId: string | null;
  valueId: string;                         // partner id ที่เลือกอยู่
  valueName: string;                       // ชื่อร้านปัจจุบัน (อาจไม่อยู่ในทะเบียน)
  suppliers: { id: string; name: string; cn?: boolean }[];
  onPick: (v: { id: string; name: string; price: number | null; currency: string }) => void;
  onAddNew?: () => void;                   // + ร้านใหม่ (เปิด wizard)
  reloadSignal?: number;                   // bump เพื่อรีโหลดรายการร้าน
  disabled?: boolean;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!skuId) { setShops([]); return; }
    apiFetch(`/api/purchasing/sku-suppliers?sku_id=${encodeURIComponent(skuId)}`).then((r) => r.json())
      .then((j) => setShops(((j.data ?? []) as Shop[])))
      .catch(() => setShops([]));
  }, [skuId]);
  useEffect(() => { load(); }, [load, reloadSignal]);

  // เลือกร้านจาก "ทั้งหมด" → ใช้ทันที + เพิ่มเข้ารายการร้านของสินค้านี้ (ถ้ายังไม่มี)
  const pickAny = async (id: string, name: string) => {
    const inList = shops.find((s) => s.partner_id === id);
    onPick({ id, name, price: inList?.price ?? null, currency: inList?.currency ?? "THB" });
    if (!inList && skuId) {
      setBusy(true);
      try {
        await apiFetch("/api/purchasing/sku-suppliers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku_id: skuId, partner_id: id, price: null, currency: "THB", default_if_none: true }),
        });
        load();
      } catch { /* เงียบไว้ — ผู้ใช้ยังเลือกร้านได้ */ }
      finally { setBusy(false); }
    }
  };

  return (
    <div className="space-y-1.5">
      {/* ร้านที่ขายสินค้านี้ (จากตารางร้านที่จำหน่าย) */}
      {skuId && (
        shops.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 shrink-0">🏪 ร้านที่ขายสินค้านี้:</span>
            {shops.map((s) => {
              const on = !!s.partner_id && s.partner_id === valueId;
              return (
                <button key={s.id} type="button" disabled={disabled || busy || !s.partner_id}
                  onClick={() => s.partner_id && onPick({ id: s.partner_id, name: s.partner_name, price: s.price, currency: s.currency })}
                  title={s.supplier_sku ? `รหัสร้าน: ${s.supplier_sku}` : undefined}
                  className={`h-7 px-2 text-xs rounded-md border inline-flex items-center gap-1 ${on
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {s.is_default && <span className={on ? "text-amber-200" : "text-amber-400"}>★</span>}
                  <span className="truncate max-w-[140px]">{s.partner_name}</span>
                  {s.price != null && <span className={`tabular-nums ${on ? "text-blue-100" : "text-slate-400"}`}>{curSym(s.currency)}{s.price.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">🏪 สินค้านี้ยังไม่มีร้านในรายการ — เลือกร้านด้านล่าง ระบบจะเพิ่มเข้ารายการให้อัตโนมัติ</div>
        )
      )}

      {/* ร้านทั้งหมดในทะเบียน (เลือกแล้วเพิ่มเข้ารายการสินค้าให้เอง) */}
      <SupplierPicker value={valueId} suppliers={suppliers} disabled={disabled || busy}
        placeholder="— เลือกร้านอื่น (ทั้งหมด) —"
        onChange={(id, name) => void pickAny(id, name)} onAddNew={onAddNew} />
      {!valueId && valueName && (
        <div className="text-[11px] text-amber-600">ร้านปัจจุบัน: {valueName} (ยังไม่ใช่ร้านในทะเบียน — เลือกใหม่เพื่อผูกเข้าระบบ)</div>
      )}
    </div>
  );
}
