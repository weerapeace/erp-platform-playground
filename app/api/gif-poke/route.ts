/**
 * /api/gif-poke — ส่ง GIF จิ้มเพื่อน (ทุกคนที่ล็อกอินใช้ได้ · กันสแปมด้วย rate limit)
 * GET   → กล่องรับของฉัน (GIF ที่ยังไม่กดปิด) สำหรับให้ตัววิ่งบน Dashboard
 * POST  { to_user_ids[], gif_id? | gif_url? | gif_key?, message? } → ส่งถึงหลายคน
 * PATCH { id } → กดปิดตัวที่วิ่งอยู่ (dismiss) เฉพาะของผู้รับเอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notify } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOURLY_TOTAL = 30;          // ส่งได้สูงสุด/คน/ชม.
const HOURLY_PER_RECIPIENT = 10;  // ส่งหาคนเดิมได้สูงสุด/ชม.
const MAX_RECIPIENTS = 20;        // ต่อการส่ง 1 ครั้ง

async function meFromReq(request: NextRequest): Promise<{ id: string } | null> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user ? { id: user.id } : null;
}

// ── GET: กล่องรับของฉัน (ที่ยังไม่ปิด) ──
export async function GET(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ", data: [] }, { status: 401 });
  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_gif_pokes")
    .select("id, from_name, from_avatar, gif_url, gif_key, message, created_at")
    .eq("to_user_id", me.id).is("dismissed_at", null)
    .order("created_at", { ascending: true }).limit(50);
  return NextResponse.json({ data: data ?? [], error: null });
}

// ── POST: ส่ง GIF ──
export async function POST(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: { to_user_ids?: unknown; gif_id?: unknown; gif_url?: unknown; gif_key?: unknown; message?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const toIds = [...new Set((Array.isArray(body.to_user_ids) ? body.to_user_ids : []).map(String).map((s) => s.trim()).filter(Boolean))];
  const message = String(body.message ?? "").slice(0, 500).trim();
  let gifUrl = typeof body.gif_url === "string" ? body.gif_url.trim() : "";
  let gifKey = typeof body.gif_key === "string" ? body.gif_key.trim() : "";
  const gifId = typeof body.gif_id === "string" ? body.gif_id.trim() : "";

  if (!toIds.length) return NextResponse.json({ error: "ยังไม่ได้เลือกผู้รับ" }, { status: 400 });
  if (toIds.length > MAX_RECIPIENTS) return NextResponse.json({ error: `ส่งได้สูงสุด ${MAX_RECIPIENTS} คนต่อครั้ง` }, { status: 400 });

  const admin = supabaseAdmin();

  // เลือกจากคลัง → ดึง url/key จริงจาก id (กันปลอมค่า)
  if (gifId) {
    const { data: lib } = await admin.from("erp_gif_library").select("gif_url, gif_key").eq("id", gifId).maybeSingle();
    const l = lib as { gif_url?: string | null; gif_key?: string | null } | null;
    if (l) { gifUrl = l.gif_url ?? ""; gifKey = l.gif_key ?? ""; }
  }
  if (!gifUrl && !gifKey) return NextResponse.json({ error: "ยังไม่ได้เลือก GIF" }, { status: 400 });

  const since = new Date(Date.now() - 3600_000).toISOString();

  // rate limit — รวมต่อผู้ส่ง/ชม.
  const { count: sentCount } = await admin.from("erp_gif_pokes")
    .select("id", { count: "exact", head: true })
    .eq("from_user_id", me.id).gte("created_at", since);
  if ((sentCount ?? 0) >= HOURLY_TOTAL) {
    return NextResponse.json({ error: `ส่งบ่อยเกินไป (เกิน ${HOURLY_TOTAL} ครั้ง/ชม.) พักสักครู่แล้วลองใหม่นะ` }, { status: 429 });
  }

  // snapshot ชื่อ/รูปผู้ส่ง (ให้คนรับเห็นว่าใครส่ง)
  const { data: prof } = await admin.from("user_profiles").select("display_name, avatar_url").eq("id", me.id).maybeSingle();
  const p = prof as { display_name?: string | null; avatar_url?: string | null } | null;
  const fromName = p?.display_name ?? "";
  const fromAvatar = p?.avatar_url ?? null;

  // rate limit — ต่อผู้รับ/ชม. (ข้ามคนที่เกินโควตา)
  const targets: string[] = [];
  let skipped = 0;
  for (const to of toIds) {
    const { count } = await admin.from("erp_gif_pokes")
      .select("id", { count: "exact", head: true })
      .eq("from_user_id", me.id).eq("to_user_id", to).gte("created_at", since);
    if ((count ?? 0) >= HOURLY_PER_RECIPIENT) skipped++; else targets.push(to);
  }
  if (!targets.length) {
    return NextResponse.json({ error: `ส่งหาคนเหล่านี้บ่อยเกินไปแล้ว (เกิน ${HOURLY_PER_RECIPIENT} ครั้ง/ชม.)`, skipped }, { status: 429 });
  }

  const rows = targets.map((to) => ({
    from_user_id: me.id, from_name: fromName, from_avatar: fromAvatar,
    to_user_id: to, gif_url: gifUrl || null, gif_key: gifKey || null, message: message || null,
  }));
  const { error } = await admin.from("erp_gif_pokes").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แจ้งเตือนเข้ากระดิ่ง (ของกลาง notify) — best-effort
  const title = `${fromName || "เพื่อนร่วมงาน"} ส่ง GIF หาคุณ 🎁`;
  await Promise.all(targets.map((to) => notify(admin, { userId: to, eventType: "gif_poke", title, body: message || null, linkUrl: "/tasks", priority: "low" })));

  return NextResponse.json({ sent: targets.length, skipped, error: null });
}

// ── PATCH: กดปิดตัวที่วิ่งอยู่ ──
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const me = await meFromReq(request);
  if (!me) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  let body: { id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = supabaseAdmin();
  await admin.from("erp_gif_pokes").update({ dismissed_at: new Date().toISOString() })
    .eq("id", id).eq("to_user_id", me.id).is("dismissed_at", null);
  return NextResponse.json({ ok: true, error: null });
}
