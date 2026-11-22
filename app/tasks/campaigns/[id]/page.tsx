"use client";

// ============================================================
// Campaign Canvas -- กระดาน Excalidraw ของแคมเปญ (ของกลาง CanvasSketch)
// กดการ์ดแคมเปญ → เข้าหน้านี้ · ปุ่ม "รายละเอียด" เปิด CampaignDrawer · ปุ่ม Section = Frame
// การ์ดจากระบบอื่น (SKU / Parent / SKU การตลาด / งาน / คอนเทนต์ / เทรนด์ / ใบงานออกแบบ / รูป / โฟลเดอร์ / ตาราง)
//   = ของกลาง components/canvas-cards (useCardKit) — ใช้ร่วมกับกระดานแผนงานทีม (2026-11-15)
// หน้านี้เหลือเฉพาะของแคมเปญ: หัว/สถานะ · ลากงานในแคมเปญเข้ากระดาน · คลังความรู้ · รายละเอียดแคมเปญ
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { StandaloneShell } from "@/components/standalone-shell";
import { useAuth } from "@/components/auth";
import { GifPokeLayer } from "../../gif-poke-layer";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { CAMPAIGN_STATUS } from "../campaign-status";
import { TASKS_SETTINGS_PERM } from "@/lib/creative-perms";
import { getCampaign, updateCampaign, listSubtasks, type CampaignDetail, type CreativeTask } from "../../data";
import { usePushToast } from "@/components/toast";
import { taskCardSkeleton } from "@/components/canvas-cards/skeletons";
import { ToolMenu } from "@/components/canvas-cards/drawers";
import { useCardKit } from "@/components/canvas-cards/use-card-kit";
import { Icon } from "@/components/icon";

// โหลดของกลาง Excalidraw แบบ dynamic -- ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">Loading canvas...</div>,
});
const KnowledgeDrawer = dynamic(() => import("../../knowledge-drawer").then((m) => m.KnowledgeDrawer), { ssr: false });
// drawer ที่มีตัวพิมพ์ข้อความ (rich text) — โหลดเมื่อเปิดใช้จริง ไม่ถ่วงการเปิดหน้า
const CampaignDrawer = dynamic(() => import("../campaign-drawer").then((m) => m.CampaignDrawer), { ssr: false });

// โซนสำเร็จรูปสำหรับกระดานแคมเปญ

export default function CampaignCanvasPage() {
  const t = useT();
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ฝังอยู่ใน iframe ของแอปเดี่ยว (/app/tasks) จะ "ไม่มีหัวบาร์ 56px" → ต้องลดระยะ sticky ของแถบบน
  // ไม่งั้น sticky ที่ตั้ง top เผื่อหัวบาร์ไว้จะถูกดันลงมาทับแถบเครื่องมือกระดาน (toolbox "จม")
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try {
      const inFrame = window.self !== window.top;
      const urlEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
      setEmbed(urlEmbed || (inFrame && sessionStorage.getItem("erp_shell_embed") === "1"));
    } catch { /* ignore */ }
  }, []);
  const [boardKey, setBoardKey] = useState(0); // เปลี่ยนเพื่อรีโหลดกระดานล่าสุด (แทน F5 ที่เด้งหน้าแรก)
  // หมายเหตุ: ความสูงกระดานจัดการโดย CanvasSketch เอง (autoH — วัดพื้นที่ที่เหลือให้พอดีจอ)
  // ค่า height ที่ส่งไปเป็นแค่ค่าตั้งต้นก่อน autoH วัดเสร็จ · อย่าวัดซ้ำที่หน้านี้ (จะตีกัน)
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false); // คลังความรู้
  const { user, can } = useAuth();
  const [fs, setFs] = useState(false); // เต็มจอ
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const pushToast = usePushToast();   // แจ้งเตือนผ่าน toast กลาง (components/toast)

  const load = useCallback(async () => { try { setDetail(await getCampaign(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);
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

  const name = detail?.campaign.name ?? t("แคมเปญ", "Campaign");
  // ชุดการ์ดกลาง — งาน/คอนเทนต์ที่สร้างจากกระดานนี้ผูกแคมเปญนี้ · ใบงานใหม่ใช้แบรนด์แคมเปญ
  const campaign = useMemo(() => ({ id, name, brandId: detail?.campaign.brand_id ?? null }), [id, name, detail?.campaign.brand_id]);
  const kit = useCardKit({ sketchRef, campaign, contextLabel: name, board: "campaign" });   // โซนสำเร็จรูป/เทมเพลต = ตั้งในป๊อป Section (lib/board-section-templates)

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
    void sketchRef.current.insert(taskCardSkeleton({ id: task.id, task_no: task.task_no ?? "", title: task.title, subtasks: subs.map((s) => ({ title: s.title })) }));
    setBoardTaskIds((prev) => new Set(prev).add(task.id));
    pushToast("success", t(`วางการ์ดงาน ${task.task_no} แล้ว`, `Task card ${task.task_no} placed`));
  }, [pushToast, t]);
  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const tid = e.dataTransfer.getData("text/task-id"); if (!tid) return;
    const found = detail?.tasks.find((x) => x.id === tid); if (found) placeTaskCard(found);
  }, [detail, placeTaskCard]);

  if (err) return <StandaloneShell title={t("แคมเปญ", "Campaign")} icon="i:ad" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const k = kit.items;
  return (
    <StandaloneShell title={name} icon="i:ad" accent="violet">
      {/* GIF จิ้มเพื่อน — โผล่วิ่งบนหน้านี้ด้วย (ดูข้อความ/กดปิด · ตอบกลับทำที่หน้าแรก) */}
      <GifPokeLayer userId={user?.id ?? null} />
      {/* Top bar (sticky) -- อยู่ใต้หัวบาร์หลัก (top-14) */}
      <div className={`bg-white border-b border-slate-200 px-8 py-4 sticky z-20 ${embed ? "top-0" : "top-14"}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/tasks" title={t("กลับหน้าแรก (คลิกกลาง = เปิดแท็บใหม่)", "Home (middle-click = new tab)")} className="h-8 px-2.5 inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"><Icon value="i:home" /> <span className="hidden sm:inline">{t("หน้าแรก", "Home")}</span></a>
            <Link href="/tasks/campaigns" className="text-sm text-slate-500 hover:text-slate-800">{t("แคมเปญ", "Campaigns")}</Link>
            <span className="text-slate-300">›</span>
            <span className="font-semibold text-slate-900 truncate">{name}</span>
            {detail && (
              <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm">
                {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label()}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* จัดปุ่มเป็นกลุ่มตามประเภท — เดิมเรียงยาว 14 ปุ่มจนแถบรก */}
            <ToolMenu label={t("เพิ่มการ์ด", "Add card")} icon="＋" tone="violet" items={[
              k.sku, k.parent, k.marketing, k.task,
              { icon: <Icon value="i:magnet" />, label: t("ลากงานเข้า", "Drag tasks in"), hint: t("งานในแคมเปญที่ยังไม่อยู่บนกระดาน", "Campaign tasks not on the board yet"), onClick: openDragPanel },
              k.content, k.trend,
              ...(kit.canDesign ? [k.designSheet] : []),
              k.cardStyle,
            ]} />
            <ToolMenu label={t("เครื่องมือ", "Tools")} icon={<Icon value="i:tools" />} tone="teal" items={[k.section, k.table, k.folder, k.asset]} />
            <ToolMenu label={t("ข้อมูล", "Info")} icon={<Icon value="i:clipboard-list" />} tone="slate" items={[
              k.cards,
              { icon: <Icon value="i:books" />, label: t("ความรู้", "Knowledge"), hint: t("คลังความรู้ของทีม", "Team knowledge base"), onClick: () => setKnowledgeOpen(true) },
              { icon: <Icon value="i:clipboard-list" />, label: t("รายละเอียดแคมเปญ", "Campaign details"), hint: t("แก้ข้อมูล/งานในแคมเปญ", "Edit campaign info"), onClick: () => setDrawerOpen(true) },
            ]} />
            <button onClick={refreshBoard} disabled={refreshing} title={t("โหลดกระดานล่าสุด (ดึงงานคนอื่นมาด้วย)", "Reload latest board")} className="h-9 w-9 inline-flex items-center justify-center text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"><Icon value={refreshing ? "i:hourglass" : "i:refresh"} /></button>
            <button onClick={toggleFs} title={fs ? t("ออกเต็มจอ", "Exit fullscreen") : t("เต็มจอ", "Fullscreen")} className="h-9 w-9 inline-flex items-center justify-center text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"><Icon value={fs ? "i:minimize" : "i:maximize"} /></button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="relative" onDragOver={(e) => { if (dragPanelOpen) e.preventDefault(); }} onDrop={onCanvasDrop}>
          {/* realtime ผ่าน Supabase Broadcast (ไม่กิน Cloudflare CPU) + เซฟกันทับด้วย version-guard */}
          {/* ความสูงวัดจากพื้นที่ที่เหลือจริง → กระดานเต็มถึงแถบล่างพอดี หน้าไม่เลื่อน toolbox ไม่จม */}
          <CanvasSketch key={boardKey} entityType="creative_campaign" entityId={id} height="calc(100vh - 205px)" controlsRef={sketchRef} onCardOpen={kit.onCardOpen} onReady={kit.onBoardReady} onSelectionChange={kit.onSelection} onContentChange={kit.onContentChange} collab stickyTop={embed ? 72 : 128} />

          {/* ⑦ แผงลากงานเข้ากระดาน (งานในแคมเปญที่ยังไม่อยู่บนกระดาน) */}
          {dragPanelOpen && (
            <div className="absolute top-3 left-3 z-10 w-72 max-h-[70%] bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700"><Icon value="i:magnet" className="mr-1" />{t("ลากงานเข้ากระดาน", "Drag task to board")}</span>
                <button onClick={() => setDragPanelOpen(false)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              <p className="px-3 pt-2 text-[11px] text-slate-400">{t("ลากการ์ดไปวางบนกระดาน หรือกดเพื่อวางตรงกลาง", "Drag a card onto the board, or click to place it in the center")}</p>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {(detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).length === 0 ? (
                  <p className="text-sm text-slate-400 italic p-2">{t("ทุกงานอยู่บนกระดานแล้ว", "All tasks are already on the board")} <Icon value="i:confetti" /></p>
                ) : (detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).map((t) => (
                  <div key={t.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/task-id", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => placeTaskCard(t)}
                    className="cursor-grab active:cursor-grabbing border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-violet-300 hover:bg-violet-50/40">
                    <p className="text-sm text-slate-700 line-clamp-1"><Icon value="i:circle-check" className="mr-1" />{t.title}</p>
                    <p className="text-[11px] text-slate-400">{t.task_no} · {t.assignee_label || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2"><Icon value="i:folders" className="mr-1" />Section · <Icon value="i:package" className="mr-1" />SKU · <Icon value="i:circle-check" className="mr-1" />Task · <Icon value="i:device-mobile" className="mr-1" />Content · <Icon value="i:ruler-measure" className="mr-1" />{t("ใบงานออกแบบ", "Design sheet")} → <b>{t("ดับเบิลคลิกการ์ด", "Double-click a card")}</b>{t("เพื่อดู/จัดการ · ล้อเมาส์ = ซูม (shift+ล้อ = เลื่อน) · บันทึกอัตโนมัติ", " to view/manage · Scroll = zoom (shift+scroll = pan) · Auto-saved")}</p>
      </div>

      {/* ป๊อปทั้งหมดของชุดการ์ดกลาง (เลือก/สร้าง/เปิดดูการ์ด) */}
      {kit.ui}
      {knowledgeOpen && <KnowledgeDrawer onClose={() => setKnowledgeOpen(false)} canEdit={can(TASKS_SETTINGS_PERM as Parameters<typeof can>[0])} pushToast={pushToast} />}
      {drawerOpen && <CampaignDrawer campaignId={id} onClose={() => setDrawerOpen(false)} onChanged={load} pushToast={pushToast} />}

    </StandaloneShell>
  );
}
