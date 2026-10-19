"use client";

/**
 * WebsiteOrdersPanel — แท็บ "🧾 ออเดอร์" ในหน้า /website/<slug>
 *
 * รายการออเดอร์ที่ลูกค้าสั่งจากเว็บร้าน (ตาราง MiniTable ของกลาง) · กดแถวดูรายละเอียด
 * เปลี่ยนสถานะ / สถานะชำระเงิน / โน้ตภายใน — ทุกการแก้มี audit
 * 🎀 ออเดอร์ห่อของขวัญ: ป้ายในตาราง + กล่องข้อความการ์ด (คัดลอกได้) + เตือน "ไม่ใส่ราคาในกล่อง" (ตั้งบริการที่แท็บ 🏪 ข้อมูลร้าน)
 * ไม่มีปุ่มลบ: ออเดอร์มีเลขที่ที่ลูกค้าถืออยู่ → ใช้ "ยกเลิก" แทน (ยังค้นย้อนได้)
 * 🌐 ป้าย EN = ลูกค้าสั่งจากหน้าภาษาอังกฤษ · 💬 ข้อความถึงลูกค้า (คัดลอกไปส่ง LINE/SMS · ✉️ ส่งอีเมล) เป็นภาษาของลูกค้าเสมอ
 *    ถ้อยคำ lib/customer-messages · อีเมล lib/order-notify (อัตโนมัติเมื่อร้านเปิดที่แท็บ 🏪 ข้อมูลร้าน)
 * ข้อมูล: /api/website/orders
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable } from "@/components/mini-table";
import { ERPModal } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { GiftCardPreview } from "@/components/website-gift-cards-editor";
import { normalizeGiftCards, DEFAULT_GIFT_DESIGN, type GiftCardConfig, type OrderGiftCard } from "@/lib/website-gift-cards";
import { CUSTOMER_LANG_LABEL, ORDER_EVENTS, currentOrderEvent, orderMessage, type OrderEvent } from "@/lib/customer-messages";
import { PARCEL_CARRIERS, cleanTrackingNo, type ParcelTracking } from "@/lib/parcel-tracking";

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
  couponCode?: string | null;
  pointsUsed?: number;
  pointsDiscount?: number;
  pointsEarned?: number;
  giftWrap?: boolean;
  giftFee?: number;
  /** 💌 ค่าการ์ดอวยพร (บริการแยกจากห่อ) */
  giftCardFee?: number;
  /** 💌 สั่งการ์ดแยก (ไม่ห่อก็ได้) */
  giftCardOnly?: boolean;
  giftMessage?: string;
  giftHidePrice?: boolean;
  giftCard?: OrderGiftCard | null;
  isMember?: boolean;
  grandTotal: number;
  note: string;
  createdAt: string;
  erpSoNumber: string | null;
  skuCodes: string[];
  /** 🌐 ภาษาที่ลูกค้าใช้ตอนสั่ง */
  lang?: "th" | "en";
  /** ชื่อสินค้าในภาษาของลูกค้า (ไว้ทำข้อความ) */
  msgItems?: Line[];
  promptpay?: { number: string; name: string } | null;
  /** 🚚 เลขพัสดุ (ยังไม่กรอก = null) */
  tracking?: ParcelTracking | null;
};
type Messaging = {
  shopName: string;
  siteUrl: string | null;
  orderNote: { th: string; en: string };
  contactLine: string;
  contactPhone: string;
  autoEmail: boolean;
  emailReady: boolean;
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
  const [trackNo, setTrackNo] = useState("");
  const [trackCarrier, setTrackCarrier] = useState("");
  const [messaging, setMessaging] = useState<Messaging | null>(null);

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
      setMessaging(j.messaging ?? null);
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
  useEffect(() => {
    setTrackNo(open?.tracking?.number ?? "");
    setTrackCarrier(open?.tracking?.carrier ?? "");
  }, [open?.id, open?.tracking?.number, open?.tracking?.carrier]);

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
      // ⭐ ออเดอร์สมาชิก: บอกว่าแต้มขยับยังไง (ได้/เรียกคืน/คืนแต้มที่ใช้) · ปรับแต้มไม่สำเร็จ = เตือน
      const pts = (j.points ?? []) as { kind: string; delta: number }[];
      const ptsMsg = pts.map((p) => `${p.kind === "earn" ? "สมาชิกได้" : p.kind === "revoke" ? "เรียกคืน" : p.kind === "refund" ? "คืนแต้มที่ใช้" : "หักแต้มที่ใช้"} ${Math.abs(p.delta).toLocaleString("th-TH")} แต้ม`).join(" · ");
      toast.success(ptsMsg ? `${okMsg} · ⭐ ${ptsMsg}` : okMsg);
      if (j.warning) toast.error(j.warning);
      // ✉️ แจ้งลูกค้าอัตโนมัติ: บอกผล (ส่งแล้ว/ทำไมไม่ได้ส่ง) — ร้านไม่ได้เปิด = เงียบ
      if (j.notifyMsg) (j.notify?.sent ? toast.success : toast.error)(j.notifyMsg);
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // 🎴 การ์ดที่รอพิมพ์ (ในรายการที่โหลดอยู่) + ตั้งค่าการ์ดของร้าน (โหลดเมื่อเปิดออเดอร์ที่มีการ์ด — ไว้วาดพรีวิว)
  const cardsWaiting = orders.filter((o) => o.giftCard && !o.giftCard.printedAt && o.status !== "cancelled").length;
  const [cardCfg, setCardCfg] = useState<GiftCardConfig | null>(null);
  useEffect(() => {
    if (!open?.giftCard || cardCfg) return;
    apiFetch(`/api/website/gift-cards?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => j.config && setCardCfg(normalizeGiftCards(j.config)))
      .catch(() => {});
  }, [open?.giftCard, cardCfg, shopSlug]);

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
        {cardsWaiting > 0 && (
          <a href={`/print/gift-cards?shop=${encodeURIComponent(shopSlug)}`} target="_blank" rel="noopener" className="ml-auto text-xs px-2.5 py-1 rounded-full border border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100">
            🎴 พิมพ์การ์ดที่รอ ({cardsWaiting})
          </a>
        )}
        <button onClick={() => void load()} className={`${cardsWaiting > 0 ? "" : "ml-auto "}text-xs text-slate-500 hover:text-blue-600 px-2 py-1`}>
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
          searchText={(o) => `${o.giftWrap ? "ห่อของขวัญ " : ""}${o.giftCardOnly ? "การ์ด " : ""}${o.orderNo} ${o.customerName} ${o.customerPhone} ${o.skuCodes.join(" ")} ${o.items.map((i) => i.name).join(" ")}`}
          searchPlaceholder="ค้นหา เลขที่ / ชื่อ / เบอร์ / รหัสสินค้า"
          onRowClick={(o) => setOpenId(o.id)}
          columns={[
            {
              key: "no",
              header: "เลขที่",
              width: "11rem",
              cell: (o) => (
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-800">
                    {o.orderNo}
                    {o.lang === "en" && <span className="ml-1 font-sans text-[10px] px-1 rounded bg-sky-100 text-sky-700" title="ลูกค้าสั่งจากหน้าเว็บภาษาอังกฤษ">EN</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{when(o.createdAt)}</p>
                  {(o.giftWrap || o.giftCardOnly) && (
                    <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                      {o.giftWrap ? "🎀 ต้องห่อของขวัญ" : "💌 ใส่การ์ดอวยพร"}
                      {o.giftWrap && o.giftCardOnly ? " + การ์ด" : ""}
                      {o.giftCard ? (o.giftCard.printedAt ? " · การ์ดพิมพ์แล้ว" : " · 🎴 รอพิมพ์การ์ด") : ""}
                    </span>
                  )}
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
              {open.lang === "en" && <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">🌐 ลูกค้าสั่งจากหน้าภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ</span>}
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
                {(open.giftWrap || open.giftCardOnly) && (
                  <div className="mt-2 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-2 text-xs text-pink-800 space-y-1">
                    <p className="font-semibold">{open.giftWrap ? (open.giftCardOnly ? "🎀 ห่อเป็นของขวัญ + 💌 การ์ดอวยพร" : "🎀 ห่อเป็นของขวัญ") : "💌 ใส่การ์ดอวยพร (ไม่ห่อ)"}</p>
                    {open.giftHidePrice && <p className="font-medium text-rose-700">⚠️ ห้ามใส่ใบเสร็จ/ป้ายราคาในกล่อง (ส่งถึงผู้รับเป็นของขวัญ)</p>}
                    {open.giftMessage ? (
                      <div className="flex items-start gap-1.5">
                        <p className="flex-1 whitespace-pre-line rounded-md bg-white/70 px-2 py-1.5 text-slate-800">“{open.giftMessage}”</p>
                        <CopyButton value={open.giftMessage} title="คัดลอกข้อความการ์ด" />
                      </div>
                    ) : (
                      <p className="text-pink-700/80">ไม่มีข้อความบนการ์ด</p>
                    )}
                    {open.giftCard && (
                      <div className="pt-1 space-y-1.5">
                        {cardCfg && (
                          <GiftCardPreview
                            cfg={cardCfg}
                            design={cardCfg.designs.find((d) => d.id === open.giftCard!.design) ?? cardCfg.designs[0] ?? DEFAULT_GIFT_DESIGN}
                            to={open.giftCard.to}
                            from={open.giftCard.anon ? "" : open.giftCard.from}
                            message={open.giftMessage ?? ""}
                            font={open.giftCard.font}
                            className="max-w-[260px]"
                          />
                        )}
                        <p className="text-pink-700/90">
                          🎴 ถึง {open.giftCard.to || "—"} · จาก {open.giftCard.anon ? "ไม่ระบุชื่อ" : open.giftCard.from || "—"}
                          {open.giftCard.printedAt ? ` · พิมพ์แล้ว ${when(open.giftCard.printedAt)}` : " · ยังไม่ได้พิมพ์"}
                        </p>
                        <a href={`/print/gift-cards?shop=${encodeURIComponent(shopSlug)}&ids=${open.id}`} target="_blank" rel="noopener" className="inline-block rounded-md border border-pink-300 bg-white px-2.5 py-1 text-pink-700 hover:bg-pink-100">
                          🖨 พิมพ์การ์ดใบนี้
                        </a>
                      </div>
                    )}
                  </div>
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
                  {open.giftWrap && <div className="flex justify-between"><span>🎀 ค่าห่อของขวัญ</span><span>{open.giftFee ? money(open.giftFee) : "ฟรี"}</span></div>}
                  {open.giftCardOnly && <div className="flex justify-between"><span>💌 ค่าการ์ดอวยพร</span><span>{open.giftCardFee ? money(open.giftCardFee) : "ฟรี"}</span></div>}
                  {open.discount > 0 && <div className="flex justify-between"><span>ส่วนลด{open.couponCode ? ` (${open.couponCode})` : ""}</span><span>-{money(open.discount)}</span></div>}
                  {(open.pointsDiscount ?? 0) > 0 && <div className="flex justify-between"><span>⭐ ใช้แต้ม {(open.pointsUsed ?? 0).toLocaleString("th-TH")} แต้ม</span><span>-{money(open.pointsDiscount ?? 0)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1"><span>ยอดรวม</span><span>{money(open.grandTotal)}</span></div>
                  {open.isMember && (
                    <div className="pt-1 text-[11px] text-amber-700">
                      👤 ออเดอร์สมาชิก · {(open.pointsEarned ?? 0) > 0 ? `⭐ ได้ ${(open.pointsEarned ?? 0).toLocaleString("th-TH")} แต้มแล้ว` : "ได้แต้มเมื่อเปลี่ยนเป็น “สำเร็จ” (ถ้าร้านเปิดแต้ม)"}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {messaging && <OrderMessageBox key={open.id} order={open} messaging={messaging} />}

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
              {/* 🚚 เลขพัสดุ — ลูกค้าเห็นเลข + ปุ่มตามพัสดุ (หน้า ติดตามคำสั่งซื้อ / บัญชีสมาชิก / ข้อความ "จัดส่งแล้ว") */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">🚚 เลขพัสดุ (ลูกค้าเห็น + กดตามพัสดุได้)</label>
                <div className="flex flex-wrap gap-2">
                  <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={trackCarrier} onChange={(e) => setTrackCarrier(e.target.value)}>
                    <option value="">— เลือกขนส่ง —</option>
                    {PARCEL_CARRIERS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <input className="flex-1 min-w-[10rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase" value={trackNo} onChange={(e) => setTrackNo(e.target.value)} placeholder="เช่น TH1234567890" />
                  <button
                    disabled={busy || (cleanTrackingNo(trackNo) === (open.tracking?.number ?? "") && (trackCarrier || "") === (open.tracking?.carrier ?? "")) || (!!cleanTrackingNo(trackNo) && !trackCarrier)}
                    onClick={() => void patch(open.id, { trackingNo: trackNo, trackingCarrier: trackCarrier }, cleanTrackingNo(trackNo) ? "บันทึกเลขพัสดุแล้ว" : "ลบเลขพัสดุแล้ว")}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40"
                  >
                    บันทึก
                  </button>
                </div>
                {!!cleanTrackingNo(trackNo) && !trackCarrier && <p className="text-[11px] text-amber-700 mt-1">เลือกขนส่งก่อน — ลูกค้าจะได้กดตามพัสดุได้ถูกเว็บ</p>}
                {open.tracking?.url && (
                  <a href={open.tracking.url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-[11px] text-blue-600 hover:underline">↗ ลองเปิดหน้าตามพัสดุ</a>
                )}
                {open.status !== "shipped" && open.status !== "completed" && !!open.tracking && <p className="text-[11px] text-slate-400 mt-1">ใส่เลขแล้ว — เปลี่ยนสถานะเป็น “จัดส่งแล้ว” เพื่อแจ้งลูกค้า (ข้อความแนบเลขพัสดุให้เอง)</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">หมายเหตุ (ลูกค้าเห็นตอนตามออเดอร์)</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="เช่น ส่งพร้อมของแถม / นัดรับหน้าร้าน (เลขพัสดุใส่ช่องด้านบน)"
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

/** 💬 ข้อความถึงลูกค้า (ภาษาของลูกค้า) — เลือกเรื่อง → ดูข้อความ → คัดลอกไปส่ง LINE/SMS หรือ ✉️ ส่งอีเมล */
function OrderMessageBox({ order, messaging }: { order: Order; messaging: Messaging }) {
  const toast = useToast();
  const lang = order.lang === "en" ? "en" : "th";
  const [ev, setEv] = useState<OrderEvent>(() => currentOrderEvent(order));
  const [sending, setSending] = useState(false);
  const msg = useMemo(
    () =>
      orderMessage(
        ev,
        {
          orderNo: order.orderNo,
          customerName: order.customerName,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          items: order.msgItems ?? order.items,
          subtotal: order.subtotal,
          shippingFee: order.shippingFee,
          discount: order.discount,
          giftFee: order.giftFee,
          giftCardFee: order.giftCardFee,
          pointsDiscount: order.pointsDiscount,
          grandTotal: order.grandTotal,
          note: order.note,
          promptpay: order.promptpay ?? null,
          tracking: order.tracking ?? null,
        },
        {
          name: messaging.shopName,
          siteUrl: messaging.siteUrl,
          orderNote: lang === "en" ? messaging.orderNote.en || messaging.orderNote.th : messaging.orderNote.th,
          contactLine: messaging.contactLine,
          contactPhone: messaging.contactPhone,
        },
        lang
      ),
    [ev, order, messaging, lang]
  );
  const canEmail = !!order.customerEmail && messaging.emailReady;
  const sendEmail = async () => {
    setSending(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, notify: ev }),
      }).then((r) => r.json());
      if (j.ok) toast.success(j.message || "ส่งอีเมลแล้ว");
      else toast.error(j.error || "ส่งอีเมลไม่สำเร็จ");
    } catch {
      toast.error("ส่งอีเมลไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-500">💬 ข้อความถึงลูกค้า</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${lang === "en" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>ภาษา{CUSTOMER_LANG_LABEL[lang]}</span>
        <select className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs" value={ev} onChange={(e) => setEv(e.target.value as OrderEvent)} aria-label="เรื่องที่จะแจ้ง">
          {ORDER_EVENTS.map((x) => (
            <option key={x.key} value={x.key}>{x.label}</option>
          ))}
        </select>
      </div>
      <textarea readOnly value={msg.text} rows={7} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-sans" />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={msg.text} label="📋 คัดลอกข้อความ" />
        <button
          type="button"
          disabled={!canEmail || sending}
          onClick={() => void sendEmail()}
          title={!order.customerEmail ? "ลูกค้าไม่ได้กรอกอีเมล" : !messaging.emailReady ? "ยังไม่ได้ตั้งค่าระบบส่งอีเมล" : `ส่งไปที่ ${order.customerEmail}`}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-400 disabled:opacity-40"
        >
          {sending ? "กำลังส่ง…" : "✉️ ส่งอีเมล"}
        </button>
        <p className="text-[11px] text-slate-400">
          {!order.customerEmail
            ? "ลูกค้าไม่ได้กรอกอีเมล — คัดลอกไปส่ง LINE/SMS"
            : !messaging.emailReady
              ? "ยังไม่ได้ตั้งระบบส่งอีเมล (Resend) — คัดลอกไปส่งเองได้"
              : messaging.autoEmail
                ? "อีเมลอัตโนมัติ: เปิด (ส่งเองตอนสั่ง/ชำระ/จัดส่ง/ยกเลิก/คืนเงิน)"
                : "อีเมลอัตโนมัติ: ปิด — เปิดได้ที่แท็บ 🏪 ข้อมูลร้าน"}
        </p>
      </div>
    </section>
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
