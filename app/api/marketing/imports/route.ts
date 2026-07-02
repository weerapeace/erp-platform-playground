import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET ?platform= → รายการประวัติการนำเข้า
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.dashboard.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");

  let q = supabaseAdmin()
    .from("marketing_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (platform) q = q.eq("platform", platform);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

// DELETE ?id= → ลบชุด import + ข้อมูลยอดขายของชุดนั้น
export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.import.delete");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ data: null, error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: imp } = await admin.from("marketing_imports").select("*").eq("id", id).single();
  if (!imp) return NextResponse.json({ data: null, error: "ไม่พบชุดข้อมูล" }, { status: 404 });

  // ลบข้อมูลของชุดนี้ก่อน (import_id FK เป็น set null จึงต้องลบเอง)
  await Promise.all([
    admin.from("marketing_sales_daily").delete().eq("import_id", id),
    admin.from("marketing_sales_hourly").delete().eq("import_id", id),
    admin.from("marketing_product_daily").delete().eq("import_id", id),
  ]);
  const { error } = await admin.from("marketing_imports").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "marketing.import.delete",
    entityType: "marketing_imports",
    entityId: id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { platform: imp.platform, shop: imp.shop, date: imp.period_start, file_name: imp.file_name },
  });

  return NextResponse.json({ data: { id }, error: null });
}
