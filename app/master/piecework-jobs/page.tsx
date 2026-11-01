"use client";

/**
 * ผลิต → จัดการงานเหมา (/master/piecework-jobs) — ทะเบียนงานเหมากลาง · เนื้อหาอยู่ที่ ./view.tsx
 * สิทธิ์: ดู = products.view · แก้ = production.piecework
 */
import { usePermission } from "@/components/auth";
import { PieceworkJobsView } from "./view";

export default function PieceworkJobsPage() {
  return <PieceworkJobsView canView={usePermission("products.view")} canEdit={usePermission("production.piecework")} />;
}
