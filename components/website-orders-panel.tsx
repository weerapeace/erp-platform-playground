"use client";

/**
 * WebsiteOrdersPanel — แท็บ "🧾 ออเดอร์" ในหน้า /website/<slug>
 *
 * รายการออเดอร์ที่ลูกค้าสั่งจากเว็บร้าน (ตาราง MiniTable ของกลาง) · กดแถวดูรายละเอียด
 * เปลี่ยนสถานะ / สถานะชำระเงิน / โน้ตภายใน — ทุกการแก้มี audit
 * ไม่มีปุ่มลบ: ออเดอร์มีเลขที่ที่ลูกค้าถืออยู่ → ใช้ "ยกเลิก" แทน (ยังค้นย้อนได้)
 * ข้อมูล: /api/website/orders
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable } from "@/components/mini-table";
import { ERPModal } from "@/components/modal";

type Line = { name: string; variantLabel: string | null; unitPrice: number; qty: number; lineTotal: number };
type Order = {
  id: string;
  orderNo: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  ship: { addressLine: string; subdistrict: string; district: string; province: string; postal: string };
  items: Line[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  grandTotal: number;
  note: string;
  createdAt: string;
  erpSoNumber: string | null;
  skuCodes: string[];
};
type StatusDef = { key: string; label: string; tone: string };

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function WebsiteOrdersPanel({ shopSlug }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [payStatuses, setPayStatuses] = useState<StatusDef[]>([]);
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/orders?shop=${encodeURIComponent(shopSlug)}&status=${encodeURIComponent(filter)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setOrders(j.orders ?? []);
      setCounts(j.counts ?? {});
      setStatuses(j.statuses ?? []);
      setPayStatuses(j.paymentStatuses ?? []);
      setMethods(j.paymentMethods ?? {});
    } catch {
      toast.error("โหลดออเดอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, filter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useMemo(() => orders.find((o) => o.id === openId) ?? null, [orders, openId]);
  useEffect(() => {
    setNoteDraft(open?.note ?? "");
  }, [open?.id, open?.note]);

  const tone = (list: StatusDef[], key: string) => list.find((s) => s.key === key)?.tone ?? "bg-slate-100 text-slate-600";
  const label = (list: StatusDef[], key: string) => list.find((s) => s.key === key)?.label ?? key;

  const patch = async (orderId: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...body }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(okMsg);
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      {/* ตัวกรองสถานะ */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          ทั้งหมด <span className="opacity-60">{total}</span>
        </Chip>
        {statuses.map((s) => (
          <Chip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}>
            {s.label} <span className="opacity-60">{counts[s.key] ?? 0}</span>
          </Chip>
        ))}
        <button onClick={() => void load()} className="ml-auto text-xs text-slate-500 hover:text-blue-600 px-2 py-1">
          ↻ รีเฟรช
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">กำลังโหลดออเดอร์…</p>
      ) : (
        <MiniTable<Order>
          rows={orders}
          rowKey={(o) => o.id}
          countUnit="ออเดอร์"
          emptyText={
            filter === "all"
              ? "ยังไม่มีออเดอร์จากเว็บร้านนี้ — เมื่อลูกค้ากดสั่งซื้อบนเว็บ รายการจะขึ้นที่นี่"
              : "ไม่มีออเดอร์ในสถานะนี้"
          }
          searchText={(o) => `${o.orderNo} ${o.customerName} ${o.customerPhone} ${o.skuCodes.join(" ")} ${o.items.map((i) => i.name).join(" ")}`}
          searchPlaceholder="ค้นหา เลขที่ / ชื่อ / เบอร์ / รหัสสินค้า"
          onRowClick={(o) => setOpenId(o.id)}
          columns={[
            {
              key: "no",
              header: "เลขที่",
              width: "11rem",
              cell: (o) => (
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-800">{o.orderNo}</p>
                  <p className="text-[11px] text-slate-400">{when(o.createdAt)}</p>
                </div>
              ),
              sortValue: (o) => o.createdAt,
              sortLabel: "วันที่",
            },
            {
              key: "cust",
              header: "ลูกค้า",
              width: "1.2fr",
              cell: (o) => (
                <div>
                  <p className="text-sm text-slate-800">{o.customerName}</p>
                  <p className="text-[11px] text-slate-500">{o.customerPhone}</p>
                </div>
              ),
              sortValue: (o) => o.customerName,
            },
            {
              key: "items",
              header: "สินค้า",
              width: "1.6fr",
              cell: (o) => (
                <p className="text-xs text-slate-600 line-clamp-2">
                  {o.items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} ×${i.qty}`).join(" · ")}
                </p>
              ),
            },
            {
              key: "total",
              header: "ยอดรวม",
              width: "7rem",
              align: "right",
              cell: (o) => <span className="font-semibold text-slate-800">{money(o.grandTotal)}</span>,
              sortValue: (o) => o.grandTotal,
            },
            {
              key: "pay",
              header: "ชำระเงิน",
              width: "9rem",
              cell: (o) => (
                <div className="flex flex-col gap-0.5 items-start">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone(payStatuses, o.paymentStatus)}`}>
                    {label(payStatuses, o.paymentStatus)}
                  </span>
                  <span className="text-[11px] text-slate-500">{methods[o.paymentMethod] ?? o.paymentMethod}</span>
                </div>
              ),
              sortValue: (o) => o.paymentStatus,
            },
            {
              key: "status",
              header: "สถานะ",
              width: "8rem",
              cell: (o) => (
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone(statuses, o.status)}`}>{label(statuses, o.status)}</span>
              ),
              sortValue: (o) => o.status,
            },
          ]}
        />
      )}

      {/* รายละเอียดออเดอร์ */}
      <ERPModal open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `ออเดอร์ ${open.orderNo}` : ""} size="lg">
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full ${tone(statuses, open.status)}`}>{label(statuses, open.status)}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${tone(payStatuses, open.paymentStatus)}`}>
                {label(payStatuses, open.paymentStatus)} · {methods[open.paymentMethod] ?? open.paymentMethod}
              </span>
              <span className="text-xs text-slate-500">สั่งเมื่อ {when(open.createdAt)}</span>
              {open.erpSoNumber && <span className="text-xs text-slate-500">ใบสั่งขาย ERP: {open.erpSoNumber}</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5">ผู้รับ / ที่อยู่จัดส่ง</h4>
                <p className="font-medium text-slate-800">{open.customerName}</p>
                <p className="text-slate-600">
                  โทร {open.customerPhone}
                  {open.customerEmail ? ` · ${open.customerEmail}` : ""}
                </p>
                <p className="text-slate-600 mt-1 whitespace-pre-line">
                  {[open.ship.addressLine, open.ship.subdistrict, open.ship.district, open.ship.province, open.ship.postal]
                    .filter(Boolean)
                    .join(" ")}
                </p>
                {open.note && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">หมายเหตุ: {open.note}</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5">รายการสินค้า</h4>
                <ul className="divide-y divide-slate-100">
                  {open.items.map((i, idx) => (
                    <li key={idx} className="py-1.5 flex justify-between gap-3">
                      <span className="text-slate-700">
                        {i.name}
                        {i.variantLabel && <span className="text-slate-400"> ({i.variantLabel})</span>}
                        <span className="text-slate-400"> ×{i.qty}</span>
                      </span>
                      <span className="text-slate-800 shrink-0">{money(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>ยอดสินค้า</span><span>{money(open.subtotal)}</span></div>
                  <div className="flex justify-between"><span>ค่าส่ง</span><span>{money(open.shippingFee)}</span></div>
                  {open.discount > 0 && <div className="flex justify-between"><span>ส่วนลด</span><span>-{money(open.discount)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1"><span>ยอดรวม</span><span>{money(open.grandTotal)}</span></div>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">สถานะออเดอร์</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={open.status}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "cancelled" && !confirm(`ยกเลิกออเดอร์ ${open.orderNo}?\nลูกค้าจะเห็นสถานะ "ยกเลิก" ตอนตามออเดอร์`)) return;
                      void patch(open.id, { status: next }, "เปลี่ยนสถานะแล้ว");
                    }}
                  >
                    {statuses.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">สถานะชำระเงิน</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={open.paymentStatus}
                    disabled={busy}
                    onChange={(e) => void patch(open.id, { paymentStatus: e.target.value }, "อัปเดตสถานะชำระเงินแล้ว")}
                  >
                    {payStatuses.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">หมายเหตุ (ลูกค้าเห็นตอนตามออเดอร์)</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="เช่น เลขพัสดุ Kerry TH1234567890"
                  />
                  <button
                    disabled={busy || noteDraft === (open.note ?? "")}
                    onClick={() => void patch(open.id, { note: noteDraft }, "บันทึกหมายเหตุแล้ว")}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                ออเดอร์ลบไม่ได้ เพราะลูกค้าถือเลขที่นี้อยู่ — ถ้าไม่เอาแล้วให้เปลี่ยนสถานะเป็น "ยกเลิก" (ยังค้นย้อนหลังได้)
              </p>
            </section>
          </div>
        )}
      </ERPModal>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition ${
        active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}
