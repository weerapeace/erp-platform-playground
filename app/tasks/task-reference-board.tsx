"use client";

// ============================================================
// กระดานอ้างอิงของงาน (แท็บ "อ้างอิง" ในลิ้นชักงาน + หน้าเต็มจอ /tasks/reference/<id>)
//  • ใช้กระดานวาดของกลาง CanvasSketch (entity_type=creative_task_ref · entity_id=id งาน) — ไม่สร้างกระดานตัวที่ 2
//  • ไฟล์เบา: รูปที่วางกระดานย้ายขึ้น R2 เองแล้วเก็บเป็นลิงก์ (ไม่ฝัง base64) · ลิงก์ Pinterest/TikTok เล่นในกระดาน
//  • หลายคนเปิดพร้อมกันได้ (collab) · Ctrl+Z ย้อนได้ · ลบชิ้นบนกระดานได้ · ทุกการบันทึกลง audit (canvas_update)
//  • แท็บย่อย "โน้ต" = โน้ตอ้างอิงแบบเดิม (reference_html) — ส่งเข้ามาเป็น children
// เจ้าของขอ 2026-11-21
// ============================================================
import { useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { LoadingState } from "@/components/state-views";

const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <LoadingState label="กำลังโหลดกระดาน..." boxClassName="flex h-[50vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400" />,
});

/** ชนิดกระดานในตาราง erp_canvas_sketches (สิทธิ์ = tasks.view / tasks.edit ที่ /api/canvas-sketch) */
export const TASK_REF_ENTITY = "creative_task_ref";
/** ลิงก์หน้าเต็มจอของกระดานอ้างอิงงาน — ใช้จากที่อื่น (Parent SKU · การ์ดงาน) */
export const taskReferenceUrl = (taskId: string) => `/tasks/reference/${encodeURIComponent(taskId)}`;

export function TaskReferenceBoard({ taskId, notes, hasNotes, height = "60vh", showOpenFull = true }: {
  taskId: string;
  /** แท็บย่อย "โน้ต" (ตัวแก้โน้ตเดิม) — ไม่ส่ง = มีแต่กระดาน */
  notes?: ReactNode;
  /** มีโน้ตเดิมอยู่ไหม (โชว์จุดบอกบนแท็บโน้ต) */
  hasNotes?: boolean;
  height?: string;
  showOpenFull?: boolean;
}) {
  const t = useT();
  const [sub, setSub] = useState<"board" | "notes">("board");
  const tabCls = (on: boolean) => `h-7 px-3 text-xs font-medium ${on ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-50"}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {notes && (
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            <button type="button" onClick={() => setSub("board")} className={tabCls(sub === "board")}>🎨 {t("กระดาน", "Board")}</button>
            <button type="button" onClick={() => setSub("notes")} className={tabCls(sub === "notes")}>
              📝 {t("โน้ต", "Notes")}{hasNotes && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 align-middle" />}
            </button>
          </div>
        )}
        {sub === "board" && <span className="text-[11px] text-slate-400">{t("วางรูป (Ctrl+V) · ลิงก์ Pinterest/TikTok · โน้ต — รูปย่อและเก็บแยกให้อัตโนมัติ กระดานไม่หนัก", "Paste images, Pinterest/TikTok links, notes — images are stored separately so the board stays light")}</span>}
        {showOpenFull && (
          <Link href={taskReferenceUrl(taskId)} target="_blank" className="ml-auto inline-flex items-center h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50">
            ⛶ {t("เปิดเต็มจอ", "Open full screen")}
          </Link>
        )}
      </div>
      {sub === "board"
        ? <CanvasSketch entityType={TASK_REF_ENTITY} entityId={taskId} height={height} collab />
        : notes}
    </div>
  );
}
