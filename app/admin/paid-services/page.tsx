"use client";

// ============================================================
// 🤖 ศูนย์ AI และ API ที่เสียเงิน — ดูว่าระบบใช้ AI / บริการเสียเงินตรงไหน · เปิด-ปิด (ทั้งบริการ / รายที่) · เปลี่ยนโมเดล
//    งบต่อเดือน (ใกล้เต็มแจ้งเตือน · เกินงบหยุด/แจ้งเตือนอย่างเดียว) · ยอดใช้เดือนนี้ + รายคน
//    โควตาจำนวนครั้งต่อคนต่อเดือน รายฟีเจอร์ (CountQuotaSection · เจ้าของขอ 2026-11-15 สำหรับปุ่ม AI จุดเด่นสินค้า — ใช้ได้ทุกฟีเจอร์ GPT)
//    2026-11-16: ราคาต่อครั้งของแต่ละรุ่น (ในตัวเลือกโมเดล) · "ใครใช้ได้" รายฟีเจอร์ (AccessModal) · โควตาเลือกหน่วยครั้ง/บาท — พนักงานเห็นเป็น "ใช้ได้อีก N ครั้ง" เสมอ
// ทะเบียนจุดที่ใช้ = lib/paid-services (ของกลาง · เพิ่มจุดใหม่ต้องลงทะเบียน — เทสต์ paid-services-guard บังคับ)
// ด่านกลาง = lib/paid-services-server · ข้อมูลผ่าน /api/admin/paid-services (admin.paid_services)
// ของกลาง: MiniTable (ค้นหา/เรียง/จัดกลุ่ม/กางแถว) · ConfirmDialog (ยืนยันก่อนปิด) · Toast
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { SimpleBarChart } from "@/components/bar-chart";
import { UserPicker, type UserPickerValue } from "@/components/pickers/master";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { callCostThb, callsFromThb, PROVIDER_LABEL, type BudgetState, type CallTokens, type PaidBudget, type PaidProvider, type PaidService, type QuotaUnit, type ServiceAccess } from "@/lib/paid-services";

type Stat = { calls: number; failed: number; cost_thb: number; tokens: number };
type PlaceRow = { key: string; th: string; enabled: boolean; model: string | null; month: Stat; last_used_at: string | null; updated_by_name: string | null };
type ChoiceRow = { id: string; th: string; provider: PaidProvider; configured: boolean | null };
type Row = Omit<PaidService, "places" | "providerChoices"> & {
  enabled: boolean; model: string | null; configured: boolean | null; month: Stat;
  provider_choice: string | null; provider_choices: ChoiceRow[];
  last_used_at: string | null; updated_at: string | null; updated_by_name: string | null; places: PlaceRow[];
  /** จำนวนคำเฉลี่ยต่อครั้ง (ใช้จริง 90 วัน / ประมาณการ) — คิดราคาต่อครั้งของแต่ละรุ่น · เฉพาะ GPT */
  call_tokens: (CallTokens & { calls: number; source: "history" | "estimate" }) | null;
  /** รุ่นที่ใช้จริงครั้งล่าสุด — ใช้บอกราคาของ "ค่าเดิมของระบบ" */
  used_model: string | null;
};
type RoleOpt = { key: string; label: string };
type NamedUser = { user_id: string; name: string };
type UserRow = {
  user_id: string | null; name: string; calls: number; failed: number; cost_thb: number; top: { key: string; th: string; calls: number }[];
  cap: number | null; cap_source: "auto" | "unlimited" | "custom" | "default" | "none"; budget_state: BudgetState;
};
type ModelChoice = { id: string; label: string; note: string; inPerM: number; outPerM: number };
type OffTarget = { row: Row; place: PlaceRow | null };

const baht = (n: number) => (n === 0 ? "฿0" : n < 1 ? `฿${n.toFixed(2)}` : `฿${n.toLocaleString("th-TH", { maximumFractionDigits: n < 100 ? 1 : 0 })}`);
/** ราคาต่อครั้ง — เล็กมากโชว์ 3 ตำแหน่ง */
const perCallText = (n: number) => (n < 0.001 ? "<฿0.001" : n < 0.1 ? `฿${n.toFixed(3)}` : `฿${n.toFixed(2)}`);
const perCallOf = (r: { call_tokens: Row["call_tokens"] }, model: string | null | undefined) => (r.call_tokens ? callCostThb(model, r.call_tokens) : null);
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

export default function PaidServicesPage() {
  return <PlaygroundShell><PaidServicesView /></PlaygroundShell>;
}

function PaidServicesView() {
  const canManage = usePermission("admin.paid_services");
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [countUsage, setCountUsage] = useState<Record<string, Record<string, number>>>({});
  const [countUsers, setCountUsers] = useState<{ user_id: string; name: string }[]>([]);
  const [countUsageThb, setCountUsageThb] = useState<Record<string, Record<string, number>>>({});
  const [access, setAccess] = useState<Record<string, ServiceAccess>>({});
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [accessUsers, setAccessUsers] = useState<NamedUser[]>([]);
  const [accessFor, setAccessFor] = useState<Row | null>(null);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [totals, setTotals] = useState({ calls: 0, failed: 0, cost_thb: 0 });
  const [budget, setBudget] = useState<PaidBudget>({ monthly_thb: null, warn_pct: 80, over_action: "stop", per_service: {}, per_user_default: null, per_user: {}, count_quota: {} });
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
      setCountUsage(j.count_usage ?? {}); setCountUsers(j.count_users ?? []); setCountUsageThb(j.count_usage_thb ?? {});
      setAccess(j.access ?? {}); setRoles(j.roles ?? []); setAccessUsers(j.access_users ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const save = async (r: Row, patch: { enabled?: boolean; model?: string; provider?: string }, place?: PlaceRow) => {
    const id = place ? `${r.key}@${place.key}` : r.key;
    setBusy(id);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: r.key, ...(place ? { place: place.key } : {}), ...patch }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows((cur) => cur.map((x) => {
        if (x.key !== r.key) return x;
        if (place) return { ...x, places: x.places.map((p) => (p.key === place.key ? { ...p, enabled: j.data.enabled, model: j.data.model, updated_by_name: j.data.updated_by_name } : p)) };
        if ("provider" in patch) { void load(); }   // ผู้ให้บริการเปลี่ยน → ป้าย/สถานะรหัสต้องคำนวณใหม่จากเซิร์ฟเวอร์
        return { ...x, enabled: j.data.enabled, model: j.data.model, provider_choice: j.data.provider ?? x.provider_choices[0]?.id ?? null, updated_at: j.data.updated_at, updated_by_name: j.data.updated_by_name };
      }));
      const label = place ? `${r.th} · ${place.th}` : r.th;
      toast.success("enabled" in patch ? (patch.enabled ? `เปิด "${label}" แล้ว` : `ปิด "${label}" แล้ว`) : "provider" in patch ? `เปลี่ยนผู้ให้บริการของ "${label}" แล้ว` : `เปลี่ยนโมเดลของ "${label}" แล้ว`);
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

  /** งบรายคน — value: บาท · "unlimited" · "default" (กลับใช้ค่าเริ่ม) */
  const saveUserBudget = async (userId: string, name: string, value: number | "unlimited" | "default") => {
    setBusy(`user:${userId}`);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget_user: { user_id: userId, monthly_thb: value === "unlimited" ? null : value } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setBudget(j.data.budget);
      toast.success(value === "default" ? `${name}: ใช้งบค่าเริ่มต่อคน` : value === "unlimited" ? `${name}: ไม่จำกัดงบ` : `${name}: งบ ฿${value.toLocaleString("th-TH")}/เดือน`);
      void load();
    } catch (e) { toast.error(`บันทึกงบไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  const saveUserDefault = async (value: string) => {
    const next = value.trim() ? Number(value) : null;
    if ((next ?? null) === budget.per_user_default || (next !== null && (!Number.isFinite(next) || next < 0))) return;
    setBusy("user:default");
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget_user_default: next }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setBudget(j.data.budget);
      toast.success(j.data.budget.per_user_default ? `งบต่อคน ฿${j.data.budget.per_user_default.toLocaleString("th-TH")}/เดือน แล้ว` : "ยกเลิกงบต่อคน (ไม่จำกัด)");
      void load();
    } catch (e) { toast.error(`บันทึกงบไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  /** โควตาจำนวนครั้ง — ค่าเริ่มของทุกคน (user = null) หรือรายคน (limit "default" = กลับไปใช้ค่าเริ่ม) */
  const saveCountQuota = async (key: string, user: { id: string; name: string } | null, limit: number | "unlimited" | "default" | null) => {
    setBusy(`count:${key}:${user?.id ?? "default"}`);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count_quota: { key, ...(user ? { user_id: user.id } : {}), limit } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setBudget(j.data.budget);
      toast.success(user ? `ตั้งโควตาของ ${user.name} แล้ว` : "ตั้งโควตาค่าเริ่มต่อคนแล้ว");
      void load();
    } catch (e) { toast.error(`บันทึกโควตาไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  /** เปลี่ยนหน่วยโควตา (ครั้ง ↔ บาท) — ค่าที่ตั้งไว้ระบบแปลงให้ตามราคาต่อครั้ง */
  const saveQuotaUnit = async (key: string, unit: QuotaUnit) => {
    setBusy(`count:${key}:unit`);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count_quota: { key, unit } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setBudget(j.data.budget);
      toast.success(unit === "thb" ? "เปลี่ยนเป็นตั้งเป็นบาทแล้ว — พนักงานยังเห็นเป็นจำนวนครั้ง" : "เปลี่ยนเป็นตั้งเป็นจำนวนครั้งแล้ว");
    } catch (e) { toast.error(`เปลี่ยนหน่วยไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  /** ใครใช้ได้ (รายฟีเจอร์) */
  const saveAccess = async (r: Row, next: ServiceAccess, picked: NamedUser[]) => {
    setBusy(`access:${r.key}`);
    try {
      const res = await apiFetch("/api/admin/paid-services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access: { key: r.key, ...next } }) });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setAccess(j.data.access ?? {});
      setAccessUsers((cur) => [...cur.filter((u) => !picked.some((p) => p.user_id === u.user_id)), ...picked]);
      setAccessFor(null);
      toast.success(next.mode === "all" ? `"${r.th}" ใช้ได้ทุกคนที่มีสิทธิ์แล้ว` : `ตั้งคนที่ใช้ "${r.th}" ได้แล้ว`);
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message}`); }
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
          {r.kind === "ai_chat" && (() => {
            const a = access[r.key];
            const custom = a?.mode === "custom";
            return (
              <button type="button" onClick={() => setAccessFor(r)} data-access-btn={r.key}
                className={`mr-1 mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-slate-50 ${custom ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}>
                <Icon name="users" /> ใครใช้ได้: {custom ? `เฉพาะ ${[a.roles.length ? `${a.roles.length} บทบาท` : "", a.users.length ? `${a.users.length} คน` : ""].filter(Boolean).join(" + ") || "ผู้ดูแลเท่านั้น"}` : "ทุกคนที่มีสิทธิ์"}
              </button>
            );
          })()}
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
            <option value="">ค่าเดิมของระบบ{!r.model && r.used_model ? ` (ตอนนี้ ${r.used_model}${perCallOf(r, r.used_model) !== null ? ` · ~${perCallText(perCallOf(r, r.used_model)!)}/ครั้ง` : ""})` : ""}</option>
            {models.map((m) => { const c = perCallOf(r, m.id); return <option key={m.id} value={m.id}>{m.label}{c !== null ? ` · ~${perCallText(c)}/ครั้ง` : ""}</option>; })}
          </select>
          {(() => {
            const eff = r.model ?? r.used_model;
            const m = models.find((x) => x.id === r.model); const c = eff ? perCallOf(r, eff) : null;
            return (
              <>
                {c !== null && <span className="text-[11px] font-medium text-slate-600" data-per-call={r.key}>กดครั้งละ ~{perCallText(c)} <span className="font-normal text-slate-400">({r.call_tokens?.source === "history" ? `เฉลี่ยจากใช้จริง ${r.call_tokens.calls.toLocaleString("th-TH")} ครั้ง` : "ประมาณการ ยังไม่เคยใช้"})</span></span>}
                {m && <span className="text-[11px] text-slate-400">{m.note} · เข้า ฿{m.inPerM}/ออก ฿{m.outPerM} ต่อ 1 ล้านคำ</span>}
              </>
            );
          })()}
          <ServiceBudgetInput cap={budget.per_service[r.key] ?? null} spent={r.month.cost_thb} warnPct={budget.warn_pct}
            disabled={busy === `${r.key}:budget`} onSave={(v) => void saveServiceBudget(r, v)} />
        </div>
      ) : r.provider_choices.length ? (
        <div className="flex flex-col gap-1">
          <select value={r.provider_choice ?? r.provider_choices[0]?.id ?? ""} disabled={!r.enabled || busy === r.key} onChange={(e) => void save(r, { provider: e.target.value })}
            title="ผู้ให้บริการ" className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs outline-none focus:border-blue-400 disabled:opacity-50">
            {r.provider_choices.map((c) => <option key={c.id} value={c.id}>{c.th}{c.configured === false ? " — ยังไม่ตั้งรหัส" : ""}</option>)}
          </select>
          {(() => { const c = r.provider_choices.find((x) => x.id === (r.provider_choice ?? r.provider_choices[0]?.id)); return c?.configured === false
            ? <span className="text-[11px] text-amber-700">ผู้ให้บริการนี้ยังไม่ตั้งรหัส — ระบบจะลองตัวอื่นที่พร้อมให้เอง</span>
            : <span className="text-[11px] text-slate-400">{r.costHint}</span>; })()}
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
    { key: "cap", header: "งบของคนนี้ / เดือน", width: "15rem", sortValue: (u) => (u.cap === null ? 1e12 : u.cap), sortLabel: "งบรายคน",
      cell: (u) => u.user_id
        ? <UserBudgetCell u={u} defaultCap={budget.per_user_default} warnPct={budget.warn_pct} busy={busy === `user:${u.user_id}`}
            onSave={(v) => void saveUserBudget(u.user_id!, u.name, v)} />
        : <span className="text-xs text-slate-400">ไม่นับงบของใคร</span> },
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
                            {models.map((m) => { const c = perCallOf(r, m.id); return <option key={m.id} value={m.id}>{m.label}{c !== null ? ` · ~${perCallText(c)}/ครั้ง` : ""}</option>; })}
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

            <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">ใครใช้เท่าไหร่ (เดือนนี้) · งบรายคน</h2>
            <UserBudgetBar defaultCap={budget.per_user_default} busy={busy === "user:default"} onSaveDefault={(v) => void saveUserDefault(v)}
              onAdd={(u, amount) => void saveUserBudget(u.id, u.name, amount)} />
            {users.length ? (
              <MiniTable rows={users} rowKey={(u) => u.user_id ?? "_auto"} columns={userColumns}
                searchText={(u) => `${u.name} ${u.top.map((t) => t.th).join(" ")}`} searchPlaceholder="ค้นหาชื่อ" countUnit="คน" />
            ) : <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">ยังไม่มีการใช้เดือนนี้</p>}

            <CountQuotaSection services={rows.filter((r) => r.kind === "ai_chat")} budget={budget} usage={countUsage} usageThb={countUsageThb} users={countUsers} busy={busy}
              onSave={(key, user, limit) => void saveCountQuota(key, user, limit)} onUnit={(key, unit) => void saveQuotaUnit(key, unit)} />

            <HistoryCard services={rows} />

            <p className="mt-3 text-xs text-slate-400">
              ตัวเลขเงินเป็นค่าประมาณจากจำนวนคำ (ราคาตามรายการโมเดล) · เริ่มนับตั้งแต่วันที่เปิดใช้ศูนย์นี้ · บริการคิดต่อครั้ง (สลิป/LINE/อีเมล) นับเป็นจำนวนครั้ง
              · &quot;ระบบ / อัตโนมัติ&quot; = ไม่มีคนกด (ข้อความจาก LINE · งานตั้งเวลา) · ปิดแล้วมีผลทุกเครื่องภายใน ~30 วินาที · เพิ่มฟีเจอร์ใหม่ที่ใช้ AI/บริการเสียเงิน ต้องลงทะเบียนที่นี่ (ระบบบังคับ)
            </p>
          </>
        )}

      {accessFor && (
        <AccessModal row={accessFor} value={access[accessFor.key] ?? { mode: "all", roles: [], users: [] }} roles={roles} knownUsers={accessUsers}
          busy={busy === `access:${accessFor.key}`} onClose={() => setAccessFor(null)} onSave={(next, picked) => void saveAccess(accessFor, next, picked)} />
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

/** แถบบนตารางรายคน — งบต่อคน (ค่าเริ่มของทุกคน) + ตั้งงบให้คนที่ยังไม่อยู่ในตาราง */
function UserBudgetBar({ defaultCap, busy, onSaveDefault, onAdd }: {
  defaultCap: number | null; busy: boolean; onSaveDefault: (v: string) => void; onAdd: (u: UserPickerValue, amount: number | "unlimited") => void;
}) {
  const [v, setV] = useState(defaultCap ? String(defaultCap) : "");
  useEffect(() => { setV(defaultCap ? String(defaultCap) : ""); }, [defaultCap]);
  const [who, setWho] = useState<UserPickerValue | null>(null);
  const [amt, setAmt] = useState("");
  return (
    <div className="mb-2 flex flex-wrap items-end gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <label className="text-xs font-medium text-slate-600">งบต่อคน (ค่าเริ่มของทุกคน)
        <span className="mt-1 flex items-center gap-1.5">
          <span className="text-slate-500">฿</span>
          <input type="number" min={0} step={10} value={v} disabled={busy} placeholder="ไม่จำกัด"
            onChange={(e) => setV(e.target.value)} onBlur={() => onSaveDefault(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm font-normal tabular-nums outline-none focus:border-blue-400 disabled:opacity-50" />
          <span className="font-normal text-slate-500">/ เดือน</span>
        </span>
      </label>
      <div className="text-xs font-medium text-slate-600">ตั้งงบให้คนอื่น (ที่ยังไม่อยู่ในตาราง)
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="w-52"><UserPicker value={who} onChange={setWho} disableCreate /></span>
          <span className="text-slate-500">฿</span>
          <input type="number" min={0} step={10} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="ไม่จำกัด"
            className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm font-normal tabular-nums outline-none focus:border-blue-400" />
          <button type="button" disabled={!who} onClick={() => { if (!who) return; const n = Number(amt); onAdd(who, amt.trim() && n > 0 ? n : "unlimited"); setWho(null); setAmt(""); }}
            className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">ตั้งงบ</button>
        </div>
      </div>
      <p className="w-full text-[11px] font-normal text-slate-400">ครบงบรายคน = คนนั้นใช้ GPT ไม่ได้จนถึงวันที่ 1 (แปลภาษาสลับไปตัวฟรี) ถ้าตั้ง "หยุด GPT อัตโนมัติ" ไว้ในการ์ดงบด้านบน · คนนั้นได้แจ้งเตือนตอนใกล้ครบ/ครบ · ผู้ดูแลได้แจ้งเมื่อมีคนครบ · งานอัตโนมัติไม่นับงบของใคร</p>
    </div>
  );
}

/** ช่องงบรายคนในตาราง — ใส่บาท (ออกจากช่อง = บันทึก) · ปุ่มไม่จำกัด / ใช้ค่าเริ่ม · บอก % ที่ใช้ไป */
function UserBudgetCell({ u, defaultCap, warnPct, busy, onSave }: { u: UserRow; defaultCap: number | null; warnPct: number; busy: boolean; onSave: (v: number | "unlimited" | "default") => void }) {
  const custom = u.cap_source === "custom" ? String(u.cap ?? "") : "";
  const [v, setV] = useState(custom);
  useEffect(() => { setV(custom); }, [custom]);
  const commit = () => {
    const t = v.trim();
    if (t === custom) return;
    if (!t) { if (u.cap_source === "custom") onSave("default"); return; }
    const n = Number(t); if (Number.isFinite(n) && n > 0) onSave(n);
  };
  const pct = u.cap ? Math.round((u.cost_thb / u.cap) * 100) : 0;
  const cls = u.budget_state === "over" ? "text-red-600" : u.budget_state === "warn" ? "text-amber-700" : "text-slate-500";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500">฿</span>
        <input type="number" min={0} step={10} value={v} disabled={busy || u.cap_source === "unlimited"}
          placeholder={u.cap_source === "unlimited" ? "ไม่จำกัด" : defaultCap ? `ค่าเริ่ม ${defaultCap}` : "ไม่จำกัด"}
          onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-7 w-20 rounded border border-slate-200 px-1.5 text-xs tabular-nums outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:opacity-70" />
        {u.cap ? <span className={`tabular-nums ${cls}`}>{pct}%</span> : null}
        {u.budget_state === "over" && <span className="rounded bg-red-50 px-1 text-[10px] text-red-700">ครบงบ</span>}
      </div>
      <div className="flex gap-2 text-[11px]">
        {u.cap_source === "unlimited"
          ? <button type="button" disabled={busy} onClick={() => onSave("default")} className="text-blue-600 hover:underline">ใช้งบค่าเริ่ม</button>
          : <button type="button" disabled={busy} onClick={() => onSave("unlimited")} className="text-slate-500 hover:text-slate-700 hover:underline">ไม่จำกัด</button>}
        {u.cap_source === "custom" && <button type="button" disabled={busy} onClick={() => onSave("default")} className="text-slate-500 hover:text-slate-700 hover:underline">ใช้ค่าเริ่ม</button>}
        <span className="text-slate-400">{u.cap_source === "custom" ? "ตั้งเฉพาะคนนี้" : u.cap_source === "unlimited" ? "ไม่จำกัด (ตั้งเฉพาะคนนี้)" : u.cap_source === "default" ? "ใช้ค่าเริ่ม" : "ไม่จำกัด"}</span>
      </div>
    </div>
  );
}

/** 🔢 โควตาต่อคนต่อเดือน (รายฟีเจอร์ GPT) — ตั้งเป็น "ครั้ง" หรือ "บาท" · ค่าเริ่มของทุกคน + ตั้งรายคน · นับเฉพาะครั้งที่สำเร็จ · ครบ = ฟีเจอร์นั้นหยุดสำหรับคนนั้นจนวันที่ 1
 *   พนักงานเห็นเป็น "ใช้ได้อีก N ครั้ง" เสมอ (หน่วยบาท = ระบบหารด้วยราคาต่อครั้งให้ · เจ้าของสั่ง 2026-11-16) */
function CountQuotaSection({ services, budget, usage, usageThb, users, busy, onSave, onUnit }: {
  services: Row[]; budget: PaidBudget; usage: Record<string, Record<string, number>>; usageThb: Record<string, Record<string, number>>; users: { user_id: string; name: string }[]; busy: string | null;
  onSave: (key: string, user: { id: string; name: string } | null, limit: number | "unlimited" | "default" | null) => void;
  onUnit: (key: string, unit: QuotaUnit) => void;
}) {
  const withQuota = services.filter((s) => budget.count_quota?.[s.key]);
  const [key, setKey] = useState<string>(() => withQuota[0]?.key ?? services.find((s) => s.key === "ai.desc_highlights")?.key ?? services[0]?.key ?? "");
  const q = budget.count_quota?.[key] ?? { unit: "count" as QuotaUnit, per_user_default: null, per_user: {} };
  const unit: QuotaUnit = q.unit ?? "count";
  const isThb = unit === "thb";
  const svc = services.find((s) => s.key === key);
  const perCall = svc ? perCallOf(svc, svc.model ?? svc.used_model) : null;
  const [def, setDef] = useState(q.per_user_default ? String(q.per_user_default) : "");
  useEffect(() => { setDef(q.per_user_default ? String(q.per_user_default) : ""); }, [key, q.per_user_default]);
  const [who, setWho] = useState<UserPickerValue | null>(null);
  const [amt, setAmt] = useState("");
  const used = usage[key] ?? {};
  const usedThb = usageThb[key] ?? {};
  const parse = (v: string): number | null => { const n = isThb ? Math.round(Number(v) * 100) / 100 : Math.floor(Number(v)); return v.trim() && Number.isFinite(n) && n > 0 ? n : null; };
  const rowsFor = [...new Set([...Object.keys(used), ...Object.keys(q.per_user)])]
    .map((id) => ({ id, name: users.find((u) => u.user_id === id)?.name ?? "ผู้ใช้", used: used[id] ?? 0, usedThb: usedThb[id] ?? 0, custom: id in q.per_user ? q.per_user[id] : undefined }))
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name, "th"));
  const capOf = (r: { custom: number | null | undefined }) => (r.custom === undefined ? q.per_user_default : r.custom);
  const unitWord = isThb ? "บาท" : "ครั้ง";
  /** คำแปลงหน่วยใต้ช่อง — บาท → "พนักงานเห็นว่าใช้ได้ N ครั้ง" · ครั้ง → "≈ ฿/คน/เดือน" */
  const convHint = (v: number | null) => {
    if (v === null || perCall === null) return null;
    if (isThb) { const c = callsFromThb(v, perCall); return c === null ? null : `พนักงานจะเห็นว่าใช้ได้ ${c.toLocaleString("th-TH")} ครั้ง`; }
    return `≈ ${baht(v * perCall)} / คน / เดือน`;
  };
  if (!services.length) return null;
  return (
    <div className="mt-6" data-count-quota>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">จำกัดการใช้ต่อคนต่อเดือน (รายฟีเจอร์)</h2>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <label className="text-xs font-medium text-slate-600">ฟีเจอร์
            <select value={key} onChange={(e) => setKey(e.target.value)} className="mt-1 block h-8 w-72 max-w-full rounded-md border border-slate-200 bg-white px-1.5 text-sm font-normal outline-none focus:border-blue-400">
              {services.map((s) => <option key={s.key} value={s.key}>{s.th}{budget.count_quota?.[s.key] ? " · ตั้งโควตาแล้ว" : ""}</option>)}
            </select>
          </label>
          <div className="text-xs font-medium text-slate-600">ตั้งเป็น
            <div className="mt-1 inline-flex overflow-hidden rounded-md border border-slate-200 bg-white" role="group" aria-label="หน่วยของโควตา" data-quota-unit={unit}>
              {(["count", "thb"] as const).map((u) => (
                <button key={u} type="button" disabled={busy === `count:${key}:unit`} onClick={() => { if (u !== unit) onUnit(key, u); }} aria-pressed={u === unit}
                  className={`h-8 px-3 text-xs ${u === unit ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"} disabled:opacity-50`}>
                  {u === "count" ? "จำนวนครั้ง" : "บาท"}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs font-medium text-slate-600">ค่าเริ่มของทุกคน
            <span className="mt-1 flex items-center gap-1.5">
              <input type="number" min={0} step={isThb ? 0.01 : 1} value={def} disabled={busy === `count:${key}:default`} placeholder="ไม่จำกัด"
                onChange={(e) => setDef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                onBlur={() => { const next = parse(def); if (next !== (q.per_user_default ?? null)) onSave(key, null, next); }}
                className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm font-normal tabular-nums outline-none focus:border-blue-400 disabled:opacity-50" />
              <span className="font-normal text-slate-500">{unitWord} / คน / เดือน</span>
            </span>
            {convHint(parse(def)) && <span className="mt-0.5 block text-[11px] font-normal text-slate-400" data-quota-hint>{convHint(parse(def))}</span>}
          </label>
          <div className="text-xs font-medium text-slate-600">ตั้งเฉพาะคน
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="w-52"><UserPicker value={who} onChange={setWho} disableCreate /></span>
              <input type="number" min={0} step={isThb ? 0.01 : 1} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="ไม่จำกัด"
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-sm font-normal tabular-nums outline-none focus:border-blue-400" />
              <span className="font-normal text-slate-500">{unitWord}</span>
              <button type="button" disabled={!who} onClick={() => { if (!who) return; onSave(key, { id: who.id, name: who.name }, parse(amt) ?? "unlimited"); setWho(null); setAmt(""); }}
                className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">ตั้งโควตา</button>
            </div>
          </div>
        </div>
        {perCall !== null && (
          <p className="mt-2 text-[11px] text-slate-500" data-quota-percall>
            ฟีเจอร์นี้กดครั้งละ ~{perCallText(perCall)} ({svc?.call_tokens?.source === "history" ? "เฉลี่ยจากใช้จริง" : "ประมาณการ"}) · พนักงานเห็นแค่ &quot;ใช้ได้อีก N ครั้ง&quot; ไม่เห็นตัวเงิน
          </p>
        )}
        {rowsFor.length ? (
          <div className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {rowsFor.map((r) => {
              const cap = capOf(r);
              const usedV = isThb ? r.usedThb : r.used;
              const pct = cap ? Math.min(100, Math.round((usedV / cap) * 100)) : 0;
              const left = cap === null ? null : isThb ? (perCall ? callsFromThb(cap - r.usedThb, perCall) : null) : Math.max(0, cap - r.used);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" data-count-quota-row={r.id}>
                  <span className="min-w-0 flex-1 font-medium text-slate-800">{r.name}</span>
                  <span className="tabular-nums text-slate-600">
                    {isThb ? `ใช้ ${baht(r.usedThb)} / ${cap === null ? "∞" : baht(cap)}` : `ใช้ ${r.used.toLocaleString("th-TH")} / ${cap ?? "∞"} ครั้ง`}
                    {left !== null && <span className="ml-1 text-[11px] text-slate-400">(คนนี้เห็น: เหลือ {left.toLocaleString("th-TH")} ครั้ง)</span>}
                  </span>
                  {cap ? <span className="h-1.5 w-24 overflow-hidden rounded bg-slate-100"><span className={`block h-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} /></span> : null}
                  <span className="text-[11px] text-slate-400">{r.custom === undefined ? "ใช้ค่าเริ่ม" : r.custom === null ? "ไม่จำกัด (ตั้งเฉพาะคนนี้)" : "ตั้งเฉพาะคนนี้"}</span>
                  <span className="flex gap-2 text-[11px]">
                    {r.custom !== null && <button type="button" disabled={busy === `count:${key}:${r.id}`} onClick={() => onSave(key, { id: r.id, name: r.name }, "unlimited")} className="text-slate-500 hover:underline">ไม่จำกัด</button>}
                    {r.custom !== undefined && <button type="button" disabled={busy === `count:${key}:${r.id}`} onClick={() => onSave(key, { id: r.id, name: r.name }, "default")} className="text-blue-600 hover:underline">ใช้ค่าเริ่ม</button>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : <p className="mt-3 text-xs text-slate-400">เดือนนี้ยังไม่มีใครใช้ฟีเจอร์นี้</p>}
        <p className="mt-2 text-[11px] text-slate-400">นับเฉพาะครั้งที่ AI ตอบสำเร็จของคนที่กด · ครบ = คนนั้นใช้ฟีเจอร์นี้ไม่ได้จนวันที่ 1 (ปุ่มอื่นยังใช้ได้) · เปลี่ยนหน่วยแล้วระบบแปลงค่าที่ตั้งไว้ให้ตามราคาต่อครั้ง · ผู้ดูแลตั้ง &quot;ไม่จำกัด&quot; ให้ตัวเองได้ · ทุกการเปลี่ยนบันทึกประวัติ</p>
      </div>
    </div>
  );
}

/** 👥 ใครใช้ได้ (รายฟีเจอร์ GPT) — ทุกคนที่มีสิทธิ์ / เฉพาะบทบาท + รายคน · ผู้ดูแลระบบใช้ได้เสมอ · บังคับที่ด่านกลาง (คนที่ไม่ได้รับสิทธิ์จะไม่เห็นปุ่ม/แท็บ) */
function AccessModal({ row, value, roles, knownUsers, busy, onClose, onSave }: {
  row: Row; value: ServiceAccess; roles: RoleOpt[]; knownUsers: NamedUser[]; busy: boolean;
  onClose: () => void; onSave: (next: ServiceAccess, picked: NamedUser[]) => void;
}) {
  const [mode, setMode] = useState<ServiceAccess["mode"]>(value.mode);
  const [sel, setSel] = useState<string[]>(value.roles);
  const [people, setPeople] = useState<NamedUser[]>(() => value.users.map((id) => ({ user_id: id, name: knownUsers.find((u) => u.user_id === id)?.name ?? "ผู้ใช้" })));
  const [who, setWho] = useState<UserPickerValue | null>(null);
  const dirty = mode !== value.mode || JSON.stringify([...sel].sort()) !== JSON.stringify([...value.roles].sort()) || JSON.stringify(people.map((p) => p.user_id).sort()) !== JSON.stringify([...value.users].sort());
  const toggleRole = (k: string) => setSel((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const addWho = (u: UserPickerValue | null) => { setWho(null); if (u && !people.some((p) => p.user_id === u.id)) setPeople((cur) => [...cur, { user_id: u.id, name: u.name }]); };
  return (
    <ERPModal open onClose={onClose} title={`ใครใช้ได้ — ${row.th}`} description="เลือกว่าใครกดใช้ AI ตัวนี้ได้ · คนที่ไม่ได้เลือกจะไม่เห็นปุ่ม" size="md" defaultExpanded={false} storageKey="paid-service-access" hasUnsavedChanges={dirty}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={busy || !dirty} onClick={() => onSave({ mode, roles: mode === "custom" ? sel : [], users: mode === "custom" ? people.map((p) => p.user_id) : [] }, people)} data-access-save
            className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}>
      <div className="space-y-3 text-sm" data-access-modal>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
          <input type="radio" name="access-mode" checked={mode === "all"} onChange={() => setMode("all")} className="mt-0.5" />
          <span><span className="font-medium text-slate-800">ทุกคนที่มีสิทธิ์ใช้ AI</span><span className="block text-xs text-slate-500">ค่าเริ่ม — ใครที่มีสิทธิ์ &quot;ใช้ AI&quot; อยู่แล้วกดได้หมด</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
          <input type="radio" name="access-mode" checked={mode === "custom"} onChange={() => setMode("custom")} className="mt-0.5" />
          <span><span className="font-medium text-slate-800">เฉพาะที่เลือก</span><span className="block text-xs text-slate-500">เลือกตามบทบาท และ/หรือ รายคน</span></span>
        </label>
        {mode === "custom" && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-600">บทบาท</div>
              <div className="flex flex-wrap gap-1.5">
                {roles.filter((r) => r.key !== "admin").map((r) => (
                  <Chip key={r.key} on={sel.includes(r.key)} onClick={() => toggleRole(r.key)}>{r.label}</Chip>
                ))}
                {!roles.filter((r) => r.key !== "admin").length && <span className="text-xs text-slate-400">ยังไม่มีบทบาท</span>}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-600">รายคน</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {people.map((p) => (
                  <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                    {p.name}
                    <button type="button" aria-label={`เอา ${p.name} ออก`} onClick={() => setPeople((cur) => cur.filter((x) => x.user_id !== p.user_id))} className="text-slate-400 hover:text-red-600"><Icon name="cancel" /></button>
                  </span>
                ))}
                <span className="w-56"><UserPicker value={who} onChange={addWho} disableCreate /></span>
              </div>
            </div>
            {!sel.length && !people.length && <p className="text-xs text-amber-700">ยังไม่ได้เลือกใคร — จะใช้ได้เฉพาะผู้ดูแลระบบ</p>}
          </div>
        )}
        <p className="text-[11px] text-slate-400">ผู้ดูแลระบบ (บทบาท admin) ใช้ได้เสมอ · งานอัตโนมัติไม่ถูกกั้น · มีผลภายใน ~30 วินาที · ทุกการเปลี่ยนบันทึกประวัติ</p>
      </div>
    </ERPModal>
  );
}
