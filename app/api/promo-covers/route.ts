/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — รายการชุดโปร + สร้างชุดใหม่ (lib/promo-cover · หน้า /master/promo-covers)
 *  GET  ?trash=1 = ถังขยะ   (products.platforms.view)  → { campaigns: [{ ...campaign, items, counts }] }
 *  POST { name, starts_at?, ends_at?, auto_revert?, early_hours?, platforms? }   (products.platforms.publish) → { campaign }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { countTargets, isPromoPlatform, validateCampaign, type TargetStatus } from "@/lib/promo-cover";
import { CAMPAIGN_COLS, type CampaignRow } from "@/lib/promo-cover-server";

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
