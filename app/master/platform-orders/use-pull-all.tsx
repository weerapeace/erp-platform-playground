"use client";

// ปุ่ม "ดึงออเดอร์ทุกร้านตอนนี้" + ไฟสถานะบนปุ่ม "สถานะดึงออเดอร์" (ศูนย์ออเดอร์ · เจ้าของเลือก widget 2026-11-22 ข้อ 1, 3)
//   ดึงทีละร้านผ่าน POST /api/platform-orders/pull (ตัวกลางเดียวกับตัวดึงอัตโนมัติ · ย้อน 3 ชม. · อ่านจากร้านอย่างเดียว)
//   โชว์ความคืบหน้ารายร้าน (จุดวิ่ง) แล้วสรุป "ใหม่ X ใบ" · ร้านพัง = บอกชื่อร้าน + เหตุผล
//   รายชื่อร้าน + สถานะ = GET /api/platform-orders/pull-status?lite=1 (เบา · ไม่นับออเดอร์)

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PULL_STATE_META, PULL_STATE_RANK, type PullState } from "@/lib/order-pull-health";

type LiteShop = { platform: string; brand_id: string | null; label: string; mode: "api" | "email" | "direct" | "none"; state: PullState };

const PULL_CSS = `
@keyframes po-flow{from{left:-10px}to{left:100%}}
@keyframes po-spin{to{transform:rotate(360deg)}}
.po-flow{position:relative;display:inline-block;width:56px;height:4px;border-radius:2px;background:#e2e8f0;overflow:hidden;vertical-align:middle}
.po-flow i{position:absolute;top:0;width:8px;height:4px;border-radius:2px;background:#10b981;animation:po-flow 1.2s linear infinite}
.po-flow i:nth-child(2){animation-delay:.4s}.po-flow i:nth-child(3){animation-delay:.8s}
.po-spin{display:inline-flex;animation:po-spin 1s linear infinite}
@media (prefers-reduced-motion: reduce){.po-flow i,.po-spin{animation:none}}
`;
const DOT: Record<string, string> = { success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500", muted: "bg-slate-300" };

export function usePullAll({ canManage, onDone }: { canManage: boolean; onDone: () => void }): { pullButton: ReactNode; progress: ReactNode; statusDot: ReactNode } {
  const toast = useToast();
  const [shops, setShops] = useState<LiteShop[] | null>(null);
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState<ReactNode>(null);

  const loadLite = useCallback(async () => {
    try {
      const j = await apiFetch("/api/platform-orders/pull-status?lite=1", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) setShops((j.shops ?? []) as LiteShop[]);
    } catch { /* ไฟสถานะไม่ขึ้นก็ยังใช้หน้าได้ */ }
  }, []);
  useEffect(() => { void loadLite(); }, [loadLite]);

  const pullAll = useCallback(async () => {
    const list = (shops ?? []).filter((s) => s.mode === "api" || s.mode === "direct");
    if (!list.length) { toast.warning("ยังไม่มีร้านที่ดึงอัตโนมัติได้ — ต่อร้านที่หน้าบัญชีแพลตฟอร์มก่อน"); return; }
    setRunning(true);
    let created = 0, updated = 0;
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      setLine(<><span className="po-flow" aria-hidden><i /><i /><i /></span> <span>กำลังดึง {s.label} ({i + 1}/{list.length})</span></>);
      try {
        const j = await apiFetch("/api/platform-orders/pull", { method: "POST", body: JSON.stringify({ platform: s.platform, brand_id: s.brand_id }) }).then((r) => r.json()) as { ok?: boolean; created?: number; updated?: number; error?: string | null };
        if (j.ok) { created += j.created ?? 0; updated += j.updated ?? 0; } else failed.push(`${s.label}: ${j.error || "ดึงไม่สำเร็จ"}`);
      } catch { failed.push(`${s.label}: เชื่อมต่อไม่ได้`); }
    }
    const sum = `ดึงครบ ${list.length} ร้าน · ใหม่ ${created} ใบ · อัปเดต ${updated} ใบ`;
    setLine(<span className={failed.length ? "text-amber-700" : "text-emerald-700"}><Icon value={failed.length ? "i:alert-triangle" : "i:check"} className="mr-1" />{sum}{failed.length ? ` · ไม่สำเร็จ ${failed.length}: ${failed.join(" · ")}` : ""}</span>);
    if (failed.length) toast.warning(`${sum} · ไม่สำเร็จ ${failed.length} ร้าน`); else toast.success(sum);
    setRunning(false);
    onDone(); void loadLite();
    setTimeout(() => setLine(null), 15_000);
  }, [shops, toast, onDone, loadLite]);

  const worst = (shops ?? []).filter((s) => s.mode !== "none").reduce<PullState | null>((w, s) => (w == null || PULL_STATE_RANK[s.state] < PULL_STATE_RANK[w] ? s.state : w), null);
  const statusDot = worst
    ? <span className={`inline-block h-2 w-2 rounded-full ${DOT[PULL_STATE_META[worst].tone]}`} title={`ร้านที่แย่สุดตอนนี้: ${PULL_STATE_META[worst].label}`} aria-label={`สถานะดึงออเดอร์: ${PULL_STATE_META[worst].label}`} />
    : <Icon value="i:route" />;

  const pullButton = canManage ? (
    <button type="button" onClick={() => void pullAll()} disabled={running || !shops}
      title="ดึงออเดอร์ที่เปลี่ยนสถานะใน 3 ชม.ล่าสุดจากทุกร้านทันที (อ่านจากร้านอย่างเดียว · ปกติระบบดึงเองทุก 15 นาที)"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
      <style>{PULL_CSS}</style>
      <span className={running ? "po-spin" : ""}><Icon value="i:refresh" /></span>{running ? "กำลังดึง…" : "ดึงออเดอร์ทุกร้านตอนนี้"}
    </button>
  ) : null;
  const progress = line ? <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">{line}</div> : null;
  return { pullButton, progress, statusDot };
}
