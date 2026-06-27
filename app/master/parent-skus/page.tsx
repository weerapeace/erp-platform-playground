"use client";

/**
 * Master Data v2 — Parent SKUs (Product Templates)
 *
 * URL: /master/parent-skus
 *
 * F20: client-only render (ssr: false) — Worker ไม่ต้อง SSR component หนัก
 * → กัน Error 1102 (Worker exceeded resource limits ตอน render)
 * → Worker ส่ง HTML เปล่า + JS ไป render ที่ browser
 *
 * ⭐ ใช้ Field Registry แบบ dynamic — field config จาก /admin/schema-sync
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { useAuth } from "@/components/auth";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);
const ProductPlatformManager = dynamic(
  () => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager),
  { ssr: false },
);
const ParentDescriptionImages = dynamic(
  () => import("@/components/parent-description-images").then((m) => m.ParentDescriptionImages),
  { ssr: false },
);

const FAMILY_LABEL: Record<string, string> = {
  general: "🏷️ ทั่วไป",
  bag:     "👜 กระเป๋า",
  belt:    "🎀 เข็มขัด",
  jewelry: "💎 จิวเวลรี",
  spare:   "🔧 อะไหล่",
};

function fmtPrice(v: unknown) {
  const n = v as number | null;
  return n != null && Number(n) > 0
    ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
    : <span className="text-xs text-slate-300">—</span>;
}

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "parent-skus",
  moduleKey:   "parent-skus-v2",
  tableId:     "master-parent-skus-v2",
  title:       "Parent SKUs",
  description: "Product Templates — จัดการ visible/filter/search/required ที่ /admin/schema-sync",
  icon:        "📦",
  activeField: "is_active",
  // server mode — โหลดทีละหน้า (smooth + กัน 1102) เหมือนหน้า SKU; card view เปิดได้ใน server mode แล้ว
  serverMode:  true,
  pageLimit:   200,
  exportEntityType: "parent_skus_v2",
  mediaGallery: {
    entityType: "parent_skus_v2",
    title: "รูปสินค้า",
    description: "รูปหลักโชว์ใหญ่ด้านบน · กด ⭐ ตั้งเป็นรูปหลัก · เพิ่มได้สูงสุด 9 รูป",
    maxItems: 9,
    maxSizeBytes: 2 * 1024 * 1024,
    imageOnly: true,
    layout: "gallery",   // รูปหลักใหญ่บน + รูปย่อยล่าง (แบบ Design Sheet) ตามที่เจ้าของขอ
  },
  permissions: {
    view:   "products.view",
    create: "products.create",
    edit:   "products.edit",
  },
  cellRenderers: {
    product_family: (v) => {
      const s = (v as string) ?? "general";
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
          {FAMILY_LABEL[s] ?? s}
        </span>
      );
    },
    code: (v) => {
      const code = String(v ?? "");
      const isDup = code.includes("_DUP_");
      return (
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isDup ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}
              title={isDup ? "ซ้ำ — ต้องตรวจสอบ" : undefined}>
          {code}
        </span>
      );
    },
    sale_price:  fmtPrice,
    final_price: fmtPrice,
    fake_price:  fmtPrice,
  },
};

export default function ParentSKUsV2Page() {
  const { can, user } = useAuth();
  const [mgrId, setMgrId] = useState<string | null>(null);
  const actor = user?.name ?? user?.email ?? undefined;
  // เพิ่ม row action "ลงขายหลายแพลตฟอร์ม" + ช่อง "รูป Description" ในฟอร์ม — config สร้างใน component เพื่อ setState/actor
  const config = useMemo<MasterCRUDConfig>(() => ({
    ...CONFIG,
    extraRowActions: [
      ...(CONFIG.extraRowActions ?? []),
      { label: "ลงขายหลายแพลตฟอร์ม", icon: "🏬", onClick: (row) => setMgrId(String(row.id)) },
    ],
    // section พิเศษในฟอร์ม: รูป Description (มีลำดับ) → โฟลเดอร์ Description ในมุมมอง "ดูตามแบรนด์"
    extraFormSection: ({ recordId, readonly }) => (
      <ParentDescriptionImages parentId={recordId} readonly={readonly} actor={actor} />
    ),
  }), [actor]);
  return (
    <>
      <MasterCRUDPage config={config} />
      {mgrId && <ProductPlatformManager parentSkuId={mgrId} onClose={() => setMgrId(null)} canEdit={can("products.platforms.edit")} canPublish={can("products.platforms.publish")} />}
    </>
  );
}
