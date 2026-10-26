/**
 * /api/app-branding — ไอคอนแอป (ของกลาง · lib/app-branding)
 * GET   ?key=<appKey> → { key, label, custom, version, canEdit }   (ใครก็ได้ — ใช้ทำเลขรุ่นรูป/โชว์ปุ่มแก้)
 * PATCH { key, icon_url | null } → ตั้ง/ล้างไอคอน (สิทธิ์ admin.users เหมือนแก้แอปที่ /admin/menu) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { APP_KEY_RE } from "@/lib/app-branding";
import { getAppBranding, setAppIcon } from "@/lib/app-branding-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDIT_PERM = "admin.users";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!APP_KEY_RE.test(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const b = await getAppBranding(supabaseAdmin(), key);
  if (!b.source) return NextResponse.json({ error: "ไม่รู้จักแอปนี้" }, { status: 404 });
  let canEdit = false;
  if (request.headers.get("authorization")) {
    const { data } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: EDIT_PERM });
    canEdit = data === true;
  }
  return NextResponse.json({ key: b.key, label: b.label, custom: !!b.iconUrl, version: b.version, canEdit, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM);
  if (denied) return denied;
  let body: { key?: string; icon_url?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.key ?? "");
  if (!APP_KEY_RE.test(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const { before, after } = await setAppIcon(admin, key, body.icon_url ?? null);
    const actor = await requestActor(supabaseFromRequest(request));
    await writeAudit(admin, {
      action: "app_branding.update", entityType: "app_branding", entityId: null, actorId: actor.id, actorName: actor.name,
      metadata: { app: key, field: "icon_url", old_value: before, new_value: after },
    });
    const b = await getAppBranding(admin, key);
    return NextResponse.json({ key, custom: !!b.iconUrl, version: b.version, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}
