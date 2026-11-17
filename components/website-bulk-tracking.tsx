"use client";

/**
 * 🚚 ใส่เลขพัสดุทีละหลายใบ (แท็บ 🧾 ออเดอร์) — วางจากไฟล์ขนส่ง/Excel: 1 บรรทัด = เลขออเดอร์ + เลขพัสดุ (คอลัมน์ไหนก่อนก็ได้)
 *   ดูตัวอย่างก่อนบันทึก (จับคู่ได้/ไม่ได้ + เหตุผล · ทับเลขเดิมเตือน) → บันทึก = PATCH bulk tracking
 *   ติ๊ก "เปลี่ยนเป็นจัดส่งแล้ว" = ลูกค้าได้อีเมล/ข้อความจัดส่งแล้วพร้อมลิงก์ตามพัสดุ (ตามสวิตช์อีเมลของร้าน)
 * ของกลาง: ERPModal · lib/website-fulfillment parseTrackingPaste · PARCEL_CARRIERS
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { PARCEL_CARRIERS } from "@/lib/parcel-tracking";
import { parseTrackingPaste, type PackOrder } from "@/lib/website-fulfillment";

/** EN ของเหตุผลจับคู่ไม่ได้ (lib/website-fulfillment ส่งมาเป็นไทย) — แสดงในหน้า ERP เท่านั้น */
const REASON_EN: Record<string, string> = {
  "ไม่พบเลขออเดอร์ของร้านในบรรทัดนี้": "No order number from this shop on this line",
  "ไม่พบเลขพัสดุ (ตัวอักษร/ตัวเลข 8 ตัวขึ้นไป)": "No tracking number (8+ letters/digits)",
  "เลขออเดอร์ซ้ำกับบรรทัดก่อนหน้า": "Order number repeats an earlier line",
};

export function BulkTrackingModal({ open, onClose, orders, onDone }: {
  open: boolean;
  onClose: () => void;
  orders: Pick<PackOrder, "id" | "orderNo" | "tracking">[];
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [text, setText] = useState("");
  const [carrier, setCarrier] = useState("");
  const [ship, setShip] = useState(true);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseTrackingPaste(text, orders), [text, orders]);
  const good = rows.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  const bad = rows.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
  const dirty = !!text.trim();

  const save = async () => {
    if (!carrier) return toast.error(t("เลือกขนส่งก่อน — ลูกค้าจะได้กดตามพัสดุได้ถูกเว็บ", "Choose a carrier first — so the customer's tracking link opens the right site"));
    if (!good.length) return toast.error(t("ยังไม่มีบรรทัดที่จับคู่ได้", "No matched lines yet"));
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: { tracking: good.map((g) => ({ orderId: g.orderId, trackingNo: g.trackingNo, carrier })), markShipped: ship } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Couldn't save"));
      toast.success(`${t(`ใส่เลขพัสดุแล้ว ${j.done} ออเดอร์`, `Tracking added to ${j.done} orders`)}${ship ? t(" · เปลี่ยนเป็นจัดส่งแล้ว", " · set to Shipped") : ""}${j.failed?.length ? ` · ${t("ไม่สำเร็จ", "failed")} ${j.failed.length}` : ""}`);
      setText("");
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal open={open} onClose={onClose} title={t("🚚 ใส่เลขพัสดุหลายใบ", "🚚 Bulk tracking numbers")} size="lg" hasUnsavedChanges={dirty}>
      <div className="space-y-3 text-sm" data-bulk-tracking>
        <p className="text-xs text-slate-500">
          {t("วางจากไฟล์ของขนส่งหรือ Excel — 1 บรรทัด =", "Paste from the carrier file or Excel — 1 line =")} <b>{t("เลขออเดอร์", "order no.")}</b> {t("กับ", "and")} <b>{t("เลขพัสดุ", "tracking no.")}</b> {t("(คั่นด้วยแท็บ/จุลภาค/เว้นวรรค · คอลัมน์ไหนก่อนก็ได้ · มีคอลัมน์อื่นปนได้)", "(separated by tab/comma/space · any column order · other columns are OK)")}
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"LM-256910-00012\tTH12345678901\nLM-256910-00013, KEX123456789"}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            {t("ขนส่ง", "Carrier")}
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">{t("— เลือก —", "— Choose —")}</option>
              {PARCEL_CARRIERS.map((c) => <option key={c.key} value={c.key}>{c.key === "thaipost" ? t(c.label, "Thailand Post (EMS / registered)") : c.key === "other" ? t(c.label, "Other") : c.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} />
            {t('เปลี่ยนเป็น "จัดส่งแล้ว" + แจ้งลูกค้า (ตามสวิตช์อีเมลของร้าน)', 'Set to "Shipped" + notify customer (per the shop email switch)')}
          </label>
        </div>
        {rows.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <tbody>
                {good.map((g) => (
                  <tr key={g.orderId} className="border-b border-slate-100">
                    <td className="px-2 py-1 text-emerald-600">✓</td>
                    <td className="px-2 py-1 font-mono">{g.orderNo}</td>
                    <td className="px-2 py-1 font-mono">{g.trackingNo}</td>
                    <td className="px-2 py-1 text-amber-700">{g.replaces ? t(`ทับเลขเดิม ${g.replaces}`, `Replaces ${g.replaces}`) : ""}</td>
                  </tr>
                ))}
                {bad.map((b) => (
                  <tr key={`b${b.line}`} className="border-b border-slate-100 text-slate-500">
                    <td className="px-2 py-1 text-rose-600">✕</td>
                    <td className="px-2 py-1 font-mono" colSpan={2}>{t("บรรทัด", "Line")} {b.line}: {b.text.slice(0, 50)}</td>
                    <td className="px-2 py-1 text-rose-600">{REASON_EN[b.reason] ? t(b.reason, REASON_EN[b.reason]) : b.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-xs text-slate-500">{rows.length ? t(`จับคู่ได้ ${good.length} · ไม่ได้ ${bad.length}`, `Matched ${good.length} · unmatched ${bad.length}`) : ""}</span>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={busy || !good.length} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {busy ? t("กำลังบันทึก…", "Saving…") : t(`บันทึก ${good.length} ออเดอร์`, `Save ${good.length} orders`)}
          </button>
        </div>
      </div>
    </ERPModal>
  );
}
