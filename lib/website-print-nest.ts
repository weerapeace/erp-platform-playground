/**
 * 🖨 ส่งลายรีดของออเดอร์เข้า "จัดเรียงงานพิมพ์" (/tasks/nesting) — ฝั่งเซิร์ฟเวอร์เท่านั้น (ใช้ sharp)
 *
 * แต่ละลาย → PNG ไฟล์พิมพ์ (ความละเอียดของไฟล์ต้นฉบับ ไม่เกิน 600 DPI ที่ขนาดจริง)
 *   ตัดตามทรงของส่วนพิมพ์ (printPlacementMask — ส่วนที่ลูกค้าเห็นจาง = ไม่พิมพ์) → คลังไฟล์พิมพ์ R2 `nesting-prints/<sha>.png` (lib/print-store)
 *   → แถวในงานจัดเรียง: ขนาดกว้างเป็น mm · จำนวน = จำนวนใบในออเดอร์ · ตัวช่วยในเครื่องดึงไฟล์จากคลังเองด้วย sha
 * ไฟล์ต้นทาง: ลายคลัง = "ไฟล์พิมพ์ PNG" ของลาย (ไม่มี = รูปในคลัง) · รูปลูกค้า/รูปข้อความ = ที่เก็บส่วนตัว print-uploads
 * รหัสแถว pd-<id 8 ตัว>-<ลำดับ> → ส่งแบบเดิมซ้ำเข้างานเดิม = แทนแถวเดิม (ไม่ซ้ำ)
 * PDF แผ่นพิมพ์ยังออกจากหน้าจัดเรียง → Google Drive ตามกฎเดิม (ไม่มีอะไรลง R2 นอกจาก PNG ต้นฉบับ)
 */
import sharp from "sharp";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { r2GetObject } from "@/lib/r2";
import { printKey, storePrintBytes } from "@/lib/print-store";
import { printPlacementMask, type PrintPlacement, type PrintZone } from "@/lib/website-print-design";
import { PRINT_BUCKET, PRINT_DESIGN_SELECT, type PrintDesignRow } from "@/lib/website-print-design-server";
import { cleanItems, type NestingItem } from "@/app/api/nesting-jobs/shared";

type Admin = ReturnType<typeof supabaseAdmin>;
const MAX_DPI = 600;
const MAX_PX = 6000;

export const nestKeyPrefix = (designId: string) => `pd-${designId.slice(0, 8)}-`;

export type NestFileNote = { index: number; name: string; from: "print" | "library" | "customer"; cut: boolean; sha: string } | { index: number; name: string; error: string };

async function r2Bytes(key: string): Promise<Buffer | null> {
  const obj = await r2GetObject(key).catch(() => null);
  return obj ? Buffer.from(await new Response(obj.body).arrayBuffer()) : null;
}

/** ไฟล์ต้นทางของลาย 1 ชิ้น */
async function sourceOf(sb: Admin, p: PrintPlacement, assets: Map<string, { r2_key: string | null; nest_print_file: { sha?: string } | null }>): Promise<{ buf: Buffer; from: "print" | "library" | "customer" } | null> {
  if (p.upload) {
    const { data } = await sb.storage.from(PRINT_BUCKET).download(p.upload.path);
    return data ? { buf: Buffer.from(await data.arrayBuffer()), from: "customer" } : null;
  }
  const a = p.assetId ? assets.get(p.assetId) : undefined;
  if (!a) return null;
  const sha = a.nest_print_file?.sha;
  if (sha) {
    const buf = await r2Bytes(printKey(sha));
    if (buf) return { buf, from: "print" };
  }
  const buf = a.r2_key ? await r2Bytes(a.r2_key) : null;
  return buf ? { buf, from: "library" } : null;
}

/** PNG ไฟล์พิมพ์ของลาย 1 ชิ้น (หมุนตาม EXIF · ย่อไม่เกิน 600 DPI · ตัดตามทรง) */
export async function renderPrintPiece(buf: Buffer, p: PrintPlacement, zone: PrintZone | undefined): Promise<{ png: Buffer; cut: boolean }> {
  const maxPx = Math.min(MAX_PX, Math.ceil((Math.max(p.w, p.h) / 2.54) * MAX_DPI));
  const { data, info } = await sharp(buf, { limitInputPixels: 400_000_000 })
    .rotate()
    .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const mask = zone ? printPlacementMask(zone, p) : null;
  if (!mask) return { png: data, cut: false };
  const W = info.width;
  const H = info.height;
  const d = mask.map(([x, y], i) => `${i ? "L" : "M"}${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`).join("") + "Z";
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="#fff"/></svg>`);
  const png = await sharp(data).composite([{ input: svg, blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
  return { png, cut: true };
}

export type NestSendResult =
  | { ok: true; job: { id: string; name: string; created: boolean }; files: NestFileNote[] }
  | { ok: false; error: string; status: number };

/**
 * ส่งแบบ 1 แบบเข้างานจัดเรียง: jobId = งานร่างที่มีอยู่ (เพิ่ม/แทนแถวของแบบนี้) · null = สร้างงานใหม่
 */
export async function sendPrintDesignToNesting(
  sb: Admin,
  shopId: string,
  designId: string,
  jobId: string | null,
  actor: { id: string | null; name: string | null },
): Promise<NestSendResult> {
  const { data: row } = await sb.from("store_print_designs").select(PRINT_DESIGN_SELECT).eq("shop_id", shopId).eq("id", designId).maybeSingle();
  const d = row as PrintDesignRow | null;
  if (!d) return { ok: false, error: "ไม่พบแบบลายนี้", status: 404 };
  if (d.status !== "ordered") return { ok: false, error: "แบบนี้ยังไม่ได้สั่งซื้อ", status: 409 };
  if (d.review_status !== "approved") return { ok: false, error: "อนุมัติลายก่อน แล้วค่อยส่งเข้าจัดเรียง", status: 409 };
  if (d.uploads_purged_at) return { ok: false, error: "รูปลูกค้าถูกลบตามวันเก็บแล้ว ส่งเข้าจัดเรียงไม่ได้", status: 409 };
  const placements = Array.isArray(d.placements) ? d.placements : [];
  const zones = Array.isArray(d.zones) ? d.zones : [];

  const { data: line } = await sb.from("store_order_items").select("qty").eq("print_design_id", d.id).limit(1).maybeSingle();
  const qty = Math.max(1, Number((line as { qty?: number } | null)?.qty) || 1);
  const assetIds = [...new Set(placements.map((p) => p.assetId).filter((x): x is string => !!x))];
  const { data: assetRows } = assetIds.length ? await sb.from("assets").select("id, r2_key, nest_print_file").in("id", assetIds) : { data: [] };
  const assets = new Map(((assetRows ?? []) as { id: string; r2_key: string | null; nest_print_file: { sha?: string } | null }[]).map((a) => [a.id, a]));

  const prefix = nestKeyPrefix(d.id);
  const ref = d.order_ref ?? d.code;
  const files: NestFileNote[] = [];
  const items: NestingItem[] = [];
  // ทีละชิ้น — ไฟล์ใหญ่หลายรูปพร้อมกันกินหน่วยความจำ
  for (const [i, p] of placements.entries()) {
    try {
      const src = await sourceOf(sb, p, assets);
      if (!src) {
        files.push({ index: i, name: p.name, error: p.kind === "lib" ? "ไม่พบไฟล์ลายในคลัง" : "ไม่พบไฟล์ของลูกค้า" });
        continue;
      }
      const { png, cut } = await renderPrintPiece(src.buf, p, zones.find((z) => z.id === p.zone));
      const stored = await storePrintBytes(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      files.push({ index: i, name: p.name, from: src.from, cut, sha: stored.sha });
      items.push({
        key: `${prefix}${i + 1}`,
        asset_id: p.kind === "lib" ? p.assetId ?? null : null,
        title: `${ref} · ${p.name}`.slice(0, 200),
        size: { mode: "width", value: Math.round(p.w * 1000) / 100 },
        qty,
        fill_pct: 0,
        file: { name: `${ref}-${d.code}-${i + 1}.png`, sha: stored.sha },
        lock: null,
        piece: null,
        rows: false,
      });
    } catch (e) {
      files.push({ index: i, name: p.name, error: e instanceof Error ? e.message.slice(0, 120) : "ทำไฟล์พิมพ์ไม่สำเร็จ" });
    }
  }
  if (!items.length) return { ok: false, error: "ทำไฟล์พิมพ์ไม่สำเร็จสักลาย — ดูรายละเอียดในรายการ", status: 422 };

  const now = new Date().toISOString();
  if (jobId) {
    const { data: job } = await sb.from("erp_nesting_jobs").select("id, name, status, items").eq("id", jobId).maybeSingle();
    if (!job) return { ok: false, error: "ไม่พบงานจัดเรียงที่เลือก", status: 404 };
    if (job.status !== "draft") return { ok: false, error: "งานนี้จัดเรียงเสร็จ/พิมพ์แล้ว — เลือกงานอื่นหรือสร้างงานใหม่", status: 409 };
    const keep = ((job.items ?? []) as NestingItem[]).filter((x) => !String(x.key).startsWith(prefix));
    const next = cleanItems([...keep, ...items]) ?? keep;
    const { error } = await sb.from("erp_nesting_jobs").update({ items: next, updated_by: actor.id, updated_by_name: actor.name, updated_at: now }).eq("id", jobId);
    if (error) return { ok: false, error: "บันทึกงานจัดเรียงไม่สำเร็จ", status: 500 };
    return { ok: true, job: { id: job.id as string, name: job.name as string, created: false }, files };
  }
  const { data: pt } = await sb.from("erp_print_types").select("id").eq("code", d.method).eq("is_active", true).limit(1).maybeSingle();
  const name = `ลายรีด ${ref}`.slice(0, 120);
  const { data: created, error } = await sb
    .from("erp_nesting_jobs")
    .insert({ name, status: "draft", settings: {}, items: cleanItems(items) ?? items, print_type_id: (pt as { id: string } | null)?.id ?? null, result: null, created_by: actor.id, created_by_name: actor.name, updated_by: actor.id, updated_by_name: actor.name })
    .select("id, name")
    .single();
  if (error || !created) return { ok: false, error: "สร้างงานจัดเรียงไม่สำเร็จ", status: 500 };
  return { ok: true, job: { id: created.id as string, name: created.name as string, created: true }, files };
}

/** งานจัดเรียงที่มีแบบนี้อยู่ (ล่าสุดก่อน) — โชว์ "ส่งแล้ว" ในแท็บออเดอร์ */
export async function nestingJobsOfDesign(sb: Admin, designId: string): Promise<{ id: string; name: string; status: string }[]> {
  const { data } = await sb
    .from("erp_nesting_jobs")
    .select("id, name, status")
    .contains("items", [{ key: `${nestKeyPrefix(designId)}1` }])
    .order("updated_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as { id: string; name: string; status: string }[]);
}

/** งานร่างล่าสุด (ให้เลือกเพิ่มเข้า) */
export async function draftNestingJobs(sb: Admin): Promise<{ id: string; name: string }[]> {
  const { data } = await sb.from("erp_nesting_jobs").select("id, name").eq("status", "draft").order("updated_at", { ascending: false }).limit(15);
  return ((data ?? []) as { id: string; name: string }[]);
}
