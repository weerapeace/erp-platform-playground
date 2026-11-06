/**
 * /api/admin/paid-services — ศูนย์ AI และ API ที่เสียเงิน (admin.paid_services)
 *
 * GET   → { services: [{ ...ทะเบียน, enabled, model, configured, month, last_used_at, updated_*, places: [{ key, th, enabled, model, month, last_used_at }] }],
 *           totals, budget, budget_state, by_user: [{ user_id, name, calls, cost_thb, top }], month_start, model_choices, error }
 * GET ?view=history&mode=day|month&key=<service?>  → { buckets: [{ key, label, cost_thb, calls, failed }] } (30 วัน / 12 เดือน · key = กรองบริการเดียว)
 * PATCH { key, place?, enabled?, model? }  เปิด/ปิด · เปลี่ยนโมเดล (ทั้งบริการ หรือรายที่ · "" = ค่าเดิม / ตามบริการ) — locked = 400
 * PATCH { budget_service: { key, monthly_thb } }  งบรายฟีเจอร์ (null/0 = ไม่จำกัด)
 * PATCH { budget: { monthly_thb, warn_pct, over_action } }  ตั้งงบต่อเดือน (ui_config) · ทุกการเปลี่ยนเขียน audit_logs
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
  AUTO_USER_LABEL, budgetState, canPickModel, canToggle, cleanBudget, isValidModel, monthStartBangkokIso, PAID_BUDGET_KEY, PAID_MODEL_CHOICES, PAID_SERVICES,
  paidService, placeKey, splitPlaceKey, usageBuckets, usageRangeStartIso, type PaidBudget, type PaidProvider,
} from "@/lib/paid-services";
import { checkBudgetAlerts, invalidateServiceSettings, loadBudget } from "@/lib/paid-services-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS = "paid_service_settings";
const USAGE = "paid_service_usage";
type Stat = { calls: number; failed: number; cost_thb: number; tokens: number };
const emptyStat = (): Stat => ({ calls: 0, failed: 0, cost_thb: 0, tokens: 0 });

/** ตั้งรหัสของผู้ให้บริการไว้ใน Vercel แล้วหรือยัง (ไม่บอกค่า) · null = ตรวจจากตรงนี้ไม่ได้ */
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
  const monthStart = monthStartBangkokIso();
  const monthRows: Array<{ key: string; ok: boolean; est_cost_thb: number | null; tokens_in: number | null; tokens_out: number | null; user_id: string | null }> = [];
  for (let from = 0; from < 200_000; from += 10_000) {
    const { data, error } = await admin.from(USAGE).select("key, ok, est_cost_thb, tokens_in, tokens_out, user_id").gte("at", monthStart).range(from, from + 9_999);
    if (error) return NextResponse.json({ services: [], error: "โหลดยอดใช้ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    monthRows.push(...((data ?? []) as typeof monthRows));
    if ((data ?? []).length < 10_000) break;
  }
  const [settings, recent, budget] = await Promise.all([
    admin.from(SETTINGS).select("*"),
    admin.from(USAGE).select("key, at").order("at", { ascending: false }).limit(5000),
    loadBudget(true),
  ]);
  if (settings.error) return NextResponse.json({ services: [], error: "โหลดค่าตั้งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  const setBy = new Map(((settings.data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.key), r]));
  // ยอดเดือนนี้: ต่อบริการ (รวมทุกที่) + ต่อ "ที่" + ต่อคน
  const byKey = new Map<string, Stat>(), byPlace = new Map<string, Stat>();
  const byUser = new Map<string, Stat & { keys: Map<string, number> }>();
  for (const r of monthRows) {
    const { key } = splitPlaceKey(r.key);
    const add = (m: Map<string, Stat>, k: string) => { const s = m.get(k) ?? emptyStat(); s.calls += 1; if (!r.ok) s.failed += 1; s.cost_thb += Number(r.est_cost_thb ?? 0); s.tokens += Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0); m.set(k, s); };
    add(byKey, key); if (r.key.includes("@")) add(byPlace, r.key);
    const uk = r.user_id ?? "";
    const u = byUser.get(uk) ?? { ...emptyStat(), keys: new Map<string, number>() };
    u.calls += 1; if (!r.ok) u.failed += 1; u.cost_thb += Number(r.est_cost_thb ?? 0);
    u.keys.set(key, (u.keys.get(key) ?? 0) + 1);
    byUser.set(uk, u);
  }
  const last = new Map<string, string>();
  for (const r of (recent.data ?? []) as Array<{ key: string; at: string }>) {
    if (!last.has(r.key)) last.set(r.key, r.at);
    const base = splitPlaceKey(r.key).key;
    if (!last.has(base)) last.set(base, r.at);
  }

  const services = PAID_SERVICES.map((s) => {
    const st = setBy.get(s.key);
    return {
      ...s,
      enabled: s.kind === "locked" ? true : st?.enabled !== false,
      model: (st?.model as string | null) ?? null,
      configured: configured(s.provider),
      month: byKey.get(s.key) ?? emptyStat(),
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

  // ยอดรายคน — ชื่อจาก user_profiles · ไม่มีคนกด = ระบบ/อัตโนมัติ
  const uids = [...byUser.keys()].filter(Boolean);
  const names = new Map<string, string>();
  if (uids.length) {
    const { data: profs } = await admin.from("user_profiles").select("id, display_name, email").in("id", uids);
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) names.set(p.id, p.display_name || p.email || "ผู้ใช้");
  }
  const by_user = [...byUser.entries()].map(([uid, u]) => ({
    user_id: uid || null, name: uid ? names.get(uid) ?? "ผู้ใช้ (ลบแล้ว)" : AUTO_USER_LABEL,
    calls: u.calls, failed: u.failed, cost_thb: u.cost_thb,
    top: [...u.keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ key: k, th: paidService(k)?.th ?? k, calls: n })),
  })).sort((a, b) => b.cost_thb - a.cost_thb || b.calls - a.calls);

  return NextResponse.json({
    services, totals, budget, budget_state: budgetState(totals.cost_thb, budget), by_user,
    month_start: monthStart, model_choices: PAID_MODEL_CHOICES, error: null,
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.paid_services"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));

  // ── ตั้งงบต่อเดือน
  if (body.budget !== undefined) {
    const before = await loadBudget(true);
    // งบรายฟีเจอร์แก้ที่ budget_service — ไม่ส่ง per_service มา = คงของเดิม (กันการ์ดงบรวมล้างงบรายฟีเจอร์)
    const raw = body.budget as Record<string, unknown>;
    const next = cleanBudget({ ...raw, per_service: raw && typeof raw === "object" && "per_service" in raw ? raw.per_service : before.per_service });
    const { error } = await admin.from("ui_config").upsert({ key: PAID_BUDGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกงบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    invalidateServiceSettings();
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      await writeAudit(admin, { action: "update", entityType: "paid_service_budget", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { changes: { budget: { from: before, to: next } } } });
    }
    await checkBudgetAlerts(next).catch(() => { /* ตั้งงบต่ำกว่ายอดที่ใช้ไปแล้ว = แจ้งทันที · แจ้งไม่ได้ไม่ขวาง */ });
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
    updated_at: new Date().toISOString(),
    updated_by: actor.id, updated_by_name: actor.name,
  };
  const { data, error } = await admin.from(SETTINGS).upsert(row, { onConflict: "key" }).select("*").single();
  if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  invalidateServiceSettings();

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const from = before ? before[k] : k === "enabled" ? true : null;
    if (JSON.stringify(from ?? null) !== JSON.stringify(row[k as "enabled" | "model"] ?? null)) changes[k] = { from, to: row[k as "enabled" | "model"] };
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
