"use client";

/**
 * แผนผังการเก็บไฟล์ (วาดเอง) — กระดานเปล่าไว้วางแผน/จดว่าไฟล์แบบไหนเก็บที่ไหน ตั้งชื่ออย่างไร แบ่งโฟลเดอร์แบบไหน
 * ⚠️ ระบบไม่ได้อ่านกระดานนี้ไปใช้ — กฎที่ระบบใช้จริง (ช่องอัปส่งไฟล์ไป R2/Supabase/Drive) อยู่หน้า /master/storage-rules
 *
 * ใช้ของกลาง:
 *   CanvasSketch (components/canvas-sketch) — กระดานวาด Excalidraw + บันทึกอัตโนมัติ · entity_type=storage_plan, entity_id=main (กระดานเดียวทั้งบริษัท)
 *   FolderCardModal / openCanvasFolder (components/canvas-sketch/folder-card) — การ์ดโฟลเดอร์ ดับเบิลคลิกเปิด File Explorer
 * สิทธิ์ (ฝั่ง server ใน /api/canvas-sketch): ดู = assets.view · แก้ = assets.manage · ใครแก้ไม่ได้ กระดานเป็นโหมดดูอย่างเดียวเอง
 * ทางเข้า: ปุ่ม "แผนผังการเก็บไฟล์" บนแถบพื้นที่ของคลังไฟล์กลาง + หน้ากฎที่เก็บไฟล์
 */
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { usePushToast } from "@/components/toast";
import { LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { FolderCardModal, openCanvasFolder } from "@/components/canvas-sketch/folder-card";

const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <LoadingState className="h-[60vh] rounded-xl border border-slate-200 text-sm" />,
});

const ENTITY_TYPE = "storage_plan";
const ENTITY_ID = "main";

/** แม่แบบเริ่มต้น (วางให้ตอนกระดานยังว่าง / กดปุ่มวางเพิ่มได้) — ลบ ย้าย แก้ได้ทั้งหมด
 *  ตำแหน่งนับจากกลางจอ (insert() ของ CanvasSketch เลื่อนไปกลางจอให้) · id สุ่มต่อครั้ง กันชนกันถ้าวางซ้ำ */
function starterSkeleton(t: (th: string, en: string) => string): Record<string, unknown>[] {
  const k = Math.random().toString(36).slice(2, 8);
  const id = (s: string) => `sp-${s}-${k}`;
  const box = (key: string, x: number, y: number, w: number, h: number, text: string, stroke: string, bg: string): Record<string, unknown> => ({
    id: id(key), type: "rectangle", x, y, width: w, height: h, strokeColor: stroke, backgroundColor: bg, fillStyle: "solid",
    roundness: { type: 3 }, strokeWidth: 2, label: { text, fontSize: 18, strokeColor: "#1e293b" },
  });
  const arrow = (from: string, to: string, x: number, y: number): Record<string, unknown> => ({
    type: "arrow", x, y, strokeColor: "#64748b", strokeWidth: 2, start: { id: id(from) }, end: { id: id(to) },
  });
  return [
    { type: "frame", children: [], name: t("แผนผังการเก็บไฟล์ · แม่แบบเริ่มต้น (แก้ได้ทั้งหมด)", "File storage plan · starter (edit freely)"), x: -640, y: -340, width: 1280, height: 680 },
    box("in", -600, -45, 210, 90, t("ไฟล์ใหม่เข้าระบบ", "New file comes in"), "#475569", "#f8fafc"),
    box("r2", -230, -290, 380, 130, t("R2\nรูปที่โชว์บนจอบ่อย\nรูปสินค้า · รูปเว็บ · รูปบนกระดาน", "R2\nImages shown on screen often\nproduct · website · board images"), "#7c3aed", "#f5f3ff"),
    box("sb", -230, -65, 380, 130, t("Supabase\nเอกสารลับ / ผูกสิทธิ์\nบิล · สัญญา · เอกสารพนักงาน", "Supabase\nPrivate / permission-bound files\nbills · contracts · HR documents"), "#059669", "#ecfdf5"),
    box("gd", -230, 160, 380, 130, t("Google Drive\nไฟล์ที่คนเปิดแก้ในโปรแกรม\nงานพิมพ์ · AI / PSD · ไฟล์ทำงาน", "Google Drive\nFiles people open and edit\nprint files · AI / PSD · working files"), "#2563eb", "#eff6ff"),
    arrow("in", "r2", -390, 0),
    arrow("in", "sb", -390, 0),
    arrow("in", "gd", -390, 0),
    box("note", 230, -290, 370, 190, t("โน้ตของคุณ\nเขียนกฎตั้งชื่อไฟล์ · โครงโฟลเดอร์\nใครรับผิดชอบ ได้ที่นี่", "Your notes\nfile naming rules · folder structure\nwho is responsible"), "#d97706", "#fffbeb"),
    box("tip", 230, -60, 370, 150, t("ทิป\nปุ่ม \"การ์ดโฟลเดอร์\" ด้านบน\n= วางทางลัด ดับเบิลคลิกเปิดโฟลเดอร์", "Tip\nUse the \"Folder card\" button above\nfor shortcuts that open a folder"), "#0891b2", "#ecfeff"),
  ];
}

export default function StoragePlanPage() {
  const t = useT();
  const pushToast = usePushToast();
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const seededRef = useRef(false);
  const [canEdit, setCanEdit] = useState(false);   // จาก server (can_edit) — ซ่อนปุ่มแก้สำหรับคนดูอย่างเดียว
  const [editing, setEditing] = useState(true);    // สลับ "ดูอย่างเดียว" กันเผลอลาก/ลบ
  const [folderOpen, setFolderOpen] = useState(false);

  // กระดานพร้อม → อ่านสิทธิ์ + ถ้ายังว่างและแก้ได้ วางแม่แบบเริ่มต้นให้ครั้งแรก
  const onBoardReady = useCallback(async () => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      const j = await apiFetch(`/api/canvas-sketch?entity_type=${ENTITY_TYPE}&entity_id=${ENTITY_ID}`).then((r) => r.json());
      const allowed = j?.data?.can_edit === true;
      setCanEdit(allowed);
      const els = (j?.data?.scene?.elements ?? []) as { isDeleted?: boolean }[];
      if (allowed && !els.some((e) => !e.isDeleted)) await sketchRef.current?.insert(starterSkeleton(t));
    } catch { /* อ่านไม่ได้ = ใช้กระดานเปล่าได้ตามปกติ */ }
  }, [t]);

  const onCardOpen = useCallback((data: Record<string, unknown>) => {
    if (data.kind !== "folder") return;
    openCanvasFolder(String(data.path ?? ""));
    pushToast("info", t("กำลังเปิดโฟลเดอร์... ถ้าไม่เปิด: ลง .reg แล้วปิด-เปิดเบราว์เซอร์ใหม่ 1 ครั้ง (path คัดลอกให้แล้ว วางใน File Explorer ได้)", "Opening folder... if nothing happens: install .reg then restart the browser once (path copied as fallback)"));
  }, [pushToast, t]);

  const btn = "inline-flex items-center gap-1 h-9 px-3 text-[13px] border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/master/assets" className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700 hover:underline">← {t("คลังไฟล์กลาง", "File library")}</Link>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Icon name="folder" />{t("แผนผังการเก็บไฟล์", "File storage plan")}</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {t("กระดานวาดเอง ไว้วางแผนว่าไฟล์แบบไหนเก็บที่ไหน · บันทึกอัตโนมัติ · ระบบไม่ได้อ่านกระดานนี้ไปใช้ (กฎที่ระบบใช้จริงอยู่หน้า \"กฎที่เก็บไฟล์\")",
              "A free drawing board to plan where each kind of file lives · saves automatically · the system doesn't read this board (the rules it really uses are on \"Storage rules\")")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <>
              <div className="inline-flex h-9 overflow-hidden rounded-lg border border-slate-200 text-[13px]">
                <button onClick={() => setEditing(false)} className={`px-3 ${!editing ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="lock" /> {t("ดูอย่างเดียว", "View only")}</button>
                <button onClick={() => setEditing(true)} className={`px-3 border-l border-slate-200 ${editing ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="edit" /> {t("แก้ไข", "Edit")}</button>
              </div>
              {editing && <button onClick={() => setFolderOpen(true)} className={btn} title={t("วางการ์ดทางลัด ดับเบิลคลิกแล้วเปิดโฟลเดอร์ในเครื่อง", "Place a shortcut card that opens a local folder")}><Icon name="folder" />{t("การ์ดโฟลเดอร์", "Folder card")}</button>}
              {editing && <button onClick={() => void sketchRef.current?.insert(starterSkeleton(t))} className={btn} title={t("วางแม่แบบ R2 / Supabase / Drive อีกชุด", "Insert another R2 / Supabase / Drive starter")}><Icon name="add" />{t("วางแม่แบบ", "Insert starter")}</button>}
            </>
          )}
          <Link href="/master/storage-rules" className={btn}><Icon value="i:database" />{t("กฎที่เก็บไฟล์", "Storage rules")} →</Link>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">{t("บันทึกเป็นรูป: กดเมนู ☰ มุมซ้ายบนของกระดาน → ส่งออกรูปภาพ", "Save as image: board menu ☰ (top-left) → Export image")}</p>

      <CanvasSketch entityType={ENTITY_TYPE} entityId={ENTITY_ID} editable={editing} height="calc(100vh - 190px)"
        controlsRef={sketchRef} onReady={onBoardReady} onCardOpen={onCardOpen} collab />

      <FolderCardModal open={folderOpen} onClose={() => setFolderOpen(false)}
        onPlace={(skeletons) => { void sketchRef.current?.insert(skeletons); setFolderOpen(false); pushToast("success", t("วางการ์ดโฟลเดอร์แล้ว", "Folder card placed")); }} />
    </div>
  );
}
