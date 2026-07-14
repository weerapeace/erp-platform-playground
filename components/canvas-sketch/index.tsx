"use client";

// ============================================================
// CanvasSketch — กระดานวาด Excalidraw (ของกลาง)
//
// กระดานแบบ miro: วางรูปจาก Ctrl+V/ลากไฟล์, กล่อง (R), ลูกศร (A), ข้อความ (T), วาดอิสระ (P)
// เก็บลงตารางกลาง erp_canvas_sketches (1 กระดานต่อเอกสาร) ผ่าน /api/canvas-sketch
//
// บันทึกอัตโนมัติ: หยุดวาด ~1 วิ → save เอง (debounce) + เซฟกันลืม ~8วิ + flush ตอนปิด · เซฟแบบเช็คเวอร์ชัน (กันทับกันหลายคน)
// realtime หลายคน: ผ่าน Supabase Broadcast (ไม่กิน Cloudflare CPU) · รูปที่แปะ → ย้ายขึ้น R2 (กระดานเล็ก โหลดไว โชว์ข้ามเครื่อง)
//
// ใช้ที่: Design Sheets แท็บ 🖌 กระดาน · โมดูลอื่นใช้ได้เลย: <CanvasSketch entityType="..." entityId="..." />
// doc: docs/canvas-sketch.md
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, type MutableRefObject, type MouseEvent as RMouseEvent } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import "./thai-fonts.css";   // เติมฟอนต์ไทยให้ family ของ Excalidraw (unicode-range เฉพาะไทย)
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { avatarSrc } from "@/lib/r2-image";
import { isUnloadSuppressed } from "@/lib/canvas-unload-guard";
import { useCanvasRealtime } from "./use-canvas-realtime";
import { type Scene, type SaveState, AUTOSAVE_MS, MAX_AUTOSAVE_MS, sceneSig, mergeById, resizeDataUrl, userColor, initials } from "./utils";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-slate-400 text-sm">กำลังโหลดกระดาน...</div>,
});

/** ตัวควบคุมกระดานจากภายนอก (เช่น popup เจ้าของ เรียกบันทึก/ทิ้งตอนถามก่อนปิด)
 *  insert(skeletons): แทรก element ลงกลางจอ — skeletons เป็น Excalidraw skeleton (x,y นับจาก 0) แล้วระบบจะเลื่อนไปกลางจอให้ */
export type CanvasSketchControls = {
  isDirty: () => boolean; save: () => Promise<void>; discard: () => void;
  insert: (skeletons: Record<string, unknown>[]) => Promise<void>;
  listCards: () => { kind: string; data: Record<string, unknown> }[];
  /** ซิงค์การ์ดสด — builder คืน {text?, data?, imageUrl?} เพื่ออัปเดตข้อความ/รูป/snapshot
   *  imageUrl: ใส่ URL รูป = โชว์/เปลี่ยนรูปบนการ์ด (เพิ่ม image ให้อัตโนมัติถ้ายังไม่มี) · null/"" = เอารูปออก · undefined = ไม่ยุ่งกับรูป */
  refreshCards: (builder: (card: { kind: string; id: string; data: Record<string, unknown> }) => Promise<{ text?: string; data?: Record<string, unknown>; imageUrl?: string | null } | null>) => Promise<void>;
};

export function CanvasSketch({
  entityType, entityId, editable = true, height = "58vh", onDirtyChange, controlsRef, onCardOpen, onReady, collab = false, stickyTop,
}: {
  entityType: string;
  entityId:   string;
  editable?:  boolean;
  height?:    string;
  /** ทำแถบเครื่องมือ "ล็อกค้างบน" (sticky) ที่ระยะห่างจากบนจอ (px) — เว้นว่าง = ไม่ล็อก */
  stickyTop?: number;
  /** เปิด realtime หลายคนพร้อมกัน (ผ่าน Supabase Broadcast — ไม่กิน Cloudflare CPU) */
  collab?:    boolean;
  /** แจ้งสถานะ "มีแก้ค้าง" ขึ้นไปข้างนอก (ใช้เตือนก่อนปิด popup) */
  onDirtyChange?: (dirty: boolean) => void;
  /** ให้ภายนอกถือ handle เรียก save()/discard()/insert() ได้ */
  controlsRef?: MutableRefObject<CanvasSketchControls | null>;
  /** คลิกการ์ดที่มี customData.kind → เปิด drawer (เช่น sku/task) — ระบบจะ preventDefault ลิงก์ให้เอง */
  onCardOpen?: (data: Record<string, unknown>) => void;
  /** เรียกครั้งเดียวเมื่อกระดานโหลดเสร็จพร้อมใช้ (ใช้ซิงค์การ์ดสด ฯลฯ) */
  onReady?: () => void;
}) {
  const [scene, setScene] = useState<Scene | "loading">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null); // เวลาเซฟล่าสุด (โชว์ให้รู้ว่าบันทึกแล้วทุกครั้ง)
  const [lastMerged, setLastMerged] = useState(false); // เซฟล่าสุดมีการรวมงานกับคนอื่นไหม
  const [selFont, setSelFont] = useState<number | null>(null); // ขนาด font ของ text ที่เลือก (null = ไม่ได้เลือก text)
  const [serverCanEdit, setServerCanEdit] = useState(true); // server บอกว่าผู้ใช้มีสิทธิ์แก้ไหม (viewer = false)
  const canEditRef = useRef(true);

  const lastChangeSigRef = useRef<string>(""); // ลายเซ็นล่าสุดที่ทำให้ "save/ส่ง" — กัน onChange ที่ไม่เปลี่ยนชิ้นงาน (เลือก/เลื่อนจอ) มา trigger รัวๆ

  const apiRef     = useRef<any>(null);
  const latestRef  = useRef<{ elements: any; appState: any; files: any } | null>(null);  // snapshot ล่าสุดจาก onChange
  const readyRef   = useRef(false);    // กัน onChange ตอน mount นับเป็น "มีแก้ไข"
  const dirtyRef   = useRef(false);
  const savingRef  = useRef(false);
  const pendingRef = useRef(false);    // มีแก้เพิ่มระหว่างกำลังบันทึก → บันทึกซ้ำต่อท้าย
  const discardRef = useRef(false);    // true = ผู้ใช้เลือก "ทิ้ง" → ไม่ flush ตอน unmount
  const hadContentRef = useRef(false); // เคยมีชิ้นงานจริงไหม — กันเซฟ "ว่าง" ทับงานดี (เช่นตอนปิดหน้า Excalidraw เคลียร์ scene)
  const allowEmptyRef = useRef(false); // อนุญาตเซฟว่างครั้งนี้ (ผู้ใช้กด "ล้างกระดาน" ตั้งใจ)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // เซฟกันลืมระหว่างแก้ต่อเนื่อง
  const lastPngAtRef = useRef(0); // ถ่าย PNG ล่าสุดเมื่อไหร่ — ถ่ายเฉพาะทุก ~30วิ/ตอนปิด (ลด payload เซฟถี่ๆ)
  const baseRevRef = useRef(0);   // เวอร์ชันกระดานที่โหลดมา — ใช้กันเซฟทับกันเวลาหลายคนแก้
  const uploadingRef = useRef(0); // จำนวนรูปที่กำลังอัปโหลดขึ้น R2 (ระหว่างนี้ยังไม่เซฟ base64 ก้อนใหญ่)
  const hoistedRef = useRef<Set<string>>(new Set()); // fileId ที่ย้ายขึ้น R2 แล้ว (กันทำซ้ำ)
  const dirtyCbRef = useRef(onDirtyChange); dirtyCbRef.current = onDirtyChange;
  const cardCbRef  = useRef(onCardOpen);   cardCbRef.current  = onCardOpen;
  const readyCbRef = useRef(onReady);      readyCbRef.current = onReady;
  const editableRef = useRef(editable);    editableRef.current = editable;
  const hoistRef = useRef<((files: Record<string, any>) => void) | null>(null); // ตัวย้ายรูปขึ้น R2 (ตั้งค่าหลัง hoistImages นิยาม)
  const markDirty  = (d: boolean) => { dirtyRef.current = d; dirtyCbRef.current?.(d); };

  // ตัวตนผู้ใช้ (โชว์ว่าใครออนไลน์ + ใส่ชื่อกำกับโน้ตคอมเมนต์)
  const { user } = useAuth();

  // ชั้น realtime (แชร์สดหลายคน) — แยกเป็น hook: broadcast/รับของคนอื่น/รายชื่อคนออนไลน์ ผ่าน Supabase Broadcast
  const { peerList, broadcast, broadcastFiles, applyingRemoteRef } = useCanvasRealtime({
    collab, editable, ready: scene !== "loading", entityType, entityId, apiRef,
    selfId: user?.id ?? "", selfName: user?.name ?? "", selfAvatar: user?.avatar ?? null,
  });

  useEffect(() => {
    let alive = true;
    readyRef.current = false; dirtyRef.current = false; discardRef.current = false; latestRef.current = null; hadContentRef.current = false;
    uploadingRef.current = 0; hoistedRef.current = new Set();
    setScene("loading"); setSaveState("idle");
    apiFetch(`/api/canvas-sketch?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const sc = j?.data?.scene as Record<string, unknown> | null;
        // ล้าง link ออกจากการ์ดเก่า (มี customData.kind) — ไม่ให้ขึ้นไอคอน 🔗 รก (เปิดด้วยดับเบิลคลิกแทน)
        const els = ((sc?.elements as Record<string, unknown>[]) ?? []).map((el) => {
          const d = el?.customData as Record<string, unknown> | undefined;
          return d?.kind && el.link ? { ...el, link: null } : el;
        });
        if (els.some((e) => !(e as { isDeleted?: boolean }).isDeleted)) hadContentRef.current = true; // โหลดมามีงาน → ห้ามเซฟว่างทับ
        baseRevRef.current = Number(j?.data?.rev) || 0; // จำเวอร์ชันที่โหลดมา
        { const ce = j?.data?.can_edit !== false; canEditRef.current = ce; setServerCanEdit(ce); } // viewer = อ่านอย่างเดียว
        setScene(sc && typeof sc === "object" ? { elements: els, files: (sc.files as Record<string, unknown>) ?? {} } : null);
        setTimeout(() => {
          readyRef.current = true; if (alive) readyCbRef.current?.();
          // ย้ายรูป base64 ที่ค้างมาแต่เดิม (ก่อนมีฟีเจอร์ R2) ขึ้น R2 ตั้งแต่เปิด — ไม่ต้องรอผู้ใช้แก้ไข
          // ทำให้ scene เล็กลง (กระดานรูปเยอะเคยหนักหลาย MB → เซฟช้า) เซฟครั้งต่อไปไวขึ้นมาก
          if (alive && editableRef.current && canEditRef.current) {
            const f = (sc?.files as Record<string, any>) ?? {};
            if (Object.keys(f).length) hoistRef.current?.(f);
          }
        }, 800);
      })
      .catch(() => { if (alive) { setScene(null); setTimeout(() => { readyRef.current = true; if (alive) readyCbRef.current?.(); }, 800); } });
    return () => { alive = false; };
  }, [entityType, entityId]);

  const doSave = useCallback(async (forcePng = false) => {
    // ใช้ snapshot ล่าสุดที่จับไว้ตอน onChange — ไม่อ่านจาก api สด
    // (กัน bug: ตอนปิด/สลับแท็บ Excalidraw ถูกถอด → getSceneElements() คืนว่าง → ทับของดี)
    const snap = latestRef.current;
    if (!snap) return;
    if (!canEditRef.current) return; // ไม่มีสิทธิ์แก้ → ไม่เซฟ (กันขึ้น error ให้ viewer)
    // ยังอัปโหลดรูปอยู่ → รอให้เป็นลิงก์ก่อน (กันเซฟ base64 ก้อนใหญ่) เว้นตอนปิด/บังคับเซฟ จะยอมเซฟ base64 กันรูปหาย
    if (uploadingRef.current > 0 && !forcePng) {
      setSaveState("dirty");
      if (!timerRef.current) timerRef.current = setTimeout(() => void doSave(forcePng), 1000);
      return;
    }
    if (savingRef.current) { pendingRef.current = true; return; }
    // กันเซฟ "ว่าง" ทับงานดี: ถ้าเคยมีงาน แต่ snapshot ตอนนี้ว่าง (มักเกิดตอนปิดหน้า/teardown ที่ Excalidraw เคลียร์ scene)
    // → ลองใช้ของจริงจาก api ที่ยังเปิดอยู่; ถ้าก็ว่าง/อ่านไม่ได้ → ไม่บันทึก (กันงานหาย)
    {
      const snapEls = (snap.elements ?? []) as any[];
      if (hadContentRef.current && !snapEls.some((e) => !e.isDeleted) && !allowEmptyRef.current) {
        const live = (() => { try { return apiRef.current?.getSceneElementsIncludingDeleted?.() as any[] | undefined; } catch { return undefined; } })();
        if (live && live.some((e) => !e.isDeleted)) { snap.elements = live; }   // ของจริงยังมีงาน → ใช้แทน
        else { console.warn("[canvas-sketch] skip empty save (had content)"); return; }   // ยืนยันว่างไม่ได้ → ไม่บันทึกทับ
      }
      allowEmptyRef.current = false; // ใช้ครั้งเดียว
    }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    savingRef.current = true; markDirty(false);
    setSaveState("saving");
    try {
      const lib: any = await import("@excalidraw/excalidraw");
      const elements = snap.elements ?? [];
      const appState = snap.appState ?? {};
      const files = snap.files ?? {};
      const sceneJson = JSON.parse(lib.serializeAsJSON(elements, appState, files, "local"));

      // ถ่ายภาพกระดานเป็น PNG (ใบพิมพ์ใช้) — เฉพาะทุก ~30วิ หรือตอนปิด/บันทึกเอง (ลด payload เซฟถี่ๆ) + timeout 6วิ กันค้าง
      let b64: string | null = null;
      const wantPng = (elements?.length ?? 0) > 0 && (forcePng || Date.now() - lastPngAtRef.current > 30000);
      if (wantPng) {
        try {
          const blob: Blob = await Promise.race([
            lib.exportToBlob({ elements, files, mimeType: "image/png", maxWidthOrHeight: 1600, appState: { ...appState, exportBackground: true, viewBackgroundColor: "#ffffff" } }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("png timeout")), 6000)),
          ]);
          b64 = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
          lastPngAtRef.current = Date.now();
        } catch (e) { console.error("[canvas-sketch] export PNG failed/skip:", e); }
      }

      // PUT เซฟ scene แบบเช็คเวอร์ชัน — ถ้าชนกัน (มีคนเซฟแทรก) → รวมงานแล้วลองใหม่ (สูงสุด 3 ครั้ง)
      let sceneToSave: any = sceneJson;
      let baseRev = baseRevRef.current;
      let merged = false;
      for (let attempt = 0; ; attempt++) {
        const ctrl = new AbortController();
        const abortTimer = setTimeout(() => ctrl.abort(), 20000);
        let res: Response;
        try {
          res = await apiFetch("/api/canvas-sketch", {
            method: "PUT", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
            body: JSON.stringify({ entity_type: entityType, entity_id: entityId, scene: sceneToSave, base_rev: baseRev, preview_png_base64: attempt === 0 ? b64 : null }),
          });
        } finally { clearTimeout(abortTimer); }
        const j = await res.json(); if (j.error) throw new Error(j.error);

        if (j.conflict && attempt < 3) {
          // มีคนเซฟแทรก → รวมงาน 2 ฝั่ง (เอาชิ้นที่ใหม่กว่า) + รวมรูป (files) แล้วลองเซฟใหม่ด้วย rev ล่าสุด
          const remoteEls = ((j.scene?.elements ?? []) as any[]);
          const remoteFiles = ((j.scene?.files ?? {}) as Record<string, any>);
          const mine = (sceneToSave.elements ?? []) as any[];
          const mergedEls = mergeById(mine, remoteEls);
          const mergedFiles = { ...remoteFiles, ...(sceneToSave.files ?? {}) }; // คงของเรา + เพิ่มรูปของคนอื่น
          sceneToSave = { ...sceneToSave, elements: mergedEls, files: mergedFiles };
          baseRev = Number(j.rev) || 0; baseRevRef.current = baseRev;
          merged = true;
          // อัปเดตบนจอให้เห็นงาน+รูปที่รวมแล้ว (กัน onChange ที่ตามมาเซฟซ้ำด้วยการตั้ง lastChangeSig)
          try {
            lastChangeSigRef.current = sceneSig(mergedEls);
            const rf = Object.values(remoteFiles); if (rf.length) apiRef.current?.addFiles?.(rf); // รูปคนอื่นเรนเดอร์ได้
            apiRef.current?.updateScene?.({ elements: mergedEls });
          } catch { /* noop */ }
          continue;
        }
        if (j.conflict) { // ชนถี่ (2 คนแก้พร้อมกัน) → ไม่ขึ้น error, ตั้งเวลาลองใหม่อีก 1.5วิ
          markDirty(true); setSaveState("dirty");
          if (!timerRef.current) timerRef.current = setTimeout(() => void doSave(forcePng), 1500);
          break;
        }

        baseRevRef.current = Number(j.rev) || baseRevRef.current + 1;
        setLastMerged(merged);
        setSaveState("saved");
        try { setSavedAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })); } catch { setSavedAt("✓"); }
        break;
      }
    } catch (e) {
      console.error("[canvas-sketch] save failed:", e);
      markDirty(true);
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void doSave(); }   // มีแก้ค้างระหว่างบันทึก → ตามเก็บ
    }
  }, [entityType, entityId]);

  // มีการแก้ → ตั้งเวลาบันทึกอัตโนมัติ (debounce หยุดวาด ~1วิ) + เซฟกันลืมทุก ~8วิ ถ้าแก้ต่อเนื่อง
  const queueSave = useCallback(() => {
    markDirty(true);
    if (!savingRef.current) setSaveState("dirty"); // อย่าเด้งทับสถานะ "กำลังบันทึก"
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), AUTOSAVE_MS);
    if (!maxTimerRef.current) maxTimerRef.current = setTimeout(() => void doSave(), MAX_AUTOSAVE_MS);
  }, [doSave]);

  // ย้ายรูป base64 ที่เพิ่งแปะ → เก็บเป็นไฟล์บน R2 แล้วแทน dataURL ด้วยลิงก์ (scene เล็ก โหลดไว โชว์ข้ามเครื่องได้)
  const hoistImages = useCallback((files: Record<string, any> | undefined) => {
    if (!apiRef.current || !files) return;
    for (const fid of Object.keys(files)) {
      const url = files[fid]?.dataURL as string | undefined;
      if (!url || !url.startsWith("data:") || hoistedRef.current.has(fid)) continue;
      hoistedRef.current.add(fid);
      uploadingRef.current++;
      void (async () => {
        try {
          const mime = (url.match(/^data:([^;]+);base64,/)?.[1]) || "image/png";
          const { blob, type } = await resizeDataUrl(url, mime, 1600); // ย่อ ≤1600px → ผ่านลิมิต 5MB + เบา
          const ext = type === "image/png" ? "png" : "jpg";
          const fd = new FormData();
          fd.append("file", new File([blob], `cv-${fid}.${ext}`, { type }));
          fd.append("folder", "canvassketch");
          // timeout 25วิ กันอัปโหลดค้าง (ถ้าค้าง uploadingRef จะไม่ลด → ตัวกันเซฟรอตลอด → "กำลังบันทึก..." ค้าง)
          const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
          let res: Response;
          try { res = await apiFetch("/api/admin/upload", { method: "POST", body: fd, signal: ctrl.signal }); }
          finally { clearTimeout(to); }
          const j = await res.json(); if (j.error || !j.r2_key) throw new Error(j.error || "upload failed");
          const r2url = `/api/r2-image?key=${encodeURIComponent(j.r2_key)}`;
          // สร้าง fileId ใหม่ให้รูป R2 — เพราะ addFiles ของ Excalidraw "ไม่แทน" ไฟล์ id เดิม (base64 ค้าง)
          // แล้วชี้ image element ที่ใช้ fid เดิม → fid ใหม่ → base64 เดิมหลุดการอ้างอิง → ไม่ถูก serialize/เซฟ
          const newFid = `r${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
          const fileObj = { id: newFid, dataURL: r2url, mimeType: type, created: Date.now() };
          const api = apiRef.current;
          if (api) {
            api.addFiles([fileObj]);
            const next = (api.getSceneElementsIncludingDeleted() as any[]).map((el) =>
              (el.type === "image" && el.fileId === fid) ? { ...el, fileId: newFid, version: (el.version ?? 0) + 1 } : el);
            api.updateScene({ elements: next }); // element เปลี่ยน → onChange เซฟ scene ใหม่ (ลิงก์ R2, ไม่มี base64)
          }
          broadcastFiles([fileObj]); // ให้คนอื่นเรนเดอร์รูปได้
        } catch (e) { console.error("[canvas] hoist image failed:", e); hoistedRef.current.delete(fid); } // ล้มเหลว → คงเป็น base64 (ยังใช้ได้ในเครื่อง)
        finally { uploadingRef.current = Math.max(0, uploadingRef.current - 1); if (uploadingRef.current === 0 && editable && canEditRef.current) queueSave(); }
      })();
    }
  }, [editable, queueSave, broadcastFiles]);
  hoistRef.current = hoistImages; // ให้ effect โหลด (proactive hoist ตอนเปิด) เรียกได้โดยไม่ผูก dependency

  // ให้ภายนอกถือ handle: เช็คมีแก้ค้าง / สั่งบันทึก / สั่งทิ้ง (ใช้ตอนถามก่อนปิด popup)
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      isDirty: () => dirtyRef.current,
      save: () => doSave(true),
      discard: () => { discardRef.current = true; markDirty(false); setSaveState("idle"); },
      // แทรก element (การ์ด/โซน) ลงกลางจอ แล้วบันทึกอัตโนมัติ
      // skeleton ที่เป็นรูปให้ใส่ `_imageUrl` (แทน fileId) — ระบบจะโหลดรูป → ลงทะเบียนไฟล์ → ใส่ fileId ให้เอง
      insert: async (skeletons) => {
        const api = apiRef.current;
        if (!api || !skeletons?.length) return;
        try {
          const lib: any = await import("@excalidraw/excalidraw");

          // โหลดรูป (ถ้ามี) → addFiles ก่อนวาง element + จำสัดส่วนรูปจริง (กันรูปยืดเบี้ยว)
          const urlToFileId = new Map<string, string>();
          const urlToRatio = new Map<string, number>(); // natural width/height
          const work = skeletons.map((s) => ({ ...s }));
          for (const s of work) {
            const url = s._imageUrl as string | undefined;
            if (s.type === "image" && url && !s.fileId) {
              let fileId = urlToFileId.get(url);
              if (!fileId) {
                try {
                  // ใช้ URL เป็น dataURL ตรงๆ (รูปอยู่บน R2 อยู่แล้ว) — ไม่ต้องดึง+แปลง base64+อัปซ้ำ
                  fileId = `f${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
                  api.addFiles([{ id: fileId, dataURL: url, mimeType: "image/png", created: Date.now() }]);
                  urlToFileId.set(url, fileId);
                  // อ่านขนาดจริงของรูปจาก URL → เก็บอัตราส่วน
                  try { const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => { const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); im.onerror = reject; im.src = url; }); if (dim.h > 0) urlToRatio.set(url, dim.w / dim.h); } catch { /* ใช้กรอบเดิม */ }
                } catch (e) { console.error("[canvas-sketch] image load failed:", e); }
              }
              if (fileId) s.fileId = fileId;
              // ปรับ width/height ให้พอดีในกรอบโดยคงสัดส่วน (object-contain) + จัดกึ่งกลางกรอบ
              const ratio = urlToRatio.get(url);
              const boxW = Number(s.width) || 0, boxH = Number(s.height) || 0;
              if (ratio && boxW > 0 && boxH > 0) {
                let newW = boxW, newH = boxW / ratio;
                if (newH > boxH) { newH = boxH; newW = boxH * ratio; }
                s.x = (Number(s.x) || 0) + (boxW - newW) / 2;
                s.y = (Number(s.y) || 0) + (boxH - newH) / 2;
                s.width = newW; s.height = newH;
              }
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
      // รายการการ์ดบนกระดาน (dedup ตาม kind+id) — ใช้ทำป๊อปอัปสรุป
      listCards: () => {
        const api = apiRef.current; if (!api) return [];
        const seen = new Set<string>(); const out: { kind: string; data: Record<string, unknown> }[] = [];
        for (const el of api.getSceneElements() as any[]) {
          const d = el?.customData as Record<string, unknown> | undefined;
          if (!d?.kind) continue;
          const key = `${d.kind}:${d.id ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key); out.push({ kind: String(d.kind), data: d });
        }
        return out;
      },
      // ซิงค์การ์ดสด: ไล่กลุ่ม (group) → builder คืน {text?, data?, imageUrl?} → อัปเดตข้อความ + รูป + snapshot
      refreshCards: async (builder) => {
        const api = apiRef.current; if (!api) return;
        const els = api.getSceneElements() as any[];
        const groups = new Map<string, any[]>();
        for (const el of els) {
          const gid = el?.groupIds?.[0]; const d = el?.customData as Record<string, unknown> | undefined;
          if (!gid || !d?.kind) continue;
          const arr = groups.get(gid) ?? []; arr.push(el); groups.set(gid, arr);
        }
        // 1) เรียก builder ต่อกลุ่ม → เก็บผล (ข้อความ/รูป/snapshot)
        const updates = new Map<string, { text?: string; data?: Record<string, unknown>; imageUrl?: string | null }>();
        for (const [gid, arr] of groups) {
          const d = arr[0].customData as Record<string, unknown>;
          try { const res = await builder({ kind: String(d.kind), id: String(d.id ?? ""), data: d }); if (res) updates.set(gid, res); }
          catch { /* ข้ามการ์ดที่ดึงไม่ได้ */ }
        }
        if (updates.size === 0) return;

        // 2) รูป: โหลด url → ลงทะเบียนไฟล์ (แคชตาม url) → คืน fileId + อัตราส่วนจริง
        const imgCache = new Map<string, { fileId: string; ratio?: number }>();
        const resolveImg = async (url: string): Promise<{ fileId: string; ratio?: number } | null> => {
          const hit = imgCache.get(url); if (hit) return hit;
          try {
            const fileId = `f${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
            api.addFiles([{ id: fileId, dataURL: url, mimeType: "image/png", created: Date.now() }]);
            let ratio: number | undefined;
            try { const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => { const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); im.onerror = reject; im.src = url; }); if (dim.h > 0) ratio = dim.w / dim.h; } catch { /* ใช้กรอบเดิม */ }
            const out = { fileId, ratio }; imgCache.set(url, out); return out;
          } catch (e) { console.error("[canvas-sketch] refresh image failed:", e); return null; }
        };
        const gidImage = new Map<string, { fileId: string; ratio?: number }>();
        const gidUrl = new Map<string, string>();
        const gidClear = new Set<string>();
        for (const [gid, u] of updates) {
          if (u.imageUrl === undefined) continue;                 // ไม่ยุ่งกับรูป
          if (!u.imageUrl) { gidClear.add(gid); continue; }        // สั่งเอารูปออก
          const imgEl = (groups.get(gid) ?? []).find((e) => e.type === "image");
          if (imgEl && (imgEl.customData as Record<string, unknown> | undefined)?._coverUrl === u.imageUrl) continue;  // รูปเดิมอยู่แล้ว ไม่ต้องโหลด/สลับใหม่ (กันไฟล์สะสม)
          const r = await resolveImg(u.imageUrl); if (r) { gidImage.set(gid, r); gidUrl.set(gid, u.imageUrl); }
        }
        // กลุ่มที่ขอรูปแต่ยัง "ไม่มี" image element → ต้องเพิ่มใหม่ (ต้องใช้ lib แปลง skeleton)
        const addGids = [...gidImage.keys()].filter((gid) => !(groups.get(gid) ?? []).some((e) => e.type === "image"));
        const lib: any = addGids.length ? await import("@excalidraw/excalidraw") : null;

        const PAD = 8, IMG_H = 150;
        const removeIds = new Set<string>();
        // จัดรูปให้พอดีกรอบแบบคงสัดส่วน (object-contain) + จัดกึ่งกลาง
        const fitBox = (bx: number, by: number, bw: number, bh: number, ratio?: number) => {
          if (!ratio || bw <= 0 || bh <= 0) return { x: bx, y: by, width: bw, height: bh };
          let w = bw, h = bw / ratio; if (h > bh) { h = bh; w = bh * ratio; }
          return { x: bx + (bw - w) / 2, y: by + (bh - h) / 2, width: w, height: h };
        };

        const next = els.map((el) => {
          const gid = el?.groupIds?.[0]; const u = gid ? updates.get(gid) : undefined; if (!u) return el;
          const merged = { ...el.customData, ...(u.data ?? {}) };
          const img = gid ? gidImage.get(gid) : undefined;
          const clearing = gid ? gidClear.has(gid) : false;
          // การ์ดนี้กำลัง "เพิ่มรูปใหม่" (ขอรูป + ยังไม่มี image element) → ต้องเลื่อนข้อความลง + ขยายกล่อง
          const addingHere = !!img && !(groups.get(gid!) ?? []).some((e) => e.type === "image");
          if (el.type === "image") {
            if (clearing) { removeIds.add(el.id); return el; }
            if (img) return { ...el, fileId: img.fileId, version: (el.version ?? 0) + 1, customData: { ...merged, _coverUrl: gidUrl.get(gid!) } };  // สลับรูป
            return { ...el, customData: merged };
          }
          if (el.type === "text") {
            let base: any = el;
            if (u.text != null) { const lines = u.text.split("\n").length; const fs = el.fontSize ?? 14; base = { ...el, text: u.text, originalText: u.text, height: Math.round(lines * fs * 1.25) }; }
            if (addingHere) base = { ...base, y: (base.y ?? 0) + IMG_H + PAD };
            return { ...base, customData: merged };
          }
          if (el.type === "rectangle") {
            let base: any = el;
            if (u.text != null) { const lines = u.text.split("\n").length; base = { ...el, height: 40 + lines * 18 }; }
            if (addingHere) base = { ...base, height: (base.height ?? 0) + IMG_H + PAD };
            return { ...base, customData: merged };
          }
          return { ...el, customData: merged };
        });

        // เพิ่ม image element ใหม่ให้กลุ่มที่ขอรูป (วางแถบบนสุดของกล่อง)
        const addedEls: any[] = [];
        for (const gid of addGids) {
          const img = gidImage.get(gid); if (!img || !lib) continue;
          const gEls = groups.get(gid) ?? [];
          const minX = Math.min(...gEls.map((e) => e.x ?? 0));
          const minY = Math.min(...gEls.map((e) => e.y ?? 0));
          const maxX = Math.max(...gEls.map((e) => (e.x ?? 0) + (e.width ?? 0)));
          const box = fitBox(minX + PAD, minY + PAD, Math.max(40, maxX - minX - PAD * 2), IMG_H, img.ratio);
          const d0 = { ...((gEls[0]?.customData ?? {}) as Record<string, unknown>), _coverUrl: gidUrl.get(gid) };
          const skel = [{ type: "image", fileId: img.fileId, x: box.x, y: box.y, width: box.width, height: box.height, groupIds: [gid], customData: d0 }];
          try { for (const e of lib.convertToExcalidrawElements(skel)) addedEls.push(e); } catch (e) { console.error("[canvas-sketch] add image failed:", e); }
        }

        api.updateScene({ elements: [...next.filter((e) => !removeIds.has(e.id)), ...addedEls] });
        if (editable) queueSave();
      },
    };
    return () => { if (controlsRef) controlsRef.current = null; };
  }, [controlsRef, doSave, queueSave, editable]);

  // flush ตอนสลับแท็บ/ปิด modal — ถ้ายังมีแก้ค้าง บันทึกให้เลย (เว้นกรณีผู้ใช้เลือก "ทิ้ง")
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (editable && dirtyRef.current && !discardRef.current) void doSave(true);
  }, [doSave, editable]);

  // เตือนตอนปิดแท็บ/ออกจากหน้า ถ้ายังมีงานค้างเซฟ (กำลังบันทึกอยู่หรือยังไม่ได้บันทึก)
  useEffect(() => {
    if (!editable) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        void doSave(true);
        if (isUnloadSuppressed()) return; // กำลังยิง external app (เช่นเปิดโฟลเดอร์) — หน้าไม่ได้ออกจริง ไม่ต้องเตือน
        e.preventDefault(); e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editable, doSave]);

  // ล้อเมาส์ = ซูมเข้าหาตำแหน่งเมาส์ (shift+ล้อ = เลื่อนแนวนอนตามปกติ) + ดับเบิลคลิกการ์ด → เปิด drawer
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null); // tooltip ลอยตอนชี้การ์ดที่มี customData.tooltip
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return;
      if ((e.target as HTMLElement)?.tagName !== "CANVAS") return; // อยู่บนแผงเครื่องมือ/เมนู → เลื่อนปกติ ไม่ซูม
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
    // hover → tooltip (เฉพาะ element ที่มี customData.tooltip เช่น การ์ดโฟลเดอร์) · throttle ด้วย rAF
    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const api = apiRef.current; if (!api) return;
        if ((e.target as HTMLElement)?.tagName !== "CANVAS") { setTip(null); return; }
        const st = api.getAppState(); const z = st.zoom?.value || 1;
        const px = (e.clientX - (st.offsetLeft ?? 0)) / z - st.scrollX;
        const py = (e.clientY - (st.offsetTop ?? 0)) / z - st.scrollY;
        const els = api.getSceneElements() as any[];
        let found: string | null = null;
        for (let i = els.length - 1; i >= 0; i--) {
          const it = els[i]; const d = it?.customData;
          if (d?.tooltip && px >= it.x && px <= it.x + it.width && py >= it.y && py <= it.y + it.height) { found = String(d.tooltip); break; }
        }
        if (found) { const rect = el.getBoundingClientRect(); setTip({ text: found, x: e.clientX - rect.left, y: e.clientY - rect.top }); }
        else setTip(null);
      });
    };
    const onLeave = () => setTip(null);
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("dblclick", onDbl, { capture: true });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("wheel", onWheel, true); el.removeEventListener("dblclick", onDbl, true); el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); if (rafId) cancelAnimationFrame(rafId); };
  }, [scene]); // ผูกใหม่หลังกระดานโหลดเสร็จ (ตอน mount แรก wrapRef ยังไม่ render เพราะอยู่สถานะ loading)

  // ปรับขนาด font ของ text ที่เลือก (ละเอียดกว่า S/M/L/XL ของ Excalidraw)
  const setFont = (size: number) => {
    const api = apiRef.current; if (!api) return;
    const ns = Math.min(200, Math.max(8, Math.round(size)));
    const sel = api.getAppState().selectedElementIds || {};
    api.updateScene({ elements: (api.getSceneElements() as any[]).map((e) => (e.type === "text" && sel[e.id] && e.fontSize) ? { ...e, fontSize: ns, width: e.width * (ns / e.fontSize), height: e.height * (ns / e.fontSize) } : e) });
    setSelFont(ns);
    if (editable) queueSave();
  };

  // ทำ "หัวข้อย่อย" (•) หรือ "เลขลำดับ" (1. 2. 3.) ให้กล่องข้อความที่เลือก — workaround (Excalidraw ไม่มี list ในตัว)
  const listifySelected = (mode: "bullet" | "number") => {
    const api = apiRef.current; if (!api) return;
    const sel = api.getAppState().selectedElementIds || {};
    api.updateScene({ elements: (api.getSceneElements() as any[]).map((e) => {
      if (e.type !== "text" || !sel[e.id] || e.isDeleted) return e;
      let i = 0;
      const text = String(e.text ?? "").split("\n").map((ln: string) => {
        const s = ln.replace(/^\s*(?:[•\-]\s+|\d+\.\s+)/, "");   // ลบ bullet/เลขเดิมก่อน (กดซ้ำ = สลับ/อัปเดต)
        if (!s.trim()) return s;
        i++;
        return mode === "bullet" ? `• ${s}` : `${i}. ${s}`;
      }).join("\n");
      return { ...e, text, originalText: text, version: (e.version ?? 0) + 1 };
    }) });
    if (editable) queueSave();
  };

  // ต่อ "รายการ" อัตโนมัติ: กด Enter ในกล่องข้อความที่บรรทัดเป็น list (• / 1.) → ขึ้นบรรทัดใหม่ต่อเลข/หัวข้อให้เอง
  // Excalidraw ไม่มี list ในตัว — ดักที่ textarea ตอนแก้ข้อความ (บรรทัด list ว่างแล้วกด Enter = ออกจากรายการ)
  useEffect(() => {
    if (!editable) return;
    const setVal = (ta: HTMLTextAreaElement, v: string) => {
      const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (d?.set) d.set.call(ta, v); else ta.value = v;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const ta = document.activeElement as HTMLTextAreaElement | null;
      if (!ta || ta.tagName !== "TEXTAREA") return;
      if (!ta.classList.contains("excalidraw-wysiwyg") && !wrapRef.current?.contains(ta)) return; // เฉพาะกล่องข้อความ Excalidraw
      const val = ta.value;
      const pos = ta.selectionStart ?? val.length;
      const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
      const lineEndIdx = val.indexOf("\n", pos);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const fullLine = val.slice(lineStart, lineEnd);
      const numM = fullLine.match(/^(\s*)(\d+)\.\s(.*)$/);
      const bulM = numM ? null : fullLine.match(/^(\s*)([•-])\s(.*)$/);
      if (!numM && !bulM) return; // ไม่ใช่บรรทัด list → ปล่อย Enter ปกติ
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); // กัน Excalidraw ใส่ newline ซ้ำ
      const indent = numM?.[1] ?? bulM?.[1] ?? "";
      const content = numM?.[3] ?? bulM?.[3] ?? "";
      let next: string, caret: number;
      if (content.trim() === "") {
        next = val.slice(0, lineStart) + indent + val.slice(lineEnd); // list ว่าง → ออกจากรายการ (ลบหัวข้อ)
        caret = lineStart + indent.length;
      } else {
        const prefix = numM ? `${indent}${parseInt(numM[2], 10) + 1}. ` : `${indent}${bulM![2]} `;
        const ins = "\n" + prefix;
        next = val.slice(0, pos) + ins + val.slice(pos);
        caret = pos + ins.length;
      }
      setVal(ta, next);
      ta.selectionStart = ta.selectionEnd = caret;
      ta.dispatchEvent(new Event("input", { bubbles: true })); // ให้ Excalidraw รับข้อความใหม่ + ปรับขนาดกล่อง
    };
    window.addEventListener("keydown", onKeyDown, true); // capture ก่อน Excalidraw
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editable]);

  // ถอนโฟกัสจากปุ่ม/ช่องของเรา → คืนให้กระดาน เพื่อให้คีย์ลัด (R/A/T/P) ทำงาน
  const blurActive = () => { try { (document.activeElement as HTMLElement)?.blur?.(); } catch { /* noop */ } };

  // ล้างกระดานทั้งหมด (ตั้งใจ) — มาร์คทุกชิ้นเป็นลบ + เซฟว่าง (ข้ามตัวกันเซฟว่าง) + ซิงค์ให้คนอื่น
  const clearBoard = () => {
    const api = apiRef.current; if (!api) return;
    if (!window.confirm("ล้างกระดานทั้งหมด? ลบทุกอย่างออก (กู้คืนไม่ได้)")) return;
    const all = api.getSceneElementsIncludingDeleted() as any[];
    const cleared = all.map((e) => e.isDeleted ? e : { ...e, isDeleted: true, version: (e.version ?? 0) + 1 });
    api.updateScene({ elements: cleared });
    latestRef.current = { elements: cleared, appState: api.getAppState(), files: {} };
    allowEmptyRef.current = true;
    lastChangeSigRef.current = sceneSig(cleared);
    if (collab && !applyingRemoteRef.current) broadcast(); // ส่งการลบให้คนอื่น
    void doSave(true);
  };

  // แปลข้อความที่เลือก (ไทย↔อังกฤษ ผ่าน Cloudflare AI) → วางกล่องใหม่ข้างๆ ของเดิม
  const [translating, setTranslating] = useState(false);
  const translateSelected = async () => {
    const api = apiRef.current; if (!api) return;
    const sel = api.getAppState().selectedElementIds || {};
    const texts = (api.getSceneElements() as any[]).filter((e) => e.type === "text" && sel[e.id] && !e.isDeleted && (e.text ?? "").trim());
    if (!texts.length) return;
    setTranslating(true);
    try {
      const lib: any = await import("@excalidraw/excalidraw");
      const skeletons: Record<string, unknown>[] = [];
      for (const el of texts) {
        try {
          const res = await apiFetch("/api/ai/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: el.text }) });
          const j = await res.json(); if (j.error) throw new Error(j.error);
          skeletons.push({ type: "text", x: el.x + (el.width || 200) + 28, y: el.y, text: String(j.data.translated), fontSize: el.fontSize || 20, strokeColor: el.strokeColor || "#1e293b", width: el.width || undefined });
        } catch { /* ข้ามกล่องที่แปลไม่ได้ */ }
      }
      if (skeletons.length) {
        const els = lib.convertToExcalidrawElements(skeletons);
        api.updateScene({ elements: [...api.getSceneElements(), ...els] });
        if (editable) queueSave();
      }
    } finally { setTranslating(false); }
  };

  // โน้ตคอมเมนต์ (annotation) — วางกล่องโน้ตกลางจอ มีชื่อผู้เขียน+เวลา, กรอบสีประจำคน
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const addNote = async (text: string) => {
    const api = apiRef.current; const body = text.trim();
    if (!api || !body) return;
    try {
      const lib: any = await import("@excalidraw/excalidraw");
      const st = api.getAppState();
      const center = lib.viewportCoordsToSceneCoords(
        { clientX: (st.offsetLeft ?? 0) + (st.width ?? 800) / 2, clientY: (st.offsetTop ?? 0) + (st.height ?? 600) / 2 }, st);
      const authorName = user?.name || "ไม่ทราบชื่อ";
      const color = user?.id ? userColor(user.id) : "#eab308";
      const when = new Date().toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const full = `💬 ${authorName} · ${when}\n${body}`;
      const W = 250;
      const rows = full.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil((ln.length || 1) / 32)), 0);
      const H = 22 + rows * 20;
      const gid = `note-${Math.random().toString(36).slice(2, 8)}`;
      const data = { note: true, author: authorName, author_id: user?.id ?? null, at: Date.now() };
      const skeletons: Record<string, unknown>[] = [
        { type: "rectangle", x: center.x, y: center.y, width: W, height: H, backgroundColor: "#fffbeb", strokeColor: color, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
        { type: "text", x: center.x + 12, y: center.y + 11, width: W - 24, text: full, fontSize: 14, strokeColor: "#78350f", groupIds: [gid], customData: data },
      ];
      api.updateScene({ elements: [...api.getSceneElements(), ...lib.convertToExcalidrawElements(skeletons)] });
      if (editable) queueSave();
    } catch (e) { console.error("[canvas-sketch] add note failed:", e); }
  };
  const submitNote = () => { void addNote(noteText); setNoteText(""); setNoteOpen(false); };

  // ── แคปเฉพาะพื้นที่ (ลากคลุม) → ส่งเข้ากลุ่ม LINE งาน ──
  const [capArmed, setCapArmed] = useState(false);            // โหมดลากคลุม
  const [capBox, setCapBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null); // กรอบที่ลาก (พิกัดในกรอบกระดาน)
  const capStartRef = useRef<{ cx: number; cy: number } | null>(null);
  const [capModal, setCapModal] = useState<{ blob: Blob; url: string } | null>(null); // พรีวิวก่อนส่ง
  const [capCaption, setCapCaption] = useState("");
  const [capSending, setCapSending] = useState(false);
  const [capMsg, setCapMsg] = useState<string | null>(null);

  const closeCap = useCallback(() => {
    setCapModal((m) => { if (m) URL.revokeObjectURL(m.url); return null; });
    setCapArmed(false); setCapBox(null); setCapCaption(""); setCapMsg(null); capStartRef.current = null;
  }, []);

  // Esc = ออกจากโหมดลากคลุม
  useEffect(() => {
    if (!capArmed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setCapArmed(false); setCapBox(null); capStartRef.current = null; } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capArmed]);

  const onCapDown = (e: RMouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current; if (!wrap) return;
    capStartRef.current = { cx: e.clientX, cy: e.clientY };
    const r = wrap.getBoundingClientRect();
    setCapBox({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
  };
  const onCapMove = (e: RMouseEvent<HTMLDivElement>) => {
    const s = capStartRef.current, wrap = wrapRef.current; if (!s || !wrap) return;
    const r = wrap.getBoundingClientRect();
    setCapBox({ x: Math.min(s.cx, e.clientX) - r.left, y: Math.min(s.cy, e.clientY) - r.top, w: Math.abs(e.clientX - s.cx), h: Math.abs(e.clientY - s.cy) });
  };
  const onCapUp = (e: RMouseEvent<HTMLDivElement>) => {
    const s = capStartRef.current; capStartRef.current = null; if (!s) return;
    if (Math.abs(e.clientX - s.cx) < 8 || Math.abs(e.clientY - s.cy) < 8) { setCapBox(null); return; } // เล็กไป
    void exportRegion({ x: s.cx, y: s.cy }, { x: e.clientX, y: e.clientY });
  };

  // แปลงพิกัดจอ→scene, กรองชิ้นงานที่อยู่ในกรอบ, export เป็น JPG
  const exportRegion = async (c0: { x: number; y: number }, c1: { x: number; y: number }) => {
    const api = apiRef.current; if (!api) return;
    try {
      const st = api.getAppState(); const z = st.zoom?.value || 1;
      const ox = st.offsetLeft ?? 0, oy = st.offsetTop ?? 0;
      const toScene = (cx: number, cy: number) => ({ x: (cx - ox) / z - st.scrollX, y: (cy - oy) / z - st.scrollY });
      const a = toScene(Math.min(c0.x, c1.x), Math.min(c0.y, c1.y));
      const b = toScene(Math.max(c0.x, c1.x), Math.max(c0.y, c1.y));
      const inside = (api.getSceneElements() as any[]).filter((el) =>
        !el.isDeleted && el.x < b.x && el.x + (el.width || 0) > a.x && el.y < b.y && el.y + (el.height || 0) > a.y);
      if (!inside.length) { setCapArmed(false); setCapBox(null); setCapMsg(null); setTimeout(() => window.alert("ไม่มีอะไรในกรอบที่เลือก ลองลากคลุมใหม่"), 0); return; }
      const lib: any = await import("@excalidraw/excalidraw");
      const blob: Blob = await lib.exportToBlob({
        elements: inside, files: api.getFiles(), mimeType: "image/jpeg", quality: 0.92, maxWidthOrHeight: 1600,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
      });
      setCapBox(null);
      setCapModal({ blob, url: URL.createObjectURL(blob) }); setCapCaption(""); setCapMsg(null);
    } catch (e) { console.error("[canvas-sketch] capture failed:", e); setCapArmed(false); setCapBox(null); }
  };

  const sendCapture = async () => {
    if (!capModal) return;
    setCapSending(true); setCapMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", new File([capModal.blob], `cap-${Date.now()}.jpg`, { type: "image/jpeg" }));
      fd.append("folder", "canvas-line");
      fd.append("no_library", "1"); // รูปแคป — ไม่ลงคลังกลาง
      const up = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const uj = await up.json(); if (uj.error || !uj.r2_key) throw new Error(uj.error || "อัปโหลดรูปไม่สำเร็จ");
      const res = await apiFetch("/api/canvas-line/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_key: uj.r2_key, caption: capCaption, entity_type: entityType, entity_id: entityId }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setCapMsg("✓ ส่งเข้ากลุ่ม LINE แล้ว");
      setTimeout(() => closeCap(), 1200);
    } catch (e) { setCapMsg("⚠ " + ((e as Error).message || "ส่งไม่สำเร็จ")); }
    finally { setCapSending(false); }
  };

  if (scene === "loading") {
    return <div className="flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl" style={{ height }}>กำลังโหลดกระดาน...</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className={`flex flex-wrap items-center gap-2${stickyTop != null ? " sticky z-30 bg-white/95 backdrop-blur border-b border-slate-100 py-1.5 -mx-1 px-1" : ""}`}
        style={stickyTop != null ? { top: stickyTop } : undefined}>
        <span className="text-xs text-slate-400 flex-1 min-w-[200px]">
          🖼 วางรูป = copy แล้วกด Ctrl+V ในกระดาน · ⬛ กล่อง=R · ➡ ลูกศร=A · 🔤 ข้อความ=T · ✏ วาด=P
        </span>
        {editable && serverCanEdit && selFont != null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-md px-1.5 py-0.5">
            <span className="text-slate-400">ขนาดอักษร</span>
            <button onClick={() => { setFont(selFont - 2); blurActive(); }} className="h-5 w-5 rounded hover:bg-slate-100">−</button>
            <input type="number" value={selFont} onChange={(e) => { const v = parseInt(e.target.value || "0", 10); if (v) setFont(v); }} className="w-12 h-6 text-center border border-slate-200 rounded" />
            <button onClick={() => { setFont(selFont + 2); blurActive(); }} className="h-5 w-5 rounded hover:bg-slate-100">＋</button>
          </span>
        )}
        {editable && serverCanEdit && selFont != null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-md px-1.5 py-0.5">
            <span className="text-slate-400">รายการ</span>
            <button onClick={() => { listifySelected("bullet"); blurActive(); }} title="ทำหัวข้อย่อย (•) ให้ข้อความที่เลือก" className="h-5 px-1.5 rounded hover:bg-slate-100">• –</button>
            <button onClick={() => { listifySelected("number"); blurActive(); }} title="ใส่เลขลำดับ (1. 2. 3.) ให้ข้อความที่เลือก" className="h-5 px-1.5 rounded hover:bg-slate-100">1.</button>
          </span>
        )}
        {editable && serverCanEdit && selFont != null && (
          <button onClick={() => { void translateSelected(); blurActive(); }} disabled={translating} title="แปลข้อความที่เลือก ไทย↔อังกฤษ (วางกล่องใหม่ข้างๆ)"
            className="inline-flex items-center gap-1 text-[11px] text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50 disabled:opacity-50">
            {translating ? "⏳ กำลังแปล..." : "🌐 แปลภาษา"}
          </button>
        )}
        {editable && serverCanEdit && (
          <div className="relative">
            <button onClick={() => setNoteOpen((o) => !o)} title="เพิ่มโน้ตคอมเมนต์ (มีชื่อคุณ + เวลา กำกับ)"
              className="inline-flex items-center gap-1 text-[11px] text-amber-700 border border-amber-200 rounded-md px-2 py-0.5 hover:bg-amber-50">
              💬 คอมเมนต์
            </button>
            {noteOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-2">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitNote(); } else if (e.key === "Escape") setNoteOpen(false); }}
                  rows={3} placeholder="พิมพ์คอมเมนต์... (Ctrl+Enter = วาง)"
                  className="w-full text-sm border border-slate-200 rounded-md p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300" />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-slate-400">ใส่ชื่อ {user?.name || "คุณ"} + เวลาให้อัตโนมัติ</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setNoteOpen(false); setNoteText(""); }} className="h-6 px-2 text-[11px] text-slate-500 rounded hover:bg-slate-100">ยกเลิก</button>
                    <button onClick={submitNote} disabled={!noteText.trim()} className="h-6 px-2 text-[11px] text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50">วางโน้ต</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {editable && serverCanEdit && (
          <button onClick={() => { setCapArmed(true); setCapMsg(null); blurActive(); }} title="ลากคลุมพื้นที่ → ส่งรูปเข้ากลุ่ม LINE งาน"
            className={`inline-flex items-center gap-1 text-[11px] border rounded-md px-2 py-0.5 ${capArmed ? "text-white bg-green-600 border-green-600" : "text-green-700 border-green-200 hover:bg-green-50"}`}>
            📷 {capArmed ? "ลากคลุมพื้นที่..." : "ส่ง LINE"}
          </button>
        )}
        {editable && serverCanEdit && (
          <button onClick={() => { clearBoard(); blurActive(); }} title="ล้างกระดานทั้งหมด (ลบทุกอย่างออก)"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-md px-2 py-0.5">
            🗑 ล้าง
          </button>
        )}
        {collab && peerList.length > 0 && (
          <span className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 rounded-md px-2 py-0.5" title="คนที่กำลังดู/แก้กระดานนี้พร้อมคุณ">
            <span className="flex -space-x-1.5">
              {peerList.slice(0, 6).map((p) => (
                <span key={p.id} title={`${p.name}${p.editing ? " · กำลังแก้อยู่" : ""}`}
                  className="relative inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white text-[9px] font-bold text-white overflow-hidden"
                  style={{ backgroundColor: p.color }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.avatar ? <img src={avatarSrc(p.avatar, 48) ?? ""} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
                  {p.editing && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white animate-pulse" />}
                </span>
              ))}
            </span>
            {peerList.length > 6 && <span className="text-[11px] text-slate-500">+{peerList.length - 6}</span>}
            <span className="text-[11px] text-emerald-700 font-medium">{peerList.length} คนออนไลน์</span>
          </span>
        )}
        {editable && !serverCanEdit && <span className="text-[11px] inline-flex items-center gap-1 text-amber-600">👁 อ่านอย่างเดียว (ไม่มีสิทธิ์แก้)</span>}
      </div>
      <div ref={wrapRef} className="relative rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height }}>
        {/* tooltip ลอยตอนชี้การ์ดที่มี customData.tooltip (เช่น การ์ดโฟลเดอร์) */}
        {tip && (
          <div className="absolute z-20 pointer-events-none px-2 py-1 rounded-md bg-slate-800 text-white text-[11px] shadow-lg whitespace-nowrap max-w-[260px] truncate" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>
        )}
        {/* ป้ายสถานะบันทึก — ลอยกลางล่าง โชว์เฉพาะ "กำลังบันทึก/บันทึกแล้ว/ผิดพลาด" (ไม่โชว์ตอนแก้ไขเฉย ๆ) */}
        {editable && serverCanEdit && saveState !== "dirty" && (saveState !== "idle" || savedAt) && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm border bg-white/95 backdrop-blur ${
              saveState === "error" ? "text-rose-600 border-rose-200"
              : saveState === "saving" ? "text-blue-600 border-blue-200"
              : "text-emerald-600 border-emerald-200"}`}>
              {saveState === "saving" ? "⏳ กำลังบันทึก..."
              : saveState === "error" ? "⚠ บันทึกไม่สำเร็จ"
              : savedAt ? `✓ บันทึกแล้ว${lastMerged ? " (รวมงานกับคนอื่น)" : ""} · ${savedAt}`
              : ""}
            </span>
            {saveState === "error" && <button onClick={() => void doSave(true)} className="h-6 px-2 text-[11px] bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm">ลองใหม่</button>}
          </div>
        )}
        <Excalidraw
          langCode="th-TH"
          showDeprecatedFonts   // โชว์ฟอนต์ครบ 8 ตัว (Virgil/Helvetica/Cascadia/Liberation) → แมปเป็นฟอนต์ไทย 8 แบบ
          viewModeEnabled={!(editable && serverCanEdit)}
          excalidrawAPI={(a: any) => { apiRef.current = a; }}
          initialData={scene
            ? { elements: scene.elements as any, files: scene.files as any, appState: { objectsSnapModeEnabled: true }, scrollToContent: true }
            : { appState: { objectsSnapModeEnabled: true } }}
          onChange={(elements: any, appState: any, files: any) => {
            // จับ snapshot — แต่ "อย่า" ให้ตอน Excalidraw เคลียร์เป็นว่าง (teardown/ปิดหน้า) มาทับ snapshot ดี (กันเซฟว่าง)
            const hasLive = (elements as any[]).some((e) => !e.isDeleted);
            if (hasLive || !hadContentRef.current) latestRef.current = { elements, appState, files };
            const sel = appState?.selectedElementIds || {};
            const tx = (elements as any[]).find((e) => !e.isDeleted && e.type === "text" && sel[e.id]);
            setSelFont(tx ? Math.round(tx.fontSize) : null);
            if ((elements as any[]).some((e) => !e.isDeleted)) hadContentRef.current = true; // เคยมีงานจริง
            if (readyRef.current && editable && canEditRef.current) hoistImages(files); // รูป base64 ที่เพิ่งแปะ → ย้ายขึ้น R2
            // เซฟ/ส่ง เฉพาะเมื่อ "ชิ้นงานเปลี่ยนจริง" (ข้ามการเลือก/เลื่อนจอที่ไม่กระทบเนื้อหา → กันกระพริบ/loop)
            if (readyRef.current && editable && canEditRef.current) {
              const sig = sceneSig(elements as any[]);
              if (sig !== lastChangeSigRef.current) {
                lastChangeSigRef.current = sig;
                queueSave();
                if (collab && !applyingRemoteRef.current) broadcast();
              }
            }
          }}
          onLinkOpen={(el: any, ev: any) => {
            // การ์ดของเรา (มี customData.kind) → เปิด drawer แทนการเปิดลิงก์
            const data = el?.customData as Record<string, unknown> | undefined;
            if (data?.kind && cardCbRef.current) { ev?.preventDefault?.(); cardCbRef.current(data); }
          }}
        />
        {/* โหมดลากคลุมพื้นที่เพื่อแคปส่ง LINE — overlay จับเมาส์ทับกระดาน */}
        {capArmed && !capModal && (
          <div className="absolute inset-0 z-40 cursor-crosshair" onMouseDown={onCapDown} onMouseMove={onCapMove} onMouseUp={onCapUp}>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/85 text-white text-[11px] px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap">ลากคลุมพื้นที่ที่จะส่ง LINE · Esc = ยกเลิก</div>
            {capBox && <div className="absolute border-2 border-green-500 bg-green-400/15 pointer-events-none" style={{ left: capBox.x, top: capBox.y, width: capBox.w, height: capBox.h }} />}
          </div>
        )}
      </div>
      {/* พรีวิว + ยืนยันส่งเข้า LINE (portal → ทับทุกอย่าง แม้เต็มจอ) */}
      {capModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={() => { if (!capSending) closeCap(); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">📷 ส่งรูปเข้ากลุ่ม LINE งาน</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capModal.url} alt="preview" className="w-full max-h-64 object-contain rounded-lg border border-slate-200 bg-slate-50" />
            <textarea value={capCaption} onChange={(e) => setCapCaption(e.target.value)} rows={2} placeholder="ข้อความประกอบ (ไม่ใส่ก็ได้)"
              className="mt-2 w-full text-sm border border-slate-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-300" />
            {capMsg && <p className={`text-xs mt-1.5 ${capMsg.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{capMsg}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={closeCap} disabled={capSending} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
              <button onClick={() => void sendCapture()} disabled={capSending} className="h-9 px-4 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">{capSending ? "กำลังส่ง..." : "ส่งเข้า LINE"}</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
