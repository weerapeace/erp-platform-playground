/**
 * BOM API — single record (detail + save + archive)
 *
 * GET    /api/bom/[id]   → header + lines (เรียงตาม sequence)
 * PATCH  /api/bom/[id]   → บันทึก header + แทนที่ lines ทั้งชุด
 * DELETE /api/bom/[id]   → archive (is_active=false) ทั้งหัวสูตรและ lines
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { lineToRow, type BomHeader, type BomLine } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function audit(
  admin: ReturnType<typeof supabaseAdmin>,
  actorId: string | null,
  action: string,
  bomId: string,
  bomCode: string,
  extra: Record<string, unknown> = {},
) {
  await admin.from("audit_logs").insert({
    actor_user_id: actorId, action, entity_type: "bom", entity_id: bomId,
    metadata: { bom_code: bomCode, ...extra },
  }).then(() => {}, () => {});
}

// ---- GET — header + lines ----
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = supabaseFromRequest(request);

  const { data: header, error: hErr } = await supabase
    .from("bom_headers").select("*").eq("id", id).single();
  if (hErr) return NextResponse.json({ data: null, error: hErr.message }, { status: 404 });

  const { data: lines, error: lErr } = await supabase
    .from("bom_lines").select("*")
    .eq("bom_code", (header as BomHeader).bom_code)
    .eq("is_active", true)
    .order("sequence", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (lErr) return NextResponse.json({ data: null, error: lErr.message }, { status: 500 });

  return NextResponse.json({ data: { ...header, lines: lines ?? [] }, error: null });
}

// ---- PATCH — save header + replace lines ----
type SaveBody = Partial<BomHeader> & { lines?: BomLine[]; actor?: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: SaveBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();

  // หา bom_code เดิม (lines ผูกด้วย bom_code — ต้องรู้ของเดิมเพื่อลบ/ย้าย)
  const { data: existing, error: exErr } = await admin
    .from("bom_headers").select("bom_code").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบสูตรนี้" }, { status: 404 });
  const oldCode = (existing as { bom_code: string }).bom_code;
  const newCode = (body.bom_code ?? oldCode).trim() || oldCode;

  // กันรหัสใหม่ชนสูตรอื่น
  if (newCode !== oldCode) {
    const { data: dup } = await admin.from("bom_headers").select("id").eq("bom_code", newCode).maybeSingle();
    if (dup) return NextResponse.json({ error: `รหัสสูตร "${newCode}" มีอยู่แล้ว` }, { status: 400 });
  }

  // update header
  const patch: Record<string, unknown> = {
    bom_code:       newCode,
    product_sku:    body.product_sku ?? null,
    product_name:   body.product_name ?? null,
    version:        body.version ?? null,
    bom_type:       body.bom_type ?? null,
    status:         body.status ?? null,
    effective_from: body.effective_from || null,
    note:           body.note ?? null,
  };
  const { error: uErr } = await admin.from("bom_headers").update(patch).eq("id", id);
  if (uErr) return NextResponse.json({ error: friendlyDbError(uErr.message) }, { status: 400 });

  // แทนที่ lines ทั้งชุด (เจ้าของสูตรเดียว) — ลบของเดิมตาม bom_code เดิม แล้ว insert ใหม่ตามรหัสใหม่
  if (Array.isArray(body.lines)) {
    const { error: dErr } = await admin.from("bom_lines").delete().eq("bom_code", oldCode);
    if (dErr) return NextResponse.json({ error: friendlyDbError(dErr.message) }, { status: 400 });
    if (body.lines.length > 0) {
      const { error: iErr } = await admin.from("bom_lines").insert(
        body.lines.map((l, i) => lineToRow(l, newCode, i)),
      );
      if (iErr) return NextResponse.json({ error: friendlyDbError(iErr.message) }, { status: 400 });
    }
  } else if (newCode !== oldCode) {
    // ไม่ได้แก้ lines แต่เปลี่ยนรหัส → ย้าย bom_code ของ lines เดิมให้ตามไปด้วย
    await admin.from("bom_lines").update({ bom_code: newCode }).eq("bom_code", oldCode);
  }

  await audit(admin, user.id, "update", id, newCode, { line_count: body.lines?.length ?? null });
  return NextResponse.json({ id, error: null });
}

// ---- DELETE — archive header + lines ----
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: existing, error: exErr } = await admin
    .from("bom_headers").select("bom_code").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบสูตรนี้" }, { status: 404 });
  const code = (existing as { bom_code: string }).bom_code;

  const { error } = await admin.from("bom_headers").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await admin.from("bom_lines").update({ is_active: false }).eq("bom_code", code);

  await audit(admin, user.id, "archive", id, code);
  return NextResponse.json({ data: { archived: true }, error: null });
}
