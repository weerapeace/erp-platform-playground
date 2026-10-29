"use client";

/**
 * 👜 /admin/product-configurator — หลังบ้าน "ตัวประกอบสินค้า" (ลูกค้าออกแบบสินค้าเองบนเว็บร้าน)
 *   ?shop=<id>  = ร้านที่เลือก (ค่าเริ่มต้น ig-international หรือร้านแรก)
 *   ?model=<id> = ทรงที่เปิดอยู่
 * หน้าจอ: components/product-configurator/studio.tsx · API: /api/configurator/* (configurator.view/edit + audit)
 * เอกสาร: docs/product-configurator.md
 */
import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfiguratorStudio } from "@/components/product-configurator/studio";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const onRoute = useCallback((shopId: string, modelId: string | null) => {
    const q = new URLSearchParams();
    q.set("shop", shopId);
    if (modelId) q.set("model", modelId);
    const next = `/admin/product-configurator?${q}`;
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== next) router.replace(next, { scroll: false });
  }, [router]);
  return <ConfiguratorStudio shopId={sp.get("shop") ?? undefined} modelId={sp.get("model") ?? undefined} onRoute={onRoute} />;
}

export default function ProductConfiguratorPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">กำลังโหลด…</div>}>
      <Inner />
    </Suspense>
  );
}
