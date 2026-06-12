"use client";

/**
 * Master Data v2 — SKUs (Product Variants)
 *
 * URL: /master/skus
 * Field config: /admin/schema-sync (เลือก module: SKUs)
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { SkuWizard } from "./sku-wizard";

// F20: client-only render — กัน Worker 1102 (SSR component หนัก)
const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "skus",
  moduleKey:   "skus-v2",
  tableId:     "master-skus-v2",
  title:       "SKUs",
  description: "Product Variants — 12,609 records (จัดการ field ที่ /admin/schema-sync)",
  icon:        "🏷️",
  activeField: "is_active",
  serverMode:  true,   // F19: server-side pagination (12,609 rows) — กัน Worker 1102
  exportEntityType: "skus_v2",
  permissions: {
    view:   "products.view",
    create: "products.create",
    edit:   "products.edit",
  },
  cellRenderers: {
    code: (v) => {
      const code = String(v ?? "");
      const isDup    = code.includes("_DUP_");
      const isNoSku  = code.startsWith("_NOSKU_");
      const badge = isNoSku ? "bg-red-100 text-red-700"
                  : isDup   ? "bg-amber-100 text-amber-700"
                  :           "bg-slate-100 text-slate-700";
      return (
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${badge}`}
              title={isNoSku ? "ยังไม่มี SKU code" : isDup ? "ซ้ำ — ต้องตรวจสอบ" : undefined}>
          {code}
        </span>
      );
    },
    list_price:     fmtPrice,
    standard_price: fmtPrice,
    fake_price:     fmtPrice,
    rmb_cost:       (v) => {
      const n = v as number | null;
      return n != null && Number(n) > 0
        ? <span className="text-sm tabular-nums text-slate-600">¥{Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span>
        : <span className="text-xs text-slate-300">—</span>;
    },
  },
  // แทนฟอร์มเพิ่มมาตรฐานด้วย Wizard (เพิ่มเดี่ยว/เป็นชุด + ตัวช่วยรหัส) — กันส่งผิด/มั่ว/พลาด
  customCreate: {
    label: "＋ เพิ่ม SKU",
    render: ({ open, onClose, onCreated }) => (
      <SkuWizard open={open} onClose={onClose} onCreated={onCreated} />
    ),
  },
};

function fmtPrice(v: unknown) {
  const n = v as number | null;
  return n != null && Number(n) > 0
    ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
    : <span className="text-xs text-slate-300">—</span>;
}

export default function SkusV2Page() {
  return <MasterCRUDPage config={CONFIG} />;
}
