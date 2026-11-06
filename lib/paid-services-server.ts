/**
 * ด่านกลาง "AI และ API ที่เสียเงิน" (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ทะเบียนอยู่ที่ lib/paid-services
 *
 *   aiChat(key, system, content, maxTokens, model?, ctx?)  GPT แบบตอบ JSON
 *       ปิดอยู่ (ทั้งบริการ หรือ "ที่" นั้น) = ServiceOffError · เกินงบ (หยุดอัตโนมัติ) = BudgetExceededError — ข้อความภาษาคนทั้งคู่
 *       โมเดล: ที่แอดมินเลือกในศูนย์ → ที่ฟีเจอร์ส่งมา → ค่าเริ่มต้น
 *   aiAvailable(key, ctx?)  เช็กก่อนว่า GPT ใช้ได้ไหม (เปิดอยู่ + ไม่เกินงบ) — ใช้ตอนมีทางสำรองฟรี (แปลภาษา)
 *   getAiFor(key, ctx?)     Cloudflare AI — ปิดอยู่ = null (ผู้เรียกจัดการ null อยู่แล้ว เหมือนตอนยังไม่ตั้งค่า)
 *   serviceOn(key, place?)  เช็กก่อนเรียกบริการอื่น (สลิป / LINE / อีเมล) · logServiceUse(key, …) บันทึกการใช้
 *
 * ctx = { request?, userId?, place? } — request = หาคนที่กด (บันทึกยอดรายคน) · place = "ที่" ในทะเบียน (เปิด-ปิดรายที่)
 * งบต่อเดือน = ui_config PAID_BUDGET_KEY (นับเฉพาะ GPT) · ใกล้เต็ม/เกิน = แจ้งเตือนผู้ดูแลครั้งเดียวต่อเดือน (erp_notify)
 * ค่าตั้ง = paid_service_settings (แคช 30 วิ) · อ่านไม่ได้ = ถือว่าเปิด (ไม่ทำให้ระบบอื่นพังเพราะศูนย์นี้)
 * บันทึกการใช้ = paid_service_usage (key "<service>@<place>" เมื่อมีหลายที่ · บันทึกไม่ได้ = ข้าม ไม่ขวางงาน)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { openAiChatRaw } from "@/lib/ai-caption";
import { getAi, type AiRunner } from "@/lib/ai";
import {
  budgetOverMessage, budgetState, cleanBudget, estimateCostThb, monthKeyBangkok, monthStartBangkokIso, paidService, PAID_BUDGET_ALERT_KEY, PAID_BUDGET_KEY,
  placeKey, resolvePlace, serviceOffMessage, type PaidBudget,
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
  constructor(b: PaidBudget) { super(budgetOverMessage(b)); }
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
let spendCache: { at: number; month: string; thb: number } | null = null;
/** ยอดใช้ GPT เดือนนี้ (บาท ประมาณ) */
export async function monthSpendThb(force = false): Promise<number> {
  const month = monthKeyBangkok();
  if (!force && spendCache && spendCache.month === month && Date.now() - spendCache.at < SPEND_TTL_MS) return spendCache.thb;
  let thb = 0;
  try {
    const start = monthStartBangkokIso();
    for (let from = 0; from < 500_000; from += 10_000) {
      const { data, error } = await supabaseAdmin().from("paid_service_usage").select("est_cost_thb").gte("at", start).not("est_cost_thb", "is", null).range(from, from + 9_999);
      if (error) throw error;
      for (const r of (data ?? []) as { est_cost_thb: number | null }[]) thb += Number(r.est_cost_thb ?? 0);
      if ((data ?? []).length < 10_000) break;
    }
    spendCache = { at: Date.now(), month, thb };
  } catch { return spendCache?.thb ?? 0; }
  return thb;
}

/** GPT ใช้ได้ไหม (เปิด + ไม่เกินงบแบบหยุด) — ใช้ตอนมีทางสำรองฟรี */
export async function aiAvailable(key: string, ctx?: UseCtx): Promise<boolean> {
  if (!(await serviceOn(key, ctx?.place))) return false;
  const b = await loadBudget();
  return !(b.monthly_thb && b.over_action === "stop" && budgetState(await monthSpendThb(), b) === "over");
}

/** GPT ตอบ JSON ผ่านด่านกลาง — แทน chatJson เดิม (ผลลัพธ์/ข้อความ error เหมือนเดิม) */
export async function aiChat(key: string, system: string, userContent: unknown[], maxTokens: number, model?: string, ctx?: UseCtx): Promise<Record<string, unknown>> {
  if (!(await serviceOn(key, ctx?.place))) throw new ServiceOffError(key);
  const budget = await loadBudget();
  if (budget.monthly_thb && budget.over_action === "stop" && budgetState(await monthSpendThb(), budget) === "over") throw new BudgetExceededError(budget);
  const picked = (await loadServiceSettings()).get(key)?.model || undefined;
  const useModel = picked || model;
  const userId = await resolveUser(ctx);
  try {
    const r = await openAiChatRaw(system, userContent, maxTokens, useModel);
    const cost = estimateCostThb(r.model, r.tokensIn, r.tokensOut);
    await logServiceUse(key, { model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costThb: cost, userId, place: ctx?.place });
    if (spendCache && spendCache.month === monthKeyBangkok()) spendCache.thb += cost;
    if (budget.monthly_thb) await checkBudgetAlerts(budget).catch(() => { /* แจ้งไม่ได้ ไม่ขวางงาน */ });
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
type AlertState = { month: string; warn?: boolean; over?: boolean };

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

export async function checkBudgetAlerts(budget?: PaidBudget): Promise<void> {
  const b = budget ?? (await loadBudget());
  if (!b.monthly_thb) return;
  const spent = await monthSpendThb();
  const st = budgetState(spent, b);
  if (st !== "warn" && st !== "over") return;
  const admin = supabaseAdmin();
  const month = monthKeyBangkok();
  const { data } = await admin.from("ui_config").select("value").eq("key", PAID_BUDGET_ALERT_KEY).maybeSingle();
  const cur = ((data as { value?: AlertState } | null)?.value ?? { month: "" }) as AlertState;
  const sent = cur.month === month ? cur : { month };
  if (st === "warn" && sent.warn) return;
  if (st === "over" && sent.over) return;
  // จองก่อนส่ง (กันส่งซ้ำเมื่อหลายคำขอข้ามเส้นพร้อมกัน)
  const next: AlertState = { month, warn: true, over: st === "over" || !!sent.over };
  await admin.from("ui_config").upsert({ key: PAID_BUDGET_ALERT_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  const ids = await budgetAdminIds();
  if (!ids.length) return;
  const pct = Math.round((spent / b.monthly_thb) * 100);
  const money = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
  await admin.rpc("erp_notify", {
    p_user_ids: ids,
    p_event_type: st === "over" ? "ai_budget.over" : "ai_budget.warn",
    p_title: st === "over" ? `ค่า AI เดือนนี้ครบงบแล้ว (${money(spent)} / ${money(b.monthly_thb)})` : `ค่า AI เดือนนี้ใช้ไป ${pct}% ของงบ`,
    p_body: st === "over"
      ? (b.over_action === "stop" ? "ระบบหยุด GPT ทุกฟีเจอร์แล้ว (แปลภาษาสลับไปตัวฟรี) — เพิ่มงบหรือเปลี่ยนเป็นแจ้งเตือนอย่างเดียวได้ที่ศูนย์ AI / API" : "ตั้งไว้เป็นแจ้งเตือนอย่างเดียว — ทุกฟีเจอร์ยังใช้ต่อได้")
      : `ใช้ไป ${money(spent)} จากงบ ${money(b.monthly_thb)} — ${b.over_action === "stop" ? "ถ้าครบงบ ระบบจะหยุด GPT อัตโนมัติ" : "ครบงบแล้วจะแจ้งอีกครั้ง"}`,
    p_link_url: "/admin/paid-services", p_entity_type: "paid_services", p_entity_id: null,
    p_priority: st === "over" ? "high" : "normal",
  });
}
