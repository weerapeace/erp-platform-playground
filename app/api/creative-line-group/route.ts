/**
 * ตั้งค่ากลุ่ม LINE สำหรับแจ้งเตือน "งาน Creative" (slot = creative)
 * ใช้บอท/โทเคนเดิมจาก china_app_settings.line_config · webhook (line-webhook) เขียน group_id ล่าสุดให้อัตโนมัติ
 *
 * GET  → { captured, captured_at, current, has_token, using_main }
 * POST { group_id } → บันทึกเป็นกลุ่มงาน (merge groups.creative ไม่ทับ config อื่น)
 * POST { clear: true } → ล้างกลุ่มงาน (กลับไปใช้กลุ่มหลัก group_id)
 * POST { test: true }  → ส่งข้อความทดสอบเข้ากลุ่มงาน (creative || group_id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineCfg = { token?: string; group_id?: string; group_captured_at?: string; groups?: Record<string, string>; templates?: Record<string, string> } & Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: LineCfg }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg };
}

// ฟิลด์ที่ระบบเติมให้ (label/alias) นอกเหนือคอลัมน์จริง — ต่อท้ายให้เลือกได้ด้วย
const TASK_COMPUTED = ["task", "assignees", "due", "brand_label", "campaign_label", "assignee_label", "reviewer_label", "approver_label", "assigned_by_label", "sku_code", "sku_name", "sku_color", "sku_price", "parent_sku_code", "parent_sku_name"];
const SUB_COMPUTED = ["subtask", "task", "submitter", "task_no"];
const HIDE = new Set(["id", "config", "image_sync_targets", "reference_html"]);   // ฟิลด์ที่ไม่เหมาะใส่ข้อความ

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { cfg } = await readCfg(admin);
  const current = cfg.groups?.creative ?? "";
  // รายชื่อตัวแปร = คอลัมน์จริงของตาราง (ดึงสด ไม่ hardcode) + ฟิลด์ label ที่ระบบเติม
  const [{ data: tSample }, { data: sSample }] = await Promise.all([
    admin.from("erp_creative_tasks").select("*").limit(1),
    admin.from("erp_creative_subtasks").select("*").limit(1),
  ]);
  const uniq = (arr: string[]) => [...new Set(arr)].filter((k) => !HIDE.has(k));
  const taskCols = (tSample?.[0] ? Object.keys(tSample[0]) : []) as string[];
  const subCols = (sSample?.[0] ? Object.keys(sSample[0]) : []) as string[];
  return NextResponse.json({
    captured: cfg.group_id ?? "",
    captured_at: cfg.group_captured_at ?? null,
    current,
    using_main: !current && !!cfg.group_id,   // ยังไม่ตั้งกลุ่มงาน → ใช้กลุ่มหลัก
    has_token: !!cfg.token,
    templates: cfg.templates ?? {},
    vars: {
      new_task: uniq([...taskCols, ...TASK_COMPUTED]),
      subtask_submitted: uniq([...subCols, ...SUB_COMPUTED]),
    },
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const admin = supabaseAdmin();
  let body: { group_id?: string; test?: boolean; clear?: boolean; templates?: Record<string, string> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, cfg } = await readCfg(admin);

  // บันทึกแม่แบบข้อความ (merge — เก็บเฉพาะที่ตั้งค่า, ว่าง = ใช้ค่าเริ่มต้น)
  if (body.templates && typeof body.templates === "object") {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.templates)) if (typeof v === "string" && v.trim()) clean[k] = v;
    const next: LineCfg = { ...cfg, templates: clean };
    if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
    else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
    return NextResponse.json({ ok: true, savedTemplates: true, error: null });
  }

  // ส่งข้อความทดสอบเข้ากลุ่มงาน (creative ถ้าตั้งไว้ ไม่งั้นกลุ่มหลัก)
  if (body.test) {
    const target = cfg.groups?.creative || cfg.group_id || "";
    if (!cfg.token || !target) return NextResponse.json({ error: "ยังไม่มีโทเคนบอท หรือยังไม่มีกลุ่มปลายทาง", needConfig: true }, { status: 400 });
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: "🎨 ทดสอบแจ้งเตือนงาน — กลุ่มนี้พร้อมรับแจ้งเตือนงาน Creative แล้ว ✅" }] }),
    });
    if (!r.ok) return NextResponse.json({ error: `ส่งไม่สำเร็จ (${r.status}) — ตรวจว่าบอทอยู่ในกลุ่มนี้ + group id ถูกต้อง` }, { status: 502 });
    return NextResponse.json({ ok: true, sent: true, error: null });
  }

  // ล้างกลุ่มงาน → กลับไปใช้กลุ่มหลัก
  if (body.clear) {
    const groups = { ...(cfg.groups ?? {}) }; delete groups.creative;
    const next: LineCfg = { ...cfg, groups };
    if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
    return NextResponse.json({ ok: true, cleared: true, error: null });
  }

  // บันทึกกลุ่มงาน (merge — ไม่ทับ token/กลุ่มอื่น)
  const gid = String(body.group_id ?? "").trim();
  if (!gid) return NextResponse.json({ error: "ยังไม่มี group id (เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ในกลุ่ม → กดรีเฟรช)" }, { status: 400 });
  const next: LineCfg = { ...cfg, groups: { ...(cfg.groups ?? {}), creative: gid } };
  if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
  else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  return NextResponse.json({ ok: true, saved: gid, error: null });
}
