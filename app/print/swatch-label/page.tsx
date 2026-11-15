"use client";

/**
 * พิมพ์ป้ายแผงผ้า + QR — /print/swatch-label?ids=<id,id>&size=big|small
 * (จากหน้าดูแผ่น ปุ่ม "พิมพ์ป้าย" · รายการแผ่น โหมดเลือกหลายแผ่น) — ตัวทำงานอยู่ในของกลาง components/sku-swatch-browser/print-label.tsx
 */
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SwatchLabelPrint } from "@/components/sku-swatch-browser/print-label";

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ids = (sp.get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  return <SwatchLabelPrint ids={ids} size={sp.get("size") === "small" ? "small" : "big"} onBack={() => router.back()} />;
}

export default function SwatchLabelPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
