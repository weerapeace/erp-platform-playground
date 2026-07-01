/**
 * ทดสอบเชื่อมต่อ LINE SHOPPING — /api/line-shopping/test
 *  POST { brand_id }  (products.platforms.manage_accounts)
 *   → โหลด api_key ของ (แบรนด์ × line_shopping) จาก platform_credentials (ฝั่งเซิร์ฟเวอร์)
 *   → เรียก linePing → { ok, status, error? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { linePing } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องระบุ brand_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platformId = (pf as { id?: string } | null)?.id;
  if (!platformId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING ในระบบ" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platformId).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ ok: false, error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้" }, { status: 400 });

  let apiKey: string;
  try { apiKey = await decryptSecret(stored); }
  catch { return NextResponse.json({ ok: false, error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }, { status: 400 }); }

  const res = await linePing(apiKey);
  return NextResponse.json({ ok: res.ok, status: res.status, error: res.ok ? null : res.error });
}
