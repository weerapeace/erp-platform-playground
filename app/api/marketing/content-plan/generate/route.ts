/**
 * สร้างแผนทั้งเดือนจากสล็อตประจำสัปดาห์ — POST /api/marketing/content-plan/generate
 * body { brand_id, month: "YYYY-MM", dry_run?: boolean }
 *   dry_run = true  → คืนรายการที่ "จะสร้าง" (ให้หน้าเว็บโชว์ก่อนยืนยัน) ไม่บันทึก
 *   dry_run = false → สร้างคอนเทนต์สถานะ draft (= ขั้นไอเดีย) ลงปฏิทินตามวัน/เวลาของสล็อต
 * กติกา: ข้ามวันที่ผ่านไปแล้ว (เวลาไทย) · ข้ามสล็อต+วันที่เคยสร้างแล้ว (plan_slot_id) → กดซ้ำได้ ไม่ซ้ำ
 * สิทธิ์ = tasks.create (สร้างคอนเทนต์) · audit 1 รายการต่อการสร้าง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { nextContentNo } from "@/lib/creative-tasks-server";
import { isUuid } from "@/lib/marketing/sku-list";
import { planSlotsForMonth, bangkokDateKey, bangkokIso, type PlanSlot } from "@/lib/marketing/content-plan";

export const dynamic = "force-dynamic";

const MAX_CREATE = 200;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  let b: { brand_id?: unknown; month?: unknown; dry_run?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.brand_id)) return NextResponse.json({ data: null, error: "เลือกแบรนด์ก่อน (แท็บแบรนด์ด้านบน)" }, { status: 400 });
  const month = String(b.month ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ data: null, error: "เดือนไม่ถูกต้อง" }, { status: 400 });
  const brandId = b.brand_id as string;
  const dryRun = b.dry_run !== false;

  const admin = supabaseAdmin();
  const { data: slotRows, error: sErr } = await admin.from("content_plan_slots")
    .select("id, brand_id, weekday, post_time, platform, post_type, pillar_id, title, is_active").eq("brand_id", brandId).eq("is_active", true);
  if (sErr) return NextResponse.json({ data: null, error: "โหลดสล็อตไม่สำเร็จ: " + sErr.message }, { status: 500 });
  const slots = (slotRows ?? []) as PlanSlot[];
  if (!slots.length) return NextResponse.json({ data: null, error: "แบรนด์นี้ยังไม่มีสล็อตประจำสัปดาห์ — ตั้งที่ ⚙️ ตั้งค่า → สล็อตประจำสัปดาห์" }, { status: 400 });

  // ของที่เคยสร้างจากสล็อตเหล่านี้ในเดือนนี้ (ช่วงเวลาไทย) → กันซ้ำ
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const { data: exist, error: eErr } = await admin.from("erp_creative_content").select("plan_slot_id, scheduled_at")
    .in("plan_slot_id", slots.map((s) => s.id)).eq("is_active", true)
    .gte("scheduled_at", bangkokIso(`${month}-01`, "00:00")).lt("scheduled_at", bangkokIso(`${nextMonth}-01`, "00:00"));
  if (eErr) return NextResponse.json({ data: null, error: "ตรวจของเดิมไม่สำเร็จ: " + eErr.message }, { status: 500 });
  const existing = new Set((exist ?? []).filter((r) => r.scheduled_at).map((r) => `${r.plan_slot_id}|${bangkokDateKey(r.scheduled_at as string)}`));

  const plan = planSlotsForMonth(slots, month, existing, bangkokDateKey(new Date()));
  if (plan.create.length > MAX_CREATE) return NextResponse.json({ data: null, error: `สร้างได้ครั้งละไม่เกิน ${MAX_CREATE} ชิ้น (ตอนนี้ ${plan.create.length}) — ลดสล็อตก่อน` }, { status: 400 });
  if (dryRun || plan.create.length === 0) return NextResponse.json({ data: { ...plan, created: 0 }, error: null });

  // สร้างจริง: เลขเอกสารเรียงต่อกัน · ชนเลข (มีคนสร้างพร้อมกัน) → ขอเลขใหม่แล้วลองอีกครั้ง
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const rowsFrom = (firstNo: string) => {
    const prefix = firstNo.slice(0, firstNo.lastIndexOf("-") + 1);
    const start = parseInt(firstNo.slice(prefix.length), 10) || 1;
    return plan.create.map((c, i) => ({
      content_no: `${prefix}${String(start + i).padStart(4, "0")}`, title: c.title, brand_id: brandId,
      platforms: [c.platform], post_type: c.post_type, pillar_id: c.pillar_id, status: "draft",
      scheduled_at: bangkokIso(c.date, c.time), plan_slot_id: c.slot_id, is_template: false, created_by: user?.id ?? null,
    }));
  };
  let { error } = await admin.from("erp_creative_content").insert(rowsFrom(await nextContentNo(admin)));
  if (error && /duplicate|unique/i.test(error.message)) ({ error } = await admin.from("erp_creative_content").insert(rowsFrom(await nextContentNo(admin))));
  if (error) return NextResponse.json({ data: null, error: "สร้างแผนไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "marketing.plan.generate", entityType: "creative_content", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { brand_id: brandId, month, created: plan.create.length, skipped_past: plan.skippedPast, skipped_existing: plan.skippedExisting },
  });
  return NextResponse.json({ data: { ...plan, created: plan.create.length }, error: null });
}
