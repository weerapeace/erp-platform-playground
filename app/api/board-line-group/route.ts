/**
 * ตั้งค่ากลุ่ม LINE แจ้งเตือนบอร์ดจ่ายงาน + โกดัง QC (slot = production / qc)
 * ใช้บอท/โทเคนเดิมจาก china_app_settings.line_config · webhook (china-pay/line-webhook) เขียน group_id ล่าสุดให้อัตโนมัติ
 *
 * GET  → { captured, captured_at, groups:{production,qc}, has_token, templates, events[] }
 * POST { slot, group_id } → บันทึกกลุ่มของ slot (merge ไม่ทับ config อื่น)
 * POST { slot, clear:true } → ล้างกลุ่มของ slot
 * POST { slot, test:true }  → ส่งข้อความทดสอบเข้ากลุ่มของ slot
 * POST { templates } → บันทึกแม่แบบข้อความ (merge)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineCfg = { token?: string; group_id?: string; group_captured_at?: string; groups?: Record<string, string>; templates?: Record<string, string> } & Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

const SLOTS = ["production", "qc"] as const;
// เหตุการณ์ + ตัวแปรที่ใช้ในแม่แบบ (โชว์เป็นชิปให้กด)
const EVENTS: { key: string; label: string; slot: string; vars: string[] }[] = [
  { key: "wo_dispatched", label: "📤 จ่ายงานเข้าโต๊ะ (กลุ่มผลิต)", slot: "production", vars: ["sku", "product_name", "worker", "dept", "qty", "due", "mo_no", "link"] },
  { key: "qc_pending", label: "📥 มีงานรอ QC (กลุ่ม QC)", slot: "qc", vars: ["sku", "product_name", "worker", "qty", "link"] },
  { key: "qc_defect", label: "⚠️ พบของเสีย (กลุ่ม QC)", slot: "qc", vars: ["sku", "product_name", "reason", "qty", "worker", "link"] },
  { key: "wo_due_soon", label: "⏰ งานใกล้/เกินกำหนด (กลุ่มผลิต)", slot: "production", vars: ["sku", "dept", "remaining", "due", "due_text", "link"] },
  { key: "material_request", label: "🙋 ขอเพิ่มวัตถุดิบ (กลุ่มผลิต)", slot: "production", vars: ["name", "actor", "note", "link"] },
  { key: "bom_request", label: "📐 ขอแก้สูตร BOM (กลุ่มผลิต)", slot: "production", vars: ["sku", "product_name", "actor", "lines", "note", "link"] },
];

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: LineCfg }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { cfg } = await readCfg(supabaseAdmin());
  const groups: Record<string, string> = {};
  for (const s of SLOTS) groups[s] = cfg.groups?.[s] ?? "";
  return NextResponse.json({
    captured: cfg.group_id ?? "", captured_at: cfg.group_captured_at ?? null,
    groups, has_token: !!cfg.token, templates: cfg.templates ?? {}, events: EVENTS, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const admin = supabaseAdmin();
  let body: { slot?: string; group_id?: string; test?: boolean; clear?: boolean; templates?: Record<string, string> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, cfg } = await readCfg(admin);
  const save = async (next: LineCfg) => { if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id); else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next }); };

  // บันทึกแม่แบบ (merge — เก็บเฉพาะที่ตั้ง, ว่าง = ใช้ค่าเริ่มต้นในโค้ด)
  if (body.templates && typeof body.templates === "object") {
    const clean: Record<string, string> = { ...(cfg.templates ?? {}) };
    for (const [k, v] of Object.entries(body.templates)) { if (typeof v === "string" && v.trim()) clean[k] = v; else delete clean[k]; }
    await save({ ...cfg, templates: clean });
    return NextResponse.json({ ok: true, savedTemplates: true, error: null });
  }

  const slot = String(body.slot ?? "");
  if (!(SLOTS as readonly string[]).includes(slot)) return NextResponse.json({ error: "slot ไม่ถูกต้อง" }, { status: 400 });

  // ทดสอบส่งเข้ากลุ่มของ slot
  if (body.test) {
    const target = cfg.groups?.[slot] || "";
    if (!cfg.token || !target) return NextResponse.json({ error: "ยังไม่มีโทเคนบอท หรือยังไม่ได้ตั้งกลุ่มนี้", needConfig: true }, { status: 400 });
    const label = slot === "qc" ? "โกดัง QC" : "บอร์ดจ่ายงาน (ผลิต)";
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: `🔔 ทดสอบแจ้งเตือน — กลุ่มนี้พร้อมรับแจ้งเตือน ${label} แล้ว ✅` }] }),
    });
    if (!r.ok) return NextResponse.json({ error: `ส่งไม่สำเร็จ (${r.status}) — ตรวจว่าบอทอยู่ในกลุ่มนี้ + group id ถูกต้อง` }, { status: 502 });
    return NextResponse.json({ ok: true, sent: true, error: null });
  }

  // ล้างกลุ่มของ slot
  if (body.clear) {
    const groups = { ...(cfg.groups ?? {}) }; delete groups[slot];
    await save({ ...cfg, groups });
    return NextResponse.json({ ok: true, cleared: true, error: null });
  }

  // บันทึกกลุ่มของ slot
  const gid = String(body.group_id ?? "").trim();
  if (!gid) return NextResponse.json({ error: "ยังไม่มี group id (เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ในกลุ่ม → กดรีเฟรช)" }, { status: 400 });
  await save({ ...cfg, groups: { ...(cfg.groups ?? {}), [slot]: gid } });
  return NextResponse.json({ ok: true, saved: gid, error: null });
}
