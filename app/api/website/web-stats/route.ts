/**
 * 📈 สถิติเว็บร้าน (ERP › เว็บไซต์ › 📈 สถิติ) : GET /api/website/web-stats?shopId=<id>&days=7|30|90
 * → { summary (lib/website-web-stats summarizeWebStats), names: {รหัสรุ่น: ชื่อ}, terms: คำค้นยอดนิยม, since }
 * ตัวนับจากเว็บ = store_web_stats · ออเดอร์/ยอด = store_orders (ไม่นับยกเลิก) · สิทธิ์ products.view · ไม่มีข้อมูลส่วนตัว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardWebsite } from "@/lib/website-api-guard";
import { readSearchTerms } from "@/lib/website-search-terms";
import { bkkDayFrom, cleanAb, summarizeWebStats, type StatOrder, type StatRow } from "@/lib/website-web-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 1000;
const MAX_ROWS = 50000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  const shopId = (p.get("shopId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(shopId)) return NextResponse.json({ error: "ต้องระบุร้าน" }, { status: 400 });
  const days = Math.max(1, Math.min(365, Number(p.get("days")) || 30));
  const since = bkkDayFrom(days);
  const sb = supabaseAdmin();

  // ดึงทีละ 1,000 แถว (PostgREST ตัดที่ 1,000) จนครบ
  const rows: StatRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sb
      .from("store_web_stats")
      .select("day, metric, dim, n")
      .eq("shop_id", shopId)
      .gte("day", since)
      .order("day")
      .order("metric")
      .order("dim")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "โหลดสถิติไม่สำเร็จ" }, { status: 500 });
    rows.push(...((data ?? []) as StatRow[]));
    if ((data ?? []).length < PAGE) break;
  }

  // ออเดอร์ในช่วง (เวลาไทย) — ไม่นับที่ยกเลิก
  const orders: StatOrder[] = [];
  const sinceIso = `${since}T00:00:00+07:00`;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sb
      .from("store_orders")
      .select("created_at, source, grand_total, ab, status")
      .eq("shop_id", shopId)
      .gte("created_at", sinceIso)
      .neq("status", "cancelled")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ" }, { status: 500 });
    for (const o of (data ?? []) as { created_at: string; source: string | null; grand_total: number | string; ab: unknown }[]) {
      orders.push({
        day: new Date(new Date(o.created_at).getTime() + 7 * 3600e3).toISOString().slice(0, 10),
        source: o.source,
        total: Number(o.grand_total) || 0,
        ab: cleanAb(o.ab),
      });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const summary = summarizeWebStats(rows, orders);
  const codes = summary.products.map((x) => x.code);
  const [{ data: names }, terms] = await Promise.all([
    codes.length ? sb.from("parent_skus_v2").select("code, name_th").in("code", codes) : Promise.resolve({ data: [] }),
    readSearchTerms(sb, shopId, days, false).catch(() => []),
  ]);
  return NextResponse.json(
    {
      since,
      days,
      summary,
      names: Object.fromEntries(((names ?? []) as { code: string; name_th: string | null }[]).map((n) => [String(n.code).toUpperCase(), n.name_th ?? ""])),
      terms: terms.slice(0, 15),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
