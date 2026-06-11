"use client";

// ============================================================
// CanvasSketch — กระดานวาด Excalidraw (ของกลาง)
//
// กระดานแบบ miro: วางรูปจาก Ctrl+V/ลากไฟล์, กล่อง (R), ลูกศร (A), ข้อความ (T), วาดอิสระ (P)
// เก็บลงตารางกลาง erp_canvas_sketches (1 กระดานต่อเอกสาร) ผ่าน /api/canvas-sketch
//
// บันทึกอัตโนมัติ: หยุดวาด ~2.5 วิ → save เอง (debounce) + flush ตอนปิดแท็บ/ปิด modal
// ตอนบันทึกจะ "ถ่ายภาพกระดาน" เป็น PNG เก็บใน R2 ด้วย → ใบพิมพ์/การ์ดเอาไปใช้ได้
//
// ใช้ที่: Design Sheets แท็บ 🖌 กระดาน · โมดูลอื่นใช้ได้เลย: <CanvasSketch entityType="..." entityId="..." />
// doc: docs/canvas-sketch.md
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import { apiFetch } from "@/lib/api";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-slate-400 text-sm">กำลังโหลดกระดาน...</div>,
});

type Scene = { elements?: unknown[]; files?: Record<string, unknown> } | null;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 2500;   // หยุดวาดกี่ ms แล้วค่อยบันทึก

export function CanvasSketch({
  entityType, entityId, editable = true, height = "58vh",
}: {
  entityType: string;
  entityId:   string;
  editable?:  boolean;
  height?:    string;
}) {
  const [scene, setScene] = useState<Scene | "loading">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const apiRef     = useRef<any>(null);
  const readyRef   = useRef(false);    // กัน onChange ตอน mount นับเป็น "มีแก้ไข"
  const dirtyRef   = useRef(false);
  const savingRef  = useRef(false);
  const pendingRef = useRef(false);    // มีแก้เพิ่มระหว่างกำลังบันทึก → บันทึกซ้ำต่อท้าย
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    readyRef.current = false; dirtyRef.current = false;
    setScene("loading"); setSaveState("idle");
    apiFetch(`/api/canvas-sketch?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const sc = j?.data?.scene as Record<string, unknown> | null;
        setScene(sc && typeof sc === "object" ? { elements: (sc.elements as unknown[]) ?? [], files: (sc.files as Record<string, unknown>) ?? {} } : null);
        setTimeout(() => { readyRef.current = true; }, 800);
      })
      .catch(() => { if (alive) { setScene(null); setTimeout(() => { readyRef.current = true; }, 800); } });
    return () => { alive = false; };
  }, [entityType, entityId]);

  const doSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true; dirtyRef.current = false;
    setSaveState("saving");
    try {
      const lib: any = await import("@excalidraw/excalidraw");
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      const sceneJson = JSON.parse(lib.serializeAsJSON(elements, appState, files, "local"));

      // ถ่ายภาพกระดานเป็น PNG (ใบพิมพ์ใช้) — กระดานว่างถ่ายไม่ได้ ข้ามไป
      let b64: string | null = null;
      if ((elements?.length ?? 0) > 0) {
        try {
          const blob: Blob = await lib.exportToBlob({
            elements, files, mimeType: "image/png", maxWidthOrHeight: 1600,
            appState: { ...appState, exportBackground: true, viewBackgroundColor: "#ffffff" },
          });
          b64 = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        } catch (e) { console.error("[canvas-sketch] export PNG failed:", e); }
      }

      const res = await apiFetch("/api/canvas-sketch", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, scene: sceneJson, preview_png_base64: b64 }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setSaveState("saved");
    } catch (e) {
      console.error("[canvas-sketch] save failed:", e);
      dirtyRef.current = true;
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void doSave(); }   // มีแก้ค้างระหว่างบันทึก → ตามเก็บ
    }
  }, [entityType, entityId]);

  // มีการแก้ → ตั้งเวลาบันทึกอัตโนมัติ (รีเซ็ตทุกครั้งที่ขยับ — บันทึกเมื่อหยุดวาด)
  const queueSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), AUTOSAVE_MS);
  }, [doSave]);

  // flush ตอนปิดแท็บ/ปิด modal — ถ้ายังมีแก้ค้าง บันทึกให้เลยไม่ต้องรอครบเวลา
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (editable && dirtyRef.current) void doSave();
  }, [doSave, editable]);

  if (scene === "loading") {
    return <div className="flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl" style={{ height }}>กำลังโหลดกระดาน...</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 flex-1 min-w-[200px]">
          🖼 วางรูป = copy แล้วกด Ctrl+V ในกระดาน · ⬛ กล่อง=R · ➡ ลูกศร=A · 🔤 ข้อความ=T · ✏ วาด=P
        </span>
        {editable && (
          <span className="text-[11px] inline-flex items-center gap-1.5">
            {saveState === "dirty"  && <span className="text-slate-400">● จะบันทึกอัตโนมัติเมื่อหยุดวาด...</span>}
            {saveState === "saving" && <span className="text-blue-500">⏳ กำลังบันทึก...</span>}
            {saveState === "saved"  && <span className="text-emerald-600">✓ บันทึกอัตโนมัติแล้ว</span>}
            {saveState === "error"  && (
              <>
                <span className="text-rose-600">⚠ บันทึกไม่สำเร็จ</span>
                <button onClick={() => void doSave()} className="h-6 px-2 text-[11px] bg-blue-600 text-white rounded-md hover:bg-blue-700">ลองใหม่</button>
              </>
            )}
          </span>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height }}>
        <Excalidraw
          langCode="th-TH"
          viewModeEnabled={!editable}
          excalidrawAPI={(a: any) => { apiRef.current = a; }}
          initialData={scene ? { elements: scene.elements as any, files: scene.files as any, scrollToContent: true } : undefined}
          onChange={() => { if (readyRef.current && editable) queueSave(); }}
        />
      </div>
    </div>
  );
}
