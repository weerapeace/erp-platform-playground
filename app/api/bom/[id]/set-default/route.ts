/**
 * POST /api/bom/[id]/set-default → ตั้งเวอร์ชั่นนี้เป็น default ของสินค้า
 * (ใบสั่งผลิต MO จะดึงเวอร์ชั่น default มาอัตโนมัติ) — default ได้ 1 เวอร์ชั่น/สินค้า
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: row, error: e1 } = await admin.from("bom_headers").select("product_sku").eq("id", id).single();
  if (e1) return NextResponse.json({ error: "ไม่พบสูตรนี้" }, { status: 404 });
  const sku = (row as { product_sku: string | null }).product_sku;

  // เคลียร์ default เดิมของสินค้านี้ → ตั้งตัวนี้เป็น default
  if (sku) await admin.from("bom_headers").update({ is_default: false }).eq("product_sku", sku);
  const { error } = await admin.from("bom_headers").update({ is_default: true }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id, action: "set_default_bom", entity_type: "bom", entity_id: id,
    metadata: { product_sku: sku },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, error: null });
}
