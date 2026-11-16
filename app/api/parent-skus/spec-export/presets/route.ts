/**
 * 📤 ชุดช่องส่งออกรายละเอียดสินค้า (ใช้ร่วมกันทั้งทีม)
 *   GET → { data: [{ id, name, config }] } · POST { name, config } → เพิ่มชุด
 *   สิทธิ์: ดู = products.view · เพิ่ม/แก้/ลบ = products.edit · audit spec_export_preset_*
 *   ตาราง spec_export_presets (RLS deny-all → service role) · ทำความสะอาดค่า: lib/spec-export cleanPresetConfig
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanPresetConfig } from "@/lib/spec-export";

export const dynamic = "force-dynamic";

const COLS = "id, name, config, sort_order";

export async function GET(request: Request) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("spec_export_presets").select(COLS).eq("is_active", true)
    .order("sort_order").order("created_at");
  if (error) return NextResponse.json({ data: [], error: "โหลดชุดช่องไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name), config: cleanPresetConfig(r.config) })), error: null });
}

export async function POST(request: Request) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { name?: unknown; config?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "ตั้งชื่อชุดก่อน" }, { status: 400 });
  const config = cleanPresetConfig(body.config);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("spec_export_presets")
    .insert({ name, config, created_by: user?.id ?? null, updated_by: user?.id ?? null }).select(COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกชุดช่องไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "spec_export_preset_create", entityType: "spec_export_preset", entityId: String(data.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { name, fields: config.fields.length, lang: config.lang, mode: config.mode },
  });
  return NextResponse.json({ data: { id: String(data.id), name, config }, error: null });
}
