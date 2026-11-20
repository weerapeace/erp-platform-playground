/**
 * 🔗 ลิงก์สั้น (ของกลาง) — รายการ + สร้าง
 * GET  /api/short-links?trash=1&q=   → รายการ (ล่าสุดก่อน) + ยอดคลิกแยกที่มา + ชื่อคนสร้าง
 * POST /api/short-links { url, code?, label?, source_module?, source_id?, reuse? } → สร้าง (หรือคืนลิงก์เดิมของปลายทางนี้)
 * สิทธิ์: short_links.create · ลิงก์สั้น = louismontini.co.th/go/<code> (lib/short-links)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanTargetUrl, normalizeShortCode, shortCodeProblem, shortUrlOf, SHORT_LINK_SOURCES, type ShortLinkListItem, type ShortLinkRow, type ShortLinkSource } from "@/lib/short-links";
import { SHORT_LINK_COLS, ensureShortLinks, insertShortLink } from "@/lib/short-links-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "short_links.create"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = request.nextUrl.searchParams;
  const trash = sp.get("trash") === "1";
  const q = (sp.get("q") ?? "").trim().replace(/[%,()]/g, " ");
  let query = admin.from("short_links").select(SHORT_LINK_COLS).order("created_at", { ascending: false }).limit(500);
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (q) query = query.or(`code.ilike.%${q}%,label.ilike.%${q}%,target_url.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ data: [], error: "โหลดลิงก์สั้นไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const rows = (data ?? []) as ShortLinkRow[];

  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const bySource = new Map<string, Partial<Record<ShortLinkSource, number>>>();
  const names = new Map<string, string>();
  await Promise.all([
    (async () => {
      for (let i = 0; i < ids.length; i += 150) {
        const { data: d } = await admin.from("short_link_click_daily").select("link_id, source, clicks").in("link_id", ids.slice(i, i + 150));
        for (const c of (d ?? []) as { link_id: string; source: string; clicks: number }[]) {
          const src = ((SHORT_LINK_SOURCES as readonly string[]).includes(c.source) ? c.source : "other") as ShortLinkSource;
          const m = bySource.get(c.link_id) ?? {};
          m[src] = (m[src] ?? 0) + c.clicks;
          bySource.set(c.link_id, m);
        }
      }
    })(),
    (async () => {
      if (!userIds.length) return;
      const { data: p } = await admin.from("user_profiles").select("id, display_name, email").in("id", userIds);
      for (const u of (p ?? []) as { id: string; display_name: string | null; email: string | null }[]) names.set(u.id, u.display_name?.trim() || u.email || "");
    })(),
  ]);

  const out: ShortLinkListItem[] = rows.map((r) => ({ ...r, short_url: shortUrlOf(r.code), created_by_name: r.created_by ? names.get(r.created_by) ?? null : null, by_source: bySource.get(r.id) ?? {} }));
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "short_links.create"); if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { url?: string; code?: string; label?: string; source_module?: string; source_id?: string; reuse?: boolean };
  const url = cleanTargetUrl(body.url);
  if (!url) return NextResponse.json({ data: null, error: "ลิงก์ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
  let code: string | null = null;
  if (body.code && body.code.trim()) {
    code = normalizeShortCode(body.code);
    const p = shortCodeProblem(code);
    if (p) return NextResponse.json({ data: null, error: p }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const opts = { label: body.label ?? null, sourceModule: body.source_module ?? "manual", sourceId: body.source_id ?? null, userId: user?.id ?? null };

  let row: ShortLinkRow | null = null;
  let reused = false;
  if (!code && body.reuse !== false) {
    const r = await ensureShortLinks(admin, [url], opts);
    reused = !r.created.length;
    const { data } = await admin.from("short_links").select(SHORT_LINK_COLS).eq("code", (r.map[url] ?? "").split("/").pop() ?? "").maybeSingle();
    row = (data as ShortLinkRow | null) ?? null;
  } else {
    const r = await insertShortLink(admin, url, { ...opts, code });
    if (r.error) return NextResponse.json({ data: null, error: r.error }, { status: 409 });
    row = r.row;
  }
  if (!row) return NextResponse.json({ data: null, error: "สร้างลิงก์สั้นไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  if (!reused) await writeAudit(admin, { action: "create", entityType: "short_link", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code: row.code, name: row.label ?? row.code, target_url: row.target_url, source_module: row.source_module } });
  return NextResponse.json({ data: { ...row, short_url: shortUrlOf(row.code), reused }, error: null });
}
