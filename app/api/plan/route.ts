/**
 * /api/plan — แผนงานส่วนตัว (มุมมอง "แผนงาน" บน /dashboard)
 *
 * ข้อมูลส่วนตัวล้วน: ใช้ token ของผู้ใช้ตรง ๆ (supabaseFromRequest) ให้ RLS ของ erp_plan_items
 * กรองให้เอง — ไม่ใช้ service-role ที่ bypass RLS และไม่ต้องมีสิทธิ์พิเศษของโมดูลไหน
 *
 *  GET    ?include_archived=1        → แผนของฉัน
 *  POST   { items: PlanDraft[] }     → ปักงานเข้าแผน (งานต้นทางซ้ำจะถูกข้าม)
 *  PATCH  { id, patch } | { moves }  → แก้ใบเดียว / ย้าย-เรียงหลายใบหลังลากวาง
 *  DELETE ?id=                       → เอาออกจากแผน
 *
 * ไม่บันทึก audit log: แผนส่วนตัวไม่ใช่ข้อมูลบริษัท (ไม่มีใครอื่นเห็น/แก้ได้) ตาม docs/audit-log.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { PLAN_BUCKETS, planDateFor, type PlanBucket, type PlanDraft, type PlanItem } from "@/lib/planner";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, user_id, bucket, plan_date, sort_order, title, note, source_type, source_id, link, module, due_at, done_at, archived_at, created_at, updated_at";
const BUCKETS = new Set<string>(PLAN_BUCKETS.map((b) => b.key));
const SOURCES = new Set(["manual", "notification", "task", "subtask", "calendar"]);

async function whoami(request: NextRequest): Promise<{ client: SupabaseClient; uid: string | null }> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  return { client, uid: user?.id ?? null };
}

const unauthorized = () => NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบก่อนใช้แผนงาน" }, { status: 401 });

// ---- GET ----
export async function GET(request: NextRequest) {
  const { client, uid } = await whoami(request);
  if (!uid) return unauthorized();

  const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
  let q = client.from("erp_plan_items").select(COLS).eq("user_id", uid);
  if (!includeArchived) q = q.is("archived_at", null);

  const { data, error } = await q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as unknown as PlanItem[], error: null });
}

// ---- POST — ปักงานเข้าแผน ----
export async function POST(request: NextRequest) {
  const { client, uid } = await whoami(request);
  if (!uid) return unauthorized();

  let body: { items?: PlanDraft[] };
  try { body = await request.json(); } catch { return NextResponse.json({ data: [], error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const drafts = (body.items ?? []).filter((d) => d && typeof d.title === "string" && d.title.trim());
  if (!drafts.length) return NextResponse.json({ data: [], error: "ต้องมีอย่างน้อย 1 งาน" }, { status: 400 });
  if (drafts.length > 100) return NextResponse.json({ data: [], error: "ใส่ได้ครั้งละไม่เกิน 100 งาน" }, { status: 400 });

  // งานต้นทางที่วางแผนไว้แล้ว → ข้าม (กันลากซ้ำ ตรงกับ unique index ในตาราง)
  const keys = drafts.map((d) => (d.source_id ? `${d.source_type ?? "manual"}:${d.source_id}` : "")).filter(Boolean);
  const existing = new Set<string>();
  if (keys.length) {
    const { data: dup } = await client.from("erp_plan_items")
      .select("source_type, source_id").eq("user_id", uid)
      .in("source_id", drafts.map((d) => d.source_id).filter(Boolean) as string[]);
    for (const r of ((dup ?? []) as { source_type: string; source_id: string }[])) existing.add(`${r.source_type}:${r.source_id}`);
  }

  // งานใหม่ไปต่อท้ายช่องที่เลือก
  const { data: tail } = await client.from("erp_plan_items")
    .select("bucket, sort_order").eq("user_id", uid).is("archived_at", null);
  const nextOrder = new Map<string, number>();
  for (const r of ((tail ?? []) as { bucket: string; sort_order: number }[])) {
    nextOrder.set(r.bucket, Math.max(nextOrder.get(r.bucket) ?? 0, r.sort_order + 1));
  }

  const rows = drafts
    .filter((d) => !(d.source_id && existing.has(`${d.source_type ?? "manual"}:${d.source_id}`)))
    .map((d) => {
      const bucket = (BUCKETS.has(d.bucket ?? "") ? d.bucket : "today") as PlanBucket;
      const order  = nextOrder.get(bucket) ?? 0;
      nextOrder.set(bucket, order + 1);
      return {
        user_id: uid,
        bucket,
        plan_date: planDateFor(bucket),
        sort_order: order,
        title: d.title.trim().slice(0, 300),
        note: d.note?.trim() || null,
        source_type: SOURCES.has(d.source_type ?? "") ? d.source_type : "manual",
        source_id: d.source_id || null,
        link: d.link || null,
        module: d.module || null,
        due_at: d.due_at || null,
      };
    });
  if (!rows.length) return NextResponse.json({ data: [], error: null });   // มีในแผนอยู่แล้วทั้งหมด

  const { data, error } = await client.from("erp_plan_items").insert(rows).select(COLS);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as unknown as PlanItem[], error: null });
}

// ---- PATCH — แก้ใบเดียว / ย้าย-เรียงหลายใบ ----
export async function PATCH(request: NextRequest) {
  const { client, uid } = await whoami(request);
  if (!uid) return unauthorized();

  let body: { id?: string; patch?: Record<string, unknown>; moves?: { id: string; bucket: PlanBucket; sort_order: number }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ data: [], error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const now = new Date().toISOString();

  // ย้าย/เรียงหลายใบ (หลังลากวาง)
  if (Array.isArray(body.moves)) {
    const moves = body.moves.filter((m) => m?.id && BUCKETS.has(m.bucket));
    if (!moves.length) return NextResponse.json({ data: [], error: null });
    const results = await Promise.all(moves.map((m) =>
      client.from("erp_plan_items")
        .update({ bucket: m.bucket, plan_date: planDateFor(m.bucket), sort_order: m.sort_order, updated_at: now })
        .eq("id", m.id).eq("user_id", uid).select(COLS).maybeSingle()));
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ data: [], error: failed.error.message }, { status: 500 });
    return NextResponse.json({ data: results.map((r) => r.data).filter(Boolean) as unknown as PlanItem[], error: null });
  }

  if (!body.id || !body.patch) return NextResponse.json({ data: [], error: "ต้องมี id + patch" }, { status: 400 });

  const p = body.patch;
  const patch: Record<string, unknown> = { updated_at: now };
  if (typeof p.title === "string" && p.title.trim()) patch.title = p.title.trim().slice(0, 300);
  if ("note" in p)        patch.note        = typeof p.note === "string" && p.note.trim() ? p.note.trim() : null;
  if ("done_at" in p)     patch.done_at     = p.done_at ? String(p.done_at) : null;
  if ("due_at" in p)      patch.due_at      = p.due_at ? String(p.due_at) : null;
  if ("archived_at" in p) patch.archived_at = p.archived_at ? String(p.archived_at) : null;
  if (typeof p.sort_order === "number") patch.sort_order = p.sort_order;
  if (typeof p.bucket === "string" && BUCKETS.has(p.bucket)) {
    patch.bucket = p.bucket;
    patch.plan_date = planDateFor(p.bucket as PlanBucket);
  }

  const { data, error } = await client.from("erp_plan_items")
    .update(patch).eq("id", body.id).eq("user_id", uid).select(COLS).maybeSingle();
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ data: [], error: "ไม่พบงานนี้ในแผนของคุณ" }, { status: 404 });
  return NextResponse.json({ data: [data] as unknown as PlanItem[], error: null });
}

// ---- DELETE ----
export async function DELETE(request: NextRequest) {
  const { client, uid } = await whoami(request);
  if (!uid) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ data: [], error: "ต้องระบุ id" }, { status: 400 });

  const { error } = await client.from("erp_plan_items").delete().eq("id", id).eq("user_id", uid);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: [], error: null });
}
