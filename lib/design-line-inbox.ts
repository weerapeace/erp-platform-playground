/**
 * ของกลาง — "งานออกแบบจากไลน์" (กล่องพัก design_sheet_line_inbox) · server เท่านั้น
 *
 * เส้นทาง: คนส่งข้อความ + รูปในกลุ่มไลน์ "ส่งงานออกแบบ" (slot design_intake)
 *   → webhook บอทเดิม (/api/china-pay/line-webhook) ส่งมาที่นี่ → รูปเก็บ R2 → ข้อความ/รูปของคนเดิมภายใน 5 นาที = ร่างเดียว
 *   → AI เดา ชื่องาน / แบรนด์ (เทียบรายชื่อแบรนด์ในระบบ) / กำหนดส่ง → บอทตอบกลับในกลุ่ม (reply = ฟรี ไม่นับโควตา)
 *   → ทีมออกแบบเปิดกล่อง "จากไลน์" บน Design Dashboard → กด "เปิดใบงาน" = ฟอร์มสร้างใบงานเดิม กรอกให้แล้ว
 *   → บันทึก = ได้ design_sheets จริง + รูปผูกเข้าใบงาน (ใช้ไฟล์เดิมใน R2 ไม่อัปซ้ำ)
 *
 * กติกา:
 *   - ผล AI เป็นแค่ "ร่าง" — ใบงานจริง (เลข DS) เกิดเมื่อคนกดบันทึกเท่านั้น
 *   - ยืนยันว่ารูปมาจากไลน์จริงด้วยการดึงรูปจากไลน์ด้วยโทเคนบอท (ของกลาง lib/line-intake)
 *   - ข้อความคุยเล่นล้วน (ไม่มีรูป) ที่ AI ว่าไม่ใช่งาน → บอทเงียบ + ย้ายไป "ไม่ใช่งาน" ให้เอง (กู้คืนได้)
 *   - ไม่ push แจ้งเตือน (ประหยัดโควตาไลน์ — เจ้าของเลือก 2026-11-03) ตอบกลับแบบ reply เท่านั้น
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { chatJson, imagesToDataUrls } from "@/lib/ai-caption";
import { appBaseUrl } from "@/lib/app-url";
import { writeAudit } from "@/lib/audit";
import { nameSimilarity } from "@/lib/text-similarity";
import {
  fetchLineImage, isLineMessageId, lineMemberName, lineReply, putLineImage, sha256Hex, type LineEvent,
} from "@/lib/line-intake";
import {
  sanitizeDesignAi, todayBangkok, type InboxBrand, type LineInboxDup, type LineInboxItem, type LineInboxTab,
} from "@/lib/design-line-inbox-shared";

type Admin = ReturnType<typeof supabaseAdmin>;
type Rec = Record<string, unknown>;

export const DESIGN_INTAKE_SLOT = "design_intake";
export const INBOX_TABLE = "design_sheet_line_inbox";
/** ข้อความ/รูปของคนเดิมห่างกันไม่เกินเท่านี้ = งานเดียวกัน */
export const INBOX_WINDOW_SECONDS = 300;
const IMAGE_FOLDER = "design-inbox";
/** โมเดลอ่านข้อความสั่งงาน — งานสั้น ราคาถูก (เปลี่ยนได้ด้วย env) */
export const DESIGN_AI_MODEL = (process.env.OPENAI_DESIGN_MODEL || "gpt-4.1-mini").trim();

const str = (v: unknown) => String(v ?? "").trim();
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
export const inboxLink = () => `${appBaseUrl()}/master/design-dashboard?inbox=1`;

// ---------------------------------------------------------------- AI อ่านข้อความสั่งงาน

type Brand = InboxBrand;

async function loadBrands(admin: Admin): Promise<Brand[]> {
  const { data } = await admin.from("brands").select("id, name, is_active").order("name");
  return ((data ?? []) as Rec[]).filter((b) => b.is_active !== false && str(b.name)).map((b) => ({ id: String(b.id), name: str(b.name) }));
}

function aiSystem(today: string): string {
  return [
    "คุณช่วยทีมออกแบบสินค้า อ่านข้อความที่คนส่งงานในกลุ่มไลน์ แล้วสรุปเป็นใบงานออกแบบ ตอบเป็น JSON เท่านั้น:",
    '{"is_job": boolean, "name": string|null, "brand": string|null, "deadline": "YYYY-MM-DD"|null}',
    "- is_job: เป็นการสั่ง/ขอให้ออกแบบ/แก้แบบ/ทำตัวอย่างงานไหม (คุยเล่น ขอบคุณ รับทราบ ถามเรื่องอื่น = false)",
    "- name: ชื่องานสั้น ๆ ไม่เกิน 60 ตัวอักษร บอกว่าเป็นสินค้าอะไร เช่น \"กระเป๋าผ้าลายแมว\" — ไม่ใส่ชื่อแบรนด์ ไม่ใส่วันที่ · ไม่รู้ = null",
    "- brand: ชื่อแบรนด์ที่ตรงกับรายชื่อแบรนด์ที่ให้ (คัดลอกตัวสะกดจากรายชื่อ) · ไม่ได้พูดถึงหรือไม่ตรงรายชื่อ = null",
    `- deadline: วันที่ต้องส่ง/นัดส่ง/ส่งลูกค้าดู เป็นปีคริสต์ศักราช · วันนี้คือ ${today} · ไม่บอกปี = วันที่ข้างหน้าที่ใกล้ที่สุด · "พรุ่งนี้"/"ศุกร์นี้" ให้คำนวณจากวันนี้ · ไม่มี = null`,
  ].join("\n");
}

/** ให้ AI อ่านร่าง (ข้อความทั้งหมด · ถ้าไม่มีข้อความ ใช้รูปแรกตั้งชื่อ) แล้วบันทึกผลลงร่าง — คืนแถวล่าสุด */
export async function readDraftWithAi(admin: Admin, id: string, imageDataUrl: string | null): Promise<Rec | null> {
  const row = await loadRaw(admin, id);
  if (!row) return null;
  const text = str(row.text_body);
  if (!text && !imageDataUrl && arr(row.image_keys).length) {
    imageDataUrl = (await imagesToDataUrls(arr(row.image_keys).slice(0, 1)))[0] ?? null;   // กด "อ่านใหม่" ร่างที่มีแต่รูป
  }
  if (!text && !imageDataUrl) return row;
  const now = new Date().toISOString();
  try {
    const brands = await loadBrands(admin);
    const content: unknown[] = [{
      type: "text",
      text: `รายชื่อแบรนด์ในระบบ: ${brands.map((b) => b.name).join(", ") || "(ไม่มี)"}\n\n` +
        (text ? `ข้อความที่ส่งมา:\n${text.slice(0, 4000)}` : "ไม่มีข้อความ มีแต่รูป — ถือว่าเป็นงาน (is_job=true) ตั้งชื่องานจากสิ่งที่เห็นในรูป"),
    }];
    if (!text && imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl, detail: "low" } });
    const raw = await chatJson(aiSystem(todayBangkok()), content, 300, DESIGN_AI_MODEL);
    const r = sanitizeDesignAi(raw, brands);
    const { data } = await admin.from(INBOX_TABLE).update({
      ai_name: r.name, ai_brand_id: r.brand_id, ai_deadline: r.deadline,
      ai_is_job: text ? r.is_job : true,   // มีแต่รูป = งานเสมอ
      ai_raw: raw, ai_error: null, ai_read_at: now, updated_at: now,
    }).eq("id", id).select("*").maybeSingle();
    return (data as Rec | null) ?? row;
  } catch (e) {
    const { data } = await admin.from(INBOX_TABLE).update({
      ai_error: String((e as Error)?.message ?? e).slice(0, 300), ai_read_at: now, updated_at: now,
    }).eq("id", id).select("*").maybeSingle();
    return (data as Rec | null) ?? row;
  }
}

async function loadRaw(admin: Admin, id: string): Promise<Rec | null> {
  const { data } = await admin.from(INBOX_TABLE).select("*").eq("id", id).maybeSingle();
  return (data as Rec | null) ?? null;
}

// ---------------------------------------------------------------- LINE

type LineCfg = { token?: string; groups?: Record<string, string> } & Rec;

/** ข้อความ/รูปในกลุ่มส่งงานออกแบบเท่านั้น (สติกเกอร์/ไฟล์อื่นไม่รับ) */
export function pickDesignEvents(cfg: LineCfg, events: LineEvent[]): LineEvent[] {
  const gid = str(cfg.groups?.[DESIGN_INTAKE_SLOT]);
  if (!gid || !str(cfg.token)) return [];
  return events.filter((e) =>
    e.type === "message" && e.source?.groupId === gid && isLineMessageId(e.message?.id) &&
    (e.message?.type === "image" || (e.message?.type === "text" && !!str(e.message?.text))));
}

/** ตีตกเงียบ (ข้อความคุยเล่นที่ AI ว่าไม่ใช่งาน) — กู้คืนได้ที่แท็บ "ไม่ใช่งาน" */
async function autoReject(admin: Admin, id: string): Promise<void> {
  const now = new Date().toISOString();
  await admin.from(INBOX_TABLE).update({
    status: "rejected", rejected_by: "AI", rejected_at: now, reject_reason: "AI: ไม่ใช่ข้อความสั่งงาน", updated_at: now,
  }).eq("id", id).eq("status", "pending");
  await writeAudit(admin, {
    action: "reject", entityType: INBOX_TABLE, entityId: id, actorId: null, actorName: "AI",
    metadata: { actor: "AI", reason: "not_job", auto: true },
  });
}

const thaiDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

/** ข้อความตอบกลับในกลุ่ม (ข้อความเดียว) */
export function buildDesignReply(row: Rec, brandName: string | null): string {
  const n = arr(row.image_keys).length;
  const lines = ["📥 รับงานแล้ว (รอทีมออกแบบเปิดใบงาน)"];
  lines.push(str(row.ai_name) || "งานใหม่ (ยังไม่มีชื่อ)");
  lines.push(`แบรนด์ ${brandName ?? "ไม่ระบุ"} · ส่ง ${row.ai_deadline ? thaiDate(str(row.ai_deadline)) : "ไม่ระบุวัน"}`);
  lines.push(`รูป ${n} · ส่งรูป/ข้อความเพิ่มได้ภายใน ${Math.round(INBOX_WINDOW_SECONDS / 60)} นาที`);
  lines.push(`ดูในระบบ 👉 ${inboxLink()}`);
  return lines.join("\n");
}

/**
 * รับข้อความ/รูปจากไลน์ทีละเหตุการณ์ (เรียกจาก webhook ใน after() — ตอบ 200 ให้ไลน์ไปก่อนแล้ว)
 * ตอบกลับเมื่อ: เปิดร่างใหม่ · ร่างที่ AI เคยตีตกกลับมาเป็นงาน · ข้อความแรกตามหลังรูป (สรุปใหม่ให้เห็นชื่อ/แบรนด์/วัน)
 */
export async function handleDesignEvents(admin: Admin, cfg: LineCfg, events: LineEvent[]): Promise<void> {
  const token = str(cfg.token);
  const names = new Map<string, string | null>();
  for (const ev of events) {
    try { await handleOne(admin, token, ev, names); }
    catch (e) { console.error("[design-line-inbox] handle event", e); }
  }
}

async function handleOne(admin: Admin, token: string, ev: LineEvent, names: Map<string, string | null>): Promise<void> {
  const msgId = str(ev.message?.id);
  const groupId = str(ev.source?.groupId);
  const userId = str(ev.source?.userId) || null;
  const isText = ev.message?.type === "text";
  const text = isText ? str(ev.message?.text).slice(0, 4000) : "";

  // ไลน์ส่งซ้ำ (redelivery) — เช็กก่อนดึงรูป (ตัวรวมใน DB กันซ้ำอีกชั้น)
  const { data: seen } = await admin.from(INBOX_TABLE).select("id").filter("line_message_ids", "cs", JSON.stringify([msgId])).limit(1);
  if ((seen ?? []).length > 0) return;

  let key: string | null = null, hash: string | null = null, dataUrl: string | null = null;
  if (!isText) {
    const img = await fetchLineImage(token, msgId);
    if (!img) return;   // ดึงไม่ได้ = ข้อความปลอม/หมดอายุ → ไม่บันทึก
    key = await putLineImage(IMAGE_FOLDER, img.bytes, img.type);
    hash = await sha256Hex(img.bytes);
    dataUrl = `data:${img.type};base64,${Buffer.from(img.bytes).toString("base64")}`;
  }
  const nameKey = userId ?? "";
  if (!names.has(nameKey)) names.set(nameKey, await lineMemberName(token, groupId, userId ?? undefined));
  const senderName = names.get(nameKey) ?? null;
  // ข้อความดึงจากไลน์ซ้ำไม่ได้เหมือนรูป → ยืนยันด้วย "คนส่งเป็นสมาชิกกลุ่มจริง" แทน (ถามไลน์ไม่ได้ = ไม่บันทึก)
  if (isText && !senderName) return;

  const { data, error } = await admin.rpc("design_line_inbox_ingest", {
    p_group: groupId, p_sender: userId, p_sender_name: senderName, p_message_id: msgId,
    p_text: text || null, p_image_key: key, p_image_hash: hash, p_window_seconds: INBOX_WINDOW_SECONDS,
  });
  if (error) { console.error("[design-line-inbox] ingest", error.message); return; }
  const r = ((data ?? []) as Rec[])[0];
  if (!r || r.duplicate) return;
  const id = String(r.inbox_id);
  const isNew = r.is_new === true;
  const hadText = r.had_text === true;

  // AI: ข้อความใหม่ = อ่านทั้งร่างใหม่ · ร่างใหม่ที่มีแต่รูป = ตั้งชื่อจากรูป · รูปที่ต่อท้ายร่างเดิม = ไม่ต้องอ่าน
  const row = isText ? await readDraftWithAi(admin, id, null)
    : isNew ? await readDraftWithAi(admin, id, dataUrl)
    : await loadRaw(admin, id);
  if (!row) return;

  const hasImages = arr(row.image_keys).length > 0;
  if (!hasImages && row.ai_is_job === false) {
    if (row.status === "pending") await autoReject(admin, id);
    return;   // คุยเล่น → บอทเงียบ
  }
  let revived = false;
  if (row.status === "rejected" && row.rejected_by === "AI") {
    const now = new Date().toISOString();
    await admin.from(INBOX_TABLE).update({ status: "pending", rejected_by: null, rejected_at: null, reject_reason: null, updated_at: now })
      .eq("id", id).eq("status", "rejected");
    revived = true;
  }
  if (!(isNew || revived || (isText && !hadText))) return;
  let brandName: string | null = null;
  if (row.ai_brand_id) {
    const { data: b } = await admin.from("brands").select("name").eq("id", String(row.ai_brand_id)).maybeSingle();
    brandName = str((b as Rec | null)?.name) || null;
  }
  await lineReply(token, ev.replyToken, buildDesignReply(row, brandName));
}

// ---------------------------------------------------------------- อัปเอง (สำรอง/ทดสอบ จากหน้าเว็บ)

/** ร่างจากหน้าเว็บ (วางข้อความ + รูปเอง) — ไม่ตีตกอัตโนมัติ เพราะคนวางตั้งใจส่งมาเอง */
export async function createManualDraft(
  admin: Admin,
  input: { text: string; images: { bytes: Uint8Array; type: string }[]; actor: { id: string | null; name: string | null } },
): Promise<Rec | null> {
  const keys: string[] = [], hashes: string[] = [];
  for (const im of input.images) {
    keys.push(await putLineImage(IMAGE_FOLDER, im.bytes, im.type));
    hashes.push(await sha256Hex(im.bytes));
  }
  const text = input.text.trim().slice(0, 4000) || null;
  const { data: ins, error } = await admin.from(INBOX_TABLE).insert({
    source: "manual", status: "pending", text_body: text, image_keys: keys, image_hashes: hashes,
    sender_name: input.actor.name, created_by: input.actor.name,
  }).select("id").single();
  if (error || !ins) throw new Error(error?.message || "บันทึกไม่สำเร็จ");
  const id = String((ins as Rec).id);
  await writeAudit(admin, {
    action: "create", entityType: INBOX_TABLE, entityId: id, actorId: input.actor.id, actorName: input.actor.name,
    metadata: { source: "manual", images: keys.length },
  });
  const first = input.images[0];
  return readDraftWithAi(admin, id, !text && first ? `data:${first.type};base64,${Buffer.from(first.bytes).toString("base64")}` : null);
}

// ---------------------------------------------------------------- รายการในกล่อง

/** แปลงแถว DB → ข้อมูลหน้าจอ (ยังไม่มีป้ายซ้ำ) */
function toItem(r: Rec, brandName: Map<string, string>, sheets: Map<string, { code: string | null; name: string | null }>): LineInboxItem {
  const sheetId = str(r.sheet_id) || null;
  const s = sheetId ? sheets.get(sheetId) : undefined;
  return {
    id: String(r.id), status: r.status as LineInboxItem["status"], source: (r.source === "manual" ? "manual" : "line"),
    text: str(r.text_body) || null, images: arr(r.image_keys).map(imgUrl),
    sender_name: str(r.sender_name) || null, created_at: String(r.created_at), last_message_at: String(r.last_message_at),
    name: str(r.ai_name) || null, brand_id: str(r.ai_brand_id) || null,
    brand_name: r.ai_brand_id ? brandName.get(String(r.ai_brand_id)) ?? null : null,
    deadline: str(r.ai_deadline) || null, ai_error: str(r.ai_error) || null,
    sheet: sheetId ? { id: sheetId, code: s?.code ?? null, name: s?.name ?? null } : null,
    converted_by_name: str(r.converted_by_name) || null, converted_at: str(r.converted_at) || null,
    rejected_by: str(r.rejected_by) || null, rejected_at: str(r.rejected_at) || null, reject_reason: str(r.reject_reason) || null,
    dups: [],
  };
}

/** จำนวนร่างที่รอเปิดใบงาน (ป้ายบนปุ่ม) */
export async function countPending(admin: Admin): Promise<number> {
  const { count } = await admin.from(INBOX_TABLE).select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

/**
 * รายการตามแท็บ + จำนวนแต่ละแท็บ · แท็บรอเปิดใบงานติดป้าย "อาจซ้ำ"
 *   - รูปเดียวกัน (sha256) กับร่างอื่น/ใบที่เปิดแล้ว ใน 90 วัน
 *   - ชื่อคล้ายใบงานที่สร้างใน 90 วัน (≥ 0.75) หรือร่างอื่นที่ยังรอ (≥ 0.8)
 */
export async function listInbox(admin: Admin, tab: LineInboxTab): Promise<{ items: LineInboxItem[]; counts: Record<LineInboxTab, number> }> {
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  let q = admin.from(INBOX_TABLE).select("*").eq("status", tab).order("last_message_at", { ascending: false }).limit(100);
  if (tab !== "pending") q = q.gte("updated_at", since30);
  const [{ data }, pending, rejected, converted] = await Promise.all([
    q,
    admin.from(INBOX_TABLE).select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from(INBOX_TABLE).select("id", { count: "exact", head: true }).eq("status", "rejected").gte("updated_at", since30),
    admin.from(INBOX_TABLE).select("id", { count: "exact", head: true }).eq("status", "converted").gte("updated_at", since30),
  ]);
  const rows = (data ?? []) as Rec[];
  const counts = { pending: pending.count ?? 0, rejected: rejected.count ?? 0, converted: converted.count ?? 0 };

  const brandIds = [...new Set(rows.map((r) => str(r.ai_brand_id)).filter(Boolean))];
  const brandName = new Map<string, string>();
  if (brandIds.length) {
    const { data: bs } = await admin.from("brands").select("id, name").in("id", brandIds);
    for (const b of (bs ?? []) as Rec[]) brandName.set(String(b.id), str(b.name));
  }

  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const sheets = new Map<string, { code: string | null; name: string | null }>();
  const linkedIds = [...new Set(rows.map((r) => str(r.sheet_id)).filter(Boolean))];
  const recentSheets: { id: string; code: string; name: string }[] = [];
  if (tab === "pending") {
    const { data: ss } = await admin.from("design_sheets").select("id, code, name").eq("is_active", true).gte("created_at", since90).limit(500);
    for (const s of (ss ?? []) as Rec[]) recentSheets.push({ id: String(s.id), code: str(s.code), name: str(s.name) });
  }
  if (linkedIds.length) {
    const { data: ls } = await admin.from("design_sheets").select("id, code, name").in("id", linkedIds);
    for (const s of (ls ?? []) as Rec[]) sheets.set(String(s.id), { code: str(s.code) || null, name: str(s.name) || null });
  }

  const items = rows.map((r) => toItem(r, brandName, sheets));
  if (tab !== "pending" || items.length === 0) return { items, counts };

  // ---- ป้ายอาจซ้ำ ----
  const { data: others } = await admin.from(INBOX_TABLE).select("id, status, ai_name, image_hashes, sheet_id")
    .in("status", ["pending", "converted"]).gte("created_at", since90).limit(500);
  const otherRows = (others ?? []) as Rec[];
  const otherSheetIds = [...new Set(otherRows.map((o) => str(o.sheet_id)).filter((x) => x && !sheets.has(x)))];
  if (otherSheetIds.length) {
    const { data: os } = await admin.from("design_sheets").select("id, code, name").in("id", otherSheetIds);
    for (const s of (os ?? []) as Rec[]) sheets.set(String(s.id), { code: str(s.code) || null, name: str(s.name) || null });
  }
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  for (const it of items) {
    const me = byId.get(it.id)!;
    const myHashes = new Set(arr(me.image_hashes));
    const dups: LineInboxDup[] = [];
    for (const o of otherRows) {
      if (String(o.id) === it.id || !arr(o.image_hashes).some((h) => myHashes.has(h))) continue;
      const sid = str(o.sheet_id) || null;
      const code = sid ? sheets.get(sid)?.code : null;
      dups.push({ kind: "image", label: code ? `รูปเดียวกับใบงาน ${code}` : `รูปเดียวกับร่าง "${str(o.ai_name) || "อีกงาน"}"`, sheet_id: sid, inbox_id: sid ? null : String(o.id) });
      if (dups.length >= 2) break;
    }
    if (it.name) {
      const best = recentSheets
        .map((s) => ({ s, score: nameSimilarity(it.name as string, s.name) }))
        .filter((x) => x.score >= 0.75).sort((a, b) => b.score - a.score)[0];
      if (best && !dups.some((d) => d.sheet_id === best.s.id)) {
        dups.push({ kind: "name", label: `ชื่อคล้ายใบงาน ${best.s.code} "${best.s.name}"`, sheet_id: best.s.id, inbox_id: null });
      }
      const twin = items.find((x) => x.id !== it.id && x.name && nameSimilarity(it.name as string, x.name) >= 0.8);
      if (twin && !dups.some((d) => d.inbox_id === twin.id)) {
        dups.push({ kind: "name", label: `ชื่อคล้ายร่าง "${twin.name}" ในกล่อง`, sheet_id: null, inbox_id: twin.id });
      }
    }
    it.dups = dups;
  }
  return { items, counts };
}

// ---------------------------------------------------------------- เปิดใบงาน / ไม่ใช่งาน / กู้คืน

type Actor = { id: string | null; name: string | null };

/**
 * จองร่างก่อนสร้างใบงาน (กันสองคนกดพร้อมกัน / กดซ้ำ) — pending → converted (ยังไม่มี sheet_id)
 * สร้างใบงานไม่สำเร็จ ให้เรียก releaseInboxClaim คืนสถานะ
 */
export async function claimInboxForSheet(admin: Admin, id: string, actor: Actor): Promise<{ ok: true; row: Rec } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data } = await admin.from(INBOX_TABLE).update({
    status: "converted", converted_at: now, converted_by: actor.id, converted_by_name: actor.name, updated_at: now,
  }).eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (data) return { ok: true, row: data as Rec };
  const cur = await loadRaw(admin, id);
  if (!cur) return { ok: false, error: "ไม่พบงานนี้ในกล่องจากไลน์" };
  if (cur.status === "converted") {
    let code = "";
    if (cur.sheet_id) {
      const { data: s } = await admin.from("design_sheets").select("code").eq("id", String(cur.sheet_id)).maybeSingle();
      code = str((s as Rec | null)?.code);
    }
    return { ok: false, error: `งานนี้เปิดใบงานไปแล้ว${code ? ` (${code})` : ""}${cur.converted_by_name ? ` โดย ${cur.converted_by_name}` : ""}` };
  }
  return { ok: false, error: "งานนี้ถูกย้ายไป \"ไม่ใช่งาน\" แล้ว — กู้คืนก่อนถ้าจะเปิดใบงาน" };
}

export async function releaseInboxClaim(admin: Admin, id: string): Promise<void> {
  await admin.from(INBOX_TABLE).update({
    status: "pending", converted_at: null, converted_by: null, converted_by_name: null, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "converted").is("sheet_id", null);
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** ผูกร่างกับใบงานที่สร้างแล้ว + แนบรูปเข้าใบงาน (ใช้ไฟล์เดิมใน R2 ไม่อัปซ้ำ) + บันทึกประวัติ — คืนจำนวนรูปที่แนบ */
export async function finishInboxConvert(admin: Admin, row: Rec, sheet: { id: string; code: string }, actor: Actor): Promise<number> {
  const id = String(row.id);
  await admin.from(INBOX_TABLE).update({ sheet_id: sheet.id, updated_at: new Date().toISOString() }).eq("id", id);
  const keys = arr(row.image_keys);
  let attached = 0;
  if (keys.length) {
    const { count } = await admin.from("erp_playground_attachments").select("id", { count: "exact", head: true })
      .eq("entity_type", "design_sheet").eq("entity_id", sheet.id);
    const base = count ?? 0;
    const rows = keys.map((k, i) => {
      const ext = (k.split(".").pop() || "jpg").toLowerCase();
      return {
        entity_type: "design_sheet", entity_id: sheet.id, file_name: `line-${i + 1}.${ext}`, file_path: k, public_url: imgUrl(k),
        content_type: MIME[ext] ?? "image/jpeg", size_bytes: null, uploaded_by: actor.name ?? "line",
        is_primary: base + i === 0, sort_order: base + i,
      };
    });
    const { error } = await admin.from("erp_playground_attachments").insert(rows);
    if (error) console.error("[design-line-inbox] attach", error.message);
    else attached = rows.length;
  }
  await writeAudit(admin, {
    action: "convert", entityType: INBOX_TABLE, entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { sheet_id: sheet.id, code: sheet.code, images: attached, source: row.source },
  });
  if (attached) {
    await writeAudit(admin, {
      action: "attach", entityType: "design_sheet", entityId: sheet.id, actorId: actor.id, actorName: actor.name,
      metadata: { from: "line_inbox", inbox_id: id, count: attached },
    });
  }
  return attached;
}

/** ไม่ใช่งาน (กู้คืนได้) */
export async function rejectInbox(admin: Admin, id: string, actor: Actor, reason: string | null): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await admin.from(INBOX_TABLE).update({
    status: "rejected", rejected_by: actor.name ?? "ผู้ใช้", rejected_at: now, reject_reason: reason?.slice(0, 300) || null, updated_at: now,
  }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (!data) return false;
  await writeAudit(admin, { action: "reject", entityType: INBOX_TABLE, entityId: id, actorId: actor.id, actorName: actor.name, metadata: { reason } });
  return true;
}

/** กู้คืนจาก "ไม่ใช่งาน" กลับเข้ากล่องรอเปิดใบงาน */
export async function restoreInbox(admin: Admin, id: string, actor: Actor): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await admin.from(INBOX_TABLE).update({
    status: "pending", rejected_by: null, rejected_at: null, reject_reason: null, updated_at: now,
  }).eq("id", id).eq("status", "rejected").select("id").maybeSingle();
  if (!data) return false;
  await writeAudit(admin, { action: "restore", entityType: INBOX_TABLE, entityId: id, actorId: actor.id, actorName: actor.name, metadata: {} });
  return true;
}
