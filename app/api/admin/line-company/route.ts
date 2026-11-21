/**
 * ไลน์บริษัท — ตั้งค่า + ดูคนที่ผูกไลน์ (ส่วน "ไลน์บริษัท" ในศูนย์ LINE · components/line-console/company-section)
 *   GET  → บอทที่เลือกเป็นไลน์บริษัทได้ · บอทที่ใช้อยู่ · สถานะเมนูล่างจอ · พนักงาน/ลูกค้าที่ผูกไลน์
 *   POST → { set_bot: "<key>" | "" }   เลือก/เลิกใช้บอทเป็นไลน์บริษัท (เลือก = เปิดรับแชทลูกค้าเข้าห้องแชทรวมให้ด้วย)
 *          { publish: true }            สร้างเมนูล่างจอชุดใหม่ (ยังไม่ผูก/พนักงาน/ลูกค้า/แอดมิน 3 แท็บ) ตามปุ่มที่ตั้งไว้ แล้วสลับทุกคนไปใช้
 *          { save_layout: {...} }       บันทึกปุ่มเมนู 4 ชุด (ชื่อ · คำอธิบาย · ลำดับ · ซ่อน) — ชุดเดิมเก็บเข้าประวัติ (ย้อนได้ 10 ชุด)
 *          { revert_layout: <ลำดับ> }   ย้อนกลับไปใช้ชุดในประวัติ (ชุดปัจจุบันเก็บเข้าประวัติแทน — ย้อนกลับมาอีกได้)
 *          { reset_layout: true }       กลับเป็นค่าตั้งต้นตามผังเจ้าของ (ชุดปัจจุบันเก็บเข้าประวัติ)
 *          { preview: { key, layout } } → รูป PNG ของเมนูหน้านั้น (ดูก่อนบันทึก · ไม่แตะ LINE)
 *          { rotate_qr: "staff"|"customer"|"admin"|"shop" }  เปลี่ยน QR (ใบเก่าใช้ไม่ได้ทันที · shop = QR รายร้านทุกร้าน)
 *          { shop_qr: "<partner_id>" }  → ลิงก์ QR รายร้าน (สแกนแล้วผูกร้านนั้นทันที)
 *          { decide: { link_id, action: approve|reject|undo, partner_id? } }  ตัดสินคำขอผูกร้าน (เหมือนในห้องแชต)
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
import {
  LAYOUT_HISTORY_MAX, saveLineConfigPatch, companyBot, companyBotKeyOf, companyLayoutHistoryOf, companyLayoutOf, companyMenusOf, syncCompanyMenuFor,
  type CompanyLayoutState,
} from "@/lib/line-company-server";
import { publishCompanyMenus, removeCompanyMenus, renderCompanyMenuPng } from "@/lib/line-company-menu";
import { POSTER_QR_KINDS, QR_KINDS, companyQrLink, posterQrCode, rotateQr, shopQrCode, qrStateOf, type CompanyQrKind } from "@/lib/line-company-qr";
import { decideCustomerRequest, ensureCompanyQrState } from "@/lib/line-company-qr-server";
import { DEFAULT_COMPANY_LAYOUT, PUBLISHED_MENU_KEYS, normalizeCompanyLayout, type CompanyMenuLayout, type PublishedMenuKey } from "@/lib/line-company";
import { loadChatSettings, saveChatSettings } from "@/lib/chat/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // สร้างเมนู = วาดรูป 6 หน้า + อัปโหลด + ผูกเมนูให้ทุกคน

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

const botReady = (cfg: LineConfig, key: string) => {
  const b = lineBot(cfg, key);
  const secret = b?.isMain ? t(process.env.LINE_CHANNEL_SECRET) || b?.channel_secret : b?.channel_secret;
  return !!(b && b.token && secret);
};

const saveCfg = saveLineConfigPatch;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const admin = supabaseAdmin();
  const cfg = await loadLineConfig(admin);
  const key = companyBotKeyOf(cfg);
  const menus = companyMenusOf(cfg);
  const [chat, emp, cus, empTotal, qrState] = await Promise.all([
    loadChatSettings(admin),
    admin.from("line_memberships")
      .select("id,status,linked_at,line_display_name,link_method,hr_confirmed_at,employees(employee_code,first_name,last_name,nickname,employment_status)")
      .in("status", ["linked", "blocked"]).order("linked_at", { ascending: false }).limit(500),
    admin.from("line_customer_links")
      .select("id,status,linked_at,unlinked_at,line_display_name,contact_name,partner_id,requested_shop,requested_at,partners_v2(display_name,code)")
      .order("linked_at", { ascending: false }).limit(500),
    admin.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "active"),
    ensureCompanyQrState(admin).catch(() => null),
  ]);
  if (emp.error || cus.error) return NextResponse.json({ error: "โหลดรายชื่อคนที่ผูกไลน์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });

  return NextResponse.json({
    bots: lineBots(cfg).map((b) => ({ key: b.key, label: b.label, basic_id: b.basic_id, ready: botReady(cfg, b.key) })),
    company_bot: key || null,
    company_ready: !!companyBot(cfg),
    menus: { published: PUBLISHED_MENU_KEYS.every((k) => !!menus[k]), published_at: menus.published_at ?? null },
    layout: companyLayoutOf(cfg),
    layout_history: companyLayoutHistoryOf(cfg).map((h) => ({ saved_at: h.saved_at, saved_by: h.saved_by, layout: h.layout })),
    // แก้ปุ่มแล้วยังไม่ได้กดสร้างเมนูใหม่ในไลน์ (คนในไลน์ยังเห็นชุดเก่า)
    layout_pending: PUBLISHED_MENU_KEYS.every((k) => !!menus[k]) && (companyLayoutOf(cfg).saved_at ?? null) !== (menus.layout_saved_at ?? null),
    chat_enabled: key ? chat.line_bots[key]?.enabled === true : false,
    // QR โปสเตอร์ 3 แบบ (ลิงก์หน้าเล็ก LIFF) — null = โหลดเลขรุ่นไม่ได้
    qr: qrState ? Object.fromEntries(POSTER_QR_KINDS.map((k) => {
      const code = posterQrCode(k, qrState);
      return [k, { link: code ? companyQrLink(code) : null, rotated_at: qrState.rotated_at?.[k] ?? null }];
    })) : null,
    shop_qr_rotated_at: qrState?.rotated_at?.shop ?? null,
    employees_active: empTotal.count ?? null,
    employees: ((emp.data ?? []) as Row[]).map((r) => {
      const e = one(r.employees);
      return {
        id: t(r.id), status: t(r.status), linked_at: r.linked_at ?? null, line_name: t(r.line_display_name),
        hr_confirmed: !!r.hr_confirmed_at, link_method: t(r.link_method),
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
        requested_shop: t(r.requested_shop), requested_at: r.requested_at ?? null,
      };
    }),
    error: null,
  });
}

type Body = {
  set_bot?: string; publish?: boolean; link_id?: string; action?: string; contact_name?: string;
  save_layout?: unknown; revert_layout?: number; reset_layout?: boolean; preview?: { key?: string; layout?: unknown };
  rotate_qr?: string; shop_qr?: string; decide?: { link_id?: string; action?: string; partner_id?: string | null };
};

/** เปลี่ยนปุ่มเมนูชุดปัจจุบัน → ชุดเดิมเก็บเข้าประวัติ (ใหม่สุดก่อน · เก็บ 10 ชุด) */
function withLayout(cur: LineConfig, next: CompanyMenuLayout, actor: string | null, dropHistoryIndex?: number): LineConfig {
  const before = companyLayoutOf(cur);
  let history = companyLayoutHistoryOf(cur);
  if (dropHistoryIndex != null) history = history.filter((_, i) => i !== dropHistoryIndex);
  const nextState: CompanyLayoutState = { layout: next, saved_at: new Date().toISOString(), saved_by: actor };
  return { ...cur, company_layout: nextState, company_layout_history: [before, ...history].slice(0, LAYOUT_HISTORY_MAX) };
}

/** สรุปปุ่มที่โชว์ของแต่ละชุด (ใช้ใน audit ให้อ่านง่าย) */
const layoutSummary = (l: CompanyMenuLayout) =>
  Object.fromEntries(Object.entries(l).map(([k, bs]) => [k, bs.filter((b) => !b.hidden).map((b) => b.label).join(" · ")]));

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? null;
  const admin = supabaseAdmin();
  const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
  let body: Body;
  try { body = await request.json(); } catch { return err("invalid JSON"); }

  // ---- รูปตัวอย่างเมนู (ไม่แตะ LINE · ไม่บันทึก) ----
  if (body.preview) {
    const key = String(body.preview.key ?? "") as PublishedMenuKey;
    if (!PUBLISHED_MENU_KEYS.includes(key)) return err("ไม่รู้จักเมนูนี้");
    const png = await renderCompanyMenuPng(key, normalizeCompanyLayout(body.preview.layout)).catch(() => null);
    if (!png) return err("วาดรูปเมนูไม่สำเร็จ ลองใหม่", 500);
    return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  }

  const cfg = await loadLineConfig(admin);

  // ---- QR: เปลี่ยน QR (ใบเก่าใช้ไม่ได้) ----
  if (typeof body.rotate_qr === "string") {
    const kind = body.rotate_qr as CompanyQrKind;
    if (!QR_KINDS.includes(kind)) return err("ไม่รู้จัก QR แบบนี้");
    const before = qrStateOf(cfg.company_qr)[kind] ?? null;
    try { await saveCfg(admin, (cur) => ({ ...cur, company_qr: rotateQr(qrStateOf(cur.company_qr), kind) })); }
    catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500); }
    await writeAudit(admin, {
      action: "rotate_line_company_qr", entityType: "line_config", actorId: user?.id ?? null, actorName: actor,
      metadata: { field: "company_qr", kind, changes: { [kind]: { from: before ? "รุ่นเดิม" : null, to: "รุ่นใหม่" } } },
    });
    return NextResponse.json({ ok: true, error: null });
  }

  // ---- QR รายร้าน ----
  if (typeof body.shop_qr === "string") {
    const pid = body.shop_qr.trim();
    if (!/^[0-9a-f-]{36}$/i.test(pid)) return err("เลือกร้านก่อน");
    const { data: p } = await admin.from("partners_v2").select("display_name,code,is_active").eq("id", pid).maybeSingle();
    const pr = p as Row | null;
    if (!pr || pr.is_active === false) return err("ไม่พบร้านนี้ หรือร้านปิดใช้งานแล้ว", 404);
    const st = await ensureCompanyQrState(admin).catch(() => null);
    const code = st ? shopQrCode(pid, st) : null;
    if (!code) return err("สร้าง QR ไม่สำเร็จ กรุณาลองใหม่", 500);
    return NextResponse.json({ ok: true, link: companyQrLink(code), shop_name: t(pr.display_name) || t(pr.code), error: null });
  }

  // ---- คำขอผูกร้าน (เหมือนในห้องแชต) ----
  if (body.decide && typeof body.decide === "object") {
    const d = body.decide;
    const action = d.action === "approve" || d.action === "reject" || d.action === "undo" ? d.action : null;
    if (!action || !d.link_id) return err("คำสั่งไม่ถูกต้อง");
    try { await decideCustomerRequest(admin, { link_id: d.link_id, action, partner_id: d.partner_id ?? null, actor, actorId: user?.id ?? null }); }
    catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    return NextResponse.json({ ok: true, error: null });
  }

  // ---- ปุ่มเมนู: บันทึก / ย้อนกลับ / ค่าตั้งต้น ----
  if (body.save_layout !== undefined || typeof body.revert_layout === "number" || body.reset_layout) {
    const before = companyLayoutOf(cfg).layout;
    let next: CompanyMenuLayout;
    let drop: number | undefined;
    let what: string;
    if (typeof body.revert_layout === "number") {
      const h = companyLayoutHistoryOf(cfg)[body.revert_layout];
      if (!h) return err("ไม่พบชุดนี้ในประวัติ (อาจมีคนแก้ไปแล้ว) — โหลดหน้าใหม่", 409);
      next = h.layout; drop = body.revert_layout; what = "revert";
    } else if (body.reset_layout) {
      next = normalizeCompanyLayout(DEFAULT_COMPANY_LAYOUT); what = "reset";
    } else {
      next = normalizeCompanyLayout(body.save_layout); what = "save";
    }
    try { await saveCfg(admin, (cur) => withLayout(cur, next, actor, drop)); }
    catch (e) { return err(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", 500); }
    await writeAudit(admin, {
      action: "update", entityType: "line_config", actorId: user?.id ?? null, actorName: actor,
      metadata: { field: "company_layout", op: what, changes: auditDiff(layoutSummary(before), layoutSummary(next)) },
    });
    return NextResponse.json({ ok: true, error: null });
  }

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
      metadata: { field: "company_menus", bot: bot.key, published: true, linked: r.linked, layout: layoutSummary(companyLayoutOf(cfg).layout) },
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
      case "unlink": if (t(b.status) === "pending" || t(b.status) === "rejected") return err("คำขอนี้ยังไม่ได้ผูก — ใช้ปุ่มยืนยัน/ปฏิเสธ"); patch = { status: "unlinked", unlinked_at: now }; break;
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
