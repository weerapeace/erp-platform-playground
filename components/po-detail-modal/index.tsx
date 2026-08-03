"use client";

/**
 * ของกลาง — popup "รายละเอียดใบสั่งซื้อ" (PoDetailModal)
 *
 * เดิมฝังอยู่ในหน้าแดชบอร์ดจัดซื้อไฟล์เดียว พอหน้ารายการ PO ต้องใช้ด้วยจึงย้ายมาเป็นของกลาง
 * (กฎ CLAUDE.md: ใช้เกิน 1 ที่ = ต้องเป็นของกลาง แก้ที่เดียวทุกหน้าเปลี่ยนตาม)
 *
 * ใช้ที่: /purchasing/dashboard (กดแถวในรายการ) · /purchasing/po-list (กดแถวในตาราง)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import type { PoDetail } from "@/app/api/purchasing/po-detail/route";

const baht = (n: number | null | undefined) => `฿${Math.round(Number(n ?? 0)).toLocaleString("th-TH")}`;
const thDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export function PoDetailModal({ poId, onClose, footer }: {
  poId: string;
  onClose: () => void;
  /** ปุ่มเสริมท้าย popup (เช่น พิมพ์ / ส่งไลน์) — หน้าที่เรียกส่งเข้ามาเอง */
  footer?: React.ReactNode;
}) {
  const [d, setD] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/purchasing/po-detail?id=${encodeURIComponent(poId)}`).then((r) => r.json())
      .then((j) => setD((j.data ?? null) as PoDetail | null)).catch(() => setD(null)).finally(() => setLoading(false));
  }, [poId]);

  const sym = d && isCNY(d.currency) ? "¥" : "฿";

  return (
    <ERPModal open onClose={onClose} size="lg" title={d ? `📦 ใบสั่งซื้อ ${d.po_no}` : "รายละเอียดใบสั่งซื้อ"}
      description={d?.seller ? `🏪 ${d.seller}` : undefined} footer={footer}>
      {loading ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
        : !d ? <div className="py-10 text-center text-sm text-slate-400">ไม่พบใบสั่งซื้อ</div>
        : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <div><span className="text-slate-400">ยอดรวม (บาท) </span><b className="tabular-nums text-slate-800">{baht(d.amount_thb)}</b></div>
            {d.order_date && <div><span className="text-slate-400">วันที่สั่ง </span>{thDate(d.order_date)}</div>}
            {d.payment_status === "paid"
              ? <div className="text-emerald-700 font-medium">✓ จ่ายแล้ว {d.paid_date ? thDate(d.paid_date) : ""}{d.paid_amount_thb ? ` · ${baht(d.paid_amount_thb)}` : ""}</div>
              : <div className="text-rose-600 font-medium">● ยังไม่จ่าย{d.payment_due_date ? ` · ครบกำหนด ${thDate(d.payment_due_date)}` : ""}</div>}
            {d.expected_date && <div><span className="text-slate-400">ของเข้า </span>{thDate(d.expected_date)}</div>}
            <div><span className="text-slate-400">รายการ </span>{d.lines.length}</div>
          </div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
            {d.lines.length === 0 ? <div className="p-4 text-center text-sm text-slate-400">ไม่มีรายการสินค้า</div>
              : d.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <HoverImage url={l.img} size={40} previewSize={320} alt={l.name} fallback="📦" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-700 truncate">{l.name || "—"}</div>
                  <div className="text-[11px] text-slate-400">
                    {l.sku ? <span className="font-mono">{l.sku} · </span> : null}
                    จำนวน {l.qty.toLocaleString("th-TH")}{l.uom ? ` ${l.uom}` : ""}
                    {l.received > 0 && <> · รับแล้ว {l.received.toLocaleString("th-TH")}</>}
                    {l.done ? <span className="text-emerald-600"> · ✓ รับครบ</span> : <span className="text-amber-600"> · ค้างรับ</span>}
                  </div>
                </div>
                <div className="text-sm tabular-nums text-slate-600 shrink-0">
                  {l.total > 0 ? `${sym}${Math.round(l.total).toLocaleString("th-TH")}` : <span className="text-amber-600 text-xs">⚠ ยังไม่มีราคา</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}

export default PoDetailModal;
