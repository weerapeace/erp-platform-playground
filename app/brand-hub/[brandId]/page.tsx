"use client";
/**
 * หน้าจัดการแบรนด์ (/brand-hub/<brandId>) — รวมทุกอย่างของแบรนด์เดียวไว้ที่เดียว
 * เข้าจากหน้าเลือกแบรนด์ (/brand-hub · carousel) · จำแบรนด์ล่าสุด · สลับแบรนด์ได้จากหัวหน้า
 * ข้อมูล: /api/brand-hub?brand_id= (ตัวเลขจริง) · แสดงผล: components/brand-hub/hub-view
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/state-views";
import type { BrandSelectOption } from "@/components/brand-select";
import { BrandHubView } from "@/components/brand-hub/hub-view";
import { HUB_LAST_BRAND_KEY, type HubDetail, type HubDetailResponse } from "@/lib/brand-hub";

export default function BrandHubPage() {
  const router = useRouter();
  const params = useParams<{ brandId: string }>();
  const brandId = decodeURIComponent(String(params?.brandId ?? ""));
  const [data, setData] = useState<HubDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [reload, setReload] = useState(0);

  // รายชื่อแบรนด์สำหรับช่องสลับแบรนด์ (ไม่รวมแบรนด์งานลูกค้า — ไม่ขายบนร้านเรา)
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json())
      .then((j: { data?: { id: string; name: string; is_customer_job?: boolean | null }[] }) =>
        setBrands((j.data ?? []).filter((b) => !b.is_customer_job).map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => { /* สลับแบรนด์ไม่ได้ก็ยังใช้หน้านี้ได้ */ });
  }, []);

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    setError(null); setNotFound(false); setData(null);
    apiFetch(`/api/brand-hub?brand_id=${encodeURIComponent(brandId)}`)
      .then(async (r) => ({ status: r.status, j: (await r.json().catch(() => ({ brand: null, error: "ระบบตอบผิดพลาด" }))) as HubDetailResponse }))
      .then(({ status, j }) => {
        if (!alive) return;
        if (status === 404 || (!j.brand && !j.error)) { setNotFound(true); return; }
        if (j.error || !j.brand) { setError(j.error ?? "โหลดข้อมูลแบรนด์ไม่สำเร็จ"); return; }
        setData(j.brand);
        try { localStorage.setItem(HUB_LAST_BRAND_KEY, j.brand.id); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
      })
      .catch(() => { if (alive) setError("โหลดข้อมูลแบรนด์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { alive = false; };
  }, [brandId, reload]);

  const onSwitch = useCallback((id: string) => router.push(`/brand-hub/${encodeURIComponent(id)}`), [router]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      {notFound ? (
        <ErrorState title="ไม่พบแบรนด์นี้" hint="แบรนด์อาจถูกปิดใช้งานแล้ว — เลือกแบรนด์ใหม่"
          onRetry={() => { try { localStorage.removeItem(HUB_LAST_BRAND_KEY); } catch { /* ไม่เป็นไร */ } router.push("/brand-hub?pick=1"); }} />
      ) : error ? (
        <ErrorState title="โหลดข้อมูลแบรนด์ไม่สำเร็จ" hint={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !data ? (
        <LoadingState label="กำลังรวบรวมข้อมูลแบรนด์…" />
      ) : (
        <BrandHubView data={data} brands={brands} onSwitch={onSwitch} />
      )}
    </div>
  );
}
