/**
 * GET /api/staff-apps/my-lock — ตัวเองถูกล็อกให้อยู่ในแอปพนักงานไหม (ใช้โดย components/app-lock-gate)
 *   → { locked, apps: [{key,label,label_en}], hrefs: [{href, ro?}] }
 * ทุกคนที่ล็อกอินเรียกได้ (ดูเฉพาะของตัวเอง) · ยังไม่ล็อกอิน = locked:false
 * กันจริงด้านข้อมูลอยู่ที่ DB (erp_can — migration 202612200400) · ตัวนี้ใช้กันหน้าเว็บ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { lockIncludes, type AllowedHref, type MyLock } from "@/lib/app-lock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NONE: MyLock = { locked: false, apps: [], hrefs: [] };

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ ...NONE, error: null }, { headers });
  const admin = supabaseAdmin();
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || role === "admin") return NextResponse.json({ ...NONE, error: null }, { headers });
  const { data, error } = await admin.from("erp_app_groups")
    .select("key, label, label_en, lock, allowed_hrefs")
    .eq("kind", "staff").eq("status", "published").is("deleted_at", null).not("lock", "is", null);
  if (error) return NextResponse.json({ ...NONE, error: error.message }, { status: 500, headers });
  const mine = ((data ?? []) as { key: string; label: string; label_en: string | null; lock: unknown; allowed_hrefs: AllowedHref[] | null }[])
    .filter((a) => lockIncludes(a.lock, { id: user.id, role }));
  if (!mine.length) return NextResponse.json({ ...NONE, error: null }, { headers });
  // หน้าเดียวกันอยู่ในแอปหนึ่งแบบปกติ อีกแอปแบบดูอย่างเดียว → ถือว่าปกติ
  const byHref = new Map<string, AllowedHref>();
  for (const a of mine) for (const h of a.allowed_hrefs ?? []) {
    const prev = byHref.get(h.href);
    if (!prev || (prev.ro && !h.ro)) byHref.set(h.href, h.ro ? { href: h.href, ro: true } : { href: h.href });
  }
  const out: MyLock = { locked: true, apps: mine.map((a) => ({ key: a.key, label: a.label, label_en: a.label_en })), hrefs: [...byHref.values()] };
  return NextResponse.json({ ...out, error: null }, { headers });
}
