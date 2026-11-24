/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — รายการชุดโปร + สร้างชุดใหม่ (lib/promo-cover · หน้า /master/promo-covers)
 *  GET  ?trash=1 = ถังขยะ   (products.platforms.view)  → { campaigns: [{ ...campaign, items, counts }] }
 *  POST { name, starts_at?, ends_at?, auto_revert?, early_hours?, platforms? }   (products.platforms.publish) → { campaign }
 *  POST { copy_from: id }  = "ใช้ซ้ำ" — ชุดใหม่ (ร่าง) ก๊อปรุ่น + ปกโปร + ร้าน + กรอบ + ค่าตั้งย้อนอัตโนมัติ/ส่งล่วงหน้า · เวลาว่าง (ตั้งใหม่)
 *     ชื่อ "… (รอบ 2)" (reuseName) · เก็บปกลงอัลบั้มชื่อชุดใหม่ให้เลย · ประวัติ create { copied_from } · ย้อน = ลบชุดใหม่ลงถังขยะ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { countTargets, isPromoPlatform, reuseName, validateCampaign, type TargetStatus } from "@/lib/promo-cover";
import { CAMPAIGN_COLS, loadCampaignFull, type CampaignRow } from "@/lib/promo-cover-server";
import { syncPromoAlbum } from "@/lib/promo-cover-album";

/** ใช้ซ้ำ: ก๊อปชุดเดิมเป็นร่างใหม่ (ไม่ก๊อปผลรายร้าน/เวลา/สถานะ) */
async function reuseCampaign(fromId: string, user: { id: string; email: string | null } | null): Promise<NextResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(fromId)) return NextResponse.json({ error: "ไม่พบชุดโปรต้นทาง" }, { status: 404 });
  const admin = supabaseAdmin();
  const src = await loadCampaignFull(admin, fromId);
  if (!src) return NextResponse.json({ error: "ไม่พบชุดโปรต้นทาง (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const s = src.campaign;
  const { data, error } = await admin.from("promo_cover_campaigns").insert({
    name: reuseName(s.name), note: s.note, status: "draft", starts_at: null, ends_at: null,
    auto_revert: s.auto_revert, early_hours: s.early_hours, platforms: s.platforms, frame_key: s.frame_key, created_by: user?.id ?? null,
  }).select(CAMPAIGN_COLS).single();
  if (error || !data) return NextResponse.json({ error: `ใช้ซ้ำไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });
  const camp = data as CampaignRow;
  if (src.items.length) {
    const { error: e2 } = await admin.from("promo_cover_items").insert(src.items.map((i, n) => ({ campaign_id: camp.id, parent_sku_id: i.parent_sku_id, promo_key: i.promo_key, source: i.source, sort_order: n })));
    if (e2) {
      await admin.from("promo_cover_campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", camp.id);   // ไม่ทิ้งชุดครึ่ง ๆ ไว้ในรายการ
      return NextResponse.json({ error: `ก๊อปรุ่นไม่สำเร็จ: ${e2.message}` }, { status: 500 });
    }
  }
  await writeAudit(admin, { action: "create", entityType: "promo_cover_campaign", entityId: camp.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: camp.name, copied_from: { id: s.id, name: s.name }, items: src.items.length } });
  await syncPromoAlbum(admin, camp, src.items);
  return NextResponse.json({ campaign: camp }, { headers: NO_STORE });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const admin = supabaseAdmin();
  let q = admin.from("promo_cover_campaigns").select(CAMPAIGN_COLS).order("created_at", { ascending: false }).limit(300);
  q = trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `โหลดชุดโปรไม่สำเร็จ: ${error.message}` }, { status: 500, headers: NO_STORE });
  const camps = (data ?? []) as CampaignRow[];
  const ids = camps.map((c) => c.id);
  const [{ data: items }, { data: targets }] = ids.length ? await Promise.all([
    admin.from("promo_cover_items").select("campaign_id").in("campaign_id", ids),
    admin.from("promo_cover_targets").select("campaign_id, status").in("campaign_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const itemCount = new Map<string, number>();
  for (const i of (items ?? []) as { campaign_id: string }[]) itemCount.set(i.campaign_id, (itemCount.get(i.campaign_id) ?? 0) + 1);
  const tOf = new Map<string, { status: TargetStatus }[]>();
  for (const t of (targets ?? []) as { campaign_id: string; status: TargetStatus }[]) { const a = tOf.get(t.campaign_id) ?? []; a.push(t); tOf.set(t.campaign_id, a); }
  return NextResponse.json({ campaigns: camps.map((c) => ({ ...c, items: itemCount.get(c.id) ?? 0, counts: countTargets(tOf.get(c.id) ?? []) })) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (typeof b.copy_from === "string") return reuseCampaign(b.copy_from, user ? { id: user.id, email: user.email ?? null } : null);
  const input = {
    name: String(b.name ?? "").trim(),
    starts_at: b.starts_at ? String(b.starts_at) : null,
    ends_at: b.ends_at ? String(b.ends_at) : null,
    auto_revert: b.auto_revert !== false,
    early_hours: b.early_hours == null ? 24 : Number(b.early_hours),
    platforms: Array.isArray(b.platforms) ? (b.platforms as unknown[]).map(String).filter(isPromoPlatform) : ["shopee", "lazada", "tiktok", "line_shopping", "website"],
  };
  const errors = validateCampaign(input);
  if (errors.length) return NextResponse.json({ error: errors.join(" · ") }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("promo_cover_campaigns").insert({ ...input, status: "draft", created_by: user?.id ?? null }).select(CAMPAIGN_COLS).single();
  if (error) return NextResponse.json({ error: `สร้างชุดโปรไม่สำเร็จ: ${error.message}` }, { status: 500 });
  await writeAudit(admin, { action: "create", entityType: "promo_cover_campaign", entityId: (data as CampaignRow).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: input.name } });
  return NextResponse.json({ campaign: data }, { headers: NO_STORE });
}
