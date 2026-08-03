/**
 * ลายเซ็น / ตราประทับ บนเอกสารพิมพ์ (ของกลาง — ใช้ได้ทุกชนิดเอกสาร)
 *
 *   GET    ?entity_type=po        → รายการของเอกสารชนิดนั้น
 *   POST   { entity_type, kind, label?, image_key }        → เพิ่ม (ตำแหน่งเริ่มต้นตามชนิด)
 *   PATCH  { id, x_mm?, y_mm?, w_mm?, h_mm?, opacity?, label?, is_active? }  → ย้าย/ย่อ-ขยาย/เปิด-ปิด
 *   DELETE ?id=...                → ลบ
 *
 * อ่านได้ทุกคนที่ดูเอกสารได้ (ไม่งั้นใบพิมพ์จะไม่มีตรา) · แก้ต้องมีสิทธิ์อัปโหลดไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_STAMP, type DocStamp } from "@/lib/doc-stamps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "erp_doc_stamps";
const str = (v: unknown) => String(v ?? "").trim();
const numOr = (v: unknown, d: number) => { const n = Number(v); return isFinite(n) ? n : d; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const entity = str(new URL(request.url).searchParams.get("entity_type"));
  if (!entity) return NextResponse.json({ data: [], error: "ต้องระบุชนิดเอกสาร" }, { status: 400 });

  const { data, error } = await supabaseAdmin().from(TABLE)
    .select("*").eq("entity_type", entity).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as DocStamp[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { entity_type?: string; kind?: string; label?: string; image_key?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const entity = str(body.entity_type);
  const imageKey = str(body.image_key);
  if (!entity || !imageKey) return NextResponse.json({ error: "ต้องมีชนิดเอกสารและรูป" }, { status: 400 });
  const kind = body.kind === "signature" ? "signature" : "stamp";

  const admin = supabaseAdmin();
  const { count } = await admin.from(TABLE).select("id", { count: "exact", head: true }).eq("entity_type", entity);

  const { data, error } = await admin.from(TABLE).insert({
    entity_type: entity, kind,
    label: str(body.label) || (kind === "signature" ? "ลายเซ็น" : "ตราประทับ"),
    image_key: imageKey, sort_order: count ?? 0,
    ...DEFAULT_STAMP(kind),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: TABLE, entityId: String((data as { id: string }).id),
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { entity_type: entity, kind },
  });
  return NextResponse.json({ data: data as DocStamp, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload"); if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // จำกัดให้อยู่ในกระดาษ (กันลากหลุดขอบจนหาย)
  if (body.x_mm !== undefined) patch.x_mm = Math.max(-20, Math.min(400, numOr(body.x_mm, 0)));
  if (body.y_mm !== undefined) patch.y_mm = Math.max(-20, Math.min(600, numOr(body.y_mm, 0)));
  if (body.w_mm !== undefined) patch.w_mm = Math.max(5, Math.min(200, numOr(body.w_mm, 30)));
  if (body.h_mm !== undefined) patch.h_mm = Math.max(5, Math.min(200, numOr(body.h_mm, 30)));
  if (body.opacity !== undefined) patch.opacity = Math.max(0.1, Math.min(1, numOr(body.opacity, 1)));
  if (body.label !== undefined) patch.label = str(body.label) || null;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;

  const { data, error } = await supabaseAdmin().from(TABLE).update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data as DocStamp, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const id = str(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "delete", entityType: TABLE, entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {},
  });
  return NextResponse.json({ ok: true, error: null });
}
