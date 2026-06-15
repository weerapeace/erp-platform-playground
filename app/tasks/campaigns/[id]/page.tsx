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
import { getCampaign, updateCampaign, type CampaignDetail } from "../../data";

// โหลดของกลาง Excalidraw แบบ dynamic — ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">กำลังโหลดกระดาน...</div>,
});

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

// การ์ด SKU บน Excalidraw: รูป(บน) + ข้อความ(ล่าง) ในกล่อง — ใส่ link (ให้คลิกได้) + customData (snapshot สำหรับ drawer)
function skuCardSkeleton(s: SkuPickerValue): Record<string, unknown>[] {
  const gid = `sku-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const link = `https://card.local/sku/${s.id}`;
  const data = { kind: "sku", id: s.id, code: s.code, name: s.name, color: s.color ?? null, price: s.list_price ?? null, image_url: s.image_url ?? null };
  const hasImg = !!s.image_url;
  const W = 230, imgH = 170, txtY = hasImg ? imgH + 18 : 14, H = hasImg ? imgH + 86 : 96;
  const priceLine = [s.color, s.list_price != null ? `${Number(s.list_price).toLocaleString()}฿` : null].filter(Boolean).join("  ·  ");
  const text = [`📦 ${s.code}`, s.name, priceLine].filter(Boolean).join("\n");
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#7c3aed", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], link, customData: data },
  ];
  if (hasImg) els.push({ type: "image", _imageUrl: s.image_url, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], link, customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#1e293b", groupIds: [gid], link, customData: data });
  return els;
}

export default function CampaignCanvasPage() {
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuPick, setSkuPick] = useState<SkuPickerValue | null>(null);
  const [skuView, setSkuView] = useState<Record<string, unknown> | null>(null); // การ์ดที่กดดู
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
  const confirmSku = () => { if (!skuPick || !sketchRef.current) return; void sketchRef.current.insert(skuCardSkeleton(skuPick)); setSkuOpen(false); setSkuPick(null); };
  // คลิกการ์ดบนกระดาน → เปิด drawer ตามชนิด
  const onCardOpen = useCallback((data: Record<string, unknown>) => { if (data.kind === "sku") setSkuView(data); }, []);

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
            <button onClick={() => { setSkuPick(null); setSkuOpen(true); }} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📦 SKU Card</button>
            <button onClick={() => setDrawerOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📋 รายละเอียด</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <CanvasSketch entityType="creative_campaign" entityId={id} height="calc(100vh - 180px)" controlsRef={sketchRef} onCardOpen={onCardOpen} />
        <p className="text-xs text-slate-400 mt-2">🗂 Section = เฟรมแบบ Miro · 📦 SKU Card มีรูป กดที่ไอคอน 🔗 บนการ์ดเพื่อดูรายละเอียด · กระดานบันทึกอัตโนมัติ</p>
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
