/**
 * /api/admin/paid-services — ศูนย์ AI และ API ที่เสียเงิน (admin.paid_services)
 *
 * GET   → { services: [{ ...ทะเบียน, enabled, model, configured, month: {calls, failed, cost_thb, tokens}, last_used_at, updated_* }],
 *           totals: { calls, failed, cost_thb }, month_start, model_choices, error }
 * PATCH { key, enabled?, model? }   เปิด/ปิด · เปลี่ยนโมเดล ("" = ค่าเดิมของระบบ) — แบบปิดไม่ได้ (locked) = 400 · เขียน audit_logs
 * ทะเบียนจุดที่ใช้ = lib/paid-services · ด่านกลาง = lib/paid-services-server
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { openAiKey } from "@/lib/ai-caption";
import { emailProvider } from "@/lib/email";
import { canPickModel, canToggle, isValidModel, monthStartBangkokIso, PAID_MODEL_CHOICES, PAID_SERVICES, paidService, type PaidProvider } from "@/lib/paid-services";
import { invalidateServiceSettings } from "@/lib/paid-services-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS = "paid_service_settings";
const USAGE = "paid_service_usage";

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
  const monthStart = monthStartBangkokIso();
  const [settings, month, recent] = await Promise.all([
    admin.from(SETTINGS).select("*"),
    admin.from(USAGE).select("key, ok, est_cost_thb, tokens_in, tokens_out").gte("at", monthStart).limit(50000),
    admin.from(USAGE).select("key, at").order("at", { ascending: false }).limit(5000),
  ]);
  if (settings.error) return NextResponse.json({ services: [], error: "โหลดค่าตั้งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  const setBy = new Map(((settings.data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.key), r]));
  const stats = new Map<string, { calls: number; failed: number; cost_thb: number; tokens: number }>();
  for (const r of (month.data ?? []) as Array<{ key: string; ok: boolean; est_cost_thb: number | null; tokens_in: number | null; tokens_out: number | null }>) {
    const s = stats.get(r.key) ?? { calls: 0, failed: 0, cost_thb: 0, tokens: 0 };
    s.calls += 1; if (!r.ok) s.failed += 1;
    s.cost_thb += Number(r.est_cost_thb ?? 0); s.tokens += Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0);
    stats.set(r.key, s);
  }
  const last = new Map<string, string>();
  for (const r of (recent.data ?? []) as Array<{ key: string; at: string }>) if (!last.has(r.key)) last.set(r.key, r.at);

  const services = PAID_SERVICES.map((s) => {
    const st = setBy.get(s.key);
    return {
      ...s,
      enabled: s.kind === "locked" ? true : st?.enabled !== false,
      model: (st?.model as string | null) ?? null,
      configured: configured(s.provider),
      month: stats.get(s.key) ?? { calls: 0, failed: 0, cost_thb: 0, tokens: 0 },
      last_used_at: last.get(s.key) ?? null,
      updated_at: (st?.updated_at as string | null) ?? null,
      updated_by_name: (st?.updated_by_name as string | null) ?? null,
    };
  });
  const totals = services.reduce((a, s) => ({ calls: a.calls + s.month.calls, failed: a.failed + s.month.failed, cost_thb: a.cost_thb + s.month.cost_thb }), { calls: 0, failed: 0, cost_thb: 0 });
  return NextResponse.json({ services, totals, month_start: monthStart, model_choices: PAID_MODEL_CHOICES, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.paid_services"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const svc = paidService(String(body.key ?? ""));
  if (!svc) return NextResponse.json({ error: "ไม่พบรายการนี้ในทะเบียน" }, { status: 404 });

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

  const admin = supabaseAdmin();
  const { data: before } = await admin.from(SETTINGS).select("*").eq("key", svc.key).maybeSingle();
  const actor = await requestActor(supabaseFromRequest(request));
  const row = {
    key: svc.key,
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
    await writeAudit(admin, {
      action: "enabled" in changes ? (row.enabled ? "enable" : "disable") : "update",
      entityType: SETTINGS, entityId: null, actorId: actor.id, actorName: actor.name,
      metadata: { key: svc.key, label: svc.th, changes },
    });
  }
  return NextResponse.json({ data, error: null });
}
