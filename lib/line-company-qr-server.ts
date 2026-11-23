/**
 * ไลน์บริษัท — สแกน QR แล้วผูกตัวตน (server เท่านั้น) · กติกา QR lib/line-company-qr · คู่มือ docs/line-company-oa.md
 *
 *   ensureCompanyQrState(admin)        เลขรุ่น QR ทุกแบบ (ยังไม่มี = สร้างแล้วบันทึก)
 *   companyQrInfo(admin, code)         หน้าเล็กถามว่า QR นี้คืออะไร (สาธารณะ — ไม่บอกข้อมูลลับ)
 *   submitCompanyQr(admin, input)      ผูกตามชนิด QR: พนักงาน (รหัส+เบอร์) · ลูกค้ารวม (ขอผูกร้าน) · รายร้าน (ผูกทันที)
 *   decideCustomerRequest(admin, ...)  พนักงานยืนยัน/ปฏิเสธคำขอผูกร้าน (จากห้องแชต /chat หรือศูนย์ LINE)
 * QR แอดมินไม่ผ่านที่นี่ — หน้าเล็กพาไปผูกบัญชี ERP (/api/account/line-link · ต้องล็อกอิน ERP)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { APPROVE_CHANNEL_ID } from "@/lib/approval-token";
import { writeAudit } from "@/lib/audit";
import { loadLineConfig } from "@/lib/line-send";
import { registerLineMember, verifyLineIdToken } from "@/lib/line-employee-portal-db";
import { companyBot, saveLineConfigPatch, syncCompanyMenuFor } from "@/lib/line-company-server";
import { resolveLineIdentity } from "@/lib/line-identity";
import { fillQrState, parseQrCode, qrStateComplete, qrStateOf, QR_INVALID_TEXT, type CompanyQrState } from "@/lib/line-company-qr";
import { loadChatSettings } from "@/lib/chat/settings";
import { ingestInbound } from "@/lib/chat/store";
import { lineProfile } from "@/lib/chat/line-server";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

export async function ensureCompanyQrState(admin: Admin): Promise<CompanyQrState> {
  const st = qrStateOf((await loadLineConfig(admin)).company_qr);
  if (qrStateComplete(st)) return st;
  let saved: CompanyQrState = st;
  await saveLineConfigPatch(admin, (cur) => { saved = fillQrState(qrStateOf(cur.company_qr)); return { ...cur, company_qr: saved }; });
  return saved;
}

async function partnerName(admin: Admin, partnerId: string): Promise<string | null> {
  const { data } = await admin.from("partners_v2").select("display_name,code,is_active").eq("id", partnerId).maybeSingle();
  const p = data as Row | null;
  if (!p || p.is_active === false) return null;
  return t(p.display_name) || t(p.code) || null;
}

/** หน้าเล็กถามว่า QR นี้คืออะไร — QR รายร้านบอกชื่อร้าน (ให้ลูกค้าเห็นว่ากำลังผูกร้านไหน) */
export async function companyQrInfo(admin: Admin, code: unknown): Promise<{ kind: string; shop_name: string | null; oa_add_url: string | null; oa_name: string | null }> {
  const cfg = await loadLineConfig(admin);
  const q = parseQrCode(code, qrStateOf(cfg.company_qr));
  if (!q.ok) throw new Error(QR_INVALID_TEXT[q.reason]);
  // ลิงก์เพิ่มเพื่อนไลน์บริษัท (เผื่อ LIFF ยังไม่ได้ตั้งให้ชวนเพิ่มเพื่อนเอง)
  const basic = companyBot(cfg)?.basic_id?.trim() ?? "";
  const oa_add_url = basic ? `https://line.me/R/ti/p/${encodeURIComponent(basic.startsWith("@") ? basic : `@${basic}`)}` : null;
  const oa_name = companyBot(cfg)?.bot_name?.trim() || null;
  if (q.kind === "shop") {
    const name = await partnerName(admin, q.partnerId);
    if (!name) throw new Error("ร้านนี้ปิดใช้งานแล้ว ติดต่อพนักงานขาย");
    return { kind: "shop", shop_name: name, oa_add_url, oa_name };
  }
  return { kind: q.kind, shop_name: null, oa_add_url, oa_name };
}

export type SubmitQrInput = { c?: unknown; id_token?: unknown; employee_code?: unknown; phone?: unknown; shop_name?: unknown; contact_name?: unknown };
export type SubmitQrResult =
  | { kind: "staff"; status: "registered"; hr_confirmed: boolean; name: string }
  | { kind: "customer" | "shop"; status: "pending" | "linked" | "already"; shop_name: string | null };

/** ลูกค้าขอผูกร้าน → ข้อความเข้าห้องแชตรวม ให้พนักงานเห็นและกดยืนยัน (ปิดรับแชตบอทนี้ = ไม่มีห้อง — ยังยืนยันได้ที่ศูนย์ LINE) */
async function postRequestToChat(admin: Admin, lineUserId: string, linkId: string, shop: string, contact: string) {
  try {
    const cfg = await loadLineConfig(admin);
    const bot = companyBot(cfg);
    if (!bot) return;
    const conf = (await loadChatSettings(admin)).line_bots[bot.key];
    if (!conf?.enabled) return;
    await ingestInbound(admin, {
      channel: "line", accountRef: bot.key, externalConvId: lineUserId, kind: "message",
      externalMessageId: `cq:${linkId}:${Date.now()}`, sentAt: new Date().toISOString(), attachments: [],
      text: `[ขอผูกไลน์กับร้าน] ร้าน: ${shop}${contact ? ` · ผู้ติดต่อ: ${contact}` : ""}\nกด "ยืนยันร้าน" ที่ช่องขวาของห้องนี้`,
    }, { brandId: conf.brand_id, getProfile: () => lineProfile(bot.token, lineUserId) });
  } catch (e) {
    console.warn("[line-company-qr] chat", e instanceof Error ? e.message : e);
  }
}

export async function submitCompanyQr(admin: Admin, input: SubmitQrInput): Promise<SubmitQrResult> {
  const st = qrStateOf((await loadLineConfig(admin)).company_qr);
  const q = parseQrCode(input.c, st);
  if (!q.ok) throw new Error(QR_INVALID_TEXT[q.reason]);
  if (q.kind === "admin") throw new Error("QR แอดมินต้องผูกผ่านการเข้าสู่ระบบ ERP");

  if (q.kind === "staff") {
    const r = await registerLineMember({ id_token: input.id_token, employee_code: input.employee_code, phone: input.phone }, { clientId: APPROVE_CHANNEL_ID, via: "company_qr" });
    const m = (r.member ?? null) as { hr_confirmed_at?: string } | null;
    const e = (r.employee ?? {}) as { nickname?: string; first_name?: string };
    return { kind: "staff", status: "registered", hr_confirmed: !!m?.hr_confirmed_at, name: t(e.nickname) || t(e.first_name) };
  }

  // ลูกค้า (QR รวม / QR รายร้าน)
  const profile = await verifyLineIdToken(input.id_token, undefined, APPROVE_CHANNEL_ID);
  const lineUserId = t(profile.sub);
  const who = await resolveLineIdentity(admin, lineUserId);
  if (who.who === "employee" || who.who === "admin") throw new Error("ไลน์นี้ผูกเป็นพนักงานของบริษัทอยู่แล้ว ใช้เป็นไลน์ลูกค้าไม่ได้");
  if (who.who === "blocked") throw new Error("ไลน์นี้ถูกระงับ กรุณาติดต่อบริษัท");
  if (who.who === "customer") {
    if (q.kind === "shop" && who.partnerId !== q.partnerId) throw new Error(`ไลน์นี้ผูกกับร้าน ${who.partnerName} อยู่แล้ว ถ้าต้องการย้ายร้าน ติดต่อพนักงานขาย`);
    return { kind: q.kind, status: "already", shop_name: who.partnerName || null };
  }

  const now = new Date().toISOString();
  const lineFields = { line_display_name: t(profile.name) || null, line_picture_url: t(profile.picture) || null };
  const { data: pend } = await admin.from("line_customer_links").select("id").eq("line_user_id", lineUserId).eq("status", "pending").maybeSingle();
  const pendingId = t((pend as Row | null)?.id);

  if (q.kind === "shop") {
    const shop = await partnerName(admin, q.partnerId);
    if (!shop) throw new Error("ร้านนี้ปิดใช้งานแล้ว ติดต่อพนักงานขาย");
    const body = { ...lineFields, partner_id: q.partnerId, status: "linked", linked_via: "shop_qr", linked_at: now, decided_at: now, decided_by: "สแกน QR รายร้าน", updated_at: now };
    const res = pendingId
      ? await admin.from("line_customer_links").update(body).eq("id", pendingId).select("id").maybeSingle()
      : await admin.from("line_customer_links").insert({ ...body, line_user_id: lineUserId }).select("id").maybeSingle();
    if (res.error) throw new Error(res.error.code === "23505" ? "ไลน์นี้เพิ่งผูกร้านไปแล้ว ปิดแล้วเปิดใหม่อีกครั้ง" : "ผูกร้านไม่สำเร็จ กรุณาลองใหม่");
    const id = t((res.data as Row | null)?.id);
    await writeAudit(admin, { action: "link_line_customer", entityType: "line_customer_links", entityId: id, metadata: { partner_id: q.partnerId, line_user_id: lineUserId, via: "shop_qr" } });
    await syncCompanyMenuFor(admin, lineUserId);
    return { kind: "shop", status: "linked", shop_name: shop };
  }

  const shopName = t(input.shop_name).slice(0, 120);
  const contact = t(input.contact_name).slice(0, 80);
  if (!shopName) throw new Error("กรุณาพิมพ์ชื่อร้านของคุณ");
  const body = { ...lineFields, requested_shop: shopName, contact_name: contact || null, requested_at: now, updated_at: now };
  const res = pendingId
    ? await admin.from("line_customer_links").update(body).eq("id", pendingId).select("id").maybeSingle()
    : await admin.from("line_customer_links").insert({ ...body, line_user_id: lineUserId, status: "pending", linked_via: "customer_qr" }).select("id").maybeSingle();
  if (res.error) throw new Error("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
  const id = t((res.data as Row | null)?.id);
  await writeAudit(admin, { action: "request_line_customer", entityType: "line_customer_links", entityId: id, metadata: { line_user_id: lineUserId, requested_shop: shopName } });
  await postRequestToChat(admin, lineUserId, id, shopName, contact);
  return { kind: "customer", status: "pending", shop_name: shopName };
}

/** คำขอผูกร้านล่าสุดของไลน์นี้ + สถานะผูกปัจจุบัน (ช่องขวาห้องแชต) */
export async function customerLinkOf(admin: Admin, lineUserId: string) {
  const { data, error } = await admin.from("line_customer_links")
    .select("id,status,partner_id,requested_shop,contact_name,requested_at,linked_at,decided_by,partners_v2(display_name,code)")
    .eq("line_user_id", lineUserId).in("status", ["pending", "linked", "blocked"]).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error("โหลดข้อมูลร้านไม่สำเร็จ");
  const r = (data?.[0] ?? null) as Row | null;
  if (!r) return null;
  const p = one(r.partners_v2);
  return {
    id: t(r.id), status: t(r.status), partner_id: t(r.partner_id) || null, partner_name: t(p?.display_name) || t(p?.code) || null,
    requested_shop: t(r.requested_shop) || null, contact_name: t(r.contact_name) || null,
    requested_at: (r.requested_at as string | null) ?? null, linked_at: (r.linked_at as string | null) ?? null, decided_by: t(r.decided_by) || null,
  };
}

/**
 * พนักงานตัดสินคำขอผูกร้าน: approve (เลือกร้าน) · reject (เก็บไว้ ไม่ลบ) · undo (ย้อนกลับเป็นรอยืนยัน — ใช้กับปุ่มย้อนกลับ)
 * ทุกครั้งลง audit + สลับเมนูในไลน์ให้ทันที
 */
export async function decideCustomerRequest(admin: Admin, input: { link_id: string; action: "approve" | "reject" | "undo"; partner_id?: string | null; actor: string | null; actorId?: string | null }) {
  if (!/^[0-9a-f-]{36}$/i.test(input.link_id)) throw new Error("รายการไม่ถูกต้อง");
  const { data: before, error } = await admin.from("line_customer_links").select("*").eq("id", input.link_id).maybeSingle();
  if (error) throw new Error("โหลดรายการไม่สำเร็จ กรุณาลองใหม่");
  if (!before) throw new Error("ไม่พบคำขอนี้");
  const b = before as Row;
  const now = new Date().toISOString();
  let patch: Row;
  if (input.action === "approve") {
    if (t(b.status) !== "pending") throw new Error("คำขอนี้ถูกตัดสินไปแล้ว — โหลดใหม่");
    const pid = t(input.partner_id);
    if (!/^[0-9a-f-]{36}$/i.test(pid)) throw new Error("เลือกร้านก่อน");
    if (!(await partnerName(admin, pid))) throw new Error("ร้านนี้ปิดใช้งานแล้ว");
    patch = { status: "linked", partner_id: pid, linked_at: now, decided_at: now, decided_by: input.actor };
  } else if (input.action === "reject") {
    if (t(b.status) !== "pending") throw new Error("คำขอนี้ถูกตัดสินไปแล้ว — โหลดใหม่");
    patch = { status: "rejected", decided_at: now, decided_by: input.actor };
  } else {
    if (!["linked", "rejected"].includes(t(b.status)) || !t(b.requested_shop)) throw new Error("ย้อนกลับไม่ได้");
    patch = { status: "pending", partner_id: null, decided_at: null, decided_by: null };
  }
  const { error: e2 } = await admin.from("line_customer_links").update({ ...patch, updated_at: now }).eq("id", input.link_id);
  if (e2) throw new Error(e2.code === "23505" ? "ไลน์นี้มีคำขอ/ร้านอื่นค้างอยู่แล้ว" : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) if (b[k] !== patch[k]) changes[k] = { from: b[k] ?? null, to: patch[k] ?? null };
  await writeAudit(admin, {
    action: `${input.action}_line_customer_request`, entityType: "line_customer_links", entityId: input.link_id,
    actorId: input.actorId ?? null, actorName: input.actor, metadata: { requested_shop: t(b.requested_shop), changes },
  });
  await syncCompanyMenuFor(admin, t(b.line_user_id));
  return { ok: true };
}
