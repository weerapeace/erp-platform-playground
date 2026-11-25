"use client";

// ============================================================
// 💌 การ์ดของขวัญ + งานเข้าจากหมายเหตุ/สินค้าสลัก — ชิ้นส่วนของหน้า "คำสั่งพิเศษ & การ์ด" (/order-ops/instructions)
// รวมเมนู เขียนการ์ดของขวัญ + คำสั่งพิเศษ เป็นหน้าเดียว (เจ้าของเลือก widget 2026-11-25 ข้อ 1-5) · /order-ops/gift-cards = พาไปหน้ารวม
// GiftInbox = ส่วน "งานเข้า" (การ์ด/สลักชื่อ/สลักไม่มีชื่อ/อื่น ๆ) · GiftCardsList = "การ์ดทั้งหมด" · GiftTemplates = "ตั้งค่า" (แม่แบบ+ฟอนต์)
// แท็บสลักชื่อดูจากสินค้า (lib/order-ops engraveOfOrder) · กดแถวเปิด OrderDetailView ของศูนย์ออเดอร์
// API /api/order-gift-cards · กติกา lib/gift-card-design · ตัวออกแบบ components/card-designer · คู่มือ docs/order-gift-cards.md
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePermission } from "@/components/auth";
import { ErrorState, LoadingState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { PlatformBadge } from "@/components/platform-icon";
import { Popover } from "@/components/popover";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { Drawer, ERPModal } from "@/components/modal";
import { CopyButton } from "@/components/copy-button";
import dynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CardPreview, useCardFonts, type UploadedFont } from "@/components/card-designer";
import { apiFetch } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatDateTime } from "@/lib/date";
import { acceptsMessage, cardStatus, extractEngraveText, foldLine, groupTemplates, isFolded, type CardDoc } from "@/lib/gift-card-design";
import { ENGRAVE_MODE_LABEL, ENGRAVE_SOURCE_LABEL, type EngraveMode, type EngraveSource } from "@/lib/order-ops";

// ลิ้นชักรายละเอียดออเดอร์ (ของศูนย์ออเดอร์) หนัก — โหลดเฉพาะตอนกดเปิดแถว
const OrderDetailView = dynamic(() => import("@/app/master/platform-orders/order-detail-view").then((m) => m.OrderDetailView), { ssr: false, loading: () => <LoadingState /> });

type CardMini = { id: string; message: string | null; printed_at: string | null; hand_written_at: string | null; updated_at: string };
type NoteRow = {
  id: string; order_no: string | null; customer_name: string | null; status: string | null; ordered_at: string | null; ship_by_at: string | null; packed_at: string | null;
  platform: string | null; platform_code: string | null; brand_id: string | null; brand_name: string | null; note: string | null;
  kind: { card: boolean; engrave: boolean }; kind_auto: { card: boolean; engrave: boolean }; overridden: boolean;
  cards: CardMini[]; instructions: { id: string; status: string; engrave: boolean }[];
  /** สินค้าสลักชื่อในออเดอร์ (กติกากลาง lib/order-ops engraveOfOrder) */
  engrave: { sources: EngraveSource[]; items: { sku_code: string | null; name: string | null; qty: number; parent_code: string | null; mode: EngraveMode | null; decoded: { type: string | null; position: string | null } | null }[]; needs_name: boolean };
  parents: { id: string; code: string | null; mode: EngraveMode | null }[];
  chat_ready: boolean;
};
type Counts = { card: number; card_todo: number; engrave: number; engrave_missing: number; other: number; cards: number };
type CardRow = { id: string; platform_order_id: string | null; order_no: string | null; platform: string | null; brand_name: string | null; customer_note: string | null; message: string | null; note: string | null; print_count: number; printed_at: string | null; printed_by_name: string | null; hand_written_at: string | null; updated_at: string; updated_by_name: string | null; deleted_at: string | null };
type Tpl = { id: string; name: string; brand_id: string | null; doc: CardDoc; is_default: boolean; builtin: boolean; group?: string | null; sort_order?: number; replaces_builtin?: string | null; updated_at: string | null; updated_by_name: string | null; deleted_at: string | null };
type Tab = "card" | "engrave" | "engrave_missing" | "other" | "cards" | "templates";

async function gcJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j;
}
const fmt = (s: string | null) => (s ? formatDateTime(s) : "—");
const TONE = { danger: "bg-rose-50 text-rose-700", accent: "bg-sky-50 text-sky-700", success: "bg-emerald-50 text-emerald-700" } as const;
function StatusPill({ c }: { c: { printed_at?: string | null; hand_written_at?: string | null } | null }) {
  const s = cardStatus(c);
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[s.tone]}`}>{s.label}</span>;
}

/** ส่วน "งานเข้า" ของหน้า คำสั่งพิเศษ & การ์ด — ออเดอร์ที่มีหมายเหตุ/สินค้าสลัก แยกแท็บย่อย */
export type GiftInboxTab = "card" | "engrave" | "engrave_missing" | "other";
export const GIFT_INBOX_TABS: GiftInboxTab[] = ["card", "engrave", "engrave_missing", "other"];
export type GiftCounts = Partial<Counts> & { engrave_todo?: number };

export function GiftInbox({ tab, onTab, onCounts }: { tab: GiftInboxTab; onTab: (t: GiftInboxTab) => void; onCounts?: (c: GiftCounts) => void }) {
  const [counts, setCounts] = useState<GiftCounts>({});
  const onCountsRef = useRef(onCounts); onCountsRef.current = onCounts;
  return (
    <>
      <StatFilterCards
        className="mb-3"
        value={tab}
        onChange={(k) => onTab(k as GiftInboxTab)}
        showZero
        cards={[
          { key: "card", label: "การ์ด / ห่อของขวัญ", value: counts.card ?? null, tone: "danger", icon: <Icon value="i:gift-card" />, hint: counts.card_todo != null ? `ยังไม่ทำ ${counts.card_todo}` : undefined, keep: true },
          { key: "engrave", label: "สลักชื่อ", value: counts.engrave ?? null, icon: <Icon value="i:pencil" />, hint: counts.engrave_todo != null ? `ยังไม่ส่งไปสั่งสลัก ${counts.engrave_todo}` : "ดูจากสินค้า + หมายเหตุ", keep: true },
          { key: "engrave_missing", label: "สลัก แต่ไม่มีชื่อ", value: counts.engrave_missing ?? null, tone: "danger", icon: <Icon value="i:alert-triangle" />, hint: "ต้องทักลูกค้า", keep: true },
          { key: "other", label: "หมายเหตุอื่น ๆ", value: counts.other ?? null, icon: <Icon value="i:message-circle" />, keep: true },
        ]}
      />
      <NotesList tab={tab} onCounts={(c) => { setCounts((x) => ({ ...x, ...c })); onCountsRef.current?.(c); }} />
    </>
  );
}

// ───────────── ออเดอร์ที่มีหมายเหตุ / สินค้าสลักชื่อ ─────────────

const SELLER_CHAT: Record<string, { label: string; href: string }> = {
  shopee: { label: "เปิดแชทใน Shopee Seller Centre", href: "https://seller.shopee.co.th/webchat/conversations" },
  tiktok: { label: "เปิด TikTok Seller Center", href: "https://seller-th.tiktok.com/" },
  lazada: { label: "เปิด Lazada Seller Center", href: "https://sellercenter.lazada.co.th/" },
};

function EngraveItems({ r, compact = false }: { r: NoteRow; compact?: boolean }) {
  const its = r.engrave.items;
  return (
    <div className="flex flex-col items-start gap-1">
      {its.length === 0 && <span className="text-[12px] text-slate-400">ดูจากหมายเหตุ</span>}
      {its.slice(0, compact ? 2 : 4).map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1">
          <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
            {it.decoded ? ["สลัก", it.decoded.type, it.decoded.position].filter(Boolean).join(" · ") : "สลักชื่อ"}
          </span>
          <span className="font-mono text-[11px] text-slate-500">{it.sku_code ?? it.parent_code ?? ""}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
        </div>
      ))}
      {its.length > (compact ? 2 : 4) && <span className="text-[11px] text-slate-400">+{its.length - (compact ? 2 : 4)} รายการ</span>}
      <div className="flex flex-wrap gap-1">
        {r.engrave.sources.map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{ENGRAVE_SOURCE_LABEL[s]}</span>)}
      </div>
    </div>
  );
}

function NoteCell({ r, isEng }: { r: NoteRow; isEng: boolean }) {
  if (isEng && r.engrave.needs_name) return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[12px] font-medium text-rose-700"><Icon value="i:alert-triangle" /> ลูกค้าไม่บอกชื่อที่จะสลัก</span>;
  if (!r.note) return <span className="text-[12px] text-slate-400">ไม่มีหมายเหตุ{r.status === "shipped" ? " (ส่งแล้ว)" : r.status === "cancelled" ? " (ยกเลิก)" : ""}</span>;
  return <span className="whitespace-pre-line text-[13px] text-amber-900">{r.note}</span>;
}

function NotesList({ tab, onCounts }: { tab: "card" | "engrave" | "engrave_missing" | "other"; onCounts: (c: Partial<Counts>) => void }) {
  const toast = useToast();
  const router = useRouter();
  const canEdit = usePermission("order_ops.edit");
  const canManage = usePermission("order_ops.manage");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isEng = tab === "engrave" || tab === "engrave_missing";
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [suggest, setSuggest] = useState<{ id: string; code: string | null; name: string | null }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatFor, setChatFor] = useState<NoteRow | null>(null);
  const onCountsRef = useRef(onCounts); onCountsRef.current = onCounts;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await gcJson<{ rows: NoteRow[]; counts: Counts; suggest?: { id: string; code: string | null; name: string | null }[] }>(`/api/order-gift-cards?view=notes&tab=${tab}&days=${days}`);
      setRows(j.rows); setSuggest(j.suggest ?? []); onCountsRef.current(j.counts);
    } catch (e) { setErr((e as Error).message); }
  }, [tab, days]);
  useEffect(() => { setRows(null); setSel(new Set()); void load(); }, [load]);

  const setKind = async (r: NoteRow, next: { card: boolean; engrave: boolean } | null) => {
    try {
      await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify(next ? { action: "kind", order_id: r.id, ...next } : { action: "kind", order_id: r.id, reset: true }) });
      toast.success(next ? "ย้ายแท็บแล้ว" : "กลับไปใช้ที่ระบบเดาแล้ว");
      void load();
    } catch (e) { toast.error((e as Error).message); }
  };
  // ตั้ง "สินค้าสลักชื่อ" ของรุ่น (ช่องเดียวกับ Parent SKU › รายละเอียด Platform) + ย้อนกลับได้จากแจ้งผลมุมจอ
  const setEngraveMode = async (p: { id: string; code: string | null }, mode: EngraveMode | null) => {
    try {
      const j = await gcJson<{ before: EngraveMode | null }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "engrave_mode", parent_id: p.id, mode }) });
      void load();
      toast.undo(`ตั้งรุ่น ${p.code ?? ""} เป็น "${mode ? ENGRAVE_MODE_LABEL[mode] : "ยังไม่ตั้ง"}" แล้ว`, async () => {
        await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "engrave_mode", parent_id: p.id, mode: j.before }) });
        void load();
      });
    } catch (e) { toast.error((e as Error).message); }
  };
  const sendEngrave = async (r: NoteRow) => {
    const text = extractEngraveText(r.note);
    const ok = await askConfirm({ title: "ส่งไปคำสั่งสลักชื่อ?", message: `สร้างคำสั่งสลักชื่อของออเดอร์ ${r.order_no ?? ""}${text ? ` · ชื่อที่จะสลัก: "${text}"` : " · ยังไม่มีชื่อที่จะสลัก (ไปใส่ทีหลังได้)"} · ไปแก้รูปแบบ/ตำแหน่ง/ลบได้ที่หน้าคำสั่งพิเศษ`, confirmText: "ส่งไปคำสั่งสลักชื่อ" });
    if (!ok) return;
    try {
      await gcJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", order_no: r.order_no, platform: r.platform, customer_name: r.customer_name, platform_order_id: r.id, engrave: true, engrave_text: text || null, note: r.note?.slice(0, 500) ?? null, commands: [] }) });
      toast.success("สร้างคำสั่งสลักชื่อแล้ว");
      void load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const printSelected = () => {
    const ids = (rows ?? []).filter((r) => sel.has(r.id)).flatMap((r) => r.cards.map((c) => c.id));
    if (!ids.length) { toast.error("ออเดอร์ที่เลือกยังไม่มีการ์ด — กดเขียนการ์ดก่อน"); return; }
    router.push(`/print/order-gift-cards?ids=${ids.join(",")}`);
  };
  const writeHref = (r: NoteRow) => (r.cards[0] ? `/order-ops/gift-cards/edit?id=${r.cards[0].id}` : `/order-ops/gift-cards/edit?order=${r.id}`);

  const kindMenu = (r: NoteRow) => (
    <Popover align="right" panelClassName="w-72 p-2 text-[13px]" trigger={(toggle) => <button type="button" onClick={toggle} title="ย้ายแท็บ / ตั้งสินค้าสลักชื่อ" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><Icon value="i:dots-vertical" /></button>}>
      {(close) => (
        <div className="space-y-1">
          <div className="px-1 text-[11px] text-slate-400">ออเดอร์นี้อยู่แท็บไหน {r.overridden ? "(แก้เองแล้ว)" : "(ระบบเดา)"}</div>
          {([["card", "การ์ด / ห่อของขวัญ"], ["engrave", "สลักชื่อ"]] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <input type="checkbox" checked={r.kind[k]} disabled={!canEdit} onChange={(e) => { void setKind(r, { ...r.kind, [k]: e.target.checked }); close(); }} /> {l}
            </label>))}
          {r.overridden && canEdit && <button type="button" onClick={() => { void setKind(r, null); close(); }} className="w-full rounded px-1 py-1 text-left text-sky-700 hover:bg-slate-50">ให้ระบบเดาเหมือนเดิม</button>}
          {canManage && r.parents.length > 0 && (
            <div className="mt-1 border-t border-slate-100 pt-1.5">
              <div className="px-1 pb-1 text-[11px] text-slate-400">ตั้งรุ่นสินค้าเป็นสินค้าสลักชื่อ (มีผลทุกออเดอร์ของรุ่นนี้)</div>
              {r.parents.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5 px-1 py-0.5">
                  <a href={`/master/parent-skus?open=${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer" className="w-16 shrink-0 truncate font-mono text-[12px] text-slate-700 hover:underline" title="เปิด Parent SKU">{p.code ?? "รุ่น"}</a>
                  <select value={p.mode ?? ""} onChange={(e) => { void setEngraveMode(p, (e.target.value || null) as EngraveMode | null); close(); }} className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-1 text-[12px]" aria-label={`สินค้าสลักชื่อ ${p.code ?? ""}`}>
                    <option value="">ยังไม่ตั้ง</option>
                    {(Object.keys(ENGRAVE_MODE_LABEL) as EngraveMode[]).map((m) => <option key={m} value={m}>{ENGRAVE_MODE_LABEL[m]}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
  const actions = (r: NoteRow) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {isEng && r.engrave.needs_name && <button type="button" onClick={() => setChatFor(r)} className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-white px-2 text-[12px] font-medium text-rose-700 hover:bg-rose-50"><Icon value="i:message-circle" /> ทักแชทลูกค้า</button>}
      {isEng ? (
        r.instructions.some((i) => i.engrave)
          ? (() => { const ins = r.instructions.find((i) => i.engrave); return <Link href={`/order-ops/instructions?s=orders&q=${encodeURIComponent(r.order_no ?? "")}&open=${ins?.id ?? ""}`} className="text-[12px] text-emerald-700 hover:underline">มีคำสั่งสลักแล้ว ({ins?.status === "done" ? "เสร็จ" : "ยังไม่ทำ"}) →</Link>; })()
          : canEdit && <button type="button" onClick={() => void sendEngrave(r)} className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100"><Icon value="i:send" /> ส่งไปสั่งสลัก</button>
      ) : canEdit && (
        <Link href={writeHref(r)} className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-600 px-2.5 text-[12px] font-medium text-white hover:bg-violet-700"><Icon value="i:pencil" /> {r.cards.length ? "ดู / แก้การ์ด" : "เขียนการ์ด"}</Link>
      )}
      {kindMenu(r)}
    </div>
  );

  const shopCol: MiniColumn<NoteRow> = { key: "platform", header: "ร้าน", width: "7rem", cell: (r) => <div className="flex flex-col items-start gap-0.5"><PlatformBadge code={r.platform_code} name={r.platform} size="xs" />{r.brand_name && <span className="text-[11px] text-slate-400">{r.brand_name}</span>}</div>, sortValue: (r) => r.platform ?? "" };
  const orderCol: MiniColumn<NoteRow> = { key: "order", header: "ออเดอร์", width: "11rem", cell: (r) => <div><span className="font-mono text-[12px] text-slate-800">{r.order_no}</span><div className="text-[11px] text-slate-400">{fmt(r.ordered_at)}{r.packed_at ? " · แพ็กแล้ว" : ""}</div></div>, sortValue: (r) => r.ordered_at ?? "" };
  const cols: MiniColumn<NoteRow>[] = isEng ? [
    shopCol, orderCol,
    { key: "items", header: "สินค้าสลัก", width: "minmax(11rem,1.3fr)", cell: (r) => <EngraveItems r={r} /> },
    { key: "note", header: "ชื่อที่จะสลัก (หมายเหตุ)", width: "minmax(12rem,1.6fr)", cell: (r) => <NoteCell r={r} isEng />, sortValue: (r) => (r.engrave.needs_name ? "0" : "1") },
    { key: "status", header: "สถานะ", width: "6rem", cell: (r) => (r.instructions.some((i) => i.engrave) ? <span className="text-[12px] text-emerald-700">ส่งแล้ว</span> : <span className="text-[12px] text-slate-400">ยังไม่ส่ง</span>) },
    { key: "act", header: "", width: "15rem", align: "right", cell: actions, noExport: true },
  ] : [
    shopCol, orderCol,
    { key: "note", header: "ข้อความลูกค้า", width: "minmax(14rem,2fr)", cell: (r) => <NoteCell r={r} isEng={false} /> },
    { key: "status", header: "สถานะ", width: "7rem", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusPill c={r.cards[0] ?? null} />{r.cards.length > 1 && <span className="text-[11px] text-slate-400">{r.cards.length} ใบ</span>}</div>, sortValue: (r) => cardStatus(r.cards[0] ?? null).key },
    { key: "act", header: "", width: "13rem", align: "right", cell: actions, noExport: true },
  ];

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!rows) return <LoadingState />;
  const openRow = openId ? rows.find((r) => r.id === openId) : null;
  return (
    <>
      {isEng && suggest.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[13px] text-amber-900">
          <div className="flex items-start gap-1.5"><Icon value="i:bulb" /><span>พบ {suggest.length} รุ่นที่ชื่อมีคำว่า &quot;สลัก&quot; แต่ยังไม่ได้ตั้งเป็นสินค้าสลักชื่อ — ตั้งที่ Parent SKU › รายละเอียด Platform › <b>สินค้าสลักชื่อ</b> (ระบบไม่ตั้งให้เอง)</span></div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggest.map((s) => <a key={s.id} href={`/master/parent-skus?open=${encodeURIComponent(s.id)}`} target="_blank" rel="noopener noreferrer" title={s.name ?? ""} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-mono text-[12px] text-amber-800 hover:bg-amber-100">{s.code ?? "รุ่น"}</a>)}
          </div>
        </div>
      )}
      <MiniTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={cols}
        searchText={(r) => `${r.order_no ?? ""} ${r.note ?? ""} ${r.customer_name ?? ""} ${r.platform ?? ""} ${r.engrave.items.map((i) => i.sku_code ?? "").join(" ")}`}
        searchPlaceholder={isEng ? "ค้นเลขออเดอร์ / ชื่อที่จะสลัก / รหัสสินค้า" : "ค้นเลขออเดอร์ / ข้อความลูกค้า"}
        selectable={tab === "card"}
        selected={sel}
        onSelectedChange={setSel}
        onRowClick={(r) => setOpenId(r.id)}
        countUnit="ออเดอร์"
        layout={isMobile ? "cards" : "table"}
        renderCard={(r) => (
          <div className={`space-y-1.5 p-3 ${isEng && r.engrave.needs_name ? "bg-rose-50/40" : ""}`} onClick={() => setOpenId(r.id)}>
            <div className="flex items-center gap-2"><PlatformBadge code={r.platform_code} name={r.platform} size="xs" /><span className="font-mono text-[12px] text-slate-700">{r.order_no}</span><span className="flex-1" />{!isEng && <StatusPill c={r.cards[0] ?? null} />}</div>
            {isEng && <EngraveItems r={r} compact />}
            <NoteCell r={r} isEng={isEng} />
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">{fmt(r.ordered_at)}</span>{actions(r)}</div>
          </div>
        )}
        actions={
          <div className="flex items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px]" aria-label="ช่วงเวลา">
              {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} วันล่าสุด</option>)}
            </select>
            {tab === "card" && sel.size > 0 && <button type="button" onClick={printSelected} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-[12px] font-medium text-white"><Icon value="i:printer" /> พิมพ์การ์ดที่เลือก ({sel.size})</button>}
          </div>
        }
        emptyText={tab === "card" ? "ยังไม่มีออเดอร์ที่ลูกค้าขอการ์ดหรือห่อของขวัญในช่วงนี้" : tab === "engrave" ? "ยังไม่มีออเดอร์สลักชื่อในช่วงนี้" : tab === "engrave_missing" ? "ไม่มีออเดอร์สลักชื่อที่ลูกค้ายังไม่บอกชื่อ" : "ไม่มีหมายเหตุอื่นในช่วงนี้"}
      />

      {openId && (
        <Drawer open onClose={() => setOpenId(null)} size="xl" storageKey="platform-order-detail"
          title={openRow?.order_no ?? "รายละเอียดออเดอร์"}
          headerActions={() => <a href={`/master/platform-orders/${encodeURIComponent(openId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50" title="เปิดเต็มหน้าในแท็บใหม่"><Icon value="i:external-link" />เต็มหน้า</a>}>
          <OrderDetailView key={openId} id={openId} layout="drawer" onChanged={() => void load()} />
        </Drawer>
      )}

      <ERPModal open={!!chatFor} onClose={() => setChatFor(null)} title="ทักแชทลูกค้า" size="sm"
        footer={<button type="button" onClick={() => setChatFor(null)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">ปิด</button>}>
        {chatFor && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>ออเดอร์ <span className="font-mono">{chatFor.order_no}</span>{chatFor.customer_name ? ` · ${chatFor.customer_name}` : ""} ซื้อสินค้าสลักชื่อ แต่ยังไม่บอกชื่อที่จะสลัก</p>
            {chatFor.chat_ready ? (
              <Link href="/chat" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><Icon value="i:messages" /> เปิดห้องแชทรวม</Link>
            ) : (
              <>
                <p className="rounded-lg bg-amber-50 p-2.5 text-[13px] text-amber-900">แชท {chatFor.platform ?? "ของร้านนี้"} ยังไม่ได้เชื่อมกับระบบ (ห้องแชทรวมตอนนี้ต่อได้แค่ LINE) จึงเปิดห้องแชทของลูกค้าคนนี้ในระบบให้ไม่ได้ — คัดลอกเลขออเดอร์แล้วไปค้นในแชทของแพลตฟอร์ม</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={chatFor.order_no ?? ""} label="คัดลอกเลขออเดอร์" />
                  {chatFor.platform_code && SELLER_CHAT[chatFor.platform_code] && <a href={SELLER_CHAT[chatFor.platform_code].href} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon value="i:external-link" /> {SELLER_CHAT[chatFor.platform_code].label}</a>}
                </div>
                <p className="text-[12px] text-slate-400">ได้ชื่อจากลูกค้าแล้ว กด &quot;ส่งไปสั่งสลัก&quot; แล้วใส่ชื่อที่หน้าคำสั่งพิเศษ · ถ้าวันหลังต่อแชทแพลตฟอร์มนี้แล้ว ปุ่มนี้จะพาเข้าห้องแชทในระบบเลย</p>
              </>
            )}
          </div>
        )}
      </ERPModal>
    </>
  );
}

// ───────────── การ์ดทั้งหมด ─────────────

export function GiftCardsList({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast();
  const router = useRouter();
  const canEdit = usePermission("order_ops.edit");
  const canDelete = usePermission("order_ops.delete");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [trash, setTrash] = useState(false);
  const [status, setStatus] = useState<"" | "todo" | "done">("");
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const onCountRef = useRef(onCount); onCountRef.current = onCount;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await gcJson<{ cards: CardRow[] }>(`/api/order-gift-cards?view=cards${trash ? "&trash=1" : ""}${status ? `&status=${status}` : ""}`);
      setRows(j.cards); if (!trash && !status) onCountRef.current(j.cards.length);
    } catch (e) { setErr((e as Error).message); }
  }, [trash, status]);
  useEffect(() => { setRows(null); setSel(new Set()); void load(); }, [load]);

  const del = async (ids: string[], restore = false) => {
    try {
      await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind: "card", ids, restore }) });
      setSel(new Set()); void load();
      if (!restore) toast.undo(`ย้าย ${ids.length} ใบลงถังขยะแล้ว`, async () => { await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind: "card", ids, restore: true }) }); void load(); });
      else toast.success("กู้คืนแล้ว");
    } catch (e) { toast.error((e as Error).message); }
  };
  const unprint = async (ids: string[]) => {
    try { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "unprint", ids }) }); toast.success("เอาติ๊กพิมพ์แล้วออก"); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const cols: MiniColumn<CardRow>[] = [
    { key: "order", header: "ออเดอร์", width: "11rem", cell: (r) => <div><div className="font-mono text-[12px] text-slate-800">{r.order_no ?? <span className="text-slate-400">ไม่ผูกออเดอร์</span>}</div><div className="text-[11px] text-slate-400">{r.platform ?? ""}{r.brand_name ? ` · ${r.brand_name}` : ""}</div></div>, sortValue: (r) => r.order_no ?? "" },
    { key: "msg", header: "ข้อความบนการ์ด", width: "minmax(12rem,2fr)", cell: (r) => <span className="line-clamp-2 whitespace-pre-line text-[13px] text-slate-800">{r.message || <span className="text-slate-400">(ไม่มีข้อความ)</span>}</span> },
    { key: "note", header: "หมายเหตุลูกค้า", width: "minmax(10rem,1.4fr)", cell: (r) => <span className="line-clamp-2 text-[12px] text-amber-800">{r.customer_note ?? "—"}</span>, defaultHidden: isMobile },
    { key: "status", header: "สถานะ", width: "8rem", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusPill c={r} />{r.print_count > 0 && <span className="text-[11px] text-slate-400">พิมพ์ {r.print_count} ครั้ง</span>}</div>, sortValue: (r) => cardStatus(r).key },
    { key: "upd", header: "แก้ล่าสุด", width: "9rem", cell: (r) => <span className="text-[11px] text-slate-500">{fmt(r.updated_at)}{r.updated_by_name ? ` · ${r.updated_by_name}` : ""}</span>, sortValue: (r) => r.updated_at },
    { key: "act", header: "", width: "8rem", align: "right", noExport: true, cell: (r) => trash
      ? canDelete && <button type="button" onClick={() => void del([r.id], true)} className="text-[12px] text-sky-700 hover:underline">กู้คืน</button>
      : <Link href={`/order-ops/gift-cards/edit?id=${r.id}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 hover:bg-slate-50"><Icon value="i:pencil" /> {canEdit ? "แก้" : "ดู"}</Link> },
  ];

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!rows) return <LoadingState />;
  const selIds = [...sel];
  return (
    <MiniTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={cols}
      searchText={(r) => `${r.order_no ?? ""} ${r.message ?? ""} ${r.customer_note ?? ""}`}
      searchPlaceholder="ค้นเลขออเดอร์ / ข้อความ"
      selectable
      selected={sel}
      onSelectedChange={setSel}
      countUnit="ใบ"
      layout={isMobile ? "cards" : "table"}
      renderCard={(r) => (
        <div className="space-y-1 p-3">
          <div className="flex items-center gap-2"><span className="font-mono text-[12px] text-slate-700">{r.order_no ?? "ไม่ผูกออเดอร์"}</span><span className="flex-1" /><StatusPill c={r} /></div>
          <p className="line-clamp-2 whitespace-pre-line text-[13px]">{r.message || "(ไม่มีข้อความ)"}</p>
          <div className="flex justify-end">{cols[5].cell(r)}</div>
        </div>
      )}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!trash && <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px]" aria-label="สถานะ">
            <option value="">ทุกสถานะ</option><option value="todo">ยังไม่พิมพ์/เขียน</option><option value="done">พิมพ์/เขียนแล้ว</option>
          </select>}
          {sel.size > 0 && !trash && <>
            <button type="button" onClick={() => router.push(`/print/order-gift-cards?ids=${selIds.join(",")}`)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-[12px] font-medium text-white"><Icon value="i:printer" /> พิมพ์ ({sel.size})</button>
            {canEdit && <button type="button" onClick={() => void unprint(selIds)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px]">เอาติ๊กพิมพ์แล้วออก</button>}
            {canDelete && <button type="button" onClick={async () => { if (await askConfirm({ title: `ลบการ์ด ${sel.size} ใบ?`, message: "ย้ายลงถังขยะ กู้คืนได้", confirmText: "ย้ายลงถังขยะ", variant: "danger" })) void del(selIds); }} className="h-8 rounded-md border border-rose-200 bg-white px-2 text-[12px] text-rose-600">ลบ</button>}
          </>}
          {canDelete && <button type="button" onClick={() => setTrash((t) => !t)} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px] ${trash ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}><Icon value="i:trash" /> {trash ? "ออกจากถังขยะ" : "ถังขยะ"}</button>}
        </div>
      }
      emptyText={trash ? "ถังขยะว่าง" : "ยังไม่มีการ์ด — ไปที่แท็บ \"การ์ด / ห่อของขวัญ\" แล้วกดเขียนการ์ด"}
    />
  );
}

// ───────────── แม่แบบ + ฟอนต์ (ผู้จัดการ) ─────────────

export function GiftTemplates() {
  const toast = useToast();
  const router = useRouter();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [trash, setTrash] = useState<Tpl[]>([]);
  const [fonts, setFonts] = useState<(UploadedFont & { format: string; size_bytes: number | null })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"" | "msg" | "fixed" | "fold">("");
  const fontRef = useRef<HTMLInputElement>(null);
  useCardFonts(fonts);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, b, f] = await Promise.all([
        gcJson<{ templates: Tpl[] }>("/api/order-gift-cards?view=templates"),
        gcJson<{ templates: Tpl[] }>("/api/order-gift-cards?view=templates&trash=1"),
        gcJson<{ fonts: (UploadedFont & { format: string; size_bytes: number | null })[] }>("/api/order-gift-cards?view=fonts"),
      ]);
      setTpls(a.templates); setTrash(b.templates); setFonts(f.fonts);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const copy = async (t: Tpl) => {
    try { const j = await gcJson<{ id: string }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_copy", from: t.id }) }); router.push(`/order-ops/gift-cards/template?id=${j.id}`); }
    catch (e) { toast.error((e as Error).message); }
  };
  const del = async (kind: "template" | "font", id: string, restore = false, label = "ย้ายลงถังขยะแล้ว") => {
    try {
      await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind, ids: [id], restore }) });
      void load();
      if (!restore) toast.undo(label, async () => { await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind, ids: [id], restore: true }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  // เลื่อนลำดับในกลุ่ม (ของที่ออกแบบเอง) — ย้อนกลับได้จากแจ้งผลมุมจอ
  const move = async (group: string, own: Tpl[], i: number, dir: -1 | 1) => {
    const ids = own.map((t) => t.id);
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]];
    const base = Math.min(...own.map((t) => t.sort_order ?? 0)) - 10;
    try {
      await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_order", group, ids: next, base }) });
      void load();
      toast.undo("เลื่อนลำดับแล้ว", async () => { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_order", group, ids, base }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const renameGroup = async (from: string) => {
    const to = (await askText({ title: "เปลี่ยนชื่อกลุ่ม", message: "ชื่อกลุ่มใหม่ (ทุกแม่แบบในกลุ่มย้ายตาม)", initial: from, required: true, confirmText: "เปลี่ยนชื่อ" }))?.trim();
    if (!to || to === from) return;
    try {
      await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_group_rename", from, to }) });
      void load();
      toast.undo(`เปลี่ยนชื่อกลุ่มเป็น "${to}" แล้ว`, async () => { await gcJson("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_group_rename", from: to, to: from }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const uploadFont = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await apiFetch("/api/order-gift-cards/fonts", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
      toast.success(`เพิ่มฟอนต์ "${j.font.name}" แล้ว`); void load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); if (fontRef.current) fontRef.current.value = ""; }
  };

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!tpls) return <LoadingState />;
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold text-slate-800">แม่แบบการ์ด</h2><p className="text-[12px] text-slate-500">ออกแบบครั้งเดียว ใบต่อไปพนักงานแก้แค่ข้อความ · จัดเป็นกลุ่ม เลข 1, 2, 3 เลื่อนลำดับได้ · แม่แบบในตัวกด &quot;แก้&quot; ได้เลย (คืนค่าเดิมได้)</p></div>
          <Popover align="right" panelClassName="w-64 p-1.5 text-[13px]" trigger={(toggle) => <button type="button" onClick={toggle} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><Icon value="i:plus" /> ออกแบบแม่แบบใหม่</button>}>
            {() => (
              <div className="space-y-0.5">
                <Link href="/order-ops/gift-cards/template" className="block rounded px-2 py-1.5 hover:bg-slate-50"><b className="font-medium">การ์ดแผ่นเดียว</b><span className="block text-[11px] text-slate-500">ขนาด A6 / นามบัตร / กำหนดเอง</span></Link>
                <Link href="/order-ops/gift-cards/template?new=fold-side" className="block rounded px-2 py-1.5 hover:bg-slate-50"><b className="font-medium">การ์ดพับ A6 · พับข้าง</b><span className="block text-[11px] text-slate-500">กระดาษ A5 พับครึ่ง เปิดแบบหนังสือ · ข้อความลูกค้าอยู่ด้านใน</span></Link>
                <Link href="/order-ops/gift-cards/template?new=fold-top" className="block rounded px-2 py-1.5 hover:bg-slate-50"><b className="font-medium">การ์ดพับ A6 · พับบน</b><span className="block text-[11px] text-slate-500">กระดาษ A5 พับครึ่ง เปิดขึ้น · ข้อความลูกค้าอยู่ด้านใน</span></Link>
              </div>
            )}
          </Popover>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([["", "ทั้งหมด"], ["msg", "ใส่ข้อความได้"], ["fixed", "ข้อความตายตัว"], ["fold", "การ์ดพับ"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`h-7 rounded-full border px-3 text-[12px] ${kind === k ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
        {(() => {
          const pass = (t: Tpl) => (kind === "msg" ? acceptsMessage(t.doc) : kind === "fixed" ? !acceptsMessage(t.doc) : kind === "fold" ? isFolded(t.doc) : true);
          const groups = groupTemplates(tpls.filter((t) => !t.builtin), tpls.filter((t) => t.builtin));
          return groups.map(({ group, items }) => {
            const own = items.filter((t) => !t.builtin);
            const shown = items.filter(pass);
            if (!shown.length) return null;
            return (
              <div key={group} className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Icon value="i:folder" />
                  <b className="text-sm font-semibold text-slate-800">{group}</b>
                  <span className="text-[12px] text-slate-400">{items.length} แบบ</span>
                  <span className="flex-1" />
                  {own.length > 0 && group !== "ไม่มีกลุ่ม" && <button type="button" onClick={() => void renameGroup(group)} className="h-7 rounded-md border border-slate-200 px-2 text-[12px] text-slate-600 hover:bg-slate-50">เปลี่ยนชื่อกลุ่ม</button>}
                  <Link href={`/order-ops/gift-cards/template?group=${encodeURIComponent(group === "ไม่มีกลุ่ม" ? "" : group)}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:plus" /> เพิ่มในกลุ่มนี้</Link>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {shown.map((t) => {
                    const no = items.indexOf(t) + 1;
                    const oi = own.indexOf(t);
                    return (
                      <div key={t.id} className="rounded-lg border border-slate-200 p-2">
                        <CardPreview doc={t.doc} maxHeight={130} marks fold={foldLine(t.doc)} />
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-medium text-violet-700">{no}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800" title={t.name}>{t.name}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {acceptsMessage(t.doc) ? <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] text-emerald-700">ใส่ข้อความได้</span> : <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">ข้อความตายตัว</span>}
                          {isFolded(t.doc) && <span className="rounded-full bg-sky-50 px-1.5 text-[10px] text-sky-700">การ์ดพับ A6</span>}
                          {t.builtin && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">ในตัว</span>}
                          {t.replaces_builtin && <span className="rounded bg-amber-50 px-1.5 text-[10px] text-amber-700">ในตัว · แก้แล้ว</span>}
                          {t.is_default && <span className="rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700">หลัก</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Link href={`/order-ops/gift-cards/template?id=${encodeURIComponent(t.id)}`} className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-[12px] hover:bg-slate-50">แก้</Link>
                          <button type="button" onClick={() => void copy(t)} className="h-7 rounded-md border border-slate-200 px-2 text-[12px] hover:bg-slate-50">ทำสำเนา</button>
                          {!t.builtin && oi > 0 && !kind && <button type="button" onClick={() => void move(group, own, oi, -1)} aria-label="เลื่อนขึ้น" title="เลื่อนไปก่อนหน้า" className="h-7 w-7 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"><Icon value="i:arrow-left" /></button>}
                          {!t.builtin && oi >= 0 && oi < own.length - 1 && !kind && <button type="button" onClick={() => void move(group, own, oi, 1)} aria-label="เลื่อนลง" title="เลื่อนไปถัดไป" className="h-7 w-7 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"><Icon value="i:arrow-right" /></button>}
                          {!t.builtin && (t.replaces_builtin
                            ? <button type="button" onClick={() => void del("template", t.id, false, "คืนค่าแม่แบบในตัวแล้ว")} className="h-7 rounded-md border border-amber-200 px-2 text-[12px] text-amber-700 hover:bg-amber-50">คืนค่าเดิม</button>
                            : <button type="button" onClick={() => void del("template", t.id)} className="h-7 rounded-md border border-rose-200 px-2 text-[12px] text-rose-600 hover:bg-rose-50">ลบ</button>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {items.some((t) => t.builtin) && own.length > 0 && <p className="mt-2 text-[11px] text-slate-400">แม่แบบในตัวเรียงท้ายกลุ่ม — กด &quot;แก้&quot; แล้วบันทึก จึงเลื่อนลำดับ/ย้ายกลุ่มได้</p>}
              </div>
            );
          });
        })()}
        {trash.length > 0 && (
          <details className="mt-3 text-[12px] text-slate-500"><summary className="cursor-pointer">ถังขยะแม่แบบ ({trash.length})</summary>
            <div className="mt-2 flex flex-wrap gap-2">{trash.map((t) => <span key={t.id} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">{t.name}<button type="button" onClick={() => void del("template", t.id, true)} className="text-sky-700 hover:underline">กู้คืน</button></span>)}</div>
          </details>
        )}
      </section>
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold text-slate-800">ฟอนต์ของแบรนด์</h2><p className="text-[12px] text-slate-500">อัปโหลดไฟล์ .ttf / .otf / .woff / .woff2 (ไม่เกิน 4 MB) แล้วเลือกใช้ในตัวออกแบบได้ทันที · มีฟอนต์ Google ให้ 20 แบบอยู่แล้ว</p></div>
          <button type="button" disabled={busy} onClick={() => fontRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon value="i:upload" /> {busy ? "กำลังอัปโหลด…" : "อัปโหลดฟอนต์"}</button>
          <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => void uploadFont(e.target.files?.[0])} />
        </div>
        {fonts.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-[12px] text-slate-500">ยังไม่มีฟอนต์ของแบรนด์</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fonts.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <span className="min-w-0 flex-1 truncate text-lg" style={{ fontFamily: `'gcf-${f.id.replace(/[^a-z0-9]/gi, "").slice(0, 32)}', sans-serif` }}>{f.name} สวัสดี Aa</span>
                <span className="text-[11px] text-slate-400">{f.format}</span>
                <button type="button" onClick={() => void del("font", f.id)} className="text-[12px] text-rose-600 hover:underline">ลบ</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
