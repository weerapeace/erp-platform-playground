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
import { dropPageLayout } from "@/lib/website-drop-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  const preview = url.searchParams.get("preview") === "1";
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  // /new/latest · /new/soon ไม่ใช่รหัสชุด → ไม่มีหน้าแต่งเอง
  if (!UUID_RE.test(id)) return json({ layout: null });

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; status: string };
  if (s.status !== "active" && !preview) return json({ layout: null });

  const { data } = await sb.from("store_new_drops").select("layout, draft_layout").eq("id", id).eq("shop_id", s.id).maybeSingle();
  if (!data) return json({ layout: null });
  return json({ layout: dropPageLayout(data as { layout: unknown; draft_layout: unknown }, preview) });
}
