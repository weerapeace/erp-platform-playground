"use client";

/**
 * 🔔 รอบเปลี่ยน — "อะไรต้องเปลี่ยนทุกกี่วัน" (เช่น แต่งร้าน Shopee ทุก 14 วัน)
 *   useRefreshRules     = โหลดกฎทุกแบรนด์ (แคชร่วมระหว่างแท็บปฏิทิน/วางแผน)
 *   RefreshPanel        = กล่อง "🔔 ต้องเตรียม" บนหน้าแผน: เลยรอบ / ยังไม่เคยทำ / ใกล้ถึงรอบ + ปุ่ม "＋ เตรียมเลย"
 *   RefreshRulesEditor  = แท็บตั้งค่า (ต่อแบรนด์) เพิ่ม/แก้/เปิดปิด/ลบ
 * ตัวคิดสถานะ (pure) อยู่ที่ lib/marketing/content-plan.ts → refreshStatuses
 * ของกลาง: useSWRLite · ConfirmDialog · PlatformIcon · Toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useSWRLite } from "@/lib/swr-lite";
import type { BrandOption } from "@/app/tasks/data";
import {
  REFRESH_STATE_META, REFRESH_ALERT_STATES, shortThaiDate,
  type RefreshRule, type RefreshStatus, type PlacementType,
} from "@/lib/marketing/content-plan";
import type { PlatformOpt } from "./plan-modal";

export const REFRESH_RULES_KEY = "content-plan:refresh-rules";
const input = "h-9 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

async function fetchRules(): Promise<RefreshRule[]> {
  const j = await apiFetch("/api/marketing/content-plan/refresh-rules").then((r) => r.json());
  if (j.error) throw new Error(j.error);
  return (j.data ?? []) as RefreshRule[];
}
/** กฎรอบเปลี่ยนทุกแบรนด์ (แคชร่วม key เดียว — แท็บปฏิทินใช้นับตัวเลขเตือน, แท็บวางแผนใช้โชว์กล่อง) */
export function useRefreshRules() {
  const swr = useSWRLite(REFRESH_RULES_KEY, fetchRules, { timeoutMs: 15000 });
  return { rules: swr.data ?? [], loaded: swr.data !== undefined, reload: () => swr.revalidate(true) };
}

/** ป้ายของกฎ เช่น "🏪 แต่งร้าน · Shopee" */
export function refreshRuleLabel(r: Pick<RefreshRule, "placement_type" | "platform">, types: PlacementType[], platforms: PlatformOpt[]): string {
  const t = r.placement_type ? types.find((x) => x.key === r.placement_type) : null;
  const pf = platforms.find((p) => p.value === r.platform)?.label ?? r.platform;
  const typeLbl = r.placement_type ? (t ? `${t.icon ? `${t.icon} ` : ""}${t.label}` : r.placement_type) : "ทุกประเภท";
  return `${typeLbl} · ${pf}`;
}

const dueText = (s: RefreshStatus) => {
  if (s.daysLeft == null) return "";
  if (s.daysLeft < 0) return `เลยมา ${-s.daysLeft} วัน`;
  if (s.daysLeft === 0) return "ครบรอบวันนี้";
  return `อีก ${s.daysLeft} วัน`;
};

// ═══════════ กล่อง "🔔 ต้องเตรียม" (หน้าแผน) ═══════════
export function RefreshPanel({ statuses, brandTab, brands, platforms, placementTypes, canCreate, canSetup, onPrepare, onOpen, onSetup }: {
  statuses: RefreshStatus[]; brandTab: string; brands: BrandOption[]; platforms: PlatformOpt[]; placementTypes: PlacementType[];
  canCreate: boolean; canSetup: boolean;
  /** ＋ เตรียมเลย → เปิดการ์ดไอเดียใหม่ เติมแบรนด์/ที่ลง/วันครบรอบ */
  onPrepare: (s: RefreshStatus) => void;
  /** เปิดคอนเทนต์ที่ลงไว้แล้ว */
  onOpen: (contentId: string) => void;
  onSetup: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => statuses.filter((s) => !brandTab || s.rule.brand_id === brandTab), [statuses, brandTab]);
  const alerts = list.filter((s) => REFRESH_ALERT_STATES.includes(s.state));
  const shown = showAll ? list : list.filter((s) => s.state !== "waiting" && s.state !== "prepared");
  const okCount = list.length - list.filter((s) => s.state !== "waiting" && s.state !== "prepared").length;
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
  const count = (st: RefreshStatus["state"]) => list.filter((s) => s.state === st).length;

  if (!list.length) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
        🔔 ยังไม่ได้ตั้งรอบเปลี่ยน{brandTab ? "ของแบรนด์นี้" : ""} — เช่น &quot;แต่งร้าน Shopee ต้องเปลี่ยนทุก 14 วัน&quot; แล้วระบบจะเตือนในนี้ว่าเตรียมไว้หรือยัง
        {canSetup && <button type="button" onClick={onSetup} className="font-medium text-blue-600 hover:underline">ตั้งรอบเปลี่ยน →</button>}
      </div>
    );
  }
  return (
    <div className={`rounded-xl border bg-white ${alerts.length ? "border-amber-300" : "border-slate-200"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold text-slate-700">🔔 ต้องเตรียม</span>
        {alerts.length === 0
          ? <span className="text-xs font-medium text-emerald-700">ทุกที่เตรียมไว้แล้ว / ยังไม่ถึงรอบ ✓</span>
          : (["overdue", "never", "due_soon"] as const).map((st) => count(st) > 0 && (
            <span key={st} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${REFRESH_STATE_META[st].cls}`}>{REFRESH_STATE_META[st].icon} {REFRESH_STATE_META[st].label} {count(st)}</span>
          ))}
        {count("late_plan") > 0 && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${REFRESH_STATE_META.late_plan.cls}`}>{REFRESH_STATE_META.late_plan.icon} {REFRESH_STATE_META.late_plan.label} {count("late_plan")}</span>}
        {canSetup && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onSetup(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSetup(); } }} className="ml-auto rounded px-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700">⚙️ ตั้งรอบ</span>}
        <span className={`${canSetup ? "" : "ml-auto"} text-xs text-slate-400`}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3">
          {shown.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => {
                const m = REFRESH_STATE_META[s.state];
                const p = platforms.find((x) => x.value === s.rule.platform);
                const needs = REFRESH_ALERT_STATES.includes(s.state);
                return (
                  <div key={s.rule.id} className={`rounded-lg border px-2.5 py-2 ${m.cls}`}>
                    <div className="flex items-center gap-1.5 text-xs">
                      <PlatformIcon code={s.rule.platform} iconKey={p?.icon_key ?? p?.icon} size={14} />
                      <span className="min-w-0 truncate font-semibold">{refreshRuleLabel(s.rule, placementTypes, platforms)}</span>
                      <span className="ml-auto shrink-0 text-[11px]">{m.icon} {m.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] opacity-80">
                      {!brandTab && <>{brandName(s.rule.brand_id)} · </>}{s.rule.title ? `${s.rule.title} · ` : ""}ทุก {s.rule.every_days} วัน
                    </div>
                    <div className="mt-1 text-[11px]">
                      {s.lastDone ? <>ทำล่าสุด {shortThaiDate(s.lastDone)} · ครบรอบ {shortThaiDate(s.nextDue!)} <b>({dueText(s)})</b></> : "ยังไม่เคยลงในระบบ"}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {s.prepared ? (
                        <button type="button" onClick={() => onOpen(s.prepared!.id)} className="min-w-0 truncate rounded-md bg-white/70 px-2 py-0.5 text-left text-[11px] text-slate-700 hover:bg-white" title="เปิดคอนเทนต์ที่ลงไว้">
                          📌 {shortThaiDate(s.prepared.date)} · {s.prepared.title || "(ไม่มีหัวข้อ)"}
                        </button>
                      ) : <span className="text-[11px] opacity-70">ยังไม่มีของใหม่ลงวันไว้</span>}
                      {(needs || s.state === "late_plan") && canCreate && (
                        <button type="button" onClick={() => onPrepare(s)} title={`สร้างไอเดียลงวัน ${shortThaiDate(s.suggestDate)}`}
                          className="ml-auto shrink-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700">＋ เตรียมเลย</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {okCount > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className={`text-xs text-slate-500 hover:text-slate-800 ${shown.length ? "mt-2" : ""}`}>
              {showAll ? "▴ ซ่อนที่เรียบร้อยแล้ว" : `▾ ดูที่เตรียมแล้ว / ยังไม่ถึงรอบ (${okCount})`}
            </button>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">นับจากคอนเทนต์ที่ติ๊ก &quot;ลงที่ไหน&quot; ตรงประเภท + ช่องทาง · ทำแล้ว = ถึงวันแล้วและอยู่ขั้นพร้อมโพสต์ขึ้นไป · เตรียมแล้ว = มีของใหม่ลงวันไว้ (ขั้นไหนก็ได้)</p>
        </div>
      )}
    </div>
  );
}

// ═══════════ ตั้งค่ารอบเปลี่ยน (แท็บในหน้าตั้งค่า · ต่อแบรนด์) ═══════════
type RuleForm = { placement_type: string; platform: string; every_days: string; lead_days: string; title: string };
const EMPTY: RuleForm = { placement_type: "", platform: "", every_days: "14", lead_days: "3", title: "" };
const toForm = (r: RefreshRule): RuleForm => ({ placement_type: r.placement_type ?? "", platform: r.platform, every_days: String(r.every_days), lead_days: String(r.lead_days), title: r.title ?? "" });
const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
/** ช่องในแถวรอบเปลี่ยน — เตี้ยกว่า input ปกติ ให้ทั้งกฎจบในบรรทัดเดียว */
const cell = "h-8 rounded-lg border border-slate-200 px-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

async function call(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  const r = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
  return j.data;
}

export function RefreshRulesEditor({ brandId, platforms, placementTypes, canEdit, onChanged }: {
  brandId: string; platforms: PlatformOpt[]; placementTypes: PlacementType[]; canEdit: boolean; onChanged: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<RefreshRule[] | null>(null);
  const [forms, setForms] = useState<Record<string, RuleForm>>({});
  const [add, setAdd] = useState<RuleForm>(EMPTY);
  const [del, setDel] = useState<RefreshRule | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const j = await apiFetch(`/api/marketing/content-plan/refresh-rules?brand_id=${brandId}`).then((r) => r.json());
      const list = (j.data ?? []) as RefreshRule[];
      setRows(list); setForms(Object.fromEntries(list.map((r) => [r.id, toForm(r)])));
    } catch { setRows([]); }
  }, [brandId]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); return true; } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };
  const payload = (f: RuleForm) => ({ placement_type: f.placement_type || null, platform: f.platform, every_days: Number(f.every_days), lead_days: Number(f.lead_days || 0), title: f.title.trim() || null });
  const valid = (f: RuleForm) => !!f.platform && Number(f.every_days) >= 1 && Number(f.every_days) <= 365 && Number(f.lead_days || 0) <= 60;
  /** ช่องทางที่เลือกได้ = ของประเภทการลงนั้น (ถ้าเลือกประเภท) ไม่งั้นทุกช่องทาง · ค่าที่เลือกอยู่แล้วโชว์เสมอ */
  const platformChoices = (f: RuleForm) => {
    const t = placementTypes.find((x) => x.key === f.placement_type);
    const keys = t ? t.platforms : platforms.map((p) => p.value);
    const out = keys.map((k) => platforms.find((p) => p.value === k) ?? { value: k, label: k });
    if (f.platform && !keys.includes(f.platform)) out.push(platforms.find((p) => p.value === f.platform) ?? { value: f.platform, label: f.platform });
    return out;
  };

  // ⚠️ ฟังก์ชันเรียกตรง (ไม่ใช่ component) — กันช่องพิมพ์หลุดโฟกัส
  const renderFields = (f: RuleForm, set: (p: Partial<RuleForm>) => void, disabled: boolean) => (
    <>
      <select value={f.placement_type} disabled={disabled} className={`${cell} w-32 shrink-0`}
        onChange={(e) => { const t = placementTypes.find((x) => x.key === e.target.value); set({ placement_type: e.target.value, ...(t && f.platform && !t.platforms.includes(f.platform) ? { platform: "" } : {}) }); }}>
        <option value="">ทุกประเภท</option>
        {placementTypes.map((t) => <option key={t.key} value={t.key}>{t.icon ? `${t.icon} ` : ""}{t.label}</option>)}
        {f.placement_type && !placementTypes.some((t) => t.key === f.placement_type) && <option value={f.placement_type}>{f.placement_type} (ถูกลบแล้ว)</option>}
      </select>
      <select value={f.platform} onChange={(e) => set({ platform: e.target.value })} disabled={disabled} className={`${cell} w-28 shrink-0 ${f.platform ? "" : "border-red-300"}`}>
        <option value="">— ช่องทาง —</option>
        {platformChoices(f).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <span className="shrink-0 text-xs text-slate-500">ทุก</span>
      <input value={f.every_days} onChange={(e) => set({ every_days: digits(e.target.value, 3) })} disabled={disabled} inputMode="numeric" title="เปลี่ยนทุกกี่วัน" className={`${cell} w-11 shrink-0 text-right`} />
      <span className="shrink-0 text-xs text-slate-500">วัน · เตือน</span>
      <input value={f.lead_days} onChange={(e) => set({ lead_days: digits(e.target.value, 2) })} disabled={disabled} inputMode="numeric" title="เตือนก่อนถึงรอบกี่วัน" className={`${cell} w-10 shrink-0 text-right`} />
      <span className="shrink-0 text-xs text-slate-500">วันก่อน</span>
      <input value={f.title} onChange={(e) => set({ title: e.target.value })} disabled={disabled} maxLength={200} placeholder="ชื่อเรียก (ไม่ใส่ก็ได้)" title="ชื่อเรียก (ไม่ใส่ก็ได้) เช่น แบนเนอร์หน้าร้าน"
        className={`${cell} min-w-[7rem] flex-1`} />
    </>
  );

  if (!rows) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">ตั้งครั้งเดียวว่าอะไรต้องเปลี่ยนทุกกี่วัน เช่น &quot;🏪 แต่งร้าน · Shopee ทุก 14 วัน เตือนก่อน 3 วัน&quot; — หน้าแผนจะมีกล่อง 🔔 ต้องเตรียม บอกว่าที่ไหนเลยรอบ / ใกล้ถึงรอบ / ลงของใหม่ไว้แล้ว · ระบบรู้ว่าทำแล้วจากคอนเทนต์ที่ติ๊ก &quot;ลงที่ไหน&quot; ตรงประเภท + ช่องทาง</p>
      {rows.length === 0 && <div className="rounded-lg bg-slate-50 py-4 text-center text-sm text-slate-400">ยังไม่มีรอบเปลี่ยนของแบรนด์นี้</div>}
      {rows.map((r) => {
        const f = forms[r.id] ?? toForm(r);
        const changed = JSON.stringify(f) !== JSON.stringify(toForm(r));
        return (
          <div key={r.id} className={`flex flex-wrap md:flex-nowrap items-center gap-1 rounded-lg border px-2 py-1 ${changed ? "border-amber-300 bg-amber-50/40" : r.is_active ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50 opacity-70"}`}>
            <span className="shrink-0"><PlatformIcon code={r.platform} iconKey={platforms.find((p) => p.value === r.platform)?.icon_key ?? platforms.find((p) => p.value === r.platform)?.icon} size={16} /></span>
            {renderFields(f, (p) => setForms((m) => ({ ...m, [r.id]: { ...(m[r.id] ?? toForm(r)), ...p } })), !canEdit)}
            {canEdit && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" title={r.is_active ? "เปิดเตือนอยู่ — กดเพื่อปิดชั่วคราว" : "ปิดอยู่ — กดเพื่อเปิดเตือน"} disabled={busy}
                  onClick={() => void run(() => call("PATCH", "/api/marketing/content-plan/refresh-rules", { id: r.id, is_active: !r.is_active }), r.is_active ? "ปิดการเตือนแล้ว" : "เปิดการเตือนแล้ว")}
                  className={`h-8 whitespace-nowrap rounded-lg px-1.5 text-xs ${r.is_active ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-500 hover:bg-slate-100"}`}>{r.is_active ? "● เปิด" : "○ ปิด"}</button>
                {/* ปุ่มบันทึกโผล่เฉพาะตอนแก้ — แถวปกติจะได้สั้นพอจบบรรทัดเดียว */}
                {changed && (
                  <button type="button" disabled={busy || !valid(f)} onClick={() => void run(() => call("PATCH", "/api/marketing/content-plan/refresh-rules", { id: r.id, ...payload(f) }), "บันทึกแล้ว")}
                    className="h-8 whitespace-nowrap rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">บันทึก</button>
                )}
                <button type="button" onClick={() => setDel(r)} disabled={busy} title="ลบ" className="h-8 w-7 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
              </div>
            )}
          </div>
        );
      })}
      {canEdit && (
        <div className="flex flex-wrap md:flex-nowrap items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1">
          <span className="shrink-0 text-xs font-medium text-slate-500">＋ ใหม่</span>
          {renderFields(add, (p) => setAdd((a) => ({ ...a, ...p })), busy)}
          <button type="button" disabled={busy || !valid(add)}
            onClick={() => void run(() => call("POST", "/api/marketing/content-plan/refresh-rules", { brand_id: brandId, ...payload(add) }), "เพิ่มรอบเปลี่ยนแล้ว").then((ok) => { if (ok) setAdd(EMPTY); })}
            className="ml-auto h-8 shrink-0 whitespace-nowrap rounded-lg bg-slate-800 px-3 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-30">เพิ่ม</button>
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" loading={busy} confirmText="ลบ"
        title="ลบรอบเปลี่ยนนี้?" message={del ? `${refreshRuleLabel(del, placementTypes, platforms)} · ทุก ${del.every_days} วัน (คอนเทนต์ไม่ถูกแตะ แค่เลิกเตือน)` : ""}
        onConfirm={() => { const r = del; if (r) void run(() => call("DELETE", `/api/marketing/content-plan/refresh-rules?id=${r.id}`), "ลบแล้ว").then(() => setDel(null)); }} />
    </div>
  );
}
