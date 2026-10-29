/**
 * 👷 ส่งร่างดีไซน์ให้หัวหน้าตรวจ — /api/website/theme/review (หน้าดีไซน์แบบง่ายของพนักงาน)
 * POST { shopId, pages: [หัวข้อที่แก้], note? }
 *   → กระดิ่งแจ้งเตือน (erp_notifications) ถึงคนที่แก้ดีไซน์ได้ทุกหัวข้อ + เข้าร้านนั้นได้ (ไม่รวมตัวเอง) · ลิงก์เปิดหน้าดีไซน์หัวข้อแรก
 *   → audit website_design.review_request
 * สิทธิ์: แก้ดีไซน์ได้ (ทุกหัวข้อหรือบางหัวข้อ · lib/website-api-guard guardDesignEdit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardDesignEdit } from "@/lib/website-api-guard";
import { isDesignTopic, websitePerm, websiteShopPerm } from "@/lib/website-access";
import { DESIGN_PAGES } from "@/lib/website-design-nav";
import { usersWithPerms } from "@/lib/perm-holders";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { denied } = await guardDesignEdit(request);
  if (denied) return denied;
  let body: { shopId?: string; pages?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
  const pages = [...new Set((Array.isArray(body.pages) ? body.pages : []).filter(isDesignTopic))];
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

  const sb = supabaseAdmin();
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const [{ data: shop }, { data: me }] = await Promise.all([
    sb.from("shops").select("id, slug, name").eq("id", body.shopId).maybeSingle(),
    user ? sb.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string; name: string };
  const who = (me as { display_name?: string | null; email?: string | null } | null)?.display_name || user?.email || "พนักงาน";

  // หัวหน้า = แก้ดีไซน์ได้ทุกหัวข้อ + เข้าร้านนี้ได้
  const to = (await usersWithPerms(sb, [websitePerm("design", "edit")], [websiteShopPerm(s.slug)])).filter((id) => id !== user?.id);
  const labels = pages.map((p) => DESIGN_PAGES[p].label).join(", ") || "ดีไซน์เว็บ";
  if (to.length) {
    const { error } = await sb.from("erp_notifications").insert(
      to.map((uid) => ({
        user_id: uid,
        event_type: "website_design_review",
        title: `ขอตรวจดีไซน์เว็บ ${s.name}`,
        body: `${who} แก้ ${labels}${note ? ` · “${note}”` : ""} — เปิดดูร่างแล้วกดเผยแพร่`,
        link_url: `/website/${s.slug}?tab=design${pages[0] ? `&d=${pages[0]}` : ""}`,
        entity_type: "shop_theme",
        entity_id: s.id,
        priority: "normal",
      }))
    );
    if (error) return NextResponse.json({ error: "ส่งแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "website_design.review_request",
    entityType: "shop_theme",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { pages, note: note || null, recipients: to.length },
  });
  return NextResponse.json({ ok: true, sent: to.length });
}
