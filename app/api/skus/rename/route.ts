import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// เปลี่ยนชื่อสินค้า "ตัวจริง" (skus_v2.name_th) — มีผลทุกที่ที่ใช้สินค้านี้
// ใช้จากปุ่มแก้ชื่อในรายการสินค้า (SO/ใบเสนอราคา) เมื่อผู้ใช้เลือก "บันทึกเป็นชื่อตัวจริงด้วย"
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;

  let body: { sku_id?: string; name_th?: string; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const id = (body.sku_id ?? "").trim();
  const name = (body.name_th ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุสินค้า" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "ชื่อสินค้าห้ามว่าง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("skus_v2").select("id, code, name_th").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const { error } = await admin.from("skus_v2").update({ name_th: name }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: u } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "rename", entityType: "skus_v2", entityId: id,
    actorId: u?.user?.id ?? null, actorName: body.actor ?? u?.user?.email ?? null,
    metadata: { code: (before as { code?: string }).code, old: (before as { name_th?: string }).name_th, new: name },
  });
  return NextResponse.json({ error: null });
}
