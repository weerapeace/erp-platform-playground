/**
 * ด่านกลาง "AI และ API ที่เสียเงิน" (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ทะเบียนอยู่ที่ lib/paid-services
 *
 *   aiChat(key, system, content, maxTokens, model?, ctx?)  GPT แบบตอบ JSON
 *       ปิดอยู่ (ทั้งบริการ หรือ "ที่" นั้น) = ServiceOffError · เกินงบ (หยุดอัตโนมัติ) = BudgetExceededError — ข้อความภาษาคนทั้งคู่
 *       โมเดล: ที่เลือกให้ "ที่" นั้น → ที่เลือกให้ทั้งบริการ → ที่ฟีเจอร์ส่งมา → ค่าเริ่มต้น
 *   aiAvailable(key, ctx?)  เช็กก่อนว่า GPT ใช้ได้ไหม (เปิดอยู่ + ไม่เกินงบ) — ใช้ตอนมีทางสำรองฟรี (แปลภาษา)
 *   getAiFor(key, ctx?)     Cloudflare AI — ปิดอยู่ = null (ผู้เรียกจัดการ null อยู่แล้ว เหมือนตอนยังไม่ตั้งค่า)
 *   serviceOn(key, place?)  เช็กก่อนเรียกบริการอื่น (สลิป / LINE / อีเมล) · logServiceUse(key, …) บันทึกการใช้
 *
 * ctx = { request?, userId?, place? } — request = หาคนที่กด (บันทึกยอดรายคน) · place = "ที่" ในทะเบียน (เปิด-ปิดรายที่)
 * งบต่อเดือน = ui_config PAID_BUDGET_KEY (นับเฉพาะ GPT · รวม + รายฟีเจอร์ per_service) · ใกล้เต็ม/เกิน = แจ้งเตือนผู้ดูแลครั้งเดียวต่อเดือนต่อระดับ (erp_notify)
 * ค่าตั้ง = paid_service_settings (แคช 30 วิ) · อ่านไม่ได้ = ถือว่าเปิด (ไม่ทำให้ระบบอื่นพังเพราะศูนย์นี้)
 * บันทึกการใช้ = paid_service_usage (key "<service>@<place>" เมื่อมีหลายที่ · บันทึกไม่ได้ = ข้าม ไม่ขวางงาน)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { openAiChatRaw } from "@/lib/ai-caption";
import { getAi, type AiRunner } from "@/lib/ai";
import {
  budgetOverMessage, budgetState, cleanBudget, estimateCostThb, monthKeyBangkok, monthStartBangkokIso, paidService, PAID_BUDGET_ALERT_KEY, PAID_BUDGET_KEY,
  placeKey, resolvePlace, serviceBudgetOverMessage, serviceBudgetState, serviceOffMessage, splitPlaceKey, type PaidBudget,
} from "@/lib/paid-services";

export type ServiceSetting = { key: string; enabled: boolean; model: string | null };
export type UseCtx = { request?: Request | null; userId?: string | null; place?: string | null };

const TTL_MS = 30_000;
let cache: { at: number; map: Map<string, ServiceSetting> } | null = null;

export async function loadServiceSettings(force = false): Promise<Map<string, ServiceSetting>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<string, ServiceSetting>();
  try {
    const { data, error } = await supabaseAdmin().from("paid_service_settings").select("key, enabled, model");
    if (error) throw error;
    for (const r of (data ?? []) as ServiceSetting[]) map.set(r.key, { key: r.key, enabled: r.enabled !== false, model: r.model || null });
    cache = { at: Date.now(), map };
  } catch { /* อ่านไม่ได้ = ค่าเริ่มต้นทั้งหมด (เปิด) · ไม่แคช เพื่อลองใหม่ครั้งหน้า */ }
  return map;
}

/** ล้างแคชหลังแอดมินเปลี่ยนค่า (เครื่องเดียวกันเห็นทันที · เครื่องอื่นไม่เกิน 30 วิ) */
export const invalidateServiceSettings = () => { cache = null; budgetCache = null; };

/** เปิดอยู่ไหม — บริการ + "ที่" (ถ้ามี) ต้องไม่ถูกปิด · ปิดไม่ได้ (locked) = เปิดเสมอ */
export async function serviceOn(key: string, place?: string | null): Promise<boolean> {
  const svc = paidService(key);
  if (svc?.kind === "locked") return true;
  const map = await loadServiceSettings();
  if (map.get(key)?.enabled === false) return false;
  const p = resolvePlace(key, place);
  return !(p && map.get(placeKey(key, p))?.enabled === false);
}

export class ServiceOffError extends Error {
  readonly code = "service_off";
  constructor(public readonly key: string) { super(serviceOffMessage(key)); }
}
export class BudgetExceededError extends Error {
  readonly code = "budget_exceeded";
  constructor(message: string) { super(message); }
}

// ── คนที่กด (ยอดรายคน) — แคชต่อ request (ฟีเจอร์ที่เรียก AI หลายรอบในคำขอเดียวไม่ต้องถามซ้ำ)
const userByRequest = new WeakMap<Request, Promise<string | null>>();
async function resolveUser(ctx?: UseCtx): Promise<string | null> {
  if (!ctx) return null;
  if (ctx.userId !== undefined) return ctx.userId ?? null;
  const r = ctx.request;
  if (!r) return null;
  let p = userByRequest.get(r);
  if (!p) {
    p = (async () => { try { const { data } = await supabaseFromRequest(r).auth.getUser(); return data.user?.id ?? null; } catch { return null; } })();
    userByRequest.set(r, p);
  }
  return p;
}

export async function logServiceUse(key: string, u: { model?: string | null; tokensIn?: number; tokensOut?: number; costThb?: number | null; ok?: boolean; error?: string | null; userId?: string | null; place?: string | null } = {}): Promise<void> {
  try {
    await supabaseAdmin().from("paid_service_usage").insert({
      key: placeKey(key, resolvePlace(key, u.place)), model: u.model ?? null, tokens_in: u.tokensIn ?? null, tokens_out: u.tokensOut ?? null,
      est_cost_thb: u.costThb ?? null, ok: u.ok !== false, error: u.error ? String(u.error).slice(0, 300) : null, user_id: u.userId ?? null,
    });
  } catch { /* บันทึกไม่ได้ = ข้าม */ }
}

// ── งบต่อเดือน (นับเฉพาะ GPT)
let budgetCache: { at: number; b: PaidBudget } | null = null;
export async function loadBudget(force = false): Promise<PaidBudget> {
  if (!force && budgetCache && Date.now() - budgetCache.at < TTL_MS) return budgetCache.b;
  let b = cleanBudget(null);
  try {
    const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", PAID_BUDGET_KEY).maybeSingle();
    b = cleanBudget((data as { value?: unknown } | null)?.value ?? null);
    budgetCache = { at: Date.now(), b };
  } catch { /* อ่านไม่ได้ = ไม่จำกัด */ }
  return b;
}

const SPEND_TTL_MS = 60_000;
type Spend = { total: number; byKey: Map<string, number> };
let spendCache: { at: number; month: string; spend: Spend } | null = null;
/** ยอดใช้ GPT เดือนนี้ (บาท ประมาณ) — รวม + แยกรายบริการ (รวมทุกที่ของบริการนั้น) */
export async function monthSpend(force = false): Promise<Spend> {
  const month = monthKeyBangkok();
  if (!force && spendCache && spendCache.month === month && Date.now() - spendCache.at < SPEND_TTL_MS) return spendCache.spend;
  const spend: Spend = { total: 0, byKey: new Map() };
  try {
    const start = monthStartBangkokIso();
    for (let from = 0; from < 500_000; from += 10_000) {
      const { data, error } = await supabaseAdmin().from("paid_service_usage").select("key, est_cost_thb").gte("at", start).not("est_cost_thb", "is", null).range(from, from + 9_999);
      if (error) throw error;
      for (const r of (data ?? []) as { key: string; est_cost_thb: number | null }[]) {
        const v = Number(r.est_cost_thb ?? 0); const k = splitPlaceKey(r.key).key;
        spend.total += v; spend.byKey.set(k, (spend.byKey.get(k) ?? 0) + v);
      }
      if ((data ?? []).length < 10_000) break;
    }
    spendCache = { at: Date.now(), month, spend };
  } catch { return spendCache?.spend ?? spend; }
  return spend;
}
export const monthSpendThb = async (force = false) => (await monthSpend(force)).total;

/** เกินงบแบบ "หยุด" ไหม (งบรวม หรืองบของฟีเจอร์นี้) — คืนข้อความที่จะบอกผู้ใช้ · null = ใช้ได้ */
async function overBudgetMessage(key: string, b: PaidBudget): Promise<string | null> {
  if (b.over_action !== "stop" || (!b.monthly_thb && !b.per_service[key])) return null;
  const sp = await monthSpend();
  if (b.monthly_thb && budgetState(sp.total, b) === "over") return budgetOverMessage(b);
  if (serviceBudgetState(sp.byKey.get(key) ?? 0, b, key) === "over") return serviceBudgetOverMessage(key, b);
  return null;
}

/** GPT ใช้ได้ไหม (เปิด + ไม่เกินงบแบบหยุด) — ใช้ตอนมีทางสำรองฟรี */
export async function aiAvailable(key: string, ctx?: UseCtx): Promise<boolean> {
  if (!(await serviceOn(key, ctx?.place))) return false;
  return (await overBudgetMessage(key, await loadBudget())) === null;
}

/** GPT ตอบ JSON ผ่านด่านกลาง — แทน chatJson เดิม (ผลลัพธ์/ข้อความ error เหมือนเดิม) */
export async function aiChat(key: string, system: string, userContent: unknown[], maxTokens: number, model?: string, ctx?: UseCtx): Promise<Record<string, unknown>> {
  if (!(await serviceOn(key, ctx?.place))) throw new ServiceOffError(key);
  const budget = await loadBudget();
  const over = await overBudgetMessage(key, budget);
  if (over) throw new BudgetExceededError(over);
  // โมเดล: ที่เลือกให้ "ที่" นี้ → ที่เลือกให้ทั้งบริการ → ที่ฟีเจอร์ส่งมา → ค่าเริ่มต้น
  const settings = await loadServiceSettings();
  const place = resolvePlace(key, ctx?.place);
  const useModel = (place ? settings.get(placeKey(key, place))?.model : null) || settings.get(key)?.model || model;
  const userId = await resolveUser(ctx);
  try {
    const r = await openAiChatRaw(system, userContent, maxTokens, useModel);
    const cost = estimateCostThb(r.model, r.tokensIn, r.tokensOut);
    await logServiceUse(key, { model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costThb: cost, userId, place: ctx?.place });
    if (spendCache && spendCache.month === monthKeyBangkok()) { spendCache.spend.total += cost; spendCache.spend.byKey.set(key, (spendCache.spend.byKey.get(key) ?? 0) + cost); }
    if (budget.monthly_thb || budget.per_service[key]) await checkBudgetAlerts(budget, key).catch(() => { /* แจ้งไม่ได้ ไม่ขวางงาน */ });
    return r.data;
  } catch (e) {
    await logServiceUse(key, { model: useModel ?? null, ok: false, error: e instanceof Error ? e.message : String(e), userId, place: ctx?.place });
    throw e;
  }
}

/** Cloudflare AI ผ่านด่านกลาง — ปิดอยู่/ยังไม่ตั้งค่า = null · ทุกครั้งที่เรียก = บันทึกการใช้ (ฟรีตามโควตา → ค่าใช้จ่าย 0) */
export async function getAiFor(key: string, ctx?: UseCtx): Promise<AiRunner | null> {
  if (!(await serviceOn(key, ctx?.place))) return null;
  const ai = await getAi();
  if (!ai) return null;
  return {
    run: async (model, inputs) => {
      const userId = await resolveUser(ctx);
      try {
        const out = await ai.run(model, inputs);
        await logServiceUse(key, { model, costThb: 0, userId, place: ctx?.place });
        return out;
      } catch (e) {
        await logServiceUse(key, { model, ok: false, error: e instanceof Error ? e.message : String(e), userId, place: ctx?.place });
        throw e;
      }
    },
  };
}

// ── แจ้งเตือนงบ — ใกล้เต็ม (warn_pct) / เกินงบ · ครั้งเดียวต่อระดับต่อเดือน · ส่งหาผู้ดูแลที่มีสิทธิ์ admin.paid_services
/** กันแจ้งซ้ำ: งบรวม = warn/over · งบรายฟีเจอร์ = svc["<key>"] = { warn, over } */
type AlertState = { month: string; warn?: boolean; over?: boolean; svc?: Record<string, { warn?: boolean; over?: boolean }> };

async function budgetAdminIds(): Promise<string[]> {
  const admin = supabaseAdmin();
  const [{ data: roles }, { data: grants }] = await Promise.all([
    admin.from("erp_role_permissions").select("role_key").eq("permission_key", "admin.paid_services"),
    admin.from("erp_user_permissions").select("user_id, mode").eq("permission_key", "admin.paid_services"),
  ]);
  const roleKeys = [...new Set(["admin", ...((roles ?? []) as { role_key: string }[]).map((r) => r.role_key)])];
  const { data: users } = await admin.from("user_profiles").select("id, active").in("role", roleKeys);
  const ids = new Set(((users ?? []) as { id: string; active: boolean | null }[]).filter((u) => u.active !== false).map((u) => u.id));
  for (const g of (grants ?? []) as { user_id: string; mode: string }[]) { if (g.mode === "revoke") ids.delete(g.user_id); else ids.add(g.user_id); }
  return [...ids];
}

export async function checkBudgetAlerts(budget?: PaidBudget, serviceKey?: string): Promise<void> {
  const b = budget ?? (await loadBudget());
  if (!b.monthly_thb && !Object.keys(b.per_service).length) return;
  const sp = await monthSpend();
  const admin = supabaseAdmin();
  const month = monthKeyBangkok();
  const { data } = await admin.from("ui_config").select("value").eq("key", PAID_BUDGET_ALERT_KEY).maybeSingle();
  const cur = ((data as { value?: AlertState } | null)?.value ?? { month: "" }) as AlertState;
  const sent: AlertState = cur.month === month ? { ...cur, svc: { ...(cur.svc ?? {}) } } : { month, svc: {} };
  const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  const todo: { level: "warn" | "over"; title: string; body: string }[] = [];

  // งบรวม
  const st = budgetState(sp.total, b);
  if (b.monthly_thb && (st === "warn" || st === "over") && !(st === "warn" ? sent.warn : sent.over)) {
    const pct = Math.round((sp.total / b.monthly_thb) * 100);
    todo.push(st === "over"
      ? { level: "over", title: `ค่า AI เดือนนี้ครบงบแล้ว (${money(sp.total)} / ${money(b.monthly_thb)})`, body: b.over_action === "stop" ? "ระบบหยุด GPT ทุกฟีเจอร์แล้ว (แปลภาษาสลับไปตัวฟรี) — เพิ่มงบหรือเปลี่ยนเป็นแจ้งเตือนอย่างเดียวได้ที่ศูนย์ AI / API" : "ตั้งไว้เป็นแจ้งเตือนอย่างเดียว — ทุกฟีเจอร์ยังใช้ต่อได้" }
      : { level: "warn", title: `ค่า AI เดือนนี้ใช้ไป ${pct}% ของงบ`, body: `ใช้ไป ${money(sp.total)} จากงบ ${money(b.monthly_thb)} — ${b.over_action === "stop" ? "ถ้าครบงบ ระบบจะหยุด GPT อัตโนมัติ" : "ครบงบแล้วจะแจ้งอีกครั้ง"}` });
    sent.warn = true; if (st === "over") sent.over = true;
  }
  // งบรายฟีเจอร์ (เฉพาะตัวที่เพิ่งใช้ · หรือทุกตัวเมื่อไม่ระบุ เช่น ตอนแอดมินเพิ่งตั้งงบ)
  for (const key of serviceKey ? [serviceKey] : Object.keys(b.per_service)) {
    const cap = b.per_service[key]; if (!cap) continue;
    const spent = sp.byKey.get(key) ?? 0;
    const s2 = serviceBudgetState(spent, b, key);
    const was = sent.svc![key] ?? {};
    if ((s2 !== "warn" && s2 !== "over") || (s2 === "warn" ? was.warn : was.over)) continue;
    const name = paidService(key)?.th ?? key;
    todo.push(s2 === "over"
      ? { level: "over", title: `"${name}" ใช้ครบงบเดือนนี้แล้ว (${money(spent)} / ${money(cap)})`, body: b.over_action === "stop" ? `ระบบหยุด "${name}" แล้ว — ฟีเจอร์อื่นยังใช้ได้ · เพิ่มงบได้ที่ศูนย์ AI / API` : "ตั้งไว้เป็นแจ้งเตือนอย่างเดียว — ยังใช้ต่อได้" }
      : { level: "warn", title: `"${name}" ใช้ไป ${Math.round((spent / cap) * 100)}% ของงบ`, body: `ใช้ไป ${money(spent)} จากงบ ${money(cap)} ต่อเดือน` });
    sent.svc![key] = { warn: true, over: s2 === "over" || !!was.over };
  }
  if (!todo.length) return;
  // จองก่อนส่ง (กันส่งซ้ำเมื่อหลายคำขอข้ามเส้นพร้อมกัน)
  await admin.from("ui_config").upsert({ key: PAID_BUDGET_ALERT_KEY, value: sent, updated_at: new Date().toISOString() }, { onConflict: "key" });
  const ids = await budgetAdminIds();
  if (!ids.length) return;
  for (const n of todo) {
    await admin.rpc("erp_notify", {
      p_user_ids: ids, p_event_type: n.level === "over" ? "ai_budget.over" : "ai_budget.warn",
      p_title: n.title, p_body: n.body, p_link_url: "/admin/paid-services", p_entity_type: "paid_services", p_entity_id: null,
      p_priority: n.level === "over" ? "high" : "normal",
    });
  }
}
