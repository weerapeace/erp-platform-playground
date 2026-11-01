/**
 * POST /api/gmail/connect { email, return_to } — เริ่มเชื่อม Gmail ของกล่องนี้ (subscriptions.edit)
 * คืน { url } = หน้ายินยอมของ Google → หน้าเว็บพาไปเอง · เสร็จแล้ว Google ส่งกลับที่ /api/gmail/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { gmailAuthUrl, gmailConfigured, gmailRedirectUri, normEmail, signState } from "@/lib/gmail-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  if (!gmailConfigured()) return NextResponse.json({ error: "ผู้ดูแลยังไม่ได้ตั้งค่าการเชื่อม Gmail (ดู docs/gmail-connect-setup.md)" }, { status: 503 });

  let body: { email?: string; return_to?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const email = normEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "อีเมลไม่ถูกต้อง" }, { status: 400 });
  // กลับมาหน้าเดิมในเว็บเราเท่านั้น (กันพาไปเว็บอื่น)
  const ret = typeof body.return_to === "string" && body.return_to.startsWith("/") && !body.return_to.startsWith("//") ? body.return_to : "/subscriptions";

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const state = signState({ email, uid: user?.id ?? null, ret });
  return NextResponse.json({ url: gmailAuthUrl({ email, state, redirectUri: gmailRedirectUri(request.nextUrl.origin) }), error: null });
}
