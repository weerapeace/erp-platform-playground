"use client";

/**
 * โหมดจับคู่ทีละตัว (Match Workbench) — ไล่สินค้าบนร้านที่ยังไม่มีคู่ทีละตัวเหมือนตรวจการบ้าน
 * ซ้าย = คิว (ตัวที่ระบบเดาได้มั่นใจสุดมาก่อน) · ขวา = รายละเอียด + คู่ที่เดา (MatchCandidates) + ค้นหาเอง
 * คีย์ลัด: 1-3 เลือกคู่ที่เดา · S ข้าม · ← → เลื่อน (ไม่ทำงานตอนพิมพ์ในช่องค้นหา)
 * ไม่บันทึกเอง — เรียก onMatch ของหน้า (บันทึกผ่าน /api/platform-catalog/match + audit)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import type { MatchSuggestion } from "@/lib/platform-match-suggest";
import { MatchCandidates, type PickedParent } from "./match-candidates";

export type WorkItem = { id: string; title: string | null; sku_code: string | null; external_product_id: string | null; price: number | null };
type Done = "ok" | "skip";

export function MatchWorkbench({ open, onClose, title, items, suggestions, suggestLoading, canEdit, total, matchedBefore, onMatch }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** สินค้าที่ยังไม่มีคู่ (ตอนเปิดโหมด) */
  items: WorkItem[];
  suggestions: Record<string, MatchSuggestion[]>;
  suggestLoading?: boolean;
  canEdit: boolean;
  /** จำนวนสินค้าทั้งร้าน + ที่จับคู่ไว้ก่อนเปิดโหมด (ไว้โชว์ความคืบหน้ารวม) */
  total: number;
  matchedBefore: number;
  onMatch: (listingId: string, parent: PickedParent) => Promise<boolean>;
}) {
  // คิวคงที่ตั้งแต่เปิด (จับคู่แล้วไม่สลับลำดับใต้มือ) — มั่นใจสุดมาก่อน จะได้คืบเร็วช่วงแรก
  const [queue, setQueue] = useState<WorkItem[]>([]);
  const [cur, setCur] = useState(0);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [busy, setBusy] = useState(false);
  // ยอดจับคู่ "ก่อนเปิดโหมด" ต้องแช่ไว้ — หน้าแม่นับเพิ่มทุกครั้งที่จับคู่ ถ้าใช้ค่าสดจะนับซ้ำ 2 เท่า
  const [base, setBase] = useState(0);
  useEffect(() => {
    if (!open) return;
    const top = (id: string) => suggestions[id]?.[0]?.score ?? 0;
    setQueue([...items].sort((a, b) => top(b.id) - top(a.id)));
    setCur(0); setDone({}); setBase(matchedBefore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const okCount = useMemo(() => Object.values(done).filter((d) => d === "ok").length, [done]);
  const skipCount = useMemo(() => Object.values(done).filter((d) => d === "skip").length, [done]);
  const finished = queue.length > 0 && queue.every((q) => done[q.id]);
  const item = queue[cur];

  const goNextPending = useCallback((from: number, mark?: Record<string, Done>) => {
    const d = mark ?? done;
    for (let i = 1; i <= queue.length; i++) {
      const j = (from + i) % queue.length;
      if (!d[queue[j].id]) { setCur(j); return; }
    }
  }, [done, queue]);

  const pick = useCallback(async (p: PickedParent) => {
    if (!item || busy || !canEdit) return;
    setBusy(true);
    const ok = await onMatch(item.id, p);
    setBusy(false);
    if (!ok) return;
    const next = { ...done, [item.id]: "ok" as Done };
    setDone(next);
    goNextPending(cur, next);
  }, [item, busy, canEdit, onMatch, done, goNextPending, cur]);

  const skip = useCallback(() => {
    if (!item) return;
    const next = done[item.id] ? done : { ...done, [item.id]: "skip" as Done };
    setDone(next);
    goNextPending(cur, next);
  }, [item, done, goNextPending, cur]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !item || finished) return;
      const n = Number(e.key);
      const sugs = suggestions[item.id] ?? [];
      if (n >= 1 && n <= Math.min(3, sugs.length)) { e.preventDefault(); const s = sugs[n - 1]; void pick({ id: s.parent_sku_id, code: s.code, name: s.name }); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); skip(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setCur((c) => Math.min(queue.length - 1, c + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, item, finished, suggestions, pick, skip, queue.length]);

  const matchedNow = base + okCount;
  const pct = total ? Math.round((matchedNow / total) * 100) : 0;

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="xl" storageKey="platform-catalog-workbench"
      description="ไล่จับคู่ทีละตัว — กด 1-3 เลือกคู่ที่ระบบเดา · S ข้าม · ← → เลื่อน">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
        <span className="text-xs text-slate-500 shrink-0 tabular-nums">จับคู่แล้ว {matchedNow.toLocaleString()} / {total.toLocaleString()} ({pct}%)</span>
      </div>

      {queue.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">ร้านนี้จับคู่ครบทุกตัวแล้ว 🎉</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-4">
          {/* คิว */}
          <div className="bg-slate-50 rounded-xl p-2 md:max-h-[65vh] overflow-y-auto">
            <div className="text-xs text-slate-500 px-2 pt-1 pb-2">
              ในชุดนี้ {queue.length.toLocaleString()} ตัว · จับคู่ {okCount} · ข้าม {skipCount}
            </div>
            {queue.map((q, i) => {
              const d = done[q.id];
              const top = suggestions[q.id]?.[0];
              return (
                <button key={q.id} type="button" onClick={() => setCur(i)}
                  className={`w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 text-sm ${i === cur ? "bg-violet-100 text-violet-800" : "hover:bg-white"} ${d ? "text-slate-400" : "text-slate-700"}`}>
                  <span className="shrink-0 w-4 text-center">{d === "ok" ? "✓" : d === "skip" ? "↷" : top && top.score >= 90 ? "●" : "○"}</span>
                  <span className={`truncate ${d === "ok" ? "line-through" : ""}`} title={q.title ?? ""}>{q.sku_code || q.title || q.external_product_id || "—"}</span>
                </button>
              );
            })}
          </div>

          {/* รายละเอียดตัวที่เลือก */}
          <div className="min-w-0">
            {finished ? (
              <div className="py-16 text-center space-y-2">
                <p className="text-base font-medium text-slate-800">ชุดนี้เสร็จแล้ว</p>
                <p className="text-sm text-slate-500">จับคู่ไป {okCount} ตัว · ข้าม {skipCount} ตัว (ตัวที่ข้ามยังอยู่ในการ์ด &quot;ยังไม่มีคู่&quot;)</p>
                <button type="button" onClick={onClose} className="mt-2 h-9 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700">กลับไปหน้ารายการ</button>
              </div>
            ) : item && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-400">ตัวที่ {cur + 1} จาก {queue.length.toLocaleString()}{done[item.id] === "ok" ? " · จับคู่แล้ว" : done[item.id] === "skip" ? " · ข้ามไว้" : ""}</div>
                    <div className="text-base font-medium text-slate-900 leading-snug">{item.title || "—"}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      SKU {item.sku_code || "—"} · #{item.external_product_id || "—"}{item.price != null ? ` · ${item.price.toLocaleString()}฿` : ""}
                    </div>
                  </div>
                </div>
                <MatchCandidates key={item.id} numbered suggestions={suggestions[item.id]} loading={suggestLoading && !suggestions[item.id]}
                  canEdit={canEdit} busy={busy} onPick={(p) => void pick(p)} />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button type="button" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">← ก่อนหน้า</button>
                  <button type="button" onClick={skip} className="h-9 px-3 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ข้ามไปก่อน (S)</button>
                  <button type="button" onClick={() => setCur((c) => Math.min(queue.length - 1, c + 1))} disabled={cur >= queue.length - 1} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">ถัดไป →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
