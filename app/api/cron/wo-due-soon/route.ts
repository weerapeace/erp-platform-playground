/**
 * /api/cron/wo-due-soon — เตือน "งานใกล้/เกินกำหนด" วันละครั้ง
 *
 * ตรวจ 2 ชั้น (เพราะกำหนดส่งอยู่ได้ทั้ง 2 ที่):
 *   1) ใบจ่ายงาน (mo_work_orders) ที่ยังไม่ส่งครบ  → รู้ว่าค้างที่โต๊ะ/ช่างคนไหน
 *   2) ใบสั่งผลิต (manufacturing_orders) ที่ยังเปิดอยู่ → กันเคส "เลยกำหนดแต่ยังไม่ได้จ่ายงานเลย"
 *
 * เรียกได้ 3 ทาง (ล้อ /api/cron/subscriptions-renewals):
 *   1. Vercel Cron (header x-vercel-cron) — ตั้งใน vercel.json
 *   2. CRON_SECRET (Authorization: Bearer <CRON_SECRET>)
 *   3. คนคุมบอร์ดกดทดสอบเอง (guardApi work_board.dispatch) — ?dry=1 = ดูผลเฉย ๆ ไม่ส่งจริง
 *
 * ช่องทางแจ้ง: กระดิ่ง (กฎ wo.due_soon → ผู้จัดการ+แอดมิน) + LINE กลุ่มผลิต (แม่แบบ wo_due_soon)
 * ไม่ต้อง dedupe — cron วันละครั้ง · best-effort ทั้งหมด ล้มแล้วไม่กระทบข้อมูล
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { notifyEvent, pushLineTpl, pushLineText, boardLink } from "@/lib/board-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AHEAD_DAYS = 3;      // เตือนล่วงหน้ากี่วัน (รวมที่เลยกำหนดแล้วเสมอ)
const LINE_MAX = 10;       // ส่ง LINE รายใบสูงสุดกี่ใบ (ที่เหลือสรุปเป็นบรรทัดเดียว กันสแปม)

type DueItem = {
  kind: "wo" | "mo";
  ref: string;             // wo_no / mo_no
  sku: string;
  name: string;
  dept: string;            // โต๊ะ/ช่าง (ใบจ่ายงาน) หรือ "ยังไม่จ่ายงาน" (ใบสั่งผลิต)
  remaining: number;
  due: string;             // YYYY-MM-DD
  days: number;            // ติดลบ = เลยกำหนดมาแล้วกี่วัน
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
/** วันนี้ตามเวลาไทย (UTC+7) — ห้ามใช้ toISOString ตรง ๆ เพราะเซิร์ฟเวอร์เป็น UTC จะร่นไป 1 วัน */
function todayTH(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysDiff = (due: string, today: string) =>
  Math.round((new Date(`${due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
const dueText = (days: number) => (days < 0 ? `เลยกำหนด ${-days} วัน` : days === 0 ? "ครบกำหนดวันนี้" : `อีก ${days} วัน`);
const thDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

async function collect(): Promise<DueItem[]> {
  const admin = supabaseAdmin();
  const today = todayTH();
  const limit = addDays(today, AHEAD_DAYS);
  const out: DueItem[] = [];

  // 1) ใบจ่ายงานที่ยังไม่ส่งครบ
  const { data: wos } = await admin.from("mo_work_orders")
    .select("wo_no, product_sku, product_name, department_name, assignee_name, qty, received_qty, due_date, status")
    .eq("is_active", true).not("due_date", "is", null).lte("due_date", limit).limit(300);
  for (const w of (wos ?? []) as Record<string, unknown>[]) {
    // กรองสถานะใน JS ไม่ใช่ใน query — PostgREST `not.in` จะตัดแถวที่ status เป็น null ทิ้งไปด้วย
    if (["done", "cancelled"].includes(String(w.status ?? ""))) continue;
    const remaining = num(w.qty) - num(w.received_qty);
    if (remaining <= 0) continue;
    const due = String(w.due_date);
    out.push({
      kind: "wo", ref: String(w.wo_no ?? ""), sku: String(w.product_sku ?? "—"), name: String(w.product_name ?? ""),
      dept: String(w.assignee_name || w.department_name || "—"), remaining, due, days: daysDiff(due, today),
    });
  }

  // 2) ใบสั่งผลิตที่ยังเปิดอยู่ (เลยกำหนดแต่ยังไม่ได้จ่ายงาน = หลุดจากชั้นแรก)
  const { data: mos } = await admin.from("manufacturing_orders")
    .select("mo_no, product_sku, product_name, qty, due_date, status")
    .in("status", ["draft", "confirmed", "in_progress"]).not("due_date", "is", null).lte("due_date", limit).limit(300);
  for (const m of (mos ?? []) as Record<string, unknown>[]) {
    const due = String(m.due_date);
    out.push({
      kind: "mo", ref: String(m.mo_no ?? ""), sku: String(m.product_sku ?? "—"), name: String(m.product_name ?? ""),
      dept: "ยังไม่จ่ายงาน", remaining: num(m.qty), due, days: daysDiff(due, today),
    });
  }

  out.sort((a, b) => a.days - b.days || a.ref.localeCompare(b.ref));
  return out;
}

async function send(items: DueItem[]): Promise<{ line: number; bell: boolean }> {
  const admin = supabaseAdmin();
  if (items.length === 0) return { line: 0, bell: false };

  // LINE กลุ่มผลิต — รายใบ (แม่แบบ wo_due_soon ที่เจ้าของแก้เองได้) แล้วสรุปส่วนที่เหลือ
  const head = items.slice(0, LINE_MAX);
  for (const it of head) {
    await pushLineTpl(admin, "production", "wo_due_soon", {
      sku: `${it.sku}${it.name ? ` (${it.name})` : ""}`,
      dept: `${it.dept}${it.kind === "mo" ? ` · ${it.ref}` : ""}`,
      remaining: it.remaining,
      due: thDate(it.due),
      due_text: dueText(it.days),
      link: boardLink("/master/work-board"),
    });
  }
  if (items.length > head.length) {
    await pushLineText(admin, ["production"],
      `…และอีก ${items.length - head.length} รายการที่ใกล้/เกินกำหนด\n🔗 ${boardLink("/master/work-board")}`, "wo_due_soon");
  }

  // กระดิ่ง — สรุปรวมครั้งเดียว (กฎ wo.due_soon)
  const late = items.filter((i) => i.days < 0).length;
  await notifyEvent(admin, "wo.due_soon", "mo_work_orders", null, null, {
    count: String(items.length),
    late: String(late),
    summary: items.slice(0, 8).map((i) => `${i.sku} · ${i.dept} · ${dueText(i.days)}`).join(" | "),
  });

  return { line: Math.min(items.length, LINE_MAX + 1), bell: true };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get("x-vercel-cron") != null;
  const secretOk = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!isVercelCron && !secretOk) {
    const guard = await guardApi(request, "work_board.dispatch");   // คนคุมบอร์ดกดทดสอบเองได้
    if (guard) return guard;
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const items = await collect();
    const sent = dry ? { line: 0, bell: false } : await send(items);
    return NextResponse.json({
      ok: true, dry, today: todayTH(), ahead_days: AHEAD_DAYS,
      found: items.length, overdue: items.filter((i) => i.days < 0).length,
      items: items.slice(0, 50), sent, error: null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
