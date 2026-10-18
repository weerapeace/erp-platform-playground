/**
 * GET /api/master-v2/<entity>/check-code?code=<รหัส>[&exclude_id=<uuid>]
 * 🔤 เช็กรหัสสด ๆ ตอนพิมพ์ (ของกลาง lib/code-rules) — Parent SKU / SKU
 *   → { duplicate: { id, code } | null, warnings: CodeWarning[] }
 *   ซ้ำ = ไม่สนตัวเล็ก/ใหญ่ + ช่องว่างหัวท้าย · เฉพาะตัวที่ใช้งานอยู่ (ถังขยะไม่จองรหัส) · exclude_id = ตัวที่กำลังแก้
 * DB กันซ้ำจริงอยู่แล้ว (unique upper(btrim(code))) — endpoint นี้แค่บอกล่วงหน้า ไม่ต้องรอกดบันทึก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEntity } from "@/app/api/master-v2/[entity]/route";
import { guardApi } from "@/lib/api-auth";
import { CODE_RULE_TABLES, codeWarnings, sameCode } from "@/lib/code-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string }> }): Promise<NextResponse> {
  const { entity } = await params;
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg || !(CODE_RULE_TABLES as readonly string[]).includes(cfg.table)) return NextResponse.json({ duplicate: null, warnings: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const sp = new URL(request.url).searchParams;
  const code = (sp.get("code") ?? "").slice(0, 200);
  const excludeId = (sp.get("exclude_id") ?? "").trim();
  const warnings = codeWarnings(code);
  if (!code.trim()) return NextResponse.json({ duplicate: null, warnings, error: null });

  let q = supabaseAdmin().from(cfg.table).select("id, code").eq("is_active", true).ilike("code", escLike(code.trim())).limit(5);
  if (UUID.test(excludeId)) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ duplicate: null, warnings, error: "เช็กรหัสไม่สำเร็จ" }, { status: 500 });
  const hit = ((data ?? []) as { id: string; code: string }[]).find((r) => sameCode(r.code, code)) ?? null;
  return NextResponse.json({ duplicate: hit, warnings, error: null });
}
