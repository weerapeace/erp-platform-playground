/**
 * ไอเดียงานออกแบบ (หน้า "ไอเดีย" ใน Design Dashboard)
 *
 * GET  /api/design-ideas            → ไอเดียทั้งหมดที่ยังไม่เริ่มงานจริง (รอคัดจากไลน์ · เปิด · พักไว้ · เก็บแล้ว) ใหม่สุดก่อน · ≤500
 * GET  /api/design-ideas?setup=1    → แถบตั้งกลุ่มไลน์ "ส่งไอเดีย" (แอดมิน · ของกลาง loadLineGroupSetup)
 * POST /api/design-ideas            → จดไอเดียใหม่ { name, brand_id?, points?, links?, image_keys? }
 * เริ่มทำงานจริง = POST /api/design-sheets { idea_id } (ออกเลข DS + ย้ายรูป) · แก้/พัก/เก็บ = PATCH /api/design-ideas/[id]
 *
 * ของกลาง: guardApi (products.view / products.edit) · writeAudit · ตัวทำความสะอาด lib/design-ideas
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { cleanIdeaImageKeys, cleanIdeaLinks, cleanIdeaName, cleanIdeaPoints, type DesignIdea } from "@/lib/design-ideas";
import { IDEA_SELECT, IDEA_TABLE, toDesignIdea } from "@/lib/design-ideas-server";
import { loadLineGroupSetup } from "@/lib/line-intake";
import { DESIGN_IDEA_SLOT } from "@/lib/design-idea-line";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = supabaseAdmin();
  if (new URL(request.url).searchParams.has("setup")) {
    const deniedAdmin = await guardApi(request, "admin.users"); if (deniedAdmin) return deniedAdmin;
    return NextResponse.json({ ...(await loadLineGroupSetup(admin, DESIGN_IDEA_SLOT, "any")), error: null });
  }
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await admin.from(IDEA_TABLE).select(IDEA_SELECT)
    .in("status", ["inbox", "open", "paused", "archived", "promoting"])
    .order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ data: [], error: "โหลดไอเดียไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const items: DesignIdea[] = ((data ?? []) as Record<string, unknown>[]).map(toDesignIdea);
  return NextResponse.json({ data: items, error: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = cleanIdeaName(body.name);
  if (!name) return NextResponse.json({ error: "ใส่ชื่อไอเดียก่อน" }, { status: 400 });
  const brandId = String(body.brand_id ?? "").trim();
  if (brandId && !UUID.test(brandId)) return NextResponse.json({ error: "แบรนด์ไม่ถูกต้อง" }, { status: 400 });

  const actor = await requestActor(supabaseFromRequest(request));
  const admin = supabaseAdmin();
  const row = {
    name, brand_id: brandId || null,
    points: cleanIdeaPoints(body.points), links: cleanIdeaLinks(body.links), image_keys: cleanIdeaImageKeys(body.image_keys),
    status: "open", source: "manual", created_by: actor.id, created_by_name: actor.name,
  };
  const { data, error } = await admin.from(IDEA_TABLE).insert(row).select(IDEA_SELECT).single();
  if (error || !data) return NextResponse.json({ error: "บันทึกไอเดียไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 400 });
  const idea = toDesignIdea(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "create", entityType: "design_idea", entityId: idea.id, actorId: actor.id, actorName: actor.name,
    metadata: { name, brand_id: row.brand_id, points: row.points.length, links: row.links.length, images: row.image_keys.length },
  });
  return NextResponse.json({ data: idea, error: null });
}
