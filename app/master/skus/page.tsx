"use client";

/**
 * Master Data v2 — SKUs (Product Variants)
 *
 * URL: /master/skus  · 3 แท็บ: ตาราง / เลือกดูตามแท็ก (drill-down) / Tags Manager
 * Field config: /admin/schema-sync (เลือก module: SKUs)
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { useToast } from "@/components/toast";
import { useT, LangToggle } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { SkuWizard } from "./sku-wizard";
import { SkuSupplierList } from "@/components/sku-supplier-list";
import { SkuTaobaoSource } from "@/components/sku-taobao-source";
import { BomWhereUsed } from "@/components/bom-where-used";

// F20: client-only render — กัน Worker 1102 (SSR component หนัก)
const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);
const SkuTagBrowser = dynamic(
  () => import("@/components/sku-tag-browser").then((m) => m.SkuTagBrowser),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);
const TagsManagerPage = dynamic(
  () => import("@/app/master/tags-manager/page"),
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
  // รูปสินค้า SKU — แกลเลอรี (รูปหลักใหญ่ + รูปย่อย + อัป ≤9) แบบเดียวกับ Parent → ไปโผล่ใน album
  mediaGallery: {
    entityType: "skus_v2",
    title: "รูปสินค้า",
    description: "รูปหลักโชว์ใหญ่ · กด ⭐ ตั้งรูปหลัก · ลากเรียงลำดับ · เพิ่มได้สูงสุด 9 รูป",
    maxItems: 9,
    maxSizeBytes: 2 * 1024 * 1024,
    imageOnly: true,
    layout: "gallery",
  },
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

const TABS = [
  { key: "table",  th: "📋 ตาราง SKU",      en: "📋 SKU table" },
  { key: "browse", th: "🗂️ เลือกดูตามแท็ก", en: "🗂️ Browse by tag" },
  { key: "tags",   th: "🏷️ Tags Manager",   en: "🏷️ Tags Manager" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function SkusV2Page() {
  const toast = useToast();
  const tr = useT();
  const [tab, setTab] = useState<TabKey>("browse");   // เปิดมาเจอ "เลือกดูตามแท็ก" ก่อน (ตามที่เจ้าของขอ)

  // เพิ่มปุ่ม "คัดลอก" รายแถว — ก๊อปทุกฟิลด์ไปเป็น SKU ใหม่ + (copy) ท้ายชื่อ + รหัสใหม่
  const config = useMemo<MasterCRUDConfig>(() => ({
    ...CONFIG,
    extraRowActions: [{
      label: tr("คัดลอก", "Duplicate"), icon: "⧉",
      onClick: async (row) => {
        try {
          const res = await apiFetch("/api/skus/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || j.error) throw new Error(j.error ?? "คัดลอกไม่สำเร็จ");
          toast.success(`คัดลอกเป็น ${j.code} แล้ว — แก้ไขรายละเอียดได้`);
        } catch (e) { toast.error(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ"); }
      },
    }],
    // ตารางร้านที่จำหน่าย (1 สินค้าหลายร้าน) — เป็น "แท็บ" ในป๊อป SKU: รหัสร้าน/ราคา/ตั้งร้านหลัก ★
    extraTabs: [{
      key: "suppliers", label: "ร้านที่จำหน่าย + ราคาซื้อ", icon: "🏪", inTab: "tab_ราคา",
      render: ({ recordId }) => recordId
        ? <div className="pt-1 space-y-3"><SkuSupplierList skuId={recordId} defaultOpen /><SkuTaobaoSource skuId={recordId} /></div>
        : <div className="p-3 text-sm text-slate-400">บันทึกสินค้าก่อน แล้วค่อยเพิ่มร้านที่จำหน่าย</div>,
    }, {
      // ย้อน BOM: ของชิ้นนี้ถูกใช้ในสูตรของสินค้าตัวไหนบ้าง (แปะท้ายแท็บ BOM)
      key: "bom_where_used", label: "ใช้ในสูตรของสินค้าอื่น", icon: "🔎", inTab: "bom",
      render: ({ recordId }) => recordId ? <div className="pt-1"><BomWhereUsed skuId={recordId} /></div> : null,
    }],
  }), [toast, tr]);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 pt-2">
        {TABS.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-3.5 py-2 text-sm border-b-2 -mb-px transition ${tab === tb.key
              ? "border-indigo-500 text-indigo-700 font-medium"
              : "border-transparent text-slate-500 hover:text-slate-700"}`}>{tr(tb.th, tb.en)}</button>
        ))}
        <div className="ml-auto pb-1"><LangToggle /></div>
      </div>

      {tab === "table"  && <MasterCRUDPage config={config} />}
      {tab === "browse" && <div className="max-w-[1200px] mx-auto px-5 py-5"><SkuTagBrowser /></div>}
      {tab === "tags"   && <TagsManagerPage />}
    </div>
  );
}
