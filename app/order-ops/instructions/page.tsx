"use client";

// ============================================================
// 🎁 คำสั่งพิเศษ & การ์ด — /order-ops/instructions (แอป ช่องทางขาย/ออเดอร์ออนไลน์)
// รวมกับหน้าเขียนการ์ดของขวัญแล้ว (2026-11-25) — ส่วนงานเข้า/การ์ด/แม่แบบ มาจาก ../gift-panels
// ห่อของขวัญ · การ์ด · สลักชื่อ (พิมพ์ใบสลัก) · แก้ไซส์ · แท็บ "รอของ"
// ย้ายจากแอปเก่า order-instruction-manager (2026-11-24 · ช่วงทดลอง ยังไม่ย้ายข้อมูลจริง)
// API /api/order-ops · กติกา lib/order-ops · ชิ้นส่วนร่วม ./shared
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { LoadingState, ErrorState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { useMediaQuery } from "@/lib/use-media-query";
import { INSTRUCTION_STATUS, commandSummary, invalidEngraveChars } from "@/lib/order-ops";
import {
  Field, HistoryList, OptionsManager, OrderNoField, Pill, SkuField, TrashToggle, TrialBanner, TrialPill,
  fmtDate, inputCls, opsJson, useOpsOptions, type OrderHit,
} from "../shared";
import { EngraveSettings, InstructionForm, type Ins, type InsPrefill } from "../instruction-form";
import { PlatformOrderPicker } from "@/components/platform-order-picker";
import Link from "next/link";
import { ScrollTabs } from "@/components/scroll-tabs";
import { GIFT_INBOX_TABS, GiftCardsList, GiftInbox, GiftTemplates, InstructionTrash, type GiftCounts, type GiftInboxKind, type GiftInboxTab } from "../gift-panels";

type Wait = {
  id: string; order_no: string | null; platform: string | null; customer_name: string | null; sku: string | null; note: string | null;
  informed: boolean; informed_at: string | null; informed_by_name: string | null; is_trial: boolean; created_at: string; deleted_at: string | null;
};
type Summary = { todo?: number; engrave?: number; waiting?: number; done_today?: number; trial?: number };

const PLATFORMS = ["Shopee", "Lazada", "TikTok", "LINE", "Facebook", "IG", "เว็บไซต์", "อื่นๆ"];

export default function InstructionsPage() {
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

// หน้ารวม "คำสั่งพิเศษ & การ์ด" — 4 ส่วน ?s= (เจ้าของเลือก 2026-11-25: รวมงานเข้า + คำสั่งพิเศษเป็นรายการเดียว)
//   inbox งานพิเศษ (1 แถว = 1 ออเดอร์ · ?tab= สถานะงาน · ?kind= ชนิด) · wait รอของ · cards การ์ดทั้งหมด · settings คำสั่ง/เครื่องสลัก/แม่แบบ/ฟอนต์
//   ลิงก์เก่า ?s=orders(&open=<คำสั่ง>) ?view=wait /order-ops/gift-cards พามาส่วนที่ถูกต้อง · ตัวเลขบนปุ่มส่วน = งานค้าง
type Section = "inbox" | "wait" | "cards" | "settings";
const SECTIONS: Section[] = ["inbox", "wait", "cards", "settings"];
const KINDS: GiftInboxKind[] = ["", "card", "engrave", "chat", "other"];

function Body() {
  const router = useRouter();
  const sp = useSearchParams();
  const canManage = usePermission("order_ops.manage");
  const raw = sp.get("s") ?? (sp.get("view") === "wait" ? "wait" : null);
  const legacyOrders = raw === "orders";
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : "inbox";
  const legacyTab = sp.get("tab");
  const inboxTab: GiftInboxTab = GIFT_INBOX_TABS.includes(legacyTab as GiftInboxTab) ? (legacyTab as GiftInboxTab)
    : legacyTab === "engrave_missing" ? "engrave_missing" : legacyOrders ? (sp.get("open") ? "all" : "ins_todo") : legacyTab ? "all" : "no_ins";
  const inboxKind: GiftInboxKind = KINDS.includes((sp.get("kind") ?? "") as GiftInboxKind) ? ((sp.get("kind") ?? "") as GiftInboxKind)
    : ["card", "engrave", "other"].includes(legacyTab ?? "") ? (legacyTab as GiftInboxKind) : "";
  const go = (s: Section, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(s === "inbox" ? {} : { s }), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
    router.replace(`/order-ops/instructions${p.toString() ? `?${p}` : ""}`);
  };
  const [summary, setSummary] = useState<Summary>({});
  const [gift, setGift] = useState<GiftCounts>({});
  const [bump, setBump] = useState(0);
  // "+ คำสั่งพิเศษ" = ลูกค้าแจ้งทางแชท (ไม่ได้ลงหมายเหตุ) → เลือกออเดอร์ในป๊อป
  const [chatNew, setChatNew] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [engraveOpen, setEngraveOpen] = useState(false);
  const canEditIns = usePermission("order_ops.edit");
  const canDeleteIns = usePermission("order_ops.delete");
  const { options: hubOptions, reload: reloadOptions } = useOpsOptions();
  const refresh = () => setBump((b) => b + 1);

  // ตัวเลขบนปุ่มส่วน — โหลดครั้งแรก (ส่วนที่เปิดอยู่อัปเดตต่อเองตอนโหลดรายการ)
  useEffect(() => {
    void opsJson<{ summary: Summary }>("/api/order-ops?t=instructions&page=1&page_size=10&status=todo").then((r) => setSummary(r.summary)).catch(() => {});
    void opsJson<{ counts: GiftCounts }>("/api/order-gift-cards?view=notes&counts=1").then((r) => setGift(r.counts)).catch(() => {});
  }, [bump]);

  const tabs: { key: Section; label: string; badge?: number; danger?: boolean; icon: string }[] = [
    { key: "inbox", label: "งานพิเศษ", badge: (gift.no_ins ?? 0) + (gift.ins_todo ?? 0), danger: (gift.engrave_missing ?? 0) > 0, icon: "i:inbox" },
    { key: "wait", label: "รอของ", badge: summary.waiting, icon: "i:clock" },
    { key: "cards", label: "การ์ดทั้งหมด", icon: "i:printer" },
    ...(canManage ? [{ key: "settings" as Section, label: "ตั้งค่า", icon: "i:settings" }] : []),
  ];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">คำสั่งพิเศษ &amp; การ์ด</h1>
          <p className="text-sm text-slate-500">ออเดอร์ที่ลูกค้าฝากข้อความ/ซื้อสินค้าสลัก/แจ้งทางแชท → กดแถวสร้างคำสั่งพิเศษ → พิมพ์การ์ด/ใบสลัก → รอของ · เด้งเตือนที่หน้าแพ็กของตอนสแกนออเดอร์</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditIns && <button type="button" onClick={() => setChatNew(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700" title="ลูกค้าแจ้งทางแชท ไม่ได้ลงหมายเหตุในออเดอร์"><Icon value="i:plus" /> คำสั่งพิเศษ</button>}
          {(section === "inbox" || section === "cards") && (
            <Link href="/order-ops/gift-cards/edit?new=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon value="i:plus" /> การ์ดใหม่ (ไม่ผูกออเดอร์)</Link>
          )}
          {section === "inbox" && canDeleteIns && <button type="button" onClick={() => setTrashOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon value="i:trash" /> ถังขยะคำสั่ง</button>}
        </div>
      </div>
      {chatNew && (
        <InstructionForm row={null} prefill={{ via_chat: true }} options={hubOptions} readOnly={!canEditIns} canDelete={canDeleteIns}
          onClose={() => setChatNew(false)} onSaved={() => { setChatNew(false); refresh(); go("inbox", { tab: "ins_todo", kind: "chat" }); }} />
      )}
      <ScrollTabs activeKey={section} className="mb-3 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} type="button" data-tab-key={t.key} onClick={() => go(t.key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${section === t.key ? "border-sky-600 font-medium text-sky-700" : "border-transparent text-slate-600 hover:text-slate-800"}`}>
            <Icon value={t.icon} /> {t.label}
            {!!t.badge && <span className={`rounded-full px-1.5 text-[11px] ${t.danger ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{t.badge}</span>}
          </button>
        ))}
      </ScrollTabs>
      {(section === "inbox" || section === "wait") && <TrialBanner trialCount={summary.trial ?? 0} onChanged={refresh} />}
      {section === "inbox" ? (
        <GiftInbox key={bump} tab={inboxTab} kind={inboxKind} openIns={legacyOrders ? sp.get("open") : null}
          onTab={(t) => go("inbox", { tab: t === "no_ins" ? "" : t, kind: inboxKind })}
          onKind={(k) => go("inbox", { tab: inboxTab === "no_ins" ? "" : inboxTab, kind: k })}
          onCounts={(c) => setGift((x) => ({ ...x, ...c }))} />
      ) : section === "wait" ? <WaitView bump={bump} onSummary={setSummary} />
        : section === "cards" ? <GiftCardsList onCount={() => {}} />
        : canManage ? (
          <div className="space-y-6">
            <section>
              <h2 className="text-base font-semibold text-slate-800">คำสั่งพิเศษ</h2>
              <p className="mb-2 text-[12px] text-slate-500">ชิปคำสั่ง (ห่อ · การ์ด · เปลี่ยนสินค้า …) + ชนิดกล่องตั้งค่า + ตัวเลือก · ตัวพิเศษ/ฟอนต์/รหัสท้าย SKU ของเครื่องสลัก</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setOptOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:settings" /> จัดการคำสั่ง</button>
                <button type="button" onClick={() => setEngraveOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:settings" /> ตั้งค่าเครื่องสลัก</button>
                <button type="button" onClick={() => setTrashOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:trash" /> ถังขยะคำสั่ง</button>
              </div>
            </section>
            <GiftTemplates />
          </div>
        ) : <AccessDenied message="ตั้งค่าต้องมีสิทธิ์ order_ops.manage" />}
      <InstructionTrash open={trashOpen} onClose={() => setTrashOpen(false)} onRestored={refresh} />
      <OptionsManager open={optOpen} onClose={() => setOptOpen(false)} kind="instruction_command" options={hubOptions} onChanged={reloadOptions} />
      <EngraveSettings open={engraveOpen} onClose={() => setEngraveOpen(false)} options={hubOptions} onChanged={reloadOptions} />
    </>
  );
}

/* ───────────── แท็บรอของ ───────────── */

function WaitView({ bump, onSummary }: { bump: number; onSummary: (s: Summary) => void }) {
  const toast = useToast();
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const canEdit = usePermission("order_ops.edit");
  const canDelete = usePermission("order_ops.delete");
  const canManage = usePermission("order_ops.manage");
  const [filter, setFilter] = useState("open");
  const [trash, setTrash] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Wait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Wait | "new" | null>(null);
  const [counts, setCounts] = useState({ open: 0, all: 0 });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ t: "waitlist", page_size: "200" });
    if (trash) p.set("trash", "1"); else if (filter === "open") p.set("informed", "0");
    if (q.trim()) p.set("q", q.trim());
    try {
      const [r, s] = await Promise.all([
        opsJson<{ rows: Wait[]; total: number }>(`/api/order-ops?${p}`),
        opsJson<{ summary: Summary; total: number }>(`/api/order-ops?t=instructions&page_size=10`),
      ]);
      setRows(r.rows); onSummary(s.summary);
      setCounts((c) => ({ open: s.summary.waiting ?? c.open, all: filter === "all" && !trash ? r.total : c.all }));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [trash, filter, q, onSummary]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, bump, q]);
  useEffect(() => setSelected(new Set()), [filter, trash]);

  const setInformed = async (ids: string[], informed: boolean, prev?: Map<string, boolean>) => {
    try {
      await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "waitlist", ids, patch: { informed } }) });
      setSelected(new Set()); void load();
      if (prev) toast.undo(informed ? "บันทึกว่าแจ้งลูกค้าแล้ว" : "ตั้งเป็นยังไม่แจ้ง", async () => {
        const back = [...prev].filter(([, v]) => v !== informed).map(([k]) => k);
        if (back.length) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "waitlist", ids: back, patch: { informed: !informed } }) });
        void load();
      });
    } catch (e) { toast.error((e as Error).message); }
  };
  const del = async (ids: string[], mode: "soft" | "restore" | "hard") => {
    if (mode === "hard" && !(await askConfirm({ title: `ลบถาวร ${ids.length} รายการ?`, message: "ลบแล้วกู้คืนไม่ได้", confirmText: "ลบถาวร", variant: "danger" }))) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "waitlist", ids, restore: mode === "restore", hard: mode === "hard" }) });
      setSelected(new Set()); void load();
      if (mode === "soft") toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "waitlist", ids, restore: true }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const sel = rows.filter((r) => selected.has(r.id));
  const informedPill = (r: Wait) => r.informed ? <Pill tone="success" title={`${fmtDate(r.informed_at)} ${r.informed_by_name ?? ""}`}>แจ้งแล้ว</Pill> : <Pill tone="warning">ยังไม่แจ้ง</Pill>;

  const columns: MiniColumn<Wait>[] = [
    { key: "cust", header: "ลูกค้า", width: "1.4fr", locked: true, sortValue: (r) => r.customer_name ?? "", cell: (r) => (
      <div><div className="flex items-center gap-1 text-sm">{r.customer_name ?? "-"} {r.is_trial && <TrialPill />}</div><div className="text-xs text-slate-500">{r.platform ?? "-"}{r.order_no ? ` · ${r.order_no}` : ""}</div></div>) },
    { key: "sku", header: "SKU", width: "8rem", sortValue: (r) => r.sku ?? "", cell: (r) => <span className="font-mono text-xs">{r.sku ?? "-"}</span> },
    { key: "note", header: "หมายเหตุ", width: "1.5fr", cell: (r) => <span className="text-xs text-slate-600">{r.note ?? "-"}</span> },
    { key: "informed", header: "แจ้งลูกค้า", width: "6.5rem", cell: (r) => <button disabled={!canEdit || trash} onClick={(e) => { e.stopPropagation(); void setInformed([r.id], !r.informed, new Map([[r.id, r.informed]])); }}>{informedPill(r)}</button> },
    { key: "created", header: "บันทึกเมื่อ", width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-slate-500">{fmtDate(r.created_at)}</span> },
  ];

  return (
    <>
      <StatFilterCards value={trash ? "" : filter} onChange={(k) => { setTrash(false); setFilter(k); }} showZero
        cards={[{ key: "open", label: "ยังไม่แจ้งลูกค้า", value: counts.open, tone: "warning" }, { key: "all", label: "ทั้งหมด", value: filter === "all" ? rows.length : null, tone: "neutral" }]} />
      <div className="my-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อลูกค้า / SKU / เลขออเดอร์" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <TrashToggle on={trash} onChange={setTrash} />
        {canEdit && !trash && <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" className="h-4 w-4" /> เพิ่มรายการรอของ</button>}
      </div>
      {sel.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span>เลือก {sel.length} รายการ</span><span className="flex-1" />
          {!trash && canEdit && <button onClick={() => setInformed(sel.map((r) => r.id), true, new Map(sel.map((r) => [r.id, r.informed])))} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">แจ้งลูกค้าแล้ว</button>}
          {!trash && canDelete && <button onClick={() => del(sel.map((r) => r.id), "soft")} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบ</button>}
          {trash && canDelete && <button onClick={() => del(sel.map((r) => r.id), "restore")} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">กู้คืน</button>}
          {trash && canManage && <button onClick={() => del(sel.map((r) => r.id), "hard")} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบถาวร</button>}
          <button onClick={() => setSelected(new Set())} className="text-xs text-sky-700 underline">ยกเลิกเลือก</button>
        </div>
      )}
      {error ? <ErrorState title={error} onRetry={load} /> : loading && !rows.length ? <LoadingState /> : (
        <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} hideSearch selectable selected={selected} onSelectedChange={setSelected}
          onRowClick={(r) => setEditing(r)} layout={isPhone ? "cards" : "table"} storageKey="order-ops-waitlist" countUnit="รายการ"
          emptyText={trash ? "ถังขยะว่าง" : "ไม่มีรายการรอของ"}
          renderCard={(r) => (
            <div className="space-y-1 p-1">
              <div className="flex items-start justify-between gap-2"><span className="text-sm">{r.customer_name ?? "-"}</span><span className="flex gap-1">{r.is_trial && <TrialPill />}{informedPill(r)}</span></div>
              <div className="text-xs text-slate-500">{r.platform ?? "-"} · <span className="font-mono">{r.sku ?? "-"}</span>{r.note ? ` · ${r.note}` : ""}</div>
              {!trash && canEdit && <button onClick={(e) => { e.stopPropagation(); void setInformed([r.id], !r.informed, new Map([[r.id, r.informed]])); }} className="mt-1 w-full rounded-md border border-slate-200 py-1.5 text-xs">{r.informed ? "ตั้งเป็นยังไม่แจ้ง" : "แจ้งลูกค้าแล้ว"}</button>}
            </div>
          )}
        />
      )}
      {editing && <WaitForm row={editing === "new" ? null : editing} readOnly={!canEdit || trash} canDelete={canDelete && !trash} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </>
  );
}

function WaitForm({ row, readOnly, canDelete, onClose, onSaved }: { row: Wait | null; readOnly: boolean; canDelete: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const init = useMemo(() => ({ order_no: row?.order_no ?? "", platform: row?.platform ?? "", customer_name: row?.customer_name ?? "", sku: row?.sku ?? "", note: row?.note ?? "", informed: row?.informed ?? false, platform_order_id: null as string | null }), [row]);
  const [f, setF] = useState(init);
  const [items, setItems] = useState<OrderHit["items"]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; action: string; metadata: Record<string, unknown> | null; created_at: string }[]>([]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => { if (row) opsJson<{ history: typeof history }>(`/api/order-ops?t=waitlist&id=${row.id}`).then((r) => setHistory(r.history)).catch(() => {}); }, [row]);

  const save = async () => {
    if (!f.customer_name.trim() && !f.order_no.trim()) { toast.error("กรุณาใส่ชื่อลูกค้าหรือเลขออเดอร์"); return; }
    setSaving(true);
    try {
      const body = { ...f, platform_order_id: f.platform_order_id ?? undefined };
      if (row) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "waitlist", id: row.id, patch: body }) });
      else await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "waitlist", ...body, is_trial: true }) });
      toast.success("บันทึกแล้ว"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "waitlist", ids: [row.id] }) });
      onSaved();
      toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "waitlist", ids: [row.id], restore: true }) }); onSaved(); });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <ERPModal open onClose={onClose} title={row ? "รายการรอของ" : "เพิ่มรายการรอของ"} size="md" defaultExpanded={false} storageKey="order-ops-wait-form"
      hasUnsavedChanges={!readOnly && JSON.stringify(f) !== JSON.stringify(init)}
      footer={readOnly ? undefined : (
        <div className="flex w-full items-center gap-2">
          {row && canDelete && <button onClick={del} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>}
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}>
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label="เลขออเดอร์ (ถ้ามี)">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} onFound={(o) => { setItems(o?.items ?? []); if (o) setF((p) => ({ ...p, platform_order_id: o.id, platform: p.platform || o.platform || "", customer_name: p.customer_name || o.customer_name || "", note: p.note || o.note || "" })); }} /></div>
            <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"><Icon name="list" className="h-4 w-4" /> เลือกออเดอร์</button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ช่องทาง">
            <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
              <option value="">-</option>{[...new Set([...PLATFORMS, ...(f.platform ? [f.platform] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="ชื่อลูกค้า"><input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="สินค้าที่รอ (SKU)"><SkuField value={f.sku} onChange={(v) => set("sku", v)} items={items} /></Field>
        <Field label="หมายเหตุ"><input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น สีน้ำตาล" className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.informed} onChange={(e) => set("informed", e.target.checked)} /> แจ้งลูกค้าแล้ว</label>
      </fieldset>
      {row && <div className="mt-4 border-t border-slate-100 pt-3"><div className="mb-1 text-xs font-medium text-slate-600">ประวัติ</div><HistoryList logs={history} /></div>}
      <PlatformOrderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} existingLabel="มีคำสั่งแล้ว"
        onPick={(o) => setF((p) => ({ ...p, order_no: o.order_no, platform: "", customer_name: "" }))} />
    </ERPModal>
  );
}
