/**
 * ไลน์บริษัท — ตั้งค่า + ดูคนที่ผูกไลน์ (ส่วน "ไลน์บริษัท" ในศูนย์ LINE · components/line-console/company-section)
 *   GET  → บอทที่เลือกเป็นไลน์บริษัทได้ · บอทที่ใช้อยู่ · สถานะเมนูล่างจอ · พนักงาน/ลูกค้าที่ผูกไลน์
 *   POST → { set_bot: "<key>" | "" }   เลือก/เลิกใช้บอทเป็นไลน์บริษัท (เลือก = เปิดรับแชทลูกค้าเข้าห้องแชทรวมให้ด้วย)
 *          { publish: true }            สร้างเมนูล่างจอ 3 ชุดใหม่ แล้วสลับทุกคนไปใช้
 *          { link_id, action }          ลูกค้าที่ผูกไลน์: unlink (ถอนผูก เก็บประวัติ) · relink (ย้อนการถอนผูก) · block · unblock · rename (+contact_name)
 * สิทธิ์: admin.users (เหมือนศูนย์ LINE) · ทุกการแก้ลง audit (changes: auditDiff)
 * พนักงาน: ปลดผูก/ระงับที่หน้า /payroll/line-members (ของเดิม) — ที่นี่ดูอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { lineBot, lineBots, loadLineConfig, type LineConfig } from "@/lib/line-send";
import { companyBot, companyBotKeyOf, companyMenusOf, syncCompanyMenuFor } from "@/lib/line-company-server";
import { publishCompanyMenus, removeCompanyMenus } from "@/lib/line-company-menu";
import { loadChatSettings, saveChatSettings } from "@/lib/chat/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // สร้างเมนู = วาดรูป 3 ชุด + อัปโหลด + ผูกเมนูให้ทุกคน

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

const botReady = (cfg: LineConfig, key: string) => {
  const b = lineBot(cfg, key);
  const secret = b?.isMain ? t(process.env.LINE_CHANNEL_SECRET) || b?.channel_secret : b?.channel_secret;
  return !!(b && b.token && secret);
};

async function saveCfg(admin: Admin, patch: (cur: LineConfig) => LineConfig): Promise<void> {
  // อ่านค่าล่าสุดก่อนเขียนเสมอ (ศูนย์ LINE / แอปจีน เขียนก้อนเดียวกัน — กันทับค่าคนอื่น)
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  const cur = ((row as { sval?: LineConfig } | null)?.sval ?? {}) as LineConfig;
  const next = patch(cur);
  const id = (row as { id?: string } | null)?.id;
  const { error } = id
    ? await admin.from("china_app_settings").update({ sval: next }).eq("id", id)
    : await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  if (error) throw new Error("บันทึกค่าตั้ง LINE ไม่สำเร็จ กรุณาลองใหม่");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const admin = supabaseAdmin();
  const cfg = await loadLineConfig(admin);
  const key = companyBotKeyOf(cfg);
  const menus = companyMenusOf(cfg);
  const [chat, emp, cus, empTotal] = await Promise.all([
    loadChatSettings(admin),
    admin.from("line_memberships")
      .select("id,status,linked_at,line_display_name,employees(employee_code,first_name,last_name,nickname,employment_status)")
      .in("status", ["linked", "blocked"]).order("linked_at", { ascending: false }).limit(500),
    admin.from("line_customer_links")
      .select("id,status,linked_at,unlinked_at,line_display_name,contact_name,partner_id,partners_v2(display_name,code)")
      .order("linked_at", { ascending: false }).limit(500),
    admin.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "active"),
  ]);
  if (emp.error || cus.error) return NextResponse.json({ error: "โหลดรายชื่อคนที่ผูกไลน์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });

  return NextResponse.json({
    bots: lineBots(cfg).map((b) => ({ key: b.key, label: b.label, basic_id: b.basic_id, ready: botReady(cfg, b.key) })),
    company_bot: key || null,
    company_ready: !!companyBot(cfg),
    menus: { published: !!(menus.guest && menus.employee && menus.customer), published_at: menus.published_at ?? null },
    chat_enabled: key ? chat.line_bots[key]?.enabled === true : false,
    employees_active: empTotal.count ?? null,
    employees: ((emp.data ?? []) as Row[]).map((r) => {
      const e = one(r.employees);
      return {
        id: t(r.id), status: t(r.status), linked_at: r.linked_at ?? null, line_name: t(r.line_display_name),
        code: t(e?.employee_code), name: [t(e?.first_name), t(e?.last_name)].filter(Boolean).join(" ") || t(e?.nickname),
        left_company: t(e?.employment_status) !== "active",
      };
    }),
    customers: ((cus.data ?? []) as Row[]).map((r) => {
      const p = one(r.partners_v2);
      return {
        id: t(r.id), status: t(r.status), linked_at: r.linked_at ?? null, unlinked_at: r.unlinked_at ?? null,
        line_name: t(r.line_display_name), contact_name: t(r.contact_name),
        partner_id: t(r.partner_id), partner_name: t(p?.display_name) || t(p?.code),
      };
    }),
    error: null,
  });
}

type Body = { set_bot?: string; publish?: boolean; link_id?: string; action?: string; contact_name?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? null;
  const admin = supabaseAdmin();
  const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
  let body: Body;
  try { body = await request.json(); } catch { return err("invalid JSON"); }
  const cfg = await loadLineConfig(admin);

  // ---- เลือก/เลิกใช้บอทเป็นไลน์บริษัท ----
  if (typeof body.set_bot === "string") {
    const next = body.set_bot.trim();
    const prev = companyBotKeyOf(cfg);
    if (next === prev) return NextResponse.json({ ok: true, error: null });
    if (next && !lineBot(cfg, next)) return err("ไม่พบบอทนี้");
    if (next && !botReady(cfg, next)) return err("บอทนี้ยังไม่มีโทเคนหรือรหัสลับ (Channel secret) — ตั้งในส่วนบอทด้านบนก่อน");
    // บอทเดิมมีเมนูของไลน์บริษัทอยู่ → ถอดออก (คนจะเห็นเมนูที่ตั้งใน LINE OA Manager แทน)
    const prevBot = prev ? lineBot(cfg, prev) : null;
    if (prevBot?.token) await removeCompanyMenus(prevBot, companyMenusOf(cfg)).catch(() => undefined);
    try {
      await saveCfg(admin, (cur) => {
        const out: LineConfig = { ...cur };
        if (next) out.company_bot = next; else delete out.company_bot;
        delete out.company_menus;   // เมนูผูกกับบอท → เปลี่ยนบอท = ต้องสร้างใหม่
        return out;
      });
    } catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500); }
    // เปิดรับแชทลูกค้าของบอทนี้เข้าห้องแชทรวม (ข้อ ฉ ที่เจ้าของเลือก) — ปิดเองได้ที่หน้าตั้งค่าแชท
    let chatOn = false;
    if (next) {
      const chat = await loadChatSettings(admin);
      if (!chat.line_bots[next]?.enabled) {
        const e2 = await saveChatSettings(admin, { ...chat, line_bots: { ...chat.line_bots, [next]: { enabled: true, brand_id: chat.line_bots[next]?.brand_id ?? null } } });
        chatOn = !e2;
      } else chatOn = true;
    }
    await writeAudit(admin, {
      action: "update", entityType: "line_config", actorId: user?.id ?? null, actorName: actor,
      metadata: { field: "company_bot", changes: auditDiff({ company_bot: prev || null }, { company_bot: next || null }), chat_enabled: chatOn },
    });
    return NextResponse.json({ ok: true, chat_enabled: chatOn, error: null });
  }

  // ---- สร้างเมนูล่างจอชุดใหม่ ----
  if (body.publish) {
    const bot = companyBot(cfg);
    if (!bot) return err("ยังไม่ได้เลือกบอทไลน์บริษัท หรือบอทยังไม่มีโทเคน/รหัสลับ");
    const r = await publishCompanyMenus(admin, cfg, bot, actor);
    if (!r.ok || !r.menus) return err(r.error ?? "สร้างเมนูไม่สำเร็จ", 502);
    const menus = r.menus;
    try { await saveCfg(admin, (cur) => ({ ...cur, company_menus: menus })); }
    catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500); }
    await writeAudit(admin, {
      action: "update", entityType: "line_config", actorId: user?.id ?? null, actorName: actor,
      metadata: { field: "company_menus", bot: bot.key, published: true, linked: r.linked },
    });
    return NextResponse.json({ ok: true, linked: r.linked, error: null });
  }

  // ---- ลูกค้าที่ผูกไลน์ ----
  if (typeof body.link_id === "string") {
    const id = body.link_id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return err("รายการไม่ถูกต้อง");
    const { data: before, error: e1 } = await admin.from("line_customer_links").select("*").eq("id", id).maybeSingle();
    if (e1) return err("โหลดรายการไม่สำเร็จ กรุณาลองใหม่", 503);
    if (!before) return err("ไม่พบรายการนี้", 404);
    const b = before as Row;
    const now = new Date().toISOString();
    let patch: Row;
    switch (body.action) {
      case "unlink": patch = { status: "unlinked", unlinked_at: now }; break;
      case "block": if (t(b.status) === "unlinked") return err("ถอนผูกไปแล้ว ระงับไม่ได้"); patch = { status: "blocked", blocked_at: now }; break;
      case "unblock": if (t(b.status) !== "blocked") return err("รายการนี้ไม่ได้ถูกระงับ"); patch = { status: "linked", blocked_at: null }; break;
      case "relink": if (t(b.status) !== "unlinked") return err("รายการนี้ยังผูกอยู่"); patch = { status: "linked", unlinked_at: null }; break;   // ย้อนการถอนผูก
      case "rename": patch = { contact_name: t(body.contact_name).slice(0, 80) || null }; break;
      default: return err("คำสั่งไม่ถูกต้อง");
    }
    const { error: e2 } = await admin.from("line_customer_links").update({ ...patch, updated_at: now }).eq("id", id);
    if (e2) return err(e2.code === "23505" ? "ไลน์นี้ผูกกับร้านอื่นอยู่แล้ว ย้อนไม่ได้" : "บันทึกไม่สำเร็จ กรุณาลองใหม่", e2.code === "23505" ? 409 : 500);
    await writeAudit(admin, {
      action: body.action === "rename" ? "update" : `${body.action}_line_customer`, entityType: "line_customer_links", entityId: id,
      actorId: user?.id ?? null, actorName: actor,
      metadata: { partner_id: t(b.partner_id), changes: auditDiff(b, patch) },
    });
    if (body.action !== "rename") await syncCompanyMenuFor(admin, t(b.line_user_id));
    return NextResponse.json({ ok: true, error: null });
  }

  return err("คำสั่งไม่ถูกต้อง");
}
