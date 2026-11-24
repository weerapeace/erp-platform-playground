"use client";

// ============================================================
// 🎁 คำสั่งพิเศษออเดอร์ — /order-ops/instructions (แอป ช่องทางขาย/ออเดอร์ออนไลน์)
// ห่อของขวัญ · การ์ด · สลักชื่อ (พิมพ์ใบสลัก) · แก้ไซส์ · แท็บ "รอของ"
// ย้ายจากแอปเก่า order-instruction-manager (2026-11-24 · ช่วงทดลอง ยังไม่ย้ายข้อมูลจริง)
// API /api/order-ops · กติกา lib/order-ops · ชิ้นส่วนร่วม ./shared
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { ENGRAVE_POSITIONS, ENGRAVE_TYPES, INSTRUCTION_STATUS, splitEngraveChars, ENGRAVE_MAX_CHARS } from "@/lib/order-ops";
import {
  Field, HistoryList, OptionsManager, OrderNoField, Pill, SkuField, TrashToggle, TrialBanner, TrialPill,
  fmtDate, inputCls, opsJson, useOpsOptions, type OrderHit,
} from "../shared";

type Ins = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; sku: string | null;
  commands: string[]; engrave: boolean; engrave_text: string | null; engrave_type: string | null; engrave_position: string | null;
  note: string | null; status: "todo" | "done"; done_at: string | null; done_by_name: string | null;
  print_count: number; is_trial: boolean; platform_order_id: string | null; created_at: string; created_by_name: string | null; deleted_at: string | null;
};
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

function Body() {
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") === "wait" ? "wait" : "orders";
  const setView = (v: "orders" | "wait") => router.replace(v === "wait" ? "/order-ops/instructions?view=wait" : "/order-ops/instructions");
  const [summary, setSummary] = useState<Summary>({});
  const [bump, setBump] = useState(0);
  const refresh = () => setBump((b) => b + 1);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">คำสั่งพิเศษออเดอร์</h1>
          <p className="text-sm text-slate-500">ห่อของขวัญ · การ์ด · สลักชื่อ · แก้ไซส์ · รายการรอของ — เด้งเตือนที่หน้าแพ็กของตอนสแกนออเดอร์</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button onClick={() => setView("orders")} className={`rounded-md px-3 py-1 ${view === "orders" ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"}`}>คำสั่งพิเศษ</button>
          <button onClick={() => setView("wait")} className={`rounded-md px-3 py-1 ${view === "wait" ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"}`}>รอของ {summary.waiting ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-700">{summary.waiting}</span> : null}</button>
        </div>
      </div>
      <TrialBanner trialCount={summary.trial ?? 0} onChanged={refresh} />
      {view === "orders"
        ? <OrdersView bump={bump} onSummary={setSummary} onWait={() => setView("wait")} />
        : <WaitView bump={bump} onSummary={setSummary} />}
    </>
  );
}

/* ───────────── แท็บคำสั่งพิเศษ ───────────── */

function OrdersView({ bump, onSummary, onWait }: { bump: number; onSummary: (s: Summary) => void; onWait: () => void }) {
  const toast = useToast();
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const canEdit = usePermission("order_ops.edit");
  const canDelete = usePermission("order_ops.delete");
  const canManage = usePermission("order_ops.manage");
  const { options, reload: reloadOptions } = useOpsOptions();
  const [filter, setFilter] = useState("todo");
  const [q, setQ] = useState("");
  const [trash, setTrash] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Ins[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Ins | "new" | null>(null);
  const [optOpen, setOptOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ t: "instructions", page: String(page), page_size: "50" });
    if (trash) p.set("trash", "1");
    else if (filter === "todo") p.set("status", "todo");
    else if (filter === "engrave") { p.set("status", "todo"); p.set("engrave", "1"); }
    else if (filter === "done") p.set("status", "done");
    if (q.trim()) p.set("q", q.trim());
    try {
      const r = await opsJson<{ rows: Ins[]; total: number; summary: Summary }>(`/api/order-ops?${p}`);
      setRows(r.rows); setTotal(r.total);
      if (!trash) { setSummary(r.summary); onSummary(r.summary); }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [page, trash, filter, q, onSummary]);

  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, bump, q]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filter, trash, q]);

  const sel = rows.filter((r) => selected.has(r.id));

  const bulkStatus = async (status: "todo" | "done") => {
    const ids = sel.map((r) => r.id);
    const prev = sel.map((r) => ({ id: r.id, status: r.status }));
    try {
      const r = await opsJson<{ updated: number }>("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", ids, patch: { status } }) });
      setSelected(new Set()); void load();
      toast.undo(`${status === "done" ? "ทำเครื่องหมายเสร็จ" : "ตั้งเป็นยังไม่ทำ"} ${r.updated} รายการ`, async () => {
        for (const s of ["todo", "done"] as const) {
          const back = prev.filter((x) => x.status === s).map((x) => x.id);
          if (back.length) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", ids: back, patch: { status: s } }) });
        }
        void load();
      });
    } catch (e) { toast.error((e as Error).message); }
  };
  const bulkDelete = async (hard = false) => {
    const ids = sel.map((r) => r.id);
    if (hard && !(await askConfirm({ title: `ลบถาวร ${ids.length} รายการ?`, message: "ลบแล้วกู้คืนไม่ได้", confirmText: "ลบถาวร", variant: "danger" }))) return;
    try {
      const r = await opsJson<{ count: number }>("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids, hard }) });
      setSelected(new Set()); void load();
      if (!hard) toast.undo(`ย้ายลงถังขยะ ${r.count} รายการ`, async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids, restore: true }) }); void load(); });
      else toast.success(`ลบถาวร ${r.count} รายการ`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const restore = async () => {
    try { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids: sel.map((r) => r.id), restore: true }) }); setSelected(new Set()); void load(); toast.success("กู้คืนแล้ว"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const printSheets = (list: Ins[]) => {
    const ids = list.filter((r) => r.engrave && r.engrave_text).map((r) => r.id);
    if (!ids.length) { toast.error("รายการที่เลือกไม่มีชื่อสลัก"); return; }
    window.open(`/print/engrave-sheets?ids=${ids.join(",")}`, "_blank");
  };
  const toggleDone = async (r: Ins) => {
    const to = r.status === "done" ? "todo" : "done";
    try {
      await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", id: r.id, patch: { status: to } }) });
      void load();
      toast.undo(to === "done" ? "เสร็จแล้ว" : "ตั้งเป็นยังไม่ทำ", async () => { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", id: r.id, patch: { status: r.status } }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };

  const cmdChips = (r: Ins) => (
    <div className="flex flex-wrap gap-1">
      {r.commands.map((c) => <Pill key={c}>{c}</Pill>)}
      {r.engrave && r.engrave_text && <Pill tone="accent">สลัก: {r.engrave_text} · {r.engrave_type ?? "-"} · {r.engrave_position ?? "-"}</Pill>}
      {!r.commands.length && !(r.engrave && r.engrave_text) && <span className="text-xs text-slate-400">-</span>}
      {r.note && <span className="w-full text-xs text-slate-500">หมายเหตุ: {r.note}</span>}
    </div>
  );
  const statusPill = (r: Ins) => <Pill tone={INSTRUCTION_STATUS[r.status].tone}>{INSTRUCTION_STATUS[r.status].label}</Pill>;

  const columns: MiniColumn<Ins>[] = [
    { key: "order", header: "ออเดอร์", width: "1.3fr", locked: true, sortValue: (r) => r.order_no, cell: (r) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-mono text-xs">{r.order_no} {r.is_trial && <TrialPill />}</div>
        <div className="truncate text-xs text-slate-500">{r.platform ?? "-"} · {r.customer_name ?? "-"}{r.platform_order_id ? "" : " · ไม่ผูกศูนย์ออเดอร์"}</div>
      </div>) },
    { key: "sku", header: "สินค้า", width: "8rem", sortValue: (r) => r.sku ?? "", cell: (r) => <span className="font-mono text-xs">{r.sku ?? "-"}</span> },
    { key: "cmd", header: "คำสั่ง / สลัก", width: "2fr", cell: cmdChips },
    { key: "status", header: "สถานะ", width: "6.5rem", sortValue: (r) => r.status, cell: (r) => (
      <button disabled={!canEdit || trash} onClick={(e) => { e.stopPropagation(); void toggleDone(r); }} title={canEdit ? "กดสลับ เสร็จ / ยังไม่ทำ" : ""}>{statusPill(r)}</button>) },
    { key: "print", header: "พิมพ์", width: "4rem", align: "center", defaultHidden: isPhone, cell: (r) => r.print_count ? <span className="text-xs text-slate-500">{r.print_count} ครั้ง</span> : <span className="text-xs text-slate-300">-</span> },
    { key: "created", header: "บันทึกเมื่อ", width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-slate-500">{fmtDate(r.created_at)}<br />{r.created_by_name ?? ""}</span> },
  ];

  return (
    <>
      <StatFilterCards
        value={trash ? "" : filter}
        onChange={(k) => { if (k === "waiting") { onWait(); return; } setTrash(false); setFilter(k); }}
        showZero
        cards={[
          { key: "todo", label: "ยังไม่ทำ", value: summary.todo, tone: "warning" },
          { key: "engrave", label: "ต้องสลักชื่อ", value: summary.engrave, tone: "info" },
          { key: "waiting", label: "รอของ (ยังไม่แจ้ง)", value: summary.waiting, tone: "warning" },
          { key: "done", label: "เสร็จวันนี้", value: summary.done_today, tone: "success", hint: "กดดูที่เสร็จทั้งหมด" },
          { key: "all", label: "ทั้งหมด", value: filter === "all" ? total : null, tone: "neutral" },
        ]}
      />
      <div className="my-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / SKU / ชื่อสลัก" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <TrashToggle on={trash} onChange={setTrash} />
        {canManage && <button onClick={() => setOptOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><Icon name="settings" className="h-3.5 w-3.5" /> จัดการคำสั่ง</button>}
        {canEdit && !trash && <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" className="h-4 w-4" /> เพิ่มคำสั่ง</button>}
      </div>

      {sel.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span>เลือก {sel.length} รายการ</span>
          <span className="flex-1" />
          {!trash && <button onClick={() => printSheets(sel)} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs"><Icon name="printer" className="mr-1 inline h-3.5 w-3.5" />พิมพ์ใบสลักชื่อ</button>}
          {!trash && canEdit && <button onClick={() => bulkStatus("done")} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">เสร็จ</button>}
          {!trash && canEdit && <button onClick={() => bulkStatus("todo")} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">ยังไม่ทำ</button>}
          {!trash && canDelete && <button onClick={() => bulkDelete(false)} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบ</button>}
          {trash && canDelete && <button onClick={restore} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">กู้คืน</button>}
          {trash && canManage && <button onClick={() => bulkDelete(true)} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบถาวร</button>}
          <button onClick={() => setSelected(new Set())} className="text-xs text-sky-700 underline">ยกเลิกเลือก</button>
        </div>
      )}

      {error ? <ErrorState title={error} onRetry={load} />
        : loading && !rows.length ? <LoadingState />
        : (
          <MiniTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            hideSearch
            selectable
            selected={selected}
            onSelectedChange={setSelected}
            onRowClick={(r) => setEditing(r)}
            layout={isPhone ? "cards" : "table"}
            storageKey="order-ops-instructions"
            countUnit="รายการ"
            emptyText={trash ? "ถังขยะว่าง" : q ? "ไม่พบรายการ ลองเปลี่ยนคำค้น" : "ยังไม่มีคำสั่งพิเศษ — กด \"เพิ่มคำสั่ง\" หรือ \"ใส่ข้อมูลตัวอย่าง\" เพื่อลองใช้"}
            renderCard={(r) => (
              <div className="space-y-1.5 p-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs">{r.order_no}</span>
                  <span className="flex items-center gap-1">{r.is_trial && <TrialPill />}{statusPill(r)}</span>
                </div>
                <div className="text-xs text-slate-500">{r.platform ?? "-"} · {r.customer_name ?? "-"} · <span className="font-mono">{r.sku ?? "-"}</span></div>
                {cmdChips(r)}
                {!trash && (
                  <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {r.engrave && r.engrave_text && <button onClick={() => printSheets([r])} className="flex-1 rounded-md border border-slate-200 py-1.5 text-xs">พิมพ์สลัก</button>}
                    {canEdit && <button onClick={() => toggleDone(r)} className="flex-1 rounded-md border border-slate-200 py-1.5 text-xs">{r.status === "done" ? "ยังไม่ทำ" : "เสร็จ"}</button>}
                  </div>
                )}
              </div>
            )}
          />
        )}
      <Pager page={page} pageSize={50} total={total} onPage={setPage} unitLabel="รายการ" hideWhenSingle />

      {editing && (
        <InstructionForm
          row={editing === "new" ? null : editing}
          commands={options.filter((o) => o.kind === "instruction_command")}
          readOnly={!canEdit || trash}
          canDelete={canDelete && !trash}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      <OptionsManager open={optOpen} onClose={() => setOptOpen(false)} kind="instruction_command" options={options} onChanged={reloadOptions} />
    </>
  );
}

/* ───────────── ฟอร์มคำสั่งพิเศษ (สร้าง/แก้) ───────────── */

function InstructionForm({ row, commands, readOnly, canDelete, onClose, onSaved }: {
  row: Ins | null; commands: { label: string; is_active: boolean }[]; readOnly: boolean; canDelete: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const init = useMemo(() => ({
    order_no: row?.order_no ?? "", platform: row?.platform ?? "", customer_name: row?.customer_name ?? "", sku: row?.sku ?? "",
    commands: row?.commands ?? [], engrave: row?.engrave ?? false, engrave_text: row?.engrave_text ?? "",
    engrave_type: row?.engrave_type ?? "พิมพ์จม", engrave_position: row?.engrave_position ?? "มุมขวา", note: row?.note ?? "",
    status: row?.status ?? "todo", platform_order_id: row?.platform_order_id ?? null as string | null,
  }), [row]);
  const [f, setF] = useState(init);
  const [items, setItems] = useState<OrderHit["items"]>([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; action: string; metadata: Record<string, unknown> | null; created_at: string }[]>([]);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!row) return;
    opsJson<{ history: typeof history }>(`/api/order-ops?t=instructions&id=${row.id}`).then((r) => setHistory(r.history)).catch(() => {});
  }, [row]);

  const onFound = (o: OrderHit | null) => {
    setItems(o?.items ?? []);
    if (!o) { set("platform_order_id", null); return; }
    setF((p) => ({
      ...p, platform_order_id: o.id,
      platform: p.platform || o.platform || "", customer_name: p.customer_name || o.customer_name || "",
      sku: p.sku || (o.items.length === 1 ? o.items[0].sku ?? "" : ""),
    }));
  };
  const toggleCmd = (c: string) => set("commands", f.commands.includes(c) ? f.commands.filter((x) => x !== c) : [...f.commands, c]);

  const save = async () => {
    if (!f.order_no.trim()) { toast.error("กรุณาใส่เลขออเดอร์"); return; }
    if (f.engrave && !f.engrave_text.trim()) { toast.error("ติ๊กสลักชื่อแล้ว กรุณาใส่ชื่อที่ต้องสลัก"); return; }
    setSaving(true);
    try {
      const body = { ...f, engrave_text: f.engrave ? f.engrave_text : null, engrave_type: f.engrave ? f.engrave_type : null, engrave_position: f.engrave ? f.engrave_position : null };
      if (row) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "instructions", id: row.id, patch: body }) });
      else await opsJson("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "instructions", ...body, is_trial: true }) });
      toast.success("บันทึกแล้ว"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids: [row.id] }) });
      onSaved();
      toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "instructions", ids: [row.id], restore: true }) }); onSaved(); });
    } catch (e) { toast.error((e as Error).message); }
  };

  const chars = splitEngraveChars(f.engrave_text);
  const activeCmds = commands.filter((c) => c.is_active || f.commands.includes(c.label)).map((c) => c.label);

  return (
    <ERPModal
      open onClose={onClose} title={row ? `คำสั่งพิเศษ — ${row.order_no}` : "เพิ่มคำสั่งพิเศษ"} size="lg" defaultExpanded={false}
      storageKey="order-ops-instruction-form" hasUnsavedChanges={dirty && !readOnly}
      footer={readOnly ? undefined : (
        <div className="flex w-full items-center gap-2">
          {row && canDelete && <button onClick={del} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>}
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}
    >
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label="เลขออเดอร์ *">
          <OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} onFound={onFound} autoFocus={!row} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ช่องทาง">
            <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
              <option value="">-</option>
              {[...new Set([...PLATFORMS, ...(f.platform ? [f.platform] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="ชื่อลูกค้า"><input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} /></Field>
          <Field label="สินค้า (SKU)"><SkuField value={f.sku} onChange={(v) => set("sku", v)} items={items} /></Field>
        </div>
        <Field label="คำสั่ง (เลือกได้หลายข้อ)">
          <div className="flex flex-wrap gap-1.5">
            {activeCmds.map((c) => (
              <button key={c} type="button" onClick={() => toggleCmd(c)} className={`rounded-full border px-3 py-1 text-xs ${f.commands.includes(c) ? "border-sky-400 bg-sky-50 font-medium text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c}</button>
            ))}
          </div>
        </Field>
        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={f.engrave} onChange={(e) => set("engrave", e.target.checked)} /> สลักชื่อ
          </label>
          {f.engrave && (
            <div className="mt-2 space-y-2">
              <Field label={`ชื่อที่ต้องสลัก (สูงสุด ${ENGRAVE_MAX_CHARS} ตัว)`}>
                <input value={f.engrave_text} onChange={(e) => set("engrave_text", e.target.value)} placeholder="เช่น Pitchayapa" className={inputCls} />
              </Field>
              <div className="flex flex-wrap gap-4">
                <Field label="รูปแบบ">
                  <div className="flex gap-1">{ENGRAVE_TYPES.map((t) => <button key={t} type="button" onClick={() => set("engrave_type", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_type === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
                </Field>
                <Field label="ตำแหน่ง">
                  <div className="flex gap-1">{ENGRAVE_POSITIONS.map((t) => <button key={t} type="button" onClick={() => set("engrave_position", t)} className={`rounded-md border px-2.5 py-1 text-xs ${f.engrave_position === t ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
                </Field>
              </div>
              {chars.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[420px] grid-cols-10 border border-slate-800 text-center">
                    {Array.from({ length: chars.length > 10 ? 20 : 10 }, (_, i) => (
                      <div key={i} className="flex h-12 items-end justify-center border-r border-t border-slate-800 pb-1 text-2xl font-bold [&:nth-child(10n)]:border-r-0 [&:nth-child(-n+10)]:border-t-0">{chars[i] ?? ""}</div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">ตัวอย่างช่องในใบสลักชื่อ · กดพิมพ์ได้จากหน้ารายการ</p>
                </div>
              )}
            </div>
          )}
        </div>
        <Field label="หมายเหตุ"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} className={inputCls} /></Field>
        {row && (
          <Field label="สถานะ">
            <div className="flex gap-1">{(["todo", "done"] as const).map((s) => <button key={s} type="button" onClick={() => set("status", s)} className={`rounded-md border px-3 py-1 text-xs ${f.status === s ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"}`}>{INSTRUCTION_STATUS[s].label}</button>)}</div>
          </Field>
        )}
      </fieldset>
      {!row && <p className="mt-3 text-[11px] text-amber-700">ช่วงทดลอง: รายการใหม่จะติดป้าย "ทดลอง" และล้างทิ้งได้ทีเดียวตอนเริ่มใช้จริง</p>}
      {row && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">ประวัติ</div>
          <HistoryList logs={history} />
        </div>
      )}
    </ERPModal>
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
          <OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} onFound={(o) => { setItems(o?.items ?? []); if (o) setF((p) => ({ ...p, platform_order_id: o.id, platform: p.platform || o.platform || "", customer_name: p.customer_name || o.customer_name || "" })); }} />
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
    </ERPModal>
  );
}
