/**
 * GET /api/calendar/unified?from=YYYY-MM-DD&to=YYYY-MM-DD — ปฏิทินรวมทุกแผนก (แท็บ "รวมทุกปฏิทิน" ใน /calendar)
 *
 * ดึงทุกแหล่งที่ผู้ใช้มีสิทธิ์ดู (lib/unified-calendar CAL_SOURCES.viewPerm · แอดมินผ่านทุกสิทธิ์ = เห็นทุกแหล่ง)
 * คืน CalItem[] (วันที่อยู่ในช่วง + รายการยังไม่ลงวันของแหล่งที่มีกล่อง backlog) + ชื่อผู้รับผิดชอบ
 * อ่านอย่างเดียว — การเลื่อนวันไปเรียก API เดิมของแต่ละโมดูล (สิทธิ์ + audit อยู่ที่นั่น)
 * แหล่งไหนพัง = ข้ามแหล่งนั้น (ไม่ทำให้ทั้งปฏิทินว่าง) แล้วบอกใน error
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { userNames } from "@/lib/record-tasks-server";
import { TEAM_PLAN_MODULE } from "@/lib/team-plan";
import { bkkDate, CAL_SOURCES, isYmd, itemLink, type CalItem, type CalSourceKey, type UnifiedCalendarResponse } from "@/lib/unified-calendar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKLOG_MAX = 300;   // รายการยังไม่ลงวันต่อแหล่ง (กันกล่องบวม)
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function GET(request: NextRequest): Promise<NextResponse<UnifiedCalendarResponse>> {
  const empty = (error: string, status: number) => NextResponse.json({ data: [], people: [], sources: [], error }, { status });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return empty("ต้อง login", 401);
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!isYmd(from) || !isYmd(to) || from > to) return empty("ต้องระบุช่วงวันที่ from/to", 400);

  // สิทธิ์ต่อแหล่ง (ดู + เลื่อน) — ถามครั้งเดียวต่อสิทธิ์ (apiCan มี cache)
  const perms = [...new Set(CAL_SOURCES.flatMap((c) => [c.viewPerm, c.movePerm]).filter((p): p is string => !!p))];
  const okList = await Promise.all(perms.map((p) => apiCan(request, p)));
  const can = new Map(perms.map((p, i) => [p, okList[i]]));
  const visible = CAL_SOURCES.filter((c) => can.get(c.viewPerm));
  if (!visible.length) return empty("ไม่มีสิทธิ์ดูปฏิทินแผนกไหนเลย", 403);

  const admin = supabaseAdmin();
  const fromTs = new Date(`${from}T00:00:00+07:00`).toISOString(), toTs = new Date(`${to}T23:59:59+07:00`).toISOString();
  const inRange = (col: string) => `and(${col}.gte.${from},${col}.lte.${to})`;
  const inRangeTs = (col: string) => `and(${col}.gte.${fromTs},${col}.lte.${toTs})`;

  // แต่ละแหล่ง → แถวดิบ + ตัวแปลงเป็น CalItem
  const loaders: Record<CalSourceKey, () => Promise<Omit<CalItem, "src" | "id" | "link" | "canMove">[]>> = {
    plan: async () => {
      const { data, error } = await admin.from("erp_record_tasks").select("id, title, due_at, assigned_to, status")
        .eq("module_key", TEAM_PLAN_MODULE).eq("record_id", "").neq("status", "resolved")
        .or(`due_at.is.null,${inRangeTs("due_at")}`).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: s(r.title), raw: (r.due_at as string) ?? null, date: bkkDate(r.due_at as string), who: r.assigned_to ? [s(r.assigned_to)] : [] }));
    },
    task: async () => {
      const q = () => admin.from("erp_creative_tasks").select("id, task_no, title, due_date, assignee_id")
        .not("is_active", "is", false).not("status", "in", "(done,cancelled)");
      const [a, b] = await Promise.all([q().gte("due_date", from).lte("due_date", to).limit(2000), q().is("due_date", null).order("updated_at", { ascending: false }).limit(BACKLOG_MAX)]);
      if (a.error || b.error) throw a.error ?? b.error;
      const rows = [...((a.data ?? []) as Row[]), ...((b.data ?? []) as Row[])];
      const { data: asg } = rows.length ? await admin.from("erp_creative_task_assignees").select("task_id, user_id").in("task_id", rows.map((r) => s(r.id)).slice(0, 1000)) : { data: [] };
      const byTask = new Map<string, string[]>();
      for (const x of (asg ?? []) as Row[]) (byTask.get(s(x.task_id)) ?? byTask.set(s(x.task_id), []).get(s(x.task_id))!).push(s(x.user_id));
      return rows.map((r) => ({ rawId: s(r.id), title: `${s(r.task_no)} · ${s(r.title)}`, raw: (r.due_date as string) ?? null, date: bkkDate(r.due_date as string),
        who: [...new Set([...(byTask.get(s(r.id)) ?? []), ...(r.assignee_id ? [s(r.assignee_id)] : [])])] }));
    },
    content: async () => {
      const q = () => admin.from("erp_creative_content").select("id, content_no, title, scheduled_at, assignee_id, assignee_ids")
        .eq("is_active", true).not("is_template", "is", true).not("status", "in", "(published,cancelled)");
      const [a, b] = await Promise.all([q().gte("scheduled_at", fromTs).lte("scheduled_at", toTs).limit(2000), q().is("scheduled_at", null).order("updated_at", { ascending: false }).limit(BACKLOG_MAX)]);
      if (a.error || b.error) throw a.error ?? b.error;
      return [...((a.data ?? []) as Row[]), ...((b.data ?? []) as Row[])].map((r) => ({
        rawId: s(r.id), title: [s(r.content_no), s(r.title)].filter(Boolean).join(" · ") || "คอนเทนต์", raw: (r.scheduled_at as string) ?? null, date: bkkDate(r.scheduled_at as string),
        who: [...new Set([...(Array.isArray(r.assignee_ids) ? (r.assignee_ids as string[]) : []), ...(r.assignee_id ? [s(r.assignee_id)] : [])])] }));
    },
    mo: async () => {
      const { data, error } = await admin.from("manufacturing_orders").select("id, mo_no, product_name, product_sku, due_date")
        .not("is_active", "is", false).not("status", "in", "(done,cancelled)").or(inRange("due_date")).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: `${s(r.mo_no)} · ${s(r.product_name || r.product_sku)}`, raw: (r.due_date as string) ?? null, date: bkkDate(r.due_date as string), who: [] }));
    },
    design: async () => {
      const { data, error } = await admin.from("design_sheets").select("id, code, name, deadline")
        .not("is_active", "is", false).not("status", "in", "(sku_created,cancelled)").or(inRange("deadline")).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: `${s(r.code)} · ${s(r.name)}`, raw: (r.deadline as string) ?? null, date: bkkDate(r.deadline as string), who: [] }));
    },
    billing: async () => {
      const { data, error } = await admin.from("erp_playground_billing_notes").select("id, bill_number, customer_name, due_date")
        .not("status", "in", "(cancelled,paid)").or(inRange("due_date")).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: `วางบิล ${s(r.bill_number)} · ${s(r.customer_name)}`, raw: (r.due_date as string) ?? null, date: bkkDate(r.due_date as string), who: [] }));
    },
    sales: async () => {
      const { data, error } = await admin.from("erp_playground_sales_orders").select("id, so_number, customer_name, expected_ship_date")
        .eq("status", "confirmed").or(inRange("expected_ship_date")).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: `ส่งของ ${s(r.so_number)} · ${s(r.customer_name)}`, raw: (r.expected_ship_date as string) ?? null, date: bkkDate(r.expected_ship_date as string), who: [] }));
    },
    po: async () => {
      const { data, error } = await admin.from("purchase_orders_v2").select("id, po_no, seller_name, expected_date")
        .not("is_active", "is", false).in("status", ["purchase", "partial"]).or(inRange("expected_date")).limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({ rawId: s(r.id), title: `ของเข้า ${s(r.po_no)} · ${s(r.seller_name)}`, raw: (r.expected_date as string) ?? null, date: bkkDate(r.expected_date as string), who: [] }));
    },
  };

  const results = await Promise.allSettled(visible.map((c) => loaders[c.key]()));
  const items: CalItem[] = [];
  const failed: string[] = [];
  results.forEach((res, i) => {
    const c = visible[i];
    if (res.status === "rejected") { failed.push(c.label); console.error("[calendar/unified]", c.key, res.reason); return; }
    const canMove = !!c.movePerm && !!can.get(c.movePerm);
    for (const r of res.value) {
      if (r.date && (r.date < from || r.date > to)) continue;    // timestamp ขอบช่วง (เวลาไทย) ที่หลุดมา
      items.push({ ...r, src: c.key, id: `${c.key}:${r.rawId}`, link: itemLink(c.key, r.rawId), canMove });
    }
  });
  const names = await userNames(admin, items.flatMap((i) => i.who));
  return NextResponse.json({
    data: items,
    people: [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "th")),
    sources: visible.map((c) => ({ key: c.key, canMove: !!c.movePerm && !!can.get(c.movePerm) })),
    error: failed.length ? `โหลดไม่สำเร็จบางแหล่ง: ${failed.join(", ")}` : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
