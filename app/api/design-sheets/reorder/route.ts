/**
 * Design Sheets — จัดลำดับการ์ด (Canvas board สลับ/เรียงเอง)
 * PUT /api/design-sheets/reorder { ids: [...] }  → set sort_order = ลำดับใน array (1,2,3,...)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, error: null });

  const admin = supabaseAdmin();
  // อัปเดตทีละตัว (จำนวนการ์ดบนบอร์ดไม่มาก) — sort_order = ตำแหน่ง +1
  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin.from("design_sheets").update({ sort_order: i + 1 }).eq("id", ids[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await writeAudit(admin, {
    action: "reorder", entityType: "design_sheet", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { count: ids.length },
  });
  return NextResponse.json({ ok: true, error: null });
}
