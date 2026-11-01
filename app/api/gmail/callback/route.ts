/**
 * GET /api/gmail/callback — Google ส่งกลับมาหลังผู้ใช้กดยินยอมเชื่อม Gmail
 * ไม่มี session ผู้ใช้ (เป็นการ redirect จาก Google) → พิสูจน์ด้วย state ที่เซ็น HMAC ตอนกดเชื่อม (มีอายุ 15 นาที)
 * เก็บ refresh token แบบเข้ารหัส แล้วพากลับหน้าเดิมพร้อม ?gmail=connected|error
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { exchangeGmailCode, gmailConfigured, gmailRedirectUri, saveGmailConnection, verifyState } from "@/lib/gmail-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  access_denied: "ยกเลิกการเชื่อม",
  no_scope: "ไม่ได้ติ๊กอนุญาตให้อ่านเมล",
  no_refresh_token: "Google ไม่ส่งสิทธิ์ระยะยาวมา ลองเชื่อมใหม่",
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const state = verifyState(sp.get("state") ?? "");
  const back = (status: "connected" | "error", extra: Record<string, string>) => {
    const ret = state?.ret ?? "/subscriptions";
    const u = new URL(ret, request.nextUrl.origin);
    // กลับเข้าแอปแยก (/app/<key>?go=/หน้า — lib/top-window) → ใส่ผลไว้ที่หน้าปลายทางในกรอบ ไม่ใช่ที่ตัวแอป
    const go = u.searchParams.get("go");
    const target = go && go.startsWith("/") && !go.startsWith("//") ? new URL(go, request.nextUrl.origin) : u;
    target.searchParams.set("gmail", status);
    Object.entries(extra).forEach(([k, v]) => target.searchParams.set(k, v));
    if (target !== u) u.searchParams.set("go", target.pathname + target.search);
    return NextResponse.redirect(u, 303);
  };

  if (!state) return back("error", { reason: "ลิงก์เชื่อมหมดอายุหรือไม่ถูกต้อง ลองกดเชื่อมใหม่" });
  if (!gmailConfigured()) return back("error", { reason: "ผู้ดูแลยังไม่ได้ตั้งค่าการเชื่อม Gmail" });
  const err = sp.get("error");
  if (err) return back("error", { reason: REASON[err] ?? err, email: state.email });
  const code = sp.get("code");
  if (!code) return back("error", { reason: "ไม่ได้รับรหัสจาก Google", email: state.email });

  const ex = await exchangeGmailCode(code, gmailRedirectUri(request.nextUrl.origin));
  if ("error" in ex) return back("error", { reason: REASON[ex.error] ?? ex.error, email: state.email });

  const db = supabaseAdmin();
  const { error } = await saveGmailConnection(db, { email: ex.email, refreshToken: ex.refreshToken, scope: ex.scope, uid: state.uid });
  if (error) return back("error", { reason: `บันทึกการเชื่อมไม่สำเร็จ: ${error.message}`, email: ex.email });

  await writeAudit(db, {
    action: "connect", entityType: "gmail_connections", entityId: null, actorId: state.uid, actorName: null,
    metadata: { email: ex.email, requested_email: state.email, scope: ex.scope },
  });
  // เลือกบัญชีอื่นในหน้า Google → ยังเชื่อมให้ แต่บอกผู้ใช้ว่าเป็นกล่องไหน
  return back("connected", { email: ex.email, ...(ex.email !== state.email ? { requested: state.email } : {}) });
}
