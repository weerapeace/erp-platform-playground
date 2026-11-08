"use client";

// ============================================================
// FlowchartBoard — กระดาน flowchart กลาง (ของกลาง · ใช้ React Flow / @xyflow/react)
//
// กล่อง 6 ชนิด (เริ่ม/จบ · ขั้นตอน · คำถาม ใช่/ไม่ใช่ · ที่เก็บ · โฟลเดอร์ · โน้ต) + เส้นต่อหักมุมอัตโนมัติ
// เส้นติดกล่องเสมอ · กล่องเข้าแถวตามตาราง · ย่อขยายกล่องได้ · เปลี่ยนสีได้ · ย้อนกลับ/ทำซ้ำ (Ctrl+Z / Ctrl+Y)
// คัดลอก/ตัด/วาง (Ctrl+C / X / V · วางข้ามหน้า/ข้ามแท็บได้ · วางข้อความจากที่อื่น = กล่องใหม่) · ทำซ้ำ Ctrl+D · เลือกทั้งหมด Ctrl+A
// เลือกหลายกล่อง: Shift/Ctrl+คลิก หรือ Shift+ลากคลุม → แถบเครื่องมือกลุ่ม (สี · คัดลอก · ทำซ้ำ · ลบ)
// บันทึกอัตโนมัติ (หยุดแก้ ~1 วิ) ลงตารางกลาง erp_canvas_sketches ผ่าน /api/canvas-sketch · เช็กเวอร์ชันกันทับกัน (รวมงานให้เอง)
// สิทธิ์ = map PERM ใน /api/canvas-sketch ตาม entityType (server ตัดสิน · ไม่มีสิทธิ์แก้ = ดูอย่างเดียวเอง)
//
// ใช้:   <FlowchartBoard entityType="storage_plan_flow" entityId="main" starter={(t) => scene} fileName="แผนผัง" />
// ใช้เมื่อ: ผังขั้นตอน/ผังตัดสินใจที่เป็นกล่องต่อเส้น · ห้ามใช้: วาดอิสระ/แปะรูป/การ์ดสินค้า → ใช้ CanvasSketch
// doc: docs/flowchart-board.md · ตรรกะล้วน: lib/flowchart.ts
// ============================================================

import "@xyflow/react/dist/style.css";
import "./flowchart.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MarkerType, ConnectionMode, NodeToolbar, Position,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { usePushToast } from "@/components/toast";
import { LoadingState, ErrorState, EmptyState } from "@/components/state-views";
import { askText } from "@/components/modal/ask-dialog";
import { FolderCardModal, openCanvasFolder } from "@/components/canvas-sketch/folder-card";
import { apiFetch } from "@/lib/api";
import { htmlToPngBlob, fitImageScale, imageFileName } from "@/lib/html-to-png";
import { downloadBlob } from "@/lib/image-clipboard";
import {
  EMPTY_FLOW_SCENE, FLOW_CLIP_MIME, FLOW_KINDS, FLOW_KIND_META, GRID, autoEdgeLabel, cloneFlowSceneAt, copyFlowSelection, flowClipText,
  flowSceneSig, makeFlowNode, mergeFlowScenes, newFlowId, parseFlowClip, parseFlowScene, placeFlowClip, serializeFlowClip, textToFlowNode,
  toFlowScene, type FlowClip, type FlowKind, type FlowNodeData, type FlowScene,
} from "@/lib/flowchart";
import { FlowBoardCtx, FlowEdgeView, FlowNodeView, FlowTools, type FlowBoardActions, type FlowRFNode } from "./nodes";
import { flowSceneToHtml } from "./export-html";

const NODE_TYPES = Object.fromEntries(FLOW_KINDS.map((k) => [k, FlowNodeView]));
const EDGE_TYPES = { flow: FlowEdgeView };
const MARKER = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#64748b" } as const;
const SAVE_MS = 1000;
const HISTORY_MAX = 60;

// ── ที่พักก้อนคัดลอก (สำรองคลิปบอร์ด) ──
// คลิปบอร์ดจริงเก็บ 2 แบบ (ชนิดพิเศษของกระดาน + ข้อความอ่านง่าย) · บางเบราว์เซอร์/ปุ่ม "คัดลอก" เก็บได้แค่ข้อความ
// → จำก้อนไว้ที่นี่ด้วย ถ้าข้อความที่วางตรงกับที่จำไว้ = วางเป็นกล่องได้ (ข้ามแท็บผ่าน localStorage)
const CLIP_KEY = "erp-flowchart-clip";
let memClip: { text: string; json: string } | null = null;
const normText = (s: string) => (s ?? "").replace(/\r\n?/g, "\n").trim();
function rememberClip(text: string, json: string) {
  memClip = { text: normText(text), json };
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(memClip)); } catch { /* โหมดส่วนตัว/เต็ม — ใช้ในหน่วยความจำแทน */ }
}
function recallClip(): { text: string; json: string } | null {
  try {
    const r = JSON.parse(localStorage.getItem(CLIP_KEY) || "null");
    if (r && typeof r.text === "string" && typeof r.json === "string") return r;
  } catch { /* ignore */ }
  return memClip;
}
const isTyping = (el: EventTarget | null) => {
  const h = el as HTMLElement | null;
  return !!h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable);
};

const toRFNodes = (s: FlowScene, selected?: Set<string>): FlowRFNode[] =>
  s.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, width: n.width, height: n.height, data: n.data, selected: selected?.has(n.id) ?? false }));
const toRFEdges = (s: FlowScene): Edge[] =>
  s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: e.label, type: "flow", markerEnd: MARKER }));

export type FlowchartBoardProps = {
  entityType: string;
  entityId: string;
  /** false = บังคับดูอย่างเดียว (เช่น ปุ่ม "ดูอย่างเดียว" ของหน้า) · คนไม่มีสิทธิ์แก้ เป็นดูอย่างเดียวเองอยู่แล้ว */
  editable?: boolean;
  height?: string;
  /** แม่แบบเริ่มต้น — กระดานว่าง + แก้ได้ = วางให้ครั้งแรก · มีปุ่ม "วางแม่แบบ" ให้วางเพิ่มด้วย */
  starter?: (t: (th: string, en: string) => string) => FlowScene;
  /** ชื่อไฟล์ตอนบันทึกเป็นรูป */
  fileName?: string;
  /** แจ้งหน้าแม่ว่าผู้ใช้มีสิทธิ์แก้ไหม (ไว้ซ่อน/โชว์ปุ่มของหน้า) */
  onCanEdit?: (can: boolean) => void;
};

export function FlowchartBoard(props: FlowchartBoardProps) {
  return <ReactFlowProvider><Board {...props} /></ReactFlowProvider>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function Board({ entityType, entityId, editable = true, height = "70vh", starter, fileName = "flowchart", onCanEdit }: FlowchartBoardProps) {
  const t = useT();
  const pushToast = usePushToast();
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);    // พื้นที่วาด (ใช้หาจุดวาง/กลางจอ)
  const boardRef = useRef<HTMLDivElement>(null);   // ทั้งกระดานรวมแถบเครื่องมือ (คีย์ลัดทำงานเมื่อเมาส์/โฟกัสอยู่ในนี้)

  const [nodes, setNodes] = useState<FlowRFNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [, setHistTick] = useState(0);
  const [clipReady, setClipReady] = useState(false);          // มีกล่องที่คัดลอกไว้ (โชว์ปุ่ม "วาง")
  const readOnly = !(canEdit && editable);
  const readOnlyRef = useRef(readOnly); readOnlyRef.current = readOnly;
  const pointerRef = useRef<{ x: number; y: number } | null>(null);   // เมาส์ล่าสุดบนกระดาน (วางตรงนั้น)
  const lastPasteRef = useRef<{ x: number; y: number; count: number } | null>(null);
  useEffect(() => { setClipReady(!!recallClip()); }, []);

  // ── ข้อมูลล่าสุด (ref ไว้ใช้ใน callback/timer ไม่ให้ค้างค่าเก่า) ──
  const scene = useMemo(() => toFlowScene(nodes, edges), [nodes, edges]);
  const sig = useMemo(() => flowSceneSig(scene), [scene]);
  const sceneRef = useRef(scene); sceneRef.current = scene;
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const revRef = useRef(0);                                   // เวอร์ชันในฐานข้อมูลที่เราอิง (กันทับกัน)
  const baseRef = useRef<FlowScene>(EMPTY_FLOW_SCENE);        // ของที่ฐานข้อมูลมี ณ rev นั้น (ใช้รวมงาน 3 ทาง)
  const savedSigRef = useRef("");                             // ลายเซ็นที่บันทึกล่าสุด
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const canEditRef = useRef(false); canEditRef.current = canEdit;
  // ย้อนกลับ/ทำซ้ำ
  const pastRef = useRef<FlowScene[]>([]);
  const futureRef = useRef<FlowScene[]>([]);
  const stableRef = useRef<{ sig: string; scene: FlowScene }>({ sig: "", scene: EMPTY_FLOW_SCENE });

  const applyScene = useCallback((s: FlowScene, keepSelection = false) => {
    const sel = keepSelection ? new Set(nodesRef.current.filter((n) => n.selected).map((n) => n.id)) : undefined;
    setNodes(toRFNodes(s, sel));
    setEdges(toRFEdges(s));
  }, []);

  // ── โหลด ──
  useEffect(() => {
    let alive = true;
    setStatus("loading"); setLoadError(null);
    (async () => {
      try {
        const res = await apiFetch(`/api/canvas-sketch?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error || t("โหลดกระดานไม่สำเร็จ", "Could not load the board"));
        if (!alive) return;
        const can = j.data?.can_edit === true;
        setCanEdit(can); onCanEdit?.(can);
        const saved = parseFlowScene(j.data?.scene) ?? EMPTY_FLOW_SCENE;
        revRef.current = Number(j.data?.rev ?? 0) || 0;
        baseRef.current = saved;
        savedSigRef.current = flowSceneSig(saved);
        const first = !saved.nodes.length && can && starter ? starter(t) : saved;   // กระดานว่าง → วางแม่แบบให้ (บันทึกอัตโนมัติตามมา)
        stableRef.current = { sig: flowSceneSig(first), scene: first };
        pastRef.current = []; futureRef.current = [];
        applyScene(first);
        setStatus("ready");
        setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1 }); }, 60);
      } catch (e) {
        if (!alive) return;
        setLoadError((e as Error).message); setStatus("error");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, reloadKey]);

  // ── บันทึก (เช็กเวอร์ชัน · ชนกัน = รวมงาน 3 ทางแล้วบันทึกซ้ำ) ──
  const save = useCallback(async () => {
    if (!canEditRef.current) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    const mine = sceneRef.current;
    const mineSig = flowSceneSig(mine);
    if (mineSig === savedSigRef.current) return;
    savingRef.current = true; setSaveState("saving");
    try {
      const res = await apiFetch("/api/canvas-sketch", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, scene: mine, base_rev: revRef.current }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      if (j.conflict) {
        const theirs = parseFlowScene(j.scene) ?? EMPTY_FLOW_SCENE;
        const merged = mergeFlowScenes(baseRef.current, sceneRef.current, theirs);
        revRef.current = Number(j.rev ?? 0) || 0;
        baseRef.current = theirs;
        savedSigRef.current = flowSceneSig(theirs);
        applyScene(merged, true);   // ลายเซ็นเปลี่ยน → ตัวตั้งเวลาบันทึกซ้ำให้เอง
        pushToast("info", t("มีคนแก้กระดานนี้พร้อมกัน — รวมงานให้แล้ว", "Someone else edited this board at the same time — changes merged"));
      } else {
        revRef.current = Number(j.rev ?? revRef.current + 1);
        baseRef.current = mine;
        savedSigRef.current = mineSig;
        setSavedAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
      }
      setSaveState("saved");
    } catch (e) {
      console.error("[flowchart-board] save failed:", e);
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void save(); }
    }
  }, [entityType, entityId, t, pushToast, applyScene]);
  const saveRef = useRef(save); saveRef.current = save;

  // เนื้อหาเปลี่ยน → ตั้งเวลาบันทึก + จดประวัติย้อนกลับ (ไม่นับการเลือก/ซูม — ลายเซ็นไม่รวม)
  useEffect(() => {
    if (status !== "ready") return;
    const saveTimer = canEdit && sig !== savedSigRef.current ? setTimeout(() => void saveRef.current(), SAVE_MS) : null;
    const histTimer = setTimeout(() => recordHistory(), 400);
    return () => { if (saveTimer) clearTimeout(saveTimer); clearTimeout(histTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, status, canEdit]);

  // ปิดแท็บ/สลับแอป: บันทึกทันที + เตือนถ้ายังบันทึกไม่เสร็จ
  useEffect(() => {
    const dirtyNow = () => canEditRef.current && (savingRef.current || flowSceneSig(sceneRef.current) !== savedSigRef.current);
    const onBefore = (e: BeforeUnloadEvent) => { if (dirtyNow()) { void saveRef.current(); e.preventDefault(); e.returnValue = ""; } };
    const onHide = () => { if (document.visibilityState === "hidden" && dirtyNow()) void saveRef.current(); };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("visibilitychange", onHide);
      if (dirtyNow()) void saveRef.current();   // ออกจากหน้า (เปลี่ยนเมนู) → บันทึกของค้าง
    };
  }, []);

  // ── ย้อนกลับ / ทำซ้ำ ──
  function recordHistory() {
    const cur = sceneRef.current;
    const s = flowSceneSig(cur);
    if (s === stableRef.current.sig) return;
    pastRef.current.push(stableRef.current.scene);
    if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
    futureRef.current = [];
    stableRef.current = { sig: s, scene: cur };
    setHistTick((x) => x + 1);
  }
  const undo = useCallback(() => {
    recordHistory();   // แก้ล่าสุดที่ยังไม่ถูกจด → จดก่อน แล้วค่อยย้อน
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(sceneRef.current);
    stableRef.current = { sig: flowSceneSig(prev), scene: prev };
    applyScene(prev); setHistTick((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyScene]);
  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(sceneRef.current);
    stableRef.current = { sig: flowSceneSig(next), scene: next };
    applyScene(next); setHistTick((x) => x + 1);
  }, [applyScene]);
  const canUndo = pastRef.current.length > 0 || sig !== stableRef.current.sig;
  const canRedo = futureRef.current.length > 0;

  // ── คัดลอก / ตัด / วาง / ทำซ้ำ ──
  const selectedNow = () => nodesRef.current.filter((n) => n.selected).map((n) => n.id);
  /** ใส่กล่อง/เส้นชุดใหม่ลงกระดาน แล้วเลือกชุดใหม่ไว้ (ลากย้ายต่อได้ทันที) */
  const insertScene = (add: FlowScene) => {
    if (!add.nodes.length) return;
    const sel = new Set(add.nodes.map((n) => n.id));
    setNodes((ns) => [...ns.map((x) => (x.selected ? { ...x, selected: false } : x)), ...toRFNodes(add, sel)]);
    setEdges((es) => [...es.map((x) => (x.selected ? { ...x, selected: false } : x)), ...toRFEdges(add)]);
  };
  /** จุดวาง = เมาส์บนกระดาน · เมาส์ไม่อยู่บนกระดาน (เช่น กดปุ่ม "วาง") = กลางจอ */
  const pastePoint = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    const p = pointerRef.current;
    if (r && p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return rf.screenToFlowPosition(p);
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
  };
  const pasteClip = (clip: FlowClip) => {
    const at = pastePoint();
    const last = lastPasteRef.current;
    const count = last && Math.abs(last.x - at.x) < 1 && Math.abs(last.y - at.y) < 1 ? last.count + 1 : 0;   // วางซ้ำที่เดิม → เลื่อนเฉียงทีละขั้น
    lastPasteRef.current = { x: at.x, y: at.y, count };
    insertScene(placeFlowClip(clip, at, count * GRID * 2));
  };
  const removeNodes = (ids: string[]) => {
    const set = new Set(ids);
    if (!set.size) return;
    setNodes((ns) => ns.filter((n) => !set.has(n.id)));
    setEdges((es) => es.filter((e) => !set.has(e.source) && !set.has(e.target)));
  };
  const copyToast = (n: number, cut = false) => pushToast("success", cut
    ? t(`ตัด ${n} กล่องแล้ว — ชี้ที่ที่จะวางแล้วกด Ctrl+V`, `Cut ${n} box(es) — point where to paste and press Ctrl+V`)
    : t(`คัดลอก ${n} กล่องแล้ว — ชี้ที่ที่จะวางแล้วกด Ctrl+V (วางในกระดานหน้าอื่นได้)`, `Copied ${n} box(es) — point where to paste and press Ctrl+V`));
  /** ปุ่ม "คัดลอก" (ไม่มีอีเวนต์คลิปบอร์ด) → เก็บข้อความอ่านง่ายลงคลิปบอร์ด + จำก้อนไว้ */
  const copyNodes = (ids: string[]) => {
    const clip = copyFlowSelection(sceneRef.current, ids);
    if (!clip) return;
    const text = flowClipText(clip) || "(flowchart)";
    rememberClip(text, serializeFlowClip(clip));
    setClipReady(true);
    void navigator.clipboard?.writeText(text).catch(() => { /* ไม่ได้สิทธิ์คลิปบอร์ด — ยังวางในกระดานได้จากที่จำไว้ */ });
    copyToast(clip.nodes.length);
  };
  const duplicateNodes = (ids: string[]) => {
    const clip = copyFlowSelection(sceneRef.current, ids);
    if (clip) insertScene(placeFlowClip(clip, null, GRID * 2));
  };
  const pasteRemembered = () => {
    const mem = recallClip();
    const clip = mem ? parseFlowClip(mem.json) : null;
    if (clip) pasteClip(clip);
    else { setClipReady(false); pushToast("info", t("ยังไม่ได้คัดลอกกล่องไว้", "Nothing copied yet")); }
  };
  // ตัวทำงานล่าสุด (อ่านผ่าน ref — ปุ่ม/คีย์ลัดไม่ต้องสร้างใหม่ทุกครั้งที่กระดานเปลี่ยน)
  const opsRef = useRef({ undo, redo, selectedNow, insertScene, pastePoint, pasteClip, removeNodes, copyToast, copyNodes, duplicateNodes });
  opsRef.current = { undo, redo, selectedNow, insertScene, pastePoint, pasteClip, removeNodes, copyToast, copyNodes, duplicateNodes };

  // คีย์ลัด (ทำงานเมื่อเมาส์อยู่บนกระดานหรือกำลังโฟกัสกระดาน · พิมพ์ในช่องข้อความอยู่ = ไม่ยุ่ง)
  useEffect(() => {
    const boardActive = () => { const w = boardRef.current; return !!w && (w.matches(":hover") || w.contains(document.activeElement)); };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !boardActive() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const op = opsRef.current;
      const k = e.key.toLowerCase();
      if (k === "a") {   // เลือกทุกกล่อง (ไม่ใช่ทุกตัวหนังสือในหน้า)
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        setNodes((ns) => ns.map((n) => (n.selected ? n : { ...n, selected: true })));
        return;
      }
      if (readOnlyRef.current) return;
      if (k === "z" && !e.shiftKey) { e.preventDefault(); op.undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); op.redo(); }
      else if (k === "d") { e.preventDefault(); op.duplicateNodes(op.selectedNow()); }
    };
    // คลิปบอร์ด: ใช้อีเวนต์ copy/cut/paste ของเบราว์เซอร์ (ไม่ต้องขอสิทธิ์ · ใส่ได้หลายแบบในครั้งเดียว)
    const onCopyCut = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || !boardActive() || !e.clipboardData) return;
      // เลือกตัวหนังสือบนหน้าไว้ + เมาส์ไม่ได้อยู่บนพื้นที่วาด → ให้เบราว์เซอร์คัดลอกตัวหนังสือตามปกติ
      const sel = window.getSelection();
      if (!wrapRef.current?.matches(":hover") && sel && !sel.isCollapsed && sel.toString().trim()) return;
      const cut = e.type === "cut";
      if (cut && readOnlyRef.current) return;
      const op = opsRef.current;
      const ids = op.selectedNow();
      const clip = copyFlowSelection(sceneRef.current, ids);
      if (!clip) return;
      e.preventDefault();
      const json = serializeFlowClip(clip);
      const text = flowClipText(clip) || "(flowchart)";
      e.clipboardData.setData("text/plain", text);
      e.clipboardData.setData(FLOW_CLIP_MIME, json);
      rememberClip(text, json);
      setClipReady(true);
      if (cut) op.removeNodes(ids);
      op.copyToast(clip.nodes.length, cut);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement) || !boardActive() || readOnlyRef.current || !e.clipboardData) return;
      const op = opsRef.current;
      const dt = e.clipboardData;
      const text = dt.getData("text/plain");
      let clip = parseFlowClip(dt.getData(FLOW_CLIP_MIME));
      if (!clip) { const mem = recallClip(); if (mem && normText(text) && mem.text === normText(text)) clip = parseFlowClip(mem.json); }
      if (clip) { e.preventDefault(); op.pasteClip(clip); return; }
      if (text.trim()) {
        e.preventDefault();
        const node = textToFlowNode(text, op.pastePoint(), t);
        if (node) op.insertScene({ ...EMPTY_FLOW_SCENE, nodes: [node] });
        return;
      }
      if (Array.from(dt.items).some((i) => i.kind === "file")) {
        e.preventDefault();
        pushToast("info", t("กระดาน flowchart ยังวางรูป/ไฟล์ไม่ได้ — ใช้กล่องโฟลเดอร์ชี้ไปที่เก็บไฟล์แทน", "This flowchart board can't take images/files — use a folder box instead"));
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [t, pushToast]);

  // ── แก้กระดาน ──
  const onNodesChange = useCallback((ch: NodeChange<FlowRFNode>[]) => setNodes((ns) => applyNodeChanges(ch, ns)), []);
  const onEdgesChange = useCallback((ch: EdgeChange[]) => setEdges((es) => applyEdgeChanges(ch, es)), []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setEdges((es) => {
      const srcKind = nodesRef.current.find((n) => n.id === c.source)?.type as FlowKind | undefined;
      const label = autoEdgeLabel(srcKind, es.filter((e) => e.source === c.source).map((e) => String(e.label ?? "")), t);
      return addEdge({ ...c, id: newFlowId("e"), type: "flow", markerEnd: MARKER, label }, es);
    });
  }, [t]);

  const addNode = useCallback((kind: FlowKind, data?: Partial<FlowNodeData>) => {
    const r = wrapRef.current?.getBoundingClientRect();
    const n = nodesRef.current.length;
    const center = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2 + (n % 5) * GRID, y: r.top + r.height / 2 + (n % 5) * GRID }) : { x: 0, y: 0 };
    const node = makeFlowNode(kind, center, t, data);
    setNodes((ns) => [...ns.map((x) => (x.selected ? { ...x, selected: false } : x)), ...toRFNodes({ ...EMPTY_FLOW_SCENE, nodes: [node] }, new Set([node.id]))]);
  }, [rf, t]);

  const insertStarter = useCallback(() => {
    if (!starter) return;
    const add = cloneFlowSceneAt(starter(t), sceneRef.current);
    setNodes((ns) => [...ns.map((x) => (x.selected ? { ...x, selected: false } : x)), ...toRFNodes(add)]);
    setEdges((es) => [...es, ...toRFEdges(add)]);
    setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 60);
  }, [starter, t, rf]);

  const openFolder = useCallback((path: string) => {
    if (!path) return;
    openCanvasFolder(path);
    pushToast("info", t("กำลังเปิดโฟลเดอร์... ถ้าไม่เปิด: ลง .reg แล้วปิด-เปิดเบราว์เซอร์ใหม่ 1 ครั้ง (path คัดลอกให้แล้ว วางใน File Explorer ได้)", "Opening folder... if nothing happens: install .reg then restart the browser once (path copied as fallback)"));
  }, [pushToast, t]);

  // กล่องที่เลือก — คงตัวเดิมไว้ถ้าการเลือกไม่เปลี่ยน (ลากกล่องอยู่ ไม่ต้องวาดทุกกล่องใหม่)
  const selKey = nodes.filter((n) => n.selected).map((n) => n.id).join("|");
  const selectedIds = useMemo(() => (selKey ? selKey.split("|") : []), [selKey]);
  const actions = useMemo<FlowBoardActions>(() => ({
    readOnly, t, openFolder, selectedIds,
    copyNodes: (ids) => opsRef.current.copyNodes(ids),
    duplicateNodes: (ids) => opsRef.current.duplicateNodes(ids),
    removeNodes: (ids) => opsRef.current.removeNodes(ids),
    setColor: (ids, color) => { const set = new Set(ids); setNodes((ns) => ns.map((n) => (set.has(n.id) ? { ...n, data: { ...n.data, color } } : n))); },
    updateData: (id, patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    setEdgeLabel: (id, label) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, label } : e))),
    editEdgeLabel: (id) => {
      const cur = String(edges.find((e) => e.id === id)?.label ?? "");
      void askText({ title: t("ป้ายบนเส้น", "Line label"), initial: cur, placeholder: t("เช่น ใช่ / ไม่ใช่ / ถ้าเป็นรูปสินค้า", "e.g. Yes / No / If product image"), confirmText: t("ใช้ป้ายนี้", "Use label") })
        .then((v) => { if (v !== null) setEdges((es) => es.map((e) => (e.id === id ? { ...e, label: v.trim() } : e))); });
    },
    removeEdge: (id) => setEdges((es) => es.filter((e) => e.id !== id)),
  }), [readOnly, t, openFolder, selectedIds, edges]);

  // ── บันทึกเป็นรูป (ตัวแปลงกลาง lib/html-to-png) ──
  const exportImage = async () => {
    const s = sceneRef.current;
    if (!s.nodes.length) { pushToast("warning", t("กระดานยังว่าง", "The board is empty")); return; }
    setExporting(true);
    try {
      const { html, width, height: h } = flowSceneToHtml(s);
      const scale = fitImageScale(width, h, 2);
      if (!scale) throw new Error(t("แผนผังใหญ่เกินจะทำเป็นรูปเดียว", "The chart is too large for one image"));
      const blob = await htmlToPngBlob(html, { width, scale });
      downloadBlob(blob, imageFileName(fileName, "png"));
      pushToast("success", t("บันทึกรูปแล้ว — ดูในโฟลเดอร์ดาวน์โหลด", "Image saved — check your Downloads folder"));
    } catch (e) {
      pushToast("error", (e as Error).message || t("สร้างรูปไม่สำเร็จ", "Could not create the image"));
    } finally { setExporting(false); }
  };

  if (status === "loading") return <div className="rounded-xl border border-slate-200 bg-white" style={{ height }}><LoadingState className="text-sm" /></div>;
  if (status === "error") return <div className="rounded-xl border border-slate-200 bg-white" style={{ height }}><ErrorState title={t("โหลดกระดานไม่สำเร็จ", "Could not load the board")} hint={loadError ?? undefined} onRetry={() => setReloadKey((k) => k + 1)} /></div>;

  const tb = "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";
  const dirty = canEdit && sig !== savedSigRef.current;

  return (
    <FlowBoardCtx.Provider value={actions}>
      <div ref={boardRef} className={`fc-board flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${readOnly ? "fc-readonly" : ""}`} style={{ height }}>
        {/* แถบเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1">
          {!readOnly && FLOW_KINDS.map((k) => {
            const m = FLOW_KIND_META[k];
            return (
              <button key={k} type="button" className={tb} title={t(m.hintTh, m.hintEn)}
                onClick={() => (k === "folder" ? setFolderOpen(true) : addNode(k))}>
                <Icon value={m.icon} />{t(m.th, m.en)}
              </button>
            );
          })}
          {!readOnly && starter && <button type="button" className={tb} onClick={insertStarter} title={t("วางแม่แบบอีกชุดทางขวาของของเดิม", "Insert the starter template to the right")}><Icon value="i:sitemap" />{t("วางแม่แบบ", "Starter")}</button>}
          {!readOnly && clipReady && <button type="button" className={tb} onClick={pasteRemembered} title={t("วางกล่องที่คัดลอกไว้ (หรือชี้ที่กระดานแล้วกด Ctrl+V)", "Paste copied boxes (or point at the board and press Ctrl+V)")}><Icon value="i:clipboard" />{t("วาง", "Paste")}</button>}
          {readOnly && <span className="px-2 text-[12px] text-slate-500"><Icon value="i:lock" /> {canEdit ? t("โหมดดูอย่างเดียว", "View-only mode") : t("ดูอย่างเดียว (ไม่มีสิทธิ์แก้)", "View only (no edit permission)")}</span>}
          <span className="flex-1" />
          {!readOnly && (
            <>
              <button type="button" className={tb} onClick={undo} disabled={!canUndo} title={t("ย้อนกลับ (Ctrl+Z)", "Undo (Ctrl+Z)")}><Icon value="i:arrow-back-up" /></button>
              <button type="button" className={tb} onClick={redo} disabled={!canRedo} title={t("ทำซ้ำ (Ctrl+Y)", "Redo (Ctrl+Y)")}><Icon value="i:arrow-forward-up" /></button>
            </>
          )}
          <button type="button" className={tb} onClick={() => void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 })} title={t("ดูทั้งแผนผัง", "Fit to screen")}><Icon value="i:maximize" /></button>
          <button type="button" className={tb} onClick={() => void exportImage()} disabled={exporting} title={t("บันทึกแผนผังเป็นรูป PNG", "Save the chart as a PNG image")}><Icon value="i:photo" />{exporting ? t("กำลังสร้างรูป...", "Creating...") : t("บันทึกเป็นรูป", "Save image")}</button>
          {canEdit && (
            <span className={`ml-1 text-[11px] ${saveState === "error" ? "text-rose-600" : dirty || saveState === "saving" ? "text-blue-600" : "text-emerald-600"}`}>
              {saveState === "error"
                ? <>{t("บันทึกไม่สำเร็จ", "Save failed")} <button type="button" className="underline" onClick={() => void save()}>{t("ลองใหม่", "Retry")}</button></>
                : saveState === "saving" || dirty ? t("กำลังบันทึก...", "Saving...")
                : savedAt ? `${t("บันทึกแล้ว", "Saved")} · ${savedAt}` : t("บันทึกอัตโนมัติ", "Auto-save")}
            </span>
          )}
        </div>

        {/* กระดาน */}
        <div ref={wrapRef} className="relative min-h-0 flex-1"
          onPointerMove={(e) => { pointerRef.current = { x: e.clientX, y: e.clientY }; }}
          onPointerLeave={() => { pointerRef.current = null; }}>
          <ReactFlow<FlowRFNode, Edge>
            nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onEdgeDoubleClick={(_, e) => { if (!readOnly) actions.editEdgeLabel(e.id); }}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "flow", markerEnd: MARKER }}
            connectionLineStyle={{ stroke: "#7c3aed", strokeWidth: 2 }}
            snapToGrid snapGrid={[GRID, GRID]}
            nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable
            multiSelectionKeyCode={["Shift", "Control", "Meta"]}
            deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
            minZoom={0.2} maxZoom={2.5}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="#cbd5e1" />
            <Controls showInteractive={false} position="bottom-left" />
            {/* เลือกหลายกล่อง → แถบเครื่องมือกลุ่มอันเดียวเหนือกลุ่ม */}
            {!readOnly && selectedIds.length > 1 && (
              <NodeToolbar nodeId={selectedIds} isVisible position={Position.Top} offset={10}>
                <FlowTools ids={selectedIds} />
              </NodeToolbar>
            )}
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <EmptyState title={readOnly ? t("ยังไม่มีแผนผัง", "No chart yet") : t("เริ่มจากกดปุ่มกล่องด้านบน", "Start with a box button above")}
                hint={readOnly ? undefined : t("ลากจากจุดขอบกล่องไปอีกกล่อง = ต่อเส้น · ดับเบิลคลิกกล่อง = แก้ข้อความ · วางข้อความ/กล่องที่คัดลอกมา = Ctrl+V", "Drag from a box edge dot to another box to connect · double-click a box to edit · Ctrl+V pastes text or copied boxes")} />
            </div>
          )}
        </div>
      </div>

      <FolderCardModal open={folderOpen} onClose={() => setFolderOpen(false)}
        onPlace={(_skeletons, info) => { addNode("folder", { label: info.label, path: info.path }); setFolderOpen(false); }} />
    </FlowBoardCtx.Provider>
  );
}
