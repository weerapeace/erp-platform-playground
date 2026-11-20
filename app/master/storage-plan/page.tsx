"use client";

/**
 * แผนผังการเก็บไฟล์ (วาดเอง แบบ flowchart) — ไว้วางแผน/จดว่าไฟล์แบบไหนเก็บที่ไหน ตั้งชื่ออย่างไร แบ่งโฟลเดอร์แบบไหน
 * ⚠️ ระบบไม่ได้อ่านแผนผังนี้ไปใช้ — กฎที่ระบบใช้จริง (ช่องอัปส่งไฟล์ไป R2/Supabase/Drive) อยู่หน้า /master/storage-rules
 *
 * ใช้ของกลาง: FlowchartBoard (components/flowchart-board · React Flow) — entity_type=storage_plan_flow, entity_id=main (แผนผังเดียวทั้งบริษัท)
 *   (เดิม 2026-11-08 เช้าเป็นกระดาน Excalidraw entity storage_plan — เจ้าของขอเปลี่ยนเป็น flowchart · ข้อมูลเดิมเป็นแค่แม่แบบที่วางอัตโนมัติ ไม่ได้ย้าย)
 * สิทธิ์ (ฝั่ง server ใน /api/canvas-sketch): ดู = assets.view · แก้ = assets.manage · ใครแก้ไม่ได้ เป็นดูอย่างเดียวเอง
 * ทางเข้า: ปุ่ม "แผนผังการเก็บไฟล์" บนแถบพื้นที่ของคลังไฟล์กลาง + หัวหน้ากฎที่เก็บไฟล์
 */
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { STORAGE_PLAN_ENTITY, storagePlanStarter } from "@/lib/storage-plan-starter";

// โหลดกระดานเฉพาะตอนเปิดหน้านี้ (ไม่ถ่วงหน้าอื่น)
const FlowchartBoard = dynamic(() => import("@/components/flowchart-board").then((m) => m.FlowchartBoard), {
  ssr: false,
  loading: () => <LoadingState className="h-[60vh] rounded-xl border border-slate-200 text-sm" />,
});

export default function StoragePlanPage() {
  const t = useT();
  const [canEdit, setCanEdit] = useState(false);   // จาก server — ซ่อนปุ่มสลับโหมดสำหรับคนดูอย่างเดียว
  const [editing, setEditing] = useState(true);    // "ดูอย่างเดียว" กันเผลอลาก/ลบ

  const btn = "inline-flex items-center gap-1 h-9 px-3 text-[13px] border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/master/assets" className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700 hover:underline">← {t("คลังไฟล์กลาง", "File library")}</Link>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Icon value="i:sitemap" />{t("แผนผังการเก็บไฟล์", "File storage plan")}</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {t("ผังแบบ flowchart ไว้วางแผนว่าไฟล์แบบไหนเก็บที่ไหน · บันทึกอัตโนมัติ · ระบบไม่ได้อ่านแผนผังนี้ไปใช้ (กฎที่ระบบใช้จริงอยู่หน้า \"กฎที่เก็บไฟล์\")",
              "A flowchart to plan where each kind of file lives · saves automatically · the system doesn't read this chart (the rules it really uses are on \"Storage rules\")")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <div className="inline-flex h-9 overflow-hidden rounded-lg border border-slate-200 text-[13px]">
              <button onClick={() => setEditing(false)} className={`px-3 ${!editing ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="lock" /> {t("ดูอย่างเดียว", "View only")}</button>
              <button onClick={() => setEditing(true)} className={`px-3 border-l border-slate-200 ${editing ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="edit" /> {t("แก้ไข", "Edit")}</button>
            </div>
          )}
          <Link href="/master/storage-rules" className={btn}><Icon value="i:database" />{t("กฎที่เก็บไฟล์", "Storage rules")} →</Link>
        </div>
      </div>

      <FlowchartBoard entityType={STORAGE_PLAN_ENTITY.type} entityId={STORAGE_PLAN_ENTITY.id} editable={editing} height="calc(100vh - 170px)"
        starter={storagePlanStarter} fileName={t("แผนผังการเก็บไฟล์", "File storage plan")} onCanEdit={setCanEdit} />
    </div>
  );
}
