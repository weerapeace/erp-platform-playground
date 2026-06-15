"use client";

// ============================================================
// Campaign Canvas — กระดาน Excalidraw ของแคมเปญ (ของกลาง CanvasSketch)
// กดการ์ดแคมเปญ → เข้าหน้านี้ · ปุ่ม "รายละเอียด" เปิด CampaignDrawer · ปุ่ม Section = Frame
// เฟส 1: โครงหลัก (วาด + Section) — SKU Card / Task Card มาเฟสถัดไป
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { SkuPicker } from "@/components/pickers";
import type { SkuPickerValue } from "@/components/pickers";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { CampaignDrawer, CAMPAIGN_STATUS } from "../campaign-drawer";
import { CreateTaskModal, type CreatedTask } from "../../create-task-modal";
import { TaskDetailDrawer } from "../../task-detail-drawer";
import { applyTaskTransition } from "../../task-actions";
import { useCreativeOptions } from "../../use-options";
import { getCampaign, updateCampaign, deleteTask, createContent, POST_TYPES, type CampaignDetail, type CreativeTask } from "../../data";

// โหลดของกลาง Excalidraw แบบ dynamic — ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">กำลังโหลดกระดาน...</div>,
});

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

// โซนสำเร็จรูปสำหรับกระดานแคมเปญ
const SECTION_PRESETS = ["Brainstorming (ไอเดีย)", "Reference", "Information (ข้อมูล)", "Products (สินค้าใน Campaign)", "Tasks (งาน)"];

// การ์ด SKU บน Excalidraw: รูป(บน) + ข้อความ(ล่าง) ในกล่อง — customData = snapshot สำหรับ drawer (ดับเบิลคลิกการ์ดเปิด)
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

// การ์ดคอนเทนต์บน Excalidraw — customData (ดับเบิลคลิกเปิด)
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

// การ์ดงานบน Excalidraw: ชื่อ + รายการ subtask (snapshot) — customData (ดับเบิลคลิกการ์ดเปิด drawer จัดการสด)
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
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuPick, setSkuPick] = useState<SkuPickerValue | null>(null);
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
  const { platforms: platformOpts } = useCreativeOptions();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const pushToast = useCallback((type: Toast["type"], message: string) => { const tid = Date.now() + Math.random(); setToasts((q) => [...q, { id: tid, type, message }]); setTimeout(() => setToasts((q) => q.filter((t) => t.id !== tid)), 3500); }, []);

  const load = useCallback(async () => { try { setDetail(await getCampaign(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(id, { status }); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  // Section = Frame ของ Excalidraw (อยู่ข้างหลัง, เปลี่ยนชื่อ/ย่อขยายที่ตัวมันเอง, ลากของเข้าไปแล้วเลื่อนตามกัน)
  const insertSection = (name: string) => {
    if (!sketchRef.current) { pushToast("info", "กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง"); return; }
    void sketchRef.current.insert([{ type: "frame", children: [], name: name.trim() || "โซนใหม่", x: 0, y: 0, width: 560, height: 400 }]);
    setSectionOpen(false); setSectionName("");
  };
  const confirmSku = () => { if (!skuPick || !sketchRef.current) return; void sketchRef.current.insert(skuCardSkeleton(skuPick)); setSkuOpen(false); setSkuPick(null); };
  const onTaskCreated = (t: CreatedTask) => { sketchRef.current?.insert(taskCardSkeleton(t)); pushToast("success", `สร้างงาน ${t.task_no} + วางการ์ดแล้ว`); };
  const createContentCard = async () => {
    if (!cForm.title.trim()) { pushToast("error", "กรุณาใส่ชื่อคอนเทนต์"); return; }
    try {
      const { id: cid, content_no } = await createContent({ title: cForm.title.trim(), campaign_id: id, post_type: cForm.post_type, platforms: cForm.platforms, scheduled_at: cForm.scheduled_at || null, status: "draft" });
      sketchRef.current?.insert(contentCardSkeleton({ id: cid, content_no, title: cForm.title.trim(), platforms: cForm.platforms }));
      setContentOpen(false); setCForm({ title: "", post_type: "image", platforms: [], scheduled_at: "" });
      pushToast("success", `สร้างคอนเทนต์ ${content_no} + วางการ์ดแล้ว`);
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // คลิกการ์ดบนกระดาน → เปิด drawer ตามชนิด
  const onCardOpen = useCallback((data: Record<string, unknown>) => { if (data.kind === "sku") setSkuView(data); else if (data.kind === "task") setTaskView(data); else if (data.kind === "content") setContentView(data); }, []);
  // workflow/ลบงาน สำหรับ TaskDetailDrawer เต็มบน canvas
  const moveTask = useCallback(async (task: CreativeTask, toKey: string) => { await applyTaskTransition(task, toKey, { pushToast }); }, [pushToast]);
  const removeTask = useCallback(async (tid: string) => { try { await deleteTask(tid); pushToast("info", "ลบงานแล้ว"); setTaskView(null); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast]);
  const openCards = () => { setCards(sketchRef.current?.listCards() ?? []); setCardsOpen(true); };

  if (err) return <StandaloneShell title="แคมเปญ" icon="📣" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const name = detail?.campaign.name ?? "แคมเปญ";

  return (
    <StandaloneShell title={name} icon="📣" accent="violet">
      {/* Top bar (sticky) */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 sticky top-14 z-20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/tasks/campaigns" className="text-sm text-slate-500 hover:text-slate-800">แคมเปญ</a>
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
            <button onClick={() => { setSkuPick(null); setSkuOpen(true); }} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📦 SKU Card</button>
            <button onClick={() => setTaskOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">✅ Task Card</button>
            <button onClick={() => setContentOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50">📱 Content Card</button>
            <button onClick={openCards} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🗂️ การ์ดบนกระดาน</button>
            <button onClick={() => setDrawerOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📋 รายละเอียด</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <CanvasSketch entityType="creative_campaign" entityId={id} height="calc(100vh - 180px)" controlsRef={sketchRef} onCardOpen={onCardOpen} />
        <p className="text-xs text-slate-400 mt-2">🗂 Section · 📦 SKU · ✅ Task · 📱 Content → <b>ดับเบิลคลิกการ์ด</b>เพื่อดู/จัดการ · ล้อเมาส์ = ซูม (shift+ล้อ = เลื่อน) · บันทึกอัตโนมัติ</p>
      </div>

      {/* เลือก SKU จริง → วางการ์ดลงกระดาน */}
      <ERPModal open={skuOpen} onClose={() => setSkuOpen(false)} title="เพิ่มการ์ดสินค้า (SKU) ลงกระดาน" size="md"
        footer={<>
          <button onClick={() => setSkuOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={confirmSku} disabled={!skuPick} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">เพิ่มการ์ด</button>
        </>}>
        <SkuPicker value={skuPick} onChange={setSkuPick} />
      </ERPModal>

      {skuView && <SkuDrawer data={skuView} onClose={() => setSkuView(null)} />}
      {taskView && <TaskDetailDrawer taskId={String(taskView.id ?? "")} onClose={() => setTaskView(null)} onChanged={() => {}} onMove={moveTask} onDelete={removeTask} pushToast={pushToast} />}

      {/* เลือกโซน (Section) จากชุดสำเร็จ หรือพิมพ์เอง */}
      <ERPModal open={sectionOpen} onClose={() => setSectionOpen(false)} title="เพิ่มโซน (Section)" size="sm"
        footer={<button onClick={() => setSectionOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ปิด</button>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">เลือกโซนสำเร็จรูป (กดแล้ววางบนกระดานเลย)</p>
          <div className="grid grid-cols-1 gap-1.5">
            {SECTION_PRESETS.map((s) => (
              <button key={s} onClick={() => insertSection(s)} className="w-full text-left h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50/40">{s}</button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-1.5">หรือพิมพ์ชื่อเอง</p>
            <div className="flex gap-2">
              <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sectionName.trim() && insertSection(sectionName)} placeholder="ชื่อโซน..." className="flex-1 h-9 border border-slate-200 rounded-lg px-2 text-sm" />
              <button onClick={() => sectionName.trim() && insertSection(sectionName)} disabled={!sectionName.trim()} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">เพิ่ม</button>
            </div>
          </div>
        </div>
      </ERPModal>

      {/* ป๊อปอัปสรุปการ์ดบนกระดาน */}
      <ERPModal open={cardsOpen} onClose={() => setCardsOpen(false)} title="การ์ดบนกระดาน" size="md"
        footer={<button onClick={() => setCardsOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ปิด</button>}>
        <CardsSummary cards={cards} onOpen={(c) => { setCardsOpen(false); if (c.kind === "task") setTaskView(c.data); else if (c.kind === "sku") setSkuView(c.data); else if (c.kind === "content") setContentView(c.data); }} />
      </ERPModal>

      {/* สร้างงานจริง (ฟอร์มเดียวกับหน้างาน) — ล็อกแคมเปญนี้ → วางการ์ดงานบนกระดาน */}
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} pushToast={pushToast} lockedCampaignId={id} lockedCampaignLabel={name} onCreated={onTaskCreated} />

      {/* สร้างคอนเทนต์ (ย่อ) → วางการ์ดคอนเทนต์ */}
      <ERPModal open={contentOpen} onClose={() => setContentOpen(false)} title="สร้างคอนเทนต์ลงกระดาน" size="md"
        footer={<>
          <button onClick={() => setContentOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={createContentCard} disabled={!cForm.title.trim()} className="h-9 px-4 text-sm text-white bg-amber-600 rounded-lg disabled:opacity-50">สร้าง + วางการ์ด</button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">ชื่อคอนเทนต์</label><input value={cForm.title} onChange={(e) => setCForm((f) => ({ ...f, title: e.target.value }))} placeholder="เช่น โพสต์เปิดตัวสินค้าใหม่" className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">ประเภทโพสต์</label><select value={cForm.post_type} onChange={(e) => setCForm((f) => ({ ...f, post_type: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm">{POST_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="text-xs text-slate-400">ตั้งเวลาโพสต์</label><input type="datetime-local" value={cForm.scheduled_at} onChange={(e) => setCForm((f) => ({ ...f, scheduled_at: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
          </div>
          <div><label className="text-xs text-slate-400">แพลตฟอร์ม</label>
            <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => { const on = cForm.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setCForm((f) => ({ ...f, platforms: on ? f.platforms.filter((x) => x !== p.value) : [...f.platforms, p.value] }))} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}</div>
          </div>
          <p className="text-xs text-slate-400">สร้างแบบย่อ — รายละเอียด/caption แก้ต่อได้ที่ “เปิดเต็ม” ในการ์ด</p>
        </div>
      </ERPModal>

      {contentView && <ContentCardDrawer data={contentView} onClose={() => setContentView(null)} />}

      {drawerOpen && <CampaignDrawer campaignId={id} onClose={() => setDrawerOpen(false)} onChanged={load} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// Drawer รายละเอียดสินค้า (จาก snapshot บนการ์ด — เปิดได้แม้รีเฟรช)
function SkuDrawer({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
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
            <h3 className="text-base font-semibold text-slate-900 truncate">📦 รายละเอียดสินค้า</h3>
            <span className="font-mono text-xs text-slate-500">{code}</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt={name} className="w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
            : <div className="w-full h-40 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-sm">ไม่มีรูปสินค้า</div>}
          <div>
            <p className="text-xs text-slate-400 mb-0.5">ชื่อสินค้า</p>
            <p className="text-base font-medium text-slate-800">{name || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><p className="text-xs text-slate-400 mb-0.5">สี</p><p className="font-medium text-slate-800">{color || "—"}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">ราคา</p><p className="font-medium text-slate-800">{price != null ? `${price.toLocaleString()}฿` : "—"}</p></div>
          </div>
          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">* ข้อมูลนี้เป็น snapshot ณ ตอนวางการ์ดบนกระดาน</p>
        </div>
      </div>
    </>
  );
}

// สรุปการ์ดบนกระดาน (Task / SKU) + กดเปิด
function CardsSummary({ cards, onOpen }: { cards: { kind: string; data: Record<string, unknown> }[]; onOpen: (c: { kind: string; data: Record<string, unknown> }) => void }) {
  const tasks = cards.filter((c) => c.kind === "task");
  const skus = cards.filter((c) => c.kind === "sku");
  const contents = cards.filter((c) => c.kind === "content");
  if (cards.length === 0) return <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีการ์ดบนกระดาน — กด ✅ Task / 📦 SKU / 📱 Content เพื่อเพิ่ม</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">✅ การ์ดงาน ({tasks.length})</p>
        {tasks.length === 0 ? <p className="text-sm text-slate-400 italic">—</p> : (
          <div className="space-y-1.5">
            {tasks.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-violet-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? "งาน")}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.task_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📦 การ์ดสินค้า ({skus.length})</p>
        {skus.length === 0 ? <p className="text-sm text-slate-400 italic">—</p> : (
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
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📱 การ์ดคอนเทนต์ ({contents.length})</p>
        {contents.length === 0 ? <p className="text-sm text-slate-400 italic">—</p> : (
          <div className="space-y-1.5">
            {contents.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-amber-300 hover:bg-amber-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? "คอนเทนต์")}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.content_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Drawer การ์ดคอนเทนต์ (snapshot) + ลิงก์ไปจัดการเต็ม (caption/hashtag/ลิงก์) ที่หน้าคอนเทนต์
function ContentCardDrawer({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const cid = String(data.id ?? "");
  const contentNo = String(data.content_no ?? "");
  const title = String(data.title ?? "");
  const platforms = Array.isArray(data.platforms) ? (data.platforms as string[]) : [];
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900 truncate">📱 {title || "คอนเทนต์"}</h3><span className="font-mono text-xs text-slate-500">{contentNo}</span></div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">แพลตฟอร์ม</p>
            {platforms.length ? <div className="flex flex-wrap gap-1.5">{platforms.map((p) => <span key={p} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{p}</span>)}</div> : <p className="text-sm text-slate-400 italic">—</p>}
          </div>
          <a href={`/tasks/content?content=${encodeURIComponent(cid)}`} target="_blank" rel="noopener noreferrer" className="block text-center h-10 leading-10 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700">เปิดเต็ม (caption / hashtag / ลิงก์) →</a>
        </div>
      </div>
    </>
  );
}
