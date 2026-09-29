/**
 * GET  /api/china-pay/balance — ยอดเงินคงเหลือที่จีน (¥/฿) + ประวัติปรับยอดล่าสุด
 * POST /api/china-pay/balance — บันทึกการปรับยอด (set/topup/adjust)
 *   body: { kind: 'set'|'topup'|'adjust', amount_rmb: number, amount_thb?: number, note?: string, actor?: string }
 *   หมายเหตุ: 'set' ฝั่ง client คำนวณ delta = ยอดที่ตั้ง − ยอดปัจจุบัน มาแล้ว
 * POST  { action: 'reverse', id }  — กลับรายการที่บันทึกผิด (เพิ่มรายการตรงข้าม ยอดเท่าเดิม) · admin/ผู้จัดการ
 * PATCH { id, note }               — แก้หมายเหตุของรายการ (ยอดเงินแก้ตรง ๆ ไม่ได้ ต้องกลับรายการ) · admin/ผู้จัดการ
 *
 * ตารางนี้เป็น "สมุดบัญชี" (ยอดคงเหลือ = ผลรวมทุกรายการ) → ไม่ลบ/ไม่แก้ยอดย้อนหลัง
 * ลงผิด = กลับรายการ แล้วลงใหม่ให้ถูก · รายการกลับจะมี [ref:<id>] ในหมายเหตุ ใช้กันกลับซ้ำ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REF = (id: string) => `[ref:${id}]`;

/** แก้/กลับรายการ ได้เฉพาะแอดมิน + ผู้จัดการ (ตรงกับ canManage ของแอปโอนเงินจีน) — เช็กที่เซิร์ฟเวอร์ ไม่พึ่งการซ่อนปุ่ม */
async function canManage(request: NextRequest): Promise<{ ok: boolean; userId: string | null; email: string | null }> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, userId: null, email: null };
  const { data } = await client.rpc("erp_current_user");
  const p = data as { role?: string | null; active?: boolean | null } | null;
  const role = String(p?.role ?? "");
  return { ok: p?.active !== false && (role === "admin" || role === "manager"), userId: user.id, email: user.email ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const { data, error } = await client.rpc("china_balance_current");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ประวัติล่าสุด (อ่านผ่าน service role — ตารางถูกล็อก RLS)
  const { data: hist } = await supabaseAdmin()
    .from("china_balance_adjustments")
    .select("id, kind, amount_rmb, amount_thb, note, actor, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const bal = (data ?? { rmb: 0, thb: 0 }) as { rmb: number; thb: number };
  return NextResponse.json({ ...bal, adjustments: hist ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { kind?: string; amount_rmb?: number; amount_thb?: number; note?: string; actor?: string; action?: string; id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // ── กลับรายการที่บันทึกผิด ──
  if (body.action === "reverse") {
    const who = await canManage(request);
    if (!who.ok) return NextResponse.json({ error: "กลับรายการได้เฉพาะแอดมินหรือผู้จัดการ" }, { status: 403 });
    const id = String(body.id ?? "");
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("china_balance_adjustments").select("id, kind, amount_rmb, amount_thb, note, created_at").eq("id", id).maybeSingle();
    if (!row) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    if (String(row.note ?? "").includes("[ref:")) return NextResponse.json({ error: "รายการนี้เป็นรายการกลับอยู่แล้ว กลับซ้ำไม่ได้" }, { status: 400 });
    const { data: dup } = await admin.from("china_balance_adjustments").select("id").ilike("note", `%${REF(id)}%`).limit(1);
    if (dup?.length) return NextResponse.json({ error: "รายการนี้ถูกกลับรายการไปแล้ว" }, { status: 400 });
    if (Number(row.amount_rmb) === 0 && Number(row.amount_thb) === 0) return NextResponse.json({ error: "รายการนี้ยอดเป็น 0 ไม่ต้องกลับรายการ" }, { status: 400 });

    const day = String(row.created_at ?? "").slice(0, 10);
    const { data: bal, error: rErr } = await client.rpc("china_balance_add", {
      p_kind: "adjust",
      p_amount_rmb: -Number(row.amount_rmb ?? 0),
      p_amount_thb: -Number(row.amount_thb ?? 0),
      p_note: `↩ กลับรายการวันที่ ${day}${row.note ? ` (${row.note})` : ""} ${REF(id)}`,
      p_actor: who.email,
    });
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    const b = (bal ?? { rmb: 0, thb: 0 }) as { rmb: number; thb: number };
    return NextResponse.json({ ...b, reversed: id, error: null });
  }

  const { data, error } = await client.rpc("china_balance_add", {
    p_kind:       String(body.kind ?? "adjust"),
    p_amount_rmb: Number(body.amount_rmb ?? 0),
    p_amount_thb: Number(body.amount_thb ?? 0),
    p_note:       body.note ?? null,
    p_actor:      body.actor ?? user.email ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bal = (data ?? { rmb: 0, thb: 0 }) as { rmb: number; thb: number };
  return NextResponse.json({ ...bal, error: null });
}

// แก้หมายเหตุของรายการ (พิมพ์ผิด/อยากอธิบายเพิ่ม) — ยอดเงินไม่แตะ
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const who = await canManage(request);
  if (!who.userId) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  if (!who.ok) return NextResponse.json({ error: "แก้ได้เฉพาะแอดมินหรือผู้จัดการ" }, { status: 403 });

  let body: { id?: string; note?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("china_balance_adjustments").select("id, note").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  const old = String(row.note ?? "");
  // รายการกลับ: คงป้ายอ้างอิง [ref:..] ไว้เสมอ (ใช้กันกลับซ้ำ)
  const ref = old.match(/\[ref:[^\]]+\]/)?.[0] ?? "";
  const text = String(body.note ?? "").replace(/\[ref:[^\]]+\]/g, "").trim();
  const note = [text, ref].filter(Boolean).join(" ") || null;

  const { error } = await admin.from("china_balance_adjustments").update({ note }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_logs").insert({
    actor_user_id: who.userId, action: "update", entity_type: "china_balance", entity_id: id,
    metadata: { actor: who.email, field: "note", old, new: note },
  });
  return NextResponse.json({ ok: true, note, error: null });
}
