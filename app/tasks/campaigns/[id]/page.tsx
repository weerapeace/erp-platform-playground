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
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { CampaignDrawer, CAMPAIGN_STATUS } from "../campaign-drawer";
import { getCampaign, updateCampaign, type CampaignDetail } from "../../data";

// โหลดของกลาง Excalidraw แบบ dynamic — ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">กำลังโหลดกระดาน...</div>,
});

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export default function CampaignCanvasPage() {
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const pushToast = useCallback((type: Toast["type"], message: string) => { const tid = Date.now() + Math.random(); setToasts((q) => [...q, { id: tid, type, message }]); setTimeout(() => setToasts((q) => q.filter((t) => t.id !== tid)), 3500); }, []);

  const load = useCallback(async () => { try { setDetail(await getCampaign(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(id, { status }); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  // Section = Frame ของ Excalidraw (อยู่ข้างหลัง, เปลี่ยนชื่อ/ย่อขยายที่ตัวมันเอง, ลากของเข้าไปแล้วเลื่อนตามกัน)
  const addSection = () => {
    if (!sketchRef.current) { pushToast("info", "กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง"); return; }
    const name = window.prompt("ชื่อโซน (Section)", "ไอเดีย");
    if (name === null) return;
    void sketchRef.current.insert([{ type: "frame", children: [], name: name.trim() || "โซนใหม่", x: 0, y: 0, width: 560, height: 400 }]);
  };

  if (err) return <StandaloneShell title="แคมเปญ" icon="📣" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const name = detail?.campaign.name ?? "แคมเปญ";

  return (
    <StandaloneShell title={name} icon="📣" accent="violet">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
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
            <button onClick={addSection} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🗂 Section</button>
            <button onClick={() => setDrawerOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📋 รายละเอียด</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <CanvasSketch entityType="creative_campaign" entityId={id} height="calc(100vh - 180px)" controlsRef={sketchRef} />
        <p className="text-xs text-slate-400 mt-2">🗂 Section = เฟรมแบบ Miro (อยู่ข้างหลัง ลากของเข้าไปจัดกลุ่มได้ เปลี่ยนชื่อที่ตัวเฟรม) · กระดานบันทึกอัตโนมัติ</p>
      </div>

      {drawerOpen && <CampaignDrawer campaignId={id} onClose={() => setDrawerOpen(false)} onChanged={load} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}
