/**
 * ฝั่ง server ของ "📥 ดึงบิลจากเมล" (App Subscription) — โหลดรายการ + ขอ token ของกล่องเมลที่ผูกไว้
 * ใช้ร่วม 3 API: ค้น (/mail-bills) · ดูไฟล์ (/mail-bills/file) · แนบหลังยืนยัน (/mail-bills/attach)
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { getGmailToken } from "@/lib/gmail-api";
import { extractEmail, type MailSearchInfo } from "@/lib/gmail-search";

export type MailSub = MailSearchInfo & { id: string; type: string | null; owner_id: string | null };

/** รายการ + token ของกล่องเมลที่ผูก · ไม่ผ่าน = คืน NextResponse error พร้อมส่ง (code ให้หน้าเว็บบอกวิธีแก้) */
export async function loadMailContext(request: Request, db: SupabaseClient, subId: string)
  : Promise<{ sub: MailSub; email: string; token: string; uid: string | null } | { res: NextResponse }> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const uid = user?.id ?? null;
  const { data: sub } = await db.from("subscriptions")
    .select("id, name, account_email, invoice_url, type, owner_id").eq("id", subId).maybeSingle();
  if (!sub) return { res: NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 }) };
  // รายการส่วนตัวของคนอื่น → ห้ามค้นเมลแทน
  if (sub.type === "personal" && sub.owner_id && sub.owner_id !== uid) {
    return { res: NextResponse.json({ error: "รายการส่วนตัวนี้ใช้ได้เฉพาะเจ้าของ" }, { status: 403 }) };
  }
  const email = extractEmail(sub.account_email)?.toLowerCase();
  if (!email) return { res: NextResponse.json({ error: "รายการนี้ยังไม่ได้ใส่อีเมลบัญชี", code: "no_email" }, { status: 400 }) };
  const t = await getGmailToken(db, email);
  if ("error" in t) return { res: NextResponse.json({ error: t.message, code: t.error, email }, { status: 409 }) };
  return { sub: sub as MailSub, email, token: t.token, uid };
}
