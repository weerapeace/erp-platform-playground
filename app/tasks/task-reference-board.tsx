"use client";

// ============================================================
// กระดานของงานในลิ้นชักงาน — ตอนนี้เหลือ "กระดานบรีฟ" ตัวเดียว (TaskBriefBoard ด้านล่าง)
// กระดานอ้างอิง (แท็บ "อ้างอิง" · entity creative_task_ref) เลิกใช้ 2026-11-21 ตามเจ้าของ — ตัวกระดานถูกเอาออกจากโค้ดแล้ว
//   ข้อมูลเดิมในตาราง erp_canvas_sketches ไม่ได้ลบ (ณ วันเลิกใช้มี 1 แผ่นและว่าง) · สิทธิ์ห้องนี้ยังอยู่ที่ /api/canvas-sketch
//   โน้ตอ้างอิง (reference_html) ย้ายไปแก้ใต้รายละเอียดงานในลิ้นชัก
// ============================================================
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { LoadingState } from "@/components/state-views";

// ตัวกระดาน + ชุดการ์ด + สร้างคอนเทนต์จากที่เลือก — โหลดเมื่อกางกระดานเท่านั้น (ไม่ถ่วงลิ้นชักงาน)
const TaskBriefCanvas = dynamic(() => import("./task-brief-board-canvas"), {
  ssr: false,
  loading: () => <LoadingState label="กำลังโหลดกระดาน..." boxClassName="flex h-[50vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400" />,
});

/** รูปที่วางบนกระดานบรีฟของงาน ย่อเหลือด้านยาว 600px (webp) ก่อนเก็บขึ้น R2 — เจ้าของเลือก 2026-11-21 ไม่อยากเปลือง R2 */
export const TASK_BOARD_IMAGE_MAX = 600;
/** ลิงก์หน้าเต็มจอกระดานของงาน (หน้า /tasks/reference/<id> เปิดกระดานบรีฟ) */
export const taskReferenceUrl = (taskId: string) => `/tasks/reference/${encodeURIComponent(taskId)}`;

// ============================================================
// กระดานบรีฟของงาน (แท็บ "งาน" ใต้ "รายละเอียดงาน" — แทนช่องแนบรูปบรีฟเดิม) · เจ้าของเลือก 2026-11-21
//  • กระดานกลาง CanvasSketch ห้องแยก entity_type=creative_task_brief (คนละห้องกับกระดานอ้างอิง)
//  • รูปบรีฟที่แนบไว้แบบเดิม (reference_images) → ย้ายขึ้นกระดานเองตอนเปิดครั้งแรก (กระดานยังไม่เคยบันทึก) ครั้งเดียว
//    ไม่ลบรูปชุดเดิมในฐานข้อมูล (เก็บไว้เป็นสำรอง) · ลบรูปบนกระดานแล้วไม่ถูกเติมกลับ (กระดานบันทึกแล้ว)
//  • พับ/ขยายเองตามของบนกระดาน: ว่าง = พับ · มีของ = ขยาย (2026-11-22) · เปิดเต็มจอ = /tasks/reference/<id>?board=brief
//  • การ์ด Parent/SKU/คอนเทนต์ + สร้างคอนเทนต์จากที่เลือก (2026-11-22) → task-brief-board-canvas.tsx
// ============================================================
export const TASK_BRIEF_ENTITY = "creative_task_brief";
export const taskBriefUrl = (taskId: string) => `${taskReferenceUrl(taskId)}?board=brief`;

export function TaskBriefBoard({ taskId, brandId = null, taskTitle, seedImageUrls = [], height = "50vh", showOpenFull = true, foldable = true }: {
  taskId: string;
  /** แบรนด์ของงาน — คอนเทนต์ที่สร้างจากกระดานใช้แบรนด์นี้ */
  brandId?: string | null;
  /** ชื่องาน (ตั้งชื่อคอนเทนต์ตั้งต้น) */
  taskTitle?: string;
  /** รูปบรีฟเดิม (URL เต็ม) — เติมขึ้นกระดานครั้งแรกครั้งเดียว */
  seedImageUrls?: string[];
  height?: string;
  showOpenFull?: boolean;
  foldable?: boolean;
}) {
  const t = useT();
  const seedRef = useRef(seedImageUrls); seedRef.current = seedImageUrls;
  // พับ/ขยายอัตโนมัติตามของบนกระดาน (เจ้าของสั่ง 2026-11-22): ว่าง = พับ · มีของ = ขยาย · กดสลับเองได้ (เฉพาะตอนเปิดงานนี้อยู่)
  const [folded, setFolded] = useState(foldable);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!foldable) return;
    let live = true; setCount(null); setFolded(true);
    const seeds = seedRef.current.filter(Boolean).length;
    apiFetch(`/api/canvas-sketch?entity_type=${TASK_BRIEF_ENTITY}&entity_id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json()).then((j) => {
        if (!live) return;
        const els = ((j?.data?.scene?.elements ?? []) as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted).length;
        const n = els || (!j?.data ? seeds : 0); // กระดานใหม่ที่มีรูปบรีฟเดิมจะถูกเติมตอนเปิด = นับว่ามีของ
        setCount(n); setFolded(n === 0);
      }).catch(() => { if (live) setCount(null); });
    return () => { live = false; };
  }, [taskId, foldable]);
  const toggleFold = () => setFolded((f) => !f);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">🎨 {t("กระดานบรีฟ", "Brief board")}{foldable && count === 0 && <span className="ml-1 text-slate-300">· {t("ยังว่าง", "empty")}</span>}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {foldable && (
            <button type="button" onClick={toggleFold} className="inline-flex items-center h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50">
              {folded ? `▾ ${t("ขยาย", "Expand")}` : `▴ ${t("พับ", "Collapse")}`}
            </button>
          )}
          {showOpenFull && (
            <Link href={taskBriefUrl(taskId)} target="_blank" className="inline-flex items-center h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50">
              ⛶ {t("เปิดเต็มจอ", "Open full screen")}
            </Link>
          )}
        </span>
      </div>
      {!folded && <TaskBriefCanvas taskId={taskId} brandId={brandId} taskTitle={taskTitle} height={height} seedImageUrls={seedImageUrls} />}
    </div>
  );
}
