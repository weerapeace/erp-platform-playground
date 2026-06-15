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

import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react";
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

/** ตัวควบคุมกระดานจากภายนอก (เช่น popup เจ้าของ เรียกบันทึก/ทิ้งตอนถามก่อนปิด)
 *  insert(skeletons): แทรก element ลงกลางจอ — skeletons เป็น Excalidraw skeleton (x,y นับจาก 0) แล้วระบบจะเลื่อนไปกลางจอให้ */
export type CanvasSketchControls = { isDirty: () => boolean; save: () => Promise<void>; discard: () => void; insert: (skeletons: Record<string, unknown>[]) => Promise<void> };

export function CanvasSketch({
  entityType, entityId, editable = true, height = "58vh", onDirtyChange, controlsRef, onCardOpen,
}: {
  entityType: string;
  entityId:   string;
  editable?:  boolean;
  height?:    string;
  /** แจ้งสถานะ "มีแก้ค้าง" ขึ้นไปข้างนอก (ใช้เตือนก่อนปิด popup) */
  onDirtyChange?: (dirty: boolean) => void;
  /** ให้ภายนอกถือ handle เรียก save()/discard()/insert() ได้ */
  controlsRef?: MutableRefObject<CanvasSketchControls | null>;
  /** คลิกการ์ดที่มี customData.kind → เปิด drawer (เช่น sku/task) — ระบบจะ preventDefault ลิงก์ให้เอง */
  onCardOpen?: (data: Record<string, unknown>) => void;
}) {
  const [scene, setScene] = useState<Scene | "loading">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const apiRef     = useRef<any>(null);
  const latestRef  = useRef<{ elements: any; appState: any; files: any } | null>(null);  // snapshot ล่าสุดจาก onChange
  const readyRef   = useRef(false);    // กัน onChange ตอน mount นับเป็น "มีแก้ไข"
  const dirtyRef   = useRef(false);
  const savingRef  = useRef(false);
  const pendingRef = useRef(false);    // มีแก้เพิ่มระหว่างกำลังบันทึก → บันทึกซ้ำต่อท้าย
  const discardRef = useRef(false);    // true = ผู้ใช้เลือก "ทิ้ง" → ไม่ flush ตอน unmount
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyCbRef = useRef(onDirtyChange); dirtyCbRef.current = onDirtyChange;
  const cardCbRef  = useRef(onCardOpen);   cardCbRef.current  = onCardOpen;
  const markDirty  = (d: boolean) => { dirtyRef.current = d; dirtyCbRef.current?.(d); };

  useEffect(() => {
    let alive = true;
    readyRef.current = false; dirtyRef.current = false; discardRef.current = false; latestRef.current = null;
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
    // ใช้ snapshot ล่าสุดที่จับไว้ตอน onChange — ไม่อ่านจาก api สด
    // (กัน bug: ตอนปิด/สลับแท็บ Excalidraw ถูกถอด → getSceneElements() คืนว่าง → ทับของดี)
    const snap = latestRef.current;
    if (!snap) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true; markDirty(false);
    setSaveState("saving");
    try {
      const lib: any = await import("@excalidraw/excalidraw");
      const elements = snap.elements ?? [];
      const appState = snap.appState ?? {};
      const files = snap.files ?? {};
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
      markDirty(true);
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void doSave(); }   // มีแก้ค้างระหว่างบันทึก → ตามเก็บ
    }
  }, [entityType, entityId]);

  // มีการแก้ → ตั้งเวลาบันทึกอัตโนมัติ (รีเซ็ตทุกครั้งที่ขยับ — บันทึกเมื่อหยุดวาด)
  const queueSave = useCallback(() => {
    markDirty(true);
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), AUTOSAVE_MS);
  }, [doSave]);

  // ให้ภายนอกถือ handle: เช็คมีแก้ค้าง / สั่งบันทึก / สั่งทิ้ง (ใช้ตอนถามก่อนปิด popup)
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      isDirty: () => dirtyRef.current,
      save: doSave,
      discard: () => { discardRef.current = true; markDirty(false); setSaveState("idle"); },
      // แทรก element (การ์ด/โซน) ลงกลางจอ แล้วบันทึกอัตโนมัติ
      // skeleton ที่เป็นรูปให้ใส่ `_imageUrl` (แทน fileId) — ระบบจะโหลดรูป → ลงทะเบียนไฟล์ → ใส่ fileId ให้เอง
      insert: async (skeletons) => {
        const api = apiRef.current;
        if (!api || !skeletons?.length) return;
        try {
          const lib: any = await import("@excalidraw/excalidraw");

          // โหลดรูป (ถ้ามี) → addFiles ก่อนวาง element
          const urlToFileId = new Map<string, string>();
          const work = skeletons.map((s) => ({ ...s }));
          for (const s of work) {
            const url = s._imageUrl as string | undefined;
            if (s.type === "image" && url && !s.fileId) {
              let fileId = urlToFileId.get(url);
              if (!fileId) {
                try {
                  const res = await fetch(url);
                  const blob = await res.blob();
                  const dataURL: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob); });
                  fileId = `f${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
                  api.addFiles([{ id: fileId, dataURL, mimeType: blob.type || "image/png", created: Date.now() }]);
                  urlToFileId.set(url, fileId);
                } catch (e) { console.error("[canvas-sketch] image load failed:", e); }
              }
              if (fileId) s.fileId = fileId;
            }
            delete s._imageUrl;
          }

          const st = api.getAppState();
          const center = lib.viewportCoordsToSceneCoords(
            { clientX: (st.offsetLeft ?? 0) + (st.width ?? 800) / 2, clientY: (st.offsetTop ?? 0) + (st.height ?? 600) / 2 },
            st,
          );
          // ทิ้ง image element ที่โหลดรูปไม่สำเร็จ (ไม่มี fileId) กัน Excalidraw error
          const placed = work.filter((s) => s.type !== "image" || s.fileId).map((s) => ({ ...s, x: (Number(s.x) || 0) + center.x, y: (Number(s.y) || 0) + center.y }));
          const els = lib.convertToExcalidrawElements(placed);
          api.updateScene({ elements: [...api.getSceneElements(), ...els] });
          if (editable) queueSave();
        } catch (e) { console.error("[canvas-sketch] insert failed:", e); }
      },
    };
    return () => { if (controlsRef) controlsRef.current = null; };
  }, [controlsRef, doSave, queueSave, editable]);

  // flush ตอนสลับแท็บ/ปิด modal — ถ้ายังมีแก้ค้าง บันทึกให้เลย (เว้นกรณีผู้ใช้เลือก "ทิ้ง")
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (editable && dirtyRef.current && !discardRef.current) void doSave();
  }, [doSave, editable]);

  // ล้อเมาส์ = ซูมเข้าหาตำแหน่งเมาส์ (shift+ล้อ = เลื่อนแนวนอนตามปกติ) + ดับเบิลคลิกการ์ด → เปิด drawer
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return;
      const api = apiRef.current; if (!api) return;
      e.preventDefault(); e.stopPropagation();
      const st = api.getAppState(); const z = st.zoom?.value || 1;
      const nz = Math.min(30, Math.max(0.1, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const ox = st.offsetLeft ?? 0, oy = st.offsetTop ?? 0;
      const sx = (e.clientX - ox) / z - st.scrollX, sy = (e.clientY - oy) / z - st.scrollY;
      api.updateScene({ appState: { zoom: { value: nz }, scrollX: (e.clientX - ox) / nz - sx, scrollY: (e.clientY - oy) / nz - sy } });
    };
    const onDbl = (e: MouseEvent) => {
      const cb = cardCbRef.current; const api = apiRef.current; if (!cb || !api) return;
      const st = api.getAppState(); const z = st.zoom?.value || 1;
      const px = (e.clientX - (st.offsetLeft ?? 0)) / z - st.scrollX;
      const py = (e.clientY - (st.offsetTop ?? 0)) / z - st.scrollY;
      const els = api.getSceneElements() as any[];
      for (let i = els.length - 1; i >= 0; i--) {
        const it = els[i]; const d = it?.customData;
        if (d?.kind && px >= it.x && px <= it.x + it.width && py >= it.y && py <= it.y + it.height) { e.preventDefault(); e.stopPropagation(); cb(d); return; }
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("dblclick", onDbl, { capture: true });
    return () => { el.removeEventListener("wheel", onWheel, true); el.removeEventListener("dblclick", onDbl, true); };
  }, []);

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
      <div ref={wrapRef} className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height }}>
        <Excalidraw
          langCode="th-TH"
          viewModeEnabled={!editable}
          excalidrawAPI={(a: any) => { apiRef.current = a; }}
          initialData={scene ? { elements: scene.elements as any, files: scene.files as any, scrollToContent: true } : undefined}
          onChange={(elements: any, appState: any, files: any) => {
            latestRef.current = { elements, appState, files };   // จับ snapshot เสมอ (รวมตอน load)
            if (readyRef.current && editable) queueSave();
          }}
          onLinkOpen={(el: any, ev: any) => {
            // การ์ดของเรา (มี customData.kind) → เปิด drawer แทนการเปิดลิงก์
            const data = el?.customData as Record<string, unknown> | undefined;
            if (data?.kind && cardCbRef.current) { ev?.preventDefault?.(); cardCbRef.current(data); }
          }}
        />
      </div>
    </div>
  );
}
