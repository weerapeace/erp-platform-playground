"use client";

// ============================================================
// กระดานของงานในลิ้นชักงาน — ตอนนี้เหลือ "กระดานบรีฟ" ตัวเดียว (TaskBriefBoard ด้านล่าง)
// กระดานอ้างอิง (แท็บ "อ้างอิง" · entity creative_task_ref) เลิกใช้ 2026-11-21 ตามเจ้าของ — ตัวกระดานถูกเอาออกจากโค้ดแล้ว
//   ข้อมูลเดิมในตาราง erp_canvas_sketches ไม่ได้ลบ (ณ วันเลิกใช้มี 1 แผ่นและว่าง) · สิทธิ์ห้องนี้ยังอยู่ที่ /api/canvas-sketch
//   โน้ตอ้างอิง (reference_html) ย้ายไปแก้ใต้รายละเอียดงานในลิ้นชัก
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { LoadingState } from "@/components/state-views";

const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
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
//  • ค่าเริ่มต้นพับซ่อน · กดขยายแล้วจำค่าต่อเครื่อง · เปิดเต็มจอ = /tasks/reference/<id>?board=brief
// ============================================================
export const TASK_BRIEF_ENTITY = "creative_task_brief";
export const taskBriefUrl = (taskId: string) => `${taskReferenceUrl(taskId)}?board=brief`;
const BRIEF_FOLD_KEY = "task-brief-board-folded";

export function TaskBriefBoard({ taskId, seedImageUrls = [], height = "50vh", showOpenFull = true, foldable = true }: {
  taskId: string;
  /** รูปบรีฟเดิม (URL เต็ม) — เติมขึ้นกระดานครั้งแรกครั้งเดียว */
  seedImageUrls?: string[];
  height?: string;
  showOpenFull?: boolean;
  foldable?: boolean;
}) {
  const t = useT();
  const [folded, setFolded] = useState(foldable); // ค่าเริ่มต้น = พับซ่อน (เจ้าของสั่ง 2026-11-21) · กดขยายแล้วจำค่าต่อเครื่อง
  useEffect(() => { if (!foldable) return; try { setFolded(localStorage.getItem(BRIEF_FOLD_KEY) !== "0"); } catch { /* ไม่มี storage = พับไว้ */ } }, [foldable]);
  const toggleFold = () => setFolded((f) => { const n = !f; try { localStorage.setItem(BRIEF_FOLD_KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const controlsRef = useRef<CanvasSketchControls | null>(null);
  const seedRef = useRef(seedImageUrls); seedRef.current = seedImageUrls;
  const seededRef = useRef(false);
  const onReady = useCallback(() => {
    const c = controlsRef.current; const urls = seedRef.current.filter(Boolean);
    if (!c || seededRef.current || !urls.length || !c.isNewBoard() || c.getElements().length > 0) return;
    seededRef.current = true;
    // วางเรียงแถวละ 4 รูป กรอบ 220×220 (คงสัดส่วนรูปจริง)
    const BOX = 220, GAP = 24, PER = 4;
    const cols = Math.min(PER, urls.length);
    const ox = -((cols * BOX + (cols - 1) * GAP) / 2), oy = -BOX / 2;
    void c.insert(urls.map((u, i) => ({
      type: "image", _imageUrl: u, width: BOX, height: BOX,
      x: ox + (i % PER) * (BOX + GAP), y: oy + Math.floor(i / PER) * (BOX + GAP),
    })));
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">🎨 {t("กระดานบรีฟ", "Brief board")}</span>
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
      {!folded && <CanvasSketch entityType={TASK_BRIEF_ENTITY} entityId={taskId} height={height} collab compactHelp controlsRef={controlsRef} onReady={onReady} imageMaxPx={TASK_BOARD_IMAGE_MAX} />}
    </div>
  );
}
