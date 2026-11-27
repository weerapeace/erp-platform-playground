/**
 * /api/admin/paid-services — ศูนย์ AI และ API ที่เสียเงิน (admin.paid_services)
 *
 * GET   → { services: [{ ...ทะเบียน, enabled, model, configured, month, last_used_at, updated_*, places: [{ key, th, enabled, model, month, last_used_at }] }],
 *           totals, budget, budget_state, by_user: [{ user_id, name, calls, cost_thb, top }], month_start, model_choices, error }
 * GET ?view=history&mode=day|month&key=<service?>  → { buckets: [{ key, label, cost_thb, calls, failed }] } (30 วัน / 12 เดือน · key = กรองบริการเดียว)
 * PATCH { key, provider }   เปลี่ยนผู้ให้บริการ (เฉพาะรายการที่มี providerChoices · null = ค่าเริ่ม)
 * PATCH { key, place?, enabled?, model? }  เปิด/ปิด · เปลี่ยนโมเดล (ทั้งบริการ หรือรายที่ · "" = ค่าเดิม / ตามบริการ) — locked = 400
 * PATCH { budget_service: { key, monthly_thb } }  งบรายฟีเจอร์ (null/0 = ไม่จำกัด)
 * PATCH { budget_user_default: บาท | null }       งบต่อคน (ค่าเริ่มของทุกคน · null = ไม่จำกัด)
 * PATCH { budget_user: { user_id, monthly_thb } }  ตั้งรายคน — บาท · null = ไม่จำกัด · "default" = กลับไปใช้ค่าเริ่มต่อคน
 * PATCH { budget: { monthly_thb, warn_pct, over_action } }  ตั้งงบต่อเดือน (ui_config) · ทุกการเปลี่ยนเขียน audit_logs
 * PATCH { count_quota: { key, limit } }            โควตาต่อคนต่อเดือน (ค่าเริ่มของทุกคน · null = ไม่จำกัด) — หน่วยตามที่ตั้ง (ครั้ง / บาท)
 * PATCH { count_quota: { key, user_id, limit } }   ตั้งรายคน · null/"unlimited" = ไม่จำกัด · "default" = กลับไปใช้ค่าเริ่ม
 * PATCH { count_quota: { key, unit: "count"|"thb" } }  เปลี่ยนหน่วย — ค่าที่ตั้งไว้แปลงให้ตามราคาต่อครั้ง (ครั้ง × ราคา / บาท ÷ ราคา)
 *   GET คืน count_usage { <key>: { <user_id>: ครั้ง } } + count_usage_thb (บาท) (สำเร็จเดือนนี้ · เฉพาะฟีเจอร์ GPT) + count_users [{ user_id, name }]
 * PATCH { access: { key, mode: "all"|"custom", roles: [role key], users: [user id] } }  ใครใช้ได้ (เฉพาะฟีเจอร์ GPT · ผู้ดูแลใช้ได้เสมอ)
 *   GET คืน access { <key>: { mode, roles, users } } + roles [{ key, label }] (erp_roles) + access_users [{ user_id, name }]
 *   GET services[].call_tokens = { in, out, calls, source: history|estimate } — จำนวนคำเฉลี่ยต่อครั้ง (90 วัน) ใช้คิด "ราคาต่อครั้ง" ของแต่ละรุ่น
 *   GET services[].used_model = รุ่นที่ใช้จริงครั้งล่าสุด (ไว้บอกราคาของ "ค่าเดิมของระบบ" เมื่อยังไม่ได้เลือกรุ่น)
 * รุ่นหลักของทั้งระบบ (แบบ B · 2026-11-27): GET คืน main { model, effort, updated_at, saved } + effort_choices + model_history (ประวัติเปลี่ยนรุ่น 10 รายการ)
 *   services[].calls_30d = ครั้งที่สำเร็จ 30 วันล่าสุด (ไว้ประมาณค่าใช้จ่ายก่อนเปลี่ยนรุ่น) · services[].modelTier = "main" = ทำตามรุ่นหลัก
 * PATCH { main: { model?, effort? } }  เปลี่ยนรุ่นหลัก / ระดับการคิด (ui_config ai_main_model · audit entity ai_main_model)
 * GET ?view=model&key=<service>  → { main, model (ตั้งเฉพาะ | null), effective, follows_main } — เบา ไว้ใช้ในป๊อป AI รายละเอียดสินค้า
 * ทะเบียน = lib/paid-services · ด่านกลาง = lib/paid-services-server
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { openAiKey } from "@/lib/ai-caption";
import { emailProvider } from "@/lib/email";
import {
  AUTO_USER_LABEL, budgetState, callCostThb, cleanAccess, DEFAULT_CALL_TOKENS, effectiveChoice, type ProviderChoice, canPickModel, canToggle, cleanBudget, isValidModel, monthStartBangkokIso, PAID_ACCESS_KEY, PAID_BUDGET_KEY, PAID_MODEL_CHOICES, PAID_SERVICES, type QuotaUnit,
  followsMain, paidService, placeKey, splitPlaceKey, usageBuckets, usageRangeStartIso, userBudgetState, userCap, type PaidBudget, type PaidProvider,
} from "@/lib/paid-services";
import { avgCallTokens, callTokensFor, checkBudgetAlerts, effectiveModel, invalidateServiceSettings, loadAccess, loadBudget } from "@/lib/paid-services-server";
import { loadMainSetting } from "@/lib/ai-main-model-server";
import { AI_MAIN_MODEL_KEY, AI_MODEL_CHOICES, cleanMainSetting, EFFORT_CHOICES, isEffort } from "@/lib/ai-caption-models";

/** ครั้งที่สำเร็จ 30 วันล่าสุด รายบริการ (รวมทุกที่) — ไว้ประมาณ "เปลี่ยนรุ่นแล้วเดือนหนึ่งแพงขึ้นเท่าไหร่" */
async function calls30d(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const out = new Map<string, number>();
  for (let from = 0; from < 200_000; from += 10_000) {
    const { data, error } = await supabaseAdmin().from(USAGE).select("key").gte("at", since).eq("ok", true).not("model", "is", null).range(from, from + 9_999);
    if (error) break;
    for (const r of (data ?? []) as Array<{ key: string }>) { const k = splitPlaceKey(r.key).key; out.set(k, (out.get(k) ?? 0) + 1); }
    if ((data ?? []).length < 10_000) break;
  }
  return out;
}

/** ประวัติเปลี่ยนรุ่น (รุ่นหลัก + ตั้งเฉพาะรายงาน) 10 รายการล่าสุด — จาก audit_logs */
async function modelHistory(): Promise<Array<{ at: string; who: string | null; what: string; from: unknown; to: unknown }>> {
  const { data } = await supabaseAdmin().from("audit_logs").select("created_at, entity_type, metadata").in("entity_type", ["ai_main_model", SETTINGS]).order("created_at", { ascending: false }).limit(60);
  const out: Array<{ at: string; who: string | null; what: string; from: unknown; to: unknown }> = [];
  for (const r of (data ?? []) as Array<{ created_at: string; entity_type: string; metadata: Record<string, unknown> | null }>) {
    const m = r.metadata ?? {}; const ch = (m.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
    const who = typeof m.actor === "string" ? m.actor : null;
    if (r.entity_type === "ai_main_model") {
      if (ch.model) out.push({ at: r.created_at, who, what: "รุ่นหลัก", from: ch.model.from, to: ch.model.to });
      if (ch.effort) out.push({ at: r.created_at, who, what: "ระดับการคิด", from: ch.effort.from, to: ch.effort.to });
    } else if (ch.model) out.push({ at: r.created_at, who, what: String(m.label ?? m.key ?? ""), from: ch.model.from ?? "ค่าเดิม", to: ch.model.to ?? "ค่าเดิม" });
    if (out.length >= 10) break;
  }
  return out.slice(0, 10);
}

/** รุ่นที่ฟีเจอร์นี้ใช้จริงครั้งล่าสุด (ยังไม่ได้เลือกรุ่นในศูนย์ = รู้ว่า "ค่าเดิม" คือรุ่นไหน) */
async function lastUsedModel(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from(USAGE).select("model").or(`key.eq.${key},key.like.${key}@%`).eq("ok", true).not("model", "is", null).order("at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as { model?: string } | undefined)?.model ?? null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS = "paid_service_settings";
const USAGE = "paid_service_usage";
type Stat = { calls: number; failed: number; cost_thb: number; tokens: number };
const emptyStat = (): Stat => ({ calls: 0, failed: 0, cost_thb: 0, tokens: 0 });

/** ตั้งรหัสของผู้ให้บริการไว้ใน Vercel แล้วหรือยัง (ไม่บอกค่า) · null = ตรวจจากตรงนี้ไม่ได้ */
/** ตัวเลือกผู้ให้บริการนี้ตั้งรหัสแล้วหรือยัง (อีเมลแยก Resend / Gmail) */
function choiceConfigured(c: ProviderChoice): boolean | null {
  const has = (k: string) => !!(process.env[k] ?? "").trim();
  if (c.provider === "email") {
    if (c.id === "resend") return has("RESEND_API_KEY") && has("EMAIL_FROM");
    if (c.id === "gmail") return has("GMAIL_USER") && has("GMAIL_APP_PASSWORD");
    return emailProvider() !== null;
  }
  return configured(c.provider);
}

function configured(p: PaidProvider): boolean | null {
  const has = (k: string) => !!(process.env[k] ?? "").trim();
  switch (p) {
    case "openai": return !!openAiKey();
    case "cloudflare": return has("CF_ACCOUNT_ID") && has("CF_AI_API_TOKEN");
    case "easyslip": return has("EASYSLIP_API_KEY");
    case "shippop": return has("SHIPPOP_API_KEY");
    case "email": return emailProvider() !== null;
    case "line": return null;   // ตั้งในศูนย์ LINE (ฐานข้อมูล) — ดูที่หน้านั้น
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.paid_services"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  if (sp.get("view") === "history") return history(sp);
  if (sp.get("view") === "model") {
    const svc = paidService(sp.get("key") ?? "");
    if (!svc || svc.kind !== "ai_chat") return NextResponse.json({ error: "ไม่พบรายการนี้ในทะเบียน" }, { status: 404 });
    const [main, own] = await Promise.all([loadMainSetting(true), admin.from(SETTINGS).select("model").eq("key", svc.key).maybeSingle()]);
    const model = ((own.data as { model?: string | null } | null)?.model) || null;
    return NextResponse.json({ main, model, effective: await effectiveModel(svc.key, null), follows_main: followsMain(svc), error: null });
  }
  const monthStart = monthStartBangkokIso();
  const monthRows: Array<{ key: string; ok: boolean; est_cost_thb: number | null; tokens_in: number | null; tokens_out: number | null; user_id: string | null }> = [];
  for (let from = 0; from < 200_000; from += 10_000) {
    const { data, error } = await admin.from(USAGE).select("key, ok, est_cost_thb, tokens_in, tokens_out, user_id").gte("at", monthStart).range(from, from + 9_999);
    if (error) return NextResponse.json({ services: [], error: "โหลดยอดใช้ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    monthRows.push(...((data ?? []) as typeof monthRows));
    if ((data ?? []).length < 10_000) break;
  }
  const [settings, recent, budget, tokMap, access, rolesRes, main, c30, mHistory] = await Promise.all([
    admin.from(SETTINGS).select("*"),
    admin.from(USAGE).select("key, at, model, ok").order("at", { ascending: false }).limit(5000),
    loadBudget(true),
    avgCallTokens(true),
    loadAccess(true),
    admin.from("erp_roles").select("key, label, active, sort_order").order("sort_order", { ascending: true }),
    loadMainSetting(true),
    calls30d(),
    modelHistory(),
  ]);
  if (settings.error) return NextResponse.json({ services: [], error: "โหลดค่าตั้งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  const setBy = new Map(((settings.data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.key), r]));
  // ยอดเดือนนี้: ต่อบริการ (รวมทุกที่) + ต่อ "ที่" + ต่อคน
  const byKey = new Map<string, Stat>(), byPlace = new Map<string, Stat>();
  const byUser = new Map<string, Stat & { keys: Map<string, number> }>();
  const countUsage: Record<string, Record<string, number>> = {};
  const countUsageThb: Record<string, Record<string, number>> = {};
  for (const r of monthRows) {
    const { key } = splitPlaceKey(r.key);
    const add = (m: Map<string, Stat>, k: string) => { const s = m.get(k) ?? emptyStat(); s.calls += 1; if (!r.ok) s.failed += 1; s.cost_thb += Number(r.est_cost_thb ?? 0); s.tokens += Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0); m.set(k, s); };
    add(byKey, key); if (r.key.includes("@")) add(byPlace, r.key);
    const uk = r.user_id ?? "";
    const u = byUser.get(uk) ?? { ...emptyStat(), keys: new Map<string, number>() };
    u.calls += 1; if (!r.ok) u.failed += 1; u.cost_thb += Number(r.est_cost_thb ?? 0);
    u.keys.set(key, (u.keys.get(key) ?? 0) + 1);
    byUser.set(uk, u);
    if (r.user_id && r.ok && r.est_cost_thb !== null && paidService(key)?.kind === "ai_chat") {
      const m = countUsage[key] ?? (countUsage[key] = {});
      m[r.user_id] = (m[r.user_id] ?? 0) + 1;
      const mt = countUsageThb[key] ?? (countUsageThb[key] = {});
      mt[r.user_id] = Math.round(((mt[r.user_id] ?? 0) + Number(r.est_cost_thb ?? 0)) * 10000) / 10000;
    }
  }
  const last = new Map<string, string>();
  const lastModel = new Map<string, string>();
  for (const r of (recent.data ?? []) as Array<{ key: string; at: string; model: string | null; ok: boolean }>) {
    if (!last.has(r.key)) last.set(r.key, r.at);
    const base = splitPlaceKey(r.key).key;
    if (!last.has(base)) last.set(base, r.at);
    if (r.ok && r.model && !lastModel.has(base)) lastModel.set(base, r.model);
  }

  const services = PAID_SERVICES.map((s) => {
    const st = setBy.get(s.key);
    const choice = effectiveChoice(s, st?.provider as string | null);
    return {
      ...s,
      provider: choice?.provider ?? s.provider,
      provider_choice: choice?.id ?? null,
      provider_choices: (s.providerChoices ?? []).map((c) => ({ ...c, configured: choiceConfigured(c) })),
      enabled: s.kind === "locked" ? true : st?.enabled !== false,
      model: (st?.model as string | null) ?? null,
      used_model: lastModel.get(s.key) ?? null,
      configured: choice ? choiceConfigured(choice) : configured(s.provider),
      call_tokens: s.kind === "ai_chat" ? (() => {
        const h = tokMap.get(s.key);
        if (h && h.calls > 0) return { in: h.in, out: h.out, calls: h.calls, source: "history" as const };
        const p = s.costProfile ?? DEFAULT_CALL_TOKENS;
        return { in: p.in, out: p.out, calls: 0, source: "estimate" as const };
      })() : null,
      month: byKey.get(s.key) ?? emptyStat(),
      calls_30d: c30.get(s.key) ?? 0,
      last_used_at: last.get(s.key) ?? null,
      updated_at: (st?.updated_at as string | null) ?? null,
      updated_by_name: (st?.updated_by_name as string | null) ?? null,
      places: (s.places ?? []).map((p) => {
        const k = placeKey(s.key, p.key); const ps = setBy.get(k);
        return { key: p.key, th: p.th, enabled: ps?.enabled !== false, model: (ps?.model as string | null) ?? null, month: byPlace.get(k) ?? emptyStat(), last_used_at: last.get(k) ?? null, updated_by_name: (ps?.updated_by_name as string | null) ?? null };
      }),
    };
  });
  const totals = services.reduce((a, s) => ({ calls: a.calls + s.month.calls, failed: a.failed + s.month.failed, cost_thb: a.cost_thb + s.month.cost_thb }), { calls: 0, failed: 0, cost_thb: 0 });

  // ยอดรายคน — ชื่อจาก user_profiles · ไม่มีคนกด = ระบบ/อัตโนมัติ · คนที่ตั้งงบรายคนไว้แต่ยังไม่ได้ใช้ = แถวยอด 0
  for (const uid of Object.keys(budget.per_user)) if (!byUser.has(uid)) byUser.set(uid, { ...emptyStat(), keys: new Map<string, number>() });
  const quotaUids = Object.values(budget.count_quota ?? {}).flatMap((q) => Object.keys(q.per_user));
  const accessUids = Object.values(access).flatMap((a) => a.users);
  const uids = [...new Set([...byUser.keys(), ...quotaUids, ...accessUids])].filter(Boolean);
  const names = new Map<string, string>();
  if (uids.length) {
    const { data: profs } = await admin.from("user_profiles").select("id, display_name, email").in("id", uids);
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) names.set(p.id, p.display_name || p.email || "ผู้ใช้");
  }
  const by_user = [...byUser.entries()].map(([uid, u]) => ({
    user_id: uid || null, name: uid ? names.get(uid) ?? "ผู้ใช้ (ลบแล้ว)" : AUTO_USER_LABEL,
    calls: u.calls, failed: u.failed, cost_thb: u.cost_thb,
    cap: uid ? userCap(budget, uid) : null,
    cap_source: !uid ? "auto" : uid in budget.per_user ? (budget.per_user[uid] === null ? "unlimited" : "custom") : budget.per_user_default ? "default" : "none",
    budget_state: uid ? userBudgetState(u.cost_thb, budget, uid) : "none",
    top: [...u.keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ key: k, th: paidService(k)?.th ?? k, calls: n })),
  })).sort((a, b) => b.cost_thb - a.cost_thb || b.calls - a.calls);

  const countUids = [...new Set([...Object.values(countUsage).flatMap((m) => Object.keys(m)), ...quotaUids])];
  const count_users = countUids.map((id) => ({ user_id: id, name: names.get(id) ?? "ผู้ใช้" })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  const roles = ((rolesRes.data ?? []) as Array<{ key: string; label: string | null; active: boolean | null }>).filter((r) => r.active !== false).map((r) => ({ key: r.key, label: r.label || r.key }));
  const access_users = [...new Set(accessUids)].map((id) => ({ user_id: id, name: names.get(id) ?? "ผู้ใช้ (ลบแล้ว)" }));
  return NextResponse.json({
    services, totals, budget, budget_state: budgetState(totals.cost_thb, budget), by_user, count_usage: countUsage, count_usage_thb: countUsageThb, count_users,
    access, roles, access_users, month_start: monthStart, model_choices: PAID_MODEL_CHOICES,
    main, effort_choices: EFFORT_CHOICES, model_history: mHistory, error: null,
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.paid_services"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));

  // ── รุ่นหลักของทั้งระบบ + ระดับการคิด (ใช้กับงานเขียน/คิด · ย้อนกลับ = ส่งค่าเดิมกลับมา)
  if (body.main && typeof body.main === "object") {
    const raw = body.main as { model?: unknown; effort?: unknown };
    if (raw.model !== undefined && !AI_MODEL_CHOICES.some((m) => m.id === raw.model)) return NextResponse.json({ error: "โมเดลไม่อยู่ในรายการที่เลือกได้" }, { status: 400 });
    if (raw.effort !== undefined && !isEffort(raw.effort)) return NextResponse.json({ error: "ระดับการคิดไม่ถูกต้อง" }, { status: 400 });
    const before = await loadMainSetting(true);
    const next = cleanMainSetting({ model: raw.model ?? before.model, effort: raw.effort ?? before.effort });
    const { error } = await admin.from("ui_config").upsert({ key: AI_MAIN_MODEL_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกรุ่นหลักไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (before.model !== next.model) changes.model = { from: before.model, to: next.model };
    if (before.effort !== next.effort) changes.effort = { from: before.effort, to: next.effort };
    if (Object.keys(changes).length || !before.saved) {
      await writeAudit(admin, { action: "update", entityType: "ai_main_model", entityId: null, actorId: actor.id, actorName: actor.name,
        metadata: { label: "รุ่นหลักของทั้งระบบ", changes, first_save: !before.saved } });
    }
    return NextResponse.json({ data: { main: await loadMainSetting(true), before: { model: before.model, effort: before.effort }, model_history: await modelHistory() }, error: null });
  }

  // ── ตั้งงบต่อเดือน
  if (body.budget !== undefined) {
    const before = await loadBudget(true);
    // งบรายฟีเจอร์แก้ที่ budget_service — ไม่ส่ง per_service มา = คงของเดิม (กันการ์ดงบรวมล้างงบรายฟีเจอร์)
    const raw = body.budget as Record<string, unknown>;
    const keep = (k: "per_service" | "per_user" | "per_user_default" | "count_quota") => (raw && typeof raw === "object" && k in raw ? raw[k] : before[k]);
    const next = cleanBudget({ ...raw, per_service: keep("per_service"), per_user: keep("per_user"), per_user_default: keep("per_user_default"), count_quota: keep("count_quota") });
    const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกงบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { changes: { budget: { from: before, to: next } } } });
    }
    await checkBudgetAlerts(next).catch(() => { /* ตั้งงบต่ำกว่ายอดที่ใช้ไปแล้ว = แจ้งทันที · แจ้งไม่ได้ไม่ขวาง */ });
    return NextResponse.json({ data: { budget: next }, error: null });
  }

  // ── งบรายคน: ค่าเริ่มต่อคน / ตั้งรายคน
  if ("budget_user_default" in body || (body.budget_user && typeof body.budget_user === "object")) {
    const before = await loadBudget(true);
    let next: PaidBudget; let meta: Record<string, unknown>;
    if ("budget_user_default" in body) {
      next = cleanBudget({ ...before, per_user_default: body.budget_user_default });
      meta = { changes: { per_user_default: { from: before.per_user_default, to: next.per_user_default } } };
    } else {
      const bu = body.budget_user as { user_id?: unknown; monthly_thb?: unknown };
      const uid = String(bu.user_id ?? "").toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uid)) return NextResponse.json({ error: "ไม่ได้ระบุผู้ใช้" }, { status: 400 });
      const per = { ...before.per_user };
      if (bu.monthly_thb === "default") delete per[uid];
      else if (bu.monthly_thb === null || bu.monthly_thb === "unlimited") per[uid] = null;
      else { const n = Number(bu.monthly_thb); if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "ใส่งบเป็นจำนวนเงินมากกว่า 0" }, { status: 400 }); per[uid] = n; }
      next = cleanBudget({ ...before, per_user: per });
      const { data: prof } = await admin.from("user_profiles").select("display_name, email").eq("id", uid).maybeSingle();
      meta = { user_id: uid, user_name: (prof as { display_name?: string } | null)?.display_name ?? null,
        changes: { per_user: { from: uid in before.per_user ? before.per_user[uid] : "default", to: uid in next.per_user ? next.per_user[uid] : "default" } } };
    }
    const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกงบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name, metadata: meta });
    return NextResponse.json({ data: { budget: next }, error: null });
  }

  // ── ใครใช้ได้ (รายฟีเจอร์ GPT) — ui_config PAID_ACCESS_KEY · บังคับที่ด่านกลาง aiChat
  if (body.access && typeof body.access === "object") {
    const a = body.access as { key?: unknown; mode?: unknown; roles?: unknown; users?: unknown };
    const k = String(a.key ?? "");
    if (paidService(k)?.kind !== "ai_chat") return NextResponse.json({ error: "ตั้ง \"ใครใช้ได้\" ได้เฉพาะฟีเจอร์ที่ใช้ GPT" }, { status: 400 });
    const before = await loadAccess(true);
    const next = cleanAccess({ ...before, [k]: { mode: a.mode === "custom" ? "custom" : "all", roles: a.roles, users: a.users } });
    const { error } = await admin.from("ui_config").upsert({ key: PAID_ACCESS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    const from = before[k] ?? { mode: "all" }, to = next[k] ?? { mode: "all" };
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      await writeAudit(admin, { action: "update", entityType: "paid_service_access", entityId: null, actorId: actor.id, actorName: actor.name,
        metadata: { key: k, label: paidService(k)?.th, changes: { access: { from, to } } } });
    }
    return NextResponse.json({ data: { access: next }, error: null });
  }

  // ── โควตาต่อคนต่อเดือน (รายฟีเจอร์ · ค่าเริ่ม / รายคน · หน่วยครั้ง/บาท)
  if (body.count_quota && typeof body.count_quota === "object") {
    const cq = body.count_quota as { key?: unknown; user_id?: unknown; limit?: unknown; unit?: unknown };
    const k = String(cq.key ?? "");
    if (paidService(k)?.kind !== "ai_chat") return NextResponse.json({ error: "ตั้งโควตาได้เฉพาะฟีเจอร์ที่ใช้ GPT" }, { status: 400 });
    const before = await loadBudget(true);
    const cur = before.count_quota[k] ?? { unit: "count" as QuotaUnit, per_user_default: null, per_user: {} };
    const q = { unit: cur.unit, per_user_default: cur.per_user_default, per_user: { ...cur.per_user } as Record<string, number | null> };
    let meta: Record<string, unknown>;
    if (cq.unit === "count" || cq.unit === "thb") {
      // เปลี่ยนหน่วย — แปลงค่าที่ตั้งไว้ตามราคาต่อครั้งของรุ่นที่ใช้อยู่ (ไม่รู้ราคา = ล้างค่า)
      const to: QuotaUnit = cq.unit;
      if (to === q.unit) return NextResponse.json({ data: { budget: before }, error: null });
      const perCall = callCostThb(await effectiveModel(k, await lastUsedModel(k)), await callTokensFor(k));
      const conv = (v: number | null): number | null => {
        if (v === null || !(perCall > 0)) return null;
        return to === "thb" ? Math.max(0.01, Math.round(v * perCall * 100) / 100) : Math.max(1, Math.floor(v / perCall));
      };
      q.per_user_default = conv(q.per_user_default);
      for (const [uid, v] of Object.entries(q.per_user)) q.per_user[uid] = v === null ? null : conv(v);
      meta = { key: k, label: paidService(k)?.th, per_call_thb: perCall, changes: { count_quota_unit: { from: q.unit, to } } };
      q.unit = to;
      const next = cleanBudget({ ...before, count_quota: { ...before.count_quota, [k]: q } });
      const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return NextResponse.json({ error: "บันทึกโควตาไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
      invalidateServiceSettings();
      await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name, metadata: meta });
      return NextResponse.json({ data: { budget: next }, error: null });
    }
    const lim = cq.limit;
    const n = q.unit === "thb" ? Math.round(Number(lim) * 100) / 100 : Math.floor(Number(lim));
    if (cq.user_id !== undefined && cq.user_id !== null) {
      const uid = String(cq.user_id).toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uid)) return NextResponse.json({ error: "ไม่ได้ระบุผู้ใช้" }, { status: 400 });
      const from = uid in q.per_user ? q.per_user[uid] : "default";
      if (lim === "default") delete q.per_user[uid];
      else if (lim === null || lim === "unlimited") q.per_user[uid] = null;
      else if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: q.unit === "thb" ? "ใส่จำนวนเงินมากกว่า 0" : "ใส่จำนวนครั้งมากกว่า 0" }, { status: 400 });
      else q.per_user[uid] = n;
      const { data: prof } = await admin.from("user_profiles").select("display_name").eq("id", uid).maybeSingle();
      meta = { key: k, label: paidService(k)?.th, user_id: uid, user_name: (prof as { display_name?: string } | null)?.display_name ?? null,
        unit: q.unit, changes: { count_quota_user: { from, to: uid in q.per_user ? q.per_user[uid] : "default" } } };
    } else {
      const from = q.per_user_default;
      q.per_user_default = lim === null || lim === "" || lim === "unlimited" || !Number.isFinite(n) || n <= 0 ? null : n;
      meta = { key: k, label: paidService(k)?.th, unit: q.unit, changes: { count_quota_default: { from, to: q.per_user_default } } };
    }
    const next = cleanBudget({ ...before, count_quota: { ...before.count_quota, [k]: q } });
    const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกโควตาไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name, metadata: meta });
    return NextResponse.json({ data: { budget: next }, error: null });
  }

  // ── งบรายฟีเจอร์ (แก้ทีละตัว — รวมเข้ากับงบที่ตั้งไว้)
  if (body.budget_service && typeof body.budget_service === "object") {
    const bs = body.budget_service as { key?: unknown; monthly_thb?: unknown };
    const k = String(bs.key ?? "");
    if (paidService(k)?.kind !== "ai_chat") return NextResponse.json({ error: "ตั้งงบได้เฉพาะฟีเจอร์ที่ใช้ GPT" }, { status: 400 });
    const before = await loadBudget(true);
    const per = { ...before.per_service };
    const n = Number(bs.monthly_thb);
    if (bs.monthly_thb === null || bs.monthly_thb === "" || !Number.isFinite(n) || n <= 0) delete per[k]; else per[k] = n;
    const next: PaidBudget = cleanBudget({ ...before, per_service: per });
    const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกงบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    if ((before.per_service[k] ?? null) !== (next.per_service[k] ?? null)) {
      await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name,
        metadata: { key: k, label: paidService(k)?.th, changes: { monthly_thb: { from: before.per_service[k] ?? null, to: next.per_service[k] ?? null } } } });
    }
    await checkBudgetAlerts(next, k).catch(() => { /* แจ้งไม่ได้ไม่ขวาง */ });
    return NextResponse.json({ data: { budget: next }, error: null });
  }

  // ── เปิด/ปิด · โมเดล (ทั้งบริการ หรือรายที่)
  const svc = paidService(String(body.key ?? ""));
  if (!svc) return NextResponse.json({ error: "ไม่พบรายการนี้ในทะเบียน" }, { status: 404 });
  const place = body.place ? String(body.place) : null;
  if (place && !(svc.places ?? []).some((p) => p.key === place)) return NextResponse.json({ error: "ไม่พบ \"ที่\" นี้ในทะเบียน" }, { status: 404 });
  const rowKey = placeKey(svc.key, place);

  const patch: Record<string, unknown> = {};
  if ("enabled" in body) {
    if (!canToggle(svc)) return NextResponse.json({ error: `"${svc.th}" ปิดไม่ได้ — ${svc.offBehavior}` }, { status: 400 });
    patch.enabled = body.enabled === true;
  }
  if ("provider" in body) {
    if (place) return NextResponse.json({ error: "เปลี่ยนผู้ให้บริการได้ทั้งรายการเท่านั้น" }, { status: 400 });
    const pv = body.provider === null || body.provider === "" ? null : String(body.provider);
    if (!svc.providerChoices?.length) return NextResponse.json({ error: "รายการนี้ยังมีผู้ให้บริการเดียว" }, { status: 400 });
    if (pv && !svc.providerChoices.some((c) => c.id === pv)) return NextResponse.json({ error: "ไม่พบผู้ให้บริการนี้ในตัวเลือก" }, { status: 400 });
    patch.provider = pv;
  }
  if ("model" in body) {
    const m = String(body.model ?? "").trim();
    if (!canPickModel(svc)) return NextResponse.json({ error: "รายการนี้เลือกโมเดลไม่ได้" }, { status: 400 });
    if (!isValidModel(m)) return NextResponse.json({ error: "โมเดลไม่อยู่ในรายการที่เลือกได้" }, { status: 400 });
    patch.model = m || null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });

  const { data: before } = await admin.from(SETTINGS).select("*").eq("key", rowKey).maybeSingle();
  const row = {
    key: rowKey,
    enabled: "enabled" in patch ? patch.enabled : (before?.enabled ?? true),
    model: "model" in patch ? patch.model : (before?.model ?? null),
    provider: "provider" in patch ? patch.provider : (before?.provider ?? null),
    updated_at: new Date().toISOString(),
    updated_by: actor.id, updated_by_name: actor.name,
  };
  const { data, error } = await admin.from(SETTINGS).upsert(row, { onConflict: "key" }).select("*").single();
  if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  invalidateServiceSettings();

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const from = before ? before[k] : k === "enabled" ? true : null;
    if (JSON.stringify(from ?? null) !== JSON.stringify(row[k as "enabled" | "model" | "provider"] ?? null)) changes[k] = { from, to: row[k as "enabled" | "model" | "provider"] };
  }
  if (Object.keys(changes).length) {
    const placeTh = place ? svc.places?.find((p) => p.key === place)?.th : null;
    await writeAudit(admin, {
      action: "enabled" in changes ? (row.enabled ? "enable" : "disable") : "update",
      entityType: SETTINGS, entityId: null, actorId: actor.id, actorName: actor.name,
      metadata: { key: rowKey, label: placeTh ? `${svc.th} · ${placeTh}` : svc.th, changes },
    });
  }
  return NextResponse.json({ data, error: null });
}

/** ยอดใช้ย้อนหลัง — รายวัน 30 วัน / รายเดือน 12 เดือน (เวลาไทย) · key = เฉพาะบริการนั้น (รวมทุกที่) */
async function history(sp: URLSearchParams): Promise<NextResponse> {
  const mode = sp.get("mode") === "month" ? "month" : "day";
  const count = mode === "day" ? 30 : 12;
  const key = sp.get("key") ?? "";
  if (key && !paidService(key)) return NextResponse.json({ buckets: [], error: "ไม่พบรายการนี้ในทะเบียน" }, { status: 404 });
  const admin = supabaseAdmin();
  const rows: Array<{ key: string; at: string; est_cost_thb: number | null; ok: boolean }> = [];
  for (let from = 0; from < 500_000; from += 10_000) {
    let q = admin.from(USAGE).select("key, at, est_cost_thb, ok").gte("at", usageRangeStartIso(mode, count)).order("at", { ascending: true }).range(from, from + 9_999);
    if (key) q = q.or(`key.eq.${key},key.like.${key}@%`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ buckets: [], error: "โหลดยอดย้อนหลังไม่สำเร็จ" }, { status: 500 });
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < 10_000) break;
  }
  return NextResponse.json({ buckets: usageBuckets(rows, mode, count), mode, key: key || null, error: null });
}
