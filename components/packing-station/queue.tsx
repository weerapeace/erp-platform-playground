"use client";

/**
 * 📋 คิวรอแพ็ค — เลือกออเดอร์แทนการยิงใบปะหน้า (กรณีเครื่องยิงเสีย · เจ้าของสั่ง 2026-11-19)
 * ข้อมูล /api/packing?queue=1 · รีเฟรชเองทุก 60 วิ และทุกครั้งที่แพ็ค/แก้เสร็จ (refreshKey)
 * โชว์ "ใครกำลังแพ็คอยู่" (กัน 2 โต๊ะแพ็คใบเดียวกัน) · กรอง: เลยกำหนด / ส่งวันนี้ / ร้าน · ค้นเลขออเดอร์ เลขพัสดุ สินค้า
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { shipDue, SHIP_DUE_LABEL } from "@/lib/platform-order-status";

export type QueueRow = {
  id: string; order_no: string | null; platform: string | null; platform_code: string | null;
  tracking_no: string | null; package_no: string | null; ship_by_at: string | null; platform_status: string | null; cod: boolean;
  qty: number; items: { code: string | null; name: string | null; qty: number }[]; box: string | null;
  lock: { packer_id: string | null; packer_name: string | null; station: string | null; started_at: string } | null;
};

type Filter = "all" | "late" | "today" | string;

const DUE_TONE: Record<string, string> = { late: "bg-red-100 text-red-700", today: "bg-amber-100 text-amber-800", tomorrow: "bg-slate-100 text-slate-600", later: "bg-slate-100 text-slate-500" };

export function PackQueue({ refreshKey, activeOrderId, meId, onPick }: { refreshKey: number; activeOrderId: string | null; meId: string | null; onPick: (row: QueueRow) => void }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/packing?queue=1");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดคิวไม่สำเร็จ"); return; }
      setError(null); setRows(j.queue ?? []);
    } catch { setError("เน็ตหลุด — โหลดคิวไม่ได้"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000); return () => window.clearInterval(t); }, [load]);

  const now = Date.now();
  const platforms = useMemo(() => [...new Map((rows ?? []).filter((r) => r.platform_code).map((r) => [r.platform_code!, r.platform ?? r.platform_code!])).entries()], [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "late" && shipDue({ ship_by_at: r.ship_by_at, status: "new" }, now) !== "late") return false;
      if (filter === "today" && shipDue({ ship_by_at: r.ship_by_at, status: "new" }, now) !== "today") return false;
      if (filter !== "all" && filter !== "late" && filter !== "today" && r.platform_code !== filter) return false;
      if (!s) return true;
      return `${r.order_no ?? ""} ${r.tracking_no ?? ""} ${r.package_no ?? ""} ${r.items.map((i) => `${i.code ?? ""} ${i.name ?? ""}`).join(" ")}`.toLowerCase().includes(s);
    });
  }, [rows, q, filter, now]);

  const chips: [Filter, string][] = [["all", "ทั้งหมด"], ["late", "เลยกำหนด"], ["today", "ส่งวันนี้"], ...platforms.map(([c, n]) => [c, n] as [Filter, string])];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-800">รอแพ็ค {rows ? `(${rows.length})` : ""}</p>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Icon name="refresh" /> รีเฟรช</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / เลขพัสดุ / สินค้า" className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <div className="mb-2 flex flex-wrap gap-1">
        {chips.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-2.5 py-0.5 text-xs ${filter === k ? "bg-sky-100 font-medium text-sky-800" : "bg-slate-100 text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {error ? <ErrorState title="โหลดคิวไม่ได้" hint={error} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดคิว…" />
        : shown.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{rows.length ? "ไม่มีออเดอร์ตามตัวกรอง" : "ไม่มีออเดอร์รอแพ็ค"}</p>
        : (
          <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-auto pr-0.5">
            {shown.map((r) => {
              const due = shipDue({ ship_by_at: r.ship_by_at, status: "new" }, now);
              const lockedByOther = r.lock && r.lock.packer_id !== meId;
              const isActive = r.id === activeOrderId;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onPick(r)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${isActive ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{r.order_no}</span>
                      {due !== "none" && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${DUE_TONE[due] ?? ""}`}>{SHIP_DUE_LABEL[due]}</span>}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {[r.platform, r.tracking_no ?? (r.platform_status === "READY_TO_SHIP" ? "ยังไม่กดจัดส่ง" : r.package_no), `${r.qty} ชิ้น`, r.box ? `กล่อง ${r.box}` : null, r.cod ? "เก็บปลายทาง" : null].filter(Boolean).join(" · ")}
                    </p>
                    <p className="truncate text-xs text-slate-400">{r.items.map((i) => `${i.code ?? i.name ?? "?"}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</p>
                    {lockedByOther && <p className="mt-0.5 text-xs font-medium text-amber-700"><Icon name="lock" /> {r.lock!.packer_name ?? "มีคน"}{r.lock!.station ? ` (${r.lock!.station})` : ""} กำลังแพ็คอยู่</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
