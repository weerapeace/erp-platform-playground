/**
 * ✨ AI แตกงาน — POST /api/team-plan/ai-split  body { text }
 *   วางข้อความยาว (แชทลูกค้า / โน้ตประชุม) → AI แยกเป็นงานทีละข้อ + เดาความด่วน / วันกำหนด / คนรับผิดชอบ (จากรายชื่อทีม)
 *   → { tasks: [{ title, priority, due_date, due_time, who_id, who_name, note }] } — ยังไม่บันทึก หน้าเว็บให้คนตรวจก่อนกดเพิ่ม
 * สิทธิ์: tasks.create + ai.caption (มีค่าใช้จ่ายต่อครั้ง · ≈ ไม่ถึง 1 บาท) · audit ai_team_plan_split
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat } from "@/lib/paid-services-server";
import { todayBangkok } from "@/lib/date";
import { asPriority } from "@/lib/team-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_TEXT = 6000;
const MAX_TASKS = 20;
const TH_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: { text?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (text.length < 5) return NextResponse.json({ error: "วางข้อความที่จะให้แตกเป็นงานก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: people } = await admin.from("user_profiles").select("id, display_name, username").eq("active", true).limit(200);
  const team = ((people ?? []) as { id: string; display_name: string | null; username: string | null }[])
    .map((p) => ({ id: p.id, name: (p.display_name || p.username || "").trim() })).filter((p) => p.name);
  const today = todayBangkok();
  const dow = TH_DOW[new Date(`${today}T00:00:00Z`).getUTCDay()];

  let out: Record<string, unknown>;
  try {
    out = await aiChat("ai.team_split", 
      "คุณคือผู้ช่วยวางแผนงานของทีมออกแบบ/ผลิตสินค้า แยกข้อความเป็นงานที่ต้องทำทีละข้อ ตอบเป็น JSON ตามรูปแบบที่ขอเท่านั้น",
      [{ type: "text", text: [
        `วันนี้คือวัน${dow}ที่ ${today} (เวลาไทย)`,
        `รายชื่อทีม (ใช้ชื่อตามนี้เท่านั้น): ${team.map((p) => p.name).join(", ") || "-"}`,
        "",
        "แยกข้อความด้านล่างเป็นงานที่ต้องทำ (action item) — ข้ามคำทักทาย/เรื่องที่ไม่ต้องทำอะไร · ชื่องานสั้น ขึ้นต้นด้วยกริยา (เช่น สั่งผ้า… ส่งแบบ… ถ่ายรูป…)",
        `ตอบ JSON: {"tasks":[{"title":"ชื่องานสั้น","priority":"urgent|high|normal|low","due_date":"YYYY-MM-DD หรือ null","due_time":"HH:MM หรือ null","who":"ชื่อจากรายชื่อทีม หรือ null","note":"รายละเอียดสั้น ๆ หรือ null"}]}`,
        "- priority: urgent = ด่วนมาก/วันนี้/ลูกค้ารอ · high = ด่วน/ภายใน 1-2 วัน · normal = ปกติ · low = ไม่รีบ",
        "- due_date: คิดจากคำในข้อความ เช่น พรุ่งนี้ / ศุกร์นี้ / ภายในสัปดาห์ (= ศุกร์นี้) · ไม่มีบอก = null (ห้ามเดาเอง)",
        `- งานไม่เกิน ${MAX_TASKS} ข้อ`,
        "",
        "ข้อความ:",
        text,
      ].join("\n") }],
      1500,
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI ตอบกลับไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }

  const raw = Array.isArray(out.tasks) ? (out.tasks as Record<string, unknown>[]) : [];
  const byName = (n: unknown) => {
    const q = String(n ?? "").trim().toLowerCase();
    return q ? team.find((p) => p.name.toLowerCase() === q) ?? team.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ?? null : null;
  };
  const tasks = raw.slice(0, MAX_TASKS).map((t) => {
    const who = byName(t.who);
    const d = String(t.due_date ?? "");
    const tm = String(t.due_time ?? "");
    return {
      title: String(t.title ?? "").trim().slice(0, 300),
      priority: asPriority(t.priority),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today ? d : null,
      due_time: /^\d{2}:\d{2}$/.test(tm) ? tm : null,
      who_id: who?.id ?? null, who_name: who?.name ?? null,
      note: typeof t.note === "string" && t.note.trim() && t.note !== "null" ? t.note.trim().slice(0, 500) : null,
    };
  }).filter((t) => t.title);

  await writeAudit(admin, { action: "ai_team_plan_split", entityType: "team_plan", entityId: null, actorId: user.id, actorName: user.email ?? "ผู้ใช้",
    metadata: { chars: text.length, tasks: tasks.length } });
  return NextResponse.json({ tasks, error: null });
}
