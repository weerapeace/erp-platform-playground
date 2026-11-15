/**
 * ทะเบียน Description ของใบส่งของจากขนส่ง → คิดค่าส่งจากคิวหรือกก. (★ 2026-11-15 เจ้าของ: "ต้องมีหน้าบันทึกกลางว่า แต่ละอันคำนวนแบบไหน")
 *   GET  → Description ทุกแบบที่เคยเจอในใบส่งของ (กี่ครั้ง · ล่าสุด · เคยเลือกคิว/กก. กี่ครั้ง) + กฎที่ใช้อยู่
 *   POST { description, method, source? } → จำเป็นกฎ (Description นี้ = คิว/กก.) แล้วเติมวิธีคิดให้กล่องที่ยังว่างในใบส่งของที่ยังไม่ได้ใช้
 * กฎเก็บที่ตาราง freight_description_rules (หน้า /m/freight-description-rules) — ตารางเดิม ไม่ได้สร้างใหม่
 * สูตรจับกฎ: lib/delivery-bill-check (ตรงทั้งคำก่อน แล้วค่อย "มีคำนี้อยู่" ตามลำดับ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { methodForDescription, normDesc, ruleForDescription, type DescRule } from "@/lib/delivery-bill-check";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

async function loadRules(admin: Admin): Promise<(DescRule & { id: string; sort_order: number; note: string | null })[]> {
  const { data } = await admin.from("freight_description_rules").select("id, keyword, method, sort_order, note, is_active").not("is_active", "is", false).order("sort_order");
  return ((data ?? []) as Row[])
    .map((r) => ({ id: String(r.id), keyword: normDesc(String(r.keyword ?? "")), method: r.method === "weight" ? "weight" as const : "cube" as const, sort_order: Number(r.sort_order) || 0, note: (r.note as string | null) ?? null }))
    .filter((r) => r.keyword);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data: bills, error }, rules] = await Promise.all([
    admin.from("purchase_delivery_bills").select("bill_date, created_at, lines").neq("kind", "seller").not("is_active", "is", false).order("created_at", { ascending: false }).limit(3000),
    loadRules(admin),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const seen = new Map<string, { description: string; count: number; last: string | null; cube: number; weight: number }>();
  for (const b of (bills ?? []) as Row[]) {
    const day = String(b.bill_date ?? b.created_at ?? "").slice(0, 10) || null;
    for (const l of (Array.isArray(b.lines) ? (b.lines as Row[]) : [])) {
      const d = normDesc(String(l.description ?? "")); if (!d) continue;
      const s = seen.get(d) ?? { description: d, count: 0, last: null, cube: 0, weight: 0 };
      s.count++;
      if (day && (!s.last || day > s.last)) s.last = day;
      if (l.method === "cube") s.cube++; else if (l.method === "weight") s.weight++;
      seen.set(d, s);
    }
  }
  const rows = [...seen.values()]
    .map((s) => { const r = ruleForDescription(s.description, rules); return { ...s, rule: r ? { keyword: r.keyword, method: r.method } : null }; })
    .sort((a, b) => Number(!!a.rule) - Number(!!b.rule) || b.count - a.count);   // ยังไม่ตั้งกฎขึ้นก่อน
  return NextResponse.json({ data: rows, rules: rules.map((r) => ({ id: r.id, keyword: r.keyword, method: r.method, note: r.note })), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { description?: string; method?: string; source?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const keyword = normDesc(body.description);
  const method = body.method === "weight" ? "weight" : body.method === "cube" ? "cube" : null;
  if (!keyword) return NextResponse.json({ error: "ไม่มี Description" }, { status: 400 });
  if (!method) return NextResponse.json({ error: "เลือกคิดจากคิว หรือ กก." }, { status: 400 });
  const admin = supabaseAdmin();
  const rules = await loadRules(admin);
  const same = rules.find((r) => r.keyword === keyword);
  const note = body.source === "bill" ? "จำจากใบส่งของ" : "ตั้งจากทะเบียน Description";
  let ruleId: string;
  if (same) {
    const { error } = await admin.from("freight_description_rules").update({ method, updated_at: new Date().toISOString() }).eq("id", same.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ruleId = same.id;
  } else {
    const sort = rules.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
    const { data: ins, error } = await admin.from("freight_description_rules").insert({ keyword, method, sort_order: sort, note, is_active: true }).select("id").single();
    if (error || !ins) return NextResponse.json({ error: "บันทึกกฎไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    ruleId = String((ins as Row).id);
  }
  // เติมวิธีคิดให้กล่องที่ยังว่าง ในใบส่งของที่ยังไม่ได้ใช้ (ใช้แล้ว = ค่าลงใบสำคัญไปแล้ว ไม่แตะ)
  const after = await loadRules(admin);
  const { data: open } = await admin.from("purchase_delivery_bills").select("id, lines").neq("kind", "seller").neq("status", "applied").not("is_active", "is", false).limit(1000);
  let backfilled = 0;
  for (const b of (open ?? []) as Row[]) {
    const lines = Array.isArray(b.lines) ? (b.lines as Row[]) : [];
    let n = 0;
    const next = lines.map((l) => {
      if (l.method === "cube" || l.method === "weight") return l;
      const m = methodForDescription(String(l.description ?? ""), after);
      if (!m) return l;
      n++; return { ...l, method: m };
    });
    if (n === 0) continue;
    const { error } = await admin.from("purchase_delivery_bills").update({ lines: next, updated_at: new Date().toISOString() }).eq("id", String(b.id));
    if (!error) backfilled += n;
  }
  await writeAudit(admin, {
    action: same ? "update" : "create", entityType: "freight_description_rules", entityId: ruleId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { keyword, method, before: same ? same.method : null, source: note, backfilled_boxes: backfilled },
  });
  return NextResponse.json({ ok: true, rule: { id: ruleId, keyword, method }, backfilled, error: null });
}
