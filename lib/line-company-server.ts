/**
 * ไลน์บริษัท — ส่วนที่คุยกับ LINE จริง (server เท่านั้น) · กติกาอยู่ lib/line-company.ts · คู่มือ docs/line-company-oa.md
 *
 *   companyBot(cfg)              บอทตัวไหนเป็น "ไลน์บริษัท" (ตั้งในศูนย์ LINE → line_config.company_bot · ต้องมีโทเคน+รหัสลับ)
 *   pickCompanyEvents(events)    event แชท 1:1 ที่ไลน์บริษัทดูแล (ข้อความ · เพิ่มเพื่อน · บล็อก · กดปุ่มเมนู)
 *   handleCompanyEvents(...)     แยกคน → ตอบกลับ (reply ฟรี) / สลับเมนู → คืน event ที่ต้องส่งต่อเข้าห้องแชทรวม /chat
 *   syncCompanyMenuFor(...)      ผูกเมนูล่างจอให้คน 1 คนตามตัวตนตอนนี้ (เรียกหลังผูก/ถอนผูก/บล็อก)
 * รูปเมนู + สร้างเมนูชุดใหม่ อยู่ lib/line-company-menu.ts (ใช้ sharp — ไม่ให้ตัวรับไลน์ต้องโหลด)
 *
 * พนักงาน / แอดมิน: บอทตอบเอง ไม่ส่งเข้าห้องแชทรวม (ห้องแชทรวมเป็นของลูกค้า)
 * ลูกค้า / ไม่รู้จัก: ข้อความเข้าห้องแชทรวมให้คนตอบ (บอทไม่แย่งตอบ — โทเคนตอบกลับฟรีเก็บไว้ให้พนักงาน)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { lineReplyMessages } from "@/lib/line-intake";
import { lineBot, lineText, loadLineConfig, type LineBotView, type LineConfig } from "@/lib/line-send";
import { isLineUserId, type LineChatEvent } from "@/lib/chat/line";
import {
  actionAllowed, companyReplyText, companyWelcomeText, employeeChatHint, menuKindFor, normalizeCompanyLayout, parseCompanyPostback,
  type CompanyMenuKind, type CompanyMenuLayout, type PublishedMenuKey,
} from "@/lib/line-company";
import { identityCallName, resolveLineIdentity, type LineIdentity } from "@/lib/line-identity";
import { APPROVE_LIFF_ID } from "@/lib/approval-token";

type Admin = ReturnType<typeof supabaseAdmin>;

/** id เมนูล่างจอที่สร้างไว้ใน LINE (เก็บใน line_config.company_menus) · layout_saved_at = เลย์เอาต์ชุดที่ใช้ตอนสร้าง */
export type CompanyMenuState = Partial<Record<PublishedMenuKey, string>> & { published_at?: string; published_by?: string; layout_saved_at?: string | null };

/** ปุ่มเมนูที่ตั้งในศูนย์ LINE (line_config.company_layout) + ประวัติชุดก่อน ๆ (ย้อนกลับได้ 10 ชุด) */
export type CompanyLayoutState = { layout: CompanyMenuLayout; saved_at: string | null; saved_by: string | null };
export const LAYOUT_HISTORY_MAX = 10;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * บันทึกค่าตั้ง LINE (china_app_settings.line_config) แบบอ่านค่าล่าสุดก่อนเขียนเสมอ
 * (ศูนย์ LINE / แอปจีน / ไลน์บริษัท เขียนก้อนเดียวกัน — กันทับค่าคนอื่น) · ไม่สำเร็จ = โยน error ภาษาคน
 */
export async function saveLineConfigPatch(admin: Admin, patch: (cur: LineConfig) => LineConfig): Promise<void> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  const cur = ((row as { sval?: LineConfig } | null)?.sval ?? {}) as LineConfig;
  const next = patch(cur);
  const id = (row as { id?: string } | null)?.id;
  const { error } = id
    ? await admin.from("china_app_settings").update({ sval: next }).eq("id", id)
    : await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  if (error) throw new Error("บันทึกค่าตั้ง LINE ไม่สำเร็จ กรุณาลองใหม่");
}

export const companyBotKeyOf = (cfg: LineConfig): string => s(cfg.company_bot);
export const companyMenusOf = (cfg: LineConfig): CompanyMenuState =>
  (cfg.company_menus && typeof cfg.company_menus === "object" ? cfg.company_menus : {}) as CompanyMenuState;

const layoutStateOf = (raw: unknown): CompanyLayoutState => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { layout: normalizeCompanyLayout(o.layout), saved_at: s(o.saved_at) || null, saved_by: s(o.saved_by) || null };
};
/** ปุ่มเมนูที่ใช้อยู่ (ยังไม่เคยตั้ง = ค่าตั้งต้นตามผังเจ้าของ) */
export const companyLayoutOf = (cfg: LineConfig): CompanyLayoutState => layoutStateOf(cfg.company_layout);
/** ชุดก่อน ๆ (ใหม่สุดก่อน) */
export const companyLayoutHistoryOf = (cfg: LineConfig): CompanyLayoutState[] =>
  (Array.isArray(cfg.company_layout_history) ? cfg.company_layout_history : []).slice(0, LAYOUT_HISTORY_MAX).map(layoutStateOf);

/** บอทไลน์บริษัท — ยังไม่ตั้ง / บอทถูกลบ / ไม่มีโทเคนหรือรหัสลับ = null (ไลน์บริษัทยังไม่ทำงาน) */
export function companyBot(cfg: LineConfig): LineBotView | null {
  const key = companyBotKeyOf(cfg);
  if (!key) return null;
  const b = lineBot(cfg, key);
  const secret = b?.isMain ? s(process.env.LINE_CHANNEL_SECRET) || b?.channel_secret : b?.channel_secret;
  return b && b.token && secret ? b : null;
}

/** event ที่ไลน์บริษัทใช้ (1:1 เท่านั้น — กลุ่มเป็นของระบบเดิม) */
export type CompanyEvent = LineChatEvent & { postback?: { data?: string } };

export function pickCompanyEvents(events: unknown[]): CompanyEvent[] {
  return (events as CompanyEvent[]).filter((e) =>
    e?.source?.type === "user" && isLineUserId(e.source.userId) &&
    (e.type === "message" || e.type === "follow" || e.type === "unfollow" || e.type === "postback"));
}

// ---------------------------------------------------------------- เมนูล่างจอต่อคน (ไม่กินโควตา)

async function lineCall(token: string, method: "POST" | "DELETE", path: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && !(method === "DELETE" && res.status === 404)) console.warn(`[line-company] ${method} ${path.split("/")[0]} → ${res.status}`);
    return res.ok || (method === "DELETE" && res.status === 404);
  } catch { return false; }
}

/** ผูกเมนูให้คน 1 คน · เมนูกลาง (guest) = ถอดเมนูเฉพาะคนออก แล้ว LINE โชว์เมนูตั้งต้น */
export async function linkCompanyMenu(token: string, menus: CompanyMenuState, lineUserId: string, kind: CompanyMenuKind): Promise<boolean> {
  if (!isLineUserId(lineUserId)) return false;
  if (kind === "guest") return lineCall(token, "DELETE", `user/${lineUserId}/richmenu`);
  const id = menus[kind];   // แอดมิน = หน้าแท็บแรก (แท็บอื่นสลับกันเองในไลน์)
  if (!id) return false;   // ยังไม่ได้สร้างเมนู (กดสร้างในศูนย์ LINE) — ไม่ใช่ข้อผิดพลาด
  return lineCall(token, "POST", `user/${lineUserId}/richmenu/${encodeURIComponent(id)}`);
}

/**
 * ผูกเมนูให้คน 1 คนตามตัวตนล่าสุด — เรียกหลังผูก/ถอนผูก/บล็อก พนักงานหรือลูกค้า
 * best-effort: ไลน์บริษัทยังไม่ตั้ง / LINE ล่ม = ไม่ทำอะไร (คนนั้นจะได้เมนูถูกตอนเพิ่มเพื่อนหรือกดสร้างเมนูใหม่)
 */
export async function syncCompanyMenuFor(admin: Admin, lineUserId: string): Promise<void> {
  try {
    if (!isLineUserId(lineUserId)) return;
    const cfg = await loadLineConfig(admin);
    const bot = companyBot(cfg);
    if (!bot) return;
    const id = await resolveLineIdentity(admin, lineUserId);
    await linkCompanyMenu(bot.token, companyMenusOf(cfg), lineUserId, menuKindFor(id.who));
  } catch (e) {
    console.warn("[line-company] sync menu", e instanceof Error ? e.message : e);
  }
}

/**
 * พนักงานเปลี่ยนสถานะ (ลาออก/ปิดใช้งาน/กลับมาทำงาน) → สลับเมนูล่างจอของไลน์ที่เคยผูกกับคนเหล่านี้
 * การปลดผูกเองทำที่ฐานข้อมูล (trigger employees_left_unlink_line · migration 202612220200) — ที่นี่แค่เปลี่ยนเมนูใน LINE
 * best-effort ไม่โยน error (ไม่ให้การบันทึกลาออกล้มเพราะ LINE)
 */
export async function syncCompanyMenuForEmployees(admin: Admin, employeeIds: string[]): Promise<void> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    const cfg = await loadLineConfig(admin);
    if (!companyBot(cfg)) return;   // ยังไม่ใช้ไลน์บริษัท = ไม่มีเมนูให้สลับ
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await admin.from("line_memberships").select("line_user_id")
      .in("employee_id", ids).or(`status.in.(linked,blocked),unlinked_at.gte.${since}`).limit(200);
    const users = [...new Set(((data ?? []) as { line_user_id?: string }[]).map((r) => String(r.line_user_id ?? "")).filter(isLineUserId))];
    for (const u of users) await syncCompanyMenuFor(admin, u);
  } catch (e) {
    console.warn("[line-company] sync menu (employees)", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- รับ event

/**
 * จัดการ event ของไลน์บริษัท (เรียกใน after() ของตัวรับไลน์กลาง) → คืน event ที่ต้องส่งต่อเข้าห้องแชทรวม
 * แยกคนไม่ได้ (ฐานข้อมูลล่ม) = ไม่ตอบอะไร และส่งข้อความเข้าห้องแชทรวม (ไม่ให้ข้อความลูกค้าหาย · ไม่เปิดข้อมูลผิดคน)
 */
export async function handleCompanyEvents(admin: Admin, cfg: LineConfig, bot: LineBotView, events: CompanyEvent[]): Promise<LineChatEvent[]> {
  const forChat: LineChatEvent[] = [];
  const menus = companyMenusOf(cfg);
  const cache = new Map<string, LineIdentity | null>();
  const who = async (uid: string) => {
    if (!cache.has(uid)) cache.set(uid, await resolveLineIdentity(admin, uid).catch((e) => { console.error("[line-company] identity", e instanceof Error ? e.message : e); return null; }));
    return cache.get(uid) ?? null;
  };

  for (const e of events) {
    const uid = e.source?.userId as string;
    const id = await who(uid);
    if (!id) { if (e.type !== "postback") forChat.push(e); continue; }
    const name = identityCallName(id);

    if (e.type === "follow") {
      await linkCompanyMenu(bot.token, menus, uid, menuKindFor(id.who));
      await lineReplyMessages(bot.token, e.replyToken, [lineText(companyWelcomeText(id.who, name))]);
      // ห้องแชทรวมรู้ว่ามีคนเพิ่มเพื่อน (เฉพาะคนนอก — พนักงาน/แอดมินไม่เข้าห้องแชทลูกค้า) · โทเคนตอบกลับใช้ไปแล้ว → ไม่ส่งต่อ
      if (id.who !== "employee" && id.who !== "admin") forChat.push({ ...e, replyToken: undefined });
      continue;
    }
    if (e.type === "unfollow") {
      if (id.who !== "employee" && id.who !== "admin") forChat.push(e);
      continue;
    }
    if (e.type === "postback") {
      const act = parseCompanyPostback(e.postback?.data);
      if (!act) continue;   // กดแท็บเมนูแอดมิน (cmptab=) / ค่าแปลก = ไม่ตอบ
      // กดจากเมนูเก่าที่ค้าง (เพิ่งถูกถอนผูก/ถอนสิทธิ์แอดมิน) → สลับเมนูให้ถูกชุดเลย
      if (!actionAllowed(id.who, act)) await linkCompanyMenu(bot.token, menus, uid, menuKindFor(id.who));
      const text = companyReplyText(id.who, act, name, APPROVE_LIFF_ID);
      if (text) await lineReplyMessages(bot.token, e.replyToken, [lineText(text)]);
      continue;
    }
    // ข้อความ
    if (id.who === "employee" || id.who === "admin") {
      await lineReplyMessages(bot.token, e.replyToken, [lineText(employeeChatHint(e.message?.type))]);
      continue;
    }
    if (id.who === "blocked" && id.side === "employee") continue;   // พนักงานที่ถูกระงับ/ลาออก: ไม่ตอบ ไม่เข้าห้องแชท
    forChat.push(e);   // ลูกค้า / ไม่รู้จัก → ให้คนตอบในห้องแชทรวม
  }
  return forChat;
}
