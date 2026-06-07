/**
 * แท็บเพิ่มเติมของแถบ FamilyNavTabs (Tags Manager) — ตั้งเองได้จากเว็บ
 *
 * เก็บใน app_settings.family_nav_tabs = [{ label, icon, href }]
 *
 * GET   /api/admin/family-tabs            → คืนรายการแท็บ (ทุกคนที่ล็อกอินอ่านได้)
 * PATCH /api/admin/family-tabs { tabs }   → บันทึก (เฉพาะ admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tab = { label: string; icon: string; href: string };

const clean = (arr: unknown): Tab[] =>
  Array.isArray(arr)
    ? arr.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return { label: String(o.label ?? ""), icon: String(o.icon ?? "📋"), href: String(o.href ?? "") };
      }).filter((t) => t.label && t.href)
    : [];

export async function GET(): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("app_settings").select("family_nav_tabs").eq("id", 1).maybeSingle();
  return NextResponse.json({ data: clean(data?.family_nav_tabs), error: null }, { headers: { "Cache-Control": "private, max-age=30" } });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: canDo, error: permErr } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (permErr) return NextResponse.json({ error: permErr.message }, { status: 500 });
  if (canDo !== true) return NextResponse.json({ error: "ไม่มีสิทธิ์ (admin.users)" }, { status: 403 });

  let b: { tabs?: unknown; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const tabs = clean(b.tabs);

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { error } = await admin.from("app_settings").update({ family_nav_tabs: tabs }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "family_tabs.update", entityType: "app_settings",
    actorId: user?.id ?? null, actorName: b.actor ?? user?.email ?? null,
    metadata: { count: tabs.length },
  });
  return NextResponse.json({ ok: true, data: tabs });
}
