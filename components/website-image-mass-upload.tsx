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
 *    ✕ ไม่ลงทั้งแถว / ทั้งสินค้า (ลงซ้ำของที่มีแล้ว) → ไปกล่อง "ข้ามไว้" เอากลับได้ทีละกลุ่ม · ✎ ย้ายทั้งแถวไปสินค้า/ช่องอื่น · 🔁 เปลี่ยนสินค้าทั้งรุ่น (อ่านชื่อผิด — สีจับคู่ตามเลขสีเดิม)
 *    ค่าเริ่มต้น = เพิ่มต่อท้าย (ของเดิมอยู่ครบ) · แทนที่ = เฉพาะช่องที่มีรูปใหม่ · เกิน 20 สินค้า + แทนที่ = พิมพ์ CONFIRM
 *    ครั้งละ ≤ 1,000 ไฟล์: รูปพรีวิวย่อ (สูง 160px · ทำทีละ 3 รูปเบื้องหลัง) · แสดงทีละ 30 สินค้า
 *    👀 เตือนรูปหน้าตาเหมือนรูปเดิมบนเว็บ (lib/image-similarity · เทียบกับรูปบนเว็บ+รูปสีของสินค้านั้น · โหมดต่อท้าย · เตือนอย่างเดียว)
 * 3) กดลงรูป → ลงเป็นรอบ รอบละ 20 สินค้า (อัปรูป → บันทึกลงเว็บทันที) · runBackgroundTask = ปิดหน้าต่างได้ · ลงซ้ำเฉพาะไฟล์ที่พลาด (ไม่อัปใหม่ไฟล์ที่อัปแล้ว · ช่องที่บันทึกแล้ว = ต่อท้าย)
 *    รูปย่อ ≤ 2000px (uploadResizedImage) · วิดีโอใช้ตัวอัปกลาง uploadMediaFile (ตัวเดียวกับช่อง Hero ทีละตัว) → R2 (ทีละ 3 ไฟล์ · ไฟล์ที่ไม่ได้ลงจะไม่อัป) → POST /api/website/listings/images (รวมกับรูปล่าสุดใน DB + audit + ล้างแคชเว็บ)
 * ของกลาง: ERPModal · useFileDrop(folders) · useDragReorder · useUserPref · runBackgroundTask · image-similarity · uploadResizedImage · uploadMediaFile · toast
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useFileDrop, FileDropHint, filePathOf } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { uploadResizedImage } from "@/components/image-attach";
import { r2ImageUrl } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { runBackgroundTask } from "@/lib/background-tasks";
import { Icon } from "@/components/icon";
import { similarity, visualPrintFromSource, visualPrintOf, type SimilarLevel, type VisualPrint } from "@/lib/image-similarity";
import { uploadMediaFile, MediaUploadError } from "@/lib/media-upload";
import { BIG_VIDEO_MAX_BYTES, fileMb } from "@/lib/media-upload-limits";
import {
  MAX_WEB_MASS_FILES,
  ROUND_PRODUCTS,
  buildCodeIndex,
  buildMassItems,
  isVideoName,
  matchImagePath,
  planImageUpload,
  splitRounds,
  targetLabel,
  type CatalogParent,
  type ImageMatch,
  type ImageTarget,
  type MassMode,
  type PlanDest,
  type PlanFile,
} from "@/lib/website-image-match";

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
/** หน้าตาเหมือนรูปเดิมบนเว็บ (เตือนให้ดูด้วยตา ไม่ข้ามเอง) */
type Dup = { level: SimilarLevel; where: string };
const ROUND_LABEL: Record<RoundView["status"], { text: string; cls: string; icon?: string }> = {
  wait: { text: "รอคิว", cls: "text-slate-400" },
  run: { text: "กำลังลง…", cls: "text-blue-600", icon: "waiting" },
  ok: { text: "ขึ้นเว็บแล้ว", cls: "text-emerald-700", icon: "done" },
  part: { text: "ขึ้นเว็บบางส่วน", cls: "text-amber-700", icon: "warning" },
  fail: { text: "ไม่สำเร็จ", cls: "text-rose-600", icon: "cancel" },
};
/** แสดงทีละกี่สินค้า / กี่ไฟล์ในกล่อง "ไฟล์ที่ต้องดู" (ลาก 1,000 รูปแล้วหน้าไม่หนัก) */
const SHOW_PRODUCTS = 30;
const SHOW_LOOK = 50;
/** รูปเดิมบนเว็บที่โหลดมาเทียบหน้าตาได้สูงสุดต่อครั้ง (รูปย่อ 96px) */
const OLD_PRINT_MAX = 800;

/** สลับลำดับแล้วแถวอื่น "ตำแหน่งเดียวกัน" ตามด้วยไหม: แถวเดียว / ทุกสีในรุ่น / ทุกแถวที่ลากมา (ชนิดช่องเดียวกัน) */
type LinkReorder = "row" | "product" | "all";
const LINK_OPTS: { v: LinkReorder; label: string }[] = [
  { v: "row", label: "แถวนี้แถวเดียว" },
  { v: "product", label: "ทุกสีในรุ่นเดียวกัน" },
  { v: "all", label: "ทุกแถวที่ลากมา" },
];
const parseLink = (v: unknown): LinkReorder | null => (v === "row" || v === "product" || v === "all" ? v : null);
const CONFIRM_OVER = 20;
const UPLOAD_CONCURRENCY = 3;
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
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  shop: { id: string; name: string };
  /** ติ๊กไว้ = จับคู่เฉพาะรุ่นเหล่านี้ · ไม่ส่ง = ทั้งร้าน */
  scopeIds?: string[] | null;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
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
  const [prints, setPrints] = useState<Record<string, VisualPrint | null>>({});
  /** ลายนิ้วมือภาพของรูปเดิมบนเว็บ (key R2) */
  const [oldPrints, setOldPrints] = useState<Record<string, VisualPrint | null>>({});
  const prepAsked = useRef(new Set<string>());
  const oldAsked = useRef(new Set<string>());
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
    setItems([]);
    setPreviews({});
    setPrints({});
    setShown(SHOW_PRODUCTS);
    setLookShown(SHOW_LOOK);
  };

  const load = async () => {
    setLoadErr(null);
    setCatalog(null);
    try {
      const r = await apiFetch(`/api/website/listings/images?shopId=${encodeURIComponent(shop.id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      setCatalog({ parents: j.parents ?? [], otherShops: j.otherShops ?? [] });
    } catch (e) {
      setLoadErr((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
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
      if (p) return { ...m, reason: `${p.code} ไม่ได้ติ๊กไว้ — ข้าม หรือเลือกช่องเอง` };
    }
    return m;
  };

  const addFiles = (raw: File[]) => {
    if (!catalog || phase !== "pick") return;
    const isVid = (f: File) => f.type.startsWith("video/") || isVideoName(f.name);
    const imgs = raw.filter((f) => isVid(f) || f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) return toast.warning("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)");
    if (imgs.some((f) => /\.mov$/i.test(f.name) || f.type === "video/quicktime")) toast.warning("ไฟล์ .MOV บางไฟล์เล่นบน Chrome/Android ไม่ได้ — แนะนำแปลงเป็น MP4 (H.264)");
    const have = new Set(itemsRef.current.map((it) => `${it.path}|${it.file.size}`));
    const fresh = imgs.filter((f) => !have.has(`${filePathOf(f)}|${f.size}`));
    const room = MAX_WEB_MASS_FILES - itemsRef.current.length;
    if (fresh.length > room) toast.warning(`ลงได้ครั้งละไม่เกิน ${MAX_WEB_MASS_FILES.toLocaleString()} ไฟล์ — รับ ${Math.max(0, room)} ไฟล์แรก`);
    const next = fresh.slice(0, Math.max(0, room)).map((file) => {
      const path = filePathOf(file);
      const video = isVid(file);
      const invalid = video && file.size > BIG_VIDEO_MAX_BYTES ? `วิดีโอใหญ่เกิน ${fileMb(BIG_VIDEO_MAX_BYTES)} (${fileMb(file.size)}) — ตัดคลิปให้สั้นลง/ลดความละเอียด` : undefined;
      return { id: `f${++seq.current}`, file, path, url: URL.createObjectURL(file), match: matchOf(path), video, invalid } as Item;
    });
    if (next.length) setItems((xs) => [...xs, ...next]);
  };

  const drop = useFileDrop((files) => addFiles(files), {
    accept: ["image/", "video/"],
    folders: true,
    disabled: phase !== "pick" || !catalog,
    onReject: () => toast.warning("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)"),
    onBusy: () => toast.info(catalog ? "กำลังอัปโหลดอยู่ รอสักครู่" : "กำลังโหลดรายการสินค้า รอสักครู่"),
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

  // 🖼 รูปพรีวิวย่อ (สูง 160px) + ลายนิ้วมือภาพ — ถอดรหัสครั้งเดียวต่อไฟล์ ทีละ 3 รูป · ส่งเข้า state ทุก 250 ms
  useEffect(() => {
    const want = items.filter((it) => !it.video && !it.invalid && !prepAsked.current.has(it.id));
    if (!want.length) return;
    want.forEach((it) => prepAsked.current.add(it.id));
    const pv: Record<string, string> = {};
    const pr: Record<string, VisualPrint | null> = {};
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
      if (a.length) setPreviews((m) => ({ ...m, ...Object.fromEntries(a) }));
      if (b.length) setPrints((m) => ({ ...m, ...Object.fromEntries(b) }));
    };
    let next = 0;
    const worker = async () => {
      while (next < want.length) {
        const it = want[next++];
        if (!itemsRef.current.some((x) => x.id === it.id)) continue;
        let url: string | null = null;
        let vp: VisualPrint | null = null;
        try {
          const bm = await createImageBitmap(it.file, { resizeHeight: 160, resizeQuality: "medium" });
          vp = visualPrintFromSource(bm);
          const c = document.createElement("canvas");
          c.width = bm.width;
          c.height = bm.height;
          c.getContext("2d")?.drawImage(bm, 0, 0);
          bm.close();
          const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.8));
          if (blob) url = URL.createObjectURL(blob);
        } catch {
          /* ถอดรหัสไม่ได้ (เช่น HEIC) = โชว์ไฟล์เต็ม · ไม่เทียบหน้าตา */
        }
        pv[it.id] = url ?? it.url;
        pr[it.id] = vp;
        if (!timer) timer = setTimeout(flush, 250);
      }
    };
    void Promise.all(Array.from({ length: 3 }, worker)).then(() => {
      if (timer) clearTimeout(timer);
      flush();
    });
  }, [items]);
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
      const list = p.webImages.map((key, i) => ({ key, where: `รูปบนเว็บ ${p.code} รูปที่ ${i + 1}` }));
      for (const sk of p.skus) sk.webImages.forEach((key, i) => list.push({ key, where: `รูปสี ${sk.code} รูปที่ ${i + 1}` }));
      by.set(p.parentId, list);
    }
    return by;
  }, [parents]);
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
    const got: Record<string, VisualPrint | null> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const b = { ...got };
      for (const k of Object.keys(got)) delete got[k];
      if (Object.keys(b).length) setOldPrints((m) => ({ ...m, ...b }));
    };
    let next = 0;
    const worker = async () => {
      while (next < want.length) {
        const key = want[next++];
        let vp: VisualPrint | null = null;
        try {
          const r = await fetch(r2ImageUrl(key, 96) ?? "");
          if (r.ok) vp = await visualPrintOf(await r.blob());
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
      const olds = (oldOf.get(d.parentId) ?? []).filter((o) => oldPrints[o.key]);
      if (!olds.length) continue;
      for (const id of d.fileIds) {
        const vp = prints[id];
        if (!vp) continue;
        let best: Dup | null = null;
        for (const o of olds) {
          const lv = similarity(vp, oldPrints[o.key] as VisualPrint);
          if (lv && (!best || (lv === "same" && best.level === "near"))) best = { level: lv, where: o.where };
          if (best?.level === "same") break;
        }
        if (best) out.set(id, best);
      }
    }
    return out;
  }, [plan, oldOf, oldPrints, prints, mode]);
  const dupSameIds = [...dupOf].filter(([, v]) => v.level === "same").map(([id]) => id);
  const imgTotal = items.filter((it) => !it.video && !it.invalid).length;
  const imgPrepped = items.filter((it) => !it.video && !it.invalid && it.id in prints).length;
  const oldPending = mode === "append" ? [...oldAsked.current].filter((k) => !(k in oldPrints)).length : 0;

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
    toast.action(`ไม่ลง ${ids.length} รูป · ${what} — อยู่ในกล่อง "ข้ามไว้" ด้านล่าง`, "เอากลับ", () => setSkip(ids, false));
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
    if (n > 1) toast.info(`สลับลำดับพร้อมกัน ${n} แถว (รูปใหม่ลำดับที่ ${from + 1} → ${to + 1})`);
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
    toast.info(`ย้ายรูป ${moving.size} ไฟล์จาก ${from.code} ไป ${to.code} แล้ว${lost ? ` — ${lost} ไฟล์รุ่นใหม่ไม่มีสีเดียวกัน ให้เลือกช่องในกล่อง "ไฟล์ที่ต้องดู"` : ""}`);
  };
  /** ชื่อช่องแบบบอกชัด: ลงที่ไหน · SKU อะไร */
  const destLabel = (t: ImageTarget, p: Parent): { title: string; sub: string } => {
    const sk = (id: string) => p.skus.find((x) => x.id === id);
    if (t.kind === "gallery") return { title: "🖼 รูปบนเว็บ (รวมทั้งรุ่น)", sub: `${p.code} · โชว์ตอนลูกค้ายังไม่เลือกสี` };
    if (t.kind === "sku") { const x = sk(t.skuId); return { title: `🎨 รูปสี · ${x?.code ?? "?"}`, sub: x?.label ?? "" }; }
    if (t.kind === "hero") return { title: `🎬 Hero ${t.slot === "desktop" ? "คอม" : "มือถือ"}`, sub: `รูปเปิดหน้าสินค้า ${p.code}` };
    const x = sk(t.skuId);
    return { title: `🎬 Hero ${t.slot === "desktop" ? "คอม" : "มือถือ"} · ${x?.code ?? "?"}`, sub: `รูปเปิดเมื่อเลือกสี${x?.label ?? ""}` };
  };
  /** ตัวเลือกช่องรูปของสินค้า (ใช้ร่วม: ย้ายทั้งแถว · ไฟล์ที่ต้องดู) */
  const slotOptions = (p: Parent, video: boolean) => (
    <>
      {!video && <option value="g">🖼 รูปบนเว็บ (รวมทั้งรุ่น)</option>}
      {!video && p.skus.map((x) => <option key={x.id} value={`s:${x.id}`}>🎨 รูปสี {x.code} {x.label}</option>)}
      <option value="h:desktop">🎬 Hero คอม</option>
      <option value="h:mobile">🎬 Hero มือถือ</option>
      {video && p.skus.flatMap((x) => (["desktop", "mobile"] as const).map((slot) => <option key={`${x.id}:${slot}`} value={`sh:${x.id}:${slot}`}>{targetLabel({ kind: "skuHero", skuId: x.id, slot }, p)}</option>))}
    </>
  );

  const run = async (retry = false) => {
    setErr(null);
    if (runningRef.current) return;
    const prev = retry ? result : null;
    if (retry && !prev?.failed.length) return;
    if (!retry && !uploadIds.length) return setErr("ยังไม่มีรูปที่จะลง");
    if (!retry && needConfirm && typed !== "CONFIRM") return setErr(`แทนที่รูป ${touched.length} สินค้าพร้อมกัน — พิมพ์ CONFIRM ก่อน`);
    if (!retry) {
      keysRef.current = new Map();
      savedDestRef.current = new Set();
      runPlanRef.current = plan.dests;
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
      label: `ลงรูปเว็บ ${total} ไฟล์ · ${shop.name}${retry ? " (ลงซ้ำ)" : ""}`,
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
                if (!it) failed.set(id, "ไม่พบไฟล์ — ลากมาใหม่");
                else if (!keysRef.current.has(id)) {
                  try {
                    // วิดีโอ: ตัวอัปกลางตัวเดียวกับช่อง Hero ทีละตัว (≤ 4 MB ผ่าน ERP · ใหญ่กว่านั้นส่งตรงเข้า R2 มีแถบ %)
                    if (it.video) keysRef.current.set(id, await uploadMediaFile(it.file, { folder: "storefront-hero", onProgress: (pct) => setVideoPct(pct) }));
                    else keysRef.current.set(id, (await uploadResizedImage(it.file, { folder: "storefront-products", max: 2000 })).r2_key);
                  } catch (e) {
                    failed.set(id, e instanceof MediaUploadError || e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
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
                if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
                updated += Number(j.updated) || 0;
                const fails: { shopId: string; parentId: string }[] = Array.isArray(j.failed) ? j.failed : [];
                const mine = new Set(fails.filter((x) => x.shopId === shop.id).map((x) => x.parentId));
                otherShopFails += fails.filter((x) => x.shopId !== shop.id).length;
                skippedShops += Array.isArray(j.skipped) ? j.skipped.filter((x: { shopId: string }) => x.shopId !== shop.id).length : 0;
                for (const d of group) {
                  const ids2 = got(d);
                  if (!ids2.length) continue;
                  if (mine.has(d.parentId)) ids2.forEach((id) => failed.set(id, "บันทึกลงเว็บไม่สำเร็จ"));
                  else {
                    savedDestRef.current.add(d.key);
                    ok += ids2.length;
                  }
                }
              } catch (e) {
                for (const d of group) got(d).forEach((id) => failed.set(id, `บันทึกลงเว็บไม่สำเร็จ: ${(e as Error).message}`));
              }
            }
            const bad = ids.filter((id) => failed.has(id)).length;
            setStatus(ri, bad === 0 ? "ok" : bad === ids.length ? "fail" : "part");
          }
        } catch (e) {
          setErr((e as Error).message || "เกิดข้อผิดพลาด");
        }
        const failList = finish();
        const runOk = ok - prevOk;
        if (failList.length || otherShopFails) toast.warning(`ลงรูปเสร็จ แต่ยังไม่ขึ้นเว็บ ${failList.length} ไฟล์ — เปิดหน้าต่าง ลงรูปเว็บทีละมาก แล้วกด "ลงซ้ำเฉพาะที่พลาด"`);
        else toast.success(`ลงรูป ${runOk} ไฟล์แล้ว — เว็บเปลี่ยนตามทันที`);
        return { ok: runOk, fail: failList.length, message: failList.length ? `ขึ้นเว็บ ${runOk} · ยังไม่ขึ้น ${failList.length}` : `ลงครบ ${runOk} ไฟล์` };
      },
    });
  };

  const busy = phase === "uploading";
  const close = () => {
    if (busy) toast.info("ลงรูปต่อเบื้องหลัง — ดูความคืบหน้าที่กล่องมุมขวาล่าง (ไปหน้าอื่นได้ แต่อย่าปิดแท็บเบราว์เซอร์)");
    onClose();
  };

  const thumb = (id: string, opts: { muted?: boolean; onSkip?: () => void; handle?: Record<string, unknown>; index?: number; onMove?: (dir: -1 | 1) => void; canPrev?: boolean; canNext?: boolean } = {}) => {
    const it = itemById.get(id);
    if (!it) return null;
    const parts = it.path.split("/");
    const fileName = parts.pop();
    const folder = parts.pop();
    const src = previews[id];
    const dup = dupOf.get(id);
    return (
      <div key={id} className={`group relative w-16 shrink-0 ${opts.muted ? "opacity-50" : ""}`} title={dup ? `${it.path}\n${dup.level === "same" ? "หน้าตาเหมือน" : "คล้าย"}${dup.where} (ดูรูปจางด้านซ้าย)` : it.path}>
        {it.video ? (
          <>
            <video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" className="h-20 w-16 rounded-md border border-slate-200 object-cover bg-slate-800" />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">🎬 {fileMb(it.file.size)}</span>
          </>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} {...(opts.handle ?? {})} title={opts.handle ? "กดค้างแล้วลาก = สลับลำดับ (เลข 1 = รูปหลัก)" : it.path} className={`h-20 w-16 rounded-md border object-cover bg-slate-100 ${dup ? "border-amber-400" : "border-slate-200"} ${opts.handle ? "cursor-grab active:cursor-grabbing" : ""}`} />
        ) : (
          <div {...(opts.handle ?? {})} className="h-20 w-16 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
        )}
        {dup && <span className={`pointer-events-none absolute right-1 top-1 rounded px-1 text-[10px] leading-4 text-white ${dup.level === "same" ? "bg-amber-600" : "bg-amber-500/90"}`}>{dup.level === "same" ? "ซ้ำเดิม" : "คล้ายเดิม"}</span>}
        {opts.index != null && !it.video && <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{opts.index + 1}</span>}
        {opts.onMove && phase === "pick" && (
          <span className="absolute bottom-[22px] right-0.5 flex gap-0.5">
            {opts.canPrev && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => opts.onMove?.(-1)} aria-label="เลื่อนไปซ้าย" className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">‹</button>}
            {opts.canNext && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => opts.onMove?.(1)} aria-label="เลื่อนไปขวา" className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">›</button>}
          </span>
        )}
        <p className="mt-0.5 truncate text-[10px] text-slate-500" title={it.path}>{folder ? <span className="text-slate-400">{folder}/</span> : null}{fileName}</p>
        {opts.onSkip && phase === "pick" && (
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={opts.onSkip} aria-label={`ข้าม ${it.path}`} title="ไม่ลงไฟล์นี้" className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] text-white group-hover:flex">
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
            ขึ้นเว็บแล้ว {result.ok} ไฟล์{result.failed.length ? ` · ยังไม่ขึ้น ${result.failed.length}` : ""}
          </span>
        ) : busy ? (
          <span className="text-slate-600">กำลังลงรูป {progress.done}/{progress.total} ไฟล์{videoPct !== null ? ` · วิดีโอ ${videoPct}%` : ""} · ปิดหน้าต่างได้ ลงต่อเบื้องหลัง</span>
        ) : (
          <span className="text-slate-500">
            {uploadIds.length
              ? `จะลง ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า${touched.length > ROUND_PRODUCTS ? ` (${Math.ceil(touched.length / ROUND_PRODUCTS)} รอบ)` : ""}${alsoShops.size ? ` (+ร้านอื่น ${alsoShops.size})` : ""}`
              : "ยังไม่มีรูปที่จะลง"}
          </span>
        )}
      </div>
      {needConfirm && phase === "pick" && (
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" className="h-9 w-36 rounded-lg border border-rose-300 px-2 font-mono text-sm" />
      )}
      {phase === "done" ? (
        <>
          <button type="button" onClick={() => { clearItems(); setResult(null); setRounds([]); setPhase("pick"); void load(); }} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            ลงชุดต่อไป
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">
            ปิด
          </button>
        </>
      ) : busy ? (
        <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
          ปิดหน้าต่าง (ลงต่อเบื้องหลัง)
        </button>
      ) : (
        <>
          {items.length > 0 && (
            <button type="button" onClick={clearItems} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">
              ล้างไฟล์ทั้งหมด
            </button>
          )}
          <button type="button" onClick={() => void run()} disabled={!uploadIds.length || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {uploadIds.length ? `ลงรูป ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า` : "ลงรูป"}
          </button>
        </>
      )}
    </div>
  );

  return (
    <ERPModal
      open={open}
      onClose={close}
      title={`📸 ลงรูปเว็บทีละมาก — ${shop.name}`}
      description={scope ? `เฉพาะ ${scope.size} รายการที่ติ๊กไว้ · จับคู่จากชื่อไฟล์ / ชื่อโฟลเดอร์` : "จับคู่จากชื่อไฟล์ / ชื่อโฟลเดอร์กับรหัสสินค้าและสี · ตรวจก่อนลงทุกครั้ง"}
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
              ลองใหม่
            </button>
          </div>
        ) : !catalog ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !parents.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">ร้านนี้ยังไม่มีสินค้าบนเว็บ — เพิ่มสินค้าเข้าเว็บก่อน แล้วค่อยลงรูป</div>
        ) : (
          <>
            {/* ① ที่วางไฟล์ + กติกาตั้งชื่อ */}
            {phase === "pick" && (
              <div {...drop.zone("mass")} className={`relative rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${drop.over === "mass" ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-slate-50/50"}`}>
                <FileDropHint show={drop.over === "mass"} label="วางเพื่อจับคู่รูป" />
                <p className="text-sm text-slate-700">
                  ลากทั้งโฟลเดอร์ หรือหลายไฟล์มาวางที่นี่ ·{" "}
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-blue-600 underline">
                    เลือกไฟล์
                  </button>{" "}
                  ·{" "}
                  <button type="button" onClick={() => dirRef.current?.click()} className="text-blue-600 underline">
                    เลือกโฟลเดอร์
                  </button>
                </p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  <code className="rounded bg-white px-1">JEAN08_1.jpg</code> → รูปบนเว็บ · <code className="rounded bg-white px-1">JEAN08-01_2.jpg</code> → รูปสี 01 ·{" "}
                  <code className="rounded bg-white px-1">JEAN08_hero.jpg</code> → Hero คอม · <code className="rounded bg-white px-1">JEAN08_hero_m.jpg</code> → Hero มือถือ ·{" "}
                  <code className="rounded bg-white px-1">JEAN08-01_hero.jpg</code> → Hero ของสีนั้น
                  <br />
                  🎬 วิดีโอ (mp4) = Hero อัตโนมัติ: <code className="rounded bg-white px-1">JEAN08.mp4</code> → คอม · <code className="rounded bg-white px-1">JEAN08_m.mp4</code> → มือถือ · ≤ 200 MB (แนะนำ ≤ 15 MB · 6–10 วินาที)
                  <br />
                  หรือแยกโฟลเดอร์ชื่อ <code className="rounded bg-white px-1">JEAN08/</code> · <code className="rounded bg-white px-1">JEAN08-01/</code> ก็ได้ · เลขท้าย _1 _2 (2) = ลำดับรูป · ครั้งละ ≤ {MAX_WEB_MASS_FILES.toLocaleString()} ไฟล์
                </p>
                <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,.mp4,.m4v,.webm,.mov" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <input ref={dirRef} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </div>
            )}

            {items.length > 0 && (
              <>
                {/* สรุป */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">จะลง {countOf("upload")}</span>
                  {countOf("unmatched") > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">ต้องเลือกเอง {countOf("unmatched")}</span>}
                  {countOf("over") + countOf("dupHero") > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-rose-700">เกิน/ซ้ำ {countOf("over") + countOf("dupHero")}</span>}
                  {countOf("invalid") > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-rose-700">ลงไม่ได้ {countOf("invalid")}</span>}
                  {countOf("skip") > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">ข้าม {countOf("skip")}</span>}
                  {dupOf.size > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800" title="เทียบหน้าตารูปใหม่กับรูปเดิมบนเว็บของสินค้านั้น — เตือนให้ดูด้วยตา ไม่ข้ามเอง">
                      <Icon name="view" className="mr-0.5 inline-block align-[-2px]" />หน้าตาเหมือนรูปเดิม {dupOf.size}
                    </span>
                  )}
                  {dupSameIds.length > 0 && phase === "pick" && (
                    <button type="button" onClick={() => skipMany(dupSameIds, "หน้าตาซ้ำรูปเดิม")} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-amber-800 hover:bg-amber-50">
                      <Icon name="cancel" className="mr-0.5 inline-block align-[-2px]" />ไม่ลงรูปที่ซ้ำทั้งหมด ({dupSameIds.length})
                    </button>
                  )}
                  {phase === "pick" && (imgPrepped < imgTotal || oldPending > 0) && (
                    <span className="text-slate-400">
                      {imgPrepped < imgTotal ? `กำลังเตรียมรูป ${imgPrepped}/${imgTotal}` : "กำลังโหลดรูปเดิมมาเทียบ"}
                      {mode === "append" ? " · เทียบหน้าตากับรูปเดิมบนเว็บ…" : "…"}
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">
                    {items.length} ไฟล์ · {touched.length} สินค้า
                  </span>
                </div>

                {phase !== "pick" && rounds.length > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3.5 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {phase === "uploading" ? `กำลังลงรูป ${progress.done}/${progress.total} ไฟล์${videoPct !== null ? ` · วิดีโอ ${videoPct}%` : ""}` : "ลงรูปเสร็จแล้ว"}
                      </span>
                      <span className="text-slate-500">ลงทีละรอบ รอบละ {ROUND_PRODUCTS} สินค้า · รอบที่เสร็จขึ้นเว็บทันที</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                    </div>
                    <div className="mt-1 divide-y divide-blue-100">
                      {rounds.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 py-1">
                          <span className="w-12 shrink-0 text-slate-700">รอบ {i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-500" title={r.codes.join(", ")}>
                            {r.codes.length} สินค้า · {r.files} ไฟล์ · {r.codes.slice(0, 4).join(", ")}{r.codes.length > 4 ? " …" : ""}
                          </span>
                          <span className={`shrink-0 ${ROUND_LABEL[r.status].cls}`}>{ROUND_LABEL[r.status].icon && <Icon name={ROUND_LABEL[r.status].icon} className="mr-0.5 inline-block align-[-2px]" />}{ROUND_LABEL[r.status].text}</span>
                        </div>
                      ))}
                    </div>
                    {phase === "uploading" && <p className="mt-1 text-[11px] text-slate-500">ปิดหน้าต่างนี้ได้ — ลงต่อเบื้องหลัง (ดูกล่องมุมขวาล่าง) · ไปหน้าอื่นใน ERP ได้ แต่อย่าปิดแท็บเบราว์เซอร์จนกว่าจะเสร็จ</p>}
                  </div>
                )}

                {linkable && phase === "pick" && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-700">↕ สลับลำดับรูปแล้ว แถวอื่นตำแหน่งเดียวกันสลับตาม:</span>
                    {LINK_OPTS.map((o) => (
                      <button key={o.v} type="button" onClick={() => setLinkReorder(o.v)} className={seg(linkReorder === o.v)}>
                        {o.label}
                      </button>
                    ))}
                    <span className="text-[11px] text-slate-400">เฉพาะแถวชนิดเดียวกัน (รูปสี↔รูปสี) ที่มีรูปถึงตำแหน่งนั้น</span>
                  </div>
                )}

                {/* ② แยกตามสินค้า */}
                {touched.slice(0, shown).map((pid) => {
                  const p = byId.get(pid)!;
                  const dests = plan.dests.filter((d) => d.parentId === pid);
                  return (
                    <div key={pid} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-sm">
                          <b className="font-semibold text-slate-900">{p.code}</b> <span className="text-slate-500">{p.name}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-slate-400">
                            {p.skus.length} สี · ลงที่ร้าน {[shop.name, ...otherShops.filter((o) => alsoShops.has(o.id) && p.otherShopIds.includes(o.id)).map((o) => o.name)].join(" + ")}
                          </span>
                          {phase === "pick" && parents.length > 1 && (
                            <select value="" onChange={(e) => e.target.value && changeProduct(pid, e.target.value)} aria-label={`เปลี่ยนสินค้าของ ${p.code}`} className="h-7 max-w-[13rem] rounded-md border border-slate-300 bg-white px-1.5 text-[11px] text-slate-700">
                              <option value="">🔁 อ่านผิด? เปลี่ยนสินค้า…</option>
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
                              title="ไม่ลงรูปทั้งหมดของสินค้านี้ (เอากลับได้)"
                            >
                              ✕ ไม่ลงสินค้านี้
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
                        const dupSame = dups.filter((id) => dupOf.get(id)?.level === "same");
                        return (
                          <div key={d.key} className="mt-2 grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-2 border-t border-slate-100 pt-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-700" title={dl.title}>{dl.title}</p>
                              <p className="truncate text-[11px] text-slate-500" title={dl.sub}>{dl.sub}</p>
                              {phase === "pick" && (
                                <div className="mt-0.5 flex flex-col items-start gap-0.5">
                                  <button type="button" onClick={() => setEditDest(editing ? null : { key: d.key, pid })} className="text-[11px] text-blue-600 hover:underline">
                                    {editing ? "ปิด" : "✎ ย้ายแถวนี้ (อ่านผิด)"}
                                  </button>
                                  <button type="button" onClick={() => skipMany(d.fileIds, dl.title.replace(/^\S+\s/, ""))} className="text-[11px] text-slate-500 hover:text-rose-600 hover:underline" title="ไม่ลงรูปทั้งแถวนี้ (เช่น ลงซ้ำของที่มีแล้ว · เอากลับได้)">
                                    ✕ ไม่ลงแถวนี้
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              {old.length > 0 && (
                                <>
                                  <OldThumbs keys={old} gone={d.replaces} hero={isHero} />
                                  <span className="mb-[18px] flex h-20 flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-3 text-blue-600" aria-hidden>
                                    <span className="h-full w-px bg-blue-200" />
                                    {d.replaces ? "แทน" : "ใหม่"}
                                    <span className="h-full w-px bg-blue-200" />
                                  </span>
                                </>
                              )}
                              <DestThumbs
                                group={d.key}
                                ids={d.fileIds}
                                canDrag={phase === "pick" && d.fileIds.length > 1}
                                onReorder={(from, to) => reorderDest(d, from, to)}
                                render={(id, i, handle) =>
                                  thumb(id, {
                                    onSkip: () => setSkip([id], true),
                                    handle,
                                    index: numbered ? base + i : undefined,
                                    onMove: d.fileIds.length > 1 ? (dir) => reorderDest(d, i, i + dir) : undefined,
                                    canPrev: i > 0,
                                    canNext: i < d.fileIds.length - 1,
                                  })
                                }
                              />
                              <span className={`self-center text-[11px] ${d.replaces ? "text-amber-700" : "text-slate-500"}`}>
                                {isHero
                                  ? d.replaces
                                    ? "แทน Hero เดิม"
                                    : "ใหม่ (เดิมว่าง)"
                                  : d.replaces
                                    ? `แทนที่รูปเดิม ${d.existing} รูป → เหลือ ${d.total}/${d.limit}`
                                    : `+${d.fileIds.length} ต่อท้าย${d.existing ? ` (เดิม ${d.existing} → รวม ${d.total}/${d.limit})` : ` (รวม ${d.total}/${d.limit})`}`}
                              </span>
                              {dups.length > 0 && (
                                <span className="flex flex-wrap items-center gap-1.5 self-center">
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800"><Icon name="view" className="mr-0.5 inline-block align-[-2px]" />หน้าตาเหมือนรูปเดิม {dups.length}/{d.fileIds.length}</span>
                                  {phase === "pick" && dupSame.length > 0 && (
                                    <button type="button" onClick={() => skipMany(dupSame, `ซ้ำรูปเดิม · ${dl.title.replace(/^\S+\s/, "")}`)} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-50">
                                      <Icon name="cancel" className="mr-0.5 inline-block align-[-2px]" />ไม่ลงรูปที่ซ้ำ ({dupSame.length})
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                            {editing && (
                              <div className="col-span-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-blue-50/70 px-2.5 py-2">
                                <span className="text-[11px] text-slate-700">ย้ายรูป {d.fileIds.length} รูปในแถวนี้ไป:</span>
                                <select value={editing.pid} onChange={(e) => setEditDest({ key: d.key, pid: e.target.value })} aria-label="สินค้าปลายทาง" className="h-8 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-xs">
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
                                    aria-label="ช่องรูปปลายทาง"
                                    className="h-8 max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                  >
                                    <option value="">— เลือกช่องรูป —</option>
                                    {slotOptions(ep, hasVideo)}
                                  </select>
                                )}
                                <span className="text-[11px] text-slate-500">เลือกช่องแล้วย้ายทันที</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {touched.length > shown && (
                  <button type="button" onClick={() => setShown((n) => n + SHOW_PRODUCTS)} className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:bg-slate-50">
                    แสดงอีก {Math.min(SHOW_PRODUCTS, touched.length - shown)} สินค้า (เหลือ {touched.length - shown} จาก {touched.length})
                  </button>
                )}

                {/* ③ ไฟล์ที่ต้องดู */}
                {needLook.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-3.5 py-2.5">
                    <p className="mb-1 text-sm font-medium text-slate-800">ไฟล์ที่ต้องดู ({needLook.length})</p>
                    {needLook.slice(0, lookShown).map((f) => {
                      const it = itemById.get(f.id)!;
                      const man = it.manual ?? null;
                      const pid = man?.parentId ?? f.parentId ?? "";
                      const p = pid ? byId.get(pid) : undefined;
                      const why = man && !man.target ? "เลือกช่องรูปต่อ" : f.plan === "unmatched" ? it.match.reason || "ยังไม่ได้เลือกช่อง" : f.note || "";
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
                                aria-label="เลือกสินค้า"
                              >
                                <option value="">— เลือกสินค้า —</option>
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
                                  aria-label="เลือกช่องรูป"
                                >
                                  <option value="">— ช่องรูป —</option>
                                  {slotOptions(p, it.video)}
                                </select>
                              )}
                              <button type="button" onClick={() => setSkip([f.id], true)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
                                ข้าม
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {needLook.length > lookShown && (
                      <button type="button" onClick={() => setLookShown((n) => n + SHOW_LOOK)} className="mt-1 w-full rounded-lg border border-dashed border-amber-300 py-1.5 text-xs text-amber-800 hover:bg-amber-50">
                        แสดงอีก {Math.min(SHOW_LOOK, needLook.length - lookShown)} ไฟล์ (เหลือ {needLook.length - lookShown})
                      </button>
                    )}
                  </div>
                )}

                {/* ⏭ ข้ามไว้ — เอากลับทีละกลุ่ม */}
                {skipped.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">⏭ ข้ามไว้ — ไม่ลง ({countOf("skip")} รูป)</p>
                      {phase === "pick" && skipped.length > 1 && (
                        <button type="button" onClick={() => setSkip(skipped.flatMap((g) => g.ids), false)} className="text-[11px] text-blue-600 hover:underline">
                          ↩ เอากลับทั้งหมด
                        </button>
                      )}
                    </div>
                    {skipped.map((g) => {
                      const sp = g.parentId ? byId.get(g.parentId) : undefined;
                      const label = sp && g.target ? `${sp.code} · ${destLabel(g.target, sp).title}` : sp ? `${sp.code} · ยังไม่ได้เลือกช่อง` : "ไม่พบรหัสสินค้า";
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
                              ↩ เอากลับ {g.ids.length} รูป
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
                    <span className="text-sm text-slate-800">รูปเดิมที่มีอยู่</span>
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => setMode("append")} className={seg(mode === "append")}>
                        เพิ่มต่อท้าย
                      </button>
                      <button type="button" disabled={busy} onClick={() => setMode("replace")} className={seg(mode === "replace")}>
                        แทนที่ของเดิม
                      </button>
                    </div>
                  </div>
                  {otherShops.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <span className="text-sm text-slate-800">ลงที่ร้านอื่นที่มีสินค้านี้ด้วย</span>
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
                            {s.name} (มี {s.has}/{touched.length} ตัว)
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className={`mt-2 text-[11px] ${mode === "replace" ? "text-rose-600" : "text-slate-500"}`}>
                    {mode === "replace"
                      ? `โหมดแทนที่: รูปเดิมของช่องที่มีรูปใหม่จะถูกเอาออกจากเว็บ (ไฟล์ยังอยู่ในคลัง · ช่องอื่นไม่แตะ)${touched.length > CONFIRM_OVER ? " · เกิน 20 สินค้าต้องพิมพ์ CONFIRM" : ""}`
                      : "รูปย่อเหลือกว้าง ≤ 2000px อัตโนมัติ · ไฟล์ที่ข้ามจะไม่อัปโหลด · Hero มีช่องละ 1 ไฟล์ รูปหรือวิดีโอ (ไฟล์ใหม่แทนของเดิม) · บันทึกประวัติว่าใครลงรูปอะไร"}
                  </p>
                </div>

                {/* ⑤ สรุปผล */}
                {phase === "done" && result && (
                  <div className={`rounded-xl border px-3.5 py-3 text-sm ${result.failed.length || result.otherShopFails ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                    <p className="font-medium text-slate-800">
                      <Icon name="done" className="mr-0.5 inline-block align-[-2px]" />ขึ้นเว็บแล้ว {result.ok} ไฟล์ · อัปเดต {result.updated} รายการ — เว็บเปลี่ยนตามทันที
                    </p>
                    {result.skippedShops > 0 && <p className="mt-1 text-xs text-slate-500">ร้านอื่น: ข้าม {result.skippedShops} รายการที่ไม่มีสินค้านั้นในร้าน</p>}
                    {result.otherShopFails > 0 && <p className="mt-1 text-xs text-rose-700">ร้านอื่น: บันทึกไม่สำเร็จ {result.otherShopFails} รายการ</p>}
                    {result.failed.length > 0 && (
                      <div className="mt-1.5 text-xs text-rose-700">
                        <p>ยังไม่ขึ้นเว็บ {result.failed.length} ไฟล์ — รอบอื่นขึ้นครบแล้ว ไม่ต้องลงใหม่ทั้งชุด</p>
                        <p className="mt-0.5 text-rose-600">
                          {result.failed.slice(0, 8).map((x) => `${x.name} (${x.why})`).join(" · ")}
                          {result.failed.length > 8 ? " …" : ""}
                        </p>
                        <button type="button" onClick={() => void run(true)} className="mt-2 h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700">
                          <Icon name="refresh" className="mr-0.5 inline-block align-[-2px]" />ลงซ้ำเฉพาะ {result.failed.length} ไฟล์ที่พลาด
                        </button>
                        <span className="ml-2 text-[11px] text-slate-500">ไฟล์ที่อัปแล้วไม่อัปใหม่ · แถวที่ขึ้นเว็บบางส่วนแล้ว = ต่อท้าย</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {items.length === 0 && (
              <p className="text-[11px] text-slate-400">
                ช่องที่ลงได้: รูปบนเว็บ (≤ 12 รูป/สินค้า) · รูปสี (≤ 8 รูป/สี) · Hero คอม/มือถือ ของสินค้าและของแต่ละสี (รูปหรือวิดีโอ) — ช่องที่ไม่มีรูปใหม่ = ไม่แตะ
                {catalog.parents.length ? ` · ตัวอย่างรหัสในร้าน: ${parents.slice(0, 3).map((p) => p.code).join(", ")}` : ""}
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
  return (
    <>
      {keys.map((k, i) => {
        const tip = gone ? "รูปเดิม — จะถูกเอาออกจากเว็บ (ไฟล์ยังอยู่ในคลัง)" : `รูปเดิมบนเว็บ ลำดับ ${i + 1} — ไม่ถูกแตะ`;
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
                  <span className="rounded bg-rose-600/85 px-1 text-[10px] leading-4 text-white">✕ ออก</span>
                </span>
              )}
            </div>
            <p className={`mt-0.5 truncate text-[10px] ${gone ? "text-rose-500 line-through" : "text-slate-400"}`}>{gone ? "จะเอาออก" : "รูปเดิม"}</p>
          </div>
        );
      })}
    </>
  );
}

function DestThumbs({ group, ids, canDrag, onReorder, render }: {
  group: string;
  ids: string[];
  canDrag: boolean;
  onReorder: (from: number, to: number) => void;
  render: (id: string, i: number, handle: Record<string, unknown> | undefined) => ReactNode;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder, { group: `mass:${group}` });
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
