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
import { useT } from "@/components/i18n";
import { getLang } from "@/lib/lang";
import { useToast } from "@/components/toast";
import { MiniTable } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import { PersonalizeOrderPreview } from "@/components/personalize-stamp";
import { PrintDesignOrderPanel } from "@/components/print-design-order-panel";
import type { OrderPersonalize } from "@/lib/website-personalize";
import { GiftCardPreview } from "@/components/website-gift-cards-editor";
import { normalizeGiftCards, DEFAULT_GIFT_DESIGN, type GiftCardConfig, type OrderGiftCard } from "@/lib/website-gift-cards";
import { CUSTOMER_LANG_LABEL, ORDER_EVENTS, currentOrderEvent, orderMessage, type OrderEvent } from "@/lib/customer-messages";
import { PARCEL_CARRIERS, cleanTrackingNo, type ParcelTracking } from "@/lib/parcel-tracking";
import { SlipReviewBox, type SlipMeta, type SlipView } from "@/components/website-slip-review";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { BulkTrackingModal } from "@/components/website-bulk-tracking";
import { isReadyToPack } from "@/lib/website-fulfillment";
import { canMove, needsConfirm, type StatusKind } from "@/lib/website-order-status";
import { WebsiteCustomerProfile, orderLabelUi, type CustomerRef } from "@/components/website-customer-profile";
import { sourceLabel } from "@/lib/website-web-stats";
import { ShippopBox, ShippopBulkButton, type ShippopSettings } from "@/components/website-shippop-box";
import type { ShippopInfo } from "@/lib/shippop";

/** gift = 🎀 ห่อ/💌 การ์ด รายชิ้น (ดีไซน์ตะกร้า "เลือกรายชิ้น") */
type Line = { name: string; variantLabel: string | null; unitPrice: number; qty: number; lineTotal: number; gift?: { wrap: boolean; card: boolean; message: string; styleName?: string; cardInfo?: OrderGiftCard | null }; personalize?: OrderPersonalize; /** 🖨 ลายรีด */ printDesignId?: string; printReview?: string | null };
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
  /** 🎀 แบบห่อที่เลือก (ทั้งออเดอร์) */
  giftWrapStyle?: string;
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
/** EN ของป้ายเรื่องที่แจ้ง (lib/customer-messages) + ขนส่ง (lib/parcel-tracking) — แสดงในหน้า ERP เท่านั้น */
const EVENT_EN: Record<string, string> = { placed: "Order received", paid: "Payment received", preparing: "Preparing", shipped: "Shipped", completed: "Thank you (completed)", cancelled: "Order cancelled", refunded: "Refunded" };
const CARRIER_EN: Record<string, string> = { thaipost: "Thailand Post (EMS / registered)", other: "Other" };

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function WebsiteOrdersPanel({ shopSlug }: { shopSlug: string; shopId: string }) {
  const t = useT();
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
      const r = await apiFetch(`/api/website/orders?shop=${encodeURIComponent(shopSlug)}&status=${encodeURIComponent(filter === "verifying" || filter === "toPack" || filter === "printReview" ? "all" : filter)}`);
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
      toast.error(t("โหลดออเดอร์ไม่สำเร็จ", "Couldn't load orders"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug, filter, toast, t]);

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
  const label = (list: StatusDef[], key: string) => orderLabelUi(list === payStatuses ? "payment" : "status", key, list.find((s) => s.key === key)?.label ?? key);
  const methodLabel = (key: string) => orderLabelUi("method", key, methods[key] ?? key);

  // 🔁 เปลี่ยนสถานะ: เลือกได้เฉพาะขั้นที่อนุญาต (lib/website-order-status) · จัดส่ง/สำเร็จ/ยกเลิก/รับเงิน/คืนเงิน = ถามยืนยันก่อน
  const [confirmMove, setConfirmMove] = useState<{ orderId: string; orderNo: string; kind: StatusKind; to: string; hasTracking: boolean } | null>(null);
  const applyMove = (orderId: string, kind: StatusKind, to: string) =>
    kind === "status" ? patch(orderId, { status: to }, t("เปลี่ยนสถานะแล้ว", "Status changed")) : patch(orderId, { paymentStatus: to }, t("อัปเดตสถานะชำระเงินแล้ว", "Payment status updated"));
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
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Couldn't save"));
        return;
      }
      // ⭐ ออเดอร์สมาชิก: บอกว่าแต้มขยับยังไง (ได้/เรียกคืน/คืนแต้มที่ใช้) · ปรับแต้มไม่สำเร็จ = เตือน
      const pts = (j.points ?? []) as { kind: string; delta: number }[];
      const ptsMsg = pts.map((p) => `${p.kind === "earn" ? t("สมาชิกได้", "Member earned") : p.kind === "revoke" ? t("เรียกคืน", "Revoked") : p.kind === "refund" ? t("คืนแต้มที่ใช้", "Refunded used") : t("หักแต้มที่ใช้", "Deducted used")} ${Math.abs(p.delta).toLocaleString("th-TH")} ${t("แต้ม", "points")}`).join(" · ");
      toast.success(ptsMsg ? `${okMsg} · ⭐ ${ptsMsg}` : okMsg);
      if (j.warning) toast.error(j.warning);
      // ✉️ แจ้งลูกค้าอัตโนมัติ: บอกผล (ส่งแล้ว/ทำไมไม่ได้ส่ง) — ร้านไม่ได้เปิด = เงียบ
      if (j.notifyMsg) (j.notify?.sent ? toast.success : toast.error)(j.notifyMsg);
      await load();
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  const total = statuses.reduce((a, s) => a + (counts[s.key] ?? 0), 0);
  const shown =
    filter === "verifying"
      ? orders.filter((o) => o.paymentStatus === "verifying")
      : filter === "toPack"
        ? orders.filter(isReadyToPack)
        : filter === "printReview"
          ? orders.filter((o) => o.items.some((i) => i.printReview === "pending"))
          : orders;
  // 📦 ทำหลายใบ: เปลี่ยนสถานะ (ทีละใบผ่าน API — audit/แต้ม/แจ้งลูกค้าครบเหมือนทีละใบ)
  const bulkStatus = async (status: string, label: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: { orderIds: [...sel], status } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Couldn't save"));
      toast.success(`${label} ${j.done} ${t("ออเดอร์", "orders")}${j.failed?.length ? ` · ${t("ไม่สำเร็จ", "failed")} ${j.failed.length}` : ""}`);
      setSel(new Set());
      await load();
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save"));
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
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Couldn't save"));
        return;
      }
      toast.success(action === "approve" ? t("ยืนยันรับเงินแล้ว — ออเดอร์เป็น ชำระแล้ว", "Payment confirmed — order is now Paid") : t("แจ้งลูกค้าแล้วว่าสลิปไม่ถูกต้อง", "Customer told the slip is invalid"));
      await load();
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  // 🎴 การ์ดที่รอพิมพ์ (ในรายการที่โหลดอยู่) + ตั้งค่าการ์ดของร้าน (โหลดเมื่อเปิดออเดอร์ที่มีการ์ด — ไว้วาดพรีวิว)
  // 🎴 การ์ดรอพิมพ์ = การ์ดทั้งออเดอร์ + การ์ดรายชิ้น ที่ยังไม่ได้พิมพ์
  const cardsWaiting = orders.filter((o) => o.status !== "cancelled" && ((o.giftCard && !o.giftCard.printedAt) || o.items.some((i) => i.gift?.cardInfo && !i.gift.cardInfo.printedAt))).length;
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
          {t("ทั้งหมด", "All")} <span className="opacity-60">{total}</span>
        </Chip>
        {statuses.map((s) => (
          <Chip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}>
            {label(statuses, s.key)} <span className="opacity-60">{counts[s.key] ?? 0}</span>
          </Chip>
        ))}
        <Chip active={filter === "toPack"} onClick={() => setFilter("toPack")}>
          {t("📦 พร้อมแพ็ก", "📦 Ready to pack")} <span className={(counts.toPack ?? 0) > 0 && filter !== "toPack" ? "rounded-full bg-blue-500 px-1.5 text-white" : "opacity-60"}>{counts.toPack ?? 0}</span>
        </Chip>
        {((counts.printReview ?? 0) > 0 || filter === "printReview") && (
          <Chip active={filter === "printReview"} onClick={() => setFilter("printReview")}>
            {t("🖨 รอตรวจลาย", "🖨 Print to review")} <span className={(counts.printReview ?? 0) > 0 && filter !== "printReview" ? "rounded-full bg-violet-500 px-1.5 text-white" : "opacity-60"}>{counts.printReview ?? 0}</span>
          </Chip>
        )}
        <Chip active={filter === "verifying"} onClick={() => setFilter("verifying")}>
          {t("💳 รอตรวจเงิน", "💳 Payment to check")} <span className={(counts.verifying ?? 0) > 0 && filter !== "verifying" ? "rounded-full bg-amber-400 px-1.5 text-white" : "opacity-60"}>{counts.verifying ?? 0}</span>
        </Chip>
        <a href={printHref()} target="_blank" rel="noopener" className="ml-auto text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" title={t("ใบปะหน้า + ใบแพ็ก ของทุกออเดอร์ที่พร้อมแพ็ก", "Shipping labels + packing slips for all ready-to-pack orders")}>
          {t("🖨 พิมพ์ใบปะหน้า", "🖨 Print labels")}
        </a>
        <button type="button" onClick={() => setTrackOpen(true)} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-slate-400">
          {t("🚚 ใส่เลขพัสดุหลายใบ", "🚚 Bulk tracking numbers")}
        </button>
        {cardsWaiting > 0 && (
          <a href={`/print/gift-cards?shop=${encodeURIComponent(shopSlug)}`} target="_blank" rel="noopener" className="text-xs px-2.5 py-1 rounded-full border border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100">
            {t("🎴 พิมพ์การ์ดที่รอ", "🎴 Print waiting cards")} ({cardsWaiting})
          </a>
        )}
        <button onClick={() => void load()} className="text-xs text-slate-500 hover:text-blue-600 px-2 py-1">
          {t("↻ รีเฟรช", "↻ Refresh")}
        </button>
      </div>

      {slipAuto?.enabled && !slipAuto.configured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('🤖 เปิด "ตรวจสลิปอัตโนมัติ" ไว้แล้ว แต่ยังไม่ได้ใส่รหัส', '🤖 "Auto slip check" is on, but the key')} <span className="font-mono">EASYSLIP_API_KEY</span> {t("ใน Vercel — ตอนนี้ทุกสลิปเข้าคิว 💳 รอตรวจเงิน ให้ตรวจเอง", "is not set in Vercel — every slip goes to 💳 Payment to check for manual review")}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">{t("กำลังโหลดออเดอร์…", "Loading orders…")}</p>
      ) : (
        <MiniTable<Order>
          rows={shown}
          rowKey={(o) => o.id}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          countUnit={t("ออเดอร์", "orders")}
          emptyText={
            filter === "all"
              ? t("ยังไม่มีออเดอร์จากเว็บร้านนี้ — เมื่อลูกค้ากดสั่งซื้อบนเว็บ รายการจะขึ้นที่นี่", "No orders from this shop yet — they will show here when customers order on the website")
              : filter === "verifying"
                ? t("ไม่มีสลิปรอตรวจ — ลูกค้าแนบสลิปเมื่อไร (และระบบตรวจอัตโนมัติไม่ผ่าน) จะขึ้นที่นี่", "No slips to check — slips that fail the auto check will show here")
                : filter === "toPack"
                  ? t("ไม่มีออเดอร์ที่พร้อมแพ็ก — ออเดอร์ที่จ่ายแล้ว (หรือเก็บปลายทาง) และยังไม่ส่งจะขึ้นที่นี่", "Nothing to pack — paid (or COD) orders not yet shipped will show here")
                : filter === "printReview"
                  ? t("ไม่มีลายรอตรวจ — ออเดอร์ที่ลูกค้าอัปรูปเองมาให้รีดจะขึ้นที่นี่", "No prints to review — orders with customer-uploaded print images will show here")
                : t("ไม่มีออเดอร์ในสถานะนี้", "No orders with this status")
          }
          searchText={(o) => `${o.giftWrap ? "ห่อของขวัญ " : ""}${o.giftCardOnly ? "การ์ด " : ""}${o.orderNo} ${o.customerName} ${o.customerPhone} ${o.skuCodes.join(" ")} ${o.items.map((i) => i.name).join(" ")}`}
          searchPlaceholder={t("ค้นหา เลขที่ / ชื่อ / เบอร์ / รหัสสินค้า", "Search no. / name / phone / product code")}
          onRowClick={(o) => setOpenId(o.id)}
          columns={[
            {
              key: "no",
              header: t("เลขที่", "No."),
              width: "11rem",
              cell: (o) => (
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-800">
                    {o.orderNo}
                    {o.lang === "en" && <span className="ml-1 font-sans text-[10px] px-1 rounded bg-sky-100 text-sky-700" title={t("ลูกค้าสั่งจากหน้าเว็บภาษาอังกฤษ", "Ordered from the English site")}>EN</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{when(o.createdAt)}</p>
                  {o.taxInvoice && (
                    <span className="inline-block mt-0.5 mr-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200" data-tax-badge>
                      {o.taxInvoiceNo ? t("🧾 ออกใบกำกับแล้ว", "🧾 Tax invoice issued") : t("🧾 ขอใบกำกับภาษี", "🧾 Tax invoice requested")}
                    </span>
                  )}
                  {o.items.some((i) => i.printDesignId) && (
                    <span className={`inline-block mt-0.5 mr-1 text-[10px] px-1.5 py-0.5 rounded-full border ${o.items.some((i) => i.printReview === "pending") ? "bg-violet-100 text-violet-800 border-violet-300" : "bg-violet-50 text-violet-700 border-violet-200"}`}>
                      {o.items.some((i) => i.printReview === "pending") ? t("🖨 รอตรวจลาย", "🖨 Print to review") : t("🖨 มีลายรีด", "🖨 Has print")}
                    </span>
                  )}
                  {(o.giftWrap || o.giftCardOnly) && (
                    <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                      {o.giftWrap ? t("🎀 ต้องห่อของขวัญ", "🎀 Gift wrap") : t("💌 ใส่การ์ดอวยพร", "💌 Greeting card")}
                      {o.giftWrap && o.giftCardOnly ? t(" + การ์ด", " + card") : ""}
                      {o.giftCard ? (o.giftCard.printedAt ? t(" · การ์ดพิมพ์แล้ว", " · card printed") : t(" · 🎴 รอพิมพ์การ์ด", " · 🎴 card to print")) : ""}
                    </span>
                  )}
                </div>
              ),
              sortValue: (o) => o.createdAt,
              sortLabel: t("วันที่", "Date"),
            },
            {
              key: "cust",
              header: t("ลูกค้า", "Customer"),
              width: "1.2fr",
              cell: (o) => (
                <div>
                  <p className="text-sm text-slate-800">{o.customerName}</p>
                  <p className="text-[11px] text-slate-500">{o.customerPhone}</p>
                  {o.shippingMethod && (
                    <p className="text-[11px] text-slate-500" title={t("วิธีจัดส่งที่ลูกค้าเลือก · กล่องที่ระบบแนะนำ", "Shipping method chosen · suggested box")}>
                      🚚 {o.shippingMethod.label}{o.shippingMethod.box ? ` · ${t("กล่อง", "Box")} ${o.shippingMethod.box}` : ""}
                    </p>
                  )}
                </div>
              ),
              sortValue: (o) => o.customerName,
            },
            {
              key: "items",
              header: t("สินค้า", "Items"),
              width: "1.6fr",
              cell: (o) => (
                <p className="text-xs text-slate-600 line-clamp-2">
                  {o.items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} ×${i.qty}`).join(" · ")}
                </p>
              ),
            },
            {
              key: "total",
              header: t("ยอดรวม", "Total"),
              width: "7rem",
              align: "right",
              cell: (o) => <span className="font-semibold text-slate-800">{money(o.grandTotal)}</span>,
              sortValue: (o) => o.grandTotal,
            },
            {
              key: "pay",
              header: t("ชำระเงิน", "Payment"),
              width: "9rem",
              cell: (o) => (
                <div className="flex flex-col gap-0.5 items-start">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone(payStatuses, o.paymentStatus)}`}>
                    {label(payStatuses, o.paymentStatus)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {methodLabel(o.paymentMethod)}
                    {(o.slips?.length ?? 0) > 0 && <span className="ml-1" title={t("ลูกค้าแนบสลิปแล้ว", "Customer attached a slip")}>📎{o.slips!.length}</span>}
                  </span>
                </div>
              ),
              sortValue: (o) => o.paymentStatus,
            },
            {
              key: "status",
              header: t("สถานะ", "Status"),
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
      <BulkActionBar count={sel.size} unit={t("ออเดอร์", "orders")} onClear={() => setSel(new Set())}>
        <a href={printHref([...sel])} target="_blank" rel="noopener" className="h-9 inline-flex items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">{t("🖨 ใบปะหน้า + ใบแพ็ก", "🖨 Labels + packing slips")}</a>
        <button type="button" disabled={busy} onClick={() => void bulkStatus("preparing", t("เปลี่ยนเป็นกำลังเตรียมของ", "Set to Preparing"))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">{t("📦 กำลังเตรียมของ", "📦 Preparing")}</button>
        <button type="button" onClick={() => setTrackOpen(true)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">{t("🚚 ใส่เลขพัสดุ", "🚚 Add tracking")}</button>
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
        confirmText={confirmMove ? t(`เปลี่ยนเป็น “${label(confirmMove.kind === "status" ? statuses : payStatuses, confirmMove.to)}”`, `Change to “${label(confirmMove.kind === "status" ? statuses : payStatuses, confirmMove.to)}”`) : t("ยืนยัน", "Confirm")}
        cancelText={t("ยังไม่เปลี่ยน", "Not now")}
        message={
          confirmMove ? (
            <div className="space-y-1.5 text-sm text-slate-600">
              {confirmMove.to === "shipped" && <p>{t("ลูกค้าจะเห็นสถานะ “จัดส่งแล้ว”", "The customer will see “Shipped”")} {confirmMove.hasTracking ? t("พร้อมเลขพัสดุ", "with the tracking number") : t("— ⚠️ ยังไม่ได้ใส่เลขพัสดุ", "— ⚠️ no tracking number yet")}</p>}
              {confirmMove.to === "completed" && <p>{t("ออเดอร์จะจบ เปลี่ยนสถานะต่อไม่ได้ · สมาชิกได้แต้ม (ถ้าร้านเปิดแต้ม)", "The order closes and can't change status again · members earn points (if points are on)")}</p>}
              {confirmMove.to === "cancelled" && <p>{t("ยกเลิกแล้วเปลี่ยนกลับไม่ได้ · ลูกค้าจะเห็นสถานะ “ยกเลิก” · แต้มที่ใช้คืนให้สมาชิก", "Cancelling can't be undone · the customer will see “Cancelled” · used points are returned")}</p>}
              {confirmMove.to === "paid" && <p>{t("ยืนยันว่าได้รับเงินครบแล้ว", "Confirm the full payment was received")}</p>}
              {confirmMove.to === "refunded" && <p>{t("คืนเงินแล้วเปลี่ยนสถานะชำระเงินต่อไม่ได้", "After a refund the payment status can't change again")}</p>}
              {confirmMove.to !== "completed" && <p className="text-xs text-slate-400">{t("ถ้าร้านเปิดอีเมลแจ้งอัตโนมัติ ลูกค้าที่มีอีเมลจะได้อีเมลแจ้งเรื่องนี้", "If auto email is on, customers with an email will be notified")}</p>}
            </div>
          ) : (
            ""
          )
        }
      />

      {/* รายละเอียดออเดอร์ */}
      <ERPModal open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `${t("ออเดอร์", "Order")} ${open.orderNo}` : ""} size="lg">
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full ${tone(statuses, open.status)}`}>{label(statuses, open.status)}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${tone(payStatuses, open.paymentStatus)}`}>
                {label(payStatuses, open.paymentStatus)} · {methodLabel(open.paymentMethod)}
              </span>
              <span className="text-xs text-slate-500">{t("สั่งเมื่อ", "Ordered")} {when(open.createdAt)}</span>
              {open.erpSoNumber && <span className="text-xs text-slate-500">{t("ใบสั่งขาย ERP", "ERP sales order")}: {open.erpSoNumber}</span>}
              {open.source && <span className="text-xs text-slate-500">{t("มาจาก", "From")} {sourceLabel(open.source)}</span>}
              {open.lang === "en" && <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{t("🌐 ลูกค้าสั่งจากหน้าภาษาอังกฤษ — ตอบเป็นภาษาอังกฤษ", "🌐 Ordered from the English site — reply in English")}</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5">{t("ผู้รับ / ที่อยู่จัดส่ง", "Recipient / shipping address")}</h4>
                <p className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                  {open.customerName}
                  <button type="button" onClick={() => setProfile({ phone: open.customerPhone, name: open.customerName })} className="text-xs font-normal text-blue-600 hover:underline" data-open-profile>
                    {t("👤 ประวัติลูกค้าคนนี้", "👤 Customer history")}
                  </button>
                </p>
                <p className="text-slate-600">
                  {t("โทร", "Tel")} {open.customerPhone}
                  {open.customerEmail ? ` · ${open.customerEmail}` : ""}
                </p>
                <p className="text-slate-600 mt-1 whitespace-pre-line">
                  {[open.ship.addressLine, open.ship.subdistrict, open.ship.district, open.ship.province, open.ship.postal]
                    .filter(Boolean)
                    .join(" ")}
                </p>
                {open.note && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">{t("หมายเหตุ", "Note")}: {open.note}</p>
                )}
                {open.taxInvoice && (
                  <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-900 space-y-1" data-tax-request>
                    <p className="font-semibold">{t("🧾 ลูกค้าขอใบกำกับภาษีเต็มรูป", "🧾 Customer requested a full tax invoice")}{open.taxInvoiceNo ? ` · ${t("เลขที่", "No.")} ${open.taxInvoiceNo}` : ""}</p>
                    <p>
                      {open.taxInvoice.name}
                      {open.taxInvoice.kind === "company" ? ` (${open.taxInvoice.branch === "00000" ? t("สำนักงานใหญ่", "Head office") : t(`สาขาที่ ${open.taxInvoice.branch}`, `Branch ${open.taxInvoice.branch}`)})` : t(" (บุคคลธรรมดา)", " (individual)")}
                    </p>
                    <p>{t("เลขผู้เสียภาษี", "Tax ID")} {open.taxInvoice.taxId} {open.taxInvoice.email ? `· ${t("ส่งใบที่", "Send to")} ${open.taxInvoice.email}` : ""}</p>
                    <p className="whitespace-pre-line">{open.taxInvoice.address}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {open.taxInvoiceNo ? (
                        <a href={`/print/web-tax-invoice?id=${open.id}`} target="_blank" rel="noopener" className="inline-block rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700">{t("🖨 พิมพ์ใบกำกับภาษี", "🖨 Print tax invoice")}</a>
                      ) : (
                        <button
                          type="button"
                          disabled={issuing || open.status === "cancelled"}
                          onClick={async () => {
                            setIssuing(true);
                            try {
                              const j = await apiFetch("/api/website/orders/tax-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: open.id }) }).then((r) => r.json());
                              if (!j.ok) toast.error(j.error ?? t("ออกเลขไม่สำเร็จ", "Couldn't issue the number"));
                              else {
                                toast.success(t(`ออกใบกำกับภาษีเลขที่ ${j.no} แล้ว`, `Tax invoice ${j.no} issued`));
                                await load();
                              }
                            } finally {
                              setIssuing(false);
                            }
                          }}
                          className="inline-block rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          data-issue-tax
                        >
                          {issuing ? t("กำลังออกเลข…", "Issuing…") : t("ออกเลขใบกำกับภาษี", "Issue tax invoice no.")}
                        </button>
                      )}
                    </div>
                    {!open.taxInvoiceNo && <p className="text-[11px] text-indigo-700/80">{t("ออกเลขแล้วแก้ไม่ได้ — ตรวจชื่อ/เลขผู้เสียภาษีก่อน · หัวกระดาษ = บริษัทตามรหัสที่ตั้งในข้อมูลร้าน › ออเดอร์ › 🧾 (ต้องตั้งก่อน)", "Can't be changed once issued — check the name/tax ID first · letterhead = company code set in Shop info › Orders › 🧾 (set it first)")}</p>}
                  </div>
                )}
                {(open.giftWrap || open.giftCardOnly) && (
                  <div className="mt-2 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-2 text-xs text-pink-800 space-y-1">
                    <p className="font-semibold">{open.giftWrap ? (open.giftCardOnly ? t("🎀 ห่อเป็นของขวัญ + 💌 การ์ดอวยพร", "🎀 Gift wrap + 💌 greeting card") : t("🎀 ห่อเป็นของขวัญ", "🎀 Gift wrap")) : t("💌 ใส่การ์ดอวยพร (ไม่ห่อ)", "💌 Greeting card (no wrap)")}{open.giftWrapStyle ? ` · ${t("แบบ", "Style")} ${open.giftWrapStyle}` : ""}</p>
                    {open.giftHidePrice && <p className="font-medium text-rose-700">{t("⚠️ ห้ามใส่ใบเสร็จ/ป้ายราคาในกล่อง (ส่งถึงผู้รับเป็นของขวัญ)", "⚠️ No receipt/price tag in the box (sent as a gift)")}</p>}
                    {open.giftMessage ? (
                      <div className="flex items-start gap-1.5">
                        <p className="flex-1 whitespace-pre-line rounded-md bg-white/70 px-2 py-1.5 text-slate-800">“{open.giftMessage}”</p>
                        <CopyButton value={open.giftMessage} title={t("คัดลอกข้อความการ์ด", "Copy card message")} />
                      </div>
                    ) : (
                      <p className="text-pink-700/80">{t("ไม่มีข้อความบนการ์ด", "No card message")}</p>
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
                          🎴 {t("ถึง", "To")} {open.giftCard.to || "—"} · {t("จาก", "From")} {open.giftCard.anon ? t("ไม่ระบุชื่อ", "Anonymous") : open.giftCard.from || "—"}
                          {open.giftCard.printedAt ? ` · ${t("พิมพ์แล้ว", "printed")} ${when(open.giftCard.printedAt)}` : t(" · ยังไม่ได้พิมพ์", " · not printed")}
                        </p>
                        <a href={`/print/gift-cards?shop=${encodeURIComponent(shopSlug)}&ids=${open.id}`} target="_blank" rel="noopener" className="inline-block rounded-md border border-pink-300 bg-white px-2.5 py-1 text-pink-700 hover:bg-pink-100">
                          {t("🖨 พิมพ์การ์ดใบนี้", "🖨 Print this card")}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5">{t("รายการสินค้า", "Items")}</h4>
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
                      {i.personalize && <PersonalizeOrderPreview pz={i.personalize} />}
                      {i.printDesignId && <PrintDesignOrderPanel shopSlug={shopSlug} designId={i.printDesignId} onChanged={() => void load()} />}
                      {i.gift?.card && (
                        <div className="mt-1 flex items-start gap-2 rounded-md bg-pink-50 px-2 py-1.5 text-xs text-pink-900">
                          <span className="shrink-0">{t("💌 การ์ดของชิ้นนี้", "💌 Card for this item")}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block whitespace-pre-line text-slate-800">{i.gift.message ? `“${i.gift.message}”` : <span className="text-slate-400">{t("(ไม่ได้เขียนข้อความ)", "(no message)")}</span>}</span>
                            {i.gift.cardInfo && (
                              <span className="block text-[11px] text-pink-800/80">
                                🎴 {t("ถึง", "To")} {i.gift.cardInfo.to || "—"} · {t("จาก", "From")} {i.gift.cardInfo.anon ? t("ไม่ระบุชื่อ", "Anonymous") : i.gift.cardInfo.from || "—"}
                                {i.gift.cardInfo.printedAt ? t(" · พิมพ์แล้ว", " · printed") : t(" · ยังไม่ได้พิมพ์", " · not printed")}
                              </span>
                            )}
                          </span>
                          {i.gift.message && <CopyButton value={i.gift.message} title={t("คัดลอกข้อความการ์ด", "Copy card message")} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>{t("ยอดสินค้า", "Subtotal")}</span><span>{money(open.subtotal)}</span></div>
                  <div className="flex justify-between"><span>{t("ค่าส่ง", "Shipping")}{open.shippingMethod ? ` (${open.shippingMethod.label}${open.shippingMethod.box ? ` · ${t("กล่อง", "Box")} ${open.shippingMethod.box}` : ""})` : ""}</span><span>{money(open.shippingFee)}</span></div>
                  {(open.codFee ?? 0) > 0 && <div className="flex justify-between"><span>{t("ค่าธรรมเนียมเก็บปลายทาง", "COD fee")}</span><span>{money(open.codFee ?? 0)}</span></div>}
                  {open.giftWrap && <div className="flex justify-between"><span>{t("🎀 ค่าห่อของขวัญ", "🎀 Gift wrap fee")}</span><span>{open.giftFee ? money(open.giftFee) : t("ฟรี", "Free")}</span></div>}
                  {open.giftCardOnly && <div className="flex justify-between"><span>{t("💌 ค่าการ์ดอวยพร", "💌 Card fee")}</span><span>{open.giftCardFee ? money(open.giftCardFee) : t("ฟรี", "Free")}</span></div>}
                  {(open.promos ?? []).map((p) => <div key={p.name} className="flex justify-between text-emerald-700"><span>🏷 {p.name}</span><span>-{money(p.amount)}</span></div>)}
                  {open.discount - (open.promos ?? []).reduce((s, p) => s + p.amount, 0) > 0.004 && <div className="flex justify-between"><span>{t("ส่วนลด", "Discount")}{open.couponCode ? ` (${open.couponCode})` : ""}</span><span>-{money(Math.round((open.discount - (open.promos ?? []).reduce((s, p) => s + p.amount, 0)) * 100) / 100)}</span></div>}
                  {(open.pointsDiscount ?? 0) > 0 && <div className="flex justify-between"><span>⭐ {t("ใช้แต้ม", "Used")} {(open.pointsUsed ?? 0).toLocaleString("th-TH")} {t("แต้ม", "points")}</span><span>-{money(open.pointsDiscount ?? 0)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 pt-1"><span>{t("ยอดรวม", "Total")}</span><span>{money(open.grandTotal)}</span></div>
                  {(open.depositAmount ?? 0) > 0 && (
                    <div className="rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-900 space-y-0.5">
                      <div className="flex justify-between"><span>{t("📦 มัดจำพรีออเดอร์", "📦 Pre-order deposit")}</span><span>{money(open.depositAmount ?? 0)}</span></div>
                      <div className="flex justify-between"><span>{t("ยอดที่เหลือ (โอนก่อนจัดส่ง)", "Balance (pay before shipping)")}</span><span>{money(Math.round((open.grandTotal - (open.depositAmount ?? 0)) * 100) / 100)}</span></div>
                      {(open.amountDue ?? 0) > 0 && <div className="flex justify-between font-semibold"><span>{t("ลูกค้าต้องโอนตอนนี้", "Customer owes now")}</span><span>{money(open.amountDue ?? 0)}</span></div>}
                    </div>
                  )}
                  {open.isMember && (
                    <div className="pt-1 text-[11px] text-amber-700">
                      {t("👤 ออเดอร์สมาชิก", "👤 Member order")} · {(open.pointsEarned ?? 0) > 0 ? t(`⭐ ได้ ${(open.pointsEarned ?? 0).toLocaleString("th-TH")} แต้มแล้ว`, `⭐ Earned ${(open.pointsEarned ?? 0).toLocaleString("th-TH")} points`) : t("ได้แต้มเมื่อเปลี่ยนเป็น “สำเร็จ” (ถ้าร้านเปิดแต้ม)", "Earns points when set to “Completed” (if points are on)")}
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
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("สถานะออเดอร์", "Order status")}</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={open.status}
                    disabled={busy}
                    onChange={(e) => askMove(open, "status", e.target.value)}
                  >
                    {statuses.filter((s) => canMove("status", open.status, s.key)).map((s) => (
                      <option key={s.key} value={s.key}>{label(statuses, s.key)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("สถานะชำระเงิน", "Payment status")}</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={open.paymentStatus}
                    disabled={busy}
                    onChange={(e) => askMove(open, "payment", e.target.value)}
                  >
                    {payStatuses.filter((s) => canMove("payment", open.paymentStatus, s.key)).map((s) => (
                      <option key={s.key} value={s.key}>{label(payStatuses, s.key)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* 🚚 Shippop: จองขนส่ง → เลขพัสดุเติมให้ช่องด้านล่างเอง */}
              <ShippopBox order={open} settings={shippop} onChanged={() => void load()} />
              {/* 🚚 เลขพัสดุ — ลูกค้าเห็นเลข + ปุ่มตามพัสดุ (หน้า ติดตามคำสั่งซื้อ / บัญชีสมาชิก / ข้อความ "จัดส่งแล้ว") */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("🚚 เลขพัสดุ (ลูกค้าเห็น + กดตามพัสดุได้)", "🚚 Tracking number (customer can see and track)")}</label>
                <div className="flex flex-wrap gap-2">
                  <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={trackCarrier} onChange={(e) => setTrackCarrier(e.target.value)}>
                    <option value="">{t("— เลือกขนส่ง —", "— Choose carrier —")}</option>
                    {PARCEL_CARRIERS.map((c) => (
                      <option key={c.key} value={c.key}>{CARRIER_EN[c.key] ? t(c.label, CARRIER_EN[c.key]) : c.label}</option>
                    ))}
                  </select>
                  <input className="flex-1 min-w-[10rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase" value={trackNo} onChange={(e) => setTrackNo(e.target.value)} placeholder={t("เช่น TH1234567890", "e.g. TH1234567890")} />
                  <button
                    disabled={busy || (cleanTrackingNo(trackNo) === (open.tracking?.number ?? "") && (trackCarrier || "") === (open.tracking?.carrier ?? "")) || (!!cleanTrackingNo(trackNo) && !trackCarrier)}
                    onClick={() => void patch(open.id, { trackingNo: trackNo, trackingCarrier: trackCarrier }, cleanTrackingNo(trackNo) ? t("บันทึกเลขพัสดุแล้ว", "Tracking number saved") : t("ลบเลขพัสดุแล้ว", "Tracking number removed"))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40"
                  >
                    {t("บันทึก", "Save")}
                  </button>
                </div>
                {!!cleanTrackingNo(trackNo) && !trackCarrier && <p className="text-[11px] text-amber-700 mt-1">{t("เลือกขนส่งก่อน — ลูกค้าจะได้กดตามพัสดุได้ถูกเว็บ", "Choose a carrier first — so the customer's tracking link opens the right site")}</p>}
                {open.tracking?.url && (
                  <a href={open.tracking.url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-[11px] text-blue-600 hover:underline">{t("↗ ลองเปิดหน้าตามพัสดุ", "↗ Open tracking page")}</a>
                )}
                {open.status !== "shipped" && open.status !== "completed" && !!open.tracking && <p className="text-[11px] text-slate-400 mt-1">{t("ใส่เลขแล้ว — เปลี่ยนสถานะเป็น “จัดส่งแล้ว” เพื่อแจ้งลูกค้า (ข้อความแนบเลขพัสดุให้เอง)", "Number added — set status to “Shipped” to notify the customer (the message includes the tracking number)")}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("หมายเหตุ (ลูกค้าเห็นตอนตามออเดอร์)", "Note (customer sees it when tracking the order)")}</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder={t("เช่น ส่งพร้อมของแถม / นัดรับหน้าร้าน (เลขพัสดุใส่ช่องด้านบน)", "e.g. includes a free gift / pick up at the store (tracking no. goes above)")}
                  />
                  <button
                    disabled={busy || noteDraft === (open.note ?? "")}
                    onClick={() => void patch(open.id, { note: noteDraft }, t("บันทึกหมายเหตุแล้ว", "Note saved"))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40"
                  >
                    {t("บันทึก", "Save")}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                {t('ออเดอร์ลบไม่ได้ เพราะลูกค้าถือเลขที่นี้อยู่ — ถ้าไม่เอาแล้วให้เปลี่ยนสถานะเป็น "ยกเลิก" (ยังค้นย้อนหลังได้)', 'Orders can\'t be deleted because the customer holds this number — set the status to "Cancelled" instead (still searchable)')}
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
  const t = useT();
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
      if (j.ok) toast.success(j.message || t("ส่งอีเมลแล้ว", "Email sent"));
      else toast.error(j.error || t("ส่งอีเมลไม่สำเร็จ", "Couldn't send email"));
    } catch {
      toast.error(t("ส่งอีเมลไม่สำเร็จ", "Couldn't send email"));
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-500">{t("💬 ข้อความถึงลูกค้า", "💬 Message to customer")}</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${lang === "en" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>{t(`ภาษา${CUSTOMER_LANG_LABEL[lang]}`, lang === "en" ? "English" : "Thai")}</span>
        <select className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs" value={ev} onChange={(e) => setEv(e.target.value as OrderEvent)} aria-label={t("เรื่องที่จะแจ้ง", "Message topic")}>
          {ORDER_EVENTS.map((x) => (
            <option key={x.key} value={x.key}>{EVENT_EN[x.key] ? t(x.label, EVENT_EN[x.key]) : x.label}</option>
          ))}
        </select>
      </div>
      <textarea readOnly value={msg.text} rows={7} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-sans" />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={msg.text} label={t("📋 คัดลอกข้อความ", "📋 Copy message")} />
        <button
          type="button"
          disabled={!canEmail || sending}
          onClick={() => void sendEmail()}
          title={!order.customerEmail ? t("ลูกค้าไม่ได้กรอกอีเมล", "No customer email") : !messaging.emailReady ? t("ยังไม่ได้ตั้งค่าระบบส่งอีเมล", "Email sending not set up") : `${t("ส่งไปที่", "Send to")} ${order.customerEmail}`}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-400 disabled:opacity-40"
        >
          {sending ? t("กำลังส่ง…", "Sending…") : t("✉️ ส่งอีเมล", "✉️ Send email")}
        </button>
        <p className="text-[11px] text-slate-400">
          {!order.customerEmail
            ? t("ลูกค้าไม่ได้กรอกอีเมล — คัดลอกไปส่ง LINE/SMS", "No customer email — copy and send via LINE/SMS")
            : !messaging.emailReady
              ? t("ยังไม่ได้ตั้งระบบส่งอีเมล (Resend) — คัดลอกไปส่งเองได้", "Email (Resend) not set up — copy and send it yourself")
              : messaging.autoEmail
                ? t("อีเมลอัตโนมัติ: เปิด (ส่งเองตอนสั่ง/ชำระ/จัดส่ง/ยกเลิก/คืนเงิน)", "Auto email: on (sent on order/payment/shipping/cancel/refund)")
                : t("อีเมลอัตโนมัติ: ปิด — เปิดได้ที่แท็บ 🏪 ข้อมูลร้าน", "Auto email: off — turn it on in the 🏪 Shop info tab")}
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
