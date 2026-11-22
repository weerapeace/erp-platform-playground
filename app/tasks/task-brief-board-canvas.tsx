"use client";

// ============================================================
// ตัวกระดานบรีฟของงาน (โหลดเมื่อกางกระดานเท่านั้น — ไม่ถ่วงลิ้นชักงาน) · ตัวห่อ = TaskBriefBoard (task-reference-board.tsx)
//  • กระดานกลาง CanvasSketch ห้อง creative_task_brief · รูปย่อ 600px (TASK_BOARD_IMAGE_MAX)
//  • ＋ การ์ด Parent SKU / SKU / คอนเทนต์ = ชุดการ์ดกลาง useCardKit (ตัวเลือกกลาง + ดับเบิลคลิกเปิดสินค้า · การ์ดซิงค์สด) — เจ้าของเลือก 2026-11-22
//  • เลือกรูป/ข้อความบนกระดาน → "＋ สร้างคอนเทนต์" → คอนเทนต์ผูกงาน (สถานะร่าง) ขึ้นในรายการคอนเทนต์ของงาน
//    รูปแนบด้วยไฟล์เดิมบน R2 (ไม่อัปซ้ำ) · ข้อความ = ร่างแคปชัน · วางการ์ดคอนเทนต์บนกระดาน (กดเปิดได้ · สถานะซิงค์สด)
//    ของที่ใช้แล้วจำ id คอนเทนต์ไว้ (customData.contentIds) → เลือกซ้ำจะถามก่อนสร้างซ้ำ
// ============================================================
import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { useT } from "@/components/i18n";
import { LoadingState } from "@/components/state-views";
import { askConfirm } from "@/components/modal/ask-dialog";
import { usePushToast } from "@/components/toast";
import { useCardKit } from "@/components/canvas-cards/use-card-kit";
import { ToolMenu } from "@/components/canvas-cards/drawers";
import { TASK_BOARD_IMAGE_MAX, TASK_BRIEF_ENTITY } from "./task-reference-board";
import { loadBriefBoardItems } from "./brief-board-items";

const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <LoadingState label="กำลังโหลดกระดาน..." boxClassName="flex h-[50vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400" />,
});

type El = { id?: string; type?: string; isDeleted?: boolean; fileId?: string; text?: string; originalText?: string; customData?: { kind?: string; contentIds?: string[] } | null };

export default function TaskBriefCanvas({ taskId, brandId = null, taskTitle, height, seedImageUrls }: {
  taskId: string; brandId?: string | null; taskTitle?: string; height: string; seedImageUrls: string[];
}) {
  const t = useT();
  const pushToast = usePushToast();
  const controlsRef = useRef<CanvasSketchControls | null>(null);
  const task = useMemo(() => ({ id: taskId, brandId }), [taskId, brandId]);
  const kit = useCardKit({ sketchRef: controlsRef, task, contextLabel: taskTitle });
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // เติมรูปบรีฟเดิมขึ้นกระดานครั้งแรกครั้งเดียว (กระดานยังไม่เคยบันทึก) + ซิงค์การ์ดสด
  const seedRef = useRef(seedImageUrls); seedRef.current = seedImageUrls;
  const seededRef = useRef(false);
  const kitReady = kit.onBoardReady;
  const onReady = useCallback(() => {
    kitReady();
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
  }, [kitReady]);

  // ของที่เลือก (ไม่นับการ์ดที่ระบบวาง) → นับรูป/ข้อความ
  const picked = useMemo(() => {
    if (!sel.length) return [] as El[];
    const ids = new Set(sel);
    return ((controlsRef.current?.getElements() ?? []) as El[]).filter((e) => e.id && ids.has(e.id) && !e.isDeleted && !e.customData?.kind && (e.type === "image" || e.type === "text"));
  }, [sel]);

  const createFromSelection = async () => {
    if (!picked.length || busy) return;
    const used = [...new Set(picked.flatMap((e) => e.customData?.contentIds ?? []))];
    if (used.length && !(await askConfirm({ title: t(`ของที่เลือกเคยใช้สร้างคอนเทนต์แล้ว ${used.length} ชิ้น — สร้างใหม่อีกอันไหม?`, `Some selected items were already used for ${used.length} content item(s) — create another?`), confirmText: t("สร้างใหม่", "Create new") }))) return;
    setBusy(true);
    try {
      // รูป: ต้องเป็นไฟล์ที่ขึ้น R2 แล้ว (กระดานบันทึกเองอัตโนมัติ) — อ่านจากกระดานที่บันทึกแล้ว แล้วจับคู่ด้วย fileId
      await controlsRef.current?.save().catch(() => undefined);
      const board = await loadBriefBoardItems(taskId);
      const keyByFile = new Map(board.images.map((x) => [x.fileId, x.r2_key]));
      const images = [...new Set(picked.filter((e) => e.type === "image" && e.fileId).map((e) => keyByFile.get(String(e.fileId))).filter((k): k is string => !!k))];
      const notes = picked.filter((e) => e.type === "text").map((e) => String(e.originalText ?? e.text ?? "").trim()).filter((s) => s && !/^https?:\/\//i.test(s));
      const missing = picked.filter((e) => e.type === "image").length - images.length;
      if (missing > 0) pushToast("info", t(`มี ${missing} รูปยังไม่ขึ้นที่เก็บ — ไม่ได้แนบ (รอสักครู่แล้วลองใหม่)`, `${missing} image(s) not stored yet — skipped (try again shortly)`));
      const sourceIds = picked.map((e) => String(e.id));
      kit.openContentFrom({
        title: notes[0]?.split("\n")[0]?.slice(0, 80) || (taskTitle ? `${taskTitle} — ${t("จากบรีฟ", "from brief")}` : ""),
        images, caption: notes.join("\n"), sourceIds,
        // แปะ id คอนเทนต์ไว้บนของที่ใช้แล้ว (กันสร้างซ้ำโดยไม่ตั้งใจ)
        onCreated: (cid) => controlsRef.current?.patchElements((el) => {
          const e = el as El; if (!e.id || !sourceIds.includes(e.id)) return null;
          return { ...el, customData: { ...(e.customData ?? {}), contentIds: [...new Set([...(e.customData?.contentIds ?? []), cid])] } };
        }),
      });
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };

  const k = kit.items;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolMenu label={t("เพิ่มการ์ด", "Add card")} icon="＋" tone="violet" items={[k.parent, k.sku, k.content]} />
        {picked.length > 0 && (
          <button type="button" onClick={() => void createFromSelection()} disabled={busy}
            className="h-9 px-3 inline-flex items-center gap-1 text-sm font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50">
            ＋ {t(`สร้างคอนเทนต์จากที่เลือก (${picked.length})`, `Create content from selection (${picked.length})`)}
          </button>
        )}
        {picked.length === 0 && <span className="text-[11px] text-slate-400">{t("เลือกรูป/ข้อความบนกระดาน → สร้างคอนเทนต์ได้", "Select images/text on the board to create content")}</span>}
      </div>
      <CanvasSketch entityType={TASK_BRIEF_ENTITY} entityId={taskId} height={height} collab compactHelp controlsRef={controlsRef}
        onReady={onReady} onCardOpen={(d) => { kit.onCardOpen(d); }} onSelectionChange={setSel} imageMaxPx={TASK_BOARD_IMAGE_MAX} />
      {kit.ui}
    </div>
  );
}
