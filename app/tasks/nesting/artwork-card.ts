"use client";

/**
 * การ์ดลายในคลัง Artwork ของไฟล์ที่ลากเข้าหน้าจัดเรียง (เจ้าของสั่ง 2026-11-16: "upload ลง ARTWORK ด้วย")
 *
 * ไฟล์ PNG ที่ลากมา → สร้างการ์ด artwork ในคลังไฟล์กลาง (รูปตัวอย่างย่อ ≤1600px + แบรนด์/ชนิดจากแถบ "เก็บเข้าคลังเป็น")
 *   แล้วผูกไฟล์พิมพ์ตัวจริงไว้กับการ์ด (ช่อง "ไฟล์พิมพ์" — lib/print-store ผ่าน saveToCloud ของหน้าจัดเรียง)
 * กันซ้ำด้วยรหัสเนื้อไฟล์พิมพ์ (sha) — ไฟล์เดิมเคยเข้าคลังแล้ว = ผูกการ์ดเดิม ไม่สร้างใหม่ · ห้ามดูชื่อไฟล์
 * สร้างการ์ดผ่านทางอัปเดียวกับคลัง (POST /api/assets source=artwork) — ไม่มีทางอัปแยก
 */
import { apiFetch } from "@/lib/api";
import { downscaleImageWidth } from "@/lib/image-resize";
import type { AssetRow, AssetSize } from "@/app/api/assets/shared";
import type { NestingItem } from "./data";
import { natural, type FileInfo } from "./nest-utils";

/** แบรนด์ + ชนิด artwork ที่ใช้ตอนสร้างการ์ด (การ์ด artwork ในคลังบังคับ 2 ช่องนี้) */
export type ArtworkTarget = { brandId: string; types: string[] };
export const EMPTY_TARGET: ArtworkTarget = { brandId: "", types: [] };
export const targetReady = (t: ArtworkTarget) => !!t.brandId && t.types.length > 0;

const TARGET_KEY = "nesting.artworkTarget";
/** จำแบรนด์/ชนิดที่เลือกล่าสุดในเครื่องนี้ (ความสะดวกรายคน — อ่าน/เขียนไม่ได้ก็ใช้ค่าว่าง) */
export function loadTarget(): ArtworkTarget {
  const fresh = { brandId: "", types: [DEFAULT_TYPE] };
  try {
    const v = JSON.parse(localStorage.getItem(TARGET_KEY) ?? "null") as Partial<ArtworkTarget> | null;
    if (!v) return fresh;
    return { brandId: typeof v.brandId === "string" ? v.brandId : "", types: Array.isArray(v.types) ? v.types.filter((x): x is string => typeof x === "string") : [] };
  } catch { return fresh; }
}
/** ชนิดตั้งต้นของงานจัดเรียง (ข้อมูลจริง 2026-11-16: การ์ด artwork 374/457 ใบเป็น "ลายพิมพ์") */
export const DEFAULT_TYPE = "ลายพิมพ์";
export function saveTarget(t: ArtworkTarget) {
  try { localStorage.setItem(TARGET_KEY, JSON.stringify(t)); } catch { /* โหมดส่วนตัว/ปิด storage */ }
}

/** sha ของไฟล์ที่ใช้เป็นการ์ด — ชิ้นที่แยก = ภาพต้นฉบับ (การ์ดเดียวต่อภาพ) */
export const cardSha = (it: NestingItem): string | null => (it.piece ? it.piece.source.sha : it.file?.sha) ?? null;
export const cardFileName = (it: NestingItem): string => (it.piece ? it.piece.source.name : it.file?.name) ?? "image.png";
export const cardTitle = (it: NestingItem): string => (it.piece ? it.piece.parent.title : it.title) || cardFileName(it).replace(/\.[^.]+$/, "");

/** แถวที่ยังไม่มีการ์ดในคลัง แต่มีไฟล์พิมพ์แล้ว → กลุ่มตาม sha (ภาพเดียว = การ์ดเดียว) */
export function rowsWithoutCard(items: NestingItem[]): { sha: string; keys: string[]; first: NestingItem }[] {
  const by = new Map<string, { sha: string; keys: string[]; first: NestingItem }>();
  for (const it of items) {
    const sha = cardSha(it);
    if (it.asset_id || !sha) continue;
    const g = by.get(sha);
    if (g) g.keys.push(it.key); else by.set(sha, { sha, keys: [it.key], first: it });
  }
  return [...by.values()];
}

/** ใส่การ์ดให้ทุกแถวของไฟล์นี้ (ชิ้นที่แยกจากภาพเดียวกันได้การ์ดเดียวกัน) · แถวที่มีการ์ดอยู่แล้วไม่แตะ */
export function attachCard(items: NestingItem[], sha: string, assetId: string): NestingItem[] {
  let changed = false;
  const next = items.map((it) => {
    if (it.asset_id || cardSha(it) !== sha) return it;
    changed = true;
    return { ...it, asset_id: assetId };
  });
  return changed ? next : items;
}

/**
 * ชื่อการ์ดเปลี่ยน (แก้ในหน้ารายละเอียดคลัง) → ชื่อในแถวเปลี่ยนตาม
 * แถวเต็ม = ชื่อการ์ด · ชิ้นที่แยก = "<ชื่อการ์ด> · <ลำดับชิ้น>" + ชื่อภาพเต็มที่ใช้ตอนรวมกลับ
 */
export function renameByCard(items: NestingItem[], assetId: string, title: string): NestingItem[] {
  const name = title.trim();
  if (!name) return items;
  let changed = false;
  const next = items.map((it) => {
    if (it.asset_id !== assetId) return it;
    const nt = it.piece ? `${name} · ${it.piece.index + 1}` : name;
    if (nt === it.title && (!it.piece || it.piece.parent.title === name)) return it;
    changed = true;
    return it.piece ? { ...it, title: nt, piece: { ...it.piece, parent: { ...it.piece.parent, title: name } } } : { ...it, title: nt };
  });
  return changed ? next : items;
}

/** ขนาดจริงของไฟล์ (ส่วนที่มีภาพ ตาม DPI ในไฟล์) เป็นไซส์ของการ์ด — cm ทศนิยม 2 ตำแหน่ง */
export function realSize(info: FileInfo | undefined, label: string): AssetSize | null {
  if (!info || info.error || !info.dpi?.[0] || !info.dpi?.[1]) return null;
  const n = natural(info);
  const w = Math.round(n.w * 10) / 100, h = Math.round(n.h * 10) / 100;   // mm → cm ทศนิยม 2 ตำแหน่ง (ละเอียด 0.1 mm)
  if (!(w > 0) || !(h > 0)) return null;
  return { label, w, h, unit: "cm" };
}

async function json<T>(res: Response): Promise<T> {
  let j: { data?: unknown; error?: string | null } = {};
  try { j = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok || j.error) throw new Error(j.error || `(${res.status})`);
  return j.data as T;
}

/** การ์ดในคลังที่ผูกไฟล์พิมพ์เหล่านี้ไว้แล้ว (sha → การ์ด) */
export async function findCardsByPrint(shas: string[]): Promise<Record<string, AssetRow>> {
  if (!shas.length) return {};
  return json<Record<string, AssetRow>>(await apiFetch(`/api/nesting-jobs/asset-by-print?shas=${shas.join(",")}`));
}

/** สร้างการ์ด artwork ในคลังไฟล์กลาง (รูปตัวอย่างย่อ ≤1600px · ไฟล์พิมพ์ผูกทีหลังด้วย saveToCloud) */
export async function createArtworkCard(preview: File, p: { title: string; target: ArtworkTarget; size: AssetSize | null; actor?: string | null }): Promise<AssetRow> {
  const up = await downscaleImageWidth(preview, 1600);
  const fd = new FormData();
  fd.append("file", up, preview.name);
  fd.append("source", "artwork");
  fd.append("title", p.title);
  fd.append("brand_id", p.target.brandId);
  fd.append("artwork_types", JSON.stringify(p.target.types));
  if (p.size) fd.append("sizes", JSON.stringify([p.size]));
  if (p.actor) fd.append("actor", p.actor);
  return json<AssetRow>(await apiFetch("/api/assets", { method: "POST", body: fd }));
}

/** อ่านการ์ดล่าสุด (หลังแก้ในหน้ารายละเอียดคลัง) */
export async function getCard(assetId: string): Promise<AssetRow> {
  return json<AssetRow>(await apiFetch(`/api/assets/${assetId}`));
}
