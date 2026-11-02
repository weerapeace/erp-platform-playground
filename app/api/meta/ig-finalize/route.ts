/**
 * ตามเช็กสถานะวิดีโอ Instagram (Reels) แล้วเผยแพร่เมื่อพร้อม — /api/meta/ig-finalize
 * POST { content_id, creation_id }
 *  - IN_PROGRESS → { processing:true }   (client เรียกซ้ำเรื่อย ๆ จนพร้อม)
 *  - FINISHED    → เผยแพร่ (media_publish) → บันทึกสถานะ posted → { url }
 *  - ERROR       → { error }
 * แยกจาก publish เพราะ IG ประมวลผลวิดีโอนาน (คำขอเดียวรอไม่ได้) · ตัวจริงอยู่ที่ lib/social-publish/meta (คิวใช้ตัวเดียวกัน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { finalizeIgReel } from "@/lib/social-publish/meta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; creation_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  const creationId = (body.creation_id ?? "").trim();
  if (!contentId || !creationId) return NextResponse.json({ error: "ต้องมี content_id + creation_id" }, { status: 400 });

  const res = await finalizeIgReel(supabaseAdmin(), { contentId, creationId, actor: { id: user?.id ?? null, name: user?.email ?? null }, via: "manual" });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  if (res.state === "processing") return NextResponse.json({ ok: true, processing: true, error: null });
  return NextResponse.json({ ok: true, url: res.url, error: null });
}
