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
import { useToast } from "@/components/toast";
import { PARCEL_CARRIERS } from "@/lib/parcel-tracking";
import { parseTrackingPaste, type PackOrder } from "@/lib/website-fulfillment";

export function BulkTrackingModal({ open, onClose, orders, onDone }: {
  open: boolean;
  onClose: () => void;
  orders: Pick<PackOrder, "id" | "orderNo" | "tracking">[];
  onDone: () => void;
}) {
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
    if (!carrier) return toast.error("เลือกขนส่งก่อน — ลูกค้าจะได้กดตามพัสดุได้ถูกเว็บ");
    if (!good.length) return toast.error("ยังไม่มีบรรทัดที่จับคู่ได้");
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: { tracking: good.map((g) => ({ orderId: g.orderId, trackingNo: g.trackingNo, carrier })), markShipped: ship } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(`ใส่เลขพัสดุแล้ว ${j.done} ออเดอร์${ship ? " · เปลี่ยนเป็นจัดส่งแล้ว" : ""}${j.failed?.length ? ` · ไม่สำเร็จ ${j.failed.length}` : ""}`);
      setText("");
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="🚚 ใส่เลขพัสดุหลายใบ" size="lg" hasUnsavedChanges={dirty}>
      <div className="space-y-3 text-sm" data-bulk-tracking>
        <p className="text-xs text-slate-500">
          วางจากไฟล์ของขนส่งหรือ Excel — 1 บรรทัด = <b>เลขออเดอร์</b> กับ <b>เลขพัสดุ</b> (คั่นด้วยแท็บ/จุลภาค/เว้นวรรค · คอลัมน์ไหนก่อนก็ได้ · มีคอลัมน์อื่นปนได้)
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"LM-256910-00012\tTH12345678901\nLM-256910-00013, KEX123456789"}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            ขนส่ง
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">— เลือก —</option>
              {PARCEL_CARRIERS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={ship} onChange={(e) => setShip(e.target.checked)} />
            เปลี่ยนเป็น &quot;จัดส่งแล้ว&quot; + แจ้งลูกค้า (ตามสวิตช์อีเมลของร้าน)
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
                    <td className="px-2 py-1 text-amber-700">{g.replaces ? `ทับเลขเดิม ${g.replaces}` : ""}</td>
                  </tr>
                ))}
                {bad.map((b) => (
                  <tr key={`b${b.line}`} className="border-b border-slate-100 text-slate-500">
                    <td className="px-2 py-1 text-rose-600">✕</td>
                    <td className="px-2 py-1 font-mono" colSpan={2}>บรรทัด {b.line}: {b.text.slice(0, 50)}</td>
                    <td className="px-2 py-1 text-rose-600">{b.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-xs text-slate-500">{rows.length ? `จับคู่ได้ ${good.length} · ไม่ได้ ${bad.length}` : ""}</span>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">ยกเลิก</button>
          <button type="button" disabled={busy || !good.length} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {busy ? "กำลังบันทึก…" : `บันทึก ${good.length} ออเดอร์`}
          </button>
        </div>
      </div>
    </ERPModal>
  );
}
