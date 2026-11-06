"use client";

// ============================================================
// 🤖 ศูนย์ AI และ API ที่เสียเงิน — ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหน · เปิด-ปิด (ทั้งบริการ / รายที่) · เปลี่ยนโมเดล
//    งบต่อเดือน (ใกล้เต็มแจ้งเตือน · เกินงบหยุด/แจ้งเตือนอย่างเดียว) · ยอดใช้เดือนนี้ + รายคน
// ทะเบียนจุดที่ใช้ = lib/paid-services (ของกลาง · เพิ่มจุดใหม่ต้องลงทะเบียน — เทสต์ paid-services-guard บังคับ)
// ด่านกลาง = lib/paid-services-server · ข้อมูลผ่าน /api/admin/paid-services (admin.paid_services)
// ของกลาง: MiniTable (ค้นหา/เรียง/จัดกลุ่ม/กางแถว) · ConfirmDialog (ยืนยันก่อนปิด) · Toast
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { SimpleBarChart } from "@/components/bar-chart";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { PROVIDER_LABEL, type BudgetState, type PaidBudget, type PaidProvider, type PaidService } from "@/lib/paid-services";

type Stat = { calls: number; failed: number; cost_thb: number; tokens: number };
type PlaceRow = { key: string; th: string; enabled: boolean; model: string | null; month: Stat; last_used_at: string | null; updated_by_name: string | null };
type Row = Omit<PaidService, "places"> & {
  enabled: boolean; model: string | null; configured: boolean | null; month: Stat;
  last_used_at: string | null; updated_at: string | null; updated_by_name: string | null; places: PlaceRow[];
};
type UserRow = { user_id: string | null; name: string; calls: number; failed: number; cost_thb: number; top: { key: string; th: string; calls: number }[] };
type ModelChoice = { id: string; label: string; note: string; inPerM: number; outPerM: number };
type OffTarget = { row: Row; place: PlaceRow | null };

const baht = (n: number) => (n === 0 ? "฿0" : n < 1 ? `฿${n.toFixed(2)}` : `฿${n.toLocaleString("th-TH", { maximumFractionDigits: n < 100 ? 1 : 0 })}`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

export default function PaidServicesPage() {
  return <PlaygroundShell><PaidServicesView /></PlaygroundShell>;
}

function PaidServicesView() {
  const canManage = usePermission("admin.paid_services");
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [totals, setTotals] = useState({ calls: 0, failed: 0, cost_thb: 0 });
  const [budget, setBudget] = useState<PaidBudget>({ monthly_thb: null, warn_pct: 80, over_action: "stop", per_service: {} });
  const [bState, setBState] = useState<BudgetState>("none");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaidProvider | "">("");
  const [confirmOff, setConfirmOff] = useState<OffTarget | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/paid-services");
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.services ?? []); setTotals(j.totals ?? { calls: 0, failed: 0, cost_thb: 0 }); setModels(j.model_choices ?? []);
      setBudget(j.budget); setBState(j.budget_state ?? "none"); setUsers(j.by_user ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const save = async (r: Row, patch: { enabled?: boolean; model?: string }, place?: PlaceRow) => {
    const id = place ? `${r.key}@${place.key}` : r.key;
    setBusy(id);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: r.key, ...(place ? { place: place.key } : {}), ...patch }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows((cur) => cur.map((x) => {
        if (x.key !== r.key) return x;
        if (place) return { ...x, places: x.places.map((p) => (p.key === place.key ? { ...p, enabled: j.data.enabled, model: j.data.model, updated_by_name: j.data.updated_by_name } : p)) };
        return { ...x, enabled: j.data.enabled, model: j.data.model, updated_at: j.data.updated_at, updated_by_name: j.data.updated_by_name };
      }));
      const label = place ? `${r.th} · ${place.th}` : r.th;
      toast.success("enabled" in patch ? (patch.enabled ? `เปิด "${label}" แล้ว` : `ปิด "${label}" แล้ว`) : `เปลี่ยนโมเดลของ "${label}" แล้ว`);
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const saveServiceBudget = async (r: Row, value: string) => {
    const cur = budget.per_service[r.key] ?? null;
    const next = value.trim() ? Number(value) : null;
    if ((next ?? null) === cur || (next !== null && (!Number.isFinite(next) || next < 0))) return;
    setBusy(`${r.key}:budget`);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget_service: { key: r.key, monthly_thb: next } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setBudget(j.data.budget);
      toast.success(j.data.budget.per_service[r.key] ? `ตั้งงบ "${r.th}" ฿${j.data.budget.per_service[r.key].toLocaleString("th-TH")}/เดือน แล้ว` : `ยกเลิกงบของ "${r.th}" แล้ว (ไม่จำกัด)`);
    } catch (e) { toast.error(`บันทึกงบไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const providers = useMemo(() => {
    const m = new Map<PaidProvider, number>();
    for (const r of rows) m.set(r.provider, (m.get(r.provider) ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);
  const shown = useMemo(() => rows.filter((r) => !provider || r.provider === provider), [rows, provider]);
  const onCount = rows.filter((r) => r.enabled).length;
  const notSet = [...new Set(rows.filter((r) => r.configured === false).map((r) => PROVIDER_LABEL[r.provider]))];
  const groupOrder = useMemo(() => { const order = [...new Set(rows.map((r) => r.group))]; return (g: string) => order.indexOf(g); }, [rows]);
  const toggleOpen = (k: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const columns: MiniColumn<Row>[] = [
    {
      key: "what", header: "ใช้ทำอะไร · อยู่หน้าไหน", width: "minmax(0,2fr)", sortValue: (r) => r.th, sortLabel: "ชื่อ",
      cell: (r) => (
        <div className={`min-w-0 ${r.enabled ? "" : "opacity-60"}`}>
          <div className="font-medium text-slate-800">{r.th}</div>
          <div className="text-xs text-slate-500">ใช้ที่: {r.usedAt}</div>
          <div className="text-[11px] text-slate-400">ถ้าปิด: {r.offBehavior}</div>
          {r.places.length > 0 && (
            <button type="button" onClick={() => toggleOpen(r.key)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
              <Icon name="sliders" /> เปิด-ปิดรายที่ ({r.places.length} ที่{r.places.some((p) => !p.enabled) ? ` · ปิด ${r.places.filter((p) => !p.enabled).length}` : ""})
            </button>
          )}
        </div>
      ),
    },
    {
      key: "provider", header: "ผู้ให้บริการ", width: "9rem", sortValue: (r) => PROVIDER_LABEL[r.provider], sortLabel: "ผู้ให้บริการ",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{PROVIDER_LABEL[r.provider]}</span>
          {r.configured === false && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700" title="ยังไม่ได้ใส่รหัสของผู้ให้บริการนี้ใน Vercel — ตอนนี้ฟีเจอร์นี้ยังไม่ทำงานจริง">ยังไม่ตั้งรหัส</span>}
        </div>
      ),
    },
    {
      key: "model", header: "โมเดล / ราคา", width: "13rem",
      cell: (r) => r.kind === "ai_chat" ? (
        <div className="flex flex-col gap-1">
          <select value={r.model ?? ""} disabled={!r.enabled || busy === r.key} onChange={(e) => void save(r, { model: e.target.value })}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs outline-none focus:border-blue-400 disabled:opacity-50">
            <option value="">ค่าเดิมของระบบ</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {(() => { const m = models.find((x) => x.id === r.model); return m ? <span className="text-[11px] text-slate-400">{m.note} · เข้า ฿{m.inPerM}/ออก ฿{m.outPerM} ต่อ 1 ล้านคำ</span> : null; })()}
          <ServiceBudgetInput cap={budget.per_service[r.key] ?? null} spent={r.month.cost_thb} warnPct={budget.warn_pct}
            disabled={busy === `${r.key}:budget`} onSave={(v) => void saveServiceBudget(r, v)} />
        </div>
      ) : <span className="text-xs text-slate-500">{r.costHint}</span>,
    },
    {
      key: "month", header: "เดือนนี้", width: "8rem", align: "right", sortValue: (r) => r.month.cost_thb * 1e6 + r.month.calls, sortLabel: "ยอดใช้เดือนนี้",
      cell: (r) => <MonthCell s={r.month} showCost={r.kind === "ai_chat"} last={r.last_used_at} />,
    },
    {
      key: "on", header: "เปิด", width: "5.5rem", align: "center", sortValue: (r) => (r.enabled ? 1 : 0), sortLabel: "เปิด/ปิด",
      cell: (r) => r.kind === "locked" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500" title={r.offBehavior}><Icon name="lock" /> ล็อก</span>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <Switch on={r.enabled} disabled={busy === r.key} label={r.th} onClick={() => (r.enabled ? setConfirmOff({ row: r, place: null }) : void save(r, { enabled: true }))} />
          {r.updated_by_name && <span className="text-[10px] text-slate-400" title={r.updated_at ? fmtWhen(r.updated_at) : undefined}>โดย {r.updated_by_name}</span>}
        </div>
      ),
    },
  ];

  const userColumns: MiniColumn<UserRow>[] = [
    { key: "name", header: "ใคร", width: "minmax(0,1.4fr)", sortValue: (u) => u.name, sortLabel: "ชื่อ",
      cell: (u) => <span className={u.user_id ? "font-medium text-slate-800" : "text-slate-500"}>{u.name}</span> },
    { key: "top", header: "ใช้กับอะไรมากสุด", width: "minmax(0,2fr)",
      cell: (u) => <span className="text-xs text-slate-500">{u.top.map((t) => `${t.th} (${t.calls})`).join(" · ")}</span> },
    { key: "calls", header: "ครั้ง", width: "5rem", align: "right", sortValue: (u) => u.calls, sortLabel: "จำนวนครั้ง",
      cell: (u) => <span className="tabular-nums">{u.calls.toLocaleString("th-TH")}{u.failed ? <span className="block text-[11px] text-red-600">ล้มเหลว {u.failed}</span> : null}</span> },
    { key: "cost", header: "ค่า AI (ประมาณ)", width: "7rem", align: "right", sortValue: (u) => u.cost_thb, sortLabel: "ค่าใช้จ่าย",
      cell: (u) => <span className="font-medium tabular-nums text-slate-800">{baht(u.cost_thb)}</span> },
  ];

  if (!canManage) return <AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบ (สิทธิ์ &quot;จัดการ AI / API ที่เสียเงิน&quot;)" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">ศูนย์ AI และ API ที่เสียเงิน</h1>
        <p className="text-sm text-slate-500">ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหนบ้าง · เปิด-ปิดทั้งบริการหรือรายที่ · เปลี่ยนโมเดล · ตั้งงบต่อเดือน · ดูยอดรายคน — ทุกการเปลี่ยนบันทึกประวัติ</p>
      </div>

      {loading && !rows.length ? <LoadingState label="กำลังโหลด…" />
        : err ? <ErrorState title="โหลดข้อมูลไม่สำเร็จ" hint={err} onRetry={() => void load()} retrying={loading} />
        : (
          <>
            <BudgetCard budget={budget} state={bState} spent={totals.cost_thb}
              onSaved={(b) => { setBudget(b); void load(); }} />

            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="เดือนนี้ใช้ไป (ประมาณ)" value={baht(totals.cost_thb)} hint="คิดจากจำนวนคำที่ส่ง GPT" />
              <Stat label="เรียกใช้เดือนนี้" value={`${totals.calls.toLocaleString("th-TH")} ครั้ง`} hint={totals.failed ? `ล้มเหลว ${totals.failed} ครั้ง` : undefined} warn={totals.failed > 0} />
              <Stat label="ฟีเจอร์ที่เปิดอยู่" value={`${onCount}/${rows.length}`} />
              <Stat label="ยังไม่ตั้งรหัส" value={notSet.length ? notSet.join(" · ") : "ครบแล้ว"} small warn={notSet.length > 0} />
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              <Chip on={!provider} onClick={() => setProvider("")}>ทั้งหมด <span className="opacity-70">{rows.length}</span></Chip>
              {providers.map(([p, n]) => (
                <Chip key={p} on={provider === p} onClick={() => setProvider(provider === p ? "" : p)}>{PROVIDER_LABEL[p]} <span className="opacity-70">{n}</span></Chip>
              ))}
            </div>

            <MiniTable rows={shown} rowKey={(r) => r.key} columns={columns}
              searchText={(r) => `${r.th} ${r.en} ${r.usedAt} ${PROVIDER_LABEL[r.provider]} ${r.group} ${r.places.map((p) => p.th).join(" ")}`} searchPlaceholder="ค้นหา ฟีเจอร์ / หน้า / ผู้ให้บริการ"
              groupBy={(r) => r.group} groupLabel="หมวดงาน" defaultGrouped groupOrder={groupOrder} countUnit="รายการ"
              expandedKeys={open}
              renderExpanded={(r) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  {!r.enabled && <p className="mb-1.5 px-1 text-xs text-amber-700">ทั้งบริการปิดอยู่ — สวิตช์รายที่จะมีผลเมื่อเปิดบริการ</p>}
                  <div className="flex flex-col divide-y divide-slate-200">
                    {r.places.map((p) => (
                      <div key={p.key} className={`grid items-center gap-2 px-1 py-1.5 ${r.kind === "ai_chat" ? "grid-cols-[minmax(0,1fr)_12rem_8rem_5.5rem]" : "grid-cols-[minmax(0,1fr)_8rem_5.5rem]"} ${p.enabled ? "" : "opacity-60"}`}>
                        <span className="text-sm text-slate-700">{p.th}</span>
                        {r.kind === "ai_chat" && (
                          <select value={p.model ?? ""} disabled={!p.enabled || !r.enabled || busy === `${r.key}@${p.key}`} onChange={(e) => void save(r, { model: e.target.value }, p)}
                            title="โมเดลเฉพาะที่นี้ — ไม่เลือก = ใช้ตามบริการ"
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs outline-none focus:border-blue-400 disabled:opacity-50">
                            <option value="">ตามบริการ ({models.find((m) => m.id === r.model)?.id ?? "ค่าเดิมของระบบ"})</option>
                            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        )}
                        <MonthCell s={p.month} showCost={r.kind === "ai_chat"} last={p.last_used_at} />
                        <div className="flex flex-col items-center gap-0.5">
                          <Switch on={p.enabled} disabled={busy === `${r.key}@${p.key}`} label={`${r.th} · ${p.th}`}
                            onClick={() => (p.enabled ? setConfirmOff({ row: r, place: p }) : void save(r, { enabled: true }, p))} />
                          {p.updated_by_name && <span className="text-[10px] text-slate-400">โดย {p.updated_by_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )} />

            <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">ใครใช้เท่าไหร่ (เดือนนี้)</h2>
            {users.length ? (
              <MiniTable rows={users} rowKey={(u) => u.user_id ?? "_auto"} columns={userColumns}
                searchText={(u) => `${u.name} ${u.top.map((t) => t.th).join(" ")}`} searchPlaceholder="ค้นหาชื่อ" countUnit="คน" />
            ) : <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">ยังไม่มีการใช้เดือนนี้</p>}

            <HistoryCard services={rows} />

            <p className="mt-3 text-xs text-slate-400">
              ตัวเลขเงินเป็นค่าประมาณจากจำนวนคำ (ราคาตามรายการโมเดล) · เริ่มนับตั้งแต่วันที่เปิดใช้ศูนย์นี้ · บริการคิดต่อครั้ง (สลิป/LINE/อีเมล) นับเป็นจำนวนครั้ง
              · &quot;ระบบ / อัตโนมัติ&quot; = ไม่มีคนกด (ข้อความจาก LINE · งานตั้งเวลา) · ปิดแล้วมีผลทุกเครื่องภายใน ~30 วินาที · เพิ่มฟีเจอร์ใหม่ที่ใช้ AI/บริการเสียเงิน ต้องลงทะเบียนที่นี่ (ระบบบังคับ)
            </p>
          </>
        )}

      <ConfirmDialog open={confirmOff !== null} onClose={() => setConfirmOff(null)} variant="danger"
        onConfirm={() => { const t = confirmOff; setConfirmOff(null); if (t) void save(t.row, { enabled: false }, t.place ?? undefined); }}
        title={confirmOff ? `ปิด "${confirmOff.row.th}${confirmOff.place ? ` · ${confirmOff.place.th}` : ""}"?` : ""} confirmText="ปิด"
        message={confirmOff ? `ผลที่เกิด: ${confirmOff.row.offBehavior}${confirmOff.place ? ` (เฉพาะที่ "${confirmOff.place.th}")` : `\nใช้ที่: ${confirmOff.row.usedAt}`}\nเปิดกลับได้ทุกเมื่อที่หน้านี้` : ""} />
    </div>
  );
}

/** การ์ดงบต่อเดือน — ตั้งงบ (บาท) · แจ้งเตือนที่ % · เกินงบแล้วทำอะไร · แถบความคืบหน้า */
function BudgetCard({ budget, state, spent, onSaved }: { budget: PaidBudget; state: BudgetState; spent: number; onSaved: (b: PaidBudget) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(budget.monthly_thb ? String(budget.monthly_thb) : "");
  const [warn, setWarn] = useState(String(budget.warn_pct));
  const [action, setAction] = useState(budget.over_action);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAmount(budget.monthly_thb ? String(budget.monthly_thb) : ""); setWarn(String(budget.warn_pct)); setAction(budget.over_action); }, [budget]);
  const dirty = amount !== (budget.monthly_thb ? String(budget.monthly_thb) : "") || warn !== String(budget.warn_pct) || action !== budget.over_action;
  const pct = budget.monthly_thb ? Math.min(100, Math.round((spent / budget.monthly_thb) * 100)) : 0;
  const bar = state === "over" ? "bg-red-500" : state === "warn" ? "bg-amber-500" : "bg-emerald-500";
  const stateText: Record<BudgetState, string> = {
    none: "ยังไม่ได้ตั้งงบ — ใช้ได้ไม่จำกัด",
    ok: "อยู่ในงบ",
    warn: `ใช้ไปถึง ${budget.warn_pct}% ของงบแล้ว — แจ้งเตือนผู้ดูแลแล้ว`,
    over: budget.over_action === "stop" ? "ครบงบแล้ว — ระบบหยุด GPT ทุกฟีเจอร์ (แปลภาษาสลับไปตัวฟรี)" : "ครบงบแล้ว — ตั้งไว้แจ้งเตือนอย่างเดียว ทุกฟีเจอร์ยังใช้ได้",
  };

  const saveBudget = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: { monthly_thb: amount.trim() ? Number(amount) : null, warn_pct: Number(warn), over_action: action } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(j.data.budget.monthly_thb ? `ตั้งงบ ฿${j.data.budget.monthly_thb.toLocaleString("th-TH")}/เดือน แล้ว` : "ยกเลิกงบแล้ว (ไม่จำกัด)");
      onSaved(j.data.budget);
    } catch (e) { toast.error(`บันทึกงบไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); }
  };

  return (
    <section className={`mb-4 rounded-xl border p-4 ${state === "over" ? "border-red-200 bg-red-50/40" : state === "warn" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-800">งบค่า AI ต่อเดือน</h2>
        <span className="text-xs text-slate-500">นับเฉพาะ GPT (บริการอื่นไม่มีค่าใช้จ่ายที่วัดได้)</span>
        <span className={`ml-auto text-xs font-medium ${state === "over" ? "text-red-700" : state === "warn" ? "text-amber-700" : "text-slate-600"}`}>{stateText[state]}</span>
      </div>
      {budget.monthly_thb ? (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-xs tabular-nums text-slate-600"><span>ใช้ไป {baht(spent)}</span><span>{pct}% ของ {baht(budget.monthly_thb)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${bar} transition-[width]`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[10rem_8rem_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-xs font-medium text-slate-600">งบต่อเดือน (บาท)
          <input type="number" min={0} step={10} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ไม่จำกัด"
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal tabular-nums outline-none focus:border-blue-400" />
        </label>
        <label className="text-xs font-medium text-slate-600">แจ้งเตือนเมื่อใช้ถึง
          <select value={warn} onChange={(e) => setWarn(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal outline-none focus:border-blue-400">
            {[50, 70, 80, 90, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
        <div className="text-xs font-medium text-slate-600">ครบงบแล้ว
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([["stop", "หยุด GPT อัตโนมัติ (แปลภาษาใช้ตัวฟรี)"], ["warn", "แจ้งเตือนอย่างเดียว ใช้ต่อได้"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setAction(k)}
                className={`rounded-lg border px-3 py-2 text-xs font-normal ${action === k ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        </div>
        <button type="button" disabled={!dirty || saving} onClick={() => void saveBudget()}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกงบ"}</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">ตั้งงบแยกรายฟีเจอร์ได้ที่ช่อง "งบ/เดือน" ในแต่ละแถว (เช่น แคปชั่นไม่เกิน ฿100) · แจ้งเตือนเข้ากระดิ่ง (และเด้งที่เครื่อง) ของผู้ดูแลที่มีสิทธิ์หน้านี้ — ครั้งเดียวต่อเดือนต่อระดับ (ใกล้เต็ม / ครบงบ) · รีเซ็ตทุกวันที่ 1</p>
    </section>
  );
}

function MonthCell({ s, showCost, last }: { s: Stat; showCost: boolean; last: string | null }) {
  return (
    <div className="text-right text-xs tabular-nums">
      <div className="font-medium text-slate-800">{s.calls.toLocaleString("th-TH")} ครั้ง</div>
      {showCost && <div className="text-slate-500">{baht(s.cost_thb)}</div>}
      {s.failed > 0 && <div className="text-red-600">ล้มเหลว {s.failed}</div>}
      <div className="text-[11px] text-slate-400">{last ? `ล่าสุด ${fmtWhen(last)}` : "ยังไม่มีการใช้"}</div>
    </div>
  );
}

function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={on ? `ปิด ${label}` : `เปิด ${label}`} disabled={disabled} onClick={onClick}
      className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-blue-600" : "bg-slate-300"}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

function Stat({ label, value, hint, warn, small }: { label: string; value: string; hint?: string; warn?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`${small ? "text-sm" : "text-2xl"} font-semibold tabular-nums ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</div>
      {hint && <div className={`text-[11px] ${warn ? "text-red-600" : "text-slate-400"}`}>{hint}</div>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {children}
    </button>
  );
}

/** งบรายฟีเจอร์ (บาท/เดือน) ในแถว — ออกจากช่อง/กด Enter = บันทึก · ว่าง = ไม่จำกัด · ใช้ % แจ้งเตือน + "ครบงบแล้ว" เดียวกับงบรวม */
function ServiceBudgetInput({ cap, spent, warnPct, disabled, onSave }: { cap: number | null; spent: number; warnPct: number; disabled?: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(cap ? String(cap) : "");
  useEffect(() => { setV(cap ? String(cap) : ""); }, [cap]);
  const pct = cap ? Math.round((spent / cap) * 100) : 0;
  const cls = !cap ? "text-slate-400" : pct >= 100 ? "text-red-600" : pct >= warnPct ? "text-amber-700" : "text-slate-500";
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-slate-500">งบ/เดือน ฿</span>
      <input type="number" min={0} step={10} value={v} disabled={disabled} placeholder="ไม่จำกัด"
        onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-6 w-20 rounded border border-slate-200 px-1.5 text-[11px] tabular-nums outline-none focus:border-blue-400 disabled:opacity-50" />
      {cap ? <span className={`tabular-nums ${cls}`}>{pct}%</span> : null}
    </div>
  );
}

/** กราฟยอดใช้ย้อนหลัง — รายวัน (30 วัน) / รายเดือน (12 เดือน) · เลือกดูทั้งหมดหรือรายฟีเจอร์ · ค่าเงิน / จำนวนครั้ง */
function HistoryCard({ services }: { services: Row[] }) {
  const [mode, setMode] = useState<"day" | "month">("day");
  const [key, setKey] = useState("");
  const [metric, setMetric] = useState<"cost" | "calls">("cost");
  const [data, setData] = useState<{ key: string; label: string; cost_thb: number; calls: number; failed: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const svc = services.find((s) => s.key === key);
  const showCost = metric === "cost" && (!svc || svc.kind === "ai_chat");

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(`/api/admin/paid-services?view=history&mode=${mode}${key ? `&key=${encodeURIComponent(key)}` : ""}`).then(async (res) => {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      if (alive) setData(j.buckets ?? []);
    }).catch((e) => { if (alive) setErr((e as Error).message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, key, retry]);

  const sumCost = data.reduce((a, b) => a + b.cost_thb, 0), sumCalls = data.reduce((a, b) => a + b.calls, 0);
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-700">ยอดใช้ย้อนหลัง</h2>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400">
          <option value="">ทุกฟีเจอร์</option>
          {services.filter((s) => s.kind !== "locked").map((s) => <option key={s.key} value={s.key}>{s.th}</option>)}
        </select>
        <div className="flex gap-1">
          <Chip on={mode === "day"} onClick={() => setMode("day")}>รายวัน (30 วัน)</Chip>
          <Chip on={mode === "month"} onClick={() => setMode("month")}>รายเดือน (12 เดือน)</Chip>
        </div>
        <div className="flex gap-1">
          <Chip on={metric === "cost"} onClick={() => setMetric("cost")}>ค่าเงิน</Chip>
          <Chip on={metric === "calls"} onClick={() => setMetric("calls")}>จำนวนครั้ง</Chip>
        </div>
      </div>
      {loading && !data.length ? <LoadingState label="กำลังโหลดกราฟ…" />
        : err ? <ErrorState title="โหลดยอดย้อนหลังไม่สำเร็จ" hint={err} onRetry={() => setRetry((n) => n + 1)} />
        : (
          <>
            <div className="mb-1 text-xs text-slate-500">
              รวมช่วงนี้: <b className="font-medium tabular-nums text-slate-700">{baht(sumCost)}</b> · <b className="font-medium tabular-nums text-slate-700">{sumCalls.toLocaleString("th-TH")}</b> ครั้ง
              {metric === "cost" && svc && svc.kind !== "ai_chat" && <span className="ml-2 text-amber-700">ฟีเจอร์นี้ไม่มีค่าเงินที่วัดได้ — แสดงจำนวนครั้งแทน</span>}
            </div>
            <SimpleBarChart ariaLabel="กราฟยอดใช้ AI ย้อนหลัง" emptyText="ยังไม่มีการใช้ในช่วงนี้"
              data={data.map((b) => ({ key: b.key, label: b.label, value: showCost ? b.cost_thb : b.calls, hint: showCost ? `${b.calls.toLocaleString("th-TH")} ครั้ง${b.failed ? ` · ล้มเหลว ${b.failed}` : ""}` : `${baht(b.cost_thb)}${b.failed ? ` · ล้มเหลว ${b.failed}` : ""}` }))}
              format={(v) => (showCost ? baht(v) : `${Math.round(v).toLocaleString("th-TH")}`)} />
            <p className="mt-1 text-[11px] text-slate-400">เริ่มเก็บข้อมูลตั้งแต่วันที่เปิดศูนย์นี้ (6 พ.ย. 2569) — ช่วงก่อนหน้าจะเป็น 0</p>
          </>
        )}
    </section>
  );
}
