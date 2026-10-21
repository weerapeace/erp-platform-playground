// โครงการ์ดบนกระดานแคมเปญ (SKU / Parent / SKU การตลาด / ใบออกแบบ / เทรนด์ / ไฟล์ / คอนเทนต์ / โฟลเดอร์ / ตาราง / งาน) — ฟังก์ชันล้วน · แยกจาก page.tsx (Y1)
import type { SkuPickerValue } from "@/components/pickers";
import type { CreatedTask } from "../../create-task-modal";
import type { AssetRow } from "@/app/api/assets/shared";
import { withImageWidth } from "@/lib/r2-image";
import { getLang } from "@/lib/lang";
import { computeGrid, indexToCol } from "@/lib/canvas-formula";

// แปลข้อความบน "การ์ด" (ฟังก์ชัน module-level ไม่มี hook) — อ่านภาษาปัจจุบันตรง ๆ · การ์ดจะ re-sync ตอนสลับภาษา
export const tt = (th: string, en: string) => (getLang() === "en" ? en : th);

// ตัดชื่อยาวขึ้นบรรทัดใหม่ให้พอดีกล่องการ์ด (Excalidraw ไม่ตัดบรรทัดเอง) — ไทยไม่มีเว้นวรรค→ตัดตามตัวอักษร · อังกฤษ→ตัดที่ช่องว่างถ้าได้ · เกิน maxLines ใส่ …
export function wrapCardText(s: string | null | undefined, maxChars = 26, maxLines = 2): string {
  const str = (s ?? "").trim(); if (!str) return "";
  const lines: string[] = []; let rest = str;
  while (rest.length && lines.length < maxLines) {
    if (rest.length <= maxChars) { lines.push(rest); rest = ""; break; }
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= maxChars * 0.5) cut = maxChars;   // ไม่มีช่องว่างเหมาะ (ไทย) → ตัดตามตัวอักษร
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) lines[lines.length - 1] = (lines[lines.length - 1] ?? "").slice(0, maxChars - 1).trimEnd() + "…";
  return lines.join("\n");
}

export type ParentSkuVal = { id: string; code: string; name: string; image_url: string | null };

// การ์ด "SKU การตลาด" = รุ่น (Parent SKU) + ป้ายการตลาด + ป้ายเสริม + สีที่เหลือ — ข้อมูลจากหน้า /marketing/skus (API /api/marketing/skus)
export type MktSkuVal = { id: string; code: string; name: string; image_url: string | null; label: string | null; label_color: string | null; badges: string[]; sku_active: number; sku_total: number; note: string | null };

// การ์ด SKU บน Excalidraw: รูป(บน) + ข้อความ(ล่าง) ในกล่อง -- customData = snapshot สำหรับ drawer (ดับเบิลคลิกการ์ดเปิด)
export function skuCardSkeleton(s: SkuPickerValue): Record<string, unknown>[] {
  const gid = `sku-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "sku", id: s.id, code: s.code, name: s.name, color: s.color ?? null, price: s.list_price ?? null, image_url: s.image_url ?? null };
  const hasImg = !!s.image_url;
  const priceLine = [s.color, s.list_price != null ? `${Number(s.list_price).toLocaleString()}฿` : null].filter(Boolean).join("  ·  ");
  const text = [`📦 ${s.code}`, wrapCardText(s.name, 24, 2), priceLine].filter(Boolean).join("\n");
  const lineCount = text ? text.split("\n").length : 1;
  const W = 230, imgH = 170, txtY = hasImg ? imgH + 18 : 14, H = txtY + lineCount * 20 + 12;   // กล่องสูงตามจำนวนบรรทัด (ชื่อ wrap ได้)
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#7c3aed", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (hasImg) els.push({ type: "image", _imageUrl: s.image_url, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#1e293b", groupIds: [gid], customData: data });
  return els;
}

// การ์ด Parent SKU บน Excalidraw (สีเขียวน้ำเงิน) -- ดับเบิลคลิกเปิดตัวแก้สินค้ากลาง
export function parentSkuCardSkeleton(s: ParentSkuVal): Record<string, unknown>[] {
  const gid = `parent_sku-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "parent_sku", id: s.id, code: s.code, name: s.name, image_url: s.image_url ?? null };
  const hasImg = !!s.image_url;
  const text = [`🧬 ${s.code}`, wrapCardText(s.name, 24, 2)].filter(Boolean).join("\n");
  const lineCount = text ? text.split("\n").length : 1;
  const W = 230, imgH = 170, txtY = hasImg ? imgH + 18 : 14, H = txtY + lineCount * 20 + 12;   // กล่องสูงตามจำนวนบรรทัด (ชื่อ wrap ได้)
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#0d9488", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (hasImg) els.push({ type: "image", _imageUrl: s.image_url, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#0f766e", groupIds: [gid], customData: data });
  return els;
}

// รายละเอียดที่โชว์บนการ์ด SKU การตลาด — ผู้ใช้ติ๊กเลือกได้ตอนวาง (จำรายคน user-prefs `campaign_mkt_card_fields`)
export type MktFieldKey = "image" | "code" | "name" | "label" | "badges" | "colors" | "note";

export const MKT_FIELD_OPTS: { key: MktFieldKey; labelTh: string; labelEn: string }[] = [
  { key: "image", labelTh: "รูปสินค้า", labelEn: "Image" },
  { key: "code", labelTh: "รหัสรุ่น", labelEn: "Model code" },
  { key: "name", labelTh: "ชื่อรุ่น", labelEn: "Name" },
  { key: "label", labelTh: "ป้ายหลัก (Hero/Clearance…)", labelEn: "Main label" },
  { key: "badges", labelTh: "ป้ายเสริม (Stock เยอะ/ขายดี…)", labelEn: "Badges" },
  { key: "colors", labelTh: "สีที่เหลือ a/n", labelEn: "Colors left" },
  { key: "note", labelTh: "หมายเหตุการตลาด", labelEn: "Marketing note" },
];

export const MKT_FIELDS_ALL: MktFieldKey[] = MKT_FIELD_OPTS.map((o) => o.key);

// การ์ด SKU การตลาด บน Excalidraw (ขอบ = สีป้ายการตลาด · ไม่มีป้าย = ส้ม) — ดับเบิลคลิกเปิดตัวแก้สินค้ากลาง (Parent)
export function marketingSkuCardSkeleton(s: MktSkuVal, fields: MktFieldKey[] = MKT_FIELDS_ALL): Record<string, unknown>[] {
  const gid = `marketing_sku-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "marketing_sku", id: s.id, code: s.code, name: s.name, image_url: s.image_url ?? null, label: s.label, badges: s.badges, sku_active: s.sku_active, sku_total: s.sku_total };
  const has = (k: MktFieldKey) => fields.includes(k);
  const hasImg = has("image") && !!s.image_url;
  // ป้ายหลัก + ป้ายเสริม: ตัดบรรทัดตามความกว้างการ์ด (เดิมยาวทะลุขอบ)
  const tags = [has("label") && s.label ? `🏷 ${s.label}` : null, ...(has("badges") ? s.badges.map((b) => `· ${b}`) : [])].filter(Boolean).join(" ");
  const text = [
    has("code") ? `🎯 ${s.code}` : null,
    has("name") ? wrapCardText(s.name, 24, 2) : null,
    tags ? wrapCardText(tags, 26, 3) : null,
    has("colors") ? `🎨 ${tt("สีที่เหลือ", "Colors left")} ${s.sku_active}/${s.sku_total}` : null,
    has("note") && s.note ? wrapCardText(`📝 ${s.note}`, 26, 2) : null,
  ].filter(Boolean).join("\n") || `🎯 ${s.code}`;
  const lineCount = text.split("\n").length;
  const W = 230, imgH = 170, txtY = hasImg ? imgH + 18 : 14, H = txtY + lineCount * 20 + 12;
  const stroke = s.label_color && /^#[0-9a-fA-F]{6}$/.test(s.label_color) ? s.label_color : "#ea580c";
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: stroke, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (hasImg) els.push({ type: "image", _imageUrl: s.image_url, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#9a3412", groupIds: [gid], customData: data });
  return els;
}

// ---- การ์ดใบงานออกแบบ (Design Sheet) — ตัวเชื่อมกับ Design Dashboard ----
// ดับเบิลคลิก = เปิดป๊อปอัปใบงานของกลาง (ดู/แก้/เปลี่ยนสถานะ) · ปิดแล้วการ์ดซิงค์ข้อความ+รูป+สีขอบตามสถานะใหม่
export const DS_CARD_STROKE = "#4f46e5";

export type DsCardInfo = { id: string; code: string; name: string; brand_name?: string | null; status?: string | null; deadline?: string | null; cover_url?: string | null };

export function dsCardText(s: DsCardInfo, statusLabel?: string | null): string {
  const meta = [s.brand_name ? `🏷 ${s.brand_name}` : null, statusLabel ? `● ${statusLabel}` : null].filter(Boolean).join("  ·  ");
  const dl = s.deadline ? `🗓 ${s.deadline}` : `🗓 ${tt("ไม่มีกำหนด", "No deadline")}`;
  return [`📐 ${s.code}`, wrapCardText(s.name, 24, 2), meta, dl].filter(Boolean).join("\n");
}

export function designSheetCardSkeleton(s: DsCardInfo, statusLabel?: string | null, statusColor?: string | null): Record<string, unknown>[] {
  const gid = `design_sheet-${s.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "design_sheet", id: s.id, code: s.code, name: s.name, brand_name: s.brand_name ?? null, status: s.status ?? null };
  const img = s.cover_url ? (withImageWidth(s.cover_url, 480) ?? s.cover_url) : null;
  const text = dsCardText(s, statusLabel);
  const lineCount = text ? text.split("\n").length : 1;
  const W = 240, imgH = 170, txtY = img ? imgH + 18 : 14, H = txtY + lineCount * 20 + 12;
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: statusColor || DS_CARD_STROKE, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (img) els.push({ type: "image", _imageUrl: img, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#3730a3", groupIds: [gid], customData: data });
  return els;
}

// ---- การ์ดเทรนด์ (Trend) — ส่งมาจากบอร์ดเทรนด์ (/tasks/trends) ----
// รูป = ภาพถ่ายหน้าเทรนด์ (กระดานของเทรนด์นั้น) · ดับเบิลคลิก = เปิดบอร์ดเทรนด์ในแท็บใหม่
export const TREND_CARD_STROKE = "#db2777";

export type TrendCardInfo = { id: string; title: string; heat?: string | null; percent?: number | null; done?: number | null; total?: number | null; cover_url?: string | null; brand_name?: string | null };

export function trendCardText(x: TrendCardInfo): string {
  const heat = x.heat === "hot" ? "🔥" : x.heat === "cooling" ? "❄️" : "🌱";
  const prog = x.total ? `✅ ${x.done ?? 0}/${x.total} (${x.percent ?? 0}%)` : null;
  return [`${heat} ${wrapCardText(x.title, 22, 2)}`, x.brand_name ? `🏷 ${x.brand_name}` : null, prog].filter(Boolean).join("\n");
}

export function trendCardSkeleton(x: TrendCardInfo): Record<string, unknown>[] {
  const gid = `trend-${x.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "trend", id: x.id, title: x.title, heat: x.heat ?? null, tooltip: tt("ดับเบิลคลิกเพื่อเปิดบอร์ดเทรนด์", "Double-click to open the trend board") };
  const img = x.cover_url ? (withImageWidth(x.cover_url, 560) ?? x.cover_url) : null;
  const text = trendCardText(x);
  const lineCount = text.split("\n").length;
  const W = 280, imgH = 158, txtY = img ? imgH + 18 : 14, H = txtY + lineCount * 20 + 12;   // 16:9 ย่อ
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#fff1f2", strokeColor: TREND_CARD_STROKE, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
  ];
  if (img) els.push({ type: "image", _imageUrl: img, x: 10, y: 10, width: W - 20, height: imgH, groupIds: [gid], customData: data });
  els.push({ type: "text", x: 14, y: txtY, width: W - 28, text, fontSize: 14, strokeColor: "#9d174d", groupIds: [gid], customData: data });
  return els;
}

// ตัวเลือก "ดึงข้อมูลอะไรของรูปมาด้วย" บนการ์ดรูปจากคลังกลาง (ติ๊กได้)
export type AssetFieldKey = "title" | "location" | "link" | "tags" | "size" | "description";

// การ์ดรูปจากคลังกลางบน Excalidraw — "รูปล้วน" ไม่มีกรอบ (+ ข้อความใต้รูปถ้าติ๊กไว้) · customData = snapshot (ดับเบิลคลิกเปิด)
export function assetCardSkeleton(a: AssetRow, fields: AssetFieldKey[]): Record<string, unknown>[] {
  const gid = `asset-${a.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "asset", id: a.id, title: a.title, url: a.url, master_path: a.master_path ?? null, master_url: a.master_url ?? null, tags: a.tags ?? [], width: a.width ?? null, height: a.height ?? null, description: a.description ?? null };
  const lines: string[] = [];
  if (fields.includes("title")) lines.push(`🖼️ ${a.title}`);
  if (fields.includes("location") && a.master_path) lines.push(`📍 ${a.master_path}`);
  if (fields.includes("link") && a.master_url) lines.push(`🔗 ${a.master_url}`);
  if (fields.includes("tags") && a.tags?.length) lines.push(`🏷 ${a.tags.join(", ")}`);
  if (fields.includes("size") && a.width && a.height) lines.push(`📐 ${a.width}×${a.height}`);
  if (fields.includes("description") && a.description) lines.push(a.description);
  const text = lines.join("\n");
  const W = 230, imgH = 170;
  // ไม่มี rectangle ครอบ — แค่รูป + ข้อความ (จัดกลุ่มให้ลาก/ลบทั้งชุด)
  const els: Record<string, unknown>[] = [
    { type: "image", _imageUrl: withImageWidth(a.url, 480) ?? a.url, x: 0, y: 0, width: W, height: imgH, groupIds: [gid], customData: data },
  ];
  if (text) els.push({ type: "text", x: 0, y: imgH + 10, width: W, text, fontSize: 13, strokeColor: "#475569", groupIds: [gid], customData: data });
  return els;
}

// ข้อความบนการ์ดคอนเทนต์ (รวม) — ใช้ทั้งตอนสร้าง + ตอน sync (refreshCards)
export type ContentCardInfo = { content_no?: string | null; title?: string | null; platforms?: string[]; status?: string | null; scheduled_at?: string | null; caption?: string | null };

export function contentCardText(c: ContentCardInfo): string {
  const platLine = (c.platforms ?? []).length ? (c.platforms ?? []).join(" · ") : "—";
  const sched = c.scheduled_at ? `🗓 ${String(c.scheduled_at).slice(0, 16).replace("T", " ")}\n` : "";
  const st = c.status ? ` · ${c.status}` : "";
  const cap = (c.caption ?? "").trim();
  const capLine = cap ? `\n\n📝 ${cap.slice(0, 120)}${cap.length > 120 ? "…" : ""}` : "";
  return `📱 ${c.title ?? ""}\n${c.content_no ?? ""}${st}\n${sched}${tt("แพลตฟอร์ม", "Platforms")}: ${platLine}${capLine}`;
}

// สถานะโพสต์ต่อแพลตฟอร์ม (post_status[platform]) → บรรทัดเด่น + สีขอบการ์ด
export function postStatusStyle(s?: string | null): { line: string; stroke: string } {
  switch (s) {
    case "posted": return { line: `✅ ${tt("โพสต์แล้ว", "Posted")}`, stroke: "#16a34a" };       // เขียว
    case "scheduled": return { line: `⏰ ${tt("ตั้งเวลาโพสต์แล้ว", "Scheduled")}`, stroke: "#2563eb" }; // น้ำเงิน
    case "skip": return { line: `⏭️ ${tt("ข้ามแพลตฟอร์มนี้", "Skipped")}`, stroke: "#94a3b8" };    // เทา
    default: return { line: `🟠 ${tt("ยังไม่โพสต์", "Not posted")}`, stroke: "#f59e0b" };            // ส้ม (ค่าเริ่มต้น)
  }
}

// ข้อความบนการ์ดรายแพลตฟอร์ม — สถานะโพสต์เด่นบนสุด
export function perPlatformCardText(c: ContentCardInfo, platform: string, caption?: string | null, postStatus?: string | null): string {
  const cap = (caption ?? "").trim();
  const capLine = cap ? `\n\n${cap.slice(0, 140)}${cap.length > 140 ? "…" : ""}` : `\n\n— ${tt("ยังไม่มีแคปชั่น", "No caption yet")} —`;
  const st = c.status ? ` · ${c.status}` : "";
  return `${postStatusStyle(postStatus).line}\n📱 ${platform}\n${c.title ?? ""}\n${c.content_no ?? ""}${st}${capLine}`;
}

// การ์ดคอนเทนต์ (รวม) บน Excalidraw -- customData (ดับเบิลคลิกเปิด Drawer)
export function contentCardSkeleton(c: { id: string; content_no: string; title: string; platforms: string[]; status?: string | null; scheduled_at?: string | null }): Record<string, unknown>[] {
  const gid = `content-${c.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "content", id: c.id, content_no: c.content_no, title: c.title, platforms: c.platforms };
  const W = 260, H = 180;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#fff7ed", strokeColor: "#f59e0b", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text: contentCardText(c), fontSize: 14, strokeColor: "#b45309", groupIds: [gid], customData: data },
  ];
}

// การ์ดคอนเทนต์ "รายแพลตฟอร์ม" — ผูก content เดียวกัน (มี platform ใน customData)
export function perPlatformCardSkeleton(c: { id: string; content_no: string; title: string; status?: string | null }, platform: string): Record<string, unknown>[] {
  const gid = `content-${c.id}-${platform}-${Math.random().toString(36).slice(2, 6)}`;
  const data = { kind: "content", id: c.id, content_no: c.content_no, title: c.title, platform, platforms: [platform] };
  const W = 240, H = 160;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#fffbeb", strokeColor: "#f59e0b", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 12, y: 12, width: W - 24, text: perPlatformCardText(c, platform), fontSize: 13, strokeColor: "#b45309", groupIds: [gid], customData: data },
  ];
}

// การ์ดโฟลเดอร์บน Excalidraw (กล่องเล็ก): 📁 ชื่อ (บน) + path เล็กสีเทา (ล่าง) · คำใบ้เป็น tooltip ตอนชี้
export function folderCardSkeleton(f: { path: string; label: string }): Record<string, unknown>[] {
  const fid = Math.random().toString(36).slice(2, 9);
  const gid = `folder-${fid}`;
  const data = { kind: "folder", id: fid, path: f.path, label: f.label, tooltip: "ดับเบิลคลิก = เปิดโฟลเดอร์" };
  const W = 250, H = 60;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ecfeff", strokeColor: "#0891b2", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 12, y: 9, width: W - 24, text: `📁 ${f.label || "โฟลเดอร์"}`, fontSize: 15, strokeColor: "#155e75", groupIds: [gid], customData: data },
    { type: "text", x: 12, y: 32, width: W - 24, text: f.path, fontSize: 10, strokeColor: "#64748b", groupIds: [gid], customData: data },
  ];
}

// การ์ดตารางคำนวณบน Excalidraw: วาด grid (หัวคอลัมน์ A B C / หัวแถว 1 2 3 / ช่องค่าที่คำนวณแล้ว) -- ดับเบิลคลิกเปิดสเปรดชีต
export type CanvasTable = { id: string; title: string; data: string[][] };

export function tableCardSkeleton(t: CanvasTable): Record<string, unknown>[] {
  const gid = `table-${t.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data0 = { kind: "table", id: t.id, title: t.title };
  const grid = Array.isArray(t.data) ? t.data : [];
  const R = Math.max(1, grid.length);
  const C = Math.max(1, grid.reduce((m, r) => Math.max(m, r?.length ?? 0), 0));
  const computed = computeGrid(grid);
  const CW = 90, CH = 26, HW = 30, TITLEH = 26;
  const W = HW + C * CW, H = TITLEH + (R + 1) * CH;
  const els: Record<string, unknown>[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#0f766e", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data0 },
    { type: "text", x: 8, y: 5, width: W - 16, text: `▦ ${t.title || tt("ตาราง", "Table")}`, fontSize: 14, strokeColor: "#0f766e", groupIds: [gid], customData: data0 },
  ];
  const gy = TITLEH;
  const headerCell = (x: number, y: number, w: number, text: string) => {
    els.push({ type: "rectangle", x, y, width: w, height: CH, backgroundColor: "#f1f5f9", strokeColor: "#cbd5e1", fillStyle: "solid", groupIds: [gid], customData: data0 });
    if (text) els.push({ type: "text", x: x + 4, y: y + 7, width: w - 8, text, fontSize: 11, strokeColor: "#64748b", groupIds: [gid], customData: data0 });
  };
  headerCell(0, gy, HW, "");
  for (let c = 0; c < C; c++) headerCell(HW + c * CW, gy, CW, indexToCol(c));
  for (let r = 0; r < R; r++) {
    const ry = gy + (r + 1) * CH;
    headerCell(0, ry, HW, String(r + 1));
    for (let c = 0; c < C; c++) {
      const cx = HW + c * CW;
      els.push({ type: "rectangle", x: cx, y: ry, width: CW, height: CH, backgroundColor: "#ffffff", strokeColor: "#e2e8f0", fillStyle: "solid", groupIds: [gid], customData: data0 });
      const val = (computed[r]?.[c] ?? "").toString();
      if (val) els.push({ type: "text", x: cx + 5, y: ry + 7, width: CW - 10, text: val.length > 14 ? val.slice(0, 13) + "…" : val, fontSize: 12, strokeColor: "#1e293b", groupIds: [gid], customData: data0 });
    }
  }
  return els;
}

// การ์ดงานบน Excalidraw: ชื่อ + รายการ subtask (snapshot) -- customData (ดับเบิลคลิกการ์ดเปิด drawer จัดการสด)
export function taskCardSkeleton(t: CreatedTask): Record<string, unknown>[] {
  const gid = `task-${t.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: "task", id: t.id, task_no: t.task_no, title: t.title, subtasks: t.subtasks };
  const shown = t.subtasks.slice(0, 6);
  const subLines = t.subtasks.length
    ? shown.map((s) => `☐ ${s.title}`).join("\n") + (t.subtasks.length > 6 ? `\n… ${tt("อีก", "+")} ${t.subtasks.length - 6}` : "")
    : `— ${tt("ยังไม่มีงานย่อย", "No subtasks yet")} —`;
  const text = `✅ ${t.title}\n${t.task_no}\n\n${tt("งานย่อย", "Subtasks")} (${t.subtasks.length})\n${subLines}`;
  const W = 260, H = 96 + (Math.max(shown.length, 1) + (t.subtasks.length > 6 ? 1 : 0)) * 19;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#f5f3ff", strokeColor: "#8b5cf6", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 14, strokeColor: "#5b21b6", groupIds: [gid], customData: data },
  ];
}
