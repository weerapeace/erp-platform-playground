"use client";

// ============================================================
// ของกลาง: ตัวเลือกออเดอร์จากศูนย์ออเดอร์ (Shopee/Lazada/TikTok/LINE/เว็บ) — PlatformOrderPicker
// ใช้ทำอะไร: ให้ผู้ใช้กดเลือกออเดอร์จากรายการแทนพิมพ์เลขเอง แล้วได้ ช่องทาง/ลูกค้า/สินค้า/หมายเหตุลูกค้า กลับไปเติมฟอร์ม
// ใช้เมื่อไหร่: ฟอร์มที่ผูกกับออเดอร์ออนไลน์ (คำสั่งพิเศษ · ซ่อม/คืน · รอของ · …)
// ห้ามใช้เมื่อไหร่: เลือกใบสั่งขายในระบบ (SO) / ใบสั่งผลิต (ใช้ MO picker) · ออเดอร์จากเมล (รายงานยอด ไม่อยู่ในรายการ)
// พฤติกรรม: ออเดอร์ที่ลูกค้าเขียนหมายเหตุขึ้นก่อน · ค้นเลขออเดอร์/ลูกค้า/หมายเหตุ · ป้าย "มีคำสั่งแล้ว" กันลงซ้ำ
// ข้อมูล: GET /api/order-ops?orders=1 (สิทธิ์ order_ops.view) · lib/order-ops-server listPickerOrders
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { LoadingState, ErrorState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";

export type PickedOrder = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; ordered_at: string | null;
  status: string | null; packed: boolean; note: string | null; has_instruction: boolean;
  items: { sku: string | null; name: string | null; qty: number; sku_id: string | null; image_key?: string | null }[];
};

const DAY_OPTIONS = [7, 14, 30, 90];

export function PlatformOrderPicker({ open, onClose, onPick, title = "เลือกออเดอร์", existingLabel = "มีคำสั่งแล้ว", itemBadge }: {
  open: boolean;
  onClose: () => void;
  onPick: (o: PickedOrder) => void;
  title?: string;
  /** ป้ายบนออเดอร์ที่มีบันทึกอยู่แล้ว (ค่าเริ่ม: มีคำสั่งแล้ว) */
  existingLabel?: string;
  /** ป้ายเสริมต่อท้ายรหัสสินค้า เช่น ถอดรหัสสลัก "ฟอยทอง · ตรงกลาง" (ไม่มี = null) */
  itemBadge?: (sku: string | null) => string | null;
}) {
  const [q, setQ] = useState("");
  const [days, setDays] = useState(14);
  const [openOnly, setOpenOnly] = useState(false);
  const [notesFirst, setNotesFirst] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PickedOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (pg: number) => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const p = new URLSearchParams({ orders: "1", days: String(days), page: String(pg), notes_first: notesFirst ? "1" : "0" });
    if (openOnly) p.set("open", "1");
    if (q.trim()) p.set("q", q.trim());
    try {
      const res = await apiFetch(`/api/order-ops?${p}`);
      const j = (await res.json()) as { orders?: PickedOrder[]; hasMore?: boolean; noteCount?: number; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error(j.error || "โหลดรายการออเดอร์ไม่สำเร็จ");
      setRows((prev) => (pg === 1 ? j.orders ?? [] : [...prev, ...(j.orders ?? []).filter((o) => !prev.some((x) => x.id === o.id))]));
      setHasMore(!!j.hasMore);
      if (pg === 1) setNoteCount(j.noteCount ?? 0);
    } catch (e) {
      if (id === reqId.current) setError((e as Error).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [days, openOnly, notesFirst, q]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    const t = setTimeout(() => void load(1), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, load, q]);

  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "border-sky-400 bg-sky-50 font-medium text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="lg" defaultExpanded={false} storageKey="platform-order-picker" zIndex={60}>
      <div className="space-y-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / หมายเหตุ" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setNotesFirst((v) => !v)} className={chip(notesFirst)}>มีหมายเหตุก่อน</button>
          <button type="button" onClick={() => setOpenOnly((v) => !v)} className={chip(openOnly)}>ยังไม่แพ็ก</button>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {DAY_OPTIONS.map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={chip(days === d)}>{d} วัน</button>)}
        </div>
        {error ? <ErrorState title={error} onRetry={() => load(1)} />
          : loading && !rows.length ? <LoadingState />
          : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {rows.map((o) => (
                <button key={o.id} type="button" onClick={() => { onPick(o); onClose(); }} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  {o.items.some((i) => i.image_key) && (
                    <div className="flex shrink-0 -space-x-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {o.items.filter((i) => i.image_key).slice(0, 3).map((i, n) => <img key={n} src={r2ImageUrl(i.image_key, 96) ?? ""} alt="" loading="lazy" className="h-10 w-10 rounded-md border-2 border-white object-cover" />)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs">{o.order_no}</span>
                      {o.note && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">มีหมายเหตุ</span>}
                      {o.has_instruction && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{existingLabel}</span>}
                      {o.packed && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">แพ็กแล้ว</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {o.platform ?? "-"} · {o.customer_name ?? "-"} · {o.items.map((i) => { const b = itemBadge?.(i.sku); return `${i.sku ?? "?"} ×${i.qty}${b ? ` (${b})` : ""}`; }).join(", ") || "ไม่มีรายการสินค้า"}
                      <span className="hidden sm:inline">{o.ordered_at ? ` · ${new Date(o.ordered_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
                    </div>
                    {o.note && <div className="text-xs text-amber-800">“{o.note}”</div>}
                  </div>
                  <Icon name="chevron-down" className="mt-1 h-4 w-4 shrink-0 -rotate-90 text-slate-300" />
                </button>
              ))}
              {!rows.length && <div className="px-3 py-6 text-center text-sm text-slate-400">ไม่พบออเดอร์ ลองเปลี่ยนคำค้นหรือช่วงวัน</div>}
            </div>
          )}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{notesFirst && noteCount ? `มีหมายเหตุ ${noteCount} ใบ (ขึ้นก่อน) · ` : ""}ไม่รวมออเดอร์จากเมล · กดแถว = เลือก</span>
          {hasMore && <button type="button" disabled={loading} onClick={() => { const n = page + 1; setPage(n); void load(n); }} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}</button>}
        </div>
      </div>
    </ERPModal>
  );
}
