/**
 * 📜 สร้างสคริปต์ Google Apps Script ที่เจ้าของวางใน Gmail (script.google.com) — pure (ทดสอบได้)
 *
 * สคริปต์ทำงานบนเซิร์ฟเวอร์ของ Google ไม่ใช่ ERP:
 *   ทุก N นาที ค้นเมลแพลตฟอร์มที่ยังไม่ติดป้าย "ERP-sent" → ส่งเข้า /api/platform-email/inbound (ทีละ 10 ฉบับ)
 *   → ERP ตอบรับ → ติดป้ายเธรดนั้น (ครั้งหน้าไม่ส่งซ้ำ) · ไม่มีเมลใหม่ = ไม่ติดต่อ ERP เลย
 * ติดตั้งครั้งแรก (ฟังก์ชัน setup) = ตั้งเวลา + ทดสอบเชื่อมต่อ + ส่งเมลย้อนหลัง N วัน (ไม่จบใน 4.5 นาที → รอบถัดไปทำต่อเอง)
 *
 * ⚠️ ข้อความที่ส่งให้ ERP ต้องตรงกับที่ /api/platform-email/inbound รับ: { ping } หรือ { messages: [{ id, from, subject, date, html, text }] }
 */

export type AppsScriptOptions = {
  endpoint: string;
  key: string;
  searchQuery: string;
  intervalMin: number;
  backfillDays: number;
  /** วันที่สร้าง (โชว์หัวไฟล์ ไว้ดูว่าเป็นรุ่นไหน) */
  generatedAt?: string;
};

export const DONE_LABEL = "ERP-sent";
export const SCRIPT_BATCH = 10;

export function buildAppsScript(o: AppsScriptOptions): string {
  const minutes = [5, 10, 15, 30, 60].includes(o.intervalMin) ? o.intervalMin : 15;
  const days = Math.min(365, Math.max(1, Math.round(o.backfillDays || 60)));
  return `/**
 * ERP · ส่งเมลออเดอร์จากแพลตฟอร์ม (Shopee / Lazada) เข้า ERP อัตโนมัติ
 * สร้างจากหน้า ERP › ดึงออเดอร์จากเมล${o.generatedAt ? ` เมื่อ ${o.generatedAt}` : ""}
 *
 * ติดตั้ง (ทำครั้งเดียว): เลือกฟังก์ชัน "setup" ในช่องด้านบน → กด ▶ Run → กดอนุญาตสิทธิ์
 * หยุดใช้: เลือกฟังก์ชัน "stop" → กด ▶ Run
 * ทดสอบอย่างเดียว: เลือกฟังก์ชัน "testConnection" → กด ▶ Run → ดูผลที่ "บันทึกการดำเนินการ" ด้านล่าง
 *
 * ⚠️ ไฟล์นี้มีกุญแจลับของ ERP — อย่าแชร์สคริปต์นี้ให้ใคร
 *    ถ้าเผลอแชร์: ไปหน้า ERP กด "สร้างกุญแจใหม่" แล้ววางสคริปต์ใหม่ทับ (กุญแจเก่าจะใช้ไม่ได้ทันที)
 */
const ERP_URL = ${JSON.stringify(o.endpoint)};
const ERP_KEY = ${JSON.stringify(o.key)};
const SEARCH = ${JSON.stringify(o.searchQuery)};
const EVERY_MINUTES = ${minutes};
const BACKFILL_DAYS = ${days};
const LABEL_DONE = ${JSON.stringify(DONE_LABEL)};
const BATCH = ${SCRIPT_BATCH};
const TIME_LIMIT_MS = 270000; // Google ให้รันได้ครั้งละ 6 นาที — เผื่อไว้ หยุดที่ 4.5 นาที รอบหน้าทำต่อ

function setup() {
  stop();
  const t = ScriptApp.newTrigger("sendNewMails").timeBased();
  if (EVERY_MINUTES >= 60) t.everyHours(1); else t.everyMinutes(EVERY_MINUTES);
  t.create();
  if (!testConnection()) return;
  PropertiesService.getScriptProperties().setProperty("backfill_days", String(BACKFILL_DAYS));
  sendNewMails();
  Logger.log("✅ ติดตั้งเสร็จ — จากนี้ระบบจะส่งเมลใหม่เข้า ERP ทุก " + EVERY_MINUTES + " นาที (ปิดคอมได้)");
}

function stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log("⏹ หยุดตั้งเวลาแล้ว");
}

function testConnection() {
  const r = post_({ ping: true });
  Logger.log(r.ok ? "✅ เชื่อมต่อ ERP สำเร็จ" : "❌ เชื่อมต่อ ERP ไม่สำเร็จ: " + r.error);
  return r.ok;
}

/** ตัวที่ตั้งเวลาไว้เรียก — ปกติดูเมล 3 วันล่าสุด · ช่วงติดตั้งใหม่ดูย้อนหลังจนครบ */
function sendNewMails() {
  const props = PropertiesService.getScriptProperties();
  const backfill = Number(props.getProperty("backfill_days") || 0);
  const finished = sendMails_(backfill || 3);
  if (backfill && finished) props.deleteProperty("backfill_days");
}

function sendMails_(days) {
  const started = Date.now();
  const label = GmailApp.getUserLabelByName(LABEL_DONE) || GmailApp.createLabel(LABEL_DONE);
  const cutoff = new Date(started - days * 86400000);
  const query = SEARCH + " -label:" + LABEL_DONE.toLowerCase() + " newer_than:" + days + "d";
  const seen = {};
  let start = 0, sent = 0, failed = 0;
  while (true) {
    if (Date.now() - started > TIME_LIMIT_MS) { Logger.log("⏳ หมดเวลารอบนี้ — ส่งไป " + sent + " ฉบับ รอบหน้าทำต่อ"); return false; }
    const threads = GmailApp.search(query, start, 20);
    if (!threads.length) break;
    // Gmail อาจยังไม่อัปเดตผลค้นหาหลังติดป้าย → เจอแต่เธรดที่ทำแล้ว = ข้ามไปหน้าถัดไป (กันวนส่งซ้ำ)
    const fresh = threads.filter(function (t) { return !seen[t.getId()]; });
    if (!fresh.length) { start += threads.length; continue; }
    for (let i = 0; i < fresh.length; i++) {
      const thread = fresh[i];
      seen[thread.getId()] = true;
      const msgs = thread.getMessages().filter(function (m) { return m.getDate() >= cutoff; });
      let ok = true;
      for (let j = 0; j < msgs.length && ok; j += BATCH) {
        const r = post_({ messages: msgs.slice(j, j + BATCH).map(toPayload_) });
        if (!r.ok) { Logger.log("❌ ส่งไม่สำเร็จ: " + r.error); ok = false; }
        else sent += msgs.slice(j, j + BATCH).length;
      }
      if (ok) thread.addLabel(label);
      else if (++failed >= 3) return false; // ERP ไม่ตอบหลายครั้ง → พักไว้รอบหน้า (เมลที่ยังไม่ติดป้ายจะถูกส่งใหม่)
    }
  }
  if (sent) Logger.log("📨 ส่งเข้า ERP " + sent + " ฉบับ");
  return true;
}

function toPayload_(m) {
  return {
    id: m.getId(),
    from: m.getFrom(),
    subject: m.getSubject(),
    date: m.getDate().toISOString(),
    html: String(m.getBody() || "").slice(0, 200000),
    text: String(m.getPlainBody() || "").slice(0, 50000),
  };
}

function post_(body) {
  try {
    const res = UrlFetchApp.fetch(ERP_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + ERP_KEY },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    let data = {};
    try { data = JSON.parse(res.getContentText()); } catch (e) { /* ไม่ใช่ JSON */ }
    if (code >= 200 && code < 300 && data.ok) return { ok: true, data: data };
    return { ok: false, error: (data && data.error) || ("HTTP " + code) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
`;
}
