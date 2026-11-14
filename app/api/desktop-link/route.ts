/**
 * เชื่อมโปรแกรมบนเครื่อง (Louis Batch) กับบัญชี ERP — ออก "การเข้าสู่ระบบชุดใหม่" ให้โปรแกรมนั้น
 *
 * ทำไมไม่ใช้ token ของเบราว์เซอร์ตรง ๆ: Supabase หมุน refresh token ทุกครั้งที่ต่ออายุ
 * ถ้าโปรแกรมกับเบราว์เซอร์ใช้ชุดเดียวกัน ใครต่ออายุก่อน อีกฝั่งจะหลุด (และระบบอาจตัดทั้งชุดเพราะคิดว่าโดนขโมย)
 * → ออกชุดใหม่แยกของโปรแกรมเอง: สร้าง magic link ฝั่ง server (ไม่ส่งอีเมล) แล้วยืนยันทันที
 *
 * ความปลอดภัย:
 *   - ออกให้ "ตัวเองเท่านั้น" — อีเมลมาจาก token ของคนที่เรียก ไม่รับจาก body · สิทธิ์ = สิทธิ์ของคนนั้นเท่าเดิม
 *   - รับเฉพาะโปรแกรมที่รู้จัก (DESKTOP_APPS) · หน้า /desktop-link ส่งต่อให้โปรแกรมได้เฉพาะ http://127.0.0.1:<port>/erp-linked
 *   - คนกด "อนุญาต" เองทุกครั้ง · บันทึก audit (desktop_link) · token ไม่ลง log
 * คู่มือ: docs/desktop-link.md
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { DESKTOP_APPS } from "@/lib/desktop-link";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user || !user.email) return NextResponse.json({ data: null, error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { app?: string };
  const app = String(body.app ?? "");
  if (!DESKTOP_APPS.includes(app)) return NextResponse.json({ data: null, error: "ไม่รู้จักโปรแกรมนี้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const hashed = link?.properties?.hashed_token;
  if (linkError || !hashed) {
    console.error("[desktop-link] generateLink failed:", linkError?.message);
    return NextResponse.json({ data: null, error: "เชื่อมไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let verified = await anon.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
  if (verified.error || !verified.data.session) verified = await anon.auth.verifyOtp({ token_hash: hashed, type: "email" });
  const session = verified.data.session;
  if (verified.error || !session || session.user.id !== user.id) {
    console.error("[desktop-link] verifyOtp failed:", verified.error?.message);
    return NextResponse.json({ data: null, error: "เชื่อมไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(meta.full_name ?? meta.name ?? meta.display_name ?? "") || user.email;
  await writeAudit(admin, {
    action: "desktop_link", entityType: "auth_session", entityId: user.id,
    actorId: user.id, actorName: user.email, metadata: { app },
  });

  return NextResponse.json({
    data: { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at ?? null, email: user.email, name },
    error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}
