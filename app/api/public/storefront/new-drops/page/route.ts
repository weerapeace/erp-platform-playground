/**
 * 🧱 API สาธารณะ "หน้าของชุดมาใหม่" — /api/public/storefront/new-drops/page?shop=<slug>&id=<dropId>[&preview=1]
 *
 * คืน { layout: Block[] | null }
 *   ปกติ   = Section ที่เผยแพร่แล้ว (null = ยังไม่จัด → เว็บร้านวาดหน้าตาเดิม)
 *   preview = ร่าง (ไม่มี = ที่เผยแพร่) — ใช้ในพรีวิวตัวจัดหน้า ERP
 * ⚠️ ไม่มี guardApi โดยเจตนา (ข้อมูลที่ตั้งใจเผยแพร่ · ร่างเห็นได้ด้วย preview=1 เหมือน /api/public/storefront/page) + CORS · no-store
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowDraftPreview } from "@/lib/storefront-preview-access";
import { dropPageLayout } from "@/lib/website-drop-page";
import { toPublicBlocks } from "@/lib/website-blocks";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  // 🔑 ร่าง = ต้องมีรหัสพรีวิว/พนักงาน (lib/storefront-preview-access · ช่วงเปลี่ยนผ่านยังปล่อย + จด log)
  const preview = url.searchParams.get("preview") === "1" && !!slug && (await allowDraftPreview(request, slug, "new-drops"));
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  // /new/latest · /new/soon ไม่ใช่รหัสชุด → ไม่มีหน้าแต่งเอง
  if (!UUID_RE.test(id)) return json({ layout: null });

  const sb = supabaseAdmin();
  const s = await shopBySlug<{ id: string; status: string }>(sb, slug, "id, status");
  if (!s) return json({ error: "ไม่พบร้าน" }, 404);
  if (s.status !== "active" && !preview) return json({ layout: null });

  const { data } = await sb.from("store_new_drops").select("layout, draft_layout").eq("id", id).eq("shop_id", s.id).maybeSingle();
  if (!data) return json({ layout: null });
  const layout = dropPageLayout(data as { layout: unknown; draft_layout: unknown }, preview);
  return json({ layout: layout && toPublicBlocks(layout) });
}
