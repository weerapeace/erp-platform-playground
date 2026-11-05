/**
 * เติมข้อมูลร้านจากการเชื่อมต่อให้อัตโนมัติ — POST /api/platform-accounts/autofill { brand_id }
 * เติมเฉพาะช่องที่ยังว่าง (ไม่ทับที่คนพิมพ์เอง):
 *   Facebook  → ชื่อร้าน = ชื่อเพจ · ลิงก์ร้าน = ลิงก์เพจจาก Meta (สำรอง facebook.com/<page id>)
 *   Instagram → ชื่อร้าน = ชื่อโปรไฟล์ IG (สำรอง = ชื่อเพจ) · ลิงก์ร้าน = instagram.com/<username>
 *   Lazada    → ชื่อร้าน = ชื่อร้านจาก Seller Center (เฉพาะตอนการเชื่อมต่อยังใช้ได้)
 * หน้า /admin/platform-accounts เรียกเองเมื่อเจอแพลตฟอร์มที่เชื่อมแล้วแต่ช่องร้านยังว่าง (ครั้งเดียวต่อแบรนด์ต่อการเปิดหน้า)
 * → { filled: [{ code, label?, external_shop_id? }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { metaGetFields } from "@/lib/meta-graph";
import { lazApiGet } from "@/lib/lazada";
import { loadConn } from "../../meta/shared";
import { lazTokenOrReason } from "../../lazada/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Want = { code: string; platformId: string; label: string | null; shop: string | null };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องมี brand_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const [{ data: pf }, { data: accts }] = await Promise.all([
    admin.from("erp_platforms").select("id, code").in("code", ["facebook", "instagram", "lazada"]),
    admin.from("platform_accounts").select("platform_id, label, external_shop_id").eq("brand_id", brandId),
  ]);
  const pid: Record<string, string> = {};
  for (const p of (pf ?? []) as { id: string; code: string }[]) pid[p.code] = String(p.id);
  const cur = new Map<string, { label: string | null; external_shop_id: string | null }>();
  for (const a of (accts ?? []) as { platform_id: string; label: string | null; external_shop_id: string | null }[]) cur.set(String(a.platform_id), a);
  const needs = (platformId: string | undefined) => { if (!platformId) return false; const a = cur.get(platformId); return !a?.label || !a?.external_shop_id; };

  const want: Want[] = [];

  // Facebook + Instagram (ใช้การเชื่อมต่อเดียวกัน — token ของเพจ)
  if (pid.facebook && (needs(pid.facebook) || needs(pid.instagram))) {
    const conn = await loadConn(admin, brandId, pid.facebook);
    const m = conn?.meta;
    if (m?.stage === "connected" && m.page_id && conn?.token) {
      if (needs(pid.facebook)) {
        const pg = await metaGetFields(m.page_id, "link", conn.token).catch(() => null);
        want.push({ code: "facebook", platformId: pid.facebook, label: str(m.page_name), shop: str(pg?.link) ?? `https://www.facebook.com/${m.page_id}` });
      }
      if (pid.instagram && m.has_ig && m.ig_user_id && needs(pid.instagram)) {
        const ig = await metaGetFields(m.ig_user_id, "username,name", conn.token).catch(() => null);
        const username = str(ig?.username);
        want.push({ code: "instagram", platformId: pid.instagram, label: str(ig?.name) ?? str(m.page_name), shop: username ? `https://www.instagram.com/${username}` : null });
      }
    }
  }

  // Lazada — ชื่อร้านจาก Seller Center (ไม่มีลิงก์ร้านใน API → ให้คนวางเอง)
  if (pid.lazada && !cur.get(pid.lazada)?.label) {
    const tk = await lazTokenOrReason(admin, brandId, pid.lazada, user?.id ?? null).catch(() => null);
    if (tk?.ok) {
      const j = await lazApiGet(tk.gateway, "/seller/get", tk.accessToken).catch(() => null);
      const d = (j?.data ?? {}) as Record<string, unknown>;
      const name = str(d.name) ?? str(d.name_company);
      if (name) want.push({ code: "lazada", platformId: pid.lazada, label: name, shop: null });
    }
  }

  // เขียน — เฉพาะช่องที่ว่าง · แถวใหม่ = เปิดใช้งาน (เชื่อมแล้ว = ใช้จริง)
  const filled: { code: string; label?: string; external_shop_id?: string }[] = [];
  const now = new Date().toISOString();
  for (const w of want) {
    const a = cur.get(w.platformId);
    const patch: { label?: string; external_shop_id?: string } = {};
    if (!a?.label && w.label) patch.label = w.label;
    if (!a?.external_shop_id && w.shop) patch.external_shop_id = w.shop;
    if (!patch.label && !patch.external_shop_id) continue;
    const row: Record<string, unknown> = { brand_id: brandId, platform_id: w.platformId, ...patch, updated_by: user?.id ?? null, updated_at: now };
    if (!a) Object.assign(row, { is_active: true, created_by: user?.id ?? null });
    const { error } = await admin.from("platform_accounts").upsert(row, { onConflict: "brand_id,platform_id" });
    if (!error) filled.push({ code: w.code, ...patch });
  }
  if (filled.length) {
    await writeAudit(admin, { action: "update", entityType: "platform_account", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, auto_fill: filled } });
  }
  return NextResponse.json({ filled, error: null });
}
