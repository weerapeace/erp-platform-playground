"use client";

/**
 * PrHistoryButton — ปุ่ม "ประวัติการขอซื้อ" + ป๊อปรายการ PR ล่าสุด + สถานะ (self-contained)
 * ใช้ในหน้าขอซื้อ: <PrHistoryButton /> (แตะ page แค่บรรทัดเดียว)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatAmount } from "@/lib/money";

type Row = {
  id: string; seller_name: string; item_name: string; code: string; image_url: string | null;
  qty: number; uom: string; line_total: number; currency: string;
  order_date: string | null; created_at: string | null; requester: string; status: string; reject_reason: string | null;
};

const STATUS: Record<string, { text: string; cls: string }> = {
  waiting:     { text: "🕓 รออนุมัติ/รอสั่ง", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:    { text: "✅ อนุมัติแล้ว",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rfq_created: { text: "🧾 ออกใบสั่งซื้อแล้ว",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  received:    { text: "📦 รับของแล้ว",        cls: "bg-green-50 text-green-700 border-green-200" },
  rejected:    { text: "✕ ไม่อนุมัติ",         cls: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled:   { text: "🗑 ยกเลิก",            cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export function PrHistoryButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch("/api/purchasing/pr-history").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => r.item_name.toLowerCase().includes(ql) || r.code.toLowerCase().includes(ql) || r.seller_name.toLowerCase().includes(ql) || r.requester.toLowerCase().includes(ql));
  }, [rows, q]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-10 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
        📋 ประวัติการขอซื้อ
      </button>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} size="lg" storageKey="pr-history"
          title="📋 ประวัติการขอซื้อ"
          description="รายการที่เคยขอซื้อล่าสุด + สถานะ"
          footer={<button onClick={() => setOpen(false)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ปิด</button>}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 ค้นหา ชื่อ / รหัส / ร้าน / ผู้ขอ..." className="w-full h-9 px-3 mb-3 text-sm border border-slate-200 rounded-md" />
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : err ? (
            <div className="py-10 text-center text-red-500 text-sm">⚠ {err} <button onClick={load} className="underline ml-1">ลองใหม่</button></div>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-slate-300 text-sm">{q.trim() ? "— ไม่พบรายการที่ค้นหา —" : "— ยังไม่มีประวัติ —"}</div>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[60vh] overflow-auto">
              {shown.map((r) => {
                const st = STATUS[r.status] ?? { text: r.status || "—", cls: "bg-slate-100 text-slate-500 border-slate-200" };
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                      {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-800 truncate">{r.item_name}</div>
                      <div className="text-[11px] text-slate-400">{r.code || "—"} · 🏪 {r.seller_name} · {r.order_date ? formatDate(r.order_date) : "—"} · โดย {r.requester || "—"}</div>
                      {r.status === "rejected" && r.reject_reason && <div className="text-[11px] text-rose-500">เหตุผล: {r.reject_reason}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm tabular-nums text-slate-700">{r.qty.toLocaleString()} {r.uom}</div>
                      <div className="text-[11px] text-slate-400">{formatAmount(r.line_total, r.currency)}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${st.cls}`}>{st.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ERPModal>
      )}
    </>
  );
}
