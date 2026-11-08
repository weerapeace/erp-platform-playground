"use client";

// ============================================================
// FlowchartBoard — กระดาน flowchart กลาง (ของกลาง · ใช้ React Flow / @xyflow/react)
//
// กล่อง 6 ชนิด (เริ่ม/จบ · ขั้นตอน · คำถาม ใช่/ไม่ใช่ · ที่เก็บ · โฟลเดอร์ · โน้ต) + เส้นต่อหักมุมอัตโนมัติ
// เส้นติดกล่องเสมอ · กล่องเข้าแถวตามตาราง · ย่อขยายกล่องได้ · เปลี่ยนสีได้ · ย้อนกลับ/ทำซ้ำ (Ctrl+Z / Ctrl+Y)
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
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MarkerType, ConnectionMode,
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
  EMPTY_FLOW_SCENE, FLOW_KINDS, FLOW_KIND_META, GRID, autoEdgeLabel, cloneFlowSceneAt, flowSceneSig, makeFlowNode,
  mergeFlowScenes, newFlowId, parseFlowScene, toFlowScene, type FlowKind, type FlowNodeData, type FlowScene,
} from "@/lib/flowchart";
import { FlowBoardCtx, FlowEdgeView, FlowNodeView, type FlowBoardActions, type FlowRFNode } from "./nodes";
import { flowSceneToHtml } from "./export-html";

const NODE_TYPES = Object.fromEntries(FLOW_KINDS.map((k) => [k, FlowNodeView]));
const EDGE_TYPES = { flow: FlowEdgeView };
const MARKER = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#64748b" } as const;
const SAVE_MS = 1000;
const HISTORY_MAX = 60;

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
  const wrapRef = useRef<HTMLDivElement>(null);

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
  const readOnly = !(canEdit && editable);

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

  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const wrap = wrapRef.current;
      if (!wrap || !(wrap.matches(":hover") || wrap.contains(document.activeElement))) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, undo, redo]);

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

  const actions = useMemo<FlowBoardActions>(() => ({
    readOnly, t, openFolder,
    updateData: (id, patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    removeNode: (id) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); },
    setEdgeLabel: (id, label) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, label } : e))),
    editEdgeLabel: (id) => {
      const cur = String(edges.find((e) => e.id === id)?.label ?? "");
      void askText({ title: t("ป้ายบนเส้น", "Line label"), initial: cur, placeholder: t("เช่น ใช่ / ไม่ใช่ / ถ้าเป็นรูปสินค้า", "e.g. Yes / No / If product image"), confirmText: t("ใช้ป้ายนี้", "Use label") })
        .then((v) => { if (v !== null) setEdges((es) => es.map((e) => (e.id === id ? { ...e, label: v.trim() } : e))); });
    },
    removeEdge: (id) => setEdges((es) => es.filter((e) => e.id !== id)),
  }), [readOnly, t, openFolder, edges]);

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
      <div className={`fc-board flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${readOnly ? "fc-readonly" : ""}`} style={{ height }}>
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
        <div ref={wrapRef} className="relative min-h-0 flex-1">
          <ReactFlow<FlowRFNode, Edge>
            nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onEdgeDoubleClick={(_, e) => { if (!readOnly) actions.editEdgeLabel(e.id); }}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "flow", markerEnd: MARKER }}
            connectionLineStyle={{ stroke: "#7c3aed", strokeWidth: 2 }}
            snapToGrid snapGrid={[GRID, GRID]}
            nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable={!readOnly}
            deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
            minZoom={0.2} maxZoom={2.5}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="#cbd5e1" />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <EmptyState title={readOnly ? t("ยังไม่มีแผนผัง", "No chart yet") : t("เริ่มจากกดปุ่มกล่องด้านบน", "Start with a box button above")}
                hint={readOnly ? undefined : t("ลากจากจุดขอบกล่องไปอีกกล่อง = ต่อเส้น · ดับเบิลคลิกกล่อง = แก้ข้อความ", "Drag from a box edge dot to another box to connect · double-click a box to edit")} />
            </div>
          )}
        </div>
      </div>

      <FolderCardModal open={folderOpen} onClose={() => setFolderOpen(false)}
        onPlace={(_skeletons, info) => { addNode("folder", { label: info.label, path: info.path }); setFolderOpen(false); }} />
    </FlowBoardCtx.Provider>
  );
}
