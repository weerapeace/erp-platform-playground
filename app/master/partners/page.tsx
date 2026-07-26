"use client";

/**
 * Master Data v2 — Partners (Customers + Suppliers)
 *
 * URL: /master/partners
 * หน้าเฉพาะทาง (PartnerManager) — list + drawer ดู/แก้ไข · ต่อ API กลาง master-v2/partners (partners_v2)
 * ฟิลด์: จัดการที่ /admin/schema-sync (module: Partners)
 */

import dynamic from "next/dynamic";

// client-only — กัน SSR component หนัก (มี drawer + portal)
const PartnerManager = dynamic(
  () => import("@/components/partner-manager").then((m) => m.PartnerManager),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

export default function PartnersV2Page() {
  return <PartnerManager />;
}
