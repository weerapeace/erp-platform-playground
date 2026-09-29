/**
 * GET  /api/bom/cutting-blocks?search=  → ค้นบล็อกตัด (รวม Odoo mirror + ที่ผู้ใช้สร้างเอง)
 * POST /api/bom/cutting-blocks            → สร้างบล็อกใหม่ (bom_cut_blocks) body: { code, width, length }
 * PATCH  { id, code?, width?, length? }    → แก้บล็อกที่สร้างเอง (รหัสเปลี่ยนได้เฉพาะตอนยังไม่มีสูตร/ใบสั่งผลิตใช้)
 * DELETE ?id=                              → เลิกใช้บล็อกที่สร้างเอง (ซ่อนจากตัวเลือก · สูตรเดิมที่ใช้อยู่ไม่กระทบ)
 * บล็อกที่มาจาก Odoo แก้/ลบที่นี่ไม่ได้ (เป็นสำเนาจาก Odoo)
 *
 * id เป็น string เสมอ (odoo = ตัวเลข, manual = uuid) — บรรทัด BOM อ้างอิงด้วย "รหัสบล็อก" (code)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CuttingBlock = {
  id: string; code: string; type: string | null;
  width: number | null; length: number | null; source: "odoo" | "manual";
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
  const supabase = supabaseFromRequest(request);
  const t = `%${search}%`;

  // manual (มาก่อน) + odoo
  let mq = supabase.from("bom_cut_blocks").select("id, code, block_type, block_width, block_length").eq("is_active", true).order("code").limit(20);
  if (search) mq = mq.ilike("code", t);

  let oq = supabase.from("odoo_cutting_blocks").select("id, block_name, block_code, block_type, block_width, block_length").eq("active", true).order("block_name").limit(40);
  if (search) oq = oq.or(`block_name.ilike.${t},block_code.ilike.${t}`);

  const [m, o] = await Promise.all([mq, oq]);
  if (m.error) return NextResponse.json({ data: [], error: m.error.message }, { status: 500 });
  if (o.error) return NextResponse.json({ data: [], error: o.error.message }, { status: 500 });

  const manual: CuttingBlock[] = (m.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id), code: String(x.code ?? ""), type: (x.block_type as string) ?? "สร้างเอง",
      width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "manual" };
  });
  const odoo: CuttingBlock[] = (o.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id), code: String(x.block_code ?? x.block_name ?? ""), type: (x.block_type as string) ?? null,
      width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "odoo" };
  });
  return NextResponse.json({ data: [...manual, ...odoo], error: null });
}

// ---- POST: สร้างบล็อกใหม่ ----
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { code?: string; width?: number; length?: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "ต้องระบุรหัสบล็อก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: dup } = await admin.from("bom_cut_blocks").select("id").eq("code", code).maybeSingle();
  if (dup) return NextResponse.json({ error: `รหัสบล็อก "${code}" มีอยู่แล้ว` }, { status: 400 });

  const { data, error } = await admin.from("bom_cut_blocks")
    .insert({ code, block_width: body.width ?? null, block_length: body.length ?? null })
    .select("id, code, block_type, block_width, block_length").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id, action: "create", entity_type: "cut_block", entity_id: null,
    metadata: { code, width: body.width, length: body.length },
  }).then(() => {}, () => {});

  const x = data as Record<string, unknown>;
  const block: CuttingBlock = { id: String(x.id), code: String(x.code), type: (x.block_type as string) ?? "สร้างเอง",
    width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "manual" };
  return NextResponse.json({ data: block, error: null });
}

const toBlock = (x: Record<string, unknown>): CuttingBlock => ({
  id: String(x.id), code: String(x.code), type: (x.block_type as string) ?? "สร้างเอง",
  width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "manual",
});

/** รหัสบล็อกนี้ถูกใช้อยู่กี่ที่ (สูตร + ใบสั่งผลิต) */
async function usageOf(admin: ReturnType<typeof supabaseAdmin>, code: string): Promise<{ bom: number; mo: number }> {
  const [b, m] = await Promise.all([
    admin.from("bom_lines").select("id", { count: "exact", head: true }).eq("cut_block_code", code),
    admin.from("mo_materials").select("id", { count: "exact", head: true }).eq("cut_block_code", code),
  ]);
  return { bom: b.count ?? 0, mo: m.count ?? 0 };
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; code?: string; width?: number | null; length?: number | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุบล็อก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("bom_cut_blocks").select("id, code, block_type, block_width, block_length, is_active").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบบล็อกนี้ (บล็อกจาก Odoo แก้ที่นี่ไม่ได้)" }, { status: 404 });
  const c = cur as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if (body.code !== undefined) {
    const code = String(body.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "ต้องระบุรหัสบล็อก" }, { status: 400 });
    if (code !== String(c.code)) {
      const u = await usageOf(admin, String(c.code));
      if (u.bom + u.mo > 0) return NextResponse.json({ error: `เปลี่ยนรหัสไม่ได้ — รหัส "${String(c.code)}" ถูกใช้อยู่ใน ${u.bom} บรรทัดสูตร / ${u.mo} บรรทัดใบสั่งผลิต (แก้ได้เฉพาะขนาด)` }, { status: 400 });
      const { data: dup } = await admin.from("bom_cut_blocks").select("id").eq("code", code).neq("id", id).maybeSingle();
      if (dup) return NextResponse.json({ error: `รหัสบล็อก "${code}" มีอยู่แล้ว` }, { status: 400 });
      patch.code = code;
    }
  }
  for (const [k, col] of [["width", "block_width"], ["length", "block_length"]] as const) {
    const v = body[k];
    if (v === undefined) continue;
    if (v !== null && !(Number(v) > 0)) return NextResponse.json({ error: "กว้าง/ยาว ต้องมากกว่า 0" }, { status: 400 });
    patch[col] = v === null ? null : Number(v);
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: toBlock(c), error: null });

  patch.updated_at = new Date().toISOString();
  const { data, error } = await admin.from("bom_cut_blocks").update(patch).eq("id", id).select("id, code, block_type, block_width, block_length").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "cut_block", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { old: { code: c.code, width: c.block_width, length: c.block_length }, new: patch } });
  return NextResponse.json({ data: toBlock(data as Record<string, unknown>), error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุบล็อก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("bom_cut_blocks").select("id, code, block_width, block_length").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบบล็อกนี้ (บล็อกจาก Odoo ลบที่นี่ไม่ได้)" }, { status: 404 });
  const c = cur as Record<string, unknown>;
  const u = await usageOf(admin, String(c.code));

  // เลิกใช้ (ซ่อนจากตัวเลือก) — ไม่ลบจริง เพราะสูตร/ใบสั่งผลิตอ้างรหัสนี้เป็นข้อความ
  const { error } = await admin.from("bom_cut_blocks").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "archive", entityType: "cut_block", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { code: c.code, width: c.block_width, length: c.block_length, used_in_bom_lines: u.bom, used_in_mo_lines: u.mo } });
  return NextResponse.json({ data: { id, used: u.bom + u.mo }, error: null });
}
