/**
 * ไลน์บริษัท — วาดรูปเมนูล่างจอ + สร้างเมนูชุดใหม่ใน LINE (server เท่านั้น · เรียกจากศูนย์ LINE)
 *
 * ทำไมวาดเอง: LINE OA Manager สร้างเมนูได้ แต่ "เมนูต่อคน" ต้องสร้างผ่าน API เท่านั้น
 * วาดด้วย sharp + ฟอนต์ Sarabun (ของกลางเดียวกับรูปรายงาน lib/email-report/image — satori ทำวรรณยุกต์ไทยหาย)
 * ปุ่มมาจากเลย์เอาต์ที่ตั้งในศูนย์ LINE (line_config.company_layout · กติกา lib/line-company)
 *
 * รูปที่ออกแบบเอง (lib/line-company-images): หน้าไหนมีรูปที่จำนวนปุ่มตรง = ใช้รูปนั้น · ไม่ตรง/โหลดไม่ได้ = ใช้รูปที่ระบบวาด
 *
 * publishCompanyMenus: สร้างเมนู 6 หน้าใหม่ (ยังไม่ผูก/พนักงาน/ลูกค้า + แอดมิน 3 แท็บ) → อัปโหลดรูป
 *   → ชี้ชื่อเล่นแท็บ (alias) ไปหน้าใหม่ → ตั้งเมนูกลางเป็นค่าตั้งต้น → ผูกเมนูให้ทุกคนที่ผูกไลน์แล้ว
 *   → ลบเมนูชุดเก่า (ทำทีหลังสุด — พังกลางทาง คนยังเห็นเมนูเก่าอยู่ ไม่ว่างเปล่า)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fontFile } from "@/lib/email-report/image";
import {
  ADMIN_TABS, PUBLISHED_MENU_KEYS, adminTabOf, buttonsKindOf, richMenuBody, richMenuCell, richMenuSize, richMenuTabCell, visibleButtons,
  type CompanyMenuKind, type CompanyMenuLayout, type PublishedMenuKey,
} from "@/lib/line-company";
import { companyLayoutOf, companyMenusOf, type CompanyMenuState } from "@/lib/line-company-server";
import { listLinkedLineUsers } from "@/lib/line-identity";
import type { LineBotView, LineConfig } from "@/lib/line-send";
import { APPROVE_LIFF_ID } from "@/lib/approval-token";
import { r2GetObject } from "@/lib/r2";
import { menuButtonCount, menuImageFits, menuImagesOf } from "@/lib/line-company-images";

type Admin = ReturnType<typeof supabaseAdmin>;
type SharpFn = typeof import("sharp");
const getSharp = async (): Promise<SharpFn> => { const m = (await import("sharp")) as unknown as { default?: SharpFn }; return m.default ?? (m as unknown as SharpFn); };

/** สีหัวปุ่มตามชุดปุ่ม (เขียว LINE = พนักงาน · น้ำเงิน = ลูกค้า · ม่วง = แอดมิน · เทา = ยังไม่ผูก) */
const ACCENT: Record<CompanyMenuKind, string> = { guest: "#64748b", employee: "#06c755", customer: "#2563eb", admin: "#7c3aed" };
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** รูปเมนู 1 หน้า (PNG · 2500 กว้าง) — ปุ่มละช่อง: แถบสีบน + ชื่อปุ่มตัวใหญ่ + คำอธิบายเล็ก · หน้าแอดมินมีแถบแท็บด้านบน */
export async function renderCompanyMenuPng(key: PublishedMenuKey, layout: CompanyMenuLayout): Promise<Buffer> {
  const sharp = await getSharp();
  const [reg, semi] = await Promise.all([fontFile(400), fontFile(600)]);
  const buttons = visibleButtons(layout[buttonsKindOf(key)]);
  const tab = adminTabOf(key);
  const { width, height } = richMenuSize(buttons.length);
  const accent = ACCENT[buttonsKindOf(key)];
  const big = buttons.length <= 4;   // ปุ่มน้อย = ช่องใหญ่ ตัวหนังสือใหญ่ได้

  const shapes: string[] = [];
  const layers: { input: Buffer; left: number; top: number }[] = [];
  const text = async (markup: string, o: { size: number; bold?: boolean; color: string; maxW: number }) => {
    const { data, info } = await sharp({ text: {
      text: `<span foreground="${o.color}">${markup}</span>`, font: `Sarabun${o.bold ? " SemiBold" : ""} ${o.size}`,
      fontfile: o.bold ? semi : reg, rgba: true, dpi: 72, width: o.maxW, align: "centre",
    } }).png().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  };

  if (tab) {
    for (let i = 0; i < ADMIN_TABS.length; i++) {
      const t = ADMIN_TABS[i];
      const c = richMenuTabCell(i);
      const on = t.key === key;
      shapes.push(`<rect x="${c.x + 10}" y="${c.y + 14}" width="${c.width - 20}" height="${c.height - 24}" rx="28" fill="${on ? "#7c3aed" : "#f1f5f9"}"/>`);
      const label = await text(esc(t.label), { size: 80, bold: on, color: on ? "#ffffff" : "#475569", maxW: c.width - 60 });
      layers.push({ input: label.data, left: c.x + Math.round((c.width - label.w) / 2), top: c.y + Math.round((c.height - label.h) / 2) + 4 });
    }
  }

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const c = richMenuCell(i, buttons.length, !!tab);
    shapes.push(`<rect x="${c.x + 14}" y="${c.y + 14}" width="${c.width - 28}" height="${c.height - 28}" rx="36" fill="#f8fafc" stroke="#e2e8f0" stroke-width="4"/>`);
    shapes.push(`<rect x="${c.x + 14}" y="${c.y + 14}" width="${c.width - 28}" height="22" rx="11" fill="${accent}"/>`);
    const title = await text(esc(b.label), { size: big ? 120 : 108, bold: true, color: "#0f172a", maxW: c.width - 140 });
    const hint = b.hint ? await text(esc(b.hint), { size: big ? 76 : 72, color: "#64748b", maxW: c.width - 140 }) : null;
    const gap = hint ? 36 : 0;
    const top = c.y + Math.round((c.height - (title.h + gap + (hint?.h ?? 0))) / 2) + 10;
    layers.push({ input: title.data, left: c.x + Math.round((c.width - title.w) / 2), top });
    if (hint) layers.push({ input: hint.data, left: c.x + Math.round((c.width - hint.w) / 2), top: top + title.h + gap });
  }

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${shapes.join("")}</svg>`);
  return sharp(svg).composite(layers).png({ compressionLevel: 9, palette: true }).toBuffer();
}

// ---------------------------------------------------------------- LINE API (เมนูไม่กินโควตาข้อความ)

async function call(token: string, url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> | null = null;
    try { json = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { /* ไม่ใช่ JSON */ }
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 300) };
  } catch { return { ok: false, status: 0, json: null, text: "" }; }
}

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";
const JSON_HEAD = { "Content-Type": "application/json" };

export type PublishResult = {
  ok: boolean; error: string | null; menus?: CompanyMenuState;
  /** หน้าที่ใช้รูปที่ออกแบบเอง · หน้าที่มีรูปแต่ใช้ไม่ได้ (ปุ่มเปลี่ยนจำนวน/โหลดไม่ได้) เลยใช้รูปที่ระบบวาด */
  images?: { custom: PublishedMenuKey[]; fallback: PublishedMenuKey[] };
  linked?: { admins: number; employees: number; customers: number; failed: number };
};

const lineErr = (step: string, status: number) =>
  status === 401 || status === 403 ? `${step}: โทเคนบอทไลน์บริษัทใช้ไม่ได้ (ตรวจในศูนย์ LINE)` : status === 0 ? `${step}: ติดต่อ LINE ไม่ได้ ลองใหม่` : `${step}: LINE ตอบรหัส ${status}`;

/** ผูกเมนูให้หลายคน (ทีละ 500 ตามที่ LINE รับ) · คืนจำนวนที่ไม่สำเร็จ */
async function bulkLink(token: string, menuId: string | undefined, userIds: string[]): Promise<number> {
  if (!menuId) return userIds.length;
  let failed = 0;
  for (let i = 0; i < userIds.length; i += 500) {
    const part = userIds.slice(i, i + 500);
    const r = await call(token, `${API}/richmenu/bulk/link`, { method: "POST", headers: JSON_HEAD, body: JSON.stringify({ richMenuId: menuId, userIds: part }) });
    if (!r.ok) failed += part.length;
  }
  return failed;
}

/** ชี้ชื่อเล่นแท็บไปเมนูใหม่ (มีอยู่แล้ว = แก้ · ยังไม่มี = สร้าง) */
async function upsertAlias(token: string, alias: string, menuId: string): Promise<boolean> {
  const up = await call(token, `${API}/richmenu/alias/${encodeURIComponent(alias)}`, { method: "POST", headers: JSON_HEAD, body: JSON.stringify({ richMenuId: menuId }) });
  if (up.ok) return true;
  const mk = await call(token, `${API}/richmenu/alias`, { method: "POST", headers: JSON_HEAD, body: JSON.stringify({ richMenuAliasId: alias, richMenuId: menuId }) });
  if (!mk.ok) console.warn("[line-company] alias", alias, up.status, mk.status, mk.text);
  return mk.ok;
}

/**
 * สร้างเมนูล่างจอชุดใหม่ให้บอทไลน์บริษัท (ตามปุ่มที่ตั้งไว้) แล้วสลับทุกคนไปใช้ชุดใหม่
 * ไม่บันทึกค่าตั้งเอง — คืน menus ให้ผู้เรียกบันทึก line_config (ผู้เรียกถือค่าตั้งล่าสุดอยู่ กันทับกัน)
 */
export async function publishCompanyMenus(admin: Admin, cfg: LineConfig, bot: LineBotView, actor: string | null): Promise<PublishResult> {
  const old = companyMenusOf(cfg);
  const { layout, saved_at } = companyLayoutOf(cfg);
  const created: Partial<Record<PublishedMenuKey, string>> = {};
  const images = menuImagesOf(cfg.company_images);
  const custom: PublishedMenuKey[] = []; const fallback: PublishedMenuKey[] = [];
  /** รูปที่ออกแบบเองของหน้านี้ (ใช้ได้) → { bytes, type } · ไม่มี/ไม่ตรง = null */
  const customImage = async (key: PublishedMenuKey): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string } | null> => {
    const img = images.slots[key]?.current;
    if (!img) return null;
    if (!menuImageFits(img, menuButtonCount(key, layout))) { fallback.push(key); return null; }
    try {
      const obj = await r2GetObject(img.r2_key);
      if (!obj) throw new Error("missing");
      const bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
      custom.push(key);
      return { bytes, type: img.r2_key.endsWith(".png") ? "image/png" : "image/jpeg" };
    } catch (e) { console.warn("[line-company] custom image", key, e); fallback.push(key); return null; }
  };
  const rollback = async () => { for (const id of Object.values(created)) if (id) await call(bot.token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }); };

  for (const key of PUBLISHED_MENU_KEYS) {
    const own = await customImage(key);
    const png = own ? null : await renderCompanyMenuPng(key, layout).catch((e) => { console.error("[line-company] render", e); return null; });
    if (!own && !png) { await rollback(); return { ok: false, error: "วาดรูปเมนูไม่สำเร็จ (โหลดฟอนต์ไม่ได้?) ลองใหม่อีกครั้ง" }; }
    const r = await call(bot.token, `${API}/richmenu`, { method: "POST", headers: JSON_HEAD, body: JSON.stringify(richMenuBody(key, layout, { liffId: APPROVE_LIFF_ID })) });
    const id = r.ok ? String(r.json?.richMenuId ?? "") : "";
    if (!id) { await rollback(); console.warn("[line-company] create menu", key, r.status, r.text); return { ok: false, error: lineErr("สร้างเมนู", r.status) }; }
    created[key] = id;
    const up = await call(bot.token, `${DATA_API}/richmenu/${encodeURIComponent(id)}/content`, { method: "POST", headers: { "Content-Type": own?.type ?? "image/png" }, body: own ? new Uint8Array(own.bytes) : new Uint8Array(png as Buffer) });
    if (!up.ok) { await rollback(); console.warn("[line-company] upload image", up.status, up.text); return { ok: false, error: lineErr("อัปโหลดรูปเมนู", up.status) }; }
  }

  // แท็บแอดมินสลับกันด้วยชื่อเล่น (alias) — ต้องชี้ไปหน้าใหม่ก่อนลบหน้าเก่า
  for (const t of ADMIN_TABS) {
    if (!(await upsertAlias(bot.token, t.alias, created[t.key] as string))) { await rollback(); return { ok: false, error: "ตั้งแท็บเมนูแอดมินไม่สำเร็จ ลองใหม่อีกครั้ง" }; }
  }

  const def = await call(bot.token, `${API}/user/all/richmenu/${encodeURIComponent(created.guest as string)}`, { method: "POST" });
  if (!def.ok) { await rollback(); return { ok: false, error: lineErr("ตั้งเมนูตั้งต้น", def.status) }; }

  const people = await listLinkedLineUsers(admin);
  const failed = (await bulkLink(bot.token, created.admin, people.admins))
    + (await bulkLink(bot.token, created.employee, people.employees))
    + (await bulkLink(bot.token, created.customer, people.customers));

  // ลบเมนูชุดเก่าทีหลังสุด (ลบไม่ได้ก็ไม่เป็นไร — LINE เก็บได้ 1,000 ชุด)
  for (const key of PUBLISHED_MENU_KEYS) {
    const id = old[key];
    if (id && id !== created[key]) await call(bot.token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  return {
    ok: true, error: null,
    menus: { ...created, published_at: new Date().toISOString(), published_by: actor ?? undefined, layout_saved_at: saved_at, images_saved_at: images.saved_at },
    images: { custom, fallback },
    linked: { admins: people.admins.length, employees: people.employees.length, customers: people.customers.length, failed },
  };
}

/** ถอดเมนูไลน์บริษัทออกทั้งหมด (ตอนเปลี่ยน/เลิกใช้บอทไลน์บริษัท) — คนจะกลับไปเห็นเมนูที่ตั้งใน LINE OA Manager */
export async function removeCompanyMenus(bot: LineBotView, menus: CompanyMenuState): Promise<void> {
  for (const t of ADMIN_TABS) await call(bot.token, `${API}/richmenu/alias/${encodeURIComponent(t.alias)}`, { method: "DELETE" });
  for (const key of PUBLISHED_MENU_KEYS) {
    const id = menus[key];
    if (id) await call(bot.token, `${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
