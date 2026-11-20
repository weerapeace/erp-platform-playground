/**
 * /api/ai/caption-presets — 📝 คำสั่งประจำของ AI เขียนแคปชั่น (ใช้ร่วมทั้งทีม)
 * GET  ?brand_id=<uuid?>  → { data: { items: (Preset & {scope})[], defaultId }, can_manage }
 * POST { action: "save", preset: { id?, name, text, is_default? }, scope: "brand"|"all", brand_id? }   (id ว่าง = สร้างใหม่)
 * POST { action: "remove" | "default" | "undefault", id, scope, brand_id? }
 *   ใช้/เพิ่มได้ทุกคนที่ใช้ AI แคปชั่นได้ · แก้/ลบ ของคนอื่น = ผู้ดูแล (admin.paid_services) หรือ tasks.approve
 * ที่เก็บ = ui_config CAPTION_PRESETS_KEY (ไม่มีตารางใหม่) · ทุกการเปลี่ยนเขียน audit (changes: ก่อน/หลัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { featureAccess } from "@/lib/paid-services-server";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { ALL_SCOPE, CAPTION_PRESETS_KEY, normalizePresets, presetsFor, removePreset, setDefaultPreset, upsertPreset, type CaptionPreset, type PresetStore } from "@/lib/caption-presets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noAccess = () => NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI เขียนแคปชั่น — ขอสิทธิ์จากผู้ดูแล" }, { status: 401 });
const canUse = async (request: NextRequest) => featureAccess("ai.caption", { request }, await apiCan(request, "ai.caption"));
const canManage = async (request: NextRequest) => (await apiCan(request, "admin.paid_services")) || (await apiCan(request, "tasks.approve"));

async function loadStore(): Promise<PresetStore> {
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", CAPTION_PRESETS_KEY).maybeSingle();
  return normalizePresets((data as { value?: unknown } | null)?.value ?? null);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  const brandId = new URL(request.url).searchParams.get("brand_id");
  const data = presetsFor(await loadStore(), brandId && UUID_RE.test(brandId) ? brandId : null);
  return NextResponse.json({ data, can_manage: await canManage(request), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await canUse(request))) return noAccess();
  let body: { action?: string; id?: string; preset?: { id?: string; name?: string; text?: string; is_default?: boolean }; scope?: string; brand_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = body.brand_id && UUID_RE.test(body.brand_id) ? body.brand_id.toLowerCase() : null;
  const scope = body.scope === "all" || !brandId ? ALL_SCOPE : brandId;
  const actor = await requestActor(supabaseFromRequest(request));
  const before = await loadStore();
  const cur = (id: string): CaptionPreset | null => (before[scope] ?? []).find((x) => x.id === id) ?? null;
  const mayEdit = async (p: CaptionPreset | null) => !p || (!!actor.id && p.by === actor.id) || (await canManage(request));

  let next = before;
  let old: CaptionPreset | null = null;
  if (body.action === "save") {
    const id = String(body.preset?.id ?? "").trim() || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const name = String(body.preset?.name ?? "").trim(), text = String(body.preset?.text ?? "").trim();
    if (!name || !text) return NextResponse.json({ error: "ใส่ชื่อและข้อความคำสั่งก่อน" }, { status: 400 });
    old = cur(id);
    if (!(await mayEdit(old))) return NextResponse.json({ error: "แก้คำสั่งประจำของคนอื่นได้เฉพาะผู้ดูแล" }, { status: 403 });
    next = upsertPreset(before, scope, { id, name, text, isDefault: body.preset?.is_default }, { by: actor.id, by_name: actor.name, at: new Date().toISOString() });
  } else if (body.action === "remove") {
    old = cur(String(body.id ?? ""));
    if (!old) return NextResponse.json({ data: presetsFor(before, brandId), error: null });
    if (!(await mayEdit(old))) return NextResponse.json({ error: "ลบคำสั่งประจำของคนอื่นได้เฉพาะผู้ดูแล" }, { status: 403 });
    next = removePreset(before, scope, old.id).store;
  } else if (body.action === "default" || body.action === "undefault") {
    old = cur(String(body.id ?? ""));
    if (!old) return NextResponse.json({ error: "ไม่พบคำสั่งนี้" }, { status: 404 });
    next = setDefaultPreset(before, scope, old.id, body.action === "default");
  } else {
    return NextResponse.json({ error: "action ต้องเป็น save / remove / default / undefault" }, { status: 400 });
  }

  if (JSON.stringify(next) !== JSON.stringify(before)) {
    const admin = supabaseAdmin();
    const { error } = await admin.from("ui_config").upsert({ key: CAPTION_PRESETS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: "บันทึกคำสั่งประจำไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    const after = (next[scope] ?? []).find((x) => x.id === (old?.id ?? body.preset?.id)) ?? (next[scope] ?? []).slice(-1)[0] ?? null;
    await writeAudit(admin, {
      action: body.action === "remove" ? "delete" : old ? "update" : "create", entityType: "caption_prompt_preset", entityId: brandId, actorId: actor.id, actorName: actor.name,
      metadata: { op: body.action, scope: scope === ALL_SCOPE ? "all" : "brand", name: after?.name ?? old?.name ?? null,
        changes: { name: { old: old?.name ?? null, new: body.action === "remove" ? null : after?.name ?? null }, text: { old: old?.text ?? null, new: body.action === "remove" ? null : after?.text ?? null }, is_default: { old: old?.is_default ?? false, new: body.action === "remove" ? false : after?.is_default ?? false } } },
    });
  }
  return NextResponse.json({ data: presetsFor(next, brandId), error: null });
}
