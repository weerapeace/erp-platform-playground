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
 * 💳 สลิปโอน: ตัวกรอง "💳 รอตรวจเงิน" + กล่องสลิป (SlipReviewBox) ในรายละเอียด — ยืนยันรับเงิน/ปฏิเสธ (lib/website-payments*)
 * 📦 แพ็กของ: ตัวกรอง "📦 พร้อมแพ็ก" · ติ๊กหลายใบ → พิมพ์ใบปะหน้า+ใบแพ็ก (/print/web-orders) / กำลังเตรียมของ · 🚚 ใส่เลขพัสดุหลายใบ (lib/website-fulfillment)
 * ข้อมูล: /api/website/orders
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { GiftCardPreview } from "@/components/website-gift-cards-editor";
import { normalizeGiftCards, DEFAULT_GIFT_DESIGN, type GiftCardConfig, type OrderGiftCard } from "@/lib/website-gift-cards";
import { CUSTOMER_LANG_LABEL, ORDER_EVENTS, currentOrderEvent, orderMessage, type OrderEvent } from "@/lib/customer-messages";
import { PARCEL_CARRIERS, cleanTrackingNo, type ParcelTracking } from "@/lib/parcel-tracking";
import { SlipReviewBox, type SlipMeta, type SlipView } from "@/components/website-slip-review";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { BulkTrackingModal } from "@/components/website-bulk-tracking";
import { isReadyToPack } from "@/lib/website-fulfillment";
import { canMove, needsConfirm, type StatusKind } from "@/lib/website-order-status";
import { WebsiteCustomerProfile, type CustomerRef } from "@/components/website-customer-profile";
import { sourceLabel } from "@/lib/website-web-stats";
import { ShippopBox, ShippopBulkButton, type ShippopSettings } from "@/components/website-shippop-box";
import type { ShippopInfo } from "@/lib/shippop";

/** gift = 🎀 ห่อ/💌 การ์ด รายชิ้น (ดีไซน์ตะกร้า "เลือกรายชิ้น") */
type Line = { name: string; variantLabel: string | null; unitPrice: number; qty: number; lineTotal: number; gift?: { wrap: boolean; card: boolean; message: string } };
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
  /** 🏷 โปรโมชันที่ใช้ (รวมใน discount แล้ว) */
  promos?: { name: string; amount: number }[];
  /** 📦 มัดจำพรีออเดอร์ + ยอดที่ลูกค้าต้องโอนรอบนี้ */
  depositAmount?: number;
  amountDue?: number;
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
  /** 📎 สลิปที่ลูกค้าแนบ (ล่าสุดก่อน) */
  slips?: SlipView[];
  /** 🚚 วิธีจัดส่งที่ลูกค้าเลือก + กล่องแนะนำ (ออเดอร์เก่า = null) */
  shippingMethod?: { id: string; label: string; box: string | null } | null;
  /** ค่าธรรมเนียมเก็บปลายทาง */
  codFee?: number;
  /** 📈 รอบที่สั่งมาจากไหน (google/facebook/…) — ออเดอร์ก่อนชุด 8 = null */
  source?: string | null;
  /** 🧾 ลูกค้าขอใบกำกับภาษีเต็มรูป (lib/website-tax-invoice) · เลขที่ออกแล้ว */
  taxInvoice?: { kind: "person" | "company"; name: string; taxId: string; branch: string; address: string; email?: string } | null;
  taxInvoiceNo?: string | null;
  /** 🚚 การจองขนส่ง Shippop (null = ยังไม่จอง) */
  shippop?: ShippopInfo | null;
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
  const [profile, setProfile] = useState<CustomerRef | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [trackNo, setTrackNo] = useState("");
  const [trackCarrier, setTrackCarrier] = useState("");
  const [messaging, setMessaging] = useState<Messaging | null>(null);
  const [slipMeta, setSlipMeta] = useState<SlipMeta | null>(null);
  const [slipAuto, setSlipAuto] = useState<{ enabled: boolean; configured: boolean; uploadEnabled: boolean } | null>(null);
  const [shippop, setShippop] = useState<ShippopSettings>({ enabled: false, courier: "FLE", mode: "sim" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [trackOpen, setTrackOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 💳 "รอตรวจเงิน" เป็นสถานะชำระเงิน ไม่ใช่สถานะออเดอร์ → โหลดทั้งหมดแล้วกรองในหน้าจอ
      const r = await apiFetch(`/api/website/orders?shop=${encodeURIComponent(shopSlug)}&status=${encodeURIComponent(filter === "verifying" || filter === "toPack" ? "all" : filter)}`);
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
      setSlipMeta(j.slipMeta ?? null);
      setSlipAuto(j.slipAuto ?? null);
      if (j.shippop) setShippop(j.shippop);
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

  // 🔁 เปลี่ยนสถานะ: เลือกได้เฉพาะขั้นที่อนุญาต (lib/website-order-status) · จัดส่ง/สำเร็จ/ยกเลิก/รับเงิน/คืนเงิน = ถามยืนยันก่อน
  const [confirmMove, setConfirmMove] = useState<{ orderId: string; orderNo: string; kind: StatusKind; to: string; hasTracking: boolean } | null>(null);
  const applyMove = (orderId: string, kind: StatusKind, to: string) =>
    kind === "status" ? patch(orderId, { status: to }, "เปลี่ยนสถานะแล้ว") : patch(orderId, { paymentStatus: to }, "อัปเดตสถานะชำระเงินแล้ว");
  const askMove = (o: { id: string; orderNo: string; status: string; paymentStatus: string; tracking?: unknown }, kind: StatusKind, to: string) => {
    const from = kind === "status" ? o.status : o.paymentStatus;
    if (from === to) return;
    if (needsConfirm(kind, from, to)) setConfirmMove({ orderId: o.id, orderNo: o.orderNo, kind, to, hasTracking: !!o.tracking });
    else void applyMove(o.id, kind, to);
  };

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

  const total = statuses.reduce((a, s) => a + (counts[s.key] ?? 0), 0);
  const shown = filter === "verifying" ? orders.filter((o) => o.paymentStatus === "verifying") : filter === "toPack" ? orders.filter(isReadyToPack) : orders;
  // 📦 ทำหลายใบ: เปลี่ยนสถานะ (ทีละใบผ่าน API — audit/แต้ม/แจ้งลูกค้าครบเหมือนทีละใบ)
  const bulkStatus = async (status: string, label: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: { orderIds: [...sel], status } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(`${label} ${j.done} ออเดอร์${j.failed?.length ? ` · ไม่สำเร็จ ${j.failed.length}` : ""}`);
      setSel(new Set());
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const printHref = (ids?: string[]) => `/print/web-orders?shop=${encodeURIComponent(shopSlug)}${ids?.length ? `&ids=${ids.join(",")}` : ""}`;
  // 💳 พนักงานยืนยันรับเงิน / ปฏิเสธสลิป
  const decideSlip = async (slipId: string, action: "approve" | "reject", reason?: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slipId, slipAction: action, reason }),
      }).then((r) => r.json());
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(action === "approve" ? "ยืนยันรับเงินแล้ว — ออเดอร์เป็น ชำระแล้ว" : "แจ้งลูกค้าแล้วว่าสลิปไม่ถูกต้อง");
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
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
        <Chip active={filter === "toPack"} onClick={() => setFilter("toPack")}>
          📦 พร้อมแพ็ก <span className={(counts.toPack ?? 0) > 0 && filter !== "toPack" ? "rounded-full bg-blue-500 px-1.5 text-white" : "opacity-60"}>{counts.toPack ?? 0}</span>
        </Chip>
        <Chip active={filter === "verifying"} onClick={() => setFilter("verifying")}>
          💳 รอตรวจเงิน <span className={(counts.verifying ?? 0) > 0 && filter !== "verifying" ? "rounded-full bg-amber-400 px-1.5 text-white" : "opacity-60"}>{counts.verifying ?? 0}</span>
        </Chip>
        <a href={printHref()} target="_blank" rel="noopener" className="ml-auto text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" title="ใบปะหน้า + ใบแพ็ก ของทุกออเดอร์ที่พร้อมแพ็ก">
          🖨 พิมพ์ใบปะหน้า
        </a>
        <button type="button" onClick={() => setTrackOpen(true)} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-slate-400">
          🚚 ใส่เลขพัสดุหลายใบ
        </button>
        {cardsWaiting > 0 && (
          <a href={`/print/gift-cards?shop=${encodeURIComponent(shopSlug)}`} target="_blank" rel="noopener" className="text-xs px-2.5 py-1 rounded-full border border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100">
            🎴 พิมพ์การ์ดที่รอ ({cardsWaiting})
          </a>
        )}
        <button onClick={() => void load()} className="text-xs text-slate-500 hover:text-blue-600 px-2 py-1">
          ↻ รีเฟรช
        </button>
      </div>

      {slipAuto?.enabled && !slipAuto.configured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          🤖 เปิด "ตรวจสลิปอัตโนมัติ" ไว้แล้ว แต่ยังไม่ได้ใส่รหัส <span className="font-mono">EASYSLIP_API_KEY</span> ใน Vercel — ตอนนี้ทุกสลิปเข้าคิว 💳 รอตรวจเงิน ให้ตรวจเอง
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">กำลังโหลดออเดอร์…</p>
      ) : (
        <MiniTable<Order>
          rows={shown}
          rowKey={(o) => o.id}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          countUnit="ออเดอร์"
          emptyText={
            filter === "all"
              ? "ยังไม่มีออเดอร์จากเว็บร้านนี้ — เมื่อลูกค้ากดสั่งซื้อบนเว็บ รายการจะขึ้นที่นี่"
              : filter === "verifying"
                ? "ไม่มีสลิปรอตรวจ — ลูกค้าแนบสลิปเมื่อไร (และระบบตรวจอัตโนมัติไม่ผ่าน) จะขึ้นที่นี่"
                : filter === "toPack"
                  ? "ไม่มีออเดอร์ที่พร้อมแพ็ก — ออเดอร์ที่จ่ายแล้ว (หรือเก็บปลายทาง) และยังไม่ส่งจะขึ้นที่นี่"
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
                  {o.taxInvoice && (
                    <span className="inline-block mt-0.5 mr-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200" data-tax-badge>
                      {o.taxInvoiceNo ? "🧾 ออกใบกำกับแล้ว" : "🧾 ขอใบกำกับภาษี"}
                    </span>
                  )}
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
                  {o.shippingMethod && (
                    <p className="text-[11px] text-slate-500" title="วิธีจัดส่งที่ลูกค้าเลือก · กล่องที่ระบบแนะนำ">
                      🚚 {o.shippingMethod.label}{o.shippingMethod.box ? ` · กล่อง ${o.shippingMethod.box}` : ""}
                    </p>
                  )}
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
                  <span className="text-[11px] text-slate-500">
                    {methods[o.paymentMethod] ?? o.paymentMethod}
                    {(o.slips?.length ?? 0) > 0 && <span className="ml-1" title="ลูกค้าแนบสลิปแล้ว">📎{o.slips!.length}</span>}
                  </span>
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

      {/* 📦 ทำหลายใบ */}
      <BulkActionBar count={sel.size} unit="ออเดอร์" onClear={() => setSel(new Set())}>
        <a href={printHref([...sel])} target="_blank" rel="noopener" className="h-9 inline-flex items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">🖨 ใบปะหน้า + ใบแพ็ก</a>
        <button type="button" disabled={busy} onClick={() => void bulkStatus("preparing", "เปลี่ยนเป็นกำลังเตรียมของ")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">📦 กำลังเตรียมของ</button>
        <button type="button" onClick={() => setTrackOpen(true)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">🚚 ใส่เลขพัสดุ</button>
        <ShippopBulkButton ids={[...sel]} settings={shippop} onDone={() => { setSel(new Set()); void load(); }} />
      </BulkActionBar>
      <BulkTrackingModal open={trackOpen} onClose={() => setTrackOpen(false)} orders={orders} onDone={() => { setSel(new Set()); void load(); }} />
      {/* 🔁 ยืนยันก่อนเปลี่ยนสถานะสำคัญ (ลูกค้าอาจได้อีเมลแจ้ง · บางสถานะย้อนไม่ได้) */}
      <ConfirmDialog
        open={!!confirmMove}
        onClose={() => setConfirmMove(null)}
        onConfirm={() => {
          const m = confirmMove;
          setConfirmMove(null);
          if (m) void applyMove(m.orderId, m.kind, m.to);
        }}
        loading={busy}
        variant={confirmMove?.to === "cancelled" || confirmMove?.to === "refunded" ? "danger" : "default"}
        title={confirmMove ? `${confirmMove.orderNo} → ${label(confirmMove.kind === "status" ? statuses : payStatuses, confirmMove.to)}` : ""}
        confirmText={confirmMove ? `เปลี่ยนเป็น “${label(confirmMove.kind === "status" ? statuses : payStatuses, confirmMove.to)}”` : "ยืนยัน"}
        cancelText="ยังไม่เปลี่ยน"
        message={
          confirmMove ? (
            <div className="space-y-1.5 text-sm text-slate-600">
              {confirmMove.to === "shipped" && <p>ลูกค้าจะเห็นสถานะ “จัดส่งแล้ว” {confirmMove.hasTracking ? "พร้อมเลขพัสดุ" : "— ⚠️ ยังไม่ได้ใส่เลขพัสดุ"}</p>}
              {confirmMove.to === "completed" && <p>ออเดอร์จะจบ เปลี่ยนสถานะต่อไม่ได้ · สมาชิกได้แต้ม (ถ้าร้านเปิดแต้ม)</p>}
              {confirmMove.to === "cancelled" && <p>ยกเลิกแล้วเปลี่ยนกลับไม่ได้ · ลูกค้าจะเห็นสถานะ “ยกเลิก” · แต้มที่ใช้คืนให้สมาชิก</p>}
              {confirmMove.to === "paid" && <p>ยืนยันว่าได้รับเงินครบแล้ว</p>}
              {confirmMove.to === "refunded" && <p>คืนเงินแล้วเปลี่ยนสถานะชำระเงินต่อไม่ได้</p>}
              {confirmMove.to !== "completed" && <p className="text-xs text-slate-400">ถ้าร้านเปิดอีเมลแจ้งอัตโนมัติ ลูกค้าที่มีอีเมลจะได้อีเมลแจ้งเรื่องนี้</p>}
            </div>
          ) : (
            ""
          )
        }
      />

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
              {open.source && <span className="text-xs text-slate-500">มาจาก {sourceLabel(open.source)}</span>}
              {open.lang === "en" && <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">🌐 ลูกค้าสั่งจากหน้าภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5">ผู้รับ / ที่อยู่จัดส่ง</h4>
                <p className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                  {open.customerName}
                  <button type="button" onClick={() => setProfile({ phone: open.customerPhone, name: open.customerName })} className="text-xs font-normal text-blue-600 hover:underline" data-open-profile>
                    👤 ประวัติลูกค้าคนนี้
                  </button>
                </p>
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
                {open.taxInvoice && (
                  <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-900 space-y-1" data-tax-request>
                    <p className="font-semibold">🧾 ลูกค้าขอใบกำกับภาษีเต็มรูป{open.taxInvoiceNo ? ` · เลขที่ ${open.taxInvoiceNo}` : ""}</p>
                    <p>
                      {open.taxInvoice.name}
                      {open.taxInvoice.kind === "company" ? ` (${open.taxInvoice.branch === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${open.taxInvoice.branch}`})` : " (บุคคลธรรมดา)"}
                    </p>
                    <p>เลขผู้เสียภาษี {open.taxInvoice.taxId} {open.taxInvoice.email ? `· ส่งใบที่ ${open.taxInvoice.email}` : ""}</p>
                    <p className="whitespace-pre-line">{open.taxInvoice.address}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {open.taxInvoiceNo ? (
                        <a href={`/print/web-tax-invoice?id=${open.id}`} target="_blank" rel="noopener" className="inline-block rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700">🖨 พิมพ์ใบกำกับภาษี</a>
                      ) : (
                        <button
                          type="button"
                          disabled={issuing || open.status === "cancelled"}
                          onClick={async () => {
                            setIssuing(true);
                            try {
                              const j = await apiFetch("/api/website/orders/tax-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: open.id }) }).then((r) => r.json());
                              if (!j.ok) toast.error(j.error ?? "ออกเลขไม่สำเร็จ");
                              else {
                                toast.success(`ออกใบกำกับภาษีเลขที่ ${j.no} แล้ว`);
                                await load();
                              }
                            } finally {
                              setIssuing(false);
                            }
                          }}
                          className="inline-block rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          data-issue-tax
                        >
                          {issuing ? "กำลังออกเลข…" : "ออกเลขใบกำกับภาษี"}
                        </button>
                      )}
                    </div>
                    {!open.taxInvoiceNo && <p className="text-[11px] text-indigo-700/80">ออกเลขแล้วแก้ไม่ได้ — ตรวจชื่อ/เลขผู้เสียภาษีก่อน · หัวกระดาษ = บริษัทตามรหัสที่ตั้งในข้อมูลร้าน › ออเดอร์ › 🧾 (ต้องตั้งก่อน)</p>}
                  </div>
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
                    <li key={idx} className="py-1.5">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-700">
                          {i.name}
                          {i.variantLabel && <span className="text-slate-400"> ({i.variantLabel})</span>}
                          <span className="text-slate-400"> ×{i.qty}</span>
                        </span>
                        <span className="text-slate-800 shrink-0">{money(i.lineTotal)}</span>
                      </div>
                      {i.gift?.card && (
                        <div className="mt-1 flex items-start gap-2 rounded-md bg-pink-50 px-2 py-1.5 text-xs text-pink-900">
                          <span className="shrink-0">💌 การ์ดของชิ้นนี้</span>
                          <span className="flex-1 whitespace-pre-line text-slate-800">{i.gift.message ? `“${i.gift.message}”` : <span className="text-slate-400">(ไม่ได้เขียนข้อความ)</span>}</span>
                          {i.gift.message && <CopyButton value={i.gift.message} title="คัดลอกข้อความการ์ด" />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>ยอดสินค้า</span><span>{money(open.subtotal)}</span></div>
                  <div className="flex justify-between"><span>ค่าส่ง{open.shippingMethod ? ` (${open.shippingMethod.label}${open.shippingMethod.box ? ` · กล่อง ${open.shippingMethod.box}` : ""})` : ""}</span><span>{money(open.shippingFee)}</span></div>
                  {(open.codFee ?? 0) > 0 && <div className="flex justify-between"><span>ค่าธรรมเนียมเก็บปลายทาง</span><span>{money(open.codFee ?? 0)}</span></div>}
                  {open.giftWrap && <div className="flex justify-between"><span>🎀 ค่าห่อของขวัญ</span><span>{open.giftFee ? money(open.giftFee) : "ฟรี"}</span></div>}
                  {open.giftCardOnly && <div className="flex justify-between"><span>💌 ค่าการ์ดอวยพร</span><span>{open.giftCardFee ? money(open.giftCardFee) : "ฟรี"}</span></div>}
                  {(open.promos ?? []).map((p) => <div key={p.name} className="flex justify-between text-emerald-700"><span>🏷 {p.name}</span><span>-{money(p.amount)}</span></div>)}
                  {open.discount - (open.promos ?? []).reduce((s, p) => s + p.amount, 0) > 0.004 && <div className="flex justify-between"><span>ส่วนลด{open.couponCode ? ` (${open.couponCode})` : ""}</span><span>-{money(Math.round((open.discount - (open.promos ?? []).reduce((s, p) => s + p.amount, 0)) * 100) / 100)}</span></div>}
                  {(open.pointsDiscount ?? 0) > 0 && <div className="flex justify-between"><span>⭐ ใช้แต้ม {(open.pointsUsed ?? 0).toLocaleString("th-TH")} แต้ม</span><span>-{money(open.pointsDiscount ?? 0)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1"><span>ยอดรวม</span><span>{money(open.grandTotal)}</span></div>
                  {(open.depositAmount ?? 0) > 0 && (
                    <div className="rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-900 space-y-0.5">
                      <div className="flex justify-between"><span>📦 มัดจำพรีออเดอร์</span><span>{money(open.depositAmount ?? 0)}</span></div>
                      <div className="flex justify-between"><span>ยอดที่เหลือ (โอนก่อนจัดส่ง)</span><span>{money(Math.round((open.grandTotal - (open.depositAmount ?? 0)) * 100) / 100)}</span></div>
                      {(open.amountDue ?? 0) > 0 && <div className="flex justify-between font-semibold"><span>ลูกค้าต้องโอนตอนนี้</span><span>{money(open.amountDue ?? 0)}</span></div>}
                    </div>
                  )}
                  {open.isMember && (
                    <div className="pt-1 text-[11px] text-amber-700">
                      👤 ออเดอร์สมาชิก · {(open.pointsEarned ?? 0) > 0 ? `⭐ ได้ ${(open.pointsEarned ?? 0).toLocaleString("th-TH")} แต้มแล้ว` : "ได้แต้มเมื่อเปลี่ยนเป็น “สำเร็จ” (ถ้าร้านเปิดแต้ม)"}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {slipMeta && (open.slips?.length ?? 0) > 0 && (
              <SlipReviewBox slips={open.slips ?? []} meta={slipMeta} orderTotal={open.grandTotal} busy={busy} onDecide={decideSlip} />
            )}

            {messaging && <OrderMessageBox key={open.id} order={open} messaging={messaging} />}

            <section className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">สถานะออเดอร์</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={open.status}
                    disabled={busy}
                    onChange={(e) => askMove(open, "status", e.target.value)}
                  >
                    {statuses.filter((s) => canMove("status", open.status, s.key)).map((s) => (
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
                    onChange={(e) => askMove(open, "payment", e.target.value)}
                  >
                    {payStatuses.filter((s) => canMove("payment", open.paymentStatus, s.key)).map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* 🚚 Shippop: จองขนส่ง → เลขพัสดุเติมให้ช่องด้านล่างเอง */}
              <ShippopBox order={open} settings={shippop} onChanged={() => void load()} />
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
      <WebsiteCustomerProfile shopSlug={shopSlug} who={profile} onClose={() => setProfile(null)} />
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
          shippingMethod: order.shippingMethod ?? null,
          codFee: order.codFee ?? 0,
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
