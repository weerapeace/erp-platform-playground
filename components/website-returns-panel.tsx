"use client";

/**
 * ↩️ แท็บคำขอคืน/เปลี่ยนสินค้า (/website/<shop>?tab=returns)
 *
 * แยกตามสถานะ (รอร้านตรวจ/อนุมัติ/ได้รับของคืน/เสร็จสิ้น/ไม่อนุมัติ) · ตาราง = MiniTable กลาง · กดแถว = ERPModal ดูรูป/ชิ้น/เหตุผล
 * ปุ่มเปลี่ยนสถานะเฉพาะที่ทำต่อได้ (RETURN_MOVES) + หมายเหตุถึงลูกค้า (เห็นในหน้าขอคืน) · ทุกการเปลี่ยนลง audit
 * ระบบไม่คืนเงิน/ไม่ตัดสต็อกให้เอง — ร้านทำต่อตามขั้นตอนปกติ · ข้อมูล /api/website/returns · กฎ lib/website-returns
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { RETURN_MOVES, RETURN_STATUSES, returnReasonLabel, type ReturnStatus } from "@/lib/website-returns";

interface Row {
  id: string;
  order_id: string;
  kind: "return" | "exchange";
  reason: string;
  detail: string;
  items: { itemId: string; name: string; variant: string | null; qty: number }[];
  images: string[];
  status: ReturnStatus;
  staff_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  lang: string;
  created_at: string;
  store_orders: { order_no: string; customer_name: string; customer_phone: string; status: string; grand_total: number } | null;
}

const thDate = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const statusOf = (k: string) => RETURN_STATUSES.find((s) => s.key === k);
const MOVE_LABEL: Record<ReturnStatus, string> = { pending: "รอตรวจ", approved: "✅ อนุมัติ (ให้ส่งของกลับ)", received: "📦 ได้รับของคืนแล้ว", closed: "🏁 ปิดคำขอ (คืนเงิน/ส่งของใหม่แล้ว)", rejected: "✕ ไม่อนุมัติ" };

export function WebsiteReturnsPanel({ shopSlug }: { shopSlug: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/website/returns?shop=${encodeURIComponent(shopSlug)}&status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.returns ?? []);
        setCounts(j.counts ?? {});
      })
      .catch(() => {
        toast.error("โหลดคำขอไม่สำเร็จ");
        setRows([]);
      });
  }, [shopSlug, status, toast]);
  useEffect(() => load(), [load]);

  const move = async (r: Row, next: ReturnStatus) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/returns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status: next, note }) }).then((x) => x.json());
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(`เปลี่ยนเป็น “${statusOf(next)?.label ?? next}” แล้ว`);
      setOpen(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[...RETURN_STATUSES.map((s) => ({ key: s.key as string, label: s.label })), { key: "all", label: "ทั้งหมด" }].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatus(s.key)}
            className={`h-8 px-3 rounded-lg text-xs font-medium border ${status === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
          >
            {s.label}
            {s.key !== "all" && counts[s.key] ? ` (${counts[s.key]})` : ""}
          </button>
        ))}
      </div>
      <MiniTable<Row>
        title="↩️ คำขอคืน/เปลี่ยนสินค้า"
        rows={rows ?? []}
        rowKey={(r) => r.id}
        countUnit="คำขอ"
        onRowClick={(r) => {
          setOpen(r);
          setNote(r.staff_note ?? "");
        }}
        searchText={(r) => `${r.store_orders?.order_no ?? ""} ${r.store_orders?.customer_name ?? ""} ${r.store_orders?.customer_phone ?? ""} ${r.items.map((i) => i.name).join(" ")}`}
        searchPlaceholder="ค้นหาเลขออเดอร์ / ชื่อ / เบอร์ / สินค้า"
        emptyText={rows === null ? "กำลังโหลด…" : status === "pending" ? "ไม่มีคำขอรอตรวจ 🎉" : "ยังไม่มีคำขอในกลุ่มนี้"}
        columns={[
          { key: "at", header: "ส่งเมื่อ", width: "7.5rem", cell: (r) => <span className="text-xs text-slate-500">{thDate(r.created_at)}</span>, sortValue: (r) => r.created_at },
          { key: "order", header: "ออเดอร์ / ลูกค้า", width: "minmax(10rem,1.2fr)", cell: (r) => (
            <span className="min-w-0">
              <span className="block font-mono text-xs">{r.store_orders?.order_no ?? "—"}</span>
              <span className="block text-xs text-slate-500 truncate">{r.store_orders?.customer_name} · {r.store_orders?.customer_phone}</span>
            </span>
          ) },
          { key: "kind", header: "ขอ", width: "5rem", cell: (r) => (r.kind === "exchange" ? "🔁 เปลี่ยน" : "↩️ คืน") },
          { key: "what", header: "สินค้า / เหตุผล", width: "minmax(12rem,2fr)", cell: (r) => (
            <span className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.images[0] && <img src={r2ImageUrl(r.images[0], 96) ?? ""} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
              <span className="min-w-0">
                <span className="block text-sm truncate">{r.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</span>
                <span className="block text-xs text-slate-500 truncate">{returnReasonLabel(r.reason)}{r.detail ? ` · ${r.detail}` : ""}</span>
              </span>
            </span>
          ) },
          { key: "st", header: "สถานะ", width: "9rem", cell: (r) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusOf(r.status)?.tone ?? ""}`}>{statusOf(r.status)?.label ?? r.status}</span> },
        ]}
        footnote="ระบบไม่คืนเงิน/ไม่ตัดสต็อกให้เอง · ลูกค้าเห็นสถานะ + หมายเหตุของร้านในหน้าขอคืน/เปลี่ยน · เปิด/ตั้งจำนวนวันที่ 🏪 ข้อมูลร้าน › ↩️"
      />

      <ERPModal open={!!open} onClose={() => !busy && setOpen(null)} title={open ? `${open.kind === "exchange" ? "🔁 ขอเปลี่ยน" : "↩️ ขอคืน"} · ${open.store_orders?.order_no ?? ""}` : ""} size="lg">
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full ${statusOf(open.status)?.tone ?? ""}`}>{statusOf(open.status)?.label}</span>
              <span className="text-xs text-slate-500">ส่งเมื่อ {thDate(open.created_at)}</span>
              {open.lang === "en" && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">🌐 ลูกค้าใช้ภาษาอังกฤษ</span>}
            </div>
            <section className="rounded-xl border border-slate-200 p-3">
              <p className="font-medium">{open.store_orders?.customer_name} · {open.store_orders?.customer_phone}</p>
              <p className="text-slate-600 mt-1">เหตุผล: {returnReasonLabel(open.reason)}</p>
              {open.detail && <p className="text-slate-600 whitespace-pre-line mt-1">{open.detail}</p>}
              <ul className="mt-2 space-y-1">
                {open.items.map((i) => (
                  <li key={i.itemId} className="flex justify-between gap-2">
                    <span>{i.name}{i.variant ? <span className="text-slate-400"> · {i.variant}</span> : null}</span>
                    <span className="tabular-nums">×{i.qty}</span>
                  </li>
                ))}
              </ul>
            </section>
            {open.images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {open.images.map((k) => (
                  <button key={k} type="button" onClick={() => setZoom(k)} className="rounded-lg overflow-hidden border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r2ImageUrl(k, 240) ?? ""} alt="" className="w-24 h-24 object-cover" />
                  </button>
                ))}
              </div>
            )}
            {RETURN_MOVES[open.status].length > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs text-slate-500">หมายเหตุถึงลูกค้า (เห็นในหน้าขอคืน/เปลี่ยน · เช่น ที่อยู่ส่งของกลับ / เหตุผลที่ไม่อนุมัติ)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" maxLength={1000} />
                <div className="flex flex-wrap gap-2">
                  {RETURN_MOVES[open.status].map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={busy || (next === "rejected" && !note.trim())}
                      onClick={() => void move(open, next)}
                      title={next === "rejected" && !note.trim() ? "ใส่เหตุผลที่ไม่อนุมัติในหมายเหตุก่อน" : undefined}
                      className={`h-9 px-3 rounded-lg text-sm font-medium disabled:opacity-40 ${next === "rejected" ? "border border-rose-300 text-rose-700 hover:bg-rose-50" : "bg-slate-900 text-white hover:bg-slate-700"}`}
                    >
                      {MOVE_LABEL[next]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {open.staff_note ? `หมายเหตุ: ${open.staff_note} · ` : ""}โดย {open.decided_by_name ?? "—"} {open.decided_at ? `· ${thDate(open.decided_at)}` : ""}
              </p>
            )}
          </div>
        )}
      </ERPModal>
      <ERPModal open={!!zoom} onClose={() => setZoom(null)} title="รูปจากลูกค้า" size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {zoom && <img src={r2ImageUrl(zoom, 1200) ?? ""} alt="" className="max-h-[75vh] mx-auto object-contain" />}
      </ERPModal>
    </div>
  );
}
