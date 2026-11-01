/**
 * การ์ดรู้จักแบรนด์ (ข้อมูลแบรนด์ให้ AI) — /api/brand-ai-profile
 * GET               → { profiles: { [brand_id]: { done, total } } }  (ภาพรวมทุกแบรนด์ — หน้าตั้งค่า)
 * GET ?brand_id=    → { profile, highlights[], filled, recent_captions? (ใส่ &captions=1) }
 * PUT { brand_id, profile } → บันทึกการ์ดของแบรนด์นั้น (แทนทั้งใบ)
 * เก็บใน ui_config key "brand_ai_profiles" (ไม่มีตารางใหม่) · อ่าน = tasks.view · แก้ = tasks.approve (เท่ากับแก้ prompt AI) · แก้ลง audit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";
import { BRAND_PROFILE_FIELDS, BRAND_PROFILE_KEY, brandProfileFilled, cleanBrandProfile } from "@/lib/marketing/brand-profile";
import { brandHighlights, loadBrandProfiles, recentBrandCaptions } from "@/lib/marketing/brand-profile-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand_id");
  const admin = supabaseAdmin();
  const all = await loadBrandProfiles(admin);
  if (!isUuid(brandId)) {
    return NextResponse.json({ profiles: Object.fromEntries(Object.entries(all).map(([id, p]) => [id, brandProfileFilled(p)])), error: null });
  }
  const profile = all[brandId] ?? cleanBrandProfile({});
  const [highlights, recent] = await Promise.all([
    brandHighlights(admin, brandId),
    url.searchParams.get("captions") === "1" ? recentBrandCaptions(admin, brandId) : Promise.resolve(undefined),
  ]);
  return NextResponse.json({ profile, highlights, filled: brandProfileFilled(profile), recent_captions: recent, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงแก้การ์ดรู้จักแบรนด์ได้ (tasks.approve)" }, { status: 401 });
  let body: { brand_id?: unknown; profile?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.brand_id)) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const brandId = body.brand_id as string;

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const all = await loadBrandProfiles(admin);
  const before = all[brandId] ?? null;
  const next = { ...cleanBrandProfile(body.profile), updated_at: new Date().toISOString(), updated_by: user?.email ?? null };
  const { error } = await admin.from("ui_config")
    .upsert({ key: BRAND_PROFILE_KEY, value: { ...all, [brandId]: next }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });

  const changed = [
    ...BRAND_PROFILE_FIELDS.filter((f) => (before?.[f.key] ?? "") !== next[f.key]).map((f) => f.key),
    ...(JSON.stringify(before?.examples ?? []) !== JSON.stringify(next.examples) ? ["examples"] : []),
  ];
  await writeAudit(admin, {
    action: "brand_ai_profile.update", entityType: "brands", entityId: brandId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { changed, before, after: next },
  });
  return NextResponse.json({ profile: next, filled: brandProfileFilled(next), error: null });
}
