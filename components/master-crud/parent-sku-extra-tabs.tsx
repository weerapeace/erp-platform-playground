"use client";
/**
 * แท็บพิเศษของ Parent SKU (ของกลาง — ชุดเดียว) — ใช้ทั้งหน้า /master/parent-skus และ MasterRecordDrawer ที่เปิดจากที่อื่น
 *   เดิมสองที่ตั้งไม่เหมือนกัน (หน้า = ภาพรวม/เว็บไซต์ · drawer = เว็บไซต์/แพลตฟอร์ม/ปัญหา) → เปิดคนละที่เห็นคนละแท็บ
 *   และตัวออกแบบหน้า (Studio) ไม่ตรงกับหน้าจริง (เจ้าของบ่น 2026-10-18 "ไม่เห็นตรงกันเลย ไม่มี website")
 * ลำดับ/ซ่อนแท็บเหล่านี้ตั้งได้ในตัวออกแบบหน้า (layout เก็บเป็นแท็บว่าง key "x:<key>") — ไม่ตั้ง = ต่อท้ายแท็บฟิลด์ตามลำดับนี้
 * ตัวเนื้อหาโหลดเฉพาะตอนเปิดแท็บ (dynamic)
 */
import dynamic from "next/dynamic";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import type { MasterCRUDConfig } from "./index";

/**
 * 🖼 ช่องใหญ่ "รูปตัดพื้น (PNG)" ในคอลัมน์ซ้ายของ Parent SKU (ชุดกลาง — หน้า /master/parent-skus + MasterRecordDrawer)
 *   บันทึกผ่าน /api/website/product-png (สิทธิ์ + audit + ล้างแคชเว็บร้าน) — ที่เดียวกับแผง PNG ในตัวจัดหน้า (การ์ดบนฉาก)
 */
export function parentSkuPngSlots(): NonNullable<MasterCRUDConfig["sidePngSlots"]> {
  return [
    {
      field: "png_image_r2_key",
      label: tr("รูปตัดพื้น (PNG)", "Cut-out image (PNG)"),
      hint: tr("พื้นใส · ใช้กับการ์ดบนฉากของเว็บร้าน (ไม่มี = สินค้านี้ไม่โชว์ใน Section นั้น)", "Transparent background · used by the website scene cards (none = not shown there)"),
      save: async (parentId, key) => {
        const res = await apiFetch("/api/website/product-png", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId, key }),
        });
        const j = await res.json().catch(() => ({}));
        return !res.ok || j.error ? j.error || tr(`บันทึกไม่สำเร็จ (${res.status})`, `Save failed (${res.status})`) : null;
      },
    },
  ];
}

const Parent360Overview = dynamic(() => import("@/components/parent-360-overview").then((m) => m.Parent360Overview), { ssr: false });
const ParentWebListings = dynamic(() => import("@/components/parent-web-listings").then((m) => m.ParentWebListings), { ssr: false });
const ParentPlatformsTab = dynamic(() => import("@/components/parent-platforms-tab").then((m) => m.ParentPlatformsTab), { ssr: false });
const ParentIssuesPanel = dynamic(() => import("@/components/parent-issues-panel").then((m) => m.ParentIssuesPanel), { ssr: false });

export function parentSkuExtraTabs(): NonNullable<MasterCRUDConfig["extraTabs"]> {
  return [
    { key: "overview", label: tr("ภาพรวม", "Overview"), icon: "📊", render: ({ recordId }) => <Parent360Overview parentId={recordId} /> },
    { key: "web", label: tr("เว็บไซต์", "Website"), icon: "🛍", render: ({ recordId }) => <ParentWebListings parentId={recordId} /> },
    { key: "platforms", label: tr("แพลตฟอร์ม", "Platforms"), icon: "🏬", render: ({ recordId }) => <ParentPlatformsTab parentId={recordId} /> },
    { key: "issues", label: tr("ปัญหา", "Issues"), icon: "⚠️", render: ({ recordId }) => <div className="p-3"><ParentIssuesPanel parentSkuId={recordId} editable bare /></div> },
  ];
}
