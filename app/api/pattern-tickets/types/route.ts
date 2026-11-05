/**
 * /api/pattern-tickets/types — ตั้งค่าประเภทงานตั๋ว Pattern (ผู้จัดการ · pattern.manage)
 *
 * GET                                    → { data: ประเภททั้งหมด (รวมที่ปิดใช้) + ticket_count } (pattern.view)
 * POST   { label_th, label_en?, color?, icon?, checklist?, deliverables? }   → เพิ่มประเภทใหม่ (ต่อท้าย)
 * PATCH  { key, ...ช่องที่จะแก้ }          → แก้ชื่อ/สี/ไอคอน/เช็กลิสต์/ไฟล์ที่ต้องส่ง/เปิด-ปิดใช้
 *        (แบบเดิม { key, icon } ยังใช้ได้ — ปุ่มเปลี่ยนไอคอนบนแผ่น)
 * PATCH  { order: [key, ...] }             → เรียงลำดับใหม่ (ลากในหน้าตั้งค่า)
 * DELETE ?key=                             → ลบ เฉพาะประเภทที่ยังไม่มีตั๋ว · มีตั๋วแล้ว = 409 ให้ "ปิดใช้" แทน (ตั๋วเก่าอ้างอยู่)
 * ทุกการเปลี่ยนเขียน audit_logs (entity_type = pattern_ticket_types) · กติกาค่าดู lib/pattern-tickets
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanDeliverables, cleanTemplateChecklist, cleanTypeIcon, newTypeKey, TYPE_COLOR_CLS } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TABLE, PATTERN_TYPES_TABLE } from "@/lib/pattern-tickets-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown> & { key: string; label_th: string };

const cleanColor = (v: unknown) => (typeof v === "string" && TYPE_COLOR_CLS[v] ? v : null);
const cleanLabel = (v: unknown, max = 80) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function audit(request: NextRequest, action: string, key: string | null, metadata: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const actor = await loadActor(request, admin);
  await writeAudit(admin, { action, entityType: PATTERN_TYPES_TABLE, entityId: null, actorId: actor.userId, actorName: actor.name, metadata: { type: key, ...metadata } });
}

async function ticketCounts(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from(PATTERN_TABLE).select("type_key").limit(20000);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { type_key: string }[]) out[r.type_key] = (out[r.type_key] ?? 0) + 1;
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const [{ data, error }, counts] = await Promise.all([
    supabaseAdmin().from(PATTERN_TYPES_TABLE).select("*").order("sort_order").order("created_at"),
    ticketCounts(),
  ]);
  if (error) return NextResponse.json({ data: [], error: "โหลดประเภทงานไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((t) => ({ ...t, ticket_count: counts[t.key as string] ?? 0 })), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.manage"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const label_th = cleanLabel(body.label_th);
  if (!label_th) return NextResponse.json({ error: "ใส่ชื่อประเภทงาน (ไทย)" }, { status: 400 });
  const key = newTypeKey();
  const icon = cleanTypeIcon(body.icon, key);
  if (!icon) return NextResponse.json({ error: "ไอคอนไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: last } = await admin.from(PATTERN_TYPES_TABLE).select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const row = {
    key, label_th,
    label_en: cleanLabel(body.label_en) || label_th,
    color: cleanColor(body.color) ?? "slate",
    icon,
    checklist: cleanTemplateChecklist(body.checklist),
    deliverables: cleanDeliverables(body.deliverables),
    sort_order: Number(last?.sort_order ?? 0) + 10,
    is_active: true,
  };
  const { data, error } = await admin.from(PATTERN_TYPES_TABLE).insert(row).select("*").single();
  if (error || !data) return NextResponse.json({ error: "เพิ่มประเภทงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await audit(request, "create", key, { label: label_th });
  return NextResponse.json({ data: { ...data, ticket_count: 0 }, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.manage"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();

  // เรียงลำดับใหม่ — เขียน sort_order เฉพาะแถวที่เปลี่ยน
  if (Array.isArray(body.order)) {
    const order = body.order.map((k) => String(k));
    const { data: rows } = await admin.from(PATTERN_TYPES_TABLE).select("key, sort_order");
    const cur = new Map(((rows ?? []) as { key: string; sort_order: number }[]).map((r) => [r.key, r.sort_order]));
    const jobs = order.filter((k) => cur.has(k)).map((k, i) => ({ k, s: (i + 1) * 10 })).filter(({ k, s }) => cur.get(k) !== s);
    for (const j of jobs) {
      const { error } = await admin.from(PATTERN_TYPES_TABLE).update({ sort_order: j.s, updated_at: new Date().toISOString() }).eq("key", j.k);
      if (error) return NextResponse.json({ error: "เรียงลำดับไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    }
    if (jobs.length) await audit(request, "reorder", null, { order });
    return NextResponse.json({ data: { changed: jobs.length }, error: null });
  }

  const key = String(body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ไม่ได้ระบุประเภทงาน" }, { status: 400 });
  const { data: before } = await admin.from(PATTERN_TYPES_TABLE).select("*").eq("key", key).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบประเภทงานนี้" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ("label_th" in body) { const v = cleanLabel(body.label_th); if (!v) return NextResponse.json({ error: "ชื่อประเภทงานห้ามว่าง" }, { status: 400 }); patch.label_th = v; }
  if ("label_en" in body) patch.label_en = cleanLabel(body.label_en) || (patch.label_th as string) || before.label_th;
  if ("color" in body) { const c = cleanColor(body.color); if (!c) return NextResponse.json({ error: "สีไม่ถูกต้อง" }, { status: 400 }); patch.color = c; }
  if ("icon" in body) { const ic = cleanTypeIcon(body.icon, key); if (!ic) return NextResponse.json({ error: "รูปไอคอนไม่ถูกต้อง ลองอัปโหลดใหม่" }, { status: 400 }); patch.icon = ic; }
  if ("checklist" in body) patch.checklist = cleanTemplateChecklist(body.checklist);
  if ("deliverables" in body) patch.deliverables = cleanDeliverables(body.deliverables);
  if ("is_active" in body) patch.is_active = body.is_active === true;

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) if (JSON.stringify((before as Row)[k]) !== JSON.stringify(v)) changes[k] = { from: (before as Row)[k], to: v };
  if (!Object.keys(changes).length) return NextResponse.json({ data: before, error: null });

  const { data, error } = await admin.from(PATTERN_TYPES_TABLE)
    .update({ ...Object.fromEntries(Object.keys(changes).map((k) => [k, patch[k]])), updated_at: new Date().toISOString() })
    .eq("key", key).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await audit(request, "is_active" in changes ? (patch.is_active ? "enable" : "disable") : "update", key, { label: (data as Row).label_th, changes });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.manage"); if (denied) return denied;
  const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  if (!key) return NextResponse.json({ error: "ไม่ได้ระบุประเภทงาน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from(PATTERN_TYPES_TABLE).select("key, label_th").eq("key", key).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบประเภทงานนี้" }, { status: 404 });
  const { count } = await admin.from(PATTERN_TABLE).select("id", { count: "exact", head: true }).eq("type_key", key);
  if ((count ?? 0) > 0) return NextResponse.json({ error: `มีตั๋ว ${count} ใบใช้ประเภทนี้อยู่ ลบไม่ได้ — กด "ปิดใช้" แทน`, ticket_count: count }, { status: 409 });
  const { error } = await admin.from(PATTERN_TYPES_TABLE).delete().eq("key", key);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await audit(request, "delete", key, { label: before.label_th });
  return NextResponse.json({ data: { deleted: key }, error: null });
}
