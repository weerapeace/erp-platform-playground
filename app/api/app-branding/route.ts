/**
 * /api/app-branding — ไอคอนแอป (ของกลาง · lib/app-branding)
 * GET   ?key=<appKey | page:<path>> → { key, label, custom, version, canEdit, page, customLabel, defaultLabel }   (ใครก็ได้ — ใช้ทำเลขรุ่นรูป/โชว์ปุ่มแก้)
 * PATCH { key, icon_url?: string | null, label?: string | null } → ตั้ง/ล้างไอคอน · ชื่อบนหน้าจอ (เฉพาะแอปหน้าเดียว)
 *       ส่งเฉพาะช่องที่เปลี่ยน (ไม่ส่ง = ไม่แตะ) · สิทธิ์ admin.users เหมือนแก้แอปที่ /admin/menu · audit ทุกช่อง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { cleanPageLabel, isBrandKey, pagePathOfBrandKey } from "@/lib/app-branding";
import { getAppBranding, setAppIcon, setPageLabel } from "@/lib/app-branding-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDIT_PERM = "admin.users";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isBrandKey(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const b = await getAppBranding(supabaseAdmin(), key);
  if (!b.source) return NextResponse.json({ error: "ไม่รู้จักแอปนี้" }, { status: 404 });
  let canEdit = false;
  if (request.headers.get("authorization")) {
    const { data } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: EDIT_PERM });
    canEdit = data === true;
  }
  return NextResponse.json({
    key: b.key, label: b.label, custom: !!b.iconUrl, version: b.version, canEdit,
    page: b.source === "page", customLabel: b.customLabel ?? null, defaultLabel: b.defaultLabel ?? b.label, error: null,
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM);
  if (denied) return denied;
  let body: { key?: string; icon_url?: string | null; label?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = String(body.key ?? "");
  if (!isBrandKey(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const hasIcon = "icon_url" in body, hasLabel = "label" in body;
  if (!hasIcon && !hasLabel) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });
  if (hasLabel && !pagePathOfBrandKey(key)) return NextResponse.json({ error: "แก้ชื่อได้เฉพาะแอปหน้าเดียว" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const actor = await requestActor(supabaseFromRequest(request));
    const audit = (field: string, oldV: string | null, newV: string | null) => writeAudit(admin, {
      action: "app_branding.update", entityType: "app_branding", entityId: null, actorId: actor.id, actorName: actor.name,
      metadata: { app: key, field, old_value: oldV, new_value: newV },
    });
    if (hasIcon) {
      const { before, after } = await setAppIcon(admin, key, body.icon_url ?? null);
      await audit("icon_url", before, after);
    }
    if (hasLabel) {
      const { before, after } = await setPageLabel(admin, key, cleanPageLabel(body.label));
      await audit("label", before, after);
    }
    const b = await getAppBranding(admin, key);
    return NextResponse.json({ key, custom: !!b.iconUrl, version: b.version, label: b.label, customLabel: b.customLabel ?? null, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}
