"use client";
/**
 * สีในระบบของสินค้าบนร้านที่จับคู่แล้ว — แท็บ "ตัวเลือก & ราคา" ในลิ้นชักสินค้าบนร้าน (ของกลาง · ทุกร้าน · 2026-11-24)
 * GET /api/platform-catalog/drift?listing_id=&part=variants (ตัวประกอบข้อมูลเดียวกับตัวช่วยลงสินค้า) · จำไว้ต่อรายการระหว่างเปิดหน้า
 * ใช้คู่กับ lib/listing-option-sync (หาสีที่ยังไม่อยู่บนร้าน · ชื่อตามระบบ · รหัส/ราคาต่อไซซ์)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SysVariantView, SysVariantsResponse } from "@/lib/listing-option-sync";

const cache = new Map<string, SysVariantView[]>();

export function useSysVariants(listingId: string | null, enabled: boolean): { variants: SysVariantView[] | null; loading: boolean; error: string | null; reload: () => void } {
  const [variants, setVariants] = useState<SysVariantView[] | null>(listingId ? cache.get(listingId) ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!listingId || !enabled) { setVariants(null); return; }
    const hit = cache.get(listingId);
    if (hit && n === 0) { setVariants(hit); setError(null); return; }
    let alive = true;
    setLoading(true); setError(null);
    apiFetch(`/api/platform-catalog/drift?listing_id=${encodeURIComponent(listingId)}&part=variants`)
      .then((r) => r.json().catch(() => ({ variants: null, platform_code: null, error: `HTTP ${r.status}` })) as Promise<SysVariantsResponse>)
      .then((j) => {
        if (!alive) return;
        if (j.variants) { cache.set(listingId, j.variants); setVariants(j.variants); } else { setVariants(null); setError(j.error ?? "โหลดสีในระบบไม่สำเร็จ"); }
      })
      .catch(() => { if (alive) setError("โหลดสีในระบบไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [listingId, enabled, n]);
  const reload = useCallback(() => { if (listingId) cache.delete(listingId); setN((x) => x + 1); }, [listingId]);
  return { variants, loading, error, reload };
}
