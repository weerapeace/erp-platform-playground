/**
 * PATCH /api/design-ideas/[id] → แก้ไอเดีย { name?, brand_id?, points?, links?, image_keys?, status? }
 *   status: open (เอากลับมา/กู้คืน) · paused (พักไว้) · archived (เก็บ — กู้คืนได้ ไม่มีการลบทิ้งจริง)
 *   รอคัดจากไลน์ (inbox) → status open = "เพิ่มเป็นไอเดีย" · archived = "ไม่เอา"
 *   ไอเดียที่เริ่มทำงานจริงแล้ว / รวมไปแล้ว (promoting/promoted/merged) แก้ไม่ได้
 * ของกลาง: guardApi (products.edit) · writeAudit + auditDiff (จากอะไรเป็นอะไร)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { cleanIdeaImageKeys, cleanIdeaLinks, cleanIdeaName, cleanIdeaPoints, IDEA_EDITABLE, IDEA_SETTABLE } from "@/lib/design-ideas";
import { IDEA_SELECT, IDEA_TABLE, toDesignIdea } from "@/lib/design-ideas-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ไม่พบไอเดีย" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from(IDEA_TABLE).select("id, name, brand_id, points, links, image_keys, status").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบไอเดีย" }, { status: 404 });
  const before = cur as Record<string, unknown>;
  if (!(IDEA_EDITABLE as readonly unknown[]).includes(before.status)) return NextResponse.json({ error: "ไอเดียนี้เริ่มทำงานจริงหรือถูกรวมไปแล้ว แก้ไม่ได้" }, { status: 409 });

  const actor = await requestActor(supabaseFromRequest(request));
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = cleanIdeaName(body.name);
    if (!name) return NextResponse.json({ error: "ใส่ชื่อไอเดียก่อน" }, { status: 400 });
    patch.name = name;
  }
  if ("brand_id" in body) {
    const b = String(body.brand_id ?? "").trim();
    if (b && !UUID.test(b)) return NextResponse.json({ error: "แบรนด์ไม่ถูกต้อง" }, { status: 400 });
    patch.brand_id = b || null;
  }
  if ("points" in body) patch.points = cleanIdeaPoints(body.points);
  if ("links" in body) patch.links = cleanIdeaLinks(body.links);
  if ("image_keys" in body) patch.image_keys = cleanIdeaImageKeys(body.image_keys);
  if ("status" in body) {
    const s = String(body.status ?? "");
    if (!(IDEA_SETTABLE as readonly string[]).includes(s)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    patch.status = s;
    if (s === "archived" && before.status !== "archived") { patch.archived_at = new Date().toISOString(); patch.archived_by = actor.name; }
    if (s !== "archived") { patch.archived_at = null; patch.archived_by = null; }
  }
  const changes = auditDiff(before, Object.fromEntries(Object.entries(patch).filter(([k]) => !k.startsWith("archived_"))));
  if (!changes.length) {
    const { data } = await admin.from(IDEA_TABLE).select(IDEA_SELECT).eq("id", id).single();
    return NextResponse.json({ data: data ? toDesignIdea(data as Record<string, unknown>) : null, error: null });
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await admin.from(IDEA_TABLE).update(patch).eq("id", id).in("status", IDEA_EDITABLE as unknown as string[]).select(IDEA_SELECT).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ ลองโหลดใหม่อีกครั้ง" }, { status: 409 });
  const action = "status" in patch
    ? (patch.status === "archived" ? (before.status === "inbox" ? "reject" : "archive") : before.status === "inbox" ? "accept" : before.status === "archived" ? "restore" : patch.status === "paused" ? "pause" : "update")
    : "update";
  await writeAudit(admin, { action, entityType: "design_idea", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: patch.name ?? before.name, changes } });
  return NextResponse.json({ data: toDesignIdea(data as Record<string, unknown>), error: null });
}
