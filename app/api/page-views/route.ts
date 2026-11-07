/**
 * บันทึกการเข้าใช้หน้า — ขั้น 3 ของหน้าประวัติการใช้งาน (ของกลาง lib/page-views · เอกสาร docs/audit-log.md)
 *
 * POST /api/page-views  body { items: [{ day, path, views, first_at, last_at }] }
 *   → ผู้ใช้ที่ล็อกอินส่ง "ยอดเปิดหน้าของตัวเอง" (components/page-view-recorder ส่งเป็นก้อนทุก ~60 วิ)
 *   → บวกเข้าตาราง page_view_daily (วัน × คน × หน้า) ผ่านฟังก์ชัน page_view_bump (เรียกได้เฉพาะเซิร์ฟเวอร์)
 * GET  /api/page-views?from&to&user&path  (สิทธิ์ admin.audit_log — เหมือนหน้าประวัติ)
 *   → { pages: [{ path, label, section, views, users, last_at }], people: [{ user_id, name, views, pages, days, last_at }] }
 *   · user = ดูเฉพาะคนนี้ (ตาราง "ตามหน้า") · path = ดูเฉพาะหน้านี้ (ตาราง "ตามคน")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { cleanPageViewItems, matchMenuLabel, normalizePagePath, PAGE_VIEW_RETENTION_DAYS, type MenuLabelItem } from "@/lib/page-views";
import { loadAuditProfiles } from "@/lib/audit-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageViewPageRow = { path: string; label: string | null; section: string | null; views: number; users: number; last_at: string };
export type PageViewPersonRow = { user_id: string; name: string; views: number; pages: number; days: number; last_at: string };
export type PageViewsResponse = { pages: PageViewPageRow[]; people: PageViewPersonRow[]; from: string; to: string; error: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  let userId: string | null = null;
  try { userId = (await supabaseFromRequest(request).auth.getUser()).data.user?.id ?? null; } catch { userId = null; }
  if (!userId) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  let body: { items?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const items = cleanPageViewItems(body.items);
  if (items.length === 0) return NextResponse.json({ saved: 0, error: null });
  const { data, error } = await supabaseAdmin().rpc("page_view_bump", { p_user: userId, p_rows: items });
  if (error) {
    console.error("[page-views] บันทึกไม่สำเร็จ:", error.message);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ saved: Number(data) || items.length, error: null });
}

// ── ชื่อหน้าจากทะเบียนเมนู (แคช 5 นาที) ──
let menuCache: { at: number; items: MenuLabelItem[] } | null = null;
async function loadMenuItems(admin: ReturnType<typeof supabaseAdmin>): Promise<MenuLabelItem[]> {
  if (menuCache && Date.now() - menuCache.at < 5 * 60_000) return menuCache.items;
  const { data, error } = await admin.from("erp_menu_items").select("href, label, section").eq("is_active", true).limit(1000);
  if (error) return menuCache?.items ?? [];
  menuCache = { at: Date.now(), items: (data ?? []) as MenuLabelItem[] };
  return menuCache.items;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.audit_log"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const today = todayBangkok();
  const oldest = addDaysYmd(today, -PAGE_VIEW_RETENTION_DAYS);
  const from = YMD.test(sp.get("from") ?? "") ? (sp.get("from") as string) : addDaysYmd(today, -6);
  const to = YMD.test(sp.get("to") ?? "") ? (sp.get("to") as string) : today;
  const user = UUID.test(sp.get("user") ?? "") ? (sp.get("user") as string) : null;
  const path = normalizePagePath(sp.get("path"));
  const range = { p_from: from < oldest ? oldest : from, p_to: to };

  const admin = supabaseAdmin();
  const [byPage, byUser, menu, profiles] = await Promise.all([
    admin.rpc("page_view_by_page", { ...range, p_user: user }),
    admin.rpc("page_view_by_user", { ...range, p_path: path }),
    loadMenuItems(admin),
    loadAuditProfiles(admin),
  ]);
  if (byPage.error || byUser.error) {
    console.error("[page-views] อ่านไม่สำเร็จ:", byPage.error?.message ?? byUser.error?.message);
    return NextResponse.json({ pages: [], people: [], from: range.p_from, to, error: "โหลดข้อมูลการเข้าใช้หน้าไม่สำเร็จ" } satisfies PageViewsResponse, { status: 500 });
  }
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name?.trim() || p.email || "ไม่ทราบชื่อ"]));
  const pages: PageViewPageRow[] = ((byPage.data ?? []) as { path: string; views: number; users: number; last_at: string }[]).map((r) => {
    const m = matchMenuLabel(r.path, menu);
    return { path: r.path, label: m?.label ?? null, section: m?.section ?? null, views: Number(r.views), users: Number(r.users), last_at: r.last_at };
  });
  const people: PageViewPersonRow[] = ((byUser.data ?? []) as { user_id: string; views: number; pages: number; days: number; last_at: string }[]).map((r) => ({
    user_id: r.user_id, name: nameById.get(r.user_id) ?? "ไม่ทราบชื่อ", views: Number(r.views), pages: Number(r.pages), days: Number(r.days), last_at: r.last_at,
  }));
  return NextResponse.json({ pages, people, from: range.p_from, to, error: null } satisfies PageViewsResponse, { headers: { "Cache-Control": "no-store" } });
}
