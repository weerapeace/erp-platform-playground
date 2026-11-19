/**
 * ตัวช่วยฝั่ง server ของ /api/staff-apps/* — ใครกำลังเรียก + เห็นแอปนี้ไหม (กฎเดียวกับรายชื่อแอป lib/staff-apps appVisibleTo)
 */
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { appVisibleTo } from "@/lib/staff-apps";

export type Viewer = { id: string; role: string | null; name: string };

export async function viewerOf(request: NextRequest): Promise<Viewer | null> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin().from("user_profiles").select("role, display_name, active").eq("id", user.id).maybeSingle();
  const p = data as { role?: string | null; display_name?: string | null; active?: boolean | null } | null;
  if (!p || p.active === false) return null;
  return { id: user.id, role: p.role ?? null, name: p.display_name || user.email || "" };
}

/** แอปนี้ (ตาม key) ที่คนนี้เปิดได้ — ไม่เจอ/ไม่มีสิทธิ์ = null */
export async function visibleApp(appKey: string, viewer: Viewer): Promise<{ id: string; key: string; label: string; kind: string } | null> {
  if (!/^[a-z][a-z0-9_-]{0,30}$/.test(appKey)) return null;
  const { data } = await supabaseAdmin().from("erp_app_groups").select("id, key, label, kind, status, deleted_at, audience").eq("key", appKey).maybeSingle();
  const a = data as { id: string; key: string; label: string; kind: string; status: string; deleted_at: string | null; audience: unknown } | null;
  if (!a || !appVisibleTo(a, viewer)) return null;
  return { id: a.id, key: a.key, label: a.label, kind: a.kind };
}
