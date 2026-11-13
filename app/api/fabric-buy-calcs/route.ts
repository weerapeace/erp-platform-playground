/**
 * บันทึกผล "คิดผ้าก่อนซื้อ" (/fabric-calc · เฟส 2) — ตาราง fabric_buy_calcs
 *   GET              รายการล่าสุด 200 ชุด (ไม่ส่ง payload — เบา)
 *   GET ?id=         ชุดเดียว พร้อม payload (เปิดกลับมาคำนวณ / ลิงก์แชร์ /fabric-calc?calc=<id>)
 *   POST             สร้าง { name, mode, payload, summary }
 *   PATCH ?id=       แก้ (บันทึกทับ) { name?, payload?, summary? }
 *   DELETE ?id=      ลบแบบนุ่ม (is_active = false)
 * ของกลาง: guardApi(products.view — คนที่เปิดหน้าคำนวณผ้าได้) · supabaseAdmin · requestActor · writeAudit (+auditChangeMeta)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit, auditChangeMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "products.view";
const ENTITY = "fabric_buy_calc";
const LIST_COLS = "id, name, mode, summary, created_by_name, updated_by_name, created_at, updated_at";
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_PAYLOAD = 400_000;   // ~400KB กันก้อนใหญ่ผิดปกติ (ชุดจริง ~5-30KB)

export type FabricBuyCalcRow = {
  id: string; name: string; mode: "single" | "family";
  summary: { need?: number; to_buy?: number; cost_buy?: number | null; unit?: string; fabrics?: number; qty?: number } | null;
  created_by_name: string | null; updated_by_name: string | null; created_at: string; updated_at: string;
  payload?: Record<string, unknown>;
};

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const cleanName = (v: unknown) => String(v ?? "").trim().slice(0, 120);
const cleanMode = (v: unknown) => (v === "family" ? "family" : "single");
const okPayload = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= MAX_PAYLOAD;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  const admin = supabaseAdmin();
  if (id) {
    if (!UUID.test(id)) return bad("รหัสไม่ถูกต้อง");
    const { data, error } = await admin.from("fabric_buy_calcs").select(`${LIST_COLS}, payload`).eq("id", id).eq("is_active", true).maybeSingle();
    if (error) return bad("โหลดไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
    if (!data) return bad("ไม่พบการคำนวณนี้ (อาจถูกลบแล้ว)", 404);
    return NextResponse.json({ data, error: null });
  }
  const { data, error } = await admin.from("fabric_buy_calcs").select(LIST_COLS).eq("is_active", true).order("updated_at", { ascending: false }).limit(200);
  if (error) return bad("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = cleanName(body?.name);
  if (!name) return bad("ตั้งชื่อก่อนบันทึก");
  if (!okPayload(body?.payload)) return bad("ข้อมูลการคำนวณไม่ถูกต้อง");
  const actor = await requestActor(supabaseFromRequest(request));
  const admin = supabaseAdmin();
  const row = { name, mode: cleanMode(body?.mode), payload: body!.payload, summary: body?.summary ?? null, created_by: actor.id, created_by_name: actor.name, updated_by_name: actor.name };
  const { data, error } = await admin.from("fabric_buy_calcs").insert(row).select(LIST_COLS).single();
  if (error || !data) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "create", entityType: ENTITY, entityId: (data as { id: string }).id, actorId: actor.id, actorName: actor.name, metadata: { name, mode: row.mode, summary: row.summary } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("รหัสไม่ถูกต้อง");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined) { const n = cleanName(body.name); if (!n) return bad("ชื่อห้ามว่าง"); patch.name = n; }
  if (body?.payload !== undefined) { if (!okPayload(body.payload)) return bad("ข้อมูลการคำนวณไม่ถูกต้อง"); patch.payload = body.payload; }
  if (body?.summary !== undefined) patch.summary = body.summary;
  if (body?.mode !== undefined) patch.mode = cleanMode(body.mode);
  if (Object.keys(patch).length === 0) return bad("ไม่มีอะไรให้บันทึก");
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("fabric_buy_calcs").select("name, mode, payload, summary").eq("id", id).eq("is_active", true).maybeSingle();
  if (!before) return bad("ไม่พบการคำนวณนี้ (อาจถูกลบแล้ว)", 404);
  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("fabric_buy_calcs").update({ ...patch, updated_by_name: actor.name, updated_at: new Date().toISOString() }).eq("id", id).select(LIST_COLS).single();
  if (error || !data) return bad("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "update", entityType: ENTITY, entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { name: (patch.name as string) ?? (before as { name: string }).name, ...auditChangeMeta(before as Record<string, unknown>, patch, { opaque: ["payload", "summary"] }) } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("รหัสไม่ถูกต้อง");
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("fabric_buy_calcs").select("name").eq("id", id).eq("is_active", true).maybeSingle();
  if (!before) return bad("ไม่พบการคำนวณนี้ (อาจถูกลบแล้ว)", 404);
  const actor = await requestActor(supabaseFromRequest(request));
  const { error } = await admin.from("fabric_buy_calcs").update({ is_active: false, updated_by_name: actor.name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return bad("ลบไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "delete", entityType: ENTITY, entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: (before as { name: string }).name } });
  return NextResponse.json({ data: { id }, error: null });
}
