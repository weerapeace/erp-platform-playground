/**
 * แอป Lazada ของแบรนด์ — /api/lazada/app
 *  PUT    { brand_id, app_key, app_secret? }  → ตั้ง/แก้แอปของแบรนด์ (app_secret ว่าง = ใช้ของเดิม เฉพาะ App Key เดิม)
 *  DELETE { brand_id }                         → ล้าง กลับไปใช้แอปกลาง (env LAZADA_APP_KEY/SECRET)
 * สิทธิ์ products.platforms.manage_accounts (เดียวกับปุ่มเชื่อมต่อ) · App Secret เข้ารหัสก่อนเก็บ ไม่ส่งกลับทาง API เลย
 * เชื่อมร้านอยู่ = เปลี่ยน/ล้างแอปไม่ได้ (กุญแจร้านผูกกับแอปเดิม) — กติกาใน lib/lazada planLazAppSave / planLazAppClear
 * ทุกครั้งจด audit (ไม่จดค่า secret)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditDiff } from "@/lib/audit";
import { encryptSecret, hasMasterKey } from "@/lib/secret-box";
import { planLazAppSave, planLazAppClear, lazAppLocked, type LazAppCurrent } from "@/lib/lazada";
import { getPlatformId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { id: string; meta: { stage?: string } | null; app_key: string | null; app_secret: string | null };

async function context(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; app_key?: string; app_secret?: string } = {};
  try { body = await request.json(); } catch { return { ok: false as const, res: NextResponse.json({ ok: false, error: "อ่านข้อมูลไม่ได้" }, { status: 400 }) }; }
  const brandId = String(body.brand_id ?? "").trim();
  if (!brandId) return { ok: false as const, res: NextResponse.json({ ok: false, error: "ต้องเลือกแบรนด์ก่อน" }, { status: 400 }) };
  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return { ok: false as const, res: NextResponse.json({ ok: false, error: "ไม่พบแพลตฟอร์ม lazada ในระบบ" }, { status: 400 }) };
  const { data, error } = await admin.from("platform_credentials").select("id, meta, app_key, app_secret").eq("brand_id", brandId).eq("platform_id", lazId).maybeSingle();
  if (error) return { ok: false as const, res: NextResponse.json({ ok: false, error: `อ่านข้อมูลไม่ได้ (${error.message})` }, { status: 500 }) };
  const row = data as Row | null;
  const current: LazAppCurrent = row?.app_key ? { app_key: row.app_key, has_secret: !!row.app_secret } : null;
  return { ok: true as const, user, body, brandId, admin, lazId, row, current, locked: lazAppLocked(row?.meta) };
}

const audit = (c: { admin: ReturnType<typeof supabaseAdmin>; brandId: string; user: { id: string; email?: string } | null }, action: "set" | "cleared", before: Record<string, unknown>, after: Record<string, unknown>) =>
  writeAudit(c.admin, {
    action: "update", entityType: "platform_credential", entityId: null, actorId: c.user?.id ?? null, actorName: c.user?.email ?? null,
    metadata: { brand_id: c.brandId, platform: "lazada", own_app: action, changes: auditDiff(before, after, { secret: ["app_secret"] }) },
  });

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const c = await context(request);
  if (!c.ok) return c.res;
  const plan = planLazAppSave(c.body, c.current, c.locked);
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error }, { status: c.locked ? 409 : 400 });
  if (plan.unchanged) return NextResponse.json({ ok: true, unchanged: true, error: null });

  let secretEnc: string | null = c.row?.app_secret ?? null;
  if (plan.app_secret) {
    if (!hasMasterKey()) return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้งกุญแจหลัก (PLATFORM_SECRET_KEY) ในโฮสต์ — บันทึก App Secret อย่างปลอดภัยไม่ได้" }, { status: 400 });
    try { secretEnc = await encryptSecret(plan.app_secret); } catch (e) { return NextResponse.json({ ok: false, error: `เข้ารหัสไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 }); }
  }
  const now = new Date().toISOString();
  const patch = { app_key: plan.app_key, app_secret: secretEnc, updated_by: c.user?.id ?? null, updated_at: now };
  const { error } = c.row
    ? await c.admin.from("platform_credentials").update(patch).eq("id", c.row.id)
    : await c.admin.from("platform_credentials").insert({ brand_id: c.brandId, platform_id: c.lazId, api_key: null, meta: {}, ...patch });
  if (error) return NextResponse.json({ ok: false, error: `บันทึกไม่สำเร็จ (${error.message})` }, { status: 500 });

  // secret: จดแค่ว่า "เปลี่ยน" (ค่าจริงไม่เข้า audit)
  const before = { app_key: c.current?.app_key ?? null, app_secret: c.current?.has_secret ? "old" : null };
  await audit(c, "set", before, { app_key: plan.app_key, app_secret: plan.app_secret ? "new" : before.app_secret });
  return NextResponse.json({ ok: true, unchanged: false, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const c = await context(request);
  if (!c.ok) return c.res;
  const plan = planLazAppClear(c.current, c.locked);
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error }, { status: c.locked ? 409 : 400 });
  const { error } = await c.admin.from("platform_credentials")
    .update({ app_key: null, app_secret: null, updated_by: c.user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", c.row!.id);
  if (error) return NextResponse.json({ ok: false, error: `ล้างไม่สำเร็จ (${error.message})` }, { status: 500 });
  await audit(c, "cleared", { app_key: c.current!.app_key, app_secret: c.current!.has_secret ? "old" : null }, { app_key: null, app_secret: null });
  return NextResponse.json({ ok: true, error: null });
}
