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

import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import { apiFetch } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-slate-400 text-sm">กำลังโหลดกระดาน...</div>,
});

type Scene = { elements?: unknown[]; files?: Record<string, unknown> } | null;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1000;       // หยุดวาดกี่ ms แล้วค่อยบันทึก (เซฟไวขึ้น)
const MAX_AUTOSAVE_MS = 8000;   // เซฟกันลืม: แม้แก้ต่อเนื่องไม่หยุด ก็เซฟทุก ~8 วิ
const BROADCAST_MS = 200;       // realtime: ส่งให้คนอื่นทุก ~200ms (throttle)
const BC_MAX_BYTES = 200_000;   // กันส่งก้อนใหญ่เกินลิมิต Supabase Broadcast (ของใหญ่ปล่อยให้ save+refresh sync)

// ลายเซ็นกระดานแบบเบา (count + version รวม + id) — ใช้เทียบว่าเปลี่ยนจริงไหม กัน loop realtime
function sceneSig(els: { id?: string; version?: number }[]): string {
  let h = els.length | 0;
  for (const e of els) h = (Math.imul(h, 31) + (e.version ?? 0) + (e.id ? e.id.charCodeAt(0) + e.id.length : 0)) | 0;
  return `${els.length}:${h}`;
}

// รวมชิ้นงาน 2 ฝั่งต่อ id — เอาตัว version ใหม่กว่า (รองรับลบด้วย isDeleted) · เสมอกัน = เก็บฝั่ง a (ของเรา)
function mergeById(a: any[], b: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of a) if (e?.id) map.set(e.id, e);
  for (const e of b) { if (!e?.id) continue; const cur = map.get(e.id); if (!cur || (e.version ?? 0) > (cur.version ?? 0)) map.set(e.id, e); }
  return [...map.values()];
}

// ย่อรูป (จาก dataURL base64) ให้ด้านยาวสุด ≤ max px ก่อนอัป R2 — กันไฟล์ใหญ่เกินลิมิต + กระดานเบา (PNG คงโปร่งใส)
async function resizeDataUrl(dataURL: string, mime: string, max = 1600): Promise<{ blob: Blob; type: string }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  const type = mime === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), type, 0.85));
  return { blob, type };
}

/** ตัวควบคุมกระดานจากภายนอก (เช่น popup เจ้าของ เรียกบันทึก/ทิ้งตอนถามก่อนปิด)
 *  insert(skeletons): แทรก element ลงกลางจอ — skeletons เป็น Excalidraw skeleton (x,y นับจาก 0) แล้วระบบจะเลื่อนไปกลางจอให้ */
export type CanvasSketchControls = {
  isDirty: () => boolean; save: () => Promise<void>; discard: () => void;
  insert: (skeletons: Record<string, unknown>[]) => Promise<void>;
  listCards: () => { kind: string; data: Record<string, unknown> }[];
  /** ซิงค์ข้อความบนการ์ดสด — builder คืน {text, data?} เพื่ออัปเดตข้อความ+snapshot (เช่น งานย่อยล่าสุด) */
  refreshCards: (builder: (card: { kind: string; id: string; data: Record<string, unknown> }) => Promise<{ text: string; data?: Record<string, unknown> } | null>) => Promise<void>;
};

export function CanvasSketch({
  entityType, entityId, editable = true, height = "58vh", onDirtyChange, controlsRef, onCardOpen, onReady, collab = false,
}: {
  entityType: string;
  entityId:   string;
  editable?:  boolean;
  height?:    string;
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
  const [peers, setPeers] = useState(0); // realtime: จำนวนคนอื่นในห้อง
  const [serverCanEdit, setServerCanEdit] = useState(true); // server บอกว่าผู้ใช้มีสิทธิ์แก้ไหม (viewer = false)
  const canEditRef = useRef(true);

  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null); // Supabase Realtime channel
  const applyingRemoteRef = useRef(false);   // กันส่งซ้ำตอนเอาของคนอื่นมาวาง
  const bcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>("");     // ลายเซ็นกระดานล่าสุดที่ส่ง/รับ — กัน loop ส่งวนไม่จบ
  const lastVerRef = useRef<Map<string, number>>(new Map()); // version ล่าสุดต่อ element ที่ส่ง/รับ — ส่งเฉพาะที่เปลี่ยน (delta)
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
  const markDirty  = (d: boolean) => { dirtyRef.current = d; dirtyCbRef.current?.(d); };

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
        setTimeout(() => { readyRef.current = true; if (alive) readyCbRef.current?.(); }, 800);
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

  // realtime: ส่งเฉพาะ "ชิ้นที่เปลี่ยน" (delta) ให้คนอื่นในห้อง (throttle ~200ms) ผ่าน Supabase Broadcast
  const broadcast = useCallback(() => {
    if (!collab) return;
    if (bcTimerRef.current) return; // มีคิวส่งอยู่แล้ว
    bcTimerRef.current = setTimeout(() => {
      bcTimerRef.current = null;
      const a = apiRef.current; const ch = channelRef.current;
      if (!a || !ch) return;
      const els = a.getSceneElementsIncludingDeleted() as any[];
      const sig = sceneSig(els);
      if (sig === lastSigRef.current) return; // ไม่เปลี่ยนจากที่ส่ง/รับล่าสุด → ไม่ส่ง (กัน loop)
      lastSigRef.current = sig;
      const changed = els.filter((e) => (e.version ?? 0) > (lastVerRef.current.get(e.id) ?? -1)); // เฉพาะที่เปลี่ยน
      if (!changed.length) return;
      for (const e of changed) lastVerRef.current.set(e.id, e.version ?? 0);
      const payload = { els: changed };
      try {
        if (JSON.stringify(payload).length > BC_MAX_BYTES) return; // ใหญ่ไป → ข้าม (save+refresh จะ sync)
        void ch.send({ type: "broadcast", event: "scene", payload });
      } catch { /* noop */ }
    }, BROADCAST_MS);
  }, [collab]);

  // realtime: เอาของคนอื่นมา merge (เลือกตัว version ใหม่กว่าต่อ id — รองรับลบด้วย isDeleted)
  const applyRemote = useCallback((remoteEls: any[]) => {
    const api = apiRef.current; if (!api || !Array.isArray(remoteEls)) return;
    const local = api.getSceneElementsIncludingDeleted() as any[];
    const byId = new Map<string, any>(local.map((e) => [e.id, e]));
    let changed = false;
    for (const r of remoteEls) {
      if (!r?.id) continue;
      lastVerRef.current.set(r.id, Math.max(lastVerRef.current.get(r.id) ?? -1, r.version ?? 0)); // จำว่ารับแล้ว → ไม่ส่งกลับ
      const cur = byId.get(r.id);
      if (!cur || (r.version ?? 0) > (cur.version ?? 0)) { byId.set(r.id, r); changed = true; }
    }
    if (!changed) return;
    const merged = [...byId.values()];
    lastSigRef.current = sceneSig(merged); // จำลายเซ็นของที่เพิ่งรับ → onChange ที่ตามมาจะไม่ส่งซ้ำ (ตัด loop)
    applyingRemoteRef.current = true;
    try { api.updateScene({ elements: merged }); }
    finally { setTimeout(() => { applyingRemoteRef.current = false; }, 0); }
  }, []);

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
          const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
          const j = await res.json(); if (j.error || !j.r2_key) throw new Error(j.error || "upload failed");
          const r2url = `/api/r2-image?key=${encodeURIComponent(j.r2_key)}`;
          apiRef.current?.addFiles([{ id: fid, dataURL: r2url, mimeType: type, created: Date.now() }]);
          try { channelRef.current?.send({ type: "broadcast", event: "files", payload: { files: [{ id: fid, dataURL: r2url, mimeType: type, created: Date.now() }] } }); } catch { /* noop */ }
        } catch (e) { console.error("[canvas] hoist image failed:", e); hoistedRef.current.delete(fid); } // ล้มเหลว → คงเป็น base64 (ยังใช้ได้ในเครื่อง)
        finally { uploadingRef.current = Math.max(0, uploadingRef.current - 1); if (uploadingRef.current === 0 && editable && canEditRef.current) queueSave(); }
      })();
    }
  }, [editable, queueSave]);

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
      // ซิงค์ข้อความบนการ์ดสด: ไล่กลุ่ม (group) ที่เป็นการ์ด → builder คืนข้อความใหม่ → อัปเดต text + ปรับสูงกล่อง
      refreshCards: async (builder) => {
        const api = apiRef.current; if (!api) return;
        const els = api.getSceneElements() as any[];
        const groups = new Map<string, any[]>();
        for (const el of els) {
          const gid = el?.groupIds?.[0]; const d = el?.customData as Record<string, unknown> | undefined;
          if (!gid || !d?.kind) continue;
          const arr = groups.get(gid) ?? []; arr.push(el); groups.set(gid, arr);
        }
        const updates = new Map<string, { text: string; data?: Record<string, unknown> }>();
        for (const [gid, arr] of groups) {
          const d = arr[0].customData as Record<string, unknown>;
          try { const res = await builder({ kind: String(d.kind), id: String(d.id ?? ""), data: d }); if (res && res.text != null) updates.set(gid, res); }
          catch { /* ข้ามการ์ดที่ดึงไม่ได้ */ }
        }
        if (updates.size === 0) return;
        const next = els.map((el) => {
          const gid = el?.groupIds?.[0]; const u = gid ? updates.get(gid) : undefined; if (!u) return el;
          const merged = { ...el.customData, ...(u.data ?? {}) };
          if (el.type === "text") { const lines = u.text.split("\n").length; const fs = el.fontSize ?? 14; return { ...el, text: u.text, originalText: u.text, height: Math.round(lines * fs * 1.25), customData: merged }; }
          if (el.type === "rectangle") { const lines = u.text.split("\n").length; return { ...el, height: 40 + lines * 18, customData: merged }; }
          return { ...el, customData: merged };
        });
        api.updateScene({ elements: next });
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
      if (dirtyRef.current || savingRef.current) { void doSave(true); e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editable, doSave]);

  // realtime: ต่อห้อง Supabase Broadcast (browser ↔ Supabase ตรงๆ ไม่ผ่าน Cloudflare worker → ไม่กิน CPU)
  // ห้องแบบ private — เฉพาะผู้ใช้ที่ล็อกอิน (RLS realtime.messages policy canvas:* / authenticated)
  useEffect(() => {
    if (!collab || !editable || scene === "loading") return;
    lastVerRef.current = new Map();
    const room = `canvas:${entityType}:${entityId}`;
    const myKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;
    let cancelled = false;
    void (async () => {
      // ส่ง token ของผู้ใช้ให้ realtime ก่อนเข้าห้อง private (กัน race ตอนเพิ่งโหลด session จาก localStorage)
      try { const { data } = await supabaseBrowser.auth.getSession(); const tok = data.session?.access_token; if (tok) await supabaseBrowser.realtime.setAuth(tok); } catch { /* ไม่มี token ก็ลองต่อ — ถ้าไม่ผ่านจะใช้กระดานแบบเดี่ยวได้ปกติ */ }
      if (cancelled) return;
      const ch = supabaseBrowser.channel(room, { config: { private: true, broadcast: { self: false }, presence: { key: myKey } } });
      ch
        .on("broadcast", { event: "scene" }, (msg: { payload?: { els?: any[] } }) => { applyRemote(msg?.payload?.els ?? []); })
        .on("broadcast", { event: "files" }, (msg: { payload?: { files?: any[] } }) => { const fs = msg?.payload?.files; if (fs?.length && apiRef.current) { try { apiRef.current.addFiles(fs); } catch { /* noop */ } } })
        .on("presence", { event: "sync" }, () => { const n = Object.keys(ch.presenceState()).length; setPeers(Math.max(0, n - 1)); })
        .subscribe((status) => { if (status === "SUBSCRIBED") void ch.track({ at: Date.now() }); });
      channel = ch;
      channelRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (channel) { try { void supabaseBrowser.removeChannel(channel); } catch { /* noop */ } }
      channelRef.current = null; setPeers(0);
    };
  }, [collab, editable, scene, entityType, entityId, applyRemote]);

  // ล้อเมาส์ = ซูมเข้าหาตำแหน่งเมาส์ (shift+ล้อ = เลื่อนแนวนอนตามปกติ) + ดับเบิลคลิกการ์ด → เปิด drawer
  const wrapRef = useRef<HTMLDivElement>(null);
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
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("dblclick", onDbl, { capture: true });
    return () => { el.removeEventListener("wheel", onWheel, true); el.removeEventListener("dblclick", onDbl, true); };
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

  if (scene === "loading") {
    return <div className="flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl" style={{ height }}>กำลังโหลดกระดาน...</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
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
          <button onClick={() => { void translateSelected(); blurActive(); }} disabled={translating} title="แปลข้อความที่เลือก ไทย↔อังกฤษ (วางกล่องใหม่ข้างๆ)"
            className="inline-flex items-center gap-1 text-[11px] text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50 disabled:opacity-50">
            {translating ? "⏳ กำลังแปล..." : "🌐 แปลภาษา"}
          </button>
        )}
        {editable && serverCanEdit && (
          <button onClick={() => { clearBoard(); blurActive(); }} title="ล้างกระดานทั้งหมด (ลบทุกอย่างออก)"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-md px-2 py-0.5">
            🗑 ล้าง
          </button>
        )}
        {collab && peers > 0 && (
          <span className="text-[11px] inline-flex items-center gap-1 text-emerald-600 border border-emerald-200 bg-emerald-50 rounded-md px-2 py-0.5" title="คนอื่นกำลังดู/แก้กระดานนี้พร้อมคุณ">
            👥 {peers} คนออนไลน์
          </span>
        )}
        {editable && !serverCanEdit && <span className="text-[11px] inline-flex items-center gap-1 text-amber-600">👁 อ่านอย่างเดียว (ไม่มีสิทธิ์แก้)</span>}
      </div>
      <div ref={wrapRef} className="relative rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height }}>
        {/* ป้ายสถานะบันทึก — ลอยกลางล่าง เห็นชัดทุกครั้งที่เซฟ (กดลองใหม่ได้ตอน error) */}
        {editable && serverCanEdit && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm border bg-white/95 backdrop-blur ${
              saveState === "error" ? "text-rose-600 border-rose-200"
              : saveState === "saving" ? "text-blue-600 border-blue-200"
              : saveState === "dirty" ? "text-amber-600 border-amber-200"
              : "text-emerald-600 border-emerald-200"}`}>
              {saveState === "saving" ? "⏳ กำลังบันทึก..."
              : saveState === "error" ? "⚠ บันทึกไม่สำเร็จ"
              : saveState === "dirty" ? "✎ มีการแก้ไข กำลังจะบันทึก..."
              : savedAt ? `✓ บันทึกแล้ว${lastMerged ? " (รวมงานกับคนอื่น)" : ""} · ${savedAt}`
              : "พร้อมใช้งาน"}
            </span>
            {saveState === "error" && <button onClick={() => void doSave(true)} className="h-6 px-2 text-[11px] bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm">ลองใหม่</button>}
          </div>
        )}
        <Excalidraw
          langCode="th-TH"
          viewModeEnabled={!(editable && serverCanEdit)}
          excalidrawAPI={(a: any) => { apiRef.current = a; }}
          initialData={scene ? { elements: scene.elements as any, files: scene.files as any, scrollToContent: true } : undefined}
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
      </div>
    </div>
  );
}
