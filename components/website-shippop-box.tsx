"use client";

/**
 * 🚚 Shippop ในแท็บออเดอร์ — กล่องในรายละเอียดออเดอร์ + ปุ่มจองหลายใบ (แถบเลือกหลายรายการ)
 * เลือกขนส่ง → ดูราคาทุกเจ้า → จอง (ได้เลขพัสดุเติมให้ลูกค้าเห็นเอง) → ใบปะหน้า · ยกเลิกได้ก่อนขนส่งเข้ารับ
 * โหมดจำลอง (ยังไม่ใส่ API KEY): ทุกปุ่มทำงานด้วยเลข SIM… + ปุ่มจำลองสถานะ (ขนส่งรับแล้ว/ส่งถึง) ไว้ลองลำดับ
 * ข้อมูล /api/website/orders/shippop · กฎ lib/shippop
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { getLang } from "@/lib/lang";
import { SHIPPOP_COURIERS, courierLabel, shippopStatusLabel, type ShippopInfo } from "@/lib/shippop";

export interface ShippopSettings {
  enabled: boolean;
  courier: string;
  mode: "sim" | "live";
}

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

async function post(body: Record<string, unknown>) {
  return apiFetch("/api/website/orders/shippop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
}

function CourierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
      {SHIPPOP_COURIERS.map((c) => (
        <option key={c.code} value={c.code}>{c.label}</option>
      ))}
    </select>
  );
}

export function ShippopBox({ order, settings, onChanged }: { order: { id: string; status: string; shippop?: ShippopInfo | null }; settings: ShippopSettings; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const [courier, setCourier] = useState(settings.courier || "FLE");
  const [weight, setWeight] = useState("");
  const [quotes, setQuotes] = useState<{ courierCode: string; courierName: string; price: number; available: boolean; estimate: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const sp = order.shippop && order.shippop.status !== "cancel" ? order.shippop : null;
  if (!settings.enabled) return null;

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const j = await post(body);
      if (j.error || j.ok === false) {
        toast.error(j.error ?? j.failed?.map((f: { orderNo: string; error: string }) => `${f.orderNo}: ${f.error}`).join(" · ") ?? t("ไม่สำเร็จ", "Failed"));
        return null;
      }
      toast.success(ok);
      onChanged();
      return j;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-xs text-slate-700 space-y-2" data-shippop-box>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-teal-800">🚚 Shippop</span>
        {settings.mode === "sim" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800" title={t("ยังไม่ได้ใส่ SHIPPOP_API_KEY — ไม่เรียก Shippop จริง ไม่เสียเงิน", "SHIPPOP_API_KEY not set — Shippop is not called, no cost")}>{t("🧪 โหมดจำลอง", "🧪 Simulation")}</span>}
        {sp && <span className="rounded-full bg-white px-2 py-0.5 border border-teal-200">{shippopStatusLabel(sp.status)}</span>}
      </div>
      {!sp ? (
        order.status === "cancelled" ? (
          <p className="text-slate-500">{t("ออเดอร์ยกเลิกแล้ว", "Order cancelled")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <CourierSelect value={courier} onChange={setCourier} />
              <input value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))} placeholder={t("น้ำหนักรวม (กรัม) · ว่าง = ตามที่ตั้ง", "Total weight (g) · blank = default")} className="h-8 w-44 rounded-md border border-slate-200 bg-white px-2" inputMode="numeric" />
              <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const j = await post({ action: "quote", orderId: order.id, ...(weight ? { weight: Number(weight) } : {}) }); if (j.error) toast.error(j.error); else setQuotes(j.quotes); } finally { setBusy(false); } }} className="h-8 rounded-md border border-teal-300 bg-white px-2.5 text-teal-800 hover:bg-teal-50 disabled:opacity-50">
                {t("ดูราคา", "Get prices")}
              </button>
              <button type="button" disabled={busy} onClick={() => void run({ action: "book", orderIds: [order.id], courierCode: courier, ...(weight ? { weight: Number(weight) } : {}) }, t("จองขนส่งแล้ว — เลขพัสดุเติมให้แล้ว", "Booked — tracking number filled in"))} className="h-8 rounded-md bg-teal-600 px-3 font-medium text-white hover:bg-teal-700 disabled:opacity-50" data-shippop-book>
                {t("จอง", "Book")} {courierLabel(courier)}
              </button>
            </div>
            {quotes && (
              <ul className="grid gap-1 sm:grid-cols-2">
                {quotes.filter((q) => q.available).sort((a, b) => a.price - b.price).map((q) => (
                  <li key={q.courierCode}>
                    <button type="button" onClick={() => setCourier(q.courierCode)} className={`w-full flex justify-between rounded-md border px-2 py-1 ${courier === q.courierCode ? "border-teal-500 bg-white" : "border-slate-200 bg-white/60"}`}>
                      <span>{q.courierName} <span className="text-slate-400">{q.estimate}</span></span>
                      <span className="tabular-nums font-medium">{money(q.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-slate-500">{t("จองแล้วได้เลขพัสดุเติมให้ลูกค้าเห็นเอง · เก็บปลายทางที่ยังไม่จ่าย = ขนส่งเก็บเงินให้ · ขนส่งรับพัสดุ/ส่งถึง = เปลี่ยนสถานะออเดอร์ให้เอง", "Booking fills in the tracking number for the customer · unpaid COD = carrier collects · picked up/delivered = order status updates automatically")}</p>
          </>
        )
      ) : (
        <>
          <p>
            {courierLabel(sp.courierCode)} · {t("เลขพัสดุ", "Tracking")} <span className="font-mono">{sp.courierTrackingCode || "—"}</span> · {t("รหัส Shippop", "Shippop code")} <span className="font-mono">{sp.trackingCode}</span> · {t("ค่าส่ง", "Shipping")} {money(sp.price)}
            {sp.codAmount > 0 ? ` · ${t("เก็บปลายทาง", "COD")} ${money(sp.codAmount)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`/print/shippop-labels?ids=${order.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-md bg-teal-600 px-3 font-medium text-white hover:bg-teal-700">{t("🖨 ใบปะหน้า", "🖨 Label")}</a>
            {!["shipping", "complete", "return"].includes(sp.status) && (
              <button type="button" disabled={busy} onClick={async () => { if (await askConfirm({ title: t("ยกเลิกการจองขนส่งนี้?", "Cancel this shipping booking?"), message: t("ทำได้ก่อนขนส่งเข้ารับพัสดุเท่านั้น", "Only possible before the carrier picks up"), variant: "danger", confirmText: t("ยกเลิกการจอง", "Cancel booking"), cancelText: t("ไม่ยกเลิก", "Keep it") })) void run({ action: "cancel", orderId: order.id }, t("ยกเลิกการจองแล้ว", "Booking cancelled")); }} className="h-8 rounded-md border border-rose-300 px-2.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                {t("ยกเลิกการจอง", "Cancel booking")}
              </button>
            )}
            {sp.mode === "sim" &&
              ["shipping", "complete"].map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => void run({ action: "simulate", orderId: order.id, status: s }, `${t("จำลอง", "Simulated")}: ${shippopStatusLabel(s)}`)} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2.5 text-amber-800 disabled:opacity-50" data-shippop-sim={s}>
                  🧪 {t("จำลอง", "Simulate")} “{shippopStatusLabel(s)}”
                </button>
              ))}
          </div>
          {sp.history.length > 0 && (
            <ul className="text-[11px] text-slate-500 space-y-0.5">
              {[...sp.history].reverse().slice(0, 6).map((h, i) => (
                <li key={i}>{when(h.at)} · {shippopStatusLabel(h.status)}{h.note ? ` · ${h.note}` : ""}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** ปุ่มจองหลายใบ (แถบเลือกหลายรายการ) */
export function ShippopBulkButton({ ids, settings, onDone }: { ids: string[]; settings: ShippopSettings; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [courier, setCourier] = useState(settings.courier || "FLE");
  const [busy, setBusy] = useState(false);
  if (!settings.enabled) return null;
  const book = async () => {
    setBusy(true);
    try {
      const j = await post({ action: "book", orderIds: ids, courierCode: courier });
      if (j.done) toast.success(t(`จองแล้ว ${j.done} ออเดอร์`, `Booked ${j.done} orders`) + (j.failed?.length ? ` · ${t("ไม่สำเร็จ", "failed")} ${j.failed.length}` : ""));
      if (j.failed?.length) toast.error(j.failed.map((f: { orderNo: string; error: string }) => `${f.orderNo}: ${f.error}`).join(" · "));
      if (j.error) toast.error(j.error);
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-lg border border-teal-300 bg-white px-3 text-sm text-teal-800 hover:bg-teal-50" data-shippop-bulk>
        {t("🚚 จอง Shippop", "🚚 Book Shippop")}{settings.mode === "sim" ? t(" (จำลอง)", " (simulated)") : ""}
      </button>
      <ERPModal open={open} onClose={() => !busy && setOpen(false)} title={t(`🚚 จองขนส่ง ${ids.length} ออเดอร์`, `🚚 Book shipping for ${ids.length} orders`)} size="sm">
        <div className="space-y-3 text-sm">
          <CourierSelect value={courier} onChange={setCourier} />
          <p className="text-xs text-slate-500">{t("น้ำหนัก/กล่องใช้ค่าที่ตั้งในข้อมูลร้าน › 🚚 · ออเดอร์ที่จองแล้ว/ยกเลิก/ที่อยู่ไม่ครบ จะถูกข้ามและแจ้งชื่อ", "Weight/box use the values in Shop info › 🚚 · already booked/cancelled/incomplete-address orders are skipped and listed")}</p>
          <button type="button" disabled={busy} onClick={() => void book()} className="h-9 w-full rounded-lg bg-teal-600 font-medium text-white disabled:opacity-50">{busy ? t("กำลังจอง…", "Booking…") : t(`จอง ${ids.length} ออเดอร์`, `Book ${ids.length} orders`)}</button>
        </div>
      </ERPModal>
    </>
  );
}
