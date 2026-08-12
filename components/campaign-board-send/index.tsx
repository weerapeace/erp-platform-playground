"use client";

/**
 * ของกลาง — "ส่งใบงานออกแบบขึ้นกระดานวางแผนของแคมเปญ"
 *
 * ใช้ที่ไหน: Design Dashboard (ส่งทีละหลายใบ) · ป๊อปอัปใบงานออกแบบ (ส่งใบเดียวไว ๆ)
 *
 * ทำงานยังไง: ไม่แก้ scene ของกระดานจากหน้าที่กด — กระดานเก็บ scene ฝั่ง server + มี
 * realtime/version-guard → เขียนข้ามหน้าจะชนกับคนที่เปิดกระดานค้างอยู่. วิธีที่ใช้คือ
 * ส่งรายการ id ไปกับ URL (`?add_design_sheets=`) แล้วให้หน้ากระดานวางการ์ดเอง
 * → ปลอดภัย + คนกดได้เห็นกระดานทันทีเพื่อจัดตำแหน่งการ์ดต่อ
 *
 * สิทธิ์: กระดานอยู่ในแอป "งาน" (/tasks) → เช็กด้วย useAppGuard("tasks") ตัวเดียวกับ layout ของแอปนั้น
 * ไม่มีสิทธิ์ = ไม่ต้องโชว์ปุ่มเลย (ฝั่ง API ยังมี guardApi กันอีกชั้น)
 *
 * ตัวอย่าง:
 *   const canSend = useCanSendToBoard();
 *   {canSend && <button onClick={() => setOpen(true)}>🎨 ส่งขึ้นกระดาน</button>}
 *   <CampaignBoardPicker open={open} onClose={() => setOpen(false)} sheetIds={[sheet.id]} />
 *
 * ข้อจำกัด: ส่งได้ครั้งละไม่เกิน SEND_TO_BOARD_MAX ใบ (กัน URL ยาวเกิน)
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAppGuard } from "@/components/app-access-gate";

/** ส่งได้ครั้งละไม่เกินกี่ใบ (กัน URL ยาวเกิน) */
export const SEND_TO_BOARD_MAX = 40;

type CampaignOption = { id: string; name: string; status: string; brand_label: string | null };

// ป้ายสถานะแคมเปญ (ชุดเดียวกับ CAMPAIGN_STATUS ใน app/tasks/campaigns/campaign-drawer.tsx)
// ไม่ import มาตรง ๆ เพราะจะลาก drawer + โมดูลงานทั้งก้อนเข้า bundle ของหน้าที่เรียกใช้
const CAMPAIGN_STATUS_TH: Record<string, string> = { planning: "วางแผน", active: "กำลังทำ", done: "จบแล้ว", cancelled: "ยกเลิก" };

/** มีสิทธิ์ส่งขึ้นกระดานไหม (= เข้าแอปงานได้ไหม) — ไม่มีสิทธิ์ให้ซ่อนปุ่มไปเลย */
export function useCanSendToBoard(): boolean {
  return !useAppGuard("tasks").blocked;
}

/** ป๊อปอัปเลือกแคมเปญปลายทาง → กดแล้วพาไปกระดานนั้นพร้อมวางการ์ดให้ (ใบงานออกแบบ และ/หรือ เทรนด์) */
export function CampaignBoardPicker({ open, onClose, sheetIds, trendIds }: {
  open: boolean;
  onClose: () => void;
  /** id ใบงานออกแบบที่จะวางบนกระดาน (เกิน SEND_TO_BOARD_MAX จะถูกตัด) */
  sheetIds?: string[];
  /** id เทรนด์ที่จะวางบนกระดาน (บอร์ดเทรนด์ → การ์ดรูปหน้าเทรนด์) */
  trendIds?: string[];
}) {
  const [campaigns, setCampaigns] = useState<CampaignOption[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || campaigns !== null) return;
    let alive = true;
    apiFetch("/api/creative-campaigns").then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const rows = Array.isArray(j?.data) ? j.data as Array<Record<string, unknown>> : [];
        setCampaigns(rows.map((c) => ({ id: String(c.id), name: String(c.name ?? ""), status: String(c.status ?? ""), brand_label: (c.brand_label as string) ?? null })));
      })
      .catch(() => { if (alive) setCampaigns([]); });
    return () => { alive = false; };
  }, [open, campaigns]);

  if (!open || typeof document === "undefined") return null;

  const ids = (sheetIds ?? []).filter(Boolean).slice(0, SEND_TO_BOARD_MAX);
  const tIds = (trendIds ?? []).filter(Boolean).slice(0, SEND_TO_BOARD_MAX);
  const go = (campaignId: string) => {
    if (!ids.length && !tIds.length) return;
    const sp = new URLSearchParams();
    if (ids.length) sp.set("add_design_sheets", ids.join(","));
    if (tIds.length) sp.set("add_trends", tIds.join(","));
    window.location.href = `/tasks/campaigns/${encodeURIComponent(campaignId)}?${sp.toString()}`;
  };
  const q = query.trim().toLowerCase();
  const shown = (campaigns ?? []).filter((c) => !q || `${c.name} ${c.brand_label ?? ""}`.toLowerCase().includes(q));

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-[520px] max-w-full flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-base font-semibold text-slate-800">🎨 ส่งขึ้นกระดานวางแผน</div>
            <p className="text-xs text-slate-400">
              เลือกแคมเปญที่จะวาง{[ids.length ? `การ์ดใบงาน ${ids.length} ใบ` : null, tIds.length ? `การ์ดเทรนด์ ${tIds.length} ใบ` : null].filter(Boolean).join(" + ")}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="border-b border-slate-100 px-4 py-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 ค้นหาแคมเปญ..."
            className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex-1 overflow-auto p-2">
          {campaigns === null ? (
            <p className="py-6 text-center text-sm text-slate-400">กำลังโหลดแคมเปญ...</p>
          ) : campaigns.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีแคมเปญ — สร้างได้ที่หน้า “แคมเปญ” ในระบบงาน</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ไม่พบแคมเปญที่ตรงกับคำค้น</p>
          ) : (
            shown.map((c) => (
              <button key={c.id} onClick={() => go(c.id)}
                className="mb-1 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">📣 {c.name}</span>
                {c.brand_label && <span className="shrink-0 text-[11px] text-slate-400">{c.brand_label}</span>}
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{CAMPAIGN_STATUS_TH[c.status] ?? c.status}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          กดแคมเปญแล้วระบบจะพาไปที่กระดานนั้นและวางการ์ดให้อัตโนมัติ · จัดตำแหน่งการ์ดต่อได้บนกระดาน
        </div>
      </div>
    </div>,
    document.body,
  );
}
