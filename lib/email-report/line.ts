/**
 * 🟢 ส่งรายงานเข้ากลุ่ม LINE (ช่องทางที่ 4 ของรายงานอัตโนมัติ · ฝั่งเซิร์ฟเวอร์)
 *
 * ใช้บอทตัวเดียวกับระบบแจ้งเตือน LINE อื่น ๆ (china_app_settings.line_config.token) → เลือกกลุ่มที่บอทอยู่
 * ⚠️ LINE นับโควตา "ต่อคนที่ได้รับ" (ส่งเข้ากลุ่ม 8 คน = 8 · ฟรี 300/เดือน ใช้ร่วมทั้ง ERP) → 1 รายงาน = 1 ข้อความเสมอ
 *    แบบ cards (ค่าเริ่ม · แหล่งที่มี spotlight): การ์ดสรุป + การ์ดสินค้ารูปใหญ่ปัดดู (carousel = ยัง 1 ข้อความ)
 *    แบบ list: Flex กล่องเดียว (หัว + ตัวเลขสรุป + N อันดับ + ปุ่ม "ดูทั้งหมดใน ERP")
 *    ส่ง Flex ไม่ผ่าน → ข้อความล้วนแทน (ยัง 1 ข้อความ) · รูปต้อง JPEG/PNG https → sizedImage (sq=1 = JPEG)
 * ส่งทดสอบ = ส่งเข้ากลุ่มเดียวกัน (มีคำว่า "ทดสอบ" นำหน้า) เพราะ LINE ไม่มีห้องส่วนตัวให้บอททักทุกคน
 * composeLineReport เป็น pure — หน้าตั้งค่าใช้ทำตัวอย่าง (preview?format=line) · ทดสอบที่ lib/__tests__/email-report-platform-sales.test.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeReportLine, type EmailReport, type EmailReportLine, type EmailReportRun } from "@/lib/email-report/shared";
import { sizedImage, statText, type BuiltReport } from "@/lib/email-report/render";
import { loadLineConfig, linePush, lineErrorText } from "@/lib/line-send";

type Admin = ReturnType<typeof supabaseAdmin>;
type Json = Record<string, unknown>;
export type LineResult = { ok: boolean; target: string; fallback: boolean; error: string | null };

/** แถวในกล่อง LINE: ซ้าย = รหัส/ชื่อ/สี · ขวา = จำนวน/ยอด (จากตาราง) หรือป้ายเตือน (จากรายการงาน) */
export type LineRow = { left: string; right: string };
/** การ์ดสินค้า (แบบ cards) — image = ลิงก์ JPEG ที่ LINE โหลด */
export type LineCard = { rank: number; title: string; sub: string; value: string; image: string | null };
export type LineComposed = { altText: string; header: string; sub: string[]; rows: LineRow[]; more: number; link: string | null; linkLabel: string; text: string; flex: Json; style: "cards" | "list"; cards: LineCard[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ประกอบข้อความ LINE จากรายงานที่ประกอบแล้ว (ชุดเดียวกับอีเมล) */
export function composeLineReport(built: BuiltReport, cfg: Pick<EmailReportLine, "max_rows"> & { style?: EmailReportLine["style"] }, opts: { subject: string; test?: boolean }): LineComposed {
  const header = `${opts.test ? "🧪 ทดสอบ · " : ""}${built.heading}`;
  const sub: string[] = [];
  if (built.stats.length) sub.push(built.stats.map((s) => `${s.label} ${statText(s)}${s.hint ? ` (${s.hint})` : ""}`).join(" · "));

  const rows: LineRow[] = [];
  let available = 0;
  if (built.table) {
    const t = built.table;
    const cols = t.columns.filter((c) => c.key !== "img");
    const leftCols = cols.filter((c) => c.align !== "right");
    const rightCols = cols.filter((c) => c.align === "right");
    for (const s of t.sections) for (const row of s.rows) {
      available++;
      if (rows.length >= cfg.max_rows) continue;
      rows.push({
        left: leftCols.map((c) => row.cells[c.key]).filter(Boolean).join(" "),
        right: rightCols.map((c) => row.cells[c.key]).filter(Boolean).join(" · "),
      });
    }
    available = Math.max(available, built.total);
  } else {
    for (const s of built.sections) for (const row of s.rows) {
      if (rows.length >= cfg.max_rows) break;
      rows.push({ left: `${row.code ? `${row.code} ` : ""}${row.title}`, right: row.flag?.text ?? "" });
    }
    available = built.total;
  }
  const more = Math.max(0, available - rows.length);
  const link = built.viewAllLink && /^https:\/\//.test(built.viewAllLink) ? built.viewAllLink : null;
  const linkLabel = "ดูทั้งหมดใน ERP";

  const text = [
    header, ...sub, "",
    ...(built.total === 0 ? [built.emptyText] : rows.map((r, i) => `${i + 1}. ${r.left}${r.right ? ` — ${r.right}` : ""}`)),
    ...(more ? [`…และอีก ${more.toLocaleString("th-TH")} ${built.unit ?? "งาน"}`] : []),
    ...(built.alerts ?? []).map((a) => `⚠️ ${a.text}`),
    ...(link ? ["", `${linkLabel}: ${link}`] : []),
  ].join("\n").slice(0, 4900);

  const txt = (t: string, o: Json = {}): Json => ({ type: "text", text: t || " ", wrap: true, size: "sm", color: "#0f172a", ...o });
  const body: Json[] = [txt(clip(header, 120), { weight: "bold", size: "md" })];
  for (const s of sub) body.push(txt(clip(s, 300), { size: "xs", color: "#64748b", margin: "sm" }));
  body.push({ type: "separator", margin: "md" });
  if (built.total === 0) body.push(txt(built.emptyText, { margin: "md", color: "#059669" }));
  rows.forEach((r, i) => body.push({
    type: "box", layout: "horizontal", margin: "sm", spacing: "sm",
    contents: [txt(clip(`${i + 1}. ${r.left}`, 80), { flex: 5 }), ...(r.right ? [txt(clip(r.right, 40), { flex: 3, align: "end", color: "#334155" })] : [])],
  }));
  if (more) body.push(txt(`…และอีก ${more.toLocaleString("th-TH")} ${built.unit ?? "งาน"}`, { size: "xs", color: "#94a3b8", margin: "md" }));
  for (const a of built.alerts ?? []) body.push(txt(clip(`⚠️ ${a.text}`, 200), { size: "xs", color: "#b45309", margin: "sm" }));
  const footer = link ? { footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "link", height: "sm", action: { type: "uri", label: linkLabel, uri: link } }] } } : {};
  const altText = clip(opts.subject || built.subjectCore, 380);

  // 🖼 แบบการ์ด: การ์ดสรุป + การ์ดสินค้ารูปใหญ่ (สูงสุด 9 · LINE ให้ 12 การ์ด/ข้อความ) — ยังนับ 1 ข้อความ
  const spot = built.spotlight ?? [];
  if ((cfg.style ?? "cards") === "cards" && spot.length && built.total > 0) {
    const cards: LineCard[] = spot.slice(0, Math.min(9, Math.max(1, cfg.max_rows))).map((it) => ({
      rank: it.rank, title: it.title, sub: it.sub, value: it.value, image: sizedImage(it.imageUrl, 600),
    }));
    const restN = Math.max(0, built.total - cards.length);
    const summary: Json = {
      type: "bubble", size: "kilo",
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        txt(clip(header, 120), { weight: "bold", size: "md" }),
        ...built.stats.map((s) => ({ type: "box", layout: "baseline", spacing: "sm", contents: [
          txt(s.label, { size: "xs", color: "#64748b", flex: 3 }),
          txt(`${statText(s)}${s.hint ? ` · ${s.hint}` : ""}`, { size: "xs", flex: 5, weight: s.tone === "good" ? "bold" : "regular", color: s.tone === "good" ? "#059669" : "#0f172a" }),
        ] })),
        { type: "separator", margin: "md" },
        ...(built.alerts ?? []).map((a) => txt(clip(`⚠️ ${a.text}`, 200), { size: "xs", color: "#b45309", margin: "sm" })),
        txt(`ปัดซ้ายดูขายดี ${cards.length} อันดับ →`, { size: "xs", color: "#64748b", margin: "md" }),
        ...(restN ? [txt(`ทั้งหมด ${built.total.toLocaleString("th-TH")} ${built.unit ?? "งาน"} ดูใน ERP`, { size: "xs", color: "#94a3b8" })] : []),
      ] },
      ...footer,
    };
    const productBubble = (c: LineCard): Json => ({
      type: "bubble", size: "kilo",
      hero: c.image
        ? { type: "image", url: c.image, size: "full", aspectRatio: "1:1", aspectMode: "cover" }
        : { type: "box", layout: "vertical", height: "160px", backgroundColor: "#f1f5f9", justifyContent: "center", contents: [txt("ไม่มีรูป", { size: "xs", color: "#94a3b8", align: "center" })] },
      body: { type: "box", layout: "vertical", spacing: "xs", contents: [
        txt(clip(`#${c.rank} ${c.title}`, 60), { weight: "bold" }),
        ...(c.sub ? [txt(clip(c.sub, 80), { size: "xs", color: "#64748b", maxLines: 2 })] : []),
        txt(c.value, { size: "sm", weight: "bold", color: "#059669", margin: "sm" }),
      ] },
    });
    const flex: Json = { type: "carousel", contents: [summary, ...cards.map(productBubble)] };
    return { altText, header, sub, rows, more, link, linkLabel, text, flex, style: "cards", cards };
  }

  const flex: Json = {
    type: "bubble", size: "giga",
    body: { type: "box", layout: "vertical", contents: body },
    ...footer,
  };
  return { altText, header, sub, rows, more, link, linkLabel, text, flex, style: "list", cards: [] };
}

export async function sendReportToLine(admin: Admin, report: Pick<EmailReport, "line">, built: BuiltReport,
  opts: { trigger: EmailReportRun["trigger"]; subject: string }): Promise<LineResult> {
  const cfg = normalizeReportLine(report.line);
  const target = cfg.group_name ? `กลุ่ม ${cfg.group_name}` : "กลุ่ม LINE";
  const fail = (error: string): LineResult => ({ ok: false, target, fallback: false, error });
  const groupId = cfg.group_id;
  if (!groupId) return fail("ยังไม่ได้เลือกกลุ่ม LINE");
  const lineCfg = await loadLineConfig(admin);
  if (!lineCfg.token) return fail("ยังไม่ได้ตั้งบอท LINE (ศูนย์ LINE ในตั้งค่า)");
  const send = (message: Json) => linePush(lineCfg, { to: groupId, messages: [message] });

  const m = composeLineReport(built, cfg, { subject: opts.subject, test: opts.trigger === "test" });
  const flex = await send({ type: "flex", altText: m.altText, contents: m.flex });
  if (flex.ok) return { ok: true, target, fallback: false, error: null };
  // โควตาหมด / โทเคนเสีย / ติดต่อ LINE ไม่ได้ → ส่งข้อความล้วนก็ไม่ผ่านเหมือนกัน
  if (flex.status === 0 || flex.status === 429 || flex.status === 401 || flex.status === 403) return fail(flex.error ?? lineErrorText(flex.status));
  console.error("[email-report/line] flex", flex.status, flex.detail);
  // Flex ไม่ผ่าน (เช่น ข้อความยาว/รูปแบบผิด) → ข้อความล้วน ยังเป็น 1 ข้อความ
  const plain = await send({ type: "text", text: m.text });
  return plain.ok ? { ok: true, target, fallback: true, error: null } : fail(plain.error ?? lineErrorText(plain.status));
}
