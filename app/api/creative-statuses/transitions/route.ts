/** Creative Status Transitions — เส้นทาง (POST เพิ่ม/แก้ป้าย-ชนิด, DELETE ?id=) */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// upsert เส้นทาง (from→to) พร้อมป้าย+ชนิด
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { from_key?: string; to_key?: string; label?: string; kind?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const from_key = (body.from_key ?? "").trim(), to_key = (body.to_key ?? "").trim();
  if (!from_key || !to_key) return NextResponse.json({ error: "ต้องระบุสถานะต้นทาง-ปลายทาง" }, { status: 400 });
  if (from_key === to_key) return NextResponse.json({ error: "ต้นทางกับปลายทางต้องต่างกัน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_status_transitions")
    .upsert({ from_key, to_key, label: (body.label ?? "").trim() || "→", kind: body.kind || "normal" }, { onConflict: "from_key,to_key" })
    .select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "transition:set", entityType: "creative_status", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { from_key, to_key } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_status_transitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "transition:delete", entityType: "creative_status", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
