"use client";

/**
 * /subscriptions — App Subscription 📝 (อยู่ในพอร์ทัล "งานอื่นๆ" /misc)
 *
 * รวมรายการบริการที่สมัคร (subscription), สรุปยอดต่อเดือน/ปี, แนบใบเสร็จ PDF
 * ใช้ข้อมูลชุดเดียวกับแอปเดิม software-subscriptions.pages.dev (ตาราง subscriptions/subscription_invoices)
 * ของกลาง: PlaygroundShell · DataTable · ERPModal/ConfirmDialog · Toast · guardApi/audit (ฝั่ง API)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CYCLE_LABEL, TYPE_LABEL, monthlyTHB, yearlyTHB, daysUntil, nextRenewal, fmtCost, fmtBaht,
  type SubSettings, type SubInput, type Subscription,
} from "@/lib/subscriptions";
import { SubscriptionFormModal } from "./subscription-form-modal";
import { InvoicesModal } from "./invoices-modal";
import { SubscriptionsCalendar } from "./subscriptions-calendar";
import { WishlistView } from "./wishlist-view";

type ViewMode = "list" | "inuse" | "calendar" | "wishlist";

const DEFAULT_SETTINGS: SubSettings = { exchange_rate: 32, eur_rate: 39, display_currency: "THB" };

export default function SubscriptionsPage() {
  const canView = usePermission("subscriptions.view");
  const canEdit = usePermission("subscriptions.edit");
  const { user } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState<Subscription[]>([]);
  const [settings, setSettings] = useState<SubSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // มุมมอง: รายการ / ปฏิทิน / อยากซื้อ
  const [view, setView] = useState<ViewMode>("list");
  const [testingNotify, setTestingNotify] = useState(false);

  // ฟอร์มเพิ่ม/แก้
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [createDefaults, setCreateDefaults] = useState<Partial<SubInput> | null>(null);
  const [saving, setSaving] = useState(false);

  // ลบ
  const [delTarget, setDelTarget] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ใบเสร็จ
  const [invTarget, setInvTarget] = useState<Subscription | null>(null);

  // อัตราแลกเปลี่ยน (แก้ได้)
  const [usdRate, setUsdRate] = useState(DEFAULT_SETTINGS.exchange_rate);
  const [eurRate, setEurRate] = useState(DEFAULT_SETTINGS.eur_rate);
  const [savingRate, setSavingRate] = useState(false);

  const fetchList = useCallback(async () => {
    const cached = peekSWR<{ data: Subscription[]; settings: SubSettings }>("subscriptions:list");
    if (cached) { setRows(cached.data); setSettings(cached.settings); setUsdRate(cached.settings.exchange_rate); setEurRate(cached.settings.eur_rate); setLoading(false); }
    else setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/subscriptions");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const data = (j.data ?? []) as Subscription[];
      const st = (j.settings ?? DEFAULT_SETTINGS) as SubSettings;
      setRows(data); setSettings(st); setUsdRate(st.exchange_rate); setEurRate(st.eur_rate);
      mutateSWR("subscriptions:list", { data, settings: st });
    } catch (e) { if (!cached) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // ── summary ────────────────────────────────────────────────
  const summary = useMemo(() => {
    const active = rows.filter((r) => r.active);
    let monthly = 0, yearly = 0, renewing = 0;
    for (const s of active) {
      monthly += monthlyTHB(s, settings);
      yearly += yearlyTHB(s, settings);
      const d = daysUntil(nextRenewal(s));
      if (d !== null && d >= 0 && d <= 30) renewing++;
    }
    const wishlist = rows.filter((r) => r.want_to_buy).length;
    return { monthly, yearly, activeCount: active.length, total: rows.length, renewing, wishlist };
  }, [rows, settings]);

  const categories = useMemo(() => rows.map((r) => r.category), [rows]);

  // รายการที่ใช้อยู่ = เปิดอยู่ (active) + จ่ายประจำ (รายเดือน/รายปี) — ตัดจ่ายครั้งเดียวออก
  const inUseRows = useMemo(
    () => rows.filter((r) => r.active && (r.billing_cycle === "monthly" || r.billing_cycle === "yearly")),
    [rows],
  );

  // ── handlers ───────────────────────────────────────────────
  const openCreate = useCallback(() => { setEditing(null); setCreateDefaults(null); setFormOpen(true); }, []);
  const openCreateWishlist = useCallback(() => { setEditing(null); setCreateDefaults({ want_to_buy: true, active: false }); setFormOpen(true); }, []);
  const openEdit = useCallback((s: Subscription) => { setEditing(s); setCreateDefaults(null); setFormOpen(true); }, []);
  const openInvoices = useCallback((s: Subscription) => setInvTarget(s), []);
  const askDelete = useCallback((s: Subscription) => setDelTarget(s), []);

  // จำลองการซื้อ: ย้าย wishlist → รายการใช้งานจริง
  const purchaseItem = useCallback(async (s: Subscription) => {
    try {
      const res = await apiFetch(`/api/subscriptions/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ want_to_buy: false, active: true, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`ย้าย "${s.name}" เป็นรายการใช้งานแล้ว`);
      await fetchList();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
  }, [user?.name, toast, fetchList]);

  // ทดสอบส่งแจ้งเตือนใกล้ต่ออายุเดี๋ยวนี้ (กระดิ่ง+LINE)
  const testNotify = useCallback(async () => {
    setTestingNotify(true);
    try {
      const res = await apiFetch("/api/cron/subscriptions-renewals");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const n = j.due?.length ?? 0;
      if (n > 0) toast.success(`ส่งแจ้งเตือน ${n} รายการแล้ว (กระดิ่ง${j.lineSent ? " + LINE" : ""})`);
      else toast.info("ตอนนี้ยังไม่มีรายการใกล้ต่ออายุ (เกณฑ์ 7/3/1/0 วัน)");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งไม่สำเร็จ"); }
    finally { setTestingNotify(false); }
  }, [toast]);

  const handleSave = useCallback(async (input: SubInput) => {
    setSaving(true);
    try {
      const res = await apiFetch(editing ? `/api/subscriptions/${editing.id}` : "/api/subscriptions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการแล้ว");
      setFormOpen(false);
      await fetchList();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [editing, user?.name, toast, fetchList]);

  const doDelete = useCallback(async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/subscriptions/${delTarget.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ลบรายการแล้ว");
      setDelTarget(null);
      await fetchList();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setDeleting(false); }
  }, [delTarget, toast, fetchList]);

  const saveRates = useCallback(async () => {
    setSavingRate(true);
    try {
      const res = await apiFetch("/api/subscriptions/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchange_rate: usdRate, eur_rate: eurRate }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const st = { ...settings, exchange_rate: usdRate, eur_rate: eurRate };
      setSettings(st); mutateSWR("subscriptions:list", { data: rows, settings: st });
      toast.success("บันทึกอัตราแลกเปลี่ยนแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกอัตราไม่สำเร็จ"); }
    finally { setSavingRate(false); }
  }, [usdRate, eurRate, settings, rows, toast]);

  const rateDirty = usdRate !== settings.exchange_rate || eurRate !== settings.eur_rate;

  // ── columns ────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Subscription>[]>(() => [
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
    { id: "category", accessorKey: "category", header: "หมวดหมู่", size: 130,
      cell: ({ getValue }) => <span className="text-xs text-slate-600">{(getValue() as string) || "—"}</span> },
    { id: "type", accessorKey: "type", header: "ประเภท", size: 90,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{TYPE_LABEL[getValue() as keyof typeof TYPE_LABEL] ?? "—"}</span> },
    { id: "billing_cycle", accessorKey: "billing_cycle", header: "รอบบิล", size: 110,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{CYCLE_LABEL[getValue() as keyof typeof CYCLE_LABEL] ?? "—"}</span> },
    {
      id: "cost", accessorKey: "cost", header: "ราคา", size: 110,
      cell: ({ row }) => <span className="text-sm font-mono tabular-nums text-slate-700">{fmtCost(Number(row.original.cost), row.original.currency)}</span>,
    },
    {
      id: "monthly_thb", header: "≈ ฿/เดือน", size: 110,
      accessorFn: (r) => monthlyTHB(r, settings),
      cell: ({ getValue }) => { const v = getValue() as number; return <span className="text-sm font-mono tabular-nums text-slate-500">{v ? fmtBaht(v) : "—"}</span>; },
    },
    {
      id: "billing_date", header: "ต่ออายุ (รอบถัดไป)", size: 150,
      accessorFn: (r) => { const d = daysUntil(nextRenewal(r)); return d ?? 999999; },
      cell: ({ row }) => {
        const s = row.original;
        const nr = nextRenewal(s);
        const d = daysUntil(nr);
        if (!nr) return <span className="text-xs text-slate-300">—</span>;
        const cls = d === null ? "bg-slate-100 text-slate-400"
          : d < 0 ? "bg-slate-100 text-slate-500"
          : d <= 7 ? "bg-red-100 text-red-600"
          : d <= 30 ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
        const txt = d === null ? "—" : d < 0 ? `เลย ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`;
        return (
          <div className="leading-tight">
            <span className={`text-[11px] px-2 py-0.5 rounded ${cls}`}>{txt}</span>
            <div className="text-[10px] text-slate-400 mt-0.5">{nr}</div>
          </div>
        );
      },
    },
    {
      id: "status", accessorKey: "active", header: "สถานะ", size: 150,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            <span className={`text-[11px] px-2 py-0.5 rounded ${s.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.active ? "ใช้งาน" : "ปิด"}</span>
            {s.want_to_buy && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">🛒 อยากซื้อ</span>}
            {s.pending_cancel && <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">⏳ ยกเลิก</span>}
          </div>
        );
      },
    },
    {
      id: "actions", header: "", size: 130, enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => openInvoices(s)} title="ใบเสร็จ"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">🧾</button>
            {canEdit && (
              <>
                <button onClick={() => openEdit(s)} title="แก้ไข"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                <button onClick={() => askDelete(s)} title="ลบ"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
              </>
            )}
          </div>
        );
      },
    },
  ], [settings, canEdit, openEdit, openInvoices, askDelete]);

  const views = useMemo(() => [
    { id: "all", label: "ทั้งหมด", filter: () => true },
    { id: "active", label: "✅ ใช้งานอยู่", filter: (r: Record<string, unknown>) => r.active === true },
    { id: "inactive", label: "💤 ปิดอยู่", filter: (r: Record<string, unknown>) => r.active === false },
    { id: "renewing", label: "⏰ ใกล้ต่ออายุ", filter: (r: Record<string, unknown>) => {
        const d = daysUntil(r.billing_date as string | null);
        return r.active === true && r.billing_cycle !== "one-time" && d !== null && d >= 0 && d <= 30;
      } },
    { id: "wishlist", label: "🛒 อยากซื้อ", filter: (r: Record<string, unknown>) => r.want_to_buy === true },
    { id: "cancelling", label: "⏳ กำลังยกเลิก", filter: (r: Record<string, unknown>) => r.pending_cancel === true },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-indigo-50/50 to-white">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 py-4 space-y-3">
          {/* หัวข้อ */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-indigo-700 flex items-center gap-2">📝 App Subscription</h1>
              <p className="text-sm text-slate-500 mt-0.5">รวมบริการที่สมัคร (subscription) · สรุปค่าใช้จ่าย · เก็บใบเสร็จ</p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button onClick={testNotify} disabled={testingNotify} title="เช็ครายการใกล้ต่ออายุแล้วส่งแจ้งเตือนเดี๋ยวนี้"
                  className="h-10 px-3 text-sm font-medium border border-indigo-200 text-indigo-600 bg-white rounded-lg hover:bg-indigo-50 disabled:opacity-50">
                  {testingNotify ? "กำลังส่ง…" : "🔔 ทดสอบแจ้งเตือน"}
                </button>
                <button onClick={openCreate} className="h-10 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm">+ เพิ่มรายการ</button>
              </div>
            )}
          </div>

          {/* แถบสรุป + อัตราแลกเปลี่ยน (แถวเดียว ให้ตารางเหลือพื้นที่มากที่สุด) */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-white border border-slate-100 rounded-xl px-4 py-2 shadow-sm">
            <Metric icon="📅" label="ต่อเดือน" value={fmtBaht(summary.monthly)} valueClass="text-indigo-700" />
            <Metric icon="📆" label="ต่อปี" value={fmtBaht(summary.yearly)} valueClass="text-violet-700" />
            <Metric icon="✅" label="ใช้งาน" value={`${summary.activeCount}/${summary.total}`} valueClass="text-emerald-700" />
            <Metric icon="⏰" label="ใกล้ต่ออายุ" value={String(summary.renewing)} valueClass="text-amber-700" />
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <span className="text-xs font-medium text-slate-400">อัตรา (฿)</span>
            <label className="flex items-center gap-1 text-sm text-slate-600">USD
              <input type="number" step="0.01" value={usdRate} disabled={!canEdit}
                onChange={(e) => setUsdRate(Number(e.target.value) || 0)}
                className="w-16 h-8 px-2 border border-slate-200 rounded-md text-sm tabular-nums disabled:bg-slate-50" />
            </label>
            <label className="flex items-center gap-1 text-sm text-slate-600">EUR
              <input type="number" step="0.01" value={eurRate} disabled={!canEdit}
                onChange={(e) => setEurRate(Number(e.target.value) || 0)}
                className="w-16 h-8 px-2 border border-slate-200 rounded-md text-sm tabular-nums disabled:bg-slate-50" />
            </label>
            {canEdit && rateDirty && (
              <button onClick={saveRates} disabled={savingRate}
                className="h-8 px-3 text-xs font-medium bg-slate-800 text-white rounded-md hover:bg-slate-900 disabled:opacity-50">
                {savingRate ? "กำลังบันทึก…" : "💾 บันทึก"}
              </button>
            )}
          </div>

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

          {/* สลับมุมมอง */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { k: "list", label: "📋 รายการ" },
              { k: "inuse", label: `🟢 ใช้อยู่${inUseRows.length ? ` (${inUseRows.length})` : ""}` },
              { k: "calendar", label: "📅 ปฏิทิน" },
              { k: "wishlist", label: `🛒 อยากซื้อ${summary.wishlist ? ` (${summary.wishlist})` : ""}` },
            ] as { k: ViewMode; label: string }[]).map((t) => (
              <button key={t.k} onClick={() => setView(t.k)}
                className={`h-8 px-3 text-sm rounded-md transition ${view === t.k ? "bg-white shadow-sm text-indigo-700 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* เนื้อหาตามมุมมอง */}
          {view === "inuse" && (
            <p className="text-xs text-slate-500 -mb-1">รายการที่เปิดใช้งานอยู่ และจ่ายประจำ (รายเดือน/รายปี) เท่านั้น — ไม่รวมรายการปิด/จ่ายครั้งเดียว</p>
          )}
          {(view === "list" || view === "inuse") && (
            <DataTable
              tableId={view === "inuse" ? "subscriptions-inuse" : "subscriptions"}
              data={view === "inuse" ? inUseRows : rows}
              columns={columns}
              views={view === "inuse" ? undefined : views}
              loading={loading}
              searchableKeys={["name", "category", "account_email", "notes"]}
              searchPlaceholder="ค้นหา ชื่อ / หมวดหมู่ / อีเมล…"
              exportFilename={view === "inuse" ? "subscriptions-inuse" : "subscriptions"}
              exportEntityType="subscriptions"
              pageSize={25}
              emptyMessage={view === "inuse" ? "ยังไม่มีรายการที่ใช้อยู่ (รายเดือน/รายปี)" : "ยังไม่มีรายการ subscription"}
              onRowClick={canEdit ? openEdit : openInvoices}
            />
          )}
          {view === "calendar" && (
            <SubscriptionsCalendar rows={rows} settings={settings} onEditSub={canEdit ? openEdit : openInvoices} />
          )}
          {view === "wishlist" && (
            <WishlistView rows={rows} settings={settings} canEdit={canEdit}
              onAdd={openCreateWishlist} onEdit={openEdit} onDelete={askDelete} onPurchase={purchaseItem} />
          )}
        </div>
      </div>

      {/* ป๊อปอัป */}
      <SubscriptionFormModal open={formOpen} editing={editing} categories={categories} saving={saving} defaults={createDefaults}
        onClose={() => !saving && setFormOpen(false)} onSave={handleSave} />

      <InvoicesModal sub={invTarget} canEdit={canEdit} onClose={() => setInvTarget(null)} />

      <ConfirmDialog open={!!delTarget} variant="danger" loading={deleting}
        title="ลบรายการ subscription?"
        message={<>ต้องการลบ <b>{delTarget?.name}</b> ออกถาวรหรือไม่?<br /><span className="text-xs text-slate-400">ใบเสร็จที่แนบไว้จะถูกลบด้วย</span></>}
        confirmText="ลบรายการ" onClose={() => !deleting && setDelTarget(null)} onConfirm={doDelete} />
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
