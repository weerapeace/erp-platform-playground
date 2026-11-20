/**
 * รวมหน่วยนับที่ซ้ำ (หลา = Yard) — ดู docs/uom-bilingual.md
 *   GET  → หน่วยทั้งหมด + จำนวนที่ใช้ + ประวัติการรวมล่าสุด (ไว้กดย้อนกลับ)
 *   POST { primary_id, secondary_id }  → รวม (ย้าย SKU/ประเภทแท็กที่ใช้ตัวรอง → ตัวหลัก · ตัวรองเข้าถังขยะ)
 *   POST { undo: merge_id }            → ย้อนการรวม
 * งานจริงทำในฟังก์ชันฐานข้อมูล uom_merge / uom_merge_undo (ทำทีเดียวจบ ไม่ค้างครึ่งทาง) · ลง audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { uomLabel } from "@/lib/uom-names";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [u, c, m] = await Promise.all([
    admin.from("uoms").select("id, name, name_th, name_en, aliases, display_name, active, merged_into").order("name"),
    admin.rpc("uom_usage_counts"),
    admin.from("uom_merges").select("id, primary_id, secondary_id, moved, actor_name, created_at, undone_at").order("created_at", { ascending: false }).limit(20),
  ]);
  if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
  const counts = new Map<string, { skus: number; purchase_skus: number; families: number }>();
  for (const r of (c.data ?? []) as { uom_id: string; skus: number; purchase_skus: number; families: number }[])
    counts.set(r.uom_id, { skus: Number(r.skus) || 0, purchase_skus: Number(r.purchase_skus) || 0, families: Number(r.families) || 0 });
  const data = (u.data ?? []).map((r) => {
    const k = counts.get(r.id as string) ?? { skus: 0, purchase_skus: 0, families: 0 };
    return { ...r, ...k, usage: k.skus + k.purchase_skus + k.families };
  });
  return NextResponse.json({ data, merges: m.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const admin = supabaseAdmin();
  const body = await request.json().catch(() => ({})) as { primary_id?: string; secondary_id?: string; undo?: string };
  let actorId: string | null = null, actorName: string | null = null;
  try { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); actorId = user?.id ?? null; actorName = user?.email ?? null; } catch { /* ไม่มีตัวตน */ }

  if (body.undo) {
    if (!UUID.test(body.undo)) return NextResponse.json({ error: "รหัสประวัติไม่ถูกต้อง" }, { status: 400 });
    const { data: log } = await admin.from("uom_merges").select("primary_id, secondary_id").eq("id", body.undo).maybeSingle();
    const { error } = await admin.rpc("uom_merge_undo", { p_merge_id: body.undo, p_actor_name: actorName });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "uom_merge_undo", entityType: "uoms", entityId: (log?.secondary_id as string) ?? null, actorId, actorName,
      metadata: { merge_id: body.undo, primary_id: log?.primary_id, changes: [{ field: "active", old: false, new: true, label: "กู้หน่วยกลับจากการรวม" }] } });
    return NextResponse.json({ ok: true });
  }

  const p = body.primary_id ?? "", s = body.secondary_id ?? "";
  if (!UUID.test(p) || !UUID.test(s)) return NextResponse.json({ error: "เลือกหน่วยหลักและหน่วยที่จะรวมก่อน" }, { status: 400 });
  const { data: rows } = await admin.from("uoms").select("id, name, name_th, name_en, display_name").in("id", [p, s]);
  const pri = rows?.find((r) => r.id === p), sec = rows?.find((r) => r.id === s);
  const { data: mergeId, error } = await admin.rpc("uom_merge", { p_primary: p, p_secondary: s, p_actor_id: actorId, p_actor_name: actorName });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: log } = await admin.from("uom_merges").select("moved").eq("id", mergeId as string).maybeSingle();
  const mv = (log?.moved ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(mv[k]) ? (mv[k] as unknown[]).length : 0);
  const moved = { skus: n("skus_v2_uom") + n("skus_v2_purchase_uom"), families: n("families_default") + n("families_prefix") };
  await writeAudit(admin, { action: "uom_merge", entityType: "uoms", entityId: s, actorId, actorName,
    metadata: { merge_id: mergeId, primary_id: p, primary: pri ? uomLabel(pri) : p, secondary: sec?.name, moved,
      changes: [{ field: "merged_into", old: null, new: pri ? `${uomLabel(pri)} (${pri.name})` : p, label: "รวมเข้าหน่วย" }, { field: "active", old: true, new: false, label: "ใช้งาน" }] } });
  return NextResponse.json({ ok: true, merge_id: mergeId, moved });
}
