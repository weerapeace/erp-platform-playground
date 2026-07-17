/**
 * /api/subscriptions/personal — ข้อมูลสำหรับ "หน้าส่วนตัว" (แยกตาม user ที่ล็อกอิน)
 *
 * GET → {
 *   mine:       Subscription[]   // รายการส่วนตัวของฉัน (owner_id = me)
 *   shared:     Subscription[]   // ส่วนตัวของคนอื่นที่แชร์ลิสต์ให้ฉันดู (+ owner_label)
 *   sharedWith: {id,name}[]      // ฉันแชร์ลิสต์ส่วนตัวให้ใครดูบ้าง
 *   settings
 * }
 *
 * "ส่วนตัวจริง": เห็นเฉพาะเจ้าของ + คนที่ถูกแชร์ · แชร์ระดับทั้งหน้า (subscription_personal_shares)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { userLabelMap } from "@/lib/creative-tasks-server";
import type { SubSettings, Subscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_SETTINGS: SubSettings = { exchange_rate: 32, eur_rate: 39, display_currency: "THB" };

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? "";
  const db = supabaseAdmin();

  if (!me) {
    return NextResponse.json({ mine: [], shared: [], sharedWith: [], services: [], settings: DEFAULT_SETTINGS, error: null });
  }

  // ใครแชร์ลิสต์ให้ฉันดู (viewer = me) · ฉันแชร์ให้ใคร (owner = me) · คลัง streaming ของฉัน
  const [{ data: sharedToMe }, { data: iShareTo }, { data: streamingSvcs }, { data: st }] = await Promise.all([
    db.from("subscription_personal_shares").select("owner_id").eq("viewer_id", me),
    db.from("subscription_personal_shares").select("viewer_id").eq("owner_id", me),
    db.from("subscription_streaming_services").select("id, name, sort_order").eq("owner_id", me).order("sort_order").order("name"),
    db.from("app_settings").select("exchange_rate, eur_rate, display_currency").eq("id", 1).single(),
  ]);
  const sharedOwnerIds = [...new Set((sharedToMe ?? []).map((r) => String(r.owner_id)).filter(Boolean))];
  const viewerIds = [...new Set((iShareTo ?? []).map((r) => String(r.viewer_id)).filter(Boolean))];

  // รายการส่วนตัว: ของฉัน + ของ owner ที่แชร์ให้ฉัน
  const ownerIds = [...new Set([me, ...sharedOwnerIds])];
  const { data: rows, error } = await db
    .from("subscriptions").select("*").eq("type", "personal").in("owner_id", ownerIds).order("name");
  if (error) {
    return NextResponse.json({ mine: [], shared: [], sharedWith: [], settings: DEFAULT_SETTINGS, error: error.message }, { status: 500 });
  }

  // ชื่อผู้ใช้ (เจ้าของรายการที่แชร์มา + คนที่ฉันแชร์ให้)
  const labelMap = await userLabelMap(db, [...sharedOwnerIds, ...viewerIds]);

  const all = (rows ?? []) as Subscription[];
  const mine = all.filter((r) => r.owner_id === me);
  const shared = all
    .filter((r) => r.owner_id && r.owner_id !== me)
    .map((r) => ({ ...r, owner_label: labelMap.get(String(r.owner_id)) ?? "ผู้ใช้อื่น" }));
  const sharedWith = viewerIds.map((id) => ({ id, name: labelMap.get(id) ?? id }));
  const services = (streamingSvcs ?? []) as { id: string; name: string; sort_order: number }[];

  const settings: SubSettings = st
    ? {
        exchange_rate: Number(st.exchange_rate) || DEFAULT_SETTINGS.exchange_rate,
        eur_rate: Number(st.eur_rate) || DEFAULT_SETTINGS.eur_rate,
        display_currency: (st.display_currency as SubSettings["display_currency"]) || "THB",
      }
    : DEFAULT_SETTINGS;

  return NextResponse.json({ mine, shared, sharedWith, services, settings, error: null });
}
