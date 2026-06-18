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
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { lineToRow, saveBomSizes, type BomHeader, type BomLine, type BomSize } from "../route";

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

  // เติมข้อมูลจาก SKU (ชนิด/หน้ากว้าง/รูป/loss) ให้แต่ละบรรทัด — ดึงสดตอนเปิดสูตร
  const rawLines = (lines ?? []) as Array<Record<string, unknown>>;
  const codes = [...new Set(rawLines.map((l) => l.component_sku).filter(Boolean) as string[])];
  const skuMap = new Map<string, { id: string; material_type: string | null; face: number | null; loss: number | null; image: string | null; uom_id: string | null; uom_name: string | null }>();
  if (codes.length > 0) {
    const { data: skus } = await supabase
      .from("skus_v2")
      .select("id, code, fabric_width_cm, cover_image_r2_key, uom_id, grp:material_groups!material_group_id ( name, loss_percent ), uom:uoms!uom_id ( name )")
      .in("code", codes);
    for (const s of (skus ?? []) as Array<Record<string, unknown>>) {
      const g = (Array.isArray(s.grp) ? s.grp[0] : s.grp) as { name?: string; loss_percent?: number } | null;
      const u = (Array.isArray(s.uom) ? s.uom[0] : s.uom) as { name?: string } | null;
      skuMap.set(String(s.code), {
        id: String(s.id),
        material_type: g?.name ?? null,
        face: s.fabric_width_cm != null ? Number(s.fabric_width_cm) : null,
        loss: g?.loss_percent != null ? Number(g.loss_percent) : null,
        image: (s.cover_image_r2_key as string) ?? null,
        uom_id: (s.uom_id as string) ?? null,
        uom_name: u?.name ?? null,
      });
    }
  }
  const enriched = rawLines.map((l) => {
    const sku = l.component_sku ? skuMap.get(String(l.component_sku)) : undefined;
    if (!sku) return l;
    const lineFace = Number(l.face_width_cm) || 0;
    const lineWaste = Number(l.waste_percent) || 0;
    const lineUom = (l.uom as string) || "";
    return {
      ...l,
      sku_id:        sku.id,
      material_type: l.material_type || sku.material_type,          // ใช้ของ SKU ถ้าบรรทัดยังว่าง
      face_width_cm: lineFace > 0 ? lineFace : (sku.face ?? lineFace),
      waste_percent: lineWaste > 0 ? lineWaste : (sku.loss ?? lineWaste),
      uom:           lineUom || sku.uom_name || "",
      uom_id:        sku.uom_id,
      image_key:     sku.image,
    };
  });

  const { data: sizes } = await supabase.from("bom_sizes").select("label, sort")
    .eq("bom_code", (header as BomHeader).bom_code).order("sort", { ascending: true });

  return NextResponse.json({ data: { ...header, lines: enriched, sizes: sizes ?? [] }, error: null });
}

// ---- PATCH — save header + replace lines ----
type SaveBody = Partial<BomHeader> & { lines?: BomLine[]; sizes?: BomSize[]; actor?: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
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

  // ไซส์ (เฟส 4)
  if (Array.isArray(body.sizes)) await saveBomSizes(admin, newCode, body.sizes);
  else if (newCode !== oldCode) await admin.from("bom_sizes").update({ bom_code: newCode }).eq("bom_code", oldCode);

  await audit(admin, user.id, "update", id, newCode, { line_count: body.lines?.length ?? null });
  return NextResponse.json({ id, error: null });
}

// ---- DELETE — archive header + lines ----
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
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
