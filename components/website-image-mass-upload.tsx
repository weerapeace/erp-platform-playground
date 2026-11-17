"use client";
/**
 * 📸 ลงรูปเว็บทีละมาก (หน้า "สินค้าบนเว็บ" ของแต่ละร้าน → ปุ่มหัวตาราง / แถบล่างตอนติ๊ก = เฉพาะที่เลือก)
 * --------------------------------------------------------------------------
 * 1) ลากทั้งโฟลเดอร์/หลายไฟล์ (หรือกดเลือก) → จับคู่ชื่อไฟล์กับรหัสรุ่น/สี (ของกลาง lib/website-image-match)
 *      JEAN08_1.jpg = รูปบนเว็บ · JEAN08-01_2.jpg = รูปสี · JEAN08_hero(.jpg / _m) = Hero คอม/มือถือ · โฟลเดอร์ชื่อรหัสก็ได้
 *      🎬 วิดีโอ (mp4/webm/mov) = Hero เสมอ: JEAN08.mp4 = คอม · JEAN08_m.mp4 = มือถือ (≤ 200 MB · ไฟล์ > 4 MB ส่งตรงเข้า R2)
 * 2) ตรวจก่อนลง: แยกตามสินค้า → ช่อง (บอกรหัส SKU + ร้านที่ลง) → รูปใหม่ตามลำดับ · ไฟล์ที่ต้องดู (ไม่พบรหัส/สีไม่มี/เกินเพดาน/Hero ซ้ำ/ข้ามเอง) เลือกช่องเองได้
 *    แต่ละแถวโชว์รูปเดิมบนเว็บจางๆ ก่อนรูปใหม่ (ต่อท้าย = เลขต่อจากของเดิม · แทนที่ = ขีดฆ่า "จะเอาออก")
 *    ↕ ลากรูปสลับลำดับในแถว (หรือ ‹ ›) — เลือกได้ว่าแถวอื่นตำแหน่งเดียวกันสลับตาม (ทุกสีในรุ่น / ทุกแถวที่ลากมา · จำต่อคน)
 *    🎯 โยนรูปเข้าสีเอง (ไม่สนชื่อไฟล์): ทุกสีของรุ่นมีแถว (สีที่ยังไม่มีรูปใหม่ = แถวว่างกรอบประ) · ลากไฟล์จากเครื่องวางบนแถว = เข้าแถวนั้น
 *       ลากรูปย่อข้ามไปแถวอื่น (useDragReorder onDropTarget · data-reorder-drop = targetKey) · ⇄ "ย้ายไป…" ใต้รูป (จอสัมผัส) — ย้ายทีละรูป ต่อท้ายแถวปลายทาง
 *    ✕ ไม่ลงทั้งแถว / ทั้งสินค้า (ลงซ้ำของที่มีแล้ว) → ไปกล่อง "ข้ามไว้" เอากลับได้ทีละกลุ่ม · ✎ ย้ายทั้งแถวไปสินค้า/ช่องอื่น · 🔁 เปลี่ยนสินค้าทั้งรุ่น (อ่านชื่อผิด — สีจับคู่ตามเลขสีเดิม)
 *    ค่าเริ่มต้น = เพิ่มต่อท้าย (ของเดิมอยู่ครบ) · แทนที่ = เฉพาะช่องที่มีรูปใหม่ · เกิน 20 สินค้า + แทนที่ = พิมพ์ CONFIRM
 *    ครั้งละ ≤ 1,000 ไฟล์: รูปพรีวิวย่อ (สูง 160px · ทำทีละ 3 รูปเบื้องหลัง) · แสดงทีละ 30 สินค้า
 *    👀 เตือนรูปหน้าตาเหมือนรูปเดิมบนเว็บ (lib/image-hash isLookAlike · เทียบกับรูปบนเว็บ+รูปสีของสินค้านั้น · โหมดต่อท้าย · เตือนอย่างเดียว)
 *       ใช้ตัวเทียบตัวเดียวกับคลัง (สีเทียบช่องที่ต่างมากสุด) — ถ่ายท่าเดียวกันคนละสี (เทา/เทาฝุ่น · กรมท่า/เขียวเข้ม) ไม่นับว่าซ้ำ
 *    🔁 รูปที่มีในคลังไฟล์แล้ว (ของกลาง findDuplicateMatches · ตรวจเบื้องหลังระหว่างดู ยังไม่ส่งไฟล์) → ป้าย "ใช้รูปเดิม / อัปใหม่" บนรูป
 *       ใช้รูปเดิม = ตอนลงไม่อัปไฟล์ซ้ำ ใช้ไฟล์เดิมในคลัง · รูปเดียวกับที่อยู่บนเว็บสินค้านั้นแล้ว = ป้าย "ซ้ำเดิม" (กดไม่ลงทั้งหมดได้)
 *    🔁 รูปซ้ำกันเองในชุดที่ลากมา (เทียบในเครื่อง: sha256 ไฟล์ทุกสินค้า + ลายนิ้วมือภาพในสินค้าเดียวกัน · ไม่รวม Hero) → ป้าย "ซ้ำ #n" (แถวเดียวกัน) / "= -01 #n" (ข้ามแถว)
 *       ทั้งแถวเหมือนอีกแถว = เตือนหัวแถว (ไม่ลงแถวนี้ / ย้ายแถว) · ไฟล์เดียวกันเป๊ะ = ตอนลงอัปครั้งเดียวใช้ร่วมกัน
 * 3) กดลงรูป → ลงเป็นรอบ รอบละ 20 สินค้า (อัปรูป → บันทึกลงเว็บทันที) · runBackgroundTask = ปิดหน้าต่างได้ · ลงซ้ำเฉพาะไฟล์ที่พลาด (ไม่อัปใหม่ไฟล์ที่อัปแล้ว · ช่องที่บันทึกแล้ว = ต่อท้าย)
 *    รูปย่อ ≤ 2000px (uploadResizedImage) · วิดีโอใช้ตัวอัปกลาง uploadMediaFile (ตัวเดียวกับช่อง Hero ทีละตัว) → R2 (ทีละ 3 ไฟล์ · ไฟล์ที่ไม่ได้ลงจะไม่อัป) → POST /api/website/listings/images (รวมกับรูปล่าสุดใน DB + audit + ล้างแคชเว็บ)
 * ของกลาง: ERPModal · useFileDrop(folders) · useDragReorder · useUserPref · runBackgroundTask · image-hash (ลายนิ้วมือหน้าตารูป) · findDuplicateMatches (รูปซ้ำในคลัง) · HoverImage · uploadResizedImage · uploadMediaFile · toast
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useFileDrop, FileDropHint, filePathOf } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { prepareResizedImage, uploadResizedImage } from "@/components/image-attach";
import { findDuplicateMatches, type DuplicateMatch } from "@/components/duplicate-upload";
import { HoverImage } from "@/components/hover-image";
import { formatBytes, sha256Hex } from "@/lib/assets";
import { r2ImageUrl } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { runBackgroundTask } from "@/lib/background-tasks";
import { Icon } from "@/components/icon";
import { isLookAlike, lookHashOfBlob, type LookHash } from "@/lib/image-hash";
import { uploadMediaFile } from "@/lib/media-upload";
import { groupFailures, uploadErrorText } from "@/lib/image-open-error";
import { BIG_VIDEO_MAX_BYTES, fileMb } from "@/lib/media-upload-limits";
import {
  MAX_WEB_MASS_FILES,
  ROUND_PRODUCTS,
  buildCodeIndex,
  buildMassItems,
  isVideoName,
  matchImagePath,
  matchIntoParent,
  planImageUpload,
  splitRounds,
  targetKey,
  targetLabel,
  type CatalogParent,
  type ImageMatch,
  type ImageTarget,
  type MassMode,
  type PlanDest,
  type PlanFile,
} from "@/lib/website-image-match";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type Parent = CatalogParent & { otherShopIds: string[] };
type Item = {
  id: string;
  file: File;
  path: string;
  url: string;
  match: ImageMatch;
  /** 🎬 วิดีโอ (ลงได้เฉพาะ Hero) */
  video: boolean;
  /** ลงไม่ได้ เช่น ไฟล์ใหญ่เกิน */
  invalid?: string;
  /** เลือกช่องเอง (ทับผลจับคู่) */
  manual?: { parentId: string; target: ImageTarget | null };
  /** ✕ ไม่ลงไฟล์นี้ (เก็บช่องเดิมไว้ → เอากลับแล้วกลับแถวเดิม) */
  skip?: boolean;
  /** ↕ ลำดับที่ลากสลับเอง (ทับเลขท้ายชื่อไฟล์) */
  pos?: number;
};
type Phase = "pick" | "uploading" | "done";
/** ผลรวมทุกรอบ (ลงซ้ำ = บวกต่อ) · failed = ไฟล์ที่ยังไม่ขึ้นเว็บร้านนี้ (ลงซ้ำได้) */
type Result = { ok: number; failed: { id: string; name: string; why: string }[]; updated: number; otherShopFails: number; skippedShops: number };
type RoundView = { codes: string[]; files: number; status: "wait" | "run" | "ok" | "part" | "fail" };
/** หน้าตาเหมือนรูปเดิมบนเว็บ (where = รูปไหน · เตือนให้ดูด้วยตา ไม่ข้ามเอง) */
type Dup = { where: string };
/** รูปซ้ำกันเองในชุดที่ลากมา → ชี้ไปรูปแรก (of) ที่แถว destKey ตำแหน่ง num · exact = ไฟล์เดียวกันเป๊ะ (ไม่ใช่แค่หน้าตาเหมือน) */
type Twin = { of: string; destKey: string; parentId: string; num: number; exact: boolean };
const ROUND_LABEL: Record<RoundView["status"], { text: string; cls: string; icon?: string }> = {
  wait: { get text() { return tr("รอคิว", "Queued"); }, cls: "text-slate-400" },
  run: { get text() { return tr("กำลังลง…", "Uploading…"); }, cls: "text-blue-600", icon: "waiting" },
  ok: { get text() { return tr("ขึ้นเว็บแล้ว", "Live"); }, cls: "text-emerald-700", icon: "done" },
  part: { get text() { return tr("ขึ้นเว็บบางส่วน", "Partly live"); }, cls: "text-amber-700", icon: "warning" },
  fail: { get text() { return tr("ไม่สำเร็จ", "Failed"); }, cls: "text-rose-600", icon: "cancel" },
};
/** แสดงทีละกี่สินค้า / กี่ไฟล์ในกล่อง "ไฟล์ที่ต้องดู" (ลาก 1,000 รูปแล้วหน้าไม่หนัก) */
const SHOW_PRODUCTS = 30;
const SHOW_LOOK = 50;
/** รูปเดิมบนเว็บที่โหลดมาเทียบหน้าตาได้สูงสุดต่อครั้ง (รูปย่อกว้าง 320px) */
const OLD_PRINT_MAX = 800;

/** สลับลำดับแล้วแถวอื่น "ตำแหน่งเดียวกัน" ตามด้วยไหม: แถวเดียว / ทุกสีในรุ่น / ทุกแถวที่ลากมา (ชนิดช่องเดียวกัน) */
type LinkReorder = "row" | "product" | "all";
const LINK_OPTS: { v: LinkReorder; label: string }[] = [
  { v: "row", get label() { return tr("แถวนี้แถวเดียว", "This row only"); } },
  { v: "product", get label() { return tr("ทุกสีในรุ่นเดียวกัน", "All colors of the model"); } },
  { v: "all", get label() { return tr("ทุกแถวที่ลากมา", "All dropped rows"); } },
];
const parseLink = (v: unknown): LinkReorder | null => (v === "row" || v === "product" || v === "all" ? v : null);
const CONFIRM_OVER = 20;
const UPLOAD_CONCURRENCY = 3;
/** ด้านยาวสุดของรูปที่อัป (px) · ตรวจกับคลังย่อด้วยขนาดเดียวกัน → ลายนิ้วมือไฟล์ตรงกับไฟล์ที่จะอัปจริง */
const UPLOAD_MAX = 2000;
/** ตรวจกับคลังทีละกี่ไฟล์ (ย่อรูปทีละชุด ไม่กินหน่วยความจำตอนลากมาเป็นร้อยไฟล์) */
const LIB_BATCH = 20;
/** แถวที่กำลังลากรูปข้ามมาวาง (useDragReorder ใส่ data-drop-over ให้) */
const DROP_OVER_CLS = "data-[drop-over=true]:bg-violet-50 data-[drop-over=true]:ring-2 data-[drop-over=true]:ring-violet-300";
const seg = (on: boolean) => `px-3 py-1 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
/** รูปเดิมบนเว็บของช่องนั้น (R2 key ตามลำดับที่โชว์) */
const existingKeys = (t: ImageTarget, p: CatalogParent): string[] => {
  if (t.kind === "gallery") return p.webImages;
  const sk = t.kind === "hero" ? null : p.skus.find((x) => x.id === t.skuId);
  if (t.kind === "sku") return sk?.webImages ?? [];
  const h = t.kind === "hero" ? p.hero : sk?.hero;
  const k = h?.[t.slot];
  return k ? [k] : [];
};
/** ค่า select ช่องรูป ↔ ImageTarget (เลือกเอง: รูปบนเว็บ · รูปสี · Hero รุ่น) */
const encT = (t: ImageTarget | null) => (!t ? "" : t.kind === "gallery" ? "g" : t.kind === "sku" ? `s:${t.skuId}` : t.kind === "hero" ? `h:${t.slot}` : `sh:${t.skuId}:${t.slot}`);
const decT = (v: string): ImageTarget | null => {
  if (v === "g") return { kind: "gallery" };
  if (v.startsWith("s:")) return { kind: "sku", skuId: v.slice(2) };
  if (v === "h:desktop" || v === "h:mobile") return { kind: "hero", slot: v.slice(2) as "desktop" | "mobile" };
  const sh = v.match(/^sh:([0-9a-f-]{36}):(desktop|mobile)$/i);
  if (sh) return { kind: "skuHero", skuId: sh[1], slot: sh[2] as "desktop" | "mobile" };
  return null;
};

export function WebsiteImageMassUpload({
  open,
  onClose,
  shop,
  scopeIds,
  scopeLabel,
  initialFiles,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  shop: { id: string; name: string };
  /** ติ๊กไว้ = จับคู่เฉพาะรุ่นเหล่านี้ · ไม่ส่ง = ทั้งร้าน · รุ่นเดียว = ไฟล์ที่ไม่มีรหัสเข้ารุ่นนั้น (matchIntoParent) */
  scopeIds?: string[] | null;
  /** ชื่อชุดที่ส่งมา (เช่น "30 รุ่นที่ยังไม่มีรูปบนเว็บเลย" จากตัวกรอง) · ไม่ส่ง = "N รายการที่ติ๊กไว้" */
  scopeLabel?: string | null;
  /** 📥 ไฟล์ที่ลากมาวางบนแถวสินค้า — ใส่ให้ทันทีเมื่อโหลดรายการเสร็จ */
  initialFiles?: File[] | null;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const t = useT();
  const [catalog, setCatalog] = useState<{ parents: Parent[]; otherShops: { id: string; name: string }[] } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<MassMode>("append");
  const [linkReorder, setLinkReorder] = useUserPref<LinkReorder>("website_mass_upload_link_reorder", "all", parseLink);
  const [alsoShops, setAlsoShops] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  /** วิดีโอไฟล์ใหญ่ที่กำลังส่ง (%) · null = ไม่มี */
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [shown, setShown] = useState(SHOW_PRODUCTS);
  const [lookShown, setLookShown] = useState(SHOW_LOOK);
  /** รูปพรีวิวย่อ + ลายนิ้วมือภาพ ต่อไฟล์ (ไม่เปิดรูปเต็มทุกรูป = ลาก 1,000 รูปเครื่องไม่ค้าง) */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [looks, setLooks] = useState<Record<string, LookHash | null>>({});
  /** ลายนิ้วมือไฟล์ต้นฉบับ (sha256) — ไฟล์เดียวกันเป๊ะในชุด = เตือน + ตอนลงอัปครั้งเดียวใช้ร่วมกัน */
  const [sums, setSums] = useState<Record<string, string | null>>({});
  /** ลายนิ้วมือภาพของรูปเดิมบนเว็บ (key R2) */
  const [oldLooks, setOldLooks] = useState<Record<string, LookHash | null>>({});
  const prepAsked = useRef(new Set<string>());
  const oldAsked = useRef(new Set<string>());
  /** 🔁 รูปที่มีในคลังแล้ว ต่อไฟล์ (null = ไม่ซ้ำ/ตรวจไม่ได้ · ไม่มี key = ยังตรวจไม่ถึง) + เลือกเอง (true = ใช้รูปเดิม · false = อัปใหม่ · ไม่มี = ตามที่ระบบแนะนำ) */
  const [libDup, setLibDup] = useState<Record<string, DuplicateMatch | null>>({});
  const [libUse, setLibUse] = useState<Record<string, boolean>>({});
  const libAsked = useRef(new Set<string>());
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  /** ตอนลง: ไฟล์ที่อัปแล้ว (id → key · ลงซ้ำไม่อัปใหม่) · ช่องที่บันทึกแล้ว (ลงซ้ำ = ต่อท้าย) · แผนตอนกดลง (ลงซ้ำใช้แผนเดิม) */
  const keysRef = useRef(new Map<string, string>());
  const savedDestRef = useRef(new Set<string>());
  const runPlanRef = useRef<PlanDest[]>([]);
  const runningRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const clearItems = () => {
    for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    for (const u of Object.values(previewsRef.current)) URL.revokeObjectURL(u);
    prepAsked.current = new Set();
    libAsked.current = new Set();
    setItems([]);
    setPreviews({});
    setLooks({});
    setSums({});
    setLibDup({});
    setLibUse({});
    setShown(SHOW_PRODUCTS);
    setLookShown(SHOW_LOOK);
  };

  const load = async () => {
    setLoadErr(null);
    setCatalog(null);
    try {
      const r = await apiFetch(`/api/website/listings/images?shopId=${encodeURIComponent(shop.id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || tr("โหลดไม่สำเร็จ", "Load failed"));
      setCatalog({ parents: j.parents ?? [], otherShops: j.otherShops ?? [] });
    } catch (e) {
      setLoadErr((e as Error).message || tr("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่", "Couldn't load data, please try again"));
    }
  };

  useEffect(() => {
    if (!open) return;
    if (runningRef.current || (phase === "done" && result?.failed.length)) return;
    clearItems();
    setRounds([]);
    setMode("append");
    setAlsoShops(new Set());
    setTyped("");
    setPhase("pick");
    setResult(null);
    setErr(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shop.id]);
  useEffect(() => () => clearItems(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // รุ่นที่จับคู่ได้ (ติ๊กไว้ = เฉพาะที่ติ๊ก)
  const scope = useMemo(() => (scopeIds?.length ? new Set(scopeIds) : null), [scopeIds]);
  const parents = useMemo(() => (catalog ? (scope ? catalog.parents.filter((p) => scope.has(p.parentId)) : catalog.parents) : []), [catalog, scope]);
  const byId = useMemo(() => new Map(parents.map((p) => [p.parentId, p])), [parents]);
  const index = useMemo(() => buildCodeIndex(parents), [parents]);
  const fullIndex = useMemo(() => (catalog && scope ? buildCodeIndex(catalog.parents) : null), [catalog, scope]);

  const matchOf = (path: string): ImageMatch => {
    const m = matchImagePath(path, parents, index);
    // ติ๊กไว้บางตัว แต่ไฟล์เป็นของรุ่นที่ไม่ได้ติ๊ก → บอกให้ชัด (ไม่ใช่ "ไม่พบรหัส")
    if (m.status === "pick" && !m.parentId && catalog && fullIndex) {
      const full = matchImagePath(path, catalog.parents, fullIndex);
      const p = full.parentId ? catalog.parents.find((x) => x.parentId === full.parentId) : null;
      if (p) return { ...m, reason: `${p.code} ${scopeLabel ? tr("ไม่อยู่ในรายการนี้", "isn't in this list") : tr("ไม่ได้ติ๊กไว้", "isn't ticked")} — ${tr("ข้าม หรือเลือกช่องเอง", "skip it or pick a slot yourself")}` };
    }
    // 📥 รุ่นเดียว (ลากใส่แถว / ติ๊กตัวเดียว) + ไม่มีรหัสในร้าน = ของรุ่นนั้น · โฟลเดอร์เลขสี 01/ = สีนั้น
    if (m.status === "pick" && !m.parentId && scope && parents.length === 1) return matchIntoParent(path, parents[0]);
    return m;
  };

  // ↘ ลำดับต่อท้ายของรูปที่โยนเข้าแถว/ย้ายมาเอง (เพิ่มขึ้นเรื่อย ๆ = มาทีหลังอยู่ท้าย)
  const posSeq = useRef(1000);
  /** to = โยนเข้าแถวนั้นเลย (ไม่สนชื่อไฟล์) · ไม่ส่ง = จับคู่จากชื่อไฟล์/โฟลเดอร์ */
  const addFiles = (raw: File[], to?: { parentId: string; target: ImageTarget }) => {
    if (!catalog || phase !== "pick") return;
    const isVid = (f: File) => f.type.startsWith("video/") || isVideoName(f.name);
    const imgs = raw.filter((f) => isVid(f) || f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) return toast.warning(tr("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)", "Only image files (jpg / png / webp) or videos (mp4 / webm)"));
    if (imgs.some((f) => /\.mov$/i.test(f.name) || f.type === "video/quicktime")) toast.warning(tr("ไฟล์ .MOV บางไฟล์เล่นบน Chrome/Android ไม่ได้ — แนะนำแปลงเป็น MP4 (H.264)", "Some .MOV files don't play on Chrome/Android — converting to MP4 (H.264) is recommended"));
    const have = new Set(itemsRef.current.map((it) => `${it.path}|${it.file.size}`));
    const fresh = imgs.filter((f) => !have.has(`${filePathOf(f)}|${f.size}`));
    const room = MAX_WEB_MASS_FILES - itemsRef.current.length;
    if (fresh.length > room) toast.warning(tr(`ลงได้ครั้งละไม่เกิน ${MAX_WEB_MASS_FILES.toLocaleString()} ไฟล์ — รับ ${Math.max(0, room)} ไฟล์แรก`, `Up to ${MAX_WEB_MASS_FILES.toLocaleString()} files at a time — took the first ${Math.max(0, room)}`));
    const next = fresh.slice(0, Math.max(0, room)).map((file) => {
      const path = filePathOf(file);
      const video = isVid(file);
      const invalid = video && file.size > BIG_VIDEO_MAX_BYTES ? tr(`วิดีโอใหญ่เกิน ${fileMb(BIG_VIDEO_MAX_BYTES)} (${fileMb(file.size)}) — ตัดคลิปให้สั้นลง/ลดความละเอียด`, `Video is larger than ${fileMb(BIG_VIDEO_MAX_BYTES)} (${fileMb(file.size)}) — trim the clip or lower the resolution`) : undefined;
      const placed = to ? { manual: to, pos: posSeq.current++ } : {};
      return { id: `f${++seq.current}`, file, path, url: URL.createObjectURL(file), match: matchOf(path), video, invalid, ...placed } as Item;
    });
    if (next.length) setItems((xs) => [...xs, ...next]);
  };

  /** key แถว = targetKey (`<parentId>|g` · `|s:<skuId>` · `|h:<slot>` · `|sh:<skuId>:<slot>`) → สินค้า + ช่อง */
  const slotOfKey = (key: string) => {
    const i = key.indexOf("|");
    const target = i > 0 ? decT(key.slice(i + 1)) : null;
    return target ? { parentId: key.slice(0, i), target } : null;
  };
  // ⇄ ย้ายรูปทีละรูปไปแถวอื่น (ลากข้ามแถว / เลือก "ย้ายไป…") — ต่อท้ายแถวปลายทาง
  const moveOneTo = (id: string, key: string) => {
    const to = slotOfKey(key);
    const it = itemsRef.current.find((x) => x.id === id);
    if (!to || !it) return;
    if (it.video && to.target.kind !== "hero" && to.target.kind !== "skuHero") return toast.warning(tr("วิดีโอลงได้เฉพาะช่อง Hero", "Videos can only go in Hero slots"));
    const pos = posSeq.current++;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, manual: to, pos, skip: false } : x)));
  };
  // 📥 ลากไฟล์จากเครื่องมาวางบนแถวไหน = เข้าแถวนั้นเลย (แถวว่างของสีที่ยังไม่มีรูปก็วางได้)
  const slotDrop = useFileDrop(
    (files, key) => {
      const to = slotOfKey(key);
      if (to) addFiles(files, to);
    },
    {
      accept: ["image/", "video/"],
      folders: true,
      disabled: phase !== "pick" || !catalog,
      onReject: () => toast.warning(tr("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)", "Only image files (jpg / png / webp) or videos (mp4 / webm)")),
      onBusy: () => toast.info(tr("กำลังอัปโหลดอยู่ รอสักครู่", "Uploading — please wait")),
    }
  );

  // 📥 ไฟล์ที่ลากมาวางบนแถวสินค้า → ใส่ให้ครั้งเดียวหลังโหลดรายการเสร็จ
  const fedRef = useRef<File[] | null>(null);
  useEffect(() => {
    if (!open || !catalog || phase !== "pick" || !initialFiles?.length || fedRef.current === initialFiles) return;
    fedRef.current = initialFiles;
    addFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalog, phase, initialFiles]);

  const drop = useFileDrop((files) => addFiles(files), {
    accept: ["image/", "video/"],
    folders: true,
    disabled: phase !== "pick" || !catalog,
    onReject: () => toast.warning(tr("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)", "Only image files (jpg / png / webp) or videos (mp4 / webm)")),
    onBusy: () => toast.info(catalog ? tr("กำลังอัปโหลดอยู่ รอสักครู่", "Uploading — please wait") : tr("กำลังโหลดรายการสินค้า รอสักครู่", "Loading products — please wait")),
  });

  // ผลจับคู่ + ที่เลือกเอง → แผนลงรูป
  const plan = useMemo(() => {
    const ins = items.map((it) => {
      const m = it.manual;
      const base = { video: it.video, invalid: it.invalid };
      const order = it.pos ?? it.match.order;
      const at = m ? { parentId: m.parentId, target: m.target } : { parentId: it.match.parentId, target: it.match.target };
      return { ...base, id: it.id, name: it.path, ...at, order, ...(it.skip ? { skip: true } : {}) };
    });
    return planImageUpload(ins, parents, mode);
  }, [items, parents, mode]);
  const planById = useMemo(() => new Map(plan.files.map((f) => [f.id, f])), [plan]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  // 🖼 รูปพรีวิวย่อ (สูง 160px) + ลายนิ้วมือหน้าตารูป (lib/image-hash) + ลายนิ้วมือไฟล์ (sha256 · หาไฟล์เดียวกันในชุด) — ถอดรหัสครั้งเดียวต่อไฟล์ ทีละ 3 รูป · ส่งเข้า state ทุก 250 ms
  useEffect(() => {
    const want = items.filter((it) => !it.video && !it.invalid && !prepAsked.current.has(it.id));
    if (!want.length) return;
    want.forEach((it) => prepAsked.current.add(it.id));
    const pv: Record<string, string> = {};
    const pr: Record<string, LookHash | null> = {};
    const sm: Record<string, string | null> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const alive = new Set(itemsRef.current.map((x) => x.id));
      const a: [string, string][] = [];
      for (const [id, u] of Object.entries(pv)) {
        if (alive.has(id)) a.push([id, u]);
        else URL.revokeObjectURL(u);
        delete pv[id];
      }
      const b = Object.entries(pr).filter(([id]) => alive.has(id));
      for (const id of Object.keys(pr)) delete pr[id];
      const s = Object.entries(sm).filter(([id]) => alive.has(id));
      for (const id of Object.keys(sm)) delete sm[id];
      if (a.length) setPreviews((m) => ({ ...m, ...Object.fromEntries(a) }));
      if (b.length) setLooks((m) => ({ ...m, ...Object.fromEntries(b) }));
      if (s.length) setSums((m) => ({ ...m, ...Object.fromEntries(s) }));
    };
    let next = 0;
    const worker = async () => {
      while (next < want.length) {
        const it = want[next++];
        if (!itemsRef.current.some((x) => x.id === it.id)) continue;
        let url: string | null = null;
        let vp: LookHash | null = null;
        try {
          const bm = await createImageBitmap(it.file, { resizeHeight: 160, resizeQuality: "medium" });
          const c = document.createElement("canvas");
          c.width = bm.width;
          c.height = bm.height;
          c.getContext("2d")?.drawImage(bm, 0, 0);
          bm.close();
          const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.8));
          if (blob) url = URL.createObjectURL(blob);
          // ลายนิ้วมือหน้าตารูป (ตัวเดียวกับคลัง · ย่อจากไฟล์เต็มเหลือ 256px บนพื้นขาว) — รูปเรียบ/ถอดรหัสไม่ได้ = null ไม่เทียบ
          vp = await lookHashOfBlob(it.file);
        } catch {
          /* ถอดรหัสไม่ได้ (เช่น HEIC) = โชว์ไฟล์เต็ม · ไม่เทียบหน้าตา */
        }
        pv[it.id] = url ?? it.url;
        pr[it.id] = vp;
        sm[it.id] = await it.file.arrayBuffer().then(sha256Hex).catch(() => null);
        if (!timer) timer = setTimeout(flush, 250);
      }
    };
    void Promise.all(Array.from({ length: 3 }, worker)).then(() => {
      if (timer) clearTimeout(timer);
      flush();
    });
  }, [items]);
  // 🔁 ตรวจรูปที่มีในคลังแล้ว (ของกลาง findDuplicateMatches) — ระหว่างดูรายการ ยังไม่ส่งไฟล์ขึ้น (รูปที่กดไม่ลงจะไม่ถูกอัปเลย)
  //    ย่อแบบเดียวกับตอนอัปจริง → ลายนิ้วมือไฟล์ตรงกัน · ทีละ LIB_BATCH ไฟล์ · ตรวจไม่ได้ = อัปตามปกติ
  useEffect(() => {
    if (phase !== "pick") return;
    const want = items.filter((it) => !it.video && !it.invalid && !libAsked.current.has(it.id));
    if (!want.length) return;
    want.forEach((it) => libAsked.current.add(it.id));
    void (async () => {
      for (let i = 0; i < want.length; i += LIB_BATCH) {
        const batch = want.slice(i, i + LIB_BATCH).filter((it) => libAsked.current.has(it.id));
        if (!batch.length) continue;
        const got: Record<string, DuplicateMatch | null> = {};
        const cands: { id: string; file: File; original: File }[] = [];
        for (const it of batch) {
          try {
            cands.push({ id: it.id, file: await prepareResizedImage(it.file, UPLOAD_MAX), original: it.file });
          } catch {
            got[it.id] = null; // ถอดรหัสไม่ได้ (เช่น HEIC) = ไม่ตรวจ
          }
        }
        const res = cands.length ? await findDuplicateMatches(cands) : [];
        cands.forEach((c, k) => {
          got[c.id] = res[k] ?? null;
        });
        setLibDup((m) => ({ ...m, ...got }));
      }
    })();
  }, [items, phase]);
  /** key รูปเดิมในคลังที่จะใช้แทนการอัป (null = อัปตามปกติ) */
  const reuseOf = (id: string): string | null => {
    const m = libDup[id];
    if (!m) return null;
    return (libUse[id] ?? m.decision !== "new") ? m.match.r2_key : null;
  };

  const uploadIds = plan.dests.flatMap((d) => d.fileIds);
  const touched = [...new Set(plan.dests.map((d) => d.parentId))];
  const needLook = plan.files.filter((f) => f.plan !== "upload" && f.plan !== "skip");
  // ⏭ ข้ามไว้ — จัดกลุ่มตามแถวที่จะลง (เอากลับทีละกลุ่ม)
  const skipped = useMemo(() => {
    const g = new Map<string, { parentId: string | null; target: ImageTarget | null; ids: string[] }>();
    for (const f of plan.files) {
      if (f.plan !== "skip") continue;
      const k = `${f.parentId ?? ""}|${encT(f.target)}`;
      const x = g.get(k) ?? { parentId: f.parentId, target: f.target, ids: [] };
      x.ids.push(f.id);
      g.set(k, x);
    }
    return [...g.entries()].map(([key, x]) => ({ key, ...x }));
  }, [plan]);
  const countOf = (p: PlanFile["plan"]) => plan.files.filter((f) => f.plan === p).length;
  const needConfirm = mode === "replace" && touched.length > CONFIRM_OVER;

  // 👀 รูปเดิมบนเว็บของสินค้าที่จะลง (รูปบนเว็บ + รูปสี · ไม่รวม Hero) → ลายนิ้วมือจากรูปย่อ 96px (ทีละ 6 · สูงสุด 800)
  const oldOf = useMemo(() => {
    const by = new Map<string, { key: string; where: string }[]>();
    for (const p of parents) {
      const list = p.webImages.map((key, i) => ({ key, where: t(`รูปบนเว็บ ${p.code} รูปที่ ${i + 1}`, `web image ${p.code} #${i + 1}`) }));
      for (const sk of p.skus) sk.webImages.forEach((key, i) => list.push({ key, where: t(`รูปสี ${sk.code} รูปที่ ${i + 1}`, `color image ${sk.code} #${i + 1}`) }));
      by.set(p.parentId, list);
    }
    return by;
  }, [parents, t]);
  const touchedKey = touched.join(",");
  useEffect(() => {
    if (mode !== "append" || !touchedKey) return;
    const want = touchedKey
      .split(",")
      .flatMap((pid) => oldOf.get(pid) ?? [])
      .map((o) => o.key)
      .filter((k) => !isVideoName(k) && !oldAsked.current.has(k))
      .slice(0, Math.max(0, OLD_PRINT_MAX - oldAsked.current.size));
    if (!want.length) return;
    want.forEach((k) => oldAsked.current.add(k));
    const got: Record<string, LookHash | null> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const b = { ...got };
      for (const k of Object.keys(got)) delete got[k];
      if (Object.keys(b).length) setOldLooks((m) => ({ ...m, ...b }));
    };
    let next = 0;
    const worker = async () => {
      while (next < want.length) {
        const key = want[next++];
        let vp: LookHash | null = null;
        try {
          // กว้าง 320 ≥ LOOK_SIZE → ลายนิ้วมือใกล้กับที่คิดจากไฟล์เต็ม
          const r = await fetch(r2ImageUrl(key, 320) ?? "");
          if (r.ok) vp = await lookHashOfBlob(await r.blob());
        } catch {
          /* โหลดรูปเดิมไม่ได้ = ไม่เทียบรูปนั้น */
        }
        got[key] = vp;
        if (!timer) timer = setTimeout(flush, 300);
      }
    };
    void Promise.all(Array.from({ length: 6 }, worker)).then(() => {
      if (timer) clearTimeout(timer);
      flush();
    });
  }, [touchedKey, oldOf, mode]);
  const dupOf = useMemo(() => {
    const out = new Map<string, Dup>();
    if (mode !== "append") return out;
    for (const d of plan.dests) {
      if (d.target.kind === "hero" || d.target.kind === "skuHero") continue;
      // คลังบอกว่าเป็นไฟล์เดียวกับรูปที่อยู่บนเว็บสินค้านี้แล้ว = ซ้ำเดิมแน่นอน (ไม่ต้องรอเทียบหน้าตา)
      const webOld = oldOf.get(d.parentId) ?? [];
      for (const id of d.fileIds) {
        const k = libDup[id]?.match.r2_key;
        const o = k ? webOld.find((x) => x.key === k) : undefined;
        if (o) out.set(id, { where: o.where });
      }
      const olds = webOld.filter((o) => oldLooks[o.key]);
      if (!olds.length) continue;
      for (const id of d.fileIds) {
        const vp = looks[id];
        if (!vp || out.has(id)) continue;
        const o = olds.find((x) => isLookAlike(vp, oldLooks[x.key] as LookHash));
        if (o) out.set(id, { where: o.where });
      }
    }
    return out;
  }, [plan, oldOf, oldLooks, looks, mode, libDup]);
  const dupSameIds = [...dupOf.keys()];
  const imgTotal = items.filter((it) => !it.video && !it.invalid).length;
  const imgPrepped = items.filter((it) => !it.video && !it.invalid && it.id in looks).length;
  const oldPending = mode === "append" ? [...oldAsked.current].filter((k) => !(k in oldLooks)).length : 0;
  // 🔁 สรุปรูปที่มีในคลัง (เฉพาะไฟล์ที่จะลง) · ใช้รูปเดิม = ไม่ต้องอัป
  const libChecked = items.filter((it) => !it.video && !it.invalid && it.id in libDup).length;
  const libIds = uploadIds.filter((id) => libDup[id]);
  const reuseIds = libIds.filter((id) => reuseOf(id));
  const reuseBytes = reuseIds.reduce((s, id) => s + (libDup[id]?.match.size_bytes ?? 0), 0);
  const setLibUseMany = (ids: string[], use: boolean) => setLibUse((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, use])) }));

  // 🔁 รูปซ้ำกันเองในชุดที่ลากมา (ยังไม่อัป · เทียบในเครื่อง) — ไฟล์เดียวกันเป๊ะ (sha256 · ทุกสินค้า) หรือหน้าตาเหมือน (ลายนิ้วมือภาพ · เฉพาะในสินค้าเดียวกัน)
  //    รูปแรกตามลำดับแถว = ตัวหลัก · รูปถัดไปที่ซ้ำ = ป้ายบอกว่าเหมือนรูปไหน · ไม่รวม Hero (ใช้รูปเดียวกับแกลเลอรีได้ตามปกติ) · เตือนอย่างเดียว ไม่ข้ามเอง
  const twinOf = useMemo(() => {
    const out = new Map<string, Twin>();
    const firstBySum = new Map<string, Twin>();
    const firstsByParent = new Map<string, { id: string; at: Twin }[]>();
    for (const d of plan.dests) {
      if (d.target.kind === "hero" || d.target.kind === "skuHero") continue;
      const base = d.replaces ? 0 : d.existing;
      d.fileIds.forEach((id, i) => {
        const at: Twin = { of: id, destKey: d.key, parentId: d.parentId, num: base + i + 1, exact: false };
        const s = sums[id];
        const vp = looks[id];
        let hit = s ? firstBySum.get(s) : undefined;
        if (hit) hit = { ...hit, exact: true };
        else if (vp) {
          const o = (firstsByParent.get(d.parentId) ?? []).find((x) => looks[x.id] && isLookAlike(vp, looks[x.id] as LookHash));
          if (o) hit = o.at;
        }
        if (hit) return void out.set(id, hit);
        if (s) firstBySum.set(s, at);
        const list = firstsByParent.get(d.parentId) ?? [];
        list.push({ id, at });
        firstsByParent.set(d.parentId, list);
      });
    }
    return out;
  }, [plan, sums, looks]);
  const destByKey = useMemo(() => new Map(plan.dests.map((d) => [d.key, d])), [plan]);
  const destOfFile = useMemo(() => new Map(plan.dests.flatMap((d) => d.fileIds.map((id) => [id, d.key] as const))), [plan]);
  /** ป้ายสั้นของแถว เช่น "-01" (สีในรุ่นเดียวกัน) · "TTM091-01" (คนละรุ่น) · "รูปบนเว็บ" */
  const rowShort = (destKey: string, fromParentId: string) => {
    const d = destByKey.get(destKey);
    const p = d ? byId.get(d.parentId) : undefined;
    if (!d || !p) return "?";
    if (d.target.kind !== "sku") return d.parentId === fromParentId ? t("รูปบนเว็บ", "Web images") : `${p.code} ${t("รูปบนเว็บ", "Web images")}`;
    const skuId = d.target.skuId;
    const code = p.skus.find((x) => x.id === skuId)?.code ?? "?";
    return d.parentId === fromParentId && code.startsWith(p.code) ? code.slice(p.code.length) || code : code;
  };
  const twinIds = uploadIds.filter((id) => twinOf.has(id));
  const sameRowTwinIds = twinIds.filter((id) => twinOf.get(id)?.destKey === destOfFile.get(id));
  /** ไฟล์ที่จะอัปจริง (ไม่นับที่ใช้รูปเดิมในคลัง · ไฟล์เดียวกันเป๊ะนับครั้งเดียว) */
  const uploadReal = new Set(uploadIds.filter((id) => !reuseOf(id)).map((id) => sums[id] ?? id)).size;

  // ร้านอื่นที่มีรุ่นที่จะลงรูป
  const otherShops = useMemo(() => {
    if (!catalog) return [];
    return catalog.otherShops
      .map((s) => ({ ...s, has: touched.filter((id) => byId.get(id)?.otherShopIds.includes(s.id)).length }))
      .filter((s) => s.has > 0);
  }, [catalog, touched, byId]);

  const setManual = (id: string, manual: Item["manual"]) => setItems((xs) => xs.map((it) => (it.id === id ? { ...it, manual, skip: false } : it)));
  // ✕ ไม่ลง / ↩ เอากลับ (หลายไฟล์ทีเดียว)
  const setSkip = (ids: string[], skip: boolean) => {
    const set = new Set(ids);
    setItems((xs) => xs.map((it) => (set.has(it.id) ? { ...it, skip } : it)));
  };
  const skipMany = (ids: string[], what: string) => {
    if (!ids.length) return;
    setSkip(ids, true);
    toast.action(t(`ไม่ลง ${ids.length} รูป · ${what} — อยู่ในกล่อง "ข้ามไว้" ด้านล่าง`, `Skipped ${ids.length} images · ${what} — see the "Skipped" box below`), t("เอากลับ", "Undo"), () => setSkip(ids, false));
  };
  // ↕ สลับลำดับ (เลขตามลำดับใหม่ · ทับเลขท้ายชื่อไฟล์) — แถวอื่นชนิดเดียวกัน "ตำแหน่งเดียวกัน" สลับตามตามที่ตั้งไว้
  const reorderDest = (d: PlanDest, from: number, to: number) => {
    if (from === to) return;
    const rows =
      linkReorder === "row" ? [d] : plan.dests.filter((x) => x.target.kind === d.target.kind && (linkReorder === "all" || x.parentId === d.parentId));
    const pos = new Map<string, number>();
    let n = 0;
    for (const r of rows) {
      // แถวที่รูปไม่ถึงตำแหน่งนั้น = ไม่แตะ
      if (r.key !== d.key && Math.max(from, to) >= r.fileIds.length) continue;
      moveItem(r.fileIds, from, to).forEach((id, i) => pos.set(id, i + 1));
      n++;
    }
    setItems((xs) => xs.map((it) => (pos.has(it.id) ? { ...it, pos: pos.get(it.id) } : it)));
    if (n > 1) toast.info(t(`สลับลำดับพร้อมกัน ${n} แถว (รูปใหม่ลำดับที่ ${from + 1} → ${to + 1})`, `Reordered ${n} rows together (new image ${from + 1} → ${to + 1})`));
  };
  const linkable = plan.dests.filter((x) => x.fileIds.length > 1).length > 1;
  // ✎ ระบบอ่านชื่อผิด → ย้ายรูปทั้งแถวไปสินค้า/ช่องที่เลือกเอง
  const [editDest, setEditDest] = useState<{ key: string; pid: string } | null>(null);
  // รูปที่ย้ายมา = ต่อท้ายแถวปลายทาง (คงลำดับเดิมของแถวที่ย้าย)
  const moveFiles = (ids: string[], parentId: string, target: ImageTarget | null) =>
    setItems((xs) => xs.map((it) => { const i = ids.indexOf(it.id); return i >= 0 ? { ...it, manual: { parentId, target }, pos: 1000 + i } : it; }));
  // 🔁 เปลี่ยนสินค้าทั้งรุ่น — สีจับคู่ตามเลขสีเดิม (PIX01-02 → PIX04-02) · รุ่นใหม่ไม่มีสีนั้น = ไปรอเลือกช่องในกล่อง "ไฟล์ที่ต้องดู"
  const changeProduct = (fromPid: string, toPid: string) => {
    const from = byId.get(fromPid);
    const to = byId.get(toPid);
    if (!from || !to) return;
    const tail = (code: string, base: string) => {
      const up = code.toUpperCase();
      const b = base.toUpperCase();
      return up.startsWith(b) ? up.slice(b.length) : (up.match(/-[^-]+$/)?.[0] ?? up);
    };
    const mapSku = (skuId: string) => {
      const sk = from.skus.find((x) => x.id === skuId);
      if (!sk) return null;
      const t = tail(sk.code, from.code);
      return to.skus.find((x) => tail(x.code, to.code) === t)?.id ?? null;
    };
    const moving = new Map(plan.files.filter((pf) => pf.parentId === fromPid && pf.plan !== "skip").map((pf) => [pf.id, pf.target]));
    let lost = 0;
    setItems((xs) =>
      xs.map((it) => {
        if (!moving.has(it.id)) return it;
        const t = moving.get(it.id) ?? null;
        let nt: ImageTarget | null = null;
        if (t?.kind === "gallery" || t?.kind === "hero") nt = t;
        else if (t?.kind === "sku") { const sk = mapSku(t.skuId); nt = sk ? { kind: "sku", skuId: sk } : null; }
        else if (t?.kind === "skuHero") { const sk = mapSku(t.skuId); nt = sk ? { kind: "skuHero", skuId: sk, slot: t.slot } : { kind: "hero", slot: t.slot }; }
        if (!nt) lost++;
        return { ...it, manual: { parentId: toPid, target: nt } };
      })
    );
    setEditDest(null);
    toast.info(t(`ย้ายรูป ${moving.size} ไฟล์จาก ${from.code} ไป ${to.code} แล้ว${lost ? ` — ${lost} ไฟล์รุ่นใหม่ไม่มีสีเดียวกัน ให้เลือกช่องในกล่อง "ไฟล์ที่ต้องดู"` : ""}`, `Moved ${moving.size} files from ${from.code} to ${to.code}${lost ? ` — ${lost} files have no matching color in the new model; pick a slot in the "Files to check" box` : ""}`));
  };
  /** ชื่อช่องแบบบอกชัด: ลงที่ไหน · SKU อะไร */
  const destLabel = (t: ImageTarget, p: Parent): { title: string; sub: string } => {
    const sk = (id: string) => p.skus.find((x) => x.id === id);
    if (t.kind === "gallery") return { title: tr("🖼 รูปบนเว็บ (รวมทั้งรุ่น)", "🖼 Web images (whole model)"), sub: `${p.code} · ${tr("โชว์ตอนลูกค้ายังไม่เลือกสี", "shown before a color is picked")}` };
    if (t.kind === "sku") { const x = sk(t.skuId); return { title: `🎨 ${tr("รูปสี", "Color images")} · ${x?.code ?? "?"}`, sub: x?.label ?? "" }; }
    if (t.kind === "hero") return { title: `🎬 Hero ${t.slot === "desktop" ? tr("คอม", "desktop") : tr("มือถือ", "mobile")}`, sub: tr(`รูปเปิดหน้าสินค้า ${p.code}`, `Product page opener ${p.code}`) };
    const x = sk(t.skuId);
    return { title: `🎬 Hero ${t.slot === "desktop" ? tr("คอม", "desktop") : tr("มือถือ", "mobile")} · ${x?.code ?? "?"}`, sub: tr(`รูปเปิดเมื่อเลือกสี${x?.label ?? ""}`, `Opener when color ${x?.label ?? ""} is picked`) };
  };
  /** ตัวเลือกช่องรูปของสินค้า (value = encT) — ใช้ร่วม: ย้ายทั้งแถว · ไฟล์ที่ต้องดู · ⇄ ย้ายทีละรูป */
  const slotOptionList = (p: Parent, video: boolean): { value: string; label: string }[] => [
    ...(!video ? [{ value: "g", label: tr("🖼 รูปบนเว็บ (รวมทั้งรุ่น)", "🖼 Web images (whole model)") }] : []),
    ...(!video ? p.skus.map((x) => ({ value: `s:${x.id}`, label: `🎨 ${tr("รูปสี", "Color images")} ${x.code} ${x.label}` })) : []),
    { value: "h:desktop", label: tr("🎬 Hero คอม", "🎬 Hero desktop") },
    { value: "h:mobile", label: tr("🎬 Hero มือถือ", "🎬 Hero mobile") },
    ...(video ? p.skus.flatMap((x) => (["desktop", "mobile"] as const).map((slot) => ({ value: `sh:${x.id}:${slot}`, label: targetLabel({ kind: "skuHero", skuId: x.id, slot }, p) }))) : []),
  ];
  const slotOptions = (p: Parent, video: boolean) => (
    <>
      {slotOptionList(p, video).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </>
  );

  const run = async (retry = false) => {
    setErr(null);
    if (runningRef.current) return;
    const prev = retry ? result : null;
    if (retry && !prev?.failed.length) return;
    if (!retry && !uploadIds.length) return setErr(tr("ยังไม่มีรูปที่จะลง", "No images to upload yet"));
    if (!retry && needConfirm && typed !== "CONFIRM") return setErr(tr(`แทนที่รูป ${touched.length} สินค้าพร้อมกัน — พิมพ์ CONFIRM ก่อน`, `Replacing images of ${touched.length} products at once — type CONFIRM first`));
    if (!retry) {
      keysRef.current = new Map();
      savedDestRef.current = new Set();
      runPlanRef.current = plan.dests;
      // 🔁 ใช้รูปเดิมในคลัง → ใส่ key เดิมไว้ก่อน (ตัวอัปข้ามไฟล์ที่มี key แล้ว = ไม่อัปไฟล์ซ้ำ)
      for (const id of uploadIds) {
        const k = reuseOf(id);
        if (k) keysRef.current.set(id, k);
      }
    }
    const want = prev ? new Set(prev.failed.map((x) => x.id)) : null;
    const dests = runPlanRef.current.map((d) => (want ? { ...d, fileIds: d.fileIds.filter((id) => want.has(id)) } : d)).filter((d) => d.fileIds.length);
    const rs = splitRounds(dests, ROUND_PRODUCTS);
    const total = dests.reduce((n, d) => n + d.fileIds.length, 0);
    const files = new Map(itemsRef.current.map((it) => [it.id, it]));
    const shopIds = [shop.id, ...[...alsoShops].filter((x) => otherShops.some((o) => o.id === x))];
    const view: RoundView[] = rs.map((r) => ({ codes: r.parentIds.map((pid) => byId.get(pid)?.code ?? "?"), files: r.dests.reduce((n, d) => n + d.fileIds.length, 0), status: "wait" }));
    const setStatus = (i: number, status: RoundView["status"]) => {
      view[i] = { ...view[i], status };
      setRounds([...view]);
    };
    setRounds([...view]);
    setResult(null);
    setPhase("uploading");
    setProgress({ done: 0, total });
    runningRef.current = true;
    // ปิดแท็บระหว่างลง = งานหยุด → เตือนก่อน (ไปหน้าอื่นใน ERP ได้ งานวิ่งต่อ)
    const warnLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warnLeave);
    const failed = new Map<string, string>();
    const prevOk = prev?.ok ?? 0;
    let ok = prevOk;
    let updated = prev?.updated ?? 0;
    let otherShopFails = prev?.otherShopFails ?? 0;
    let skippedShops = prev?.skippedShops ?? 0;
    let done = 0;
    const keyOf = (id: string) => keysRef.current.get(id) ?? null;
    const isVid = (id: string) => !!files.get(id)?.video;
    // 🔁 ไฟล์เดียวกันเป๊ะในชุด (sha256 ตรงกัน) → อัปครั้งเดียว ไฟล์อื่นรอใช้ key เดียวกัน (กันตัวอัป 3 ตัวอัปซ้ำพร้อมกัน)
    const fileSums = sums;
    const sameFileUpload = new Map<string, Promise<string>>();
    const uploadImageOnce = (id: string, file: File) => {
      const s = fileSums[id];
      const hit = s ? sameFileUpload.get(s) : undefined;
      if (hit) return hit;
      const p = uploadResizedImage(file, { folder: "storefront-products", max: UPLOAD_MAX }).then((r) => r.r2_key);
      if (s) sameFileUpload.set(s, p);
      return p;
    };
    const finish = () => {
      window.removeEventListener("beforeunload", warnLeave);
      runningRef.current = false;
      const failList = [...failed].map(([id, why]) => ({ id, name: files.get(id)?.path ?? id, why }));
      setResult({ ok, failed: failList, updated, otherShopFails, skippedShops });
      setPhase("done");
      setVideoPct(null);
      void onDone();
      return failList;
    };
    runBackgroundTask({
      label: tr(`ลงรูปเว็บ ${total} ไฟล์ · ${shop.name}${retry ? " (ลงซ้ำ)" : ""}`, `Web image upload ${total} files · ${shop.name}${retry ? " (retry)" : ""}`),
      total,
      run: async (report) => {
        try {
          for (let ri = 0; ri < rs.length; ri++) {
            setStatus(ri, "run");
            const ids = rs[ri].dests.flatMap((d) => d.fileIds);
            let next = 0;
            const worker = async () => {
              while (next < ids.length) {
                const id = ids[next++];
                const it = files.get(id);
                if (!it) failed.set(id, tr("ไม่พบไฟล์ — ลากมาใหม่", "File not found — drop it again"));
                else if (!keysRef.current.has(id)) {
                  try {
                    // วิดีโอ: ตัวอัปกลางตัวเดียวกับช่อง Hero ทีละตัว (≤ 4 MB ผ่าน ERP · ใหญ่กว่านั้นส่งตรงเข้า R2 มีแถบ %)
                    if (it.video) keysRef.current.set(id, await uploadMediaFile(it.file, { folder: "storefront-hero", onProgress: (pct) => setVideoPct(pct) }));
                    else keysRef.current.set(id, await uploadImageOnce(id, it.file));
                  } catch (e) {
                    // สาเหตุจริง (เปิดรูปไม่ได้เพราะอะไร / เซิร์ฟเวอร์ตอบอะไร) — lib/image-open-error
                    failed.set(id, uploadErrorText(e));
                  } finally {
                    if (it.video) setVideoPct(null);
                  }
                }
                done++;
                setProgress({ done, total });
                report(done, total);
              }
            };
            await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
            // บันทึกรอบนี้ลงเว็บทันที: ช่องที่ยังไม่เคยบันทึก = ตามโหมดที่เลือก · ช่องที่บันทึกแล้ว (ลงซ้ำ) = ต่อท้าย
            const groups: [PlanDest[], MassMode][] = [
              [rs[ri].dests.filter((d) => !savedDestRef.current.has(d.key)), mode],
              [rs[ri].dests.filter((d) => savedDestRef.current.has(d.key)), "append"],
            ];
            for (const [group, m] of groups) {
              const body = buildMassItems(group, keyOf, isVid);
              if (!body.length) continue;
              const got = (d: PlanDest) => d.fileIds.filter((id) => keyOf(id));
              try {
                const r = await apiFetch("/api/website/listings/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopIds, mode: m, items: body }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j?.error || tr("บันทึกไม่สำเร็จ", "Save failed"));
                updated += Number(j.updated) || 0;
                const fails: { shopId: string; parentId: string }[] = Array.isArray(j.failed) ? j.failed : [];
                const mine = new Set(fails.filter((x) => x.shopId === shop.id).map((x) => x.parentId));
                otherShopFails += fails.filter((x) => x.shopId !== shop.id).length;
                skippedShops += Array.isArray(j.skipped) ? j.skipped.filter((x: { shopId: string }) => x.shopId !== shop.id).length : 0;
                for (const d of group) {
                  const ids2 = got(d);
                  if (!ids2.length) continue;
                  if (mine.has(d.parentId)) ids2.forEach((id) => failed.set(id, tr("บันทึกลงเว็บไม่สำเร็จ", "Couldn't save to the website")));
                  else {
                    savedDestRef.current.add(d.key);
                    ok += ids2.length;
                  }
                }
              } catch (e) {
                for (const d of group) got(d).forEach((id) => failed.set(id, `${tr("บันทึกลงเว็บไม่สำเร็จ", "Couldn't save to the website")}: ${(e as Error).message}`));
              }
            }
            const bad = ids.filter((id) => failed.has(id)).length;
            setStatus(ri, bad === 0 ? "ok" : bad === ids.length ? "fail" : "part");
          }
        } catch (e) {
          setErr((e as Error).message || tr("เกิดข้อผิดพลาด", "Something went wrong"));
        }
        const failList = finish();
        const runOk = ok - prevOk;
        if (failList.length || otherShopFails) toast.warning(tr(`ลงรูปเสร็จ แต่ยังไม่ขึ้นเว็บ ${failList.length} ไฟล์ — เปิดหน้าต่าง ลงรูปเว็บทีละมาก แล้วกด "ลงซ้ำเฉพาะที่พลาด"`, `Upload finished, but ${failList.length} files aren't live yet — open Bulk image upload and press "Retry failed only"`));
        else toast.success(tr(`ลงรูป ${runOk} ไฟล์แล้ว — เว็บเปลี่ยนตามทันที`, `Uploaded ${runOk} files — the website updates right away`));
        return { ok: runOk, fail: failList.length, message: failList.length ? tr(`ขึ้นเว็บ ${runOk} · ยังไม่ขึ้น ${failList.length}`, `Live ${runOk} · not yet ${failList.length}`) : tr(`ลงครบ ${runOk} ไฟล์`, `All ${runOk} files uploaded`) };
      },
    });
  };

  const busy = phase === "uploading";
  const close = () => {
    if (busy) toast.info(t("ลงรูปต่อเบื้องหลัง — ดูความคืบหน้าที่กล่องมุมขวาล่าง (ไปหน้าอื่นได้ แต่อย่าปิดแท็บเบราว์เซอร์)", "Uploading in the background — see progress in the bottom-right box (you can go to other pages, but don't close the browser tab)"));
    onClose();
  };

  /** moveIn = ⇄ "ย้ายไป…" ช่องอื่นของสินค้านั้น (ทีละรูป · ใช้แทนการลากบนมือถือ) */
  const thumb = (id: string, opts: { muted?: boolean; onSkip?: () => void; handle?: Record<string, unknown>; index?: number; onMove?: (dir: -1 | 1) => void; canPrev?: boolean; canNext?: boolean; moveIn?: { p: Parent; current: string } } = {}) => {
    const it = itemById.get(id);
    if (!it) return null;
    const parts = it.path.split("/");
    const fileName = parts.pop();
    const folder = parts.pop();
    const src = previews[id];
    const dup = dupOf.get(id);
    // 🔁 ซ้ำกันเองในชุดนี้ (ป้ายเดียวต่อรูป: ซ้ำเดิมบนเว็บ → ซ้ำในชุด → มีในคลัง) · ซ้ำในแถวเดียวกัน = แดง · ข้ามแถว = เหลือง
    const twin = !dup ? twinOf.get(id) : undefined;
    const myDest = destOfFile.get(id);
    const twinSameRow = !!twin && twin.destKey === myDest;
    const twinLabel = twin ? (twinSameRow ? `${t("ซ้ำ", "Dup")} #${twin.num}` : `= ${rowShort(twin.destKey, destByKey.get(myDest ?? "")?.parentId ?? "")} #${twin.num}`) : "";
    const twinTip = twin
      ? t(`${twin.exact ? "ไฟล์เดียวกันกับ" : "หน้าตาเหมือน"}${twinSameRow ? "รูปที่ " : `แถว ${rowShort(twin.destKey, "")} รูปที่ `}${twin.num} ในชุดที่ลากมา${twin.exact ? "\nถ้าลงทั้งคู่ ไฟล์นี้อัปครั้งเดียวแล้วใช้ร่วมกัน" : ""}`, `${twin.exact ? "Same file as" : "Looks like"} ${twinSameRow ? "image " : `row ${rowShort(twin.destKey, "")} image `}#${twin.num} in this batch${twin.exact ? "\nIf both are uploaded, this file is uploaded once and shared" : ""}`)
      : "";
    // 🔁 มีในคลังแล้ว (ที่อื่น) — กดป้ายสลับ ใช้รูปเดิม ↔ อัปใหม่ · ชี้รูปกลมเล็ก = ดูรูปเดิมในคลัง
    const lib = !dup && !twin && !it.video ? libDup[id] : null;
    const useLib = !!lib && !!reuseOf(id);
    const libTip = lib
      ? t(`${lib.kind === "look" ? "รูปหน้าตาเหมือนกัน" : "รูปนี้"}มีในคลังแล้ว: ${lib.match.file_name ?? lib.match.r2_key}${lib.match.usedIn.length ? `\nใช้อยู่ที่ ${lib.match.usedIn.join(", ")}` : ""}${lib.unsure ? "\nรายละเอียดต่างกันนิดหน่อย — ตรวจด้วยตาก่อน" : ""}\n${useLib ? "ตอนลงจะใช้รูปเดิม (ไม่อัปซ้ำ)" : "ตอนลงจะอัปรูปนี้ใหม่"} — กดเพื่อสลับ`, `${lib.kind === "look" ? "A look-alike image" : "This image"} is already in the library: ${lib.match.file_name ?? lib.match.r2_key}${lib.match.usedIn.length ? `\nUsed in ${lib.match.usedIn.join(", ")}` : ""}${lib.unsure ? "\nSlightly different details — check by eye first" : ""}\n${useLib ? "Will use the existing file (no re-upload)" : "Will upload this image again"} — click to switch`)
      : "";
    return (
      <div key={id} className={`group relative w-16 shrink-0 ${opts.muted ? "opacity-50" : ""}`} title={dup ? `${it.path}\n${t(`หน้าตาเหมือน${dup.where} (ดูรูปจางด้านซ้าย)`, `Looks like ${dup.where} (see the faded image on the left)`)}` : it.path}>
        {it.video ? (
          <>
            <video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" className="h-20 w-16 rounded-md border border-slate-200 object-cover bg-slate-800" />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">🎬 {fileMb(it.file.size)}</span>
          </>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} {...(opts.handle ?? {})} title={opts.handle ? t("กดค้างแล้วลาก = สลับลำดับ (เลข 1 = รูปหลัก)", "Press and drag = reorder (1 = main image)") : it.path} className={`h-20 w-16 rounded-md border object-cover bg-slate-100 ${dup ? "border-amber-400" : twin ? (twinSameRow ? "border-rose-400" : "border-amber-400") : useLib ? "border-blue-400" : "border-slate-200"} ${opts.handle ? "cursor-grab active:cursor-grabbing" : ""}`} />
        ) : (
          <div {...(opts.handle ?? {})} className="h-20 w-16 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
        )}
        {dup && <span className="pointer-events-none absolute right-1 top-1 rounded bg-amber-600 px-1 text-[10px] leading-4 text-white">{t("ซ้ำเดิม", "Already live")}</span>}
        {twin && (
          <span title={twinTip} className={`absolute right-0.5 top-0.5 max-w-[60px] truncate rounded px-1 text-[10px] leading-4 text-white ${twinSameRow ? "bg-rose-600" : "bg-amber-600"}`}>
            {twinLabel}
          </span>
        )}
        {lib && (
          <>
            <button type="button" disabled={phase !== "pick"} onPointerDown={(e) => e.stopPropagation()} onClick={() => setLibUse((m) => ({ ...m, [id]: !useLib }))} title={libTip}
              className={`absolute right-0.5 top-0.5 rounded px-1 text-[10px] leading-4 ${useLib ? "bg-blue-600 text-white" : "border border-slate-300 bg-white/95 text-slate-600"}`}>
              {useLib ? t("ใช้รูปเดิม", "Use existing") : t("อัปใหม่", "Upload new")}
            </button>
            <span className="absolute bottom-[22px] left-0.5 rounded-full border-2 border-white bg-white shadow" onPointerDown={(e) => e.stopPropagation()} title={libTip}>
              <HoverImage url={r2ImageUrl(lib.match.r2_key, 400)} size={18} previewSize={240} rounded="rounded-full" />
            </span>
          </>
        )}
        {opts.index != null && !it.video && <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{opts.index + 1}</span>}
        {opts.onMove && phase === "pick" && (
          <span className="absolute bottom-[22px] right-0.5 flex gap-0.5">
            {opts.canPrev && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => opts.onMove?.(-1)} aria-label={t("เลื่อนไปซ้าย", "Move left")} className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">‹</button>}
            {opts.canNext && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => opts.onMove?.(1)} aria-label={t("เลื่อนไปขวา", "Move right")} className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">›</button>}
          </span>
        )}
        <div className="relative">
          <p className="mt-0.5 truncate text-[10px] text-slate-500" title={it.path}>{folder ? <span className="text-slate-400">{folder}/</span> : null}{fileName}</p>
          {/* ⇄ ย้ายรูปนี้ไปช่องอื่น — ชี้ที่รูปแล้วโผล่ทับชื่อไฟล์ (จอสัมผัสโชว์ตลอด) */}
          {opts.moveIn && phase === "pick" && (
            <select
              value=""
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => e.target.value && moveOneTo(id, `${opts.moveIn!.p.parentId}|${e.target.value}`)}
              aria-label={t(`ย้าย ${it.path} ไปช่องอื่น`, `Move ${it.path} to another slot`)}
              title={t("ย้ายรูปนี้ไปสี/ช่องอื่น", "Move this image to another color / slot")}
              className="absolute inset-0 h-full w-full cursor-pointer rounded border border-blue-300 bg-white px-0.5 text-[10px] text-blue-700 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <option value="">{t("⇄ ย้ายไป…", "⇄ Move to…")}</option>
              {slotOptionList(opts.moveIn.p, it.video).filter((o) => `${opts.moveIn!.p.parentId}|${o.value}` !== opts.moveIn!.current).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        {opts.onSkip && phase === "pick" && (
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={opts.onSkip} aria-label={t(`ข้าม ${it.path}`, `Skip ${it.path}`)} title={t("ไม่ลงไฟล์นี้", "Don't upload this file")} className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] text-white group-hover:flex">
            ✕
          </button>
        )}
      </div>
    );
  };

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="min-w-[12rem] flex-1 text-xs">
        {err ? (
          <span className="text-rose-600">{err}</span>
        ) : phase === "done" && result ? (
          <span className={result.failed.length || result.otherShopFails ? "text-amber-700" : "text-emerald-700"}>
            {t(`ขึ้นเว็บแล้ว ${result.ok} ไฟล์`, `${result.ok} files live`)}{result.failed.length ? t(` · ยังไม่ขึ้น ${result.failed.length}`, ` · ${result.failed.length} not yet`) : ""}
          </span>
        ) : busy ? (
          <span className="text-slate-600">{t(`กำลังลงรูป ${progress.done}/${progress.total} ไฟล์`, `Uploading ${progress.done}/${progress.total} files`)}{videoPct !== null ? t(` · วิดีโอ ${videoPct}%`, ` · video ${videoPct}%`) : ""} · {t("ปิดหน้าต่างได้ ลงต่อเบื้องหลัง", "you can close this window, it continues in the background")}</span>
        ) : (
          <span className="text-slate-500">
            {uploadIds.length
              ? t(`จะลง ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า${touched.length > ROUND_PRODUCTS ? ` (${Math.ceil(touched.length / ROUND_PRODUCTS)} รอบ)` : ""}${alsoShops.size ? ` (+ร้านอื่น ${alsoShops.size})` : ""}${uploadReal < uploadIds.length ? ` · อัปจริง ${uploadReal} ไฟล์` : ""}`, `Will upload ${uploadIds.length} files → ${touched.length} products${touched.length > ROUND_PRODUCTS ? ` (${Math.ceil(touched.length / ROUND_PRODUCTS)} rounds)` : ""}${alsoShops.size ? ` (+${alsoShops.size} other shops)` : ""}${uploadReal < uploadIds.length ? ` · ${uploadReal} actual uploads` : ""}`)
              : t("ยังไม่มีรูปที่จะลง", "No images to upload yet")}
          </span>
        )}
      </div>
      {needConfirm && phase === "pick" && (
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("พิมพ์ CONFIRM", "Type CONFIRM")} className="h-9 w-36 rounded-lg border border-rose-300 px-2 font-mono text-sm" />
      )}
      {phase === "done" ? (
        <>
          <button type="button" onClick={() => { clearItems(); setResult(null); setRounds([]); setPhase("pick"); void load(); }} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            {t("ลงชุดต่อไป", "Next batch")}
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">
            {t("ปิด", "Close")}
          </button>
        </>
      ) : busy ? (
        <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
          {t("ปิดหน้าต่าง (ลงต่อเบื้องหลัง)", "Close window (continues in background)")}
        </button>
      ) : (
        <>
          {items.length > 0 && (
            <button type="button" onClick={clearItems} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">
              {t("ล้างไฟล์ทั้งหมด", "Clear all files")}
            </button>
          )}
          <button type="button" onClick={() => void run()} disabled={!uploadIds.length || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {uploadIds.length ? t(`ลงรูป ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า`, `Upload ${uploadIds.length} files → ${touched.length} products`) : t("ลงรูป", "Upload")}
          </button>
        </>
      )}
    </div>
  );

  return (
    <ERPModal
      open={open}
      onClose={close}
      title={t(`📸 ลงรูปเว็บทีละมาก — ${shop.name}`, `📸 Bulk image upload — ${shop.name}`)}
      description={scope ? t(`เฉพาะ ${scopeLabel ?? `${scope.size} รายการที่ติ๊กไว้`} · จับคู่จากชื่อไฟล์ / ชื่อโฟลเดอร์`, `Only ${scopeLabel ?? `the ${scope.size} ticked items`} · matched by file / folder name`) : t("จับคู่จากชื่อไฟล์ / ชื่อโฟลเดอร์กับรหัสสินค้าและสี · ตรวจก่อนลงทุกครั้ง", "Matches file / folder names to product and color codes · always reviewed before upload")}
      size="xl"
      hasUnsavedChanges={items.length > 0 && phase === "pick"}
      closeOnBackdrop={false}
      footer={footer}
    >
      <div {...drop.guard} className="space-y-3">
        {loadErr ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadErr}{" "}
            <button type="button" onClick={() => void load()} className="ml-1 underline">
              {t("ลองใหม่", "Retry")}
            </button>
          </div>
        ) : !catalog ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !parents.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">{t("ร้านนี้ยังไม่มีสินค้าบนเว็บ — เพิ่มสินค้าเข้าเว็บก่อน แล้วค่อยลงรูป", "This shop has no web products yet — add products first, then upload images")}</div>
        ) : (
          <>
            {/* ① ที่วางไฟล์ + กติกาตั้งชื่อ */}
            {phase === "pick" && (
              <div {...drop.zone("mass")} className={`relative rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${drop.over === "mass" ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-slate-50/50"}`}>
                <FileDropHint show={drop.over === "mass"} label={t("วางเพื่อจับคู่รูป", "Drop to match images")} />
                <p className="text-sm text-slate-700">
                  {t("ลากทั้งโฟลเดอร์ หรือหลายไฟล์มาวางที่นี่ ·", "Drop a whole folder or many files here ·")}{" "}
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-blue-600 underline">
                    {t("เลือกไฟล์", "Pick files")}
                  </button>{" "}
                  ·{" "}
                  <button type="button" onClick={() => dirRef.current?.click()} className="text-blue-600 underline">
                    {t("เลือกโฟลเดอร์", "Pick folder")}
                  </button>
                </p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  <code className="rounded bg-white px-1">JEAN08_1.jpg</code> → {t("รูปบนเว็บ", "web images")} · <code className="rounded bg-white px-1">JEAN08-01_2.jpg</code> → {t("รูปสี 01", "color 01 images")} ·{" "}
                  <code className="rounded bg-white px-1">JEAN08_hero.jpg</code> → {t("Hero คอม", "Hero desktop")} · <code className="rounded bg-white px-1">JEAN08_hero_m.jpg</code> → {t("Hero มือถือ", "Hero mobile")} ·{" "}
                  <code className="rounded bg-white px-1">JEAN08-01_hero.jpg</code> → {t("Hero ของสีนั้น", "Hero of that color")}
                  <br />
                  {t("🎬 วิดีโอ (mp4) = Hero อัตโนมัติ:", "🎬 Videos (mp4) = Hero automatically:")} <code className="rounded bg-white px-1">JEAN08.mp4</code> → {t("คอม", "desktop")} · <code className="rounded bg-white px-1">JEAN08_m.mp4</code> → {t("มือถือ · ≤ 200 MB (แนะนำ ≤ 15 MB · 6–10 วินาที)", "mobile · ≤ 200 MB (≤ 15 MB · 6–10 s recommended)")}
                  <br />
                  {t("หรือแยกโฟลเดอร์ชื่อ", "Or use folders named")} <code className="rounded bg-white px-1">JEAN08/</code> · <code className="rounded bg-white px-1">JEAN08-01/</code> {t(`ก็ได้ · เลขท้าย _1 _2 (2) = ลำดับรูป · ครั้งละ ≤ ${MAX_WEB_MASS_FILES.toLocaleString()} ไฟล์`, `· trailing _1 _2 (2) = image order · ≤ ${MAX_WEB_MASS_FILES.toLocaleString()} files at a time`)}
                </p>
                <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,.mp4,.m4v,.webm,.mov" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <input ref={dirRef} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </div>
            )}

            {items.length > 0 && (
              <>
                {/* สรุป */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">{t("จะลง", "To upload")} {countOf("upload")}</span>
                  {countOf("unmatched") > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">{t("ต้องเลือกเอง", "Pick manually")} {countOf("unmatched")}</span>}
                  {countOf("over") + countOf("dupHero") > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-rose-700">{t("เกิน/ซ้ำ", "Over limit / dup")} {countOf("over") + countOf("dupHero")}</span>}
                  {countOf("invalid") > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-rose-700">{t("ลงไม่ได้", "Can't upload")} {countOf("invalid")}</span>}
                  {countOf("skip") > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">{t("ข้าม", "Skipped")} {countOf("skip")}</span>}
                  {dupOf.size > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800" title={t("เทียบหน้าตารูปใหม่กับรูปเดิมบนเว็บของสินค้านั้น — เตือนให้ดูด้วยตา ไม่ข้ามเอง", "Compares new images with that product's current web images — a warning to check by eye, nothing is skipped automatically")}>
                      <Icon name="view" className="mr-0.5 inline-block align-[-2px]" />{t("หน้าตาเหมือนรูปเดิม", "Looks like current images")} {dupOf.size}
                    </span>
                  )}
                  {dupSameIds.length > 0 && phase === "pick" && (
                    <button type="button" onClick={() => skipMany(dupSameIds, t("หน้าตาซ้ำรูปเดิม", "look like current images"))} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-amber-800 hover:bg-amber-50">
                      <Icon name="cancel" className="mr-0.5 inline-block align-[-2px]" />{t("ไม่ลงรูปที่ซ้ำทั้งหมด", "Skip all duplicates")} ({dupSameIds.length})
                    </button>
                  )}
                  {twinIds.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800" title={t("รูปที่ลากมาซ้ำกันเอง (ไฟล์เดียวกัน หรือหน้าตาเหมือน) — ป้ายบนรูปบอกว่าเหมือนรูปไหน · ซ้ำในแถวเดียวกัน = แดง · ข้ามแถว = เหลือง", "Dropped images that duplicate each other (same file or look-alike) — the badge shows which image · same row = red · across rows = yellow")}>
                      <Icon name="warning" className="mr-0.5 inline-block align-[-2px]" />{t("ซ้ำกันเองในชุดนี้", "Duplicates within this batch")} {twinIds.length}
                    </span>
                  )}
                  {sameRowTwinIds.length > 0 && phase === "pick" && (
                    <button type="button" onClick={() => skipMany(sameRowTwinIds, t("ซ้ำในแถวเดียวกัน", "duplicates in the same row"))} className="rounded-full border border-rose-300 bg-white px-2.5 py-0.5 text-rose-700 hover:bg-rose-50">
                      <Icon name="cancel" className="mr-0.5 inline-block align-[-2px]" />{t("ไม่ลงรูปที่ซ้ำในแถว", "Skip in-row duplicates")} ({sameRowTwinIds.length})
                    </button>
                  )}
                  {uploadReal < uploadIds.length && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700" title={t("ไฟล์เดียวกันเป๊ะอัปครั้งเดียวแล้วใช้ร่วมกัน · รูปที่ใช้รูปเดิมในคลังไม่ต้องอัป", "Identical files are uploaded once and shared · images reusing library files aren't uploaded")}>
                      {t(`อัปจริง ${uploadReal} จาก ${uploadIds.length} ไฟล์`, `Actually uploading ${uploadReal} of ${uploadIds.length} files`)}
                    </span>
                  )}
                  {libIds.length > 0 && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700" title={t("รูปเดียวกันมีในคลังไฟล์แล้ว — ใช้รูปเดิม = ตอนลงไม่ต้องอัปไฟล์ซ้ำ (กดป้ายบนรูปเพื่อสลับทีละรูป)", "The same image is already in the file library — Use existing = no re-upload (click the badge on an image to switch it)")}>
                      <Icon name="library" className="mr-0.5 inline-block align-[-2px]" />{t("มีในคลังแล้ว", "In library")} {libIds.length} · {t("ใช้รูปเดิม", "use existing")} {reuseIds.length}
                      {reuseBytes > 0 ? t(` (ไม่ต้องอัป ${formatBytes(reuseBytes)})`, ` (saves ${formatBytes(reuseBytes)})`) : ""}
                    </span>
                  )}
                  {phase === "pick" && reuseIds.length < libIds.length && (
                    <button type="button" onClick={() => setLibUseMany(libIds, true)} className="rounded-full border border-blue-300 bg-white px-2.5 py-0.5 text-blue-700 hover:bg-blue-50">
                      {t("ใช้รูปเดิมทั้งหมด", "Use existing for all")}
                    </button>
                  )}
                  {phase === "pick" && reuseIds.length > 0 && (
                    <button type="button" onClick={() => setLibUseMany(libIds, false)} className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-slate-600 hover:bg-slate-50">
                      <Icon name="upload" className="mr-0.5 inline-block align-[-2px]" />{t("อัปใหม่ทั้งหมด", "Upload all new")}
                    </button>
                  )}
                  {phase === "pick" && libChecked < imgTotal && (
                    <span className="text-slate-400">{t("ตรวจรูปซ้ำในคลัง", "Checking library duplicates")} {libChecked}/{imgTotal}…</span>
                  )}
                  {phase === "pick" && (imgPrepped < imgTotal || oldPending > 0) && (
                    <span className="text-slate-400">
                      {imgPrepped < imgTotal ? t(`กำลังเตรียมรูป ${imgPrepped}/${imgTotal}`, `Preparing images ${imgPrepped}/${imgTotal}`) : t("กำลังโหลดรูปเดิมมาเทียบ", "Loading current images to compare")}
                      {mode === "append" ? t(" · เทียบหน้าตากับรูปเดิมบนเว็บ…", " · comparing with current web images…") : "…"}
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">
                    {t(`${items.length} ไฟล์ · ${touched.length} สินค้า`, `${items.length} files · ${touched.length} products`)}
                  </span>
                </div>

                {phase !== "pick" && rounds.length > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3.5 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {phase === "uploading" ? t(`กำลังลงรูป ${progress.done}/${progress.total} ไฟล์${videoPct !== null ? ` · วิดีโอ ${videoPct}%` : ""}`, `Uploading ${progress.done}/${progress.total} files${videoPct !== null ? ` · video ${videoPct}%` : ""}`) : t("ลงรูปเสร็จแล้ว", "Upload finished")}
                      </span>
                      <span className="text-slate-500">{t(`ลงทีละรอบ รอบละ ${ROUND_PRODUCTS} สินค้า · รอบที่เสร็จขึ้นเว็บทันที`, `Uploads in rounds of ${ROUND_PRODUCTS} products · each finished round goes live right away`)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                    </div>
                    <div className="mt-1 divide-y divide-blue-100">
                      {rounds.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 py-1">
                          <span className="w-12 shrink-0 text-slate-700">{t("รอบ", "Round")} {i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-500" title={r.codes.join(", ")}>
                            {t(`${r.codes.length} สินค้า · ${r.files} ไฟล์`, `${r.codes.length} products · ${r.files} files`)} · {r.codes.slice(0, 4).join(", ")}{r.codes.length > 4 ? " …" : ""}
                          </span>
                          <span className={`shrink-0 ${ROUND_LABEL[r.status].cls}`}>{ROUND_LABEL[r.status].icon && <Icon name={ROUND_LABEL[r.status].icon} className="mr-0.5 inline-block align-[-2px]" />}{ROUND_LABEL[r.status].text}</span>
                        </div>
                      ))}
                    </div>
                    {phase === "uploading" && <p className="mt-1 text-[11px] text-slate-500">{t("ปิดหน้าต่างนี้ได้ — ลงต่อเบื้องหลัง (ดูกล่องมุมขวาล่าง) · ไปหน้าอื่นใน ERP ได้ แต่อย่าปิดแท็บเบราว์เซอร์จนกว่าจะเสร็จ", "You can close this window — it continues in the background (see the bottom-right box) · you can visit other ERP pages, but keep the browser tab open until it finishes")}</p>}
                  </div>
                )}

                {linkable && phase === "pick" && (
                  // ลอยติดขอบบนของหน้าต่างตอนเลื่อน (เปลี่ยนโหมดสลับได้ทุกแถว) — กล่องเลื่อนของ ERPModal ไม่มี overflow ซ้อน
                  // -top-5 = ชิดขอบบนพอดี (ตัวเลื่อนของ ERPModal เว้นบน py-5 · top-0 จะเหลือช่องให้รูปโผล่เหนือแถบ)
                  <div className="sticky -top-5 z-10 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs shadow-sm ring-1 ring-slate-200">
                    <span className="text-slate-700">{t("↕ สลับลำดับรูปแล้ว แถวอื่นตำแหน่งเดียวกันสลับตาม:", "↕ When reordering, the same position in other rows follows:")}</span>
                    {LINK_OPTS.map((o) => (
                      <button key={o.v} type="button" onClick={() => setLinkReorder(o.v)} className={seg(linkReorder === o.v)}>
                        {o.label}
                      </button>
                    ))}
                    <span className="text-[11px] text-slate-400">{t("เฉพาะแถวชนิดเดียวกัน (รูปสี↔รูปสี) ที่มีรูปถึงตำแหน่งนั้น", "Only rows of the same kind (color↔color) that have an image at that position")}</span>
                  </div>
                )}

                {/* ② แยกตามสินค้า */}
                {touched.slice(0, shown).map((pid) => {
                  const p = byId.get(pid)!;
                  const dests = plan.dests.filter((d) => d.parentId === pid);
                  // 🎨 สีที่ยังไม่มีรูปในชุดนี้ → แถวว่างให้โยนรูปเข้า (ลากจากเครื่อง / ลากรูปจากแถวอื่น / เลือก "ย้ายไป…")
                  const haveSku = new Set(dests.flatMap((d) => (d.target.kind === "sku" ? [d.target.skuId] : [])));
                  const emptySkus = phase === "pick" ? p.skus.filter((s) => !haveSku.has(s.id)) : [];
                  return (
                    <div key={pid} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-sm">
                          <b className="font-semibold text-slate-900">{p.code}</b> <span className="text-slate-500">{p.name}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-slate-400">
                            {t(`${p.skus.length} สี · ลงที่ร้าน`, `${p.skus.length} colors · shops:`)} {[shop.name, ...otherShops.filter((o) => alsoShops.has(o.id) && p.otherShopIds.includes(o.id)).map((o) => o.name)].join(" + ")}
                          </span>
                          {phase === "pick" && parents.length > 1 && (
                            <select value="" onChange={(e) => e.target.value && changeProduct(pid, e.target.value)} aria-label={t(`เปลี่ยนสินค้าของ ${p.code}`, `Change product for ${p.code}`)} className="h-7 max-w-[13rem] rounded-md border border-slate-300 bg-white px-1.5 text-[11px] text-slate-700">
                              <option value="">{t("🔁 อ่านผิด? เปลี่ยนสินค้า…", "🔁 Misread? Change product…")}</option>
                              {parents.filter((x) => x.parentId !== pid).map((x) => (
                                <option key={x.parentId} value={x.parentId}>{x.code} · {x.name}</option>
                              ))}
                            </select>
                          )}
                          {phase === "pick" && (
                            <button
                              type="button"
                              onClick={() => skipMany(plan.files.filter((f) => f.parentId === pid && f.plan !== "skip").map((f) => f.id), p.code)}
                              className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-600 hover:border-rose-300 hover:text-rose-600"
                              title={t("ไม่ลงรูปทั้งหมดของสินค้านี้ (เอากลับได้)", "Skip all images of this product (can undo)")}
                            >
                              {t("✕ ไม่ลงสินค้านี้", "✕ Skip this product")}
                            </button>
                          )}
                        </div>
                      </div>
                      {dests.map((d) => {
                        const isHero = d.target.kind === "hero" || d.target.kind === "skuHero";
                        const dl = destLabel(d.target, p);
                        const hasVideo = d.fileIds.some((id) => itemById.get(id)?.video);
                        const editing = editDest?.key === d.key ? editDest : null;
                        const ep = editing ? byId.get(editing.pid) : undefined;
                        const old = existingKeys(d.target, p);
                        // ต่อท้าย = เลขรูปใหม่ต่อจากของเดิม · แทนที่/Hero = รูปใหม่เริ่ม 1
                        const base = d.replaces ? 0 : old.length;
                        const numbered = !isHero && (d.fileIds.length > 1 || base > 0);
                        const dups = d.fileIds.filter((id) => dupOf.has(id));
                        const dupSame = dups;
                        // 🔁 ทั้งแถวเหมือนอีกแถวในชุดนี้ (เช่น ลากโฟลเดอร์สีเดียวกันซ้ำ 2 สี) → เตือนที่หัวแถว
                        const rowTwins = d.fileIds.map((id) => twinOf.get(id));
                        const twinRow = !isHero && d.fileIds.length >= 2 && rowTwins.every((t) => t && t.destKey !== d.key && t.destKey === rowTwins[0]?.destKey) ? rowTwins[0]?.destKey : null;
                        return (
                          <div
                            key={d.key}
                            data-reorder-drop={d.key}
                            {...slotDrop.zone(d.key)}
                            className={`relative mt-2 grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-2 rounded-lg border-t border-slate-100 pt-2 ${DROP_OVER_CLS}`}
                          >
                            <FileDropHint show={slotDrop.over === d.key} label={t(`วางรูปเข้า ${dl.title.replace(/^\S+\s/, "")}`, `Drop images into ${dl.title.replace(/^\S+\s/, "")}`)} />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-700" title={dl.title}>{dl.title}</p>
                              <p className="truncate text-[11px] text-slate-500" title={dl.sub}>{dl.sub}</p>
                              {phase === "pick" && (
                                <div className="mt-0.5 flex flex-col items-start gap-0.5">
                                  <button type="button" onClick={() => setEditDest(editing ? null : { key: d.key, pid })} className="text-[11px] text-blue-600 hover:underline">
                                    {editing ? t("ปิด", "Close") : t("✎ ย้ายแถวนี้ (อ่านผิด)", "✎ Move this row (misread)")}
                                  </button>
                                  <button type="button" onClick={() => skipMany(d.fileIds, dl.title.replace(/^\S+\s/, ""))} className="text-[11px] text-slate-500 hover:text-rose-600 hover:underline" title={t("ไม่ลงรูปทั้งแถวนี้ (เช่น ลงซ้ำของที่มีแล้ว · เอากลับได้)", "Skip this whole row (e.g. duplicates of existing images · can undo)")}>
                                    {t("✕ ไม่ลงแถวนี้", "✕ Skip this row")}
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              {twinRow && (
                                <div className="flex basis-full flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                                  <Icon name="warning" className="shrink-0" />
                                  <span className="min-w-[12rem] flex-1">{t(`รูปเหมือนแถว ${rowShort(twinRow, "")} ทั้งหมด ${d.fileIds.length}/${d.fileIds.length} — ตั้งใจใช้รูปชุดเดียวกันไหม? (ถ้าลงทั้งคู่ ไฟล์เดียวกันอัปครั้งเดียว)`, `All ${d.fileIds.length}/${d.fileIds.length} images match row ${rowShort(twinRow, "")} — same set on purpose? (if both are uploaded, identical files upload once)`)}</span>
                                  {phase === "pick" && (
                                    <>
                                      <button type="button" onClick={() => skipMany(d.fileIds, `${dl.title.replace(/^\S+\s/, "")} ${t("(ซ้ำแถวอื่น)", "(duplicate of another row)")}`)} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100">{t("✕ ไม่ลงแถวนี้", "✕ Skip this row")}</button>
                                      <button type="button" onClick={() => setEditDest({ key: d.key, pid })} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100">{t("✎ ย้ายแถว", "✎ Move row")}</button>
                                    </>
                                  )}
                                </div>
                              )}
                              {old.length > 0 && (
                                <>
                                  <OldThumbs keys={old} gone={d.replaces} hero={isHero} />
                                  <span className="mb-[18px] flex h-20 flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-3 text-blue-600" aria-hidden>
                                    <span className="h-full w-px bg-blue-200" />
                                    {d.replaces ? t("แทน", "Replace") : t("ใหม่", "New")}
                                    <span className="h-full w-px bg-blue-200" />
                                  </span>
                                </>
                              )}
                              <DestThumbs
                                group={d.key}
                                ids={d.fileIds}
                                canDrag={phase === "pick"}
                                onReorder={(from, to) => reorderDest(d, from, to)}
                                onDropTarget={(from, key) => key !== d.key && moveOneTo(d.fileIds[from], key)}
                                render={(id, i, handle) =>
                                  thumb(id, {
                                    onSkip: () => setSkip([id], true),
                                    handle,
                                    index: numbered ? base + i : undefined,
                                    onMove: d.fileIds.length > 1 ? (dir) => reorderDest(d, i, i + dir) : undefined,
                                    canPrev: i > 0,
                                    canNext: i < d.fileIds.length - 1,
                                    moveIn: { p, current: d.key },
                                  })
                                }
                              />
                              <span className={`self-center text-[11px] ${d.replaces ? "text-amber-700" : "text-slate-500"}`}>
                                {isHero
                                  ? d.replaces
                                    ? t("แทน Hero เดิม", "Replaces current Hero")
                                    : t("ใหม่ (เดิมว่าง)", "New (was empty)")
                                  : d.replaces
                                    ? t(`แทนที่รูปเดิม ${d.existing} รูป → เหลือ ${d.total}/${d.limit}`, `Replaces ${d.existing} current images → ${d.total}/${d.limit}`)
                                    : t(`+${d.fileIds.length} ต่อท้าย${d.existing ? ` (เดิม ${d.existing} → รวม ${d.total}/${d.limit})` : ` (รวม ${d.total}/${d.limit})`}`, `+${d.fileIds.length} appended${d.existing ? ` (was ${d.existing} → total ${d.total}/${d.limit})` : ` (total ${d.total}/${d.limit})`}`)}
                              </span>
                              {dups.length > 0 && (
                                <span className="flex flex-wrap items-center gap-1.5 self-center">
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800"><Icon name="view" className="mr-0.5 inline-block align-[-2px]" />{t("หน้าตาเหมือนรูปเดิม", "Looks like current images")} {dups.length}/{d.fileIds.length}</span>
                                  {phase === "pick" && dupSame.length > 0 && (
                                    <button type="button" onClick={() => skipMany(dupSame, `${t("ซ้ำรูปเดิม", "duplicates current")} · ${dl.title.replace(/^\S+\s/, "")}`)} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-50">
                                      <Icon name="cancel" className="mr-0.5 inline-block align-[-2px]" />{t("ไม่ลงรูปที่ซ้ำ", "Skip duplicates")} ({dupSame.length})
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                            {editing && (
                              <div className="col-span-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-blue-50/70 px-2.5 py-2">
                                <span className="text-[11px] text-slate-700">{t(`ย้ายรูป ${d.fileIds.length} รูปในแถวนี้ไป:`, `Move the ${d.fileIds.length} images in this row to:`)}</span>
                                <select value={editing.pid} onChange={(e) => setEditDest({ key: d.key, pid: e.target.value })} aria-label={t("สินค้าปลายทาง", "Target product")} className="h-8 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-xs">
                                  {parents.map((x) => (
                                    <option key={x.parentId} value={x.parentId}>{x.code} · {x.name}</option>
                                  ))}
                                </select>
                                {ep && (
                                  <select
                                    value={editing.pid === pid ? encT(d.target) : ""}
                                    onChange={(e) => {
                                      const t = decT(e.target.value);
                                      if (!t) return;
                                      moveFiles(d.fileIds, ep.parentId, t);
                                      setEditDest(null);
                                    }}
                                    aria-label={t("ช่องรูปปลายทาง", "Target image slot")}
                                    className="h-8 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                  >
                                    <option value="">{t("— เลือกช่องรูป —", "— Pick image slot —")}</option>
                                    {slotOptions(ep, hasVideo)}
                                  </select>
                                )}
                                <span className="text-[11px] text-slate-500">{t("เลือกช่องแล้วย้ายทันที", "Moves as soon as you pick a slot")}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {emptySkus.map((s) => {
                        const key = targetKey(pid, { kind: "sku", skuId: s.id });
                        return (
                          <div
                            key={key}
                            data-reorder-drop={key}
                            {...slotDrop.zone(key)}
                            className={`relative mt-2 grid grid-cols-[11rem_minmax(0,1fr)] items-center gap-2 rounded-lg border-t border-slate-100 pt-2 ${DROP_OVER_CLS}`}
                          >
                            <FileDropHint show={slotDrop.over === key} label={t(`วางรูปเข้า รูปสี · ${s.code}`, `Drop images into color images · ${s.code}`)} />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-500" title={s.code}>🎨 {t("รูปสี", "Color images")} · {s.code}</p>
                              <p className="truncate text-[11px] text-slate-400" title={s.label}>{s.label}</p>
                            </div>
                            <div className="flex h-12 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 px-3 text-[11px] text-slate-400">
                              <Icon name="image" size={14} />
                              <span>
                                {t("ยังไม่มีรูปใหม่ — ลากรูปจากเครื่อง หรือลากรูปจากแถวอื่นมาวางที่นี่", "No new images yet — drag images from your computer or from another row here")}
                                {s.webImages.length > 0 && <span className="text-slate-500"> · {t(`บนเว็บมีอยู่แล้ว ${s.webImages.length} รูป`, `${s.webImages.length} already on the web`)}</span>}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {touched.length > shown && (
                  <button type="button" onClick={() => setShown((n) => n + SHOW_PRODUCTS)} className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:bg-slate-50">
                    {t(`แสดงอีก ${Math.min(SHOW_PRODUCTS, touched.length - shown)} สินค้า (เหลือ ${touched.length - shown} จาก ${touched.length})`, `Show ${Math.min(SHOW_PRODUCTS, touched.length - shown)} more products (${touched.length - shown} of ${touched.length} left)`)}
                  </button>
                )}

                {/* ③ ไฟล์ที่ต้องดู */}
                {needLook.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-3.5 py-2.5">
                    <p className="mb-1 text-sm font-medium text-slate-800">{t("ไฟล์ที่ต้องดู", "Files to check")} ({needLook.length})</p>
                    {needLook.slice(0, lookShown).map((f) => {
                      const it = itemById.get(f.id)!;
                      const man = it.manual ?? null;
                      const pid = man?.parentId ?? f.parentId ?? "";
                      const p = pid ? byId.get(pid) : undefined;
                      const why = man && !man.target ? t("เลือกช่องรูปต่อ", "Now pick an image slot") : f.plan === "unmatched" ? it.match.reason || t("ยังไม่ได้เลือกช่อง", "No slot picked yet") : f.note || "";
                      return (
                        <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-amber-100 py-2 first:border-t-0">
                          {thumb(f.id, { muted: true })}
                          <div className="min-w-[10rem] flex-1">
                            <p className="truncate text-xs text-slate-700">{it.path}</p>
                            <p className="text-[11px] text-amber-800">{why}</p>
                          </div>
                          {phase === "pick" && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={pid}
                                onChange={(e) => {
                                  const np = e.target.value;
                                  if (!np) return;
                                  // เลือกสินค้าแล้วรอเลือกช่องในแถวเดิม (ยังไม่ย้ายไฟล์ออกจากรายการนี้)
                                  setManual(f.id, { parentId: np, target: null });
                                }}
                                className="h-8 max-w-[13rem] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                aria-label={t("เลือกสินค้า", "Pick product")}
                              >
                                <option value="">{t("— เลือกสินค้า —", "— Pick product —")}</option>
                                {parents.map((x) => (
                                  <option key={x.parentId} value={x.parentId}>
                                    {x.code} · {x.name}
                                  </option>
                                ))}
                              </select>
                              {p && (
                                <select
                                  value={encT(man ? man.target : f.target)}
                                  onChange={(e) => {
                                    const t = decT(e.target.value);
                                    if (t) setManual(f.id, { parentId: p.parentId, target: t });
                                  }}
                                  className="h-8 max-w-[11rem] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                  aria-label={t("เลือกช่องรูป", "Pick image slot")}
                                >
                                  <option value="">{t("— ช่องรูป —", "— Image slot —")}</option>
                                  {slotOptions(p, it.video)}
                                </select>
                              )}
                              <button type="button" onClick={() => setSkip([f.id], true)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
                                {t("ข้าม", "Skip")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {needLook.length > lookShown && (
                      <button type="button" onClick={() => setLookShown((n) => n + SHOW_LOOK)} className="mt-1 w-full rounded-lg border border-dashed border-amber-300 py-1.5 text-xs text-amber-800 hover:bg-amber-50">
                        {t(`แสดงอีก ${Math.min(SHOW_LOOK, needLook.length - lookShown)} ไฟล์ (เหลือ ${needLook.length - lookShown})`, `Show ${Math.min(SHOW_LOOK, needLook.length - lookShown)} more files (${needLook.length - lookShown} left)`)}
                      </button>
                    )}
                  </div>
                )}

                {/* ⏭ ข้ามไว้ — เอากลับทีละกลุ่ม */}
                {skipped.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">{t(`⏭ ข้ามไว้ — ไม่ลง (${countOf("skip")} รูป)`, `⏭ Skipped — not uploading (${countOf("skip")} images)`)}</p>
                      {phase === "pick" && skipped.length > 1 && (
                        <button type="button" onClick={() => setSkip(skipped.flatMap((g) => g.ids), false)} className="text-[11px] text-blue-600 hover:underline">
                          {t("↩ เอากลับทั้งหมด", "↩ Restore all")}
                        </button>
                      )}
                    </div>
                    {skipped.map((g) => {
                      const sp = g.parentId ? byId.get(g.parentId) : undefined;
                      const label = sp && g.target ? `${sp.code} · ${destLabel(g.target, sp).title}` : sp ? `${sp.code} · ${t("ยังไม่ได้เลือกช่อง", "no slot picked yet")}` : t("ไม่พบรหัสสินค้า", "Product code not found");
                      return (
                        <div key={g.key} className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-1.5">
                          <span className="w-56 truncate text-xs text-slate-600" title={label}>{label}</span>
                          <div className="flex flex-1 flex-wrap gap-1">
                            {g.ids.slice(0, 10).map((id) => {
                              const it = itemById.get(id);
                              if (!it) return null;
                              return it.video ? (
                                <span key={id} title={it.path} className="flex h-10 w-8 items-center justify-center rounded border border-slate-200 bg-slate-700 text-xs opacity-60">🎬</span>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={id} src={previews[id] ?? it.url} alt="" title={it.path} loading="lazy" decoding="async" className="h-10 w-8 rounded border border-slate-200 object-cover opacity-50 grayscale" />
                              );
                            })}
                            {g.ids.length > 10 && <span className="self-center text-[11px] text-slate-400">+{g.ids.length - 10}</span>}
                          </div>
                          {phase === "pick" && (
                            <button type="button" onClick={() => setSkip(g.ids, false)} className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700 hover:bg-slate-100">
                              {t(`↩ เอากลับ ${g.ids.length} รูป`, `↩ Restore ${g.ids.length} images`)}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ④ ตัวเลือก */}
                <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{t("รูปเดิมที่มีอยู่", "Current images")}</span>
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => setMode("append")} className={seg(mode === "append")}>
                        {t("เพิ่มต่อท้าย", "Append")}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setMode("replace")} className={seg(mode === "replace")}>
                        {t("แทนที่ของเดิม", "Replace current")}
                      </button>
                    </div>
                  </div>
                  {otherShops.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <span className="text-sm text-slate-800">{t("ลงที่ร้านอื่นที่มีสินค้านี้ด้วย", "Also upload to other shops with these products")}</span>
                      <div className="flex flex-wrap gap-3">
                        {otherShops.map((s) => (
                          <label key={s.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              disabled={busy}
                              checked={alsoShops.has(s.id)}
                              onChange={() => setAlsoShops((cur) => { const n = new Set(cur); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                              className="h-4 w-4 accent-blue-600"
                            />
                            {s.name} {t(`(มี ${s.has}/${touched.length} ตัว)`, `(has ${s.has}/${touched.length})`)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className={`mt-2 text-[11px] ${mode === "replace" ? "text-rose-600" : "text-slate-500"}`}>
                    {mode === "replace"
                      ? t(`โหมดแทนที่: รูปเดิมของช่องที่มีรูปใหม่จะถูกเอาออกจากเว็บ (ไฟล์ยังอยู่ในคลัง · ช่องอื่นไม่แตะ)${touched.length > CONFIRM_OVER ? " · เกิน 20 สินค้าต้องพิมพ์ CONFIRM" : ""}`, `Replace mode: current images in slots with new images are removed from the web (files stay in the library · other slots untouched)${touched.length > CONFIRM_OVER ? " · over 20 products requires typing CONFIRM" : ""}`)
                      : t("รูปย่อเหลือกว้าง ≤ 2000px อัตโนมัติ · ไฟล์ที่ข้ามจะไม่อัปโหลด · Hero มีช่องละ 1 ไฟล์ รูปหรือวิดีโอ (ไฟล์ใหม่แทนของเดิม) · บันทึกประวัติว่าใครลงรูปอะไร", "Images are resized to ≤ 2000px automatically · skipped files aren't uploaded · each Hero slot holds 1 image or video (new replaces old) · every upload is logged")}
                  </p>
                </div>

                {/* ⑤ สรุปผล */}
                {phase === "done" && result && (
                  <div className={`rounded-xl border px-3.5 py-3 text-sm ${result.failed.length || result.otherShopFails ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                    <p className="font-medium text-slate-800">
                      <Icon name="done" className="mr-0.5 inline-block align-[-2px]" />{t(`ขึ้นเว็บแล้ว ${result.ok} ไฟล์ · อัปเดต ${result.updated} รายการ — เว็บเปลี่ยนตามทันที`, `${result.ok} files live · ${result.updated} items updated — the website updates right away`)}
                    </p>
                    {result.skippedShops > 0 && <p className="mt-1 text-xs text-slate-500">{t(`ร้านอื่น: ข้าม ${result.skippedShops} รายการที่ไม่มีสินค้านั้นในร้าน`, `Other shops: skipped ${result.skippedShops} items not in that shop`)}</p>}
                    {result.otherShopFails > 0 && <p className="mt-1 text-xs text-rose-700">{t(`ร้านอื่น: บันทึกไม่สำเร็จ ${result.otherShopFails} รายการ`, `Other shops: ${result.otherShopFails} items failed to save`)}</p>}
                    {result.failed.length > 0 && (
                      <div className="mt-1.5 text-xs text-rose-700">
                        <p>{t(`ยังไม่ขึ้นเว็บ ${result.failed.length} ไฟล์ — รอบอื่นขึ้นครบแล้ว ไม่ต้องลงใหม่ทั้งชุด`, `${result.failed.length} files not live yet — other rounds are done, no need to redo the whole batch`)}</p>
                        {/* จัดกลุ่มตามสาเหตุ — สาเหตุละบรรทัด + ชื่อไฟล์ (เกิน 8 = …) */}
                        <ul className="mt-1 space-y-1">
                          {groupFailures(result.failed).map((g) => (
                            <li key={g.why} className="text-rose-600">
                              <span className="font-medium text-rose-700">{g.why}</span>
                              <span className="text-rose-500"> · {t(`${g.items.length} ไฟล์`, `${g.items.length} files`)}: {g.items.slice(0, 8).map((x) => x.name).join(", ")}{g.items.length > 8 ? " …" : ""}</span>
                            </li>
                          ))}
                        </ul>
                        <button type="button" onClick={() => void run(true)} className="mt-2 h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700">
                          <Icon name="refresh" className="mr-0.5 inline-block align-[-2px]" />{t(`ลงซ้ำเฉพาะ ${result.failed.length} ไฟล์ที่พลาด`, `Retry only the ${result.failed.length} failed files`)}
                        </button>
                        <span className="ml-2 text-[11px] text-slate-500">{t("ไฟล์ที่อัปแล้วไม่อัปใหม่ · แถวที่ขึ้นเว็บบางส่วนแล้ว = ต่อท้าย", "Already-uploaded files aren't re-uploaded · rows that are partly live are appended")}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {items.length === 0 && (
              <p className="text-[11px] text-slate-400">
                {t("ช่องที่ลงได้: รูปบนเว็บ (≤ 12 รูป/สินค้า) · รูปสี (≤ 8 รูป/สี) · Hero คอม/มือถือ ของสินค้าและของแต่ละสี (รูปหรือวิดีโอ) — ช่องที่ไม่มีรูปใหม่ = ไม่แตะ", "Slots: web images (≤ 12 per product) · color images (≤ 8 per color) · Hero desktop/mobile for each product and color (image or video) — slots without new images are untouched")}
                {catalog.parents.length ? `${t(" · ตัวอย่างรหัสในร้าน:", " · example codes in this shop:")} ${parents.slice(0, 3).map((p) => p.code).join(", ")}` : ""}
              </p>
            )}
          </>
        )}
      </div>
    </ERPModal>
  );
}


/** ↕ แถวรูปของช่องเดียว — กดค้างที่รูปแล้วลาก = สลับลำดับ (ของกลาง useDragReorder · group = ช่องนั้น ลากข้ามแถวไม่ได้) */
/** รูปเดิมบนเว็บ (จางๆ · ชี้ดูชัด) — gone = โหมดแทนที่/Hero ใหม่ → ขีดฆ่า "จะเอาออก" */
function OldThumbs({ keys, gone, hero }: { keys: string[]; gone: boolean; hero: boolean }) {
  const t = useT();
  return (
    <>
      {keys.map((k, i) => {
        const tip = gone ? t("รูปเดิม — จะถูกเอาออกจากเว็บ (ไฟล์ยังอยู่ในคลัง)", "Current image — will be removed from the web (file stays in the library)") : t(`รูปเดิมบนเว็บ ลำดับ ${i + 1} — ไม่ถูกแตะ`, `Current web image #${i + 1} — untouched`);
        return (
          <div key={`${k}:${i}`} className="w-16 shrink-0" title={tip}>
            <div className={`relative h-20 w-16 overflow-hidden rounded-md border border-dashed border-slate-300 transition-opacity hover:opacity-100 ${gone ? "opacity-35" : "opacity-45"}`}>
              {isVideoName(k) ? (
                <span className="flex h-full w-full items-center justify-center bg-slate-700 text-lg">🎬</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r2ImageUrl(k, 128) ?? ""} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full bg-slate-100 object-cover" />
              )}
              {!hero && !gone && <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/45 px-1 text-[10px] leading-4 text-white">{i + 1}</span>}
              {gone && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded bg-rose-600/85 px-1 text-[10px] leading-4 text-white">{t("✕ ออก", "✕ Out")}</span>
                </span>
              )}
            </div>
            <p className={`mt-0.5 truncate text-[10px] ${gone ? "text-rose-500 line-through" : "text-slate-400"}`}>{gone ? t("จะเอาออก", "Removing") : t("รูปเดิม", "Current")}</p>
          </div>
        );
      })}
    </>
  );
}

function DestThumbs({ group, ids, canDrag, onReorder, onDropTarget, render }: {
  group: string;
  ids: string[];
  canDrag: boolean;
  onReorder: (from: number, to: number) => void;
  /** ⇄ ลากไปวางแถวอื่น (data-reorder-drop) = ย้ายรูปนั้นไปแถวนั้น */
  onDropTarget?: (from: number, key: string) => void;
  render: (id: string, i: number, handle: Record<string, unknown> | undefined) => ReactNode;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder, { group: `mass:${group}`, onDropTarget });
  return (
    <>
      {ids.map((id, i) => (
        <div key={id} {...(canDrag ? rowProps(i) : {})} className={canDrag ? `rounded-md ${rowCls(i)}` : undefined}>
          {render(id, i, canDrag ? (handleProps(i) as unknown as Record<string, unknown>) : undefined)}
        </div>
      ))}
    </>
  );
}
