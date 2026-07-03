/**
 * รายการหมวดหมู่ให้เลือกของแพลตฟอร์ม — /api/platform-category-options
 *  GET  ?platform_id=&search=&limit=  (products.platforms.view) → หมวด (ค้นหา path ไทย/อังกฤษ/รหัส)
 *  POST { platform_id, rows:[{id,en,th}] }  (products.platforms.edit) → นำเข้า/อัปเดตจากไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const search = (sp.get("search") ?? "").trim();
  const idsParam = (sp.get("ids") ?? "").trim();   // ดึงเฉพาะรหัสที่ระบุ (ไว้โชว์ค่าที่เลือกไว้)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30", 10)));
  if (!platformId) return NextResponse.json({ categories: [], total: 0, error: null });
  const admin = supabaseAdmin();

  const total = (await admin.from("platform_category_options").select("id", { count: "exact", head: true }).eq("platform_id", platformId)).count ?? 0;
  let q = admin.from("platform_category_options").select("external_id, name_en, name_th").eq("platform_id", platformId);
  if (idsParam) q = q.in("external_id", idsParam.split(",").map((s) => s.trim()).filter(Boolean));
  else if (search) q = q.or(`name_th.ilike.%${search}%,name_en.ilike.%${search}%,external_id.ilike.%${search}%`);
  q = q.order("external_id", { ascending: true }).limit(idsParam ? 50 : limit);
  const { data } = await q;
  const categories = ((data ?? []) as Record<string, unknown>[]).map((c) => ({ external_id: String(c.external_id), name_en: (c.name_en as string) ?? "", name_th: (c.name_th as string) ?? "" }));
  return NextResponse.json({ categories, total, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string; rows?: { id?: unknown; en?: unknown; th?: unknown }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const clean = rows
    .map((r) => ({ external_id: String(r.id ?? "").trim(), name_en: String(r.en ?? "").trim(), name_th: String(r.th ?? "").trim() }))
    .filter((r) => r.external_id && (r.name_en || r.name_th));
  if (clean.length === 0) return NextResponse.json({ error: "ไม่พบข้อมูลหมวดหมู่ในไฟล์ (ต้องมีคอลัมน์ id + en/th)" }, { status: 400 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin.from("platform_category_options").upsert(clean.map((r) => ({ platform_id, ...r, updated_at: now })), { onConflict: "platform_id,external_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "import", entityType: "platform_category_options", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, count: clean.length } });
  return NextResponse.json({ ok: true, imported: clean.length, error: null });
}
