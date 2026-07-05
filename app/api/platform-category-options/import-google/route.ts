/**
 * ดึงหมวดหมู่จาก Google Product Taxonomy (สาธารณะ) → platform_category_options
 *  POST { platform_id }  (products.platforms.edit)
 *   ใช้กับแพลตฟอร์มที่ยึดหมวดของ Google: Facebook / Instagram / Pinterest / YouTube (Merchant Center)
 *   ไฟล์ en-US เท่านั้น (Google ไม่มีภาษาไทย) — ชื่อหมวดเป็นอังกฤษ ซึ่งเป็นมาตรฐานของ Google/FB อยู่แล้ว
 *   fetch ฝั่งเซิร์ฟเวอร์ (กัน CORS) → parse "ID - A > B > C" → upsert
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GOOGLE_TAXONOMY_URL = "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });

  let text: string;
  try {
    const r = await fetch(GOOGLE_TAXONOMY_URL, { headers: { "User-Agent": "ERP-Playground (category import)" } });
    if (!r.ok) return NextResponse.json({ error: `ดึงไฟล์จาก Google ไม่สำเร็จ (HTTP ${r.status})` }, { status: 400 });
    text = await r.text();
  } catch (e) { return NextResponse.json({ error: `ดึงไฟล์จาก Google ไม่ได้: ${(e as Error).message}` }, { status: 400 }); }

  // parse "ID - Level1 > Level2 > ..." (ข้ามบรรทัดคอมเมนต์ # และบรรทัดว่าง)
  const now = new Date().toISOString();
  const rows: { platform_id: string; external_id: string; name_en: string; name_th: string; updated_at: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\s*-\s*(.+)$/);
    if (!m) continue;
    rows.push({ platform_id, external_id: m[1], name_en: m[2].trim(), name_th: "", updated_at: now });
  }
  if (rows.length === 0) return NextResponse.json({ error: "อ่านหมวดจากไฟล์ Google ไม่ได้ (รูปแบบเปลี่ยน?)" }, { status: 400 });

  const admin = supabaseAdmin();
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("platform_category_options").upsert(rows.slice(i, i + 1000), { onConflict: "platform_id,external_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await writeAudit(admin, { action: "import", entityType: "platform_category_options", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, source: "google_taxonomy", count: rows.length } });
  return NextResponse.json({ ok: true, imported: rows.length, error: null });
}
