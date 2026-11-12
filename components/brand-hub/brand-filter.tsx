"use client";
/**
 * กรองแบรนด์จากลิงก์ ?brand=<id> (มาจากหน้าแบรนด์ /brand-hub) — ใช้ในหน้าที่ไม่มีช่องเลือกแบรนด์ของตัวเอง
 *   const [brandOnly, clearBrand] = useBrandParam();
 *   const rows = brandOnly ? all.filter((r) => r.brand_id === brandOnly) : all;
 *   <BrandFilterChip brandId={brandOnly} brands={brands} onClear={clearBrand} />
 * อ่านลิงก์ครั้งเดียวหลังโหลดหน้า (กัน hydration ไม่ตรง) · กด "ดูทุกแบรนด์" = ล้างตัวกรอง + เอา ?brand ออกจากลิงก์
 * หน้าที่มีช่องเลือกแบรนด์อยู่แล้ว (เช่น Design Sheets / ศูนย์ออเดอร์) → ตั้งค่าช่องนั้นจาก ?brand แทน ไม่ต้องใช้ชิปนี้
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";

export function useBrandParam(): [string, () => void] {
  const [brandId, setBrandId] = useState("");
  useEffect(() => {
    try { setBrandId(new URLSearchParams(window.location.search).get("brand") ?? ""); } catch { /* ไม่มีลิงก์ = ทุกแบรนด์ */ }
  }, []);
  const clear = useCallback(() => {
    setBrandId("");
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("brand");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* เขียนลิงก์ไม่ได้ก็ไม่เป็นไร */ }
  }, []);
  return [brandId, clear];
}

export function BrandFilterChip({ brandId, brands, onClear, count }: {
  brandId: string;
  brands: { id: string; name?: string | null; label?: string | null; color?: string | null }[];
  onClear: () => void;
  /** จำนวนรายการหลังกรอง (ไม่ใส่ = ไม่โชว์) */
  count?: number;
}) {
  if (!brandId) return null;
  const b = brands.find((x) => x.id === brandId);
  const name = b?.name ?? b?.label ?? "แบรนด์ที่เลือก";
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-800">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b?.color || "#7c3aed" }} />
      <span>เฉพาะแบรนด์ <b className="font-medium">{name}</b>{count != null ? ` · ${count.toLocaleString()} รายการ` : ""}</span>
      <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-md px-1.5 text-xs text-violet-700 hover:bg-violet-100">
        <Icon value="i:x" />ดูทุกแบรนด์
      </button>
    </div>
  );
}
