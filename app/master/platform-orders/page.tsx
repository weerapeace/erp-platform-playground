"use client";

// 📦 ศูนย์ออเดอร์ออนไลน์ (เดิม "ออเดอร์จากแพลตฟอร์ม" เฟส 1a) — เจ้าของเลือกหน้าตาจาก widget 2026-11-10 + "Approve, start" เฟส A
//   การ์ดตัวเลขกดกรอง · ตารางเลือกหลายใบ → พิมพ์ใบหยิบรวม/ใบแพ็ก/ใบปะหน้า · แพ็กแล้วทีละหลายใบ · แผงรายละเอียด · ใบกำกับภาษี (ผ่านใบขาย)
//   แท็บ "ต้องจัดการ" ไม่รวมออเดอร์จากเมล (ยอดขายที่ส่งแล้วนอกระบบ → แท็บ "ยอดขายจากเมล" ดูอย่างเดียว)
//   โหมดทดลอง (?demo=1) = ออเดอร์ตัวอย่างหน้าตาแบบ Shopee ไม่บันทึกอะไร — ลองทุกปุ่มได้ระหว่างรอ Shopee อนุมัติ
// ของกลาง: StatFilterCards · MiniTable · Pager · BulkActionBar · Drawer/ERPModal/ConfirmDialog · PlatformBadge · HoverImage · กติกา lib/platform-order-status
//   2026-11-19 (เจ้าของเลือกจาก widget): คอลัมน์ "สินค้า" มีรูป · การ์ด "จองขนส่งแล้ว รอรับ" + จองเสร็จพาไปการ์ดนั้นและติดป้าย "เพิ่งจอง" · ค้นชื่อสินค้า/SKU ได้ · มือถือ = การ์ด

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ERPInput } from "@/components/form";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { ScrollTabs } from "@/components/scroll-tabs";
import { OrderDetailView } from "./order-detail-view";
import { PlatformBadge } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { ErrorState } from "@/components/state-views";
import { HoverImage } from "@/components/hover-image";
import { r2ImageUrl } from "@/lib/r2-image";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatDateTime } from "@/lib/date";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { SHIP_DUE_LABEL, platformStatusLabel, platformStatusWarning, shipDue, type PlatformOrderRow } from "@/lib/platform-order-status";
import { courierLabel, shippopStatusLabel } from "@/lib/shippop";
import { manualChannelLabel } from "@/lib/order-shipping";
import { StatusChip } from "./status-chip";
import { InvoiceModal } from "./invoice-modal";
import { ShipModal } from "./ship-modal";
import { ManualOrderModal } from "./manual-order-modal";
import { ShippingProfileModal } from "./shipping-profile-modal";
import { BrandCards } from "./brand-cards";
import { usePullAll } from "./use-pull-all";
import { MenuBar, type MenuItem } from "@/components/menu-bar";
import { PAYMENT_STATE_META, isUrgentCarrier, paymentState, shortOrderDate, type PlatformBrandCard } from "@/lib/platform-order-status";

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Summary = { unpaid?: number; urgent?: number; by_status: Record<string, number>; todo: number; late: number; today: number; invoice_requested: number; booked?: number; view_total: { todo: number; history: number }; brand_cards?: PlatformBrandCard[] };
// วงกลมแพลตฟอร์มที่ปิดไว้ — จำต่อเครื่อง/ผู้ใช้ (เจ้าของเลือก 2026-11-22 ข้อ 2) · เปิดในโหมดส่วนตัว/ล้างข้อมูลเว็บ = เริ่มใหม่ (เปิดทุกวง)
const OFF_KEY = "platform-orders.off.v1";
const readOff = (): string[] => { try { const v = JSON.parse(localStorage.getItem(OFF_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 40) : []; } catch { return []; } };
const saveOff = (v: string[]) => { try { localStorage.setItem(OFF_KEY, JSON.stringify(v)); } catch { /* เก็บไม่ได้ก็ยังใช้ได้ (แค่ไม่จำ) */ } };
type CardKey = "all" | "todo" | "unpaid" | "urgent" | "late" | "today" | "invoice" | "booked" | "shipped" | "cancelled";
const PAGE_SIZE = 50;

/** การ์ด → ตัวกรองที่ส่งให้ API */
function cardParams(k: CardKey): Record<string, string> {
  switch (k) {
    case "todo": return { active: "1" };
    case "late": return { due: "late" };
    case "today": return { due: "today" };
    case "unpaid": return { unpaid: "1" };
    case "urgent": return { urgent: "1" };
    case "invoice": return { invoice: "requested" };
    case "booked": return { booked: "1" };
    case "shipped": return { status: "shipped" };
    case "cancelled": return { status: "cancelled" };
    default: return {};
  }
}

/** คอลัมน์ "สินค้า": รูป (ชี้ขยาย) + ชื่อ × จำนวน + รหัส · หลายรายการ = "+n รายการ" */
function ProductCell({ o }: { o: PlatformOrderRow }) {
  const f = o.products?.[0];
  if (!f) return <span className="text-slate-300">—</span>;
  const more = Math.max(0, (o.item_count ?? o.products!.length) - 1);
  return (
    <div className="flex min-w-0 items-center gap-2" title={o.products!.map((p) => `${p.name ?? p.sku_code} ×${p.qty}`).join("\n")}>
      <span onClick={(e) => e.stopPropagation()}><HoverImage url={r2ImageUrl(f.image_key, 480)} size={34} previewSize={280} rounded="rounded-md" fallback="" /></span>
      <div className="min-w-0">
        <div className="truncate text-xs text-slate-800">{f.name || f.sku_code || "สินค้า"} <span className="text-slate-500">×{f.qty}</span></div>
        <div className="truncate font-mono text-[11px] text-slate-400">{f.sku_code ?? ""}{more > 0 && <span className="ml-1 font-sans text-slate-500">· +{more} รายการ</span>}</div>
      </div>
    </div>
  );
}

/** ป้ายเอกสารใต้เลขออเดอร์ (แบบ Zort · 2026-11-23): หยิบ · แพ็ก · ปะหน้า · กำกับ — เขียว = พิมพ์/ทำแล้ว */
function DocChips({ o }: { o: PlatformOrderRow }) {
  const d = o.docs ?? { pick: false, pack: !!o.packed_at, label: false };
  const items: [string, boolean, string][] = [["หยิบ", d.pick, "ใบหยิบ"], ["แพ็ก", d.pack, o.packed_at ? "แพ็กเสร็จที่สถานีแพ็ค" : "ใบแพ็ก"], ["ปะหน้า", d.label, "ใบปะหน้า"], ["กำกับ", !!o.invoice_so_id, "ใบกำกับภาษี"]];
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {items.map(([t, on, tip]) => <span key={t} title={`${tip}: ${on ? "ทำแล้ว" : "ยังไม่ทำ"}`} className={`rounded px-1 text-[10px] leading-4 ${on ? "bg-emerald-50 text-emerald-700" : "border border-slate-200 text-slate-300"}`}>{t}</span>)}
    </span>
  );
}
/** ป้ายใต้แถว: ส่งด่วน · ข้อความถึงร้าน */
function OrderTags({ o }: { o: PlatformOrderRow }) {
  const urgent = isUrgentCarrier(o.carrier);
  const opt = o.delivery_option && !/standard/i.test(o.delivery_option) ? o.delivery_option : null;
  if (!urgent && !o.buyer_message && !opt) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
      {urgent && <span className="text-rose-600"><Icon value="i:bolt" className="mr-0.5" />{o.carrier}</span>}
      {opt && <span className="text-rose-600"><Icon value="i:tag" className="mr-0.5" />{opt}</span>}
      {o.buyer_message && <span className="max-w-[220px] truncate text-amber-700" title={o.buyer_message}><Icon value="i:message-circle" className="mr-0.5" />{o.buyer_message}</span>}
    </span>
  );
}
const PAY_TONE: Record<string, string> = { success: "bg-emerald-50 text-emerald-700", warning: "bg-amber-50 text-amber-800", info: "bg-sky-50 text-sky-700", muted: "bg-slate-100 text-slate-500" };
function PayPill({ o }: { o: PlatformOrderRow }) {
  const m = PAYMENT_STATE_META[paymentState(o)];
  return m.label === "—" ? <span className="text-slate-300">—</span> : <span className={`rounded-full px-2 py-0.5 text-[11px] ${PAY_TONE[m.tone]}`}>{m.label}</span>;
}

/** มือถือ: 1 ออเดอร์ = 1 การ์ด */
function OrderCard({ o, fresh, platform }: { o: PlatformOrderRow; fresh: boolean; platform: Platform | null }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-mono text-slate-800">{o.order_no || o.external_order_id || "—"}</span>{fresh && <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">เพิ่งจอง</span>}</span>
        {platform ? <PlatformBadge code={platform.code} name={platform.name_th} iconKey={platform.icon_key} size="xs" /> : <span className="rounded-full border border-slate-200 px-1.5 text-[11px] text-slate-600">{manualChannelLabel(o.channel) || "สร้างเอง"}</span>}
      </div>
      <ProductCell o={o} />
      <div className="flex items-center justify-between gap-2"><DocChips o={o} /><PayPill o={o} /></div>
      <OrderTags o={o} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-slate-500">
        <span className="truncate">{shortOrderDate(o.ordered_at ?? o.created_at)} · {o.customer_name || "—"}{o.total != null ? ` · ${o.total.toLocaleString("th-TH")} ฿` : ""}</span>
        <span className="flex items-center gap-1.5"><StatusChip s={o.status} />{o.shipping_status && o.shipping_status !== "cancel" && <span>{o.shipping_courier ? courierLabel(o.shipping_courier) : "SHIPPOP"}</span>}</span>
      </div>
    </div>
  );
}

function PlatformOrdersInner() {
  const sp = useSearchParams();
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can("platform_orders.manage");
  const fileRef = useRef<HTMLInputElement>(null);

  const [demo, setDemo] = useState(sp.get("demo") === "1");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  // ลิงก์จากหน้าแบรนด์ (/brand-hub): ?brand=<id> → เปิดมาเห็นออเดอร์ของแบรนด์นั้นเลย
  const [brandId, setBrandId] = useState(() => sp.get("brand") ?? "");
  // วงกลมแพลตฟอร์มที่ปิดไว้ (การ์ดแบรนด์) — ส่งเป็น ?off= · โหลดค่าที่จำไว้หลังเปิดหน้า
  const [off, setOffState] = useState<string[]>([]);
  useEffect(() => { setOffState(readOff()); }, []);
  const setOff = useCallback((v: string[]) => { setOffState(v); saveOff(v); }, []);
  const importPlatform = useRef<string>("");   // อัปไฟล์ออเดอร์: แพลตฟอร์มที่เลือกจากเมนู ⋯
  const [view, setView] = useState<"todo" | "history">("todo");
  const [card, setCard] = useState<CardKey>("todo");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlatformOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // กดแถว = เปิดรายละเอียดในแผงข้าง (เจ้าของขอ 2026-11-23) · หน้าเต็มเปิดได้จากหัวแผง/เมนู ⋮
  const [openId, setOpenId] = useState<string | null>(null);
  const openOrder = useCallback((id: string) => setOpenId(id), []);
  const fullUrl = (id: string) => `/master/platform-orders/${encodeURIComponent(id)}`;
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [askPacked, setAskPacked] = useState(false);
  const [shipIds, setShipIds] = useState<string[] | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ttsSyncing, setTtsSyncing] = useState(false);
  const [shpSyncing, setShpSyncing] = useState(false);
  const reqSeq = useRef(0);   // กันคำตอบเก่ามาทับ (สลับร้าน/การ์ดเร็ว ๆ)
  const [justBooked, setJustBooked] = useState<Set<string>>(new Set());   // ออเดอร์ที่เพิ่งจองในรอบนี้ → ติดป้าย "เพิ่งจอง"
  const isPhone = useMediaQuery("(max-width: 640px)");

  useEffect(() => { (async () => {
    try {
      const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
      setPlatforms(((j.platforms ?? []) as Platform[]).filter((p) => isSellingPlatform(p.code)));
      setBrands((j.brands ?? []) as Brand[]);
    } catch { /* ไม่มีรายการร้านก็ยังดูออเดอร์ทั้งหมดได้ */ }
  })(); }, []);

  // คำค้นพิมพ์แล้วรอ 350ms ค่อยค้น
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qInput]);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ view, page: String(page), page_size: String(PAGE_SIZE), ...cardParams(card) });
      if (demo) params.set("demo", "1");
      if (brandId) params.set("brand_id", brandId);
      if (off.length) params.set("off", off.join(","));
      if (q) params.set("q", q);
      const j = await apiFetch(`/api/platform-orders?${params}`).then((r) => r.json());
      if (seq !== reqSeq.current) return;
      if (j.error) { setError(j.error); return; }
      setRows((j.orders ?? []) as PlatformOrderRow[]); setTotal(Number(j.total) || 0); setSummary(j.summary ?? null);
    } catch { if (seq === reqSeq.current) setError("โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { if (seq === reqSeq.current) setLoading(false); }
  }, [view, page, card, demo, brandId, off, q]);
  useEffect(() => { void load(); }, [load]);
  // เปลี่ยนตัวกรอง = กลับหน้าแรก + ล้างที่ติ๊กไว้
  useEffect(() => { setPage(1); setSel(new Set()); }, [view, card, demo, brandId, off]);
  const pull = usePullAll({ canManage: canManage && !demo, onDone: () => void load() });

  const toggleDemo = () => {
    setDemo((d) => {
      const next = !d;
      try { const u = new URL(window.location.href); if (next) u.searchParams.set("demo", "1"); else u.searchParams.delete("demo"); window.history.replaceState(null, "", u.toString()); } catch { /* ignore */ }
      return next;
    });
    setView("todo"); setCard("todo");
  };

  // แท็บแบบ Zort (เจ้าของเลือก 2026-11-23) — แทนการ์ดตัวเลข · ตัวเลขในวงเล็บ = จำนวนในแท็บ
  const tabs: { key: CardKey; label: string; n?: number; tone?: string }[] = useMemo(() => view === "history"
    ? [{ key: "all", label: "ยอดขายจากเมล", n: summary?.view_total.history }, { key: "cancelled", label: "ยกเลิก", n: summary?.by_status.cancelled }]
    : [
      { key: "all", label: "ทั้งหมด", n: summary?.view_total.todo },
      { key: "todo", label: "ต้องจัดส่ง", n: summary?.todo },
      { key: "unpaid", label: "รอชำระ", n: summary?.unpaid },
      { key: "urgent", label: "ส่งด่วน", n: summary?.urgent, tone: "text-rose-600" },
      { key: "late", label: "เลยกำหนดส่ง", n: summary?.late, tone: "text-rose-600" },
      { key: "today", label: "ต้องส่งวันนี้", n: summary?.today, tone: "text-amber-700" },
      { key: "booked", label: "จองขนส่งแล้ว", n: summary?.booked },
      { key: "invoice", label: "ขอใบกำกับ", n: summary?.invoice_requested },
      { key: "shipped", label: "สำเร็จ", n: summary?.by_status.shipped },
      { key: "cancelled", label: "ยกเลิก", n: summary?.by_status.cancelled },
    ], [summary, view]);

  const pf = useMemo(() => new Map(platforms.map((p) => [p.id, p])), [platforms]);
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const rowNo = new Map(rows.map((r, i) => [r.id, (page - 1) * PAGE_SIZE + i + 1]));
  // คอลัมน์แบบ Zort (2026-11-23): # · วันที่ · รายการ (+ป้ายเอกสาร/ส่งด่วน) · สินค้า · ลูกค้า · ช่องทาง · ขนส่ง · มูลค่า · สถานะ · ชำระเงิน · ⋮
  const cols: MiniColumn<PlatformOrderRow>[] = [
    { key: "n", header: "#", width: "2.5rem", align: "center", cell: (o) => <span className="text-[11px] text-slate-400">{rowNo.get(o.id)}</span> },
    { key: "date", header: "วันที่", width: "6.5rem", sortValue: (o) => o.ordered_at ?? o.created_at, cell: (o) => <span className="text-xs text-slate-600" title={formatDateTime(o.ordered_at ?? o.created_at)}>{shortOrderDate(o.ordered_at ?? o.created_at)}</span> },
    { key: "no", header: "รายการ", width: "1.5fr", locked: true, sortValue: (o) => o.order_no ?? "", cell: (o) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs text-sky-700 hover:underline">{o.order_no || o.external_order_id || "—"}</span>
          {justBooked.has(o.id) && <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">เพิ่งจอง</span>}
        </div>
        <DocChips o={o} />
        <OrderTags o={o} />
      </div>
    ) },
    { key: "prod", header: "สินค้า", width: "1.6fr", cell: (o) => <ProductCell o={o} /> },
    { key: "cust", header: "ลูกค้า", width: "0.9fr", cell: (o) => <span className="truncate text-sky-700">{o.customer_name || "—"}</span> },
    { key: "ch", header: "ช่องทาง", width: "1fr", cell: (o) => {
      const p = o.platform_id ? pf.get(o.platform_id) : null;
      return (
        <div className="min-w-0 text-xs">
          {p ? <PlatformBadge code={p.code} name={p.name_th} iconKey={p.icon_key} size="xs" />
            : (o.source === "manual" || (o.source === "demo" && o.channel)) ? <span className="rounded-full border border-slate-200 px-1.5 text-[11px] text-slate-600">{manualChannelLabel(o.channel) || "สร้างเอง"}{o.source === "demo" ? " (ตัวอย่าง)" : ""}</span>
            : o.source === "demo" ? <PlatformBadge code="shopee" name="Shopee (ตัวอย่าง)" size="xs" /> : <span className="text-slate-300">—</span>}
          {o.brand_id && brandName.get(o.brand_id) && <div className="mt-0.5 truncate text-[11px] text-slate-400">{brandName.get(o.brand_id)}</div>}
        </div>
      );
    } },
    { key: "ship", header: "ขนส่ง", width: "1fr", cell: (o) => {
      const d = shipDue(o);
      const booked = o.shipping_status && o.shipping_status !== "cancel";
      return (
        <div className="min-w-0 text-xs">
          <div className="truncate text-slate-700">{booked ? (o.shipping_courier ? courierLabel(o.shipping_courier) : "SHIPPOP") : o.carrier || <span className="text-slate-300">—</span>}{booked && o.shipping_mode === "sim" && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800">จำลอง</span>}</div>
          {o.tracking_no && <div className="truncate font-mono text-[11px] text-slate-400">{o.tracking_no}</div>}
          <div className="mt-0.5 flex flex-wrap gap-1">
            {(o.cod_amount ?? 0) > 0 && <span className="rounded-full bg-sky-50 px-1.5 text-[10px] text-sky-700">COD</span>}
            {o.ship_by_at && (d === "late" || d === "today") && <span className={`rounded px-1.5 text-[10px] ${d === "late" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`} title={`ส่งภายใน ${formatDateTime(o.ship_by_at)}`}>{SHIP_DUE_LABEL[d]}</span>}
            {booked && <span className="text-[10px] text-slate-500">{shippopStatusLabel(o.shipping_status!)}</span>}
          </div>
        </div>
      );
    } },
    { key: "total", header: "มูลค่า", width: "0.7fr", align: "right", sortValue: (o) => o.total ?? -1, cell: (o) => o.total != null ? <span className="tabular-nums">{o.total.toLocaleString("th-TH")}</span> : "—" },
    { key: "st", header: "สถานะ", width: "1.1fr", sortValue: (o) => o.status, cell: (o) => {
      const w = platformStatusWarning(o.platform_status);
      return (
        <div className="flex flex-col items-start gap-0.5">
          <StatusChip s={o.status} />
          {o.platform_status && <span className={`text-[11px] ${w ? "text-amber-700" : "text-slate-400"}`} title={w ?? undefined}>{w ? <Icon name="warning" className="mr-0.5" /> : null}บนร้าน: {platformStatusLabel(o.platform_status)}</span>}
        </div>
      );
    } },
    { key: "pay", header: "ชำระเงิน", width: "6rem", cell: (o) => <PayPill o={o} /> },
    { key: "due", header: "ส่งภายใน", width: "1fr", defaultHidden: true, sortValue: (o) => o.ship_by_at ?? "", cell: (o) => o.ship_by_at ? <span className="text-xs text-slate-700">{formatDateTime(o.ship_by_at)}</span> : <span className="text-slate-300">—</span> },
    { key: "stock", header: "สต๊อก", width: "4.5rem", align: "center", defaultHidden: true, cell: (o) => o.stock_deducted ? <span className="text-emerald-600" title="ตัดสต๊อกแล้ว"><Icon value="i:check" /></span> : <span className="text-slate-300">—</span> },
    { key: "menu", header: "", width: "2.5rem", align: "center", cell: (o) => (
      <span onClick={(e) => e.stopPropagation()}>
        <MenuBar menus={[{ key: "row", label: "ตัวเลือก", icon: "dots-vertical", iconOnly: true, align: "end", width: 220, items: [
          { key: "open", label: "เปิดรายละเอียด", icon: "layout-sidebar-right", onSelect: () => openOrder(o.id) },
          { key: "full", label: "เปิดเต็มหน้า (แท็บใหม่)", icon: "external-link", onSelect: () => window.open(fullUrl(o.id), "_blank", "noopener") },
          { key: "copy", label: "คัดลอกเลขออเดอร์", icon: "copy", onSelect: () => { void navigator.clipboard?.writeText(o.order_no ?? o.external_order_id ?? "").then(() => toast.success("คัดลอกแล้ว"), () => toast.error("คัดลอกไม่ได้")); } },
          { type: "divider", key: "d" },
          { key: "pick", label: "พิมพ์ใบหยิบ", icon: "list-check", onSelect: () => window.open(`/print/platform-orders?kind=pick&ids=${encodeURIComponent(o.id)}`, "_blank", "noopener") },
          { key: "pack", label: "พิมพ์ใบแพ็ก", icon: "package", onSelect: () => window.open(`/print/platform-orders?kind=pack&ids=${encodeURIComponent(o.id)}`, "_blank", "noopener") },
          { key: "label", label: "พิมพ์ใบปะหน้า", icon: "printer", onSelect: () => window.open(`/print/platform-orders?kind=label&ids=${encodeURIComponent(o.id)}`, "_blank", "noopener") },
          ...(o.status !== "cancelled" ? [{ key: "inv", label: o.invoice_so_id ? "ดูใบกำกับภาษี" : "ออกใบกำกับภาษี", icon: "file-invoice", onSelect: () => setInvoiceId(o.id) }] : []),
        ] }]} />
      </span>
    ) },
  ];

  const selIds = [...sel];
  const openPrint = (kind: "pick" | "pack" | "label") => {
    if (!selIds.length) return toast.warning("เลือกออเดอร์ก่อน");
    const u = new URLSearchParams({ kind, ids: selIds.join(",") });
    window.open(`/print/platform-orders?${u}`, "_blank", "noopener");
  };
  const markPacked = async () => {
    setAskPacked(false); setBusy(true);
    try {
      const j = await apiFetch("/api/platform-orders", { method: "PATCH", body: JSON.stringify({ ids: selIds, status: "packed" }) }).then((r) => r.json());
      if (j.error) toast.error(j.error);
      else if (j.demo) toast.info(`โหมดทดลอง — ${j.done} ออเดอร์ (ไม่ได้บันทึกจริง)`);
      else if (j.failed?.length) toast.warning(`แพ็กแล้ว ${j.done} ออเดอร์ · ไม่สำเร็จ ${j.failed.length}: ${j.failed[0].error}`);
      else toast.success(`แพ็กแล้ว ${j.done} ออเดอร์`);
      setSel(new Set()); await load();
    } catch { toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  const importFile = async (file: File) => {
    const platformId = importPlatform.current;
    if (!platformId) { toast.warning("เลือกร้านจากเมนู ⋯ › อัปไฟล์ออเดอร์ ก่อน"); return; }
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const headers = ((aoa[0] ?? []) as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (!headers.length) { toast.error("ไม่พบหัวคอลัมน์ในไฟล์"); return; }
      const data = (aoa.slice(1) as unknown[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== "")).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      const j = await apiFetch("/api/platform-orders/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, headers, rows: data }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(`นำเข้าแล้ว ${j.created} ออเดอร์ (ข้ามซ้ำ ${j.skipped}) · จับคู่สินค้า ${j.matched}/${j.items}`);
      await load();
    } catch (e) { toast.error(`นำเข้าไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ดึงออเดอร์ TikTok 30 วันล่าสุด (อ่านอย่างเดียว · สถานะตามร้าน) — เรียกต่อเองจนครบด้วย page_token
  const syncTiktokOrders = async () => {
    setTtsSyncing(true);
    let token = "", sum = { fetched: 0, created: 0, updated: 0, items_matched: 0, items_created: 0 }, total = 0;
    try {
      for (let round = 0; round < 40; round++) {
        type R = { error?: string | null; api_total?: number; fetched?: number; created?: number; updated?: number; items_matched?: number; items_created?: number; next_page_token?: string | null; done?: boolean; stop_reason?: string | null };
        const j = await apiFetch("/api/tiktok-shop/sync-orders", { method: "POST", body: JSON.stringify({ brand_id: brandId || undefined, days: 30, page_token: token || undefined }) })
          .then((r) => r.json()).catch(() => ({ error: "ระบบตอบผิดพลาด กรุณาลองใหม่" })) as R;
        if (j.error) { toast.error(j.error); break; }
        if (j.api_total) total = j.api_total;
        sum = { fetched: sum.fetched + (j.fetched ?? 0), created: sum.created + (j.created ?? 0), updated: sum.updated + (j.updated ?? 0), items_matched: sum.items_matched + (j.items_matched ?? 0), items_created: sum.items_created + (j.items_created ?? 0) };
        if (j.done) { toast.success(`ดึงออเดอร์ TikTok 30 วันครบแล้ว (${total.toLocaleString("th-TH")} ใบ) · ใหม่ ${sum.created} · อัปเดตสถานะ ${sum.updated} · จับคู่สินค้า ${sum.items_matched}/${sum.items_created}${j.stop_reason ? ` · ⚠️ ${j.stop_reason}` : ""}`); break; }
        if (j.stop_reason || !j.next_page_token) { toast.warning(`ดึงได้ ${sum.fetched} ใบแล้วหยุด: ${j.stop_reason ?? "ไม่มีหน้าถัดไป"} — กดดึงอีกครั้งได้ (ใบที่ได้แล้วไม่ซ้ำ)`); break; }
        token = j.next_page_token;
      }
      await load();
    } finally { setTtsSyncing(false); }
  };

  // ดึงออเดอร์ Shopee 30 วันล่าสุด (อ่านอย่างเดียว · สถานะตามร้าน) — Shopee ให้ถามทีละ ≤15 วัน → server ไล่ช่วง + หน้า แล้วส่งจุดต่อ (next) กลับมา
  //   ใบที่เคยมาจากเมล (เลขเดียวกัน) ถูกอัปเดตเป็นสถานะจริงจาก Shopee (เจ้าของเลือก 2026-11-14) · ปกติไม่ต้องกด — ระบบดึงเองทุก 15 นาที
  const syncShopeeOrders = async () => {
    setShpSyncing(true);
    let next: { wi: number; cursor: string; anchor: number } | null = null;
    let sum = { fetched: 0, created: 0, updated: 0, from_email: 0, items_matched: 0, items_created: 0 };
    try {
      for (let round = 0; round < 40; round++) {
        type R = { error?: string | null; fetched?: number; created?: number; updated?: number; from_email?: number; items_matched?: number; items_created?: number; next?: { wi: number; cursor: string; anchor: number } | null; done?: boolean; stop_reason?: string | null };
        const j = await apiFetch("/api/shopee/sync-orders", { method: "POST", body: JSON.stringify({ brand_id: brandId || undefined, days: 30, ...(next ?? {}) }) })
          .then((r) => r.json()).catch(() => ({ error: "ระบบตอบผิดพลาด กรุณาลองใหม่" })) as R;
        if (j.error) { toast.error(j.error); break; }
        sum = { fetched: sum.fetched + (j.fetched ?? 0), created: sum.created + (j.created ?? 0), updated: sum.updated + (j.updated ?? 0), from_email: sum.from_email + (j.from_email ?? 0), items_matched: sum.items_matched + (j.items_matched ?? 0), items_created: sum.items_created + (j.items_created ?? 0) };
        if (j.done) { toast.success(`ดึงออเดอร์ Shopee 30 วันครบแล้ว (${sum.fetched.toLocaleString("th-TH")} ใบ) · ใหม่ ${sum.created} · อัปเดตสถานะ ${sum.updated}${sum.from_email ? ` (ใบจากเมล ${sum.from_email})` : ""} · จับคู่สินค้า ${sum.items_matched}/${sum.items_created}${j.stop_reason ? ` · ⚠️ ${j.stop_reason}` : ""}`); break; }
        if (j.stop_reason || !j.next) { toast.warning(`ดึงได้ ${sum.fetched} ใบแล้วหยุด: ${j.stop_reason ?? "ไม่มีหน้าถัดไป"} — กดดึงอีกครั้งได้ (ใบที่ได้แล้วไม่ซ้ำ)`); break; }
        next = j.next;
      }
      await load();
    } finally { setShpSyncing(false); }
  };

  // เมนู ⋯ (ปุ่มรอง · เจ้าของเลือก 2026-11-22 ข้อ 4)
  const uploadPlatforms = platforms.filter((p) => p.code !== "website");
  const moreItems: MenuItem[] = [
    ...(canManage && !demo ? [
      { type: "section" as const, key: "s-pull", label: "ดึงย้อนหลัง 30 วัน" },
      { key: "tts", label: ttsSyncing ? "กำลังดึง TikTok…" : "ดึงออเดอร์ TikTok 30 วัน", icon: "refresh", disabled: ttsSyncing, onSelect: () => void syncTiktokOrders() },
      { key: "shp", label: shpSyncing ? "กำลังดึง Shopee…" : "ดึงออเดอร์ Shopee 30 วัน", icon: "refresh", disabled: shpSyncing, onSelect: () => void syncShopeeOrders() },
      { type: "submenu" as const, key: "upload", label: importing ? "กำลังนำเข้า…" : "อัปไฟล์ออเดอร์ (Excel/CSV)", icon: "upload", disabled: importing,
        items: uploadPlatforms.length
          ? uploadPlatforms.map((p) => ({ key: `up-${p.id}`, label: p.name_th, onSelect: () => { importPlatform.current = p.id; fileRef.current?.click(); } }))
          : [{ key: "up-none", label: "ยังไม่มีร้าน", disabled: true }] },
      { type: "divider" as const, key: "d1" },
    ] : []),
    { key: "ship", label: "ตั้งค่าการส่ง", icon: "settings", onSelect: () => setShowProfile(true) },
    { type: "toggle", key: "demo", label: "โหมดทดลอง", icon: "flask", on: demo, onSelect: toggleDemo },
  ];

  const viewTab = (k: "todo" | "history", label: string, n: number | undefined) => (
    <button type="button" onClick={() => { setView(k); setCard(k === "todo" ? "todo" : "all"); }}
      className={`h-9 rounded-lg border px-3 text-sm ${view === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {label}{n != null ? <span className="ml-1.5 opacity-70">{n.toLocaleString("th-TH")}</span> : null}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900"><Icon value="i:truck-delivery" className="mr-1.5" />ศูนย์ออเดอร์ออนไลน์</h1>
          <p className="mt-0.5 text-sm text-slate-500">ออเดอร์จากทุกร้านในที่เดียว · เลือกหลายใบแล้วพิมพ์ใบหยิบ/ใบแพ็ก/ใบปะหน้า · ออกใบกำกับภาษีได้จากออเดอร์</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 2026-11-22 เจ้าของเลือก widget: ปุ่มหลัก 3 ปุ่ม (ดึงทุกร้าน · สถานะดึง+ไฟสถานะ · สร้างออเดอร์) + ปุ่มรองรวมในเมนู ⋯ */}
          {pull.pullButton}
          {!demo && (
            <Link href="/master/platform-orders/pull-status" title="ดูว่าแต่ละร้านดึงออเดอร์อัตโนมัติปกติไหม · ไฟสี = ร้านที่แย่สุดตอนนี้"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              {pull.statusDot}สถานะดึงออเดอร์
            </Link>
          )}
          {canManage && !demo && <button type="button" onClick={() => setShowManual(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:plus" />สร้างออเดอร์</button>}
          {demo && (
            <button type="button" onClick={toggleDemo} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-800"><Icon value="i:flask" />ออกจากโหมดทดลอง</button>
          )}
          <MenuBar menus={[{ key: "more", label: "เมนูเพิ่มเติม", icon: "dots-vertical", iconOnly: true, align: "end", width: 260, items: moreItems }]} />
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        </div>
      </div>

      {demo && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">โหมดทดลอง — ออเดอร์ตัวอย่างหน้าตาแบบ Shopee กดได้ทุกปุ่ม แต่ไม่บันทึกอะไรและไม่ส่งอะไรขึ้นร้าน</p>}
      {pull.progress}
      {(importing || ttsSyncing || shpSyncing) && <div className="mb-3 text-xs text-slate-500"><Icon value="i:refresh" className="mr-1" />{importing ? "กำลังนำเข้าไฟล์ออเดอร์…" : ttsSyncing ? "กำลังดึงออเดอร์ TikTok 30 วัน…" : "กำลังดึงออเดอร์ Shopee 30 วัน…"}</div>}

      {!demo && <BrandCards cards={summary?.brand_cards ?? []} platforms={pf} brandId={brandId} onBrand={setBrandId} off={off} onOff={setOff} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!demo && viewTab("todo", "ต้องจัดการ", summary?.view_total.todo)}
        {/* E2 (เจ้าของเลือก 2026-11-22): แท็บนี้โชว์เฉพาะร้านที่ยังไม่ได้ดึงจาก API (ตอนนี้ IG International · Shopee) — ร้านที่เชื่อม API แล้วซ่อนยอดจากเมล */}
        {!demo && viewTab("history", "ยอดขายจากเมล", summary?.view_total.history)}
        <div className="min-w-[180px] flex-1"><ERPInput value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="ค้นเลขออเดอร์ ชื่อลูกค้า หรือชื่อสินค้า/รหัส SKU" leftIcon={<Icon value="i:search" />} /></div>
      </div>

      <ScrollTabs activeKey={card} className="mb-3 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} type="button" data-tab-key={t.key} onClick={() => setCard(t.key)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${card === t.key ? "border-sky-600 font-medium text-sky-700" : `border-transparent hover:text-slate-800 ${t.tone ?? "text-slate-500"}`}`}>
            {t.label}{t.n != null ? <span className="ml-1 tabular-nums opacity-80">({t.n.toLocaleString("th-TH")})</span> : null}
          </button>
        ))}
      </ScrollTabs>

      {view === "history" && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><Icon value="i:mail" className="mr-1" />ยอดขายที่อ่านจากอีเมลแจ้งของ Shopee/Lazada — ร้านส่งของไปแล้วผ่าน Seller Centre จึงดูได้อย่างเดียว (ไม่นับเป็นงานที่ต้องจัดส่ง ไม่ตัดสต๊อกจากหน้านี้)</p>}

      {error ? <ErrorState title={error} onRetry={() => void load()} /> : (
        <MiniTable rows={rows} columns={cols} rowKey={(o) => o.id} hideSearch dense countUnit="ออเดอร์"
          layout={isPhone ? "cards" : "table"} renderCard={(o) => <OrderCard o={o} fresh={justBooked.has(o.id)} platform={o.platform_id ? pf.get(o.platform_id) ?? null : null} />}
          selectable={view === "todo"} selected={sel} onSelectedChange={setSel} onRowClick={(o) => openOrder(o.id)}
          emptyText={loading ? "กำลังโหลด…" : card === "todo" && view === "todo" && !demo ? "ไม่มีออเดอร์ที่ต้องจัดส่ง — ออเดอร์จะเข้ามาเองเมื่อเชื่อม Shopee แล้ว (ลองกด โหมดทดลอง เพื่อดูตัวอย่าง)" : "ไม่มีออเดอร์ในกลุ่มนี้"} />
      )}
      {/* Pager นับหน้าเริ่ม 0 · state ในหน้านี้ (และ API) เริ่ม 1 */}
      <div className="mt-3"><Pager page={page - 1} pageSize={PAGE_SIZE} total={total} onPage={(p) => setPage(p + 1)} unitLabel="ออเดอร์" loading={loading} hideWhenSingle /></div>

      {sel.size > 0 && view === "todo" && (
        <BulkActionBar count={sel.size} unit="ออเดอร์" onClear={() => setSel(new Set())}>
          <button type="button" onClick={() => openPrint("pick")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:list-check" />ใบหยิบรวม</button>
          <button type="button" onClick={() => openPrint("pack")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:package" />ใบแพ็ก</button>
          <button type="button" onClick={() => openPrint("label")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:printer" />ใบปะหน้า</button>
          {canManage && <button type="button" onClick={() => setAskPacked(true)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-800 disabled:opacity-50"><Icon value="i:box" />แพ็กแล้ว</button>}
          {canManage && <button type="button" onClick={() => setShipIds(selIds)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" title="เทียบราคาขนส่ง → เรียกเข้ารับ (ออเดอร์ช่องทางของเรา · ออเดอร์แพลตฟอร์มใช้ขนส่งของแพลตฟอร์ม)"><Icon value="i:truck" />จัดส่ง</button>}
        </BulkActionBar>
      )}

      {shipIds && <ShipModal ids={shipIds} onClose={() => setShipIds(null)} onBooked={(ids) => { setSel(new Set()); setJustBooked(new Set(ids)); setView("todo"); if (card === "booked") void load(); else setCard("booked"); }} onOpenSettings={() => { setShipIds(null); setShowProfile(true); }} />}
      {showManual && <ManualOrderModal brands={brands} defaultBrandId={brandId} onClose={() => setShowManual(false)} onCreated={(id) => { setShowManual(false); openOrder(id); }} />}
      {showProfile && <ShippingProfileModal brands={brands} defaultBrandId={brandId} canManage={canManage} onClose={() => setShowProfile(false)} />}

      {openId && (
        <Drawer open onClose={() => setOpenId(null)} size="xl" storageKey="platform-order-detail"
          title={rows.find((r) => r.id === openId)?.order_no ?? "รายละเอียดออเดอร์"}
          headerActions={() => <a href={fullUrl(openId)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50" title="เปิดเต็มหน้าในแท็บใหม่ (ลิงก์ส่งต่อได้)"><Icon value="i:external-link" />เต็มหน้า</a>}>
          <OrderDetailView key={openId} id={openId} layout="drawer" onChanged={() => void load()} />
        </Drawer>
      )}
      {invoiceId && <InvoiceModal orderId={invoiceId} canManage={canManage} onClose={() => setInvoiceId(null)} onIssued={() => void load()} />}
      <ConfirmDialog open={askPacked} onClose={() => setAskPacked(false)} onConfirm={() => void markPacked()} loading={busy}
        title={`ทำเครื่องหมาย "แพ็กแล้ว" ${sel.size} ออเดอร์?`} message="ออเดอร์ที่ส่งแล้ว/ยกเลิกแล้ว หรือมาจากอีเมล จะถูกข้าม (ระบบแจ้งจำนวนที่ไม่สำเร็จ)" confirmText="แพ็กแล้ว" />
    </div>
  );
}

export default function PlatformOrdersPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PlatformOrdersInner /></Suspense>;
}
