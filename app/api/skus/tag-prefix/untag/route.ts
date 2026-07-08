/**
 * ปลด SKU ของ "ตระกูลรหัส" หนึ่ง ออกจากแท็ก/ประเภท
 * POST /api/skus/tag-prefix/untag  body { family_tag_id, prefix }
 *   → ลบ m2m link (skus_v2_product_family_m2m) ของ SKU ที่รหัสขึ้นต้นด้วย prefix + ลงท้ายเลข ออกจากแท็กนี้
 *   ใช้แก้เคส "ตระกูลรหัสผูกผิดแท็ก" (เช่น ZIP-N-NO.3#B ไปอยู่ในแท็ก ซิปไนล่อน #5)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// prefix ของรหัส = ส่วนหน้าตัวเลขท้าย (เหมือน tag-codes)
function prefixOf(code: string): string | null {
  const m = code.match(/^(.*?)(\d+)$/);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { family_tag_id?: string; prefix?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const tagId = (body.family_tag_id ?? "").trim();
  const prefix = (body.prefix ?? "").trim();
  if (!tagId || !prefix) return NextResponse.json({ error: "ต้องระบุ family_tag_id + prefix" }, { status: 400 });

  const admin = supabaseAdmin();
  // SKU ที่ผูกแท็กนี้
  const { data: links } = await admin.from("skus_v2_product_family_m2m").select("src_id").eq("tgt_id", tagId).limit(20000);
  const ids = (links ?? []).map((l) => l.src_id as string);
  if (ids.length === 0) return NextResponse.json({ removed: 0, error: null });

  // หา SKU ที่รหัสตรงตระกูลนี้ (chunk กัน URL ยาว)
  const matchIds: string[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await admin.from("skus_v2").select("id, code").in("id", ids.slice(i, i + 1000));
    for (const r of (data ?? [])) if (r.code && prefixOf(r.code as string) === prefix) matchIds.push(r.id as string);
  }
  if (matchIds.length === 0) return NextResponse.json({ removed: 0, error: null });

  // ลบ link เฉพาะแท็กนี้ (ไม่แตะแท็กอื่น/แท็กพ่อ)
  for (let i = 0; i < matchIds.length; i += 500) {
    await admin.from("skus_v2_product_family_m2m").delete().eq("tgt_id", tagId).in("src_id", matchIds.slice(i, i + 500));
  }

  await writeAudit(admin, {
    action: "untag_prefix", entityType: "product_families", entityId: tagId,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { prefix, removed: matchIds.length },
  });
  return NextResponse.json({ removed: matchIds.length, error: null });
}
