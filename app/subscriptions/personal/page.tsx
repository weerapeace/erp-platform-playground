"use client";

/**
 * /subscriptions/personal — "รายการส่วนตัว" แยกตาม user ที่ล็อกอิน
 *
 * - เห็นเฉพาะรายการส่วนตัวของตัวเอง (owner_id = me) + ที่มีคนแชร์ลิสต์ให้ (view-only)
 * - แชร์ลิสต์ส่วนตัวของตัวเองให้คนอื่นดูได้ (ระดับทั้งหน้า)
 * ของกลาง: PlaygroundShell · DataTable · ERPModal/ConfirmDialog · Toast · SubscriptionsBoard · MultiUserPicker
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CYCLE_LABEL, monthlyTHB, yearlyTHB, daysUntil, nextRenewal, fmtCost, fmtBaht, subStatusLabel,
  type SubSettings, type SubInput, type Subscription, type StreamingService,
} from "@/lib/subscriptions";
import { SubscriptionFormModal } from "../subscription-form-modal";
import { InvoicesModal } from "../invoices-modal";
import { DownloadInvoiceModal } from "../download-invoice-modal";
import { SubscriptionsBoard, GROUP_OPTIONS, boardPatchFor, type BoardGroupBy } from "../subscriptions-board";
import { PersonalShareModal, type ShareUser } from "../personal-share-modal";
import { StreamingView } from "./streaming-view";

type SharedSub = Subscription & { owner_label?: string };
const DEFAULT_SETTINGS: SubSettings = { exchange_rate: 32, eur_rate: 39, display_currency: "THB" };
const PERSONAL_DEFAULTS: Partial<SubInput> = { type: "personal" };

export default function PersonalSubscriptionsPage() {
  const canView = usePermission("subscriptions.view");
  const { user } = useAuth();
  const toast = useToast();

  const [mine, setMine] = useState<Subscription[]>([]);
  const [shared, setShared] = useState<SharedSub[]>([]);
  const [sharedWith, setSharedWith] = useState<ShareUser[]>([]);
  const [services, setServices] = useState<StreamingService[]>([]);
  const [settings, setSettings] = useState<SubSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "board" | "streaming">("list");
  const [boardGroupBy, setBoardGroupBy] = useState<BoardGroupBy>("status");

  // ป๊อปอัป
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [invTarget, setInvTarget] = useState<{ sub: Subscription; canEdit: boolean } | null>(null);
  const [dlTarget, setDlTarget] = useState<{ sub: Subscription; canEdit: boolean } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/subscriptions/personal");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setMine((j.mine ?? []) as Subscription[]);
      setShared((j.shared ?? []) as SharedSub[]);
      setSharedWith((j.sharedWith ?? []) as ShareUser[]);
      setServices((j.services ?? []) as StreamingService[]);
      setSettings((j.settings ?? DEFAULT_SETTINGS) as SubSettings);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchData(); }, [canView, fetchData]);

  const summary = useMemo(() => {
    let monthly = 0, yearly = 0, active = 0;
    for (const s of mine) {
      if (!s.active) continue;
      active++; monthly += monthlyTHB(s, settings); yearly += yearlyTHB(s, settings);
    }
    return { monthly, yearly, active, total: mine.length };
  }, [mine, settings]);

  const categories = useMemo(() => mine.map((r) => r.category), [mine]);
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  // ── streaming catalog ──────────────────────────────────────
  const addStreaming = useCallback(async (name: string): Promise<StreamingService | null> => {
    try {
      const res = await apiFetch("/api/subscriptions/streaming-services", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const svc = j.data as StreamingService;
      setServices((prev) => [...prev, svc].sort((a, b) => a.name.localeCompare(b.name)));
      return svc;
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); return null; }
  }, [user?.name, toast]);

  const renameStreaming = useCallback(async (id: string, name: string) => {
    try {
      const res = await apiFetch(`/api/subscriptions/streaming-services/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)).sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("เปลี่ยนชื่อแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
  }, [user?.name, toast]);

  const deleteStreaming = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/subscriptions/streaming-services/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setServices((prev) => prev.filter((s) => s.id !== id));
      await fetchData(); // อัปเดต mine.streaming ที่ถูกถอด id ออก
      toast.success("ลบบริการแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [fetchData, toast]);

  // ── handlers ───────────────────────────────────────────────
  const openCreate = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  const openEdit = useCallback((s: Subscription) => { setEditing(s); setFormOpen(true); }, []);

  const handleSave = useCallback(async (input: SubInput) => {
    setSaving(true);
    try {
      const res = await apiFetch(editing ? `/api/subscriptions/${editing.id}` : "/api/subscriptions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // บังคับ type=personal เสมอ (owner ตั้งฝั่ง server)
        body: JSON.stringify({ ...input, type: "personal", actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการส่วนตัวแล้ว");
      setFormOpen(false);
      await fetchData();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [editing, user?.name, toast, fetchData]);

  const doDelete = useCallback(async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/subscriptions/${delTarget.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ลบรายการแล้ว");
      setDelTarget(null);
      await fetchData();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setDeleting(false); }
  }, [delTarget, toast, fetchData]);

  const boardMove = useCallback(async (sub: Subscription, toKey: string) => {
    const patch = boardPatchFor(boardGroupBy, toKey);
    if (!Object.keys(patch).length) return;
    setMine((prev) => prev.map((r) => (r.id === sub.id ? { ...r, ...patch } : r)));
    try {
      const res = await apiFetch(`/api/subscriptions/${sub.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ย้ายการ์ดไม่สำเร็จ");
      await fetchData();
    }
  }, [boardGroupBy, user?.name, toast, fetchData]);

  // ── columns ────────────────────────────────────────────────
  const baseColumns = useCallback((opts: { owner?: boolean; actions?: boolean; canEdit?: boolean; streaming?: boolean }): ColumnDef<SharedSub>[] => {
    const cols: ColumnDef<SharedSub>[] = [
      {
        id: "name", accessorKey: "name", header: "ชื่อรายการ", size: 220,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 truncate">{s.name}</div>
              {s.account_email && <div className="text-[11px] text-slate-400 truncate">{s.account_email}</div>}
            </div>
          );
        },
      },
    ];
    if (opts.owner) {
      cols.push({
        id: "owner", header: "เจ้าของ", size: 130,
        accessorFn: (r) => r.owner_label ?? "",
        cell: ({ getValue }) => <span className="text-xs text-slate-600">👤 {(getValue() as string) || "—"}</span>,
      });
    }
    cols.push(
      { id: "category", accessorKey: "category", header: "หมวดหมู่", size: 120,
        meta: { filterable: true, filterType: "select", filterLabel: "หมวดหมู่" },
        cell: ({ getValue }) => <span className="text-xs text-slate-600">{(getValue() as string) || "—"}</span> },
      { id: "billing_cycle", accessorKey: "billing_cycle", header: "รอบบิล", size: 100,
        cell: ({ getValue }) => <span className="text-xs text-slate-500">{CYCLE_LABEL[getValue() as keyof typeof CYCLE_LABEL] ?? "—"}</span> },
      { id: "cost", accessorKey: "cost", header: "ราคา", size: 100,
        cell: ({ row }) => <span className="text-sm font-mono tabular-nums text-slate-700">{fmtCost(Number(row.original.cost), row.original.currency)}</span> },
      { id: "monthly_thb", header: "≈ ฿/เดือน", size: 100,
        accessorFn: (r) => monthlyTHB(r, settings),
        cell: ({ getValue }) => { const v = getValue() as number; return <span className="text-sm font-mono tabular-nums text-slate-500">{v ? fmtBaht(v) : "—"}</span>; } },
      { id: "billing_date", header: "ต่ออายุ (รอบถัดไป)", size: 150,
        accessorFn: (r) => { const d = daysUntil(nextRenewal(r)); return d ?? 999999; },
        cell: ({ row }) => {
          const s = row.original; const nr = nextRenewal(s); const d = daysUntil(nr);
          if (!nr) return <span className="text-xs text-slate-300">—</span>;
          const cls = d === null ? "bg-slate-100 text-slate-400" : d < 0 ? "bg-slate-100 text-slate-500"
            : d <= 7 ? "bg-red-100 text-red-600" : d <= 30 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
          const txt = d === null ? "—" : d < 0 ? `เลย ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`;
          return (
            <div className="leading-tight">
              <span className={`text-[11px] px-2 py-0.5 rounded ${cls}`}>{txt}</span>
              <div className="text-[10px] text-slate-400 mt-0.5">{nr}</div>
            </div>
          );
        } },
      { id: "status", header: "สถานะ", size: 150,
        accessorFn: (r) => subStatusLabel(r),
        meta: { filterable: true, filterType: "select", filterLabel: "สถานะ" },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex flex-wrap gap-1">
              <span className={`text-[11px] px-2 py-0.5 rounded ${s.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.active ? "ใช้งาน" : "ปิด"}</span>
              {s.want_to_buy && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">🛒 อยากซื้อ</span>}
              {s.pending_cancel && <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">⏳ ยกเลิก</span>}
            </div>
          );
        } },
    );
    if (opts.streaming) {
      cols.push({
        id: "streaming", header: "📺 Streaming", size: 200, enableSorting: false,
        cell: ({ row }) => {
          const ids = (row.original.streaming ?? []).filter((id) => serviceMap.has(id));
          if (!ids.length) return <span className="text-xs text-slate-300">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {ids.map((id) => <span key={id} className="text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{serviceMap.get(id)}</span>)}
            </div>
          );
        },
      });
    }
    if (opts.actions) {
      cols.push({
        id: "actions", header: "", size: opts.canEdit ? 160 : 90, enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setDlTarget({ sub: s, canEdit: !!opts.canEdit })} title="ดาวน์โหลดใบเสร็จ (เปิดหน้าบิล + ดูเมล/โปรไฟล์)"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-indigo-200 text-xs text-indigo-600 hover:bg-indigo-50">⬇️</button>
              <button onClick={() => setInvTarget({ sub: s, canEdit: !!opts.canEdit })} title="ใบเสร็จที่แนบไว้ (PDF/รูป) — กดเพื่อดูหรือแนบเพิ่ม"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">🧾</button>
              {opts.canEdit && (
                <>
                  <button onClick={() => openEdit(s)} title="แก้ไข"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                  <button onClick={() => setDelTarget(s)} title="ลบ"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
                </>
              )}
            </div>
          );
        },
      });
    }
    return cols;
  }, [settings, openEdit, serviceMap]);

  const mineColumns = useMemo(() => baseColumns({ actions: true, canEdit: true, streaming: services.length > 0 }), [baseColumns, services.length]);
  const sharedColumns = useMemo(() => baseColumns({ owner: true, actions: true, canEdit: false }), [baseColumns]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-violet-50/50 to-white">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-4 space-y-3">
          {/* หัวข้อ */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-violet-700 flex items-center gap-2">👤 รายการส่วนตัว</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                เฉพาะรายการของคุณ (คนอื่นไม่เห็น) · แชร์ให้คนที่เลือกดูได้ ·{" "}
                <Link href="/subscriptions" className="text-indigo-600 hover:underline">← กลับหน้ารวม (งาน/บริษัท)</Link>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShareOpen(true)} title="เลือกคนที่จะให้ดูลิสต์ส่วนตัวของคุณ"
                className="h-10 px-3 text-sm font-medium border border-violet-200 text-violet-700 bg-white rounded-lg hover:bg-violet-50">
                👥 แชร์ให้คนดู{sharedWith.length ? ` (${sharedWith.length})` : ""}
              </button>
              <button onClick={openCreate} className="h-10 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 shadow-sm">+ เพิ่มรายการส่วนตัว</button>
            </div>
          </div>

          {/* สรุป */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-white border border-slate-100 rounded-xl px-4 py-2 shadow-sm">
            <Metric icon="📅" label="ต่อเดือน" value={fmtBaht(summary.monthly)} valueClass="text-violet-700" />
            <Metric icon="📆" label="ต่อปี" value={fmtBaht(summary.yearly)} valueClass="text-fuchsia-700" />
            <Metric icon="✅" label="ใช้งาน" value={`${summary.active}/${summary.total}`} valueClass="text-emerald-700" />
            {sharedWith.length > 0 && (
              <>
                <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                <span className="text-xs text-slate-500">🔗 แชร์ให้: {sharedWith.map((u) => u.name).join(", ")}</span>
              </>
            )}
          </div>

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

          {/* สลับมุมมอง */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([{ k: "list", label: "📋 ตาราง" }, { k: "board", label: "🗂 บอร์ด" }, { k: "streaming", label: `📺 Streaming${services.length ? ` (${services.length})` : ""}` }] as { k: "list" | "board" | "streaming"; label: string }[]).map((t) => (
              <button key={t.k} onClick={() => setView(t.k)}
                className={`h-8 px-3 text-sm rounded-md transition ${view === t.k ? "bg-white shadow-sm text-violet-700 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* รายการของฉัน */}
          {view === "list" && (
            <DataTable
              tableId="subscriptions-my-personal"
              data={mine as SharedSub[]}
              columns={mineColumns}
              loading={loading}
              searchableKeys={["name", "category", "account_email", "notes"]}
              searchPlaceholder="ค้นหา ชื่อ / หมวดหมู่ / อีเมล…"
              exportFilename="my-personal-subscriptions"
              exportEntityType="subscriptions"
              pageSize={25}
              emptyMessage="ยังไม่มีรายการส่วนตัว — กดปุ่ม + เพิ่มรายการส่วนตัว ด้านบนขวา"
              onRowClick={openEdit}
            />
          )}
          {view === "board" && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>จัดกลุ่มตาม:</span>
                <select value={boardGroupBy} onChange={(e) => setBoardGroupBy(e.target.value as BoardGroupBy)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700">
                  {GROUP_OPTIONS.filter((o) => o.key !== "type").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <span className="text-[11px] text-slate-400 ml-1 hidden sm:inline">ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยน · คลิกการ์ดเพื่อแก้</span>
              </div>
              <SubscriptionsBoard rows={mine} settings={settings} groupBy={boardGroupBy} onEdit={openEdit} onMove={boardMove} />
            </div>
          )}
          {view === "streaming" && (
            <StreamingView services={services} mine={mine}
              onAdd={addStreaming} onRename={renameStreaming} onDelete={deleteStreaming} onEditSub={openEdit} />
          )}

          {/* แชร์ให้ฉัน (view-only) */}
          {shared.length > 0 && (
            <div className="pt-2 space-y-2">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">🔗 แชร์ให้ฉัน <span className="text-xs font-normal text-slate-400">(ดูอย่างเดียว — แก้ไม่ได้)</span></h2>
              <DataTable
                tableId="subscriptions-shared-to-me"
                data={shared}
                columns={sharedColumns}
                loading={loading}
                searchableKeys={["name", "category", "account_email"]}
                searchPlaceholder="ค้นหารายการที่แชร์มา…"
                exportFilename="shared-personal-subscriptions"
                exportEntityType="subscriptions"
                pageSize={25}
                emptyMessage="ยังไม่มีรายการที่แชร์ให้คุณ"
                onRowClick={(s) => setInvTarget({ sub: s as Subscription, canEdit: false })}
              />
            </div>
          )}
        </div>
      </div>

      {/* ป๊อปอัป */}
      <SubscriptionFormModal open={formOpen} editing={editing} categories={categories} saving={saving} defaults={PERSONAL_DEFAULTS}
        streamingServices={services} onQuickAddStreaming={addStreaming}
        onClose={() => !saving && setFormOpen(false)} onSave={handleSave} />

      <InvoicesModal sub={invTarget?.sub ?? null} canEdit={invTarget?.canEdit ?? false} onClose={() => setInvTarget(null)} />

      <DownloadInvoiceModal sub={dlTarget?.sub ?? null} canEdit={dlTarget?.canEdit ?? false}
        onClose={() => setDlTarget(null)}
        onEdit={(s) => { setDlTarget(null); openEdit(s); }} />

      <ConfirmDialog open={!!delTarget} variant="danger" loading={deleting}
        title="ลบรายการส่วนตัว?"
        message={<>ต้องการลบ <b>{delTarget?.name}</b> ออกถาวรหรือไม่?<br /><span className="text-xs text-slate-400">ใบเสร็จที่แนบไว้จะถูกลบด้วย</span></>}
        confirmText="ลบรายการ" onClose={() => !deleting && setDelTarget(null)} onConfirm={doDelete} />

      <PersonalShareModal open={shareOpen} sharedWith={sharedWith} actorName={user?.name}
        onClose={() => setShareOpen(false)} onSaved={fetchData} />
    </PlaygroundShell>
  );
}

function Metric({ icon, label, value, valueClass }: { icon: string; label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base">{icon}</span>
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
