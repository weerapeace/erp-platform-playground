/**
 * POST /api/design-ideas/[id]/merge { into } → รวมไอเดีย (ส่วนใหญ่ = ชุดรอคัดจากไลน์) เข้าไอเดียที่มีอยู่
 *   รูป/ลิงก์/ข้อ ๆ ต่อท้ายปลายทาง (ตัดซ้ำ · ตามเพดาน) · ต้นทาง = merged (merged_into) — ไม่ลบทิ้ง
 *   ปลายทางต้องเปิด/พักไว้ · ต้นทางต้องรอคัด/เปิด/พักไว้
 * ของกลาง: guardApi (products.edit) · writeAudit ทั้งสองฝั่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { cleanIdeaImageKeys, cleanIdeaLinks, cleanIdeaPoints, IDEA_MERGE_TARGET } from "@/lib/design-ideas";
import { IDEA_SELECT, IDEA_TABLE, toDesignIdea } from "@/lib/design-ideas-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const SOURCE_OK = ["inbox", "open", "paused"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const into = String(body.into ?? "").trim();
  if (!UUID.test(id) || !UUID.test(into)) return NextResponse.json({ error: "ไม่พบไอเดีย" }, { status: 404 });
  if (id === into) return NextResponse.json({ error: "เลือกไอเดียอื่นเป็นปลายทาง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows } = await admin.from(IDEA_TABLE).select("id, name, status, points, links, image_keys").in("id", [id, into]);
  const src = (rows ?? []).find((r) => (r as { id: string }).id === id) as Record<string, unknown> | undefined;
  const dst = (rows ?? []).find((r) => (r as { id: string }).id === into) as Record<string, unknown> | undefined;
  if (!src || !dst) return NextResponse.json({ error: "ไม่พบไอเดีย" }, { status: 404 });
  if (!SOURCE_OK.includes(String(src.status))) return NextResponse.json({ error: "ไอเดียนี้ถูกคัด/รวมไปแล้ว — ลองโหลดใหม่" }, { status: 409 });
  if (!(IDEA_MERGE_TARGET as readonly string[]).includes(String(dst.status))) return NextResponse.json({ error: "รวมได้เฉพาะไอเดียที่เปิดหรือพักไว้" }, { status: 409 });

  const actor = await requestActor(supabaseFromRequest(request));
  const now = new Date().toISOString();
  // จองต้นทางก่อน (กันกดรวมซ้ำ/สองคนพร้อมกัน)
  const { data: claimed } = await admin.from(IDEA_TABLE).update({ status: "merged", merged_into: into, merged_at: now, merged_by: actor.name, updated_at: now })
    .eq("id", id).in("status", SOURCE_OK).select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ error: "ไอเดียนี้ถูกคัด/รวมไปแล้ว — ลองโหลดใหม่" }, { status: 409 });

  const before = { points: cleanIdeaPoints(dst.points), links: cleanIdeaLinks(dst.links), image_keys: cleanIdeaImageKeys(dst.image_keys) };
  const next = {
    points: cleanIdeaPoints([...before.points, ...cleanIdeaPoints(src.points).filter((p) => !before.points.includes(p))]),
    links: cleanIdeaLinks([...before.links, ...cleanIdeaLinks(src.links)]),
    image_keys: cleanIdeaImageKeys([...before.image_keys, ...cleanIdeaImageKeys(src.image_keys)]),
  };
  const { data, error } = await admin.from(IDEA_TABLE).update({ ...next, updated_at: now }).eq("id", into).in("status", IDEA_MERGE_TARGET as unknown as string[]).select(IDEA_SELECT).maybeSingle();
  if (error || !data) {
    await admin.from(IDEA_TABLE).update({ status: String(src.status), merged_into: null, merged_at: null, merged_by: null, updated_at: now }).eq("id", id);
    return NextResponse.json({ error: "รวมไม่สำเร็จ ลองโหลดใหม่อีกครั้ง" }, { status: 409 });
  }
  const added = { images: next.image_keys.length - before.image_keys.length, links: next.links.length - before.links.length, points: next.points.length - before.points.length };
  await writeAudit(admin, { action: "merge", entityType: "design_idea", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { name: src.name, into, into_name: dst.name, changes: [{ field: "status", old: src.status, new: "merged" }] } });
  await writeAudit(admin, { action: "merge_in", entityType: "design_idea", entityId: into, actorId: actor.id, actorName: actor.name,
    metadata: { name: dst.name, from: id, from_name: src.name, added } });
  return NextResponse.json({ data: toDesignIdea(data as Record<string, unknown>), added, error: null });
}
