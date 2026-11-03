/**
 * /api/design-sheets/line-inbox — กล่อง "งานจากไลน์" ของ Design Dashboard
 *
 * GET  ?tab=pending|rejected|converted → { items, counts }   (ร่างที่บอทรับจากกลุ่มไลน์ส่งงานออกแบบ)
 * GET  ?count=1                        → { pending }          (ป้ายตัวเลขบนปุ่ม — เบา)
 * GET  ?setup=1                        → (แอดมิน) กลุ่มไลน์ที่บอทอยู่ ให้กด "ใช้กลุ่มนี้" (ตั้งผ่าน /api/admin/line-console)
 * POST (multipart: text + images[])    → วางเอง (สำรองตอนไลน์มีปัญหา / ทดสอบ) → AI อ่าน → คืนร่างใหม่
 * PATCH { id, action: reject|restore|reread, reason? }
 * PATCH { id, action: merge, target_inbox_id | target_sheet_id }   "รวมกับงาน…" (ร่างอื่นที่รอ / ใบงานที่มีแล้ว)
 *
 * เปิดใบงานจากร่าง = POST /api/design-sheets พร้อม line_inbox_id (สร้างใบ + แนบรูป + ผูกร่าง ในคำขอเดียว)
 * สิทธิ์: ดู = products.view · แก้/วางเอง = products.edit (เท่าปุ่ม "เพิ่มงาน" เดิม)
 * ของกลางที่ใช้: lib/design-line-inbox · lib/line-intake · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { loadLineGroupSetup } from "@/lib/line-intake";
import {
  DESIGN_INTAKE_SLOT, attachInboxToSheet, countPending, createManualDraft, listInbox, mergeInboxInto, readDraftWithAi,
  rejectInbox, restoreInbox,
} from "@/lib/design-line-inbox";
import type { LineInboxTab } from "@/lib/design-line-inbox-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // วางเอง = รอ AI อ่านจบในคำขอเดียว

const str = (v: unknown) => String(v ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS: LineInboxTab[] = ["pending", "rejected", "converted"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();

  if (sp.has("setup")) {
    const deniedAdmin = await guardApi(request, "admin.users"); if (deniedAdmin) return deniedAdmin;
    // กลุ่มที่ใช้กับระบบอื่นอยู่แล้วทุกกลุ่ม = เตือน (ทุกข้อความในกลุ่มนี้จะเข้ากล่อง)
    return NextResponse.json({ ...(await loadLineGroupSetup(admin, DESIGN_INTAKE_SLOT, "any")), error: null });
  }

  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  if (sp.has("count")) {
    const [pending, cfg] = await Promise.all([
      countPending(admin),
      admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle(),
    ]);
    const groups = ((cfg.data as { sval?: { groups?: Record<string, string> } } | null)?.sval?.groups) ?? {};
    return NextResponse.json({ pending, group_ready: !!str(groups[DESIGN_INTAKE_SLOT]), error: null });
  }
  const tab = (TABS as string[]).includes(str(sp.get("tab"))) ? (str(sp.get("tab")) as LineInboxTab) : "pending";
  try {
    return NextResponse.json({ ...(await listInbox(admin, tab)), error: null });
  } catch (e) {
    return NextResponse.json({ items: [], error: e instanceof Error ? e.message : "โหลดกล่องงานจากไลน์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const text = str(form.get("text")).slice(0, 4000);
  const files = form.getAll("images").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f).slice(0, 6);
  if (!text && files.length === 0) return NextResponse.json({ error: "ใส่ข้อความหรือรูปอย่างน้อย 1 อย่าง" }, { status: 400 });
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return NextResponse.json({ error: `"${f.name}" ไม่ใช่รูป jpg/png/webp` }, { status: 400 });
    if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: `"${f.name}" ใหญ่เกิน 4MB` }, { status: 400 });
  }
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const images = await Promise.all(files.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), type: f.type })));
    const row = await createManualDraft(supabaseAdmin(), { text, images, actor: { id: actor.id, name: actor.name } });
    return NextResponse.json({ id: row?.id ?? null, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { id?: string; action?: string; reason?: string; target_inbox_id?: string; target_sheet_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = str(body.id);
  if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const who = { id: actor.id, name: actor.name };

  if (body.action === "reject") {
    const ok = await rejectInbox(admin, id, who, str(body.reason) || null);
    return ok ? NextResponse.json({ ok: true, error: null }) : NextResponse.json({ error: "งานนี้ไม่ได้อยู่ในสถานะรอเปิดใบงานแล้ว" }, { status: 409 });
  }
  if (body.action === "restore") {
    const ok = await restoreInbox(admin, id, who);
    return ok ? NextResponse.json({ ok: true, error: null }) : NextResponse.json({ error: "กู้คืนไม่ได้ — งานนี้ไม่ได้อยู่ในแท็บไม่ใช่งาน" }, { status: 409 });
  }
  if (body.action === "reread") {
    const row = await readDraftWithAi(admin, id, null);
    if (!row) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
    return NextResponse.json({ ok: true, ai_error: row.ai_error ?? null, error: null });
  }
  if (body.action === "merge") {
    const toInbox = str(body.target_inbox_id), toSheet = str(body.target_sheet_id);
    if (!!toInbox === !!toSheet || !UUID.test(toInbox || toSheet)) return NextResponse.json({ error: "เลือกงานที่จะรวมก่อน" }, { status: 400 });
    const r = toInbox ? await mergeInboxInto(admin, id, toInbox, who) : await attachInboxToSheet(admin, id, toSheet, who);
    return r.ok ? NextResponse.json({ ...r, error: null }) : NextResponse.json({ error: r.error }, { status: 409 });
  }
  return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
}
