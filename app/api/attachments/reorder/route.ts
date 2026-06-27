/**
 * POST /api/attachments/reorder — เรียงลำดับรูปในแกลเลอรี (erp_playground_attachments.sort_order)
 *   body: { entity_type, entity_id, ordered_ids: string[] }
 * ตั้ง sort_order ตามตำแหน่งใน ordered_ids (ตรวจว่า id เป็นของ entity นี้ก่อน กันแก้ของคนอื่น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let b: { entity_type?: string; entity_id?: string; ordered_ids?: string[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const entityType = String(b.entity_type ?? "").trim();
  const entityId = String(b.entity_id ?? "").trim();
  const ids = Array.isArray(b.ordered_ids) ? [...new Set(b.ordered_ids.filter(Boolean))] : [];
  if (!entityType || !entityId || ids.length === 0) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const admin = supabaseAdmin();
  // ตรวจ ownership — เฉพาะ id ที่เป็นของ (entity_type, entity_id) นี้
  const { data: own, error: ownErr } = await admin.from("erp_playground_attachments")
    .select("id").eq("entity_type", entityType).eq("entity_id", entityId).in("id", ids);
  if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 });
  const ownSet = new Set((own ?? []).map((r) => (r as { id: string }).id));

  let i = 0;
  for (const id of ids) {
    if (!ownSet.has(id)) continue;
    const { error } = await admin.from("erp_playground_attachments").update({ sort_order: i }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    i++;
  }
  return NextResponse.json({ success: true, error: null });
}
