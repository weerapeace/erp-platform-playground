"use client";

// ============================================================
// Campaign Canvas -- กระดาน Excalidraw ของแคมเปญ (ของกลาง CanvasSketch)
// กดการ์ดแคมเปญ → เข้าหน้านี้ · ปุ่ม "รายละเอียด" เปิด CampaignDrawer · ปุ่ม Section = Frame
// เฟส 1: โครงหลัก (วาด + Section) -- SKU Card / Task Card มาเฟสถัดไป
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { StandaloneShell } from "@/components/standalone-shell";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import type { SkuPickerValue } from "@/components/pickers";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { CampaignDrawer, CAMPAIGN_STATUS } from "../campaign-drawer";
import { CreateTaskModal, type CreatedTask } from "../../create-task-modal";
import { TaskDetailDrawer } from "../../task-detail-drawer";
import { applyTaskTransition } from "../../task-actions";
import { useCreativeOptions } from "../../use-options";
import { getCampaign, updateCampaign, deleteTask, createContent, listBrands, listSubtasks, POST_TYPES, type CampaignDetail, type CreativeTask, type BrandOption } from "../../data";
import { ContentDrawer } from "../../content/content";

// โหลดของกลาง Excalidraw แบบ dynamic -- ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">Loading canvas...</div>,
});

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

// โซนสำเร็จรูปสำหรับกระดานแคมเปญ
const SECTION_PRESETS = ["Brainstorming (ไอเดีย)", "Reference", "Information (ข้อมูล)", "Products (สินค้าใน Campaign)", "Tasks (งาน)"];

// การ์ด SKU บน Excalidraw: รูป(บน) + ข้อความ(ล่าง) ในกล่อง -- customData = snapshot สำหรับ drawer (ดับเบิลคลิกการ์ดเปิด)
function skuCardSkeleton(s: SkuPickerValue): Record<string, unknown>[] {
  const gid = `sku-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "sku", id: s.id, code: s.code, name: s.name, color: s.color ?? null, price: s.list_price ?? null, image_url: s.image_url ?? null };
  const hasImg = !!s.image_url;
  const W = 230, imgH = 170, txtY = hasImg ? imgH + 18 : 14, H = hasImg ? imgH + 86 : 96;
  const priceLine = [s.color, s.list_price != null ? `${Number(s.list_price).toLocaleString()}฿` : null].filter(Boolean).join("  ·  ");
  const text = [`📦 ${s.code}`, s.name, priceLine].filter(Boolean).join("\n");
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#7c3aed", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (hasImg) els.push({ type: "image", _imageUrl: s.image_url, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#1e293b", groupIds: [gid], customData: data });
  return els;
}

// การ์ดคอนเทนต์บน Excalidraw -- customData (ดับเบิลคลิกเปิด)
function contentCardSkeleton(c: { id: string; content_no: string; title: string; platforms: string[] }): Record<string, unknown>[] {
  const gid = `content-${c.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "content", id: c.id, content_no: c.content_no, title: c.title, platforms: c.platforms };
  const platLine = c.platforms.length ? c.platforms.join(" · ") : "—";
  const text = `📱 ${c.title}\n${c.content_no}\n\nแพลตฟอร์ม:\n${platLine}`;
  const W = 250, H = 150;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#fff7ed", strokeColor: "#f59e0b", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 14, strokeColor: "#b45309", groupIds: [gid], customData: data },
  ];
}

// การ์ดโฟลเดอร์บน Excalidraw: เก็บ path -- ดับเบิลคลิก = คัดลอก path (เปิด File Explorer แล้ววาง)
function folderCardSkeleton(f: { path: string; label: string }): Record<string, unknown>[] {
  const fid = Math.random().toString(36).slice(2, 9);
  const gid = `folder-${fid}`;
  const data = { kind: "folder", id: fid, path: f.path, label: f.label };
  const text = `📁 ${f.label || "โฟลเดอร์"}\n${f.path}\n\n(ดับเบิลคลิก = คัดลอก path)`;
  const W = 290, H = 120;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ecfeff", strokeColor: "#0891b2", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 13, strokeColor: "#155e75", groupIds: [gid], customData: data },
  ];
}

// การ์ดงานบน Excalidraw: ชื่อ + รายการ subtask (snapshot) -- customData (ดับเบิลคลิกการ์ดเปิด drawer จัดการสด)
function taskCardSkeleton(t: CreatedTask): Record<string, unknown>[] {
  const gid = `task-${t.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "task", id: t.id, task_no: t.task_no, title: t.title, subtasks: t.subtasks };
  const shown = t.subtasks.slice(0, 6);
  const subLines = t.subtasks.length
    ? shown.map((s) => `☐ ${s.title}`).join("\n") + (t.subtasks.length > 6 ? `\n… อีก ${t.subtasks.length - 6}` : "")
    : "— ยังไม่มีงานย่อย —";
  const text = `✅ ${t.title}\n${t.task_no}\n\nงานย่อย (${t.subtasks.length})\n${subLines}`;
  const W = 260, H = 96 + (Math.max(shown.length, 1) + (t.subtasks.length > 6 ? 1 : 0)) * 19;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#f5f3ff", strokeColor: "#8b5cf6", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 14, strokeColor: "#5b21b6", groupIds: [gid], customData: data },
  ];
}

export default function CampaignCanvasPage() {
  const t = useT();
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0); // เปลี่ยนเพื่อรีโหลดกระดานล่าสุด (แทน F5 ที่เด้งหน้าแรก)
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuSel, setSkuSel] = useState<SkuPickerValue[]>([]); // SKU ที่เลือก (หลายอัน)
  const [skuView, setSkuView] = useState<Record<string, unknown> | null>(null); // การ์ด SKU ที่กดดู
  const [taskOpen, setTaskOpen] = useState(false);   // modal สร้างงาน
  const [taskView, setTaskView] = useState<Record<string, unknown> | null>(null); // การ์ดงานที่กดดู
  const [cardsOpen, setCardsOpen] = useState(false); // ป๊อปอัปสรุปการ์ด
  const [cards, setCards] = useState<{ kind: string; data: Record<string, unknown> }[]>([]);
  const [sectionOpen, setSectionOpen] = useState(false); // ป๊อปอัปเลือก Section
  const [sectionName, setSectionName] = useState("");
  const [contentOpen, setContentOpen] = useState(false); // modal สร้างคอนเทนต์
  const [cForm, setCForm] = useState({ title: "", post_type: "image", platforms: [] as string[], scheduled_at: "" });
  const [contentView, setContentView] = useState<Record<string, unknown> | null>(null); // การ์ดคอนเทนต์ที่กดดู
  const [folderOpen, setFolderOpen] = useState(false); // modal การ์ดโฟลเดอร์
  const [fForm, setFForm] = useState({ label: "", path: "" });
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const { platforms: platformOpts } = useCreativeOptions();
  const [fs, setFs] = useState(false); // เต็มจอ
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const pushToast = useCallback((type: Toast["type"], message: string) => { const tid = Date.now() + Math.random(); setToasts((q) => [...q, { id: tid, type, message }]); setTimeout(() => setToasts((q) => q.filter((t) => t.id !== tid)), 3500); }, []);

  const load = useCallback(async () => { try { setDetail(await getCampaign(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
  // รีโหลดกระดานล่าสุด (เซฟของเราก่อน → remount กระดาน → ดึง scene ใหม่) โดยไม่ต้อง F5 ที่เด้งหน้าแรก
  const refreshBoard = useCallback(async () => {
    setRefreshing(true);
    try { await sketchRef.current?.save?.(); } catch { /* เซฟ best-effort */ }
    await load();
    setBoardKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 400);
  }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(id, { status }); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  // Section = Frame ของ Excalidraw (อยู่ข้างหลัง, เปลี่ยนชื่อ/ย่อขยายที่ตัวมันเอง, ลากของเข้าไปแล้วเลื่อนตามกัน)
  const insertSection = (name: string) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    void sketchRef.current.insert([{ type: "frame", children: [], name: name.trim() || t("โซนใหม่", "New section"), x: 0, y: 0, width: 560, height: 400 }]);
    setSectionOpen(false); setSectionName("");
  };
  const confirmSku = () => {
    if (!skuSel.length || !sketchRef.current) return;
    // วางหลายใบเรียงข้างกันในครั้งเดียว (เลื่อน x ต่อใบ)
    const all: Record<string, unknown>[] = [];
    skuSel.forEach((s, i) => { const dx = i * 270; for (const el of skuCardSkeleton(s)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    setSkuOpen(false); setSkuSel([]);
  };
  const onTaskCreated = (tk: CreatedTask) => { sketchRef.current?.insert(taskCardSkeleton(tk)); pushToast("success", t(`สร้างงาน ${tk.task_no} + วางการ์ดแล้ว`, `Created task ${tk.task_no} and placed card`)); };
  const createContentCard = async () => {
    if (!cForm.title.trim()) { pushToast("error", t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    try {
      const { id: cid, content_no } = await createContent({ title: cForm.title.trim(), campaign_id: id, post_type: cForm.post_type, platforms: cForm.platforms, scheduled_at: cForm.scheduled_at || null, status: "draft" });
      sketchRef.current?.insert(contentCardSkeleton({ id: cid, content_no, title: cForm.title.trim(), platforms: cForm.platforms }));
      setContentOpen(false); setCForm({ title: "", post_type: "image", platforms: [], scheduled_at: "" });
      pushToast("success", t(`สร้างคอนเทนต์ ${content_no} + วางการ์ดแล้ว`, `Created content ${content_no} and placed card`));
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // วางการ์ดโฟลเดอร์ (เก็บ path) บนกระดาน
  const addFolderCard = () => {
    const path = fForm.path.trim();
    if (!path) { pushToast("error", t("กรุณาใส่ path โฟลเดอร์", "Please enter a folder path")); return; }
    const label = fForm.label.trim() || path.split(/[\\/]/).filter(Boolean).pop() || "โฟลเดอร์";
    sketchRef.current?.insert(folderCardSkeleton({ path, label }));
    setFolderOpen(false); setFForm({ label: "", path: "" });
    pushToast("success", t("วางการ์ดโฟลเดอร์แล้ว", "Folder card placed"));
  };
  // คัดลอก path โฟลเดอร์ไปคลิปบอร์ด (เปิด File Explorer แล้ววาง Ctrl+V → Enter)
  const copyFolderPath = useCallback((path: string) => {
    if (!path) return;
    navigator.clipboard?.writeText(path)
      .then(() => pushToast("success", t("คัดลอก path แล้ว — เปิด File Explorer แล้ววาง (Ctrl+V → Enter)", "Path copied — open File Explorer and paste (Ctrl+V → Enter)")))
      .catch(() => pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")));
  }, [pushToast, t]);
  // คลิกการ์ดบนกระดาน → เปิด drawer ตามชนิด · การ์ดโฟลเดอร์ = คัดลอก path
  const onCardOpen = useCallback((data: Record<string, unknown>) => { if (data.kind === "sku") setSkuView(data); else if (data.kind === "task") setTaskView(data); else if (data.kind === "content") setContentView(data); else if (data.kind === "folder") copyFolderPath(String(data.path ?? "")); }, [copyFolderPath]);
  // workflow/ลบงาน สำหรับ TaskDetailDrawer เต็มบน canvas
  const moveTask = useCallback(async (task: CreativeTask, toKey: string) => { await applyTaskTransition(task, toKey, { pushToast }); }, [pushToast]);
  const removeTask = useCallback(async (tid: string) => { try { await deleteTask(tid); pushToast("info", t("ลบงานแล้ว", "Task deleted")); setTaskView(null); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast, t]);
  const openCards = () => { setCards(sketchRef.current?.listCards() ?? []); setCardsOpen(true); };

  // ⑦ ลากงานที่มีอยู่แล้วในแคมเปญ → วางบนกระดาน (เป็นการ์ดงาน)
  const [dragPanelOpen, setDragPanelOpen] = useState(false);
  const [boardTaskIds, setBoardTaskIds] = useState<Set<string>>(new Set());
  const refreshBoardIds = useCallback(() => {
    const ids = (sketchRef.current?.listCards() ?? []).filter((c) => c.kind === "task").map((c) => String(c.data.id));
    setBoardTaskIds(new Set(ids));
  }, []);
  const openDragPanel = () => { refreshBoardIds(); setDragPanelOpen(true); };
  const placeTaskCard = useCallback(async (task: CreativeTask) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    const subs = await listSubtasks(task.id).catch(() => []);
    sketchRef.current.insert(taskCardSkeleton({ id: task.id, task_no: task.task_no ?? "", title: task.title, subtasks: subs.map((s) => ({ title: s.title })) }));
    setBoardTaskIds((prev) => new Set(prev).add(task.id));
    pushToast("success", t(`วางการ์ดงาน ${task.task_no} แล้ว`, `Task card ${task.task_no} placed`));
  }, [pushToast, t]);
  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const tid = e.dataTransfer.getData("text/task-id"); if (!tid) return;
    const found = detail?.tasks.find((x) => x.id === tid); if (found) placeTaskCard(found);
  }, [detail, placeTaskCard]);

  // ② ซิงค์งานย่อยสดบนการ์ดงานเมื่อเปิดกระดาน (การ์ดเก็บ snapshot -- อัปเดตให้ตรงปัจจุบัน)
  const syncTaskCards = useCallback(() => {
    sketchRef.current?.refreshCards(async ({ kind, id, data }) => {
      if (kind !== "task" || !id) return null;
      const subs = await listSubtasks(id);
      const shown = subs.slice(0, 6);
      const subLines = subs.length
        ? shown.map((s) => `${(s.status === "approved" || s.status === "posted" || s.status === "done") ? "☑" : "☐"} ${s.title}`).join("\n") + (subs.length > 6 ? `\n… อีก ${subs.length - 6}` : "")
        : "— ยังไม่มีงานย่อย —";
      const text = `✅ ${data.title ?? ""}\n${data.task_no ?? ""}\n\nงานย่อย (${subs.length})\n${subLines}`;
      return { text, data: { subtasks: subs.map((s) => ({ title: s.title })) } };
    });
  }, []);

  if (err) return <StandaloneShell title={t("แคมเปญ", "Campaign")} icon="📣" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const name = detail?.campaign.name ?? t("แคมเปญ", "Campaign");

  return (
    <StandaloneShell title={name} icon="📣" accent="violet">
      {/* Top bar (sticky) -- อยู่ใต้หัวบาร์หลัก (top-14) */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 sticky top-14 z-20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/tasks/campaigns" className="text-sm text-slate-500 hover:text-slate-800">{t("แคมเปญ", "Campaigns")}</a>
            <span className="text-slate-300">›</span>
            <span className="font-semibold text-slate-900 truncate">{name}</span>
            {detail && (
              <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm">
                {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSectionOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🗂 Section</button>
            <button onClick={() => { setSkuSel([]); setSkuOpen(true); }} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📦 SKU Card</button>
            <button onClick={() => setTaskOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">✅ Task Card</button>
            <button onClick={openDragPanel} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">🧲 {t("ลากงานเข้า", "Drag tasks in")}</button>
            <button onClick={() => setContentOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50">📱 Content Card</button>
            <button onClick={() => setFolderOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-50">📁 {t("โฟลเดอร์", "Folder")}</button>
            <button onClick={openCards} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🗂️ {t("การ์ดบนกระดาน", "Cards on board")}</button>
            <button onClick={() => setDrawerOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📋 {t("รายละเอียด", "Details")}</button>
            <button onClick={refreshBoard} disabled={refreshing} title={t("โหลดกระดานล่าสุด (ดึงงานคนอื่นมาด้วย)", "Reload latest board")} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{refreshing ? "⏳" : "🔄"} {t("รีเฟรช", "Refresh")}</button>
            <button onClick={toggleFs} title={t("เต็มจอ", "Fullscreen")} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{fs ? `⛶ ${t("ออกเต็มจอ", "Exit Fullscreen")}` : `⛶ ${t("เต็มจอ", "Fullscreen")}`}</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="relative" onDragOver={(e) => { if (dragPanelOpen) e.preventDefault(); }} onDrop={onCanvasDrop}>
          {/* realtime ผ่าน Supabase Broadcast (ไม่กิน Cloudflare CPU) + เซฟกันทับด้วย version-guard */}
          <CanvasSketch key={boardKey} entityType="creative_campaign" entityId={id} height="calc(100vh - 180px)" controlsRef={sketchRef} onCardOpen={onCardOpen} onReady={syncTaskCards} collab />

          {/* ⑦ แผงลากงานเข้ากระดาน (งานในแคมเปญที่ยังไม่อยู่บนกระดาน) */}
          {dragPanelOpen && (
            <div className="absolute top-3 left-3 z-10 w-72 max-h-[70%] bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">🧲 {t("ลากงานเข้ากระดาน", "Drag task to board")}</span>
                <button onClick={() => setDragPanelOpen(false)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              <p className="px-3 pt-2 text-[11px] text-slate-400">{t("ลากการ์ดไปวางบนกระดาน หรือกดเพื่อวางตรงกลาง", "Drag a card onto the board, or click to place it in the center")}</p>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {(detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).length === 0 ? (
                  <p className="text-sm text-slate-400 italic p-2">{t("ทุกงานอยู่บนกระดานแล้ว 🎉", "All tasks are already on the board 🎉")}</p>
                ) : (detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).map((t) => (
                  <div key={t.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/task-id", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => placeTaskCard(t)}
                    className="cursor-grab active:cursor-grabbing border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-violet-300 hover:bg-violet-50/40">
                    <p className="text-sm text-slate-700 line-clamp-1">✅ {t.title}</p>
                    <p className="text-[11px] text-slate-400">{t.task_no} · {t.assignee_label || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">🗂 Section · 📦 SKU · ✅ Task · 📱 Content → <b>{t("ดับเบิลคลิกการ์ด", "Double-click a card")}</b>{t("เพื่อดู/จัดการ · ล้อเมาส์ = ซูม (shift+ล้อ = เลื่อน) · บันทึกอัตโนมัติ", " to view/manage · Scroll = zoom (shift+scroll = pan) · Auto-saved")}</p>
      </div>

      {/* เลือก SKU หลายอัน (checkbox) → วางการ์ดทีเดียว */}
      <ERPModal open={skuOpen} onClose={() => setSkuOpen(false)} title={t("เพิ่มการ์ดสินค้า (SKU) ลงกระดาน", "Add SKU Card to board")} size="md"
        footer={<>
          <button onClick={() => setSkuOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmSku} disabled={!skuSel.length} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{skuSel.length ? ` (${skuSel.length})` : ""}</button>
        </>}>
        <SkuMultiPick selected={skuSel} onChange={setSkuSel} />
      </ERPModal>

      {skuView && <SkuDrawer data={skuView} onClose={() => setSkuView(null)} />}
      {taskView && <TaskDetailDrawer taskId={String(taskView.id ?? "")} onClose={() => setTaskView(null)} onChanged={() => {}} onMove={moveTask} onDelete={removeTask} pushToast={pushToast} />}

      {/* เลือกโซน (Section) จากชุดสำเร็จ หรือพิมพ์เอง */}
      <ERPModal open={sectionOpen} onClose={() => setSectionOpen(false)} title={t("เพิ่มโซน (Section)", "Add Section")} size="sm"
        footer={<button onClick={() => setSectionOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">{t("เลือกโซนสำเร็จรูป (กดแล้ววางบนกระดานเลย)", "Choose a preset section (click to place it on the board)")}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {SECTION_PRESETS.map((s) => (
              <button key={s} onClick={() => insertSection(s)} className="w-full text-left h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50/40">{s}</button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-1.5">{t("หรือพิมพ์ชื่อเอง", "Or type a custom name")}</p>
            <div className="flex gap-2">
              <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sectionName.trim() && insertSection(sectionName)} placeholder={t("ชื่อโซน...", "Section name...")} className="flex-1 h-9 border border-slate-200 rounded-lg px-2 text-sm" />
              <button onClick={() => sectionName.trim() && insertSection(sectionName)} disabled={!sectionName.trim()} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            </div>
          </div>
        </div>
      </ERPModal>

      {/* ป๊อปอัปการ์ดโฟลเดอร์ — เก็บ path · ดับเบิลคลิกการ์ด = คัดลอก path */}
      <ERPModal open={folderOpen} onClose={() => setFolderOpen(false)} title={t("เพิ่มการ์ดโฟลเดอร์", "Add Folder card")} size="md"
        footer={<div className="flex justify-end gap-2"><button onClick={() => setFolderOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button><button onClick={addFolderCard} disabled={!fForm.path.trim()} className="h-9 px-4 text-sm text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50">📁 {t("วางการ์ด", "Place card")}</button></div>}>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ชื่อ (ไม่ใส่ = ใช้ชื่อโฟลเดอร์สุดท้าย)", "Label (empty = last folder name)")}</p>
            <ERPInput value={fForm.label} onChange={(e) => setFForm((f) => ({ ...f, label: e.target.value }))} placeholder={t("เช่น วิดีโอ Pasio", "e.g. Pasio videos")} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ที่อยู่โฟลเดอร์ (path)", "Folder path")}</p>
            <ERPInput value={fForm.path} onChange={(e) => setFForm((f) => ({ ...f, path: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && fForm.path.trim()) addFolderCard(); }} placeholder="Z:\Work In Process\[02]\Video\Pasio" />
          </div>
          <p className="text-[11px] text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2">{t("ดับเบิลคลิกการ์ดบนกระดาน = คัดลอก path · เปิด File Explorer แล้ววาง (Ctrl+V → Enter) · (สเต็ปถัดไป: เปิดโฟลเดอร์ทันที)", "Double-click the card = copy path · open File Explorer and paste (Ctrl+V → Enter)")}</p>
        </div>
      </ERPModal>

      {/* ป๊อปอัปสรุปการ์ดบนกระดาน */}
      <ERPModal open={cardsOpen} onClose={() => setCardsOpen(false)} title={t("การ์ดบนกระดาน", "Cards on board")} size="md"
        footer={<button onClick={() => setCardsOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        <CardsSummary cards={cards} onOpen={(c) => { setCardsOpen(false); if (c.kind === "task") setTaskView(c.data); else if (c.kind === "sku") setSkuView(c.data); else if (c.kind === "content") setContentView(c.data); else if (c.kind === "folder") copyFolderPath(String(c.data.path ?? "")); }} />
      </ERPModal>

      {/* สร้างงานจริง (ฟอร์มเดียวกับหน้างาน) -- ล็อกแคมเปญนี้ → วางการ์ดงานบนกระดาน */}
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} pushToast={pushToast} lockedCampaignId={id} lockedCampaignLabel={name} onCreated={onTaskCreated} />

      {/* สร้างคอนเทนต์ (ย่อ) → วางการ์ดคอนเทนต์ */}
      <ERPModal open={contentOpen} onClose={() => setContentOpen(false)} title={t("สร้างคอนเทนต์ลงกระดาน", "Add Content card to board")} size="md"
        footer={<>
          <button onClick={() => setContentOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={createContentCard} disabled={!cForm.title.trim()} className="h-9 px-4 text-sm text-white bg-amber-600 rounded-lg disabled:opacity-50">{t("สร้าง + วางการ์ด", "Create + place card")}</button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">{t("ชื่อคอนเทนต์", "Content title")}</label><input value={cForm.title} onChange={(e) => setCForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("เช่น โพสต์เปิดตัวสินค้าใหม่", "e.g. New product launch post")} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">{t("ประเภทโพสต์", "Post type")}</label><select value={cForm.post_type} onChange={(e) => setCForm((f) => ({ ...f, post_type: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm">{POST_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="text-xs text-slate-400">{t("ตั้งเวลาโพสต์", "Scheduled time")}</label><input type="datetime-local" value={cForm.scheduled_at} onChange={(e) => setCForm((f) => ({ ...f, scheduled_at: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
          </div>
          <div><label className="text-xs text-slate-400">{t("แพลตฟอร์ม", "Platforms")}</label>
            <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => { const on = cForm.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setCForm((f) => ({ ...f, platforms: on ? f.platforms.filter((x) => x !== p.value) : [...f.platforms, p.value] }))} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}</div>
          </div>
          <p className="text-xs text-slate-400">{t(`สร้างแบบย่อ — รายละเอียด/caption แก้ต่อได้ที่ "เปิดเต็ม" ในการ์ด`, `Quick create — edit details/caption later via "Open full" on the card`)}</p>
        </div>
      </ERPModal>

      {contentView && <ContentDrawer contentId={String(contentView.id ?? "")} brands={brands} onClose={() => setContentView(null)} onChanged={() => {}} pushToast={pushToast} />}

      {drawerOpen && <CampaignDrawer campaignId={id} onClose={() => setDrawerOpen(false)} onChanged={load} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// Drawer รายละเอียดสินค้า (จาก snapshot บนการ์ด -- เปิดได้แม้รีเฟรช)
function SkuDrawer({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const t = useT();
  const code = String(data.code ?? "");
  const name = String(data.name ?? "");
  const color = data.color ? String(data.color) : null;
  const price = data.price != null ? Number(data.price) : null;
  const img = data.image_url ? String(data.image_url) : null;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">📦 {t("รายละเอียดสินค้า", "Product Details")}</h3>
            <span className="font-mono text-xs text-slate-500">{code}</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt={name} className="w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
            : <div className="w-full h-40 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-sm">{t("ไม่มีรูปสินค้า", "No product image")}</div>}
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t("ชื่อสินค้า", "Product name")}</p>
            <p className="text-base font-medium text-slate-800">{name || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><p className="text-xs text-slate-400 mb-0.5">{t("สี", "Color")}</p><p className="font-medium text-slate-800">{color || "—"}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">{t("ราคา", "Price")}</p><p className="font-medium text-slate-800">{price != null ? `${price.toLocaleString()}฿` : "--"}</p></div>
          </div>
          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">* {t("ข้อมูลนี้เป็น snapshot ณ ตอนวางการ์ดบนกระดาน", "This data is a snapshot from when the card was placed on the board")}</p>
        </div>
      </div>
    </>
  );
}

// สรุปการ์ดบนกระดาน (Task / SKU) + กดเปิด
function CardsSummary({ cards, onOpen }: { cards: { kind: string; data: Record<string, unknown> }[]; onOpen: (c: { kind: string; data: Record<string, unknown> }) => void }) {
  const t = useT();
  const tasks = cards.filter((c) => c.kind === "task");
  const skus = cards.filter((c) => c.kind === "sku");
  const contents = cards.filter((c) => c.kind === "content");
  const folders = cards.filter((c) => c.kind === "folder");
  if (cards.length === 0) return <p className="text-sm text-slate-400 text-center py-6">{t("ยังไม่มีการ์ดบนกระดาน — กด ✅ Task / 📦 SKU / 📱 Content / 📁 โฟลเดอร์ เพื่อเพิ่ม", "No cards on the board yet — click ✅ Task / 📦 SKU / 📱 Content / 📁 Folder to add")}</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">✅ {t("การ์ดงาน", "Task cards")} ({tasks.length})</p>
        {tasks.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {tasks.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-violet-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? t("งาน", "Task"))}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.task_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📦 {t("การ์ดสินค้า", "Product cards")} ({skus.length})</p>
        {skus.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {skus.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-violet-50/40 text-left">
                <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{String(c.data.code ?? "")}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.name ?? "")}</span>
                {c.data.price != null && <span className="text-xs text-slate-400 shrink-0">{Number(c.data.price).toLocaleString()}฿</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📱 {t("การ์ดคอนเทนต์", "Content cards")} ({contents.length})</p>
        {contents.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {contents.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-amber-300 hover:bg-amber-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? t("คอนเทนต์", "Content"))}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.content_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {folders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📁 {t("การ์ดโฟลเดอร์", "Folder cards")} ({folders.length})</p>
          <div className="space-y-1.5">
            {folders.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} title={t("คัดลอก path", "Copy path")} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-cyan-300 hover:bg-cyan-50/40 text-left">
                <span className="text-sm text-slate-700 shrink-0">📁 {String(c.data.label ?? t("โฟลเดอร์", "Folder"))}</span>
                <span className="font-mono text-[11px] text-slate-400 flex-1 truncate text-right">{String(c.data.path ?? "")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// เลือก SKU หลายอัน (ค้นหา + checkbox)
function SkuMultiPick({ selected, onChange }: { selected: SkuPickerValue[]; onChange: (v: SkuPickerValue[]) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuPickerValue[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true);
    const tmr = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/pickers/skus?${new URLSearchParams({ search: query, limit: "30", sales_only: "false" })}`);
        const j = await res.json(); const rows = (j.data ?? []) as Record<string, unknown>[];
        if (active) setResults(rows.map((r) => ({ id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? r.code ?? ""), color: r.color != null ? String(r.color) : null, list_price: r.list_price == null ? null : Number(r.list_price), image_key: r.image_key == null ? null : String(r.image_key), image_url: r.image_key ? `/api/r2-image?key=${encodeURIComponent(String(r.image_key))}` : null })));
      } catch { if (active) setResults([]); } finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(tmr); };
  }, [query]);
  const toggle = (s: SkuPickerValue) => onChange(selected.some((x) => x.id === s.id) ? selected.filter((x) => x.id !== s.id) : [...selected, s]);
  return (
    <div className="space-y-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("🔍 ค้นหา SKU / ชื่อสินค้า...", "🔍 Search SKU / product name...")} className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm" />
      {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((s) => <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 rounded-full pl-2 pr-1 py-0.5"><span className="font-mono">{s.code}</span><button onClick={() => toggle(s)} className="hover:text-red-500">✕</button></span>)}</div>}
      <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {loading ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{t("กำลังค้นหา...", "Searching...")}</p>
          : results.length === 0 ? <p className="px-3 py-3 text-sm text-slate-400 text-center">{t("ไม่พบ SKU", "No SKU found")}</p>
          : results.map((s) => { const on = selected.some((x) => x.id === s.id); return (
            <button key={s.id} onClick={() => toggle(s)} className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 ${on ? "bg-violet-50/40" : ""}`}>
              <input type="checkbox" readOnly checked={on} className="h-4 w-4 rounded border-slate-300 text-violet-600 pointer-events-none" />
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
              <span className="text-sm text-slate-700 flex-1 truncate">{s.name}</span>
              {s.list_price != null && <span className="text-xs text-slate-400 shrink-0">{Number(s.list_price).toLocaleString()}฿</span>}
            </button>
          ); })}
      </div>
    </div>
  );
}
