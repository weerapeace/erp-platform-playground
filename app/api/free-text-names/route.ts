/**
 * ทะเบียน "ชื่อที่พิมพ์เอง" ใช้ซ้ำได้ (ของกลาง) — /api/free-text-names
 *   GET    ?kind=bom_material&search=      → รายการชื่อ (ที่ใช้บ่อยขึ้นก่อน)
 *   POST   { kind?, name, note? }          → เพิ่มชื่อใหม่ (ชื่อซ้ำ = คืนตัวเดิม ไม่ error)
 *   PATCH  { id, name?, note?, bump? }     → แก้ชื่อ/หมายเหตุ · bump=true = นับว่าถูกใช้อีกครั้ง
 *   DELETE ?id=                            → ลบออกจากรายการ (soft — is_active=false)
 *
 * ใช้กับช่อง "พิมพ์ชื่อเอง" ที่ยังไม่มีรหัสจริง (คำขอแก้สูตร) — `kind` เผื่อช่องอื่นในอนาคต
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type FreeTextName = {
  id: string; kind: string; name: string; note: string | null;
  use_count: number; created_by_name: string | null; created_at: string;
};

const COLS = "id, kind, name, note, use_count, created_by_name, created_at";
const KIND = (v: string | null) => (v ?? "bom_material").trim() || "bom_material";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const search = (sp.get("search") ?? "").trim();
  const admin = supabaseAdmin();

  let q = admin.from("free_text_names").select(COLS).eq("kind", KIND(sp.get("kind"))).eq("is_active", true)
    .order("use_count", { ascending: false }).order("name", { ascending: true }).limit(200);
  if (search) q = q.ilike("name", `%${search.replace(/[%_]/g, "")}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as unknown as FreeTextName[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;   // คนหน้างานเพิ่มชื่อเองได้
  let body: { kind?: string; name?: string; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อ" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "ชื่อยาวเกินไป (สูงสุด 120 ตัวอักษร)" }, { status: 400 });

  const admin = supabaseAdmin();
  const kind = KIND(body.kind ?? null);
  // ชื่อซ้ำ (ไม่สนตัวพิมพ์ใหญ่เล็ก) → คืนตัวเดิม ไม่ต้องให้ผู้ใช้เจอ error
  const { data: dup } = await admin.from("free_text_names").select(COLS)
    .eq("kind", kind).eq("is_active", true).ilike("name", name).limit(1);
  const hit = (dup ?? [])[0] as FreeTextName | undefined;
  if (hit) return NextResponse.json({ data: hit, existed: true, error: null });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data, error } = await admin.from("free_text_names").insert({
    kind, name, note: (body.note ?? "").trim() || null,
    created_by: user?.id ?? null, created_by_name: user?.email ?? null,
  }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "free_text_names", entityId: (data as FreeTextName).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { kind, name },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  return NextResponse.json({ data: data as unknown as FreeTextName, existed: false, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: { id?: string; name?: string; note?: string; bump?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();

  // นับว่าถูกใช้ (ให้ชื่อที่ใช้บ่อยลอยขึ้นบน) — ไม่ใช่การแก้ข้อมูล จึงใช้แค่สิทธิ์ดู
  if (body.bump && body.name === undefined && body.note === undefined) {
    const denied = await guardApi(request, "products.view"); if (denied) return denied;
    const { data: cur } = await admin.from("free_text_names").select("use_count").eq("id", id).maybeSingle();
    const n = Number((cur as { use_count?: number } | null)?.use_count ?? 0) + 1;
    await admin.from("free_text_names").update({ use_count: n }).eq("id", id);
    return NextResponse.json({ ok: true, error: null });
  }

  const denied = await guardApi(request, "products.edit"); if (denied) return denied;   // แก้ชื่อ = กระทบคนอื่นด้วย
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const nm = body.name.trim();
    if (!nm) return NextResponse.json({ error: "ต้องใส่ชื่อ" }, { status: 400 });
    patch.name = nm;
  }
  if (body.note !== undefined) patch.note = body.note.trim() || null;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { error } = await admin.from("free_text_names").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "free_text_names", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch,
  }).catch(() => { /* ignore */ });

  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // ลบแบบซ่อน (is_active=false) — คำขอเก่าที่เคยใช้ชื่อนี้ยังอ่านได้เหมือนเดิม
  const { error } = await admin.from("free_text_names").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "delete", entityType: "free_text_names", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {},
  }).catch(() => { /* ignore */ });

  return NextResponse.json({ ok: true, error: null });
}
