"use client";

// ============================================================
// 💌 เขียนการ์ดของขวัญ — /order-ops/gift-cards (แอป ออเดอร์ออนไลน์)
// ออเดอร์ทุกร้านที่ลูกค้าเขียนหมายเหตุ (จากศูนย์ออเดอร์) คัดแยกเป็น การ์ด/ห่อ · สลักชื่อ · อื่น ๆ (ข้อ 1 · แก้เองได้)
// กด "เขียนการ์ด" → หน้าเขียน (ข้อความจากหมายเหตุใส่ให้แล้ว) · พิมพ์หลายใบพร้อมกัน + ติ๊กพิมพ์แล้ว (ข้อ 3) · การ์ดไม่ผูกออเดอร์ (ข้อ 6)
// แม่แบบ + ฟอนต์แบรนด์ (ข้อ 2 · 8) · เจ้าของเลือก widget 2026-11-24 แบบ A
// API /api/order-gift-cards · กติกา lib/gift-card-design · ตัวออกแบบ components/card-designer · คู่มือ docs/order-gift-cards.md
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth, usePermission } from "@/components/auth";
import { ErrorState, LoadingState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { PlatformBadge } from "@/components/platform-icon";
import { Popover } from "@/components/popover";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CardPreview, useCardFonts, type UploadedFont } from "@/components/card-designer";
import { apiFetch } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatDateTime } from "@/lib/date";
import { cardStatus, extractEngraveText, type CardDoc } from "@/lib/gift-card-design";

type CardMini = { id: string; message: string | null; printed_at: string | null; hand_written_at: string | null; updated_at: string };
type NoteRow = {
  id: string; order_no: string | null; customer_name: string | null; status: string | null; ordered_at: string | null; ship_by_at: string | null; packed_at: string | null;
  platform: string | null; platform_code: string | null; brand_id: string | null; brand_name: string | null; note: string | null;
  kind: { card: boolean; engrave: boolean }; kind_auto: { card: boolean; engrave: boolean }; overridden: boolean;
  cards: CardMini[]; instructions: { id: string; status: string; engrave: boolean }[];
};
type CardRow = { id: string; platform_order_id: string | null; order_no: string | null; platform: string | null; brand_name: string | null; customer_note: string | null; message: string | null; note: string | null; print_count: number; printed_at: string | null; printed_by_name: string | null; hand_written_at: string | null; updated_at: string; updated_by_name: string | null; deleted_at: string | null };
type Tpl = { id: string; name: string; brand_id: string | null; doc: CardDoc; is_default: boolean; builtin: boolean; updated_at: string | null; updated_by_name: string | null; deleted_at: string | null };
type Tab = "card" | "engrave" | "other" | "cards" | "templates";

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

export default function GiftCardsPage() {
  const { permsReady } = useAuth();
  const canView = usePermission("order_ops.view");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4">
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canView ? <AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ดูงานหลังขาย (order_ops.view)" />
          : <Suspense fallback={<LoadingState />}><Body /></Suspense>}
      </div>
    </PlaygroundShell>
  );
}

function Body() {
  const router = useRouter();
  const sp = useSearchParams();
  const canManage = usePermission("order_ops.manage");
  const tab = (["card", "engrave", "other", "cards", "templates"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "card") as Tab;
  const setTab = (t: string) => router.replace(t === "card" ? "/order-ops/gift-cards" : `/order-ops/gift-cards?tab=${t}`);
  const [counts, setCounts] = useState<{ card?: number; card_todo?: number; engrave?: number; other?: number; cards?: number }>({});

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">เขียนการ์ดของขวัญ</h1>
          <p className="text-sm text-slate-500">ออเดอร์ทุกร้านที่ลูกค้าฝากข้อความ · กดเขียนการ์ด ข้อความจากหมายเหตุใส่ให้แล้ว · พิมพ์หลายใบพร้อมกันได้</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/order-ops/gift-cards/edit?new=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon value="i:plus" /> การ์ดใหม่ (ไม่ผูกออเดอร์)</Link>
        </div>
      </div>
      <StatFilterCards
        className="mb-3"
        value={tab}
        onChange={setTab}
        showZero
        cards={[
          { key: "card", label: "การ์ด / ห่อของขวัญ", value: counts.card ?? null, tone: "danger", icon: <Icon value="i:gift-card" />, hint: counts.card_todo != null ? `ยังไม่ทำ ${counts.card_todo}` : undefined, keep: true },
          { key: "engrave", label: "สลักชื่อ", value: counts.engrave ?? null, icon: <Icon value="i:pencil" />, hint: "ส่งต่อไปคำสั่งสลักชื่อ", keep: true },
          { key: "other", label: "หมายเหตุอื่น ๆ", value: counts.other ?? null, icon: <Icon value="i:message-circle" />, keep: true },
          { key: "cards", label: "การ์ดทั้งหมด", value: counts.cards ?? null, icon: <Icon value="i:printer" />, hint: "รวมการ์ดไม่ผูกออเดอร์", keep: true },
          ...(canManage ? [{ key: "templates", label: "แม่แบบ + ฟอนต์", value: null, icon: <Icon value="i:palette" />, keep: true }] : []),
        ]}
      />
      {tab === "cards" ? <CardsList onCount={(n) => setCounts((c) => ({ ...c, cards: n }))} />
        : tab === "templates" ? (canManage ? <TemplatesTab /> : <AccessDenied message="จัดการแม่แบบต้องมีสิทธิ์ order_ops.manage" />)
        : <NotesList tab={tab} onCounts={(c) => setCounts((x) => ({ ...x, ...c }))} />}
    </>
  );
}

// ───────────── ออเดอร์ที่มีหมายเหตุ ─────────────

function NotesList({ tab, onCounts }: { tab: "card" | "engrave" | "other"; onCounts: (c: { card: number; card_todo: number; engrave: number; other: number }) => void }) {
  const toast = useToast();
  const router = useRouter();
  const canEdit = usePermission("order_ops.edit");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const onCountsRef = useRef(onCounts); onCountsRef.current = onCounts;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await gcJson<{ rows: NoteRow[]; counts: { card: number; card_todo: number; engrave: number; other: number } }>(`/api/order-gift-cards?view=notes&tab=${tab}&days=${days}`);
      setRows(j.rows); onCountsRef.current(j.counts);
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
  const sendEngrave = async (r: NoteRow) => {
    const text = extractEngraveText(r.note);
    const ok = await askConfirm({ title: "ส่งไปคำสั่งสลักชื่อ?", message: `สร้างคำสั่งสลักชื่อของออเดอร์ ${r.order_no ?? ""}${text ? ` · ชื่อที่จะสลัก: "${text}"` : ""} · ไปแก้รูปแบบ/ตำแหน่ง/ลบได้ที่หน้าคำสั่งพิเศษ`, confirmText: "ส่งไปคำสั่งสลักชื่อ" });
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
    <Popover align="right" panelClassName="w-60 p-2 text-[13px]" trigger={(toggle) => <button type="button" onClick={toggle} title="ย้ายแท็บ" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><Icon value="i:dots-vertical" /></button>}>
      {(close) => (
        <div className="space-y-1">
          <div className="px-1 text-[11px] text-slate-400">ออเดอร์นี้อยู่แท็บไหน {r.overridden ? "(แก้เองแล้ว)" : "(ระบบเดา)"}</div>
          {([["card", "การ์ด / ห่อของขวัญ"], ["engrave", "สลักชื่อ"]] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <input type="checkbox" checked={r.kind[k]} disabled={!canEdit} onChange={(e) => { void setKind(r, { ...r.kind, [k]: e.target.checked }); close(); }} /> {l}
            </label>))}
          {r.overridden && canEdit && <button type="button" onClick={() => { void setKind(r, null); close(); }} className="w-full rounded px-1 py-1 text-left text-sky-700 hover:bg-slate-50">ให้ระบบเดาเหมือนเดิม</button>}
        </div>
      )}
    </Popover>
  );
  const actions = (r: NoteRow) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {tab === "engrave" ? (
        r.instructions.some((i) => i.engrave)
          ? <Link href="/order-ops/instructions" className="text-[12px] text-emerald-700 hover:underline">มีคำสั่งสลักแล้ว ({r.instructions.find((i) => i.engrave)?.status === "done" ? "เสร็จ" : "ยังไม่ทำ"})</Link>
          : canEdit && <button type="button" onClick={() => void sendEngrave(r)} className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100"><Icon value="i:send" /> ส่งไปคำสั่งสลัก</button>
      ) : canEdit && (
        <Link href={writeHref(r)} className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-600 px-2.5 text-[12px] font-medium text-white hover:bg-violet-700"><Icon value="i:pencil" /> {r.cards.length ? "ดู / แก้การ์ด" : "เขียนการ์ด"}</Link>
      )}
      {kindMenu(r)}
    </div>
  );

  const cols: MiniColumn<NoteRow>[] = [
    { key: "platform", header: "ร้าน", width: "7rem", cell: (r) => <div className="flex flex-col items-start gap-0.5"><PlatformBadge code={r.platform_code} name={r.platform} size="xs" />{r.brand_name && <span className="text-[11px] text-slate-400">{r.brand_name}</span>}</div>, sortValue: (r) => r.platform ?? "" },
    { key: "order", header: "ออเดอร์", width: "11rem", cell: (r) => <div><Link href={`/master/platform-orders?q=${encodeURIComponent(r.order_no ?? "")}`} className="font-mono text-[12px] text-slate-800 hover:underline">{r.order_no}</Link><div className="text-[11px] text-slate-400">{fmt(r.ordered_at)}{r.packed_at ? " · แพ็กแล้ว" : ""}</div></div>, sortValue: (r) => r.ordered_at ?? "" },
    { key: "note", header: "ข้อความลูกค้า", width: "minmax(14rem,2fr)", cell: (r) => <span className="whitespace-pre-line text-[13px] text-amber-900">{r.note}</span> },
    { key: "status", header: "สถานะ", width: "7rem", cell: (r) => (tab === "engrave" ? (r.instructions.some((i) => i.engrave) ? <span className="text-[12px] text-emerald-700">ส่งแล้ว</span> : <span className="text-[12px] text-slate-400">ยังไม่ส่ง</span>) : <div className="flex flex-col items-start gap-0.5"><StatusPill c={r.cards[0] ?? null} />{r.cards.length > 1 && <span className="text-[11px] text-slate-400">{r.cards.length} ใบ</span>}</div>), sortValue: (r) => cardStatus(r.cards[0] ?? null).key },
    { key: "act", header: "", width: "13rem", align: "right", cell: actions, noExport: true },
  ];

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!rows) return <LoadingState />;
  return (
    <MiniTable
      rows={rows}
      rowKey={(r) => r.id}
      columns={cols}
      searchText={(r) => `${r.order_no ?? ""} ${r.note ?? ""} ${r.customer_name ?? ""} ${r.platform ?? ""}`}
      searchPlaceholder="ค้นเลขออเดอร์ / ข้อความลูกค้า"
      selectable={tab === "card"}
      selected={sel}
      onSelectedChange={setSel}
      countUnit="ออเดอร์"
      layout={isMobile ? "cards" : "table"}
      renderCard={(r) => (
        <div className="space-y-1.5 p-3">
          <div className="flex items-center gap-2"><PlatformBadge code={r.platform_code} name={r.platform} size="xs" /><span className="font-mono text-[12px] text-slate-700">{r.order_no}</span><span className="flex-1" />{tab !== "engrave" && <StatusPill c={r.cards[0] ?? null} />}</div>
          <p className="whitespace-pre-line text-[13px] text-amber-900">{r.note}</p>
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
      emptyText={tab === "card" ? "ยังไม่มีออเดอร์ที่ลูกค้าขอการ์ดหรือห่อของขวัญในช่วงนี้" : tab === "engrave" ? "ยังไม่มีออเดอร์ที่ขอสลักชื่อในช่วงนี้" : "ไม่มีหมายเหตุอื่นในช่วงนี้"}
    />
  );
}

// ───────────── การ์ดทั้งหมด ─────────────

function CardsList({ onCount }: { onCount: (n: number) => void }) {
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

function TemplatesTab() {
  const toast = useToast();
  const router = useRouter();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [trash, setTrash] = useState<Tpl[]>([]);
  const [fonts, setFonts] = useState<(UploadedFont & { format: string; size_bytes: number | null })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const del = async (kind: "template" | "font", id: string, restore = false) => {
    try {
      await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind, ids: [id], restore }) });
      void load();
      if (!restore) toast.undo("ย้ายลงถังขยะแล้ว", async () => { await gcJson("/api/order-gift-cards", { method: "DELETE", body: JSON.stringify({ kind, ids: [id], restore: true }) }); void load(); });
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
          <div><h2 className="text-base font-semibold text-slate-800">แม่แบบการ์ด</h2><p className="text-[12px] text-slate-500">ออกแบบครั้งเดียว ใบต่อไปพนักงานแก้แค่ข้อความ · ตั้ง "แม่แบบหลัก" ต่อแบรนด์ได้ · แม่แบบในตัวกด "ทำสำเนาไปแก้"</p></div>
          <Link href="/order-ops/gift-cards/template" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700"><Icon value="i:plus" /> ออกแบบแม่แบบใหม่</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tpls.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <CardPreview doc={t.doc} maxHeight={150} />
              <div className="mt-2 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{t.name}</span>
                {t.builtin && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">ในตัว</span>}
                {t.is_default && <span className="rounded bg-emerald-50 px-1.5 text-[10px] text-emerald-700">หลัก</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.builtin
                  ? <button type="button" onClick={() => void copy(t)} className="h-7 rounded-md border border-slate-200 px-2 text-[12px] hover:bg-slate-50">ทำสำเนาไปแก้</button>
                  : <>
                    <Link href={`/order-ops/gift-cards/template?id=${t.id}`} className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-[12px] hover:bg-slate-50">แก้</Link>
                    <button type="button" onClick={() => void copy(t)} className="h-7 rounded-md border border-slate-200 px-2 text-[12px] hover:bg-slate-50">ทำสำเนา</button>
                    <button type="button" onClick={() => void del("template", t.id)} className="h-7 rounded-md border border-rose-200 px-2 text-[12px] text-rose-600 hover:bg-rose-50">ลบ</button>
                  </>}
              </div>
            </div>
          ))}
        </div>
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
