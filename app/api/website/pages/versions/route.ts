/**
 * ประวัติเวอร์ชันของหน้าเว็บ (ไม่ใช่หน้าแรก) — /api/website/pages/versions
 * GET  ?pageId=<id>            → รายการเวอร์ชันที่เคยเผยแพร่ (ใหม่→เก่า) — ตาราง store_page_versions (บันทึกตอนกดเผยแพร่ ใน PUT /api/website/pages)
 * POST { pageId, versionNo }   → ดึงเวอร์ชันนั้นกลับมาเป็น "ร่าง" (เว็บจริงยังไม่เปลี่ยนจนกว่าจะกดเผยแพร่)
 * แบบเดียวกับหน้าแรก (/api/website/layout/versions) · ใช้ตัวแปลงกลาง lib/website-versions
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { normalizeBlocks } from "@/lib/website-blocks";
import { toWebVersion, VERSION_LIST_LIMIT, type WebVersionRow } from "@/lib/website-versions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;

  const pageId = (new URL(request.url).searchParams.get("pageId") ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "ต้องระบุ pageId" }, { status: 400 });
  const sb = supabaseAdmin();

  const { data: page } = await sb.from("store_pages").select("id").eq("id", pageId).maybeSingle();
  if (!page) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

  const { data, error } = await sb
    .from("store_page_versions")
    .select("version_no, layout, actor, created_at")
    .eq("page_id", pageId)
    .order("version_no", { ascending: false })
    .limit(VERSION_LIST_LIMIT);
  if (error) return NextResponse.json({ error: "โหลดประวัติไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ versions: ((data ?? []) as WebVersionRow[]).map(toWebVersion) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { pageId?: string; versionNo?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.pageId || !body.versionNo) return NextResponse.json({ error: "ต้องระบุ pageId + versionNo" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: v } = await sb
    .from("store_page_versions")
    .select("layout")
    .eq("page_id", body.pageId)
    .eq("version_no", body.versionNo)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });

  const blocks = normalizeBlocks((v as { layout: unknown }).layout);
  const { error } = await sb.from("store_pages").update({ draft_layout: blocks, updated_at: new Date().toISOString() }).eq("id", body.pageId);
  if (error) return NextResponse.json({ error: "กู้คืนไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "store_page",
    entityId: body.pageId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { restoredFromVersion: body.versionNo, asDraft: true },
  });

  return NextResponse.json({ ok: true, blocks });
}
