/**
 * /api/ai/desc-memory — 🧠 ความจำ AI ของ "จุดเด่นสินค้า" (ป๊อปแทรก Description ขั้นจุดเด่น)
 *
 * GET  ?brand_id=<uuid?>  → { data: { liked, disliked, rules }  (ของแบรนด์นี้ + ทุกแบรนด์ · ติดป้าย scope), can_manage }
 * POST { action: "add" | "remove", list: "liked"|"disliked"|"rules", text, scope: "brand"|"all", brand_id? }
 *   add    = ใครก็ได้ที่ใช้ AI ได้ (ai.caption) · ชอบ ↔ ไม่ชอบ ย้ายฝั่งให้เอง
 *   remove = ของที่ตัวเองเพิ่ม หรือผู้ดูแล (admin.paid_services) — เจ้าของเลือก "ทุกคนกดชอบ/ไม่ชอบได้ · ลบได้เฉพาะผู้ดูแล"
 * ที่เก็บ = ui_config DESC_AI_MEMORY_KEY (ไม่มีตารางใหม่) · ทุกการเปลี่ยนเขียน audit_logs (desc_ai_memory)
 * กติกา pure = lib/desc-ai-memory
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { featureAccess } from "@/lib/paid-services-server";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { addMemory, ALL_SCOPE, cleanText, DESC_AI_MEMORY_KEY, MEMORY_LISTS, memoryFor, normalizeMemory, removeMemory, type MemoryList } from "@/lib/desc-ai-memory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noAccess = () => NextResponse.json({ error: "ผู้ดูแลยังไม่ได้เปิดให้คุณใช้ AI ตัวนี้ (ตั้งที่ศูนย์ AI → ใครใช้ได้) · You don't have access to this AI yet" }, { status: 401 });
/** ความจำนี้เป็นของ AI จุดเด่น — ใครเข้าได้ตามฟีเจอร์ ai.desc_highlights (รายชื่อ "ใครใช้ได้" ก่อน · ไม่ได้ตั้ง = ai.caption) */
const canUse = async (request: NextRequest) => featureAccess("ai.desc_highlights", { request }, await apiCan(request, "ai.caption"));

async function loadStore() {
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", DESC_AI_MEMORY_KEY).maybeSingle();
  return normalizeMemory((data as { value?: unknown } | null)?.value ?? null);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  const brandId = new URL(request.url).searchParams.get("brand_id");
  const store = await loadStore();
  const data = memoryFor(store, brandId && UUID_RE.test(brandId) ? brandId : null);
  return NextResponse.json({ data, can_manage: await apiCan(request, "admin.paid_services"), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  let body: { action?: string; list?: string; text?: string; scope?: string; brand_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const list = String(body.list ?? "") as MemoryList;
  if (!MEMORY_LISTS.includes(list)) return NextResponse.json({ error: "ไม่รู้จักรายการนี้" }, { status: 400 });
  const text = cleanText(body.text);
  if (!text) return NextResponse.json({ error: "พิมพ์ข้อความก่อน" }, { status: 400 });
  const brandId = body.brand_id && UUID_RE.test(body.brand_id) ? body.brand_id.toLowerCase() : null;
  const scope = body.scope === "all" || !brandId ? ALL_SCOPE : brandId;

  const actor = await requestActor(supabaseFromRequest(request));
  const before = await loadStore();
  let next = before;
  if (body.action === "add") {
    next = addMemory(before, scope, list, { text, by: actor.id, by_name: actor.name, at: new Date().toISOString() });
  } else if (body.action === "remove") {
    const r = removeMemory(before, scope, list, text);
    if (!r.removed) return NextResponse.json({ data: memoryFor(before, brandId), error: null });
    const mine = !!actor.id && r.removed.by === actor.id;
    if (!mine && !(await apiCan(request, "admin.paid_services")))
      return NextResponse.json({ error: "ลบความจำที่คนอื่นเพิ่มได้เฉพาะผู้ดูแล (สิทธิ์จัดการ AI)" }, { status: 403 });
    next = r.store;
  } else {
    return NextResponse.json({ error: "action ต้องเป็น add หรือ remove" }, { status: 400 });
  }

  if (JSON.stringify(next) !== JSON.stringify(before)) {
    const admin = supabaseAdmin();
    const { error } = await admin.from("ui_config").upsert({ key: DESC_AI_MEMORY_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกความจำไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    await writeAudit(admin, {
      action: "update", entityType: "desc_ai_memory", entityId: brandId, actorId: actor.id, actorName: actor.name,
      metadata: { op: body.action, list, text, scope: scope === ALL_SCOPE ? "all" : "brand" },
    });
  }
  return NextResponse.json({ data: memoryFor(next, brandId), error: null });
}
