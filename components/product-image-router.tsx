"use client";
/**
 * 📂 จัดรูปหลายโฟลเดอร์ลงช่องรูปสินค้า (ของกลาง) — เปิดจากหน้ารวม Parent SKU (หลายรุ่น) / ตารางลูกโหมดรูปภาพ (รุ่นนั้น)
 * --------------------------------------------------------------------------
 * 1) ลากหลายโฟลเดอร์/หลายรูป → ชื่อโฟลเดอร์ = รหัสสี (BCG11-01) · รหัสไซส์ (BCG12-01-L → สีหลัก) · รหัสรุ่น (BCG11 = ทั้งรุ่น)
 * 2) จัดรูปลงช่อง: แม่แบบ (รูป 1 = ปก …) + ชื่อไฟล์บอกเอง (ปก · hero · hero_m · desc · png) · ตั้งทีละรูป/ทั้งคอลัมน์/ทั้งโฟลเดอร์
 *    ลากสลับลำดับ (รูปแรก = ปก) · เห็นรูปเดิม · เลือกร้านปลายทาง · ขนาดรูป (ลดตามช่อง/เท่ากัน/ไม่ลด · ตั้งทับรายโฟลเดอร์)
 * 3) ตรวจก่อนยืนยัน (lib/product-image-routing planRoute) · ต่อท้าย/แทนที่ · แทนที่เกิน 20 รุ่น = พิมพ์ CONFIRM
 * 4) อัปเบื้องหลัง (runBackgroundTask · ปิดหน้าต่างได้) → อัปซ้ำเฉพาะที่พลาด · ↩ ย้อนทั้งชุด (โหมดต่อท้าย)
 * ปลายทาง (ของกลางทั้งหมด):
 *   แกลเลอรี SKU ลูก/Parent → /api/attachments (≤ 2 MB) หรือส่งตรงเข้า R2 + /api/product-images (ตัวเต็ม) · ปก = PATCH /api/attachments/[id]
 *   รูป Description → /api/assets + /api/assets/description · รูปตัด PNG → /api/website/product-png
 *   รูปบนเว็บรายสี / Hero → /api/website/listings/images (ตัวรวมของลงรูปเว็บทีละมาก · คืน changes ไว้ย้อน)
 * ของกลาง UI: ERPModal · ConfirmDialog · useFileDrop(folders) · useDragReorder · useUserPref (แม่แบบ/ขนาด/ร้าน ต่อคน) · toast
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { useFileDrop, FileDropHint, filePathOf } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { uploadResizedImage } from "@/components/image-attach";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { downscaleImageWidth } from "@/lib/image-resize";
import { uploadMediaAsset, uploadMediaFile } from "@/lib/media-upload";
import { runBackgroundTask } from "@/lib/background-tasks";
import { MAX_MASS_FILES } from "@/lib/website-image-match";
import {
  DEFAULT_TEMPLATE,
  DEST_LABEL,
  GALLERY_MAX,
  RESIZE_FIXED_OPTIONS,
  RESIZE_HINT,
  ROW_MODE_LABEL,
  applyRowMode,
  baseNameOf,
  buildWebItems,
  candidateCodes,
  estimateBytes,
  groupRouteFiles,
  imageWarning,
  mb,
  parseTemplate,
  planRoute,
  resizeWidth,
  routeCodeIndex,
  templateFrom,
  type FolderMatch,
  type FolderTarget,
  type MassMode,
  type PlanGroupIn,
  type PlanSlot,
  type ResizeMode,
  type RouteDest,
  type RouteImage,
  type RouteTemplate,
  type RowMode,
} from "@/lib/product-image-routing";
import type { CatalogParent } from "@/app/api/product-images/catalog/route";
import { SIMILAR_LABEL, similarRank, similarity, visualPrintOf, type SimilarLevel, type VisualPrint } from "@/lib/image-similarity";

type Shop = { id: string; name: string; isDefault: boolean };
type Item = { id: string; file: File; path: string; base: string; url: string; width: number | null; height: number | null; isPng: boolean; sig: string | null; /** 👀 ลายนิ้วมือภาพ (undefined = กำลังตรวจ · null = อ่านไม่ได้) */ vp?: VisualPrint | null };
/** 👀 รูปที่หน้าตาเหมือน/คล้ายกัน (คนละไฟล์) — เตือนให้ดูด้วยตา ไม่ข้ามเอง */
type Similar = { level: SimilarLevel; label: string; url: string };
type GroupState = {
  key: string;
  label: string;
  match: FolderMatch;
  target: FolderTarget | null;
  /** ผู้ใช้เลือกรุ่น/สีเอง */
  picked: boolean;
  order: string[];
  mode: RowMode | "mixed";
  dests: Record<string, { dest: RouteDest; by: RouteImage["by"] }>;
  resize: "" | "auto" | "none";
};
type Phase = "pick" | "loading" | "sort" | "review" | "run" | "done";
type ResizePref = { mode: ResizeMode; px: number };
/** ข้อมูลไว้ "ย้อนทั้งชุด" ที่ส่งเก็บในประวัติชุดอัป (lib/image-batches UndoInfo) */
type UndoInfo = {
  prevPrimary: Record<string, string>;
  png: { parentId: string; before: string | null; after: string }[];
  web: unknown[];
  replaced: { table: "skus_v2" | "parent_skus_v2"; entityId: string; key: string }[];
};
/** รูปในชุดที่อัปสำเร็จ (แถวของ erp_image_batch_items) */
type BatchItem = { source_sig: string; source_name: string; source_bytes: number; parent_id: string; sku_id: string | null; dest: RouteDest; attachment_id: string | null; asset_id: string | null; r2_key: string | null };
/** เคยอัปแล้ว (จากประวัติชุดอัป) */
type SeenEntry = { at: string; by: string | null; parentId: string; skuId: string | null; dest: RouteDest };
type RunState = { done: number; total: number; ok: number; failed: { id: string; why: string }[]; batch: string; batchId: string | null; undone?: boolean };

const UPLOAD_CONCURRENCY = 3;
const CONFIRM_OVER = 20;
const SMALL_GALLERY_BYTES = 2 * 1024 * 1024;
const SMALL_PROXY_BYTES = 4 * 1024 * 1024;
const btn = "h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const seg = (on: boolean, warn = false) =>
  `h-8 rounded-lg border px-3 text-xs ${on ? (warn ? "border-amber-400 bg-amber-50 text-amber-800" : "border-blue-500 bg-blue-50 text-blue-700") : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;
const thumbUrl = (key: string, w = 96) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
/** ขนาดไฟล์แบบอ่านง่าย (เล็กกว่า 1 MB = KB) */
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb(bytes)} MB`);
const parseResize = (v: unknown): ResizePref | null => {
  const o = v as Partial<ResizePref> | null;
  return o && (o.mode === "auto" || o.mode === "fixed" || o.mode === "none") && typeof o.px === "number" ? { mode: o.mode, px: o.px } : null;
};
const parseShops = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/** ขนาดรูป (อ่านจากหัวไฟล์ผ่าน <img> ไม่ต้องถอดรหัสทั้งรูป) */
function readDims(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => ok(null);
    im.src = url;
  });
}
/**
 * ลายนิ้วมือไฟล์ต้นฉบับ (ขนาด + SHA-256 ของ 256 KB แรก + 64 KB ท้าย · ก่อนย่อ) — เร็ว ไม่ต้องอ่านทั้งไฟล์
 * ใช้จับรูปซ้ำในชุดนี้ + "เคยอัปแล้ว" ข้ามวัน (ประวัติชุดอัป · รูปแบบตรงกับ SIG_RE ของ lib/image-batches)
 */
async function fileSig(f: File): Promise<string | null> {
  try {
    const head = await f.slice(0, 256 * 1024).arrayBuffer();
    const tail = f.size > 256 * 1024 ? await f.slice(Math.max(256 * 1024, f.size - 64 * 1024)).arrayBuffer() : new ArrayBuffer(0);
    const both = new Uint8Array(head.byteLength + tail.byteLength);
    both.set(new Uint8Array(head), 0);
    both.set(new Uint8Array(tail), head.byteLength);
    const h = await crypto.subtle.digest("SHA-256", both);
    return `${f.size}:${Array.from(new Uint8Array(h).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}
async function jsonOf(r: Response) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || `ระบบตอบ ${r.status}`);
  return j;
}

export function ProductImageRouter({
  open,
  onClose,
  parentIds,
  initialFiles,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** เปิดจากหน้ารุ่นไหน (ไม่ส่ง = หารุ่นจากชื่อโฟลเดอร์ล้วน) */
  parentIds?: string[];
  /** ไฟล์ที่ลากมาวางไว้แล้ว (เช่น วางที่ช่องโยนหลายรูปของตารางลูก) */
  initialFiles?: File[] | null;
  onDone?: () => void;
}) {
  const toast = useToast();
  const { can, user } = useAuth();
  const canDelete = can("attachments.delete");
  const actor = user?.name ?? user?.email ?? null;
  const [template, setTemplate] = useUserPref<RouteTemplate>("product_image_router_template", DEFAULT_TEMPLATE, parseTemplate);
  const [resizePref, setResizePref] = useUserPref<ResizePref>("product_image_router_resize", { mode: "auto", px: 2000 }, parseResize);
  const [shopPref, setShopPref] = useUserPref<string[] | null>("product_image_router_shops", null, parseShops);

  const [items, setItems] = useState<Item[]>([]);
  const [catalog, setCatalog] = useState<{ parents: CatalogParent[]; shops: Shop[]; truncated: boolean } | null>(null);
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [phase, setPhase] = useState<Phase>("pick");
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<MassMode>("append");
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<RunState | null>(null);
  const [undoAsk, setUndoAsk] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  // 🕘 เคยอัปแล้ว (ลายนิ้วมือ → ที่เคยลง) · หน้าประวัติชุดอัป
  const [seen, setSeen] = useState<Record<string, SeenEntry[]>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  // 👀 รูปหน้าตาซ้ำ: ลายนิ้วมือภาพของรูปเดิมในระบบ (key → ลายนิ้วมือ) · รูปที่กด "ไม่ซ้ำ" แล้ว · หน้าต่างดูเทียบ
  const [existingVp, setExistingVp] = useState<Record<string, VisualPrint | null>>({});
  const [notDup, setNotDup] = useState<Set<string>>(new Set());
  const [compareId, setCompareId] = useState<string | null>(null);
  const existingAsked = useRef<Set<string>>(new Set());
  const [colPick, setColPick] = useState<{ n: number; dest: RouteDest }>({ n: 1, dest: "sku" });
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const seenIdsRef = useRef<Set<string>>(new Set());

  const parents = useMemo(() => catalog?.parents ?? [], [catalog]);
  const byParent = useMemo(() => new Map(parents.map((p) => [p.parentId, p])), [parents]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  // ค่าเริ่มต้น (ยังไม่เคยติ๊กเอง) = ทุกร้านที่ขายรุ่นที่ลากมา — เหมือนแท็บ 🛍 เว็บไซต์ของ Parent ที่โชว์ทุกร้าน
  const shopsShown = useMemo(() => (catalog?.shops ?? []).filter((s) => parents.some((p) => p.shopIds.includes(s.id))), [catalog, parents]);
  const shopIds = shopPref ?? shopsShown.map((s) => s.id);

  const reset = () => {
    for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    setItems([]);
    setGroups([]);
    setCatalog(null);
    setPhase("pick");
    setErr(null);
    setMode("append");
    setTyped("");
    setRun(null);
    setSeen({});
    setNotDup(new Set());
  };
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)), []);

  // ── สร้างกลุ่มจากไฟล์ทั้งหมด (คงค่าที่ตั้งไว้ของกลุ่มเดิม) ──
  const rebuild = useCallback(
    (all: Item[], cat: { parents: CatalogParent[] }, tpl: RouteTemplate) => {
      const prev = new Map(groupsRef.current.map((g) => [g.key, g]));
      const index = routeCodeIndex(cat.parents);
      const next = groupRouteFiles(
        all.map((it) => ({ id: it.id, path: it.path })),
        cat.parents,
        index
      ).map((g): GroupState => {
        const old = prev.get(g.key);
        if (old) {
          const added = g.fileIds.filter((id) => !old.order.includes(id));
          // รหัสที่เพิ่งรู้จัก (ลากเพิ่มแล้วโหลดสินค้าใหม่) → ใช้ผลจับคู่ใหม่ ถ้ายังไม่ได้เลือกเอง
          const st = { ...old, match: g.match, target: old.picked ? old.target : g.match.target, order: [...old.order.filter((id) => g.fileIds.includes(id)), ...added] };
          return old.mode === "mixed" ? { ...st, dests: { ...st.dests, ...destsFor(st, "tpl", tpl, all, added, seenIdsRef.current) } } : { ...st, dests: destsFor(st, old.mode, tpl, all, undefined, seenIdsRef.current) };
        }
        const st: GroupState = { key: g.key, label: g.label, match: g.match, target: g.match.target, picked: false, order: g.fileIds, mode: "tpl", dests: {}, resize: "" };
        return { ...st, dests: destsFor(st, "tpl", tpl, all, undefined, seenIdsRef.current) };
      });
      setGroups(next);
    },
    []
  );

  const loadCatalog = async (all: Item[]) => {
    setPhase("loading");
    setErr(null);
    try {
      const r = await apiFetch("/api/product-images/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: candidateCodes(all.map((it) => it.path)), parentIds: parentIds ?? [] }),
      });
      const j = await jsonOf(r);
      const cat = { parents: (j.parents ?? []) as CatalogParent[], shops: (j.shops ?? []) as Shop[], truncated: !!j.truncated };
      setCatalog(cat);
      rebuild(all, cat, template);
      setPhase("sort");
    } catch (e) {
      setErr((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
      setPhase(itemsRef.current.length ? "sort" : "pick");
    }
  };

  const addFiles = async (raw: File[]) => {
    if (phase === "run") return toast.info("กำลังอัปชุดก่อนอยู่ — รอให้เสร็จก่อน แล้วค่อยลากชุดต่อไป");
    if (phase === "loading") return;
    const imgs = raw.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!imgs.length) return toast.warning("ลากได้เฉพาะไฟล์รูป (jpg / png / webp)");
    if (imgs.some((f) => /\.(heic|heif)$/i.test(f.name))) toast.warning("ไฟล์ HEIC (รูป iPhone) ยังอัปไม่ได้ — แปลงเป็น JPG ก่อน");
    // ชุดก่อนอัปเสร็จแล้ว → ลากใหม่ = เริ่มชุดใหม่
    const startOver = phase === "done";
    if (startOver) {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
      groupsRef.current = [];
      setGroups([]);
      setRun(null);
      setMode("append");
      setTyped("");
    }
    const current = startOver ? [] : itemsRef.current;
    const have = new Set(current.map((it) => `${it.path}|${it.file.size}`));
    const fresh = imgs.filter((f) => !/\.(heic|heif)$/i.test(f.name) && !have.has(`${filePathOf(f)}|${f.size}`));
    const room = MAX_MASS_FILES - current.length;
    if (fresh.length > room) toast.warning(`ครั้งละไม่เกิน ${MAX_MASS_FILES} รูป — รับ ${Math.max(0, room)} รูปแรก`);
    const next: Item[] = fresh.slice(0, Math.max(0, room)).map((file) => {
      const path = filePathOf(file);
      return { id: `f${++seq.current}`, file, path, base: baseNameOf(path), url: URL.createObjectURL(file), width: null, height: null, isPng: file.type === "image/png" || /\.png$/i.test(file.name), sig: null };
    });
    if (!next.length) return;
    const all = [...current, ...next];
    itemsRef.current = all;
    setItems(all);
    void loadCatalog(all);
    // ขนาดรูป + ลายนิ้วมือ (ทีละ 4 ไฟล์ · อัปเดตหน้าจอทีละชุด)
    for (let i = 0; i < next.length; i += 4) {
      const part = next.slice(i, i + 4);
      const facts = await Promise.all(part.map(async (it) => ({ id: it.id, dims: await readDims(it.url), sig: await fileSig(it.file), vp: await visualPrintOf(it.file) })));
      setItems((xs) => xs.map((x) => { const f = facts.find((y) => y.id === x.id); return f ? { ...x, width: f.dims?.w ?? null, height: f.dims?.h ?? null, sig: f.sig, vp: f.vp } : x; }));
      for (const f of facts) { const it = next.find((x) => x.id === f.id); if (it) it.sig = f.sig; }
    }
    // 🕘 เคยอัปแล้วไหม (ประวัติชุดอัป) — เช็กไม่ได้ = อัปได้ตามปกติ
    const sigs = [...new Set(next.map((it) => it.sig).filter((x): x is string => !!x))];
    if (sigs.length) {
      try {
        const j = await jsonOf(await apiFetch("/api/product-images/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seen", sigs }) }));
        if (j.seen && typeof j.seen === "object") setSeen((cur) => ({ ...cur, ...(j.seen as Record<string, SeenEntry[]>) }));
      } catch {
        /* เช็กประวัติไม่ได้ ไม่ขวางการอัป */
      }
    }
  };
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  const lastInit = useRef<File[] | null>(null);
  useEffect(() => {
    // ไฟล์ที่โยนมาจากช่องโยนหลายรูป (ครั้งใหม่ = ชุดใหม่ ถ้าชุดก่อนเสร็จแล้ว)
    if (!open || !initialFiles?.length || initialFiles === lastInit.current) return;
    lastInit.current = initialFiles;
    void addRef.current(initialFiles);
  }, [open, initialFiles]);

  const drop = useFileDrop((files) => void addFiles(files), {
    accept: "image/",
    folders: true,
    disabled: phase === "run" || phase === "loading",
    onReject: () => toast.warning("ลากได้เฉพาะไฟล์รูป (jpg / png / webp)"),
    onBusy: () => toast.info("กำลังทำงานอยู่ รอสักครู่"),
  });

  // ── รูปซ้ำในชุดนี้ (ไฟล์เดียวกันอยู่หลายโฟลเดอร์) ──
  const dupOf = useMemo(() => {
    const first = new Map<string, string>();
    const out = new Map<string, string>();
    for (const g of groups) for (const id of g.order) {
      const it = itemById.get(id);
      if (!it?.sig) continue;
      const shown = `${g.label}/${it.path.split("/").pop()}`;
      const f = first.get(it.sig);
      if (f) out.set(id, f);
      else first.set(it.sig, shown);
    }
    return out;
  }, [groups, itemById]);

  // ── 🕘 เคยอัปให้รุ่นนี้แล้ว (ประวัติชุดอัป) → ข้ามให้ (เลือกช่องเองทีหลัง = อัปซ้ำจริง) ──
  const seenIds = useMemo(() => {
    const out = new Set<string>();
    for (const g of groups) {
      if (!g.target) continue;
      for (const id of g.order) {
        const sig = itemById.get(id)?.sig;
        if (sig && seen[sig]?.some((e) => e.parentId === g.target!.parentId)) out.add(id);
      }
    }
    return out;
  }, [groups, itemById, seen]);
  seenIdsRef.current = seenIds;
  useEffect(() => {
    setGroups((gs) => {
      let changed = false;
      const next = gs.map((g) => {
        let dests = g.dests;
        for (const id of g.order) {
          const d = g.dests[id];
          if (seenIds.has(id) && d && d.by !== "user" && d.by !== "seen" && d.dest !== "skip") {
            if (dests === g.dests) dests = { ...g.dests };
            dests[id] = { dest: "skip", by: "seen" };
            changed = true;
          }
        }
        return dests === g.dests ? g : { ...g, dests };
      });
      return changed ? next : gs;
    });
  }, [seenIds]);
  const seenText = (id: string) => {
    const g = groups.find((x) => x.order.includes(id));
    const sig = itemById.get(id)?.sig;
    const e = sig && g?.target ? seen[sig]?.find((x) => x.parentId === g.target!.parentId) : undefined;
    if (!e) return null;
    const at = new Date(e.at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
    return `เคยอัปแล้ว ${at}${e.by ? ` โดย ${e.by}` : ""} → ${DEST_LABEL[e.dest]}`;
  };

  // ── 👀 รูปหน้าตาซ้ำ (คนละไฟล์) — เทียบในชุดนี้ + รูปเดิมของรุ่นที่ลากมา ──
  // รูปเดิม: ใช้รูปย่อเล็กจากที่เก็บรูป (~2–3 KB/รูป) เฉพาะรุ่นที่มีโฟลเดอร์ชี้ถึง
  const existingOf = useMemo(() => {
    const by = new Map<string, { key: string; label: string }[]>();
    for (const p of parents) {
      const list: { key: string; label: string }[] = p.galleryItems.map((a, i) => ({ key: a.key, label: `รูปเดิม · แกลเลอรี ${p.code} (รูปที่ ${i + 1})` }));
      for (const sk of p.skus) sk.items.forEach((a, i) => list.push({ key: a.key, label: `รูปเดิม · ${sk.code} ${sk.label} (รูปที่ ${i + 1})` }));
      by.set(p.parentId, list);
    }
    return by;
  }, [parents]);
  useEffect(() => {
    const want = [...new Set(groups.map((g) => g.target?.parentId).filter((x): x is string => !!x))]
      .flatMap((pid) => existingOf.get(pid) ?? [])
      .map((e) => e.key)
      .filter((k) => !existingAsked.current.has(k))
      .slice(0, 400);
    if (!want.length) return;
    want.forEach((k) => existingAsked.current.add(k));
    let next = 0;
    const worker = async () => {
      while (next < want.length) {
        const key = want[next++];
        let vp: VisualPrint | null = null;
        try {
          const r = await fetch(thumbUrl(key, 96));
          if (r.ok) vp = await visualPrintOf(await r.blob());
        } catch {
          /* โหลดรูปเดิมไม่ได้ = ไม่เทียบรูปนั้น */
        }
        setExistingVp((m) => ({ ...m, [key]: vp }));
      }
    };
    void Promise.all(Array.from({ length: 6 }, worker));
  }, [groups, existingOf]);
  const similarOf = useMemo(() => {
    const out = new Map<string, Similar>();
    const earlier: { print: VisualPrint; label: string; url: string }[] = [];
    for (const g of groups) {
      for (const id of g.order) {
        const it = itemById.get(id);
        if (!it?.vp) continue;
        const shown = `${g.label}/${it.path.split("/").pop()}`;
        // ไฟล์เดียวกันเป๊ะ (เตือน "ซ้ำกับ" อยู่แล้ว) / กด "ไม่ซ้ำ" แล้ว / ข้ามอยู่ = ไม่ต้องเตือนซ้ำ
        if (!dupOf.has(id) && !notDup.has(id) && g.dests[id]?.dest !== "skip") {
          const mine = it.vp;
          let best: Similar | null = null;
          const consider = (print: VisualPrint, label: string, url: string) => {
            const lv = similarity(mine, print);
            if (lv && similarRank(lv) > similarRank(best ? best.level : null)) best = { level: lv, label, url };
          };
          for (const o of earlier) consider(o.print, o.label, o.url);
          if (g.target) {
            for (const e of existingOf.get(g.target.parentId) ?? []) {
              const p = existingVp[e.key];
              if (p) consider(p, e.label, thumbUrl(e.key, 800));
            }
          }
          if (best) out.set(id, best);
        }
        earlier.push({ print: it.vp, label: shown, url: it.url });
      }
    }
    return out;
  }, [groups, itemById, dupOf, notDup, existingOf, existingVp]);
  const similarText = (id: string) => {
    const sm = similarOf.get(id);
    return sm ? `👀 ${SIMILAR_LABEL[sm.level]}กับ ${sm.label}` : null;
  };
  const vpPending = items.filter((it) => it.vp === undefined).length;
  const existingPending = [...existingAsked.current].filter((k) => !(k in existingVp)).length;

  // ── ตรวจก่อนอัป ──
  const planIn = useMemo<PlanGroupIn[]>(
    () => groups.map((g) => ({ key: g.key, label: g.label, target: g.target, images: g.order.map((id) => ({ id, base: itemById.get(id)?.base ?? "", dest: g.dests[id]?.dest ?? "skip", by: g.dests[id]?.by ?? "user" })) })),
    [groups, itemById]
  );
  const plan = useMemo(() => planRoute(planIn, parents, { shopIds, mode }), [planIn, parents, shopIds, mode]);
  const groupOf = useMemo(() => { const m = new Map<string, GroupState>(); for (const g of groups) for (const id of g.order) m.set(id, g); return m; }, [groups]);
  const resizeOf = (id: string) => {
    const g = groupOf.get(id);
    const it = itemById.get(id);
    const d = g?.dests[id]?.dest ?? "skip";
    const m: ResizeMode = g?.resize || resizePref.mode;
    return resizeWidth(d, m, resizePref.px, it?.file.size ?? 0);
  };
  const warnOf = (id: string) => {
    const it = itemById.get(id);
    const d = groupOf.get(id)?.dests[id]?.dest ?? "skip";
    if (!it) return null;
    if (d !== "skip" && seenIds.has(id)) return `${seenText(id)} — จะซ้ำ`;
    if (!dupOf.has(id) && similarOf.has(id)) return `${similarText(id)} — ดูด้วยตาก่อน`;
    return imageWarning(d, { width: it.width, height: it.height, bytes: it.file.size, isPng: it.isPng, dupOf: dupOf.get(id) ?? null }, resizeOf(id));
  };
  const uploadIds = plan.slots.flatMap((s) => s.ids);
  const touchedParents = [...new Set(plan.slots.map((s) => s.parentId))];
  const counts = useMemo(() => {
    let upload = 0, skip = 0, bad = 0;
    for (const p of plan.images.values()) {
      if (p.state === "upload") upload++;
      else if (p.state === "skip") skip++;
      else bad++;
    }
    return { upload, skip, bad };
  }, [plan]);
  const sizeTotals = useMemo(() => {
    let o = 0, n = 0;
    for (const id of uploadIds) {
      const it = itemById.get(id);
      if (!it) continue;
      o += it.file.size;
      n += estimateBytes(it.file.size, it.width, resizeOf(id).width);
    }
    return { o, n };
  }, [uploadIds, itemById, groups, resizePref]); // eslint-disable-line react-hooks/exhaustive-deps
  const replacing = mode === "replace" && plan.slots.some((s) => s.replaces && (s.kind === "skuGallery" || s.kind === "parentGallery"));
  const needConfirm = mode === "replace" && touchedParents.length > CONFIRM_OVER;

  // ── แก้ค่าของกลุ่ม ──
  const patchGroup = (key: string, fn: (g: GroupState) => GroupState) => setGroups((gs) => gs.map((g) => (g.key === key ? fn(g) : g)));
  const setRow = (key: string, m: RowMode) => patchGroup(key, (g) => ({ ...g, mode: m, dests: destsFor(g, m, template, items, undefined, seenIds) }));
  const setDest = (key: string, id: string, dest: RouteDest) => patchGroup(key, (g) => ({ ...g, mode: "mixed", dests: { ...g.dests, [id]: { dest, by: "user" } } }));
  const setTarget = (key: string, v: string) =>
    patchGroup(key, (g) => {
      const [pid, sid] = v.split("|");
      const t: FolderTarget | null = pid ? { parentId: pid, skuId: sid && sid !== "P" ? sid : null } : null;
      const st = { ...g, target: t, picked: true };
      return g.mode === "mixed" ? st : { ...st, dests: destsFor(st, g.mode, template, items, undefined, seenIds) };
    });
  const reorder = (key: string, from: number, to: number) =>
    patchGroup(key, (g) => {
      const st = { ...g, order: moveItem(g.order, from, to) };
      return g.mode === "mixed" ? st : { ...st, dests: destsFor(st, g.mode, template, items, undefined, seenIds) };
    });
  const applyColumn = () =>
    setGroups((gs) => gs.map((g) => { const id = g.order[colPick.n - 1]; return id ? { ...g, mode: "mixed", dests: { ...g.dests, [id]: { dest: colPick.dest, by: "user" } } } : g; }));
  const reapplyTemplate = (tpl = template) => setGroups((gs) => gs.map((g) => ({ ...g, mode: "tpl", dests: destsFor(g, "tpl", tpl, items, undefined, seenIds) })));
  const saveTemplate = () => {
    const colorGroups = groups.filter((g) => g.target?.skuId).sort((a, b) => b.order.length - a.order.length);
    const parentGroups = groups.filter((g) => g.target && !g.target.skuId);
    const tpl = templateFrom(colorGroups[0] ? colorGroups[0].order.map((id) => colorGroups[0].dests[id]?.dest ?? "sku") : null, parentGroups.length ? parentGroups.flatMap((g) => g.order.map((id) => g.dests[id]?.dest ?? "parent")) : null, template);
    setTemplate(tpl);
    toast.success("จำแม่แบบแล้ว — ครั้งหน้าลากโฟลเดอร์มา ระบบตั้งช่องแบบนี้ให้เอง");
  };

  // ── อัปโหลด ──
  type Done = { attachmentId?: string | null; assetId?: string | null; key?: string | null; webKey?: string };
  const uploadOne = async (id: string, slot: PlanSlot, undo: UndoInfo): Promise<Done> => {
    const it = itemById.get(id)!;
    const width = resizeOf(id).width;
    const p = byParent.get(slot.parentId)!;
    if (slot.kind === "skuGallery" || slot.kind === "parentGallery") {
      const entityType = slot.kind === "parentGallery" ? "parent_skus_v2" : "skus_v2";
      const entityId = slot.kind === "parentGallery" ? slot.parentId : (slot.skuId as string);
      const file = width ? await downscaleImageWidth(it.file, width) : it.file;
      let attId: string | null = null;
      let key: string | null = null;
      if (file.size <= SMALL_GALLERY_BYTES) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", entityType);
        fd.append("entity_id", entityId);
        fd.append("attachment_kind", "image_gallery");
        fd.append("image_only", "1");
        fd.append("max_items", String(GALLERY_MAX));
        if (actor) fd.append("actor", actor);
        const j = await jsonOf(await apiFetch("/api/attachments", { method: "POST", body: fd }));
        attId = (j.data as { id?: string } | null)?.id ?? null;
        key = (j.data as { file_path?: string } | null)?.file_path ?? null;
      } else {
        // ตัวเต็ม/ไฟล์ใหญ่: ส่งตรงเข้า R2 แล้วผูกเข้าแกลเลอรี
        key = await uploadMediaFile(file, { folder: "product-originals", keepOriginal: true });
        const j = await jsonOf(await apiFetch("/api/product-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_type: entityType === "parent_skus_v2" ? "parent_sku" : "product_sku", owner_id: entityId, r2_key: key }) }));
        attId = (j.id as string | null) ?? null;
      }
      if (attId && slot.coverId === id) {
        const prev = p.skus.find((x) => x.id === slot.skuId)?.items.find((x) => x.primary)?.id;
        if (prev && mode === "append") undo.prevPrimary[entityId] = prev;
        await jsonOf(await apiFetch(`/api/attachments/${attId}`, { method: "PATCH" }));
      }
      return { attachmentId: attId, key };
    }
    if (slot.kind === "desc") {
      const file = width ? await downscaleImageWidth(it.file, width) : it.file;
      let assetId: string | null = null;
      if (file.size <= SMALL_PROXY_BYTES) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("source", "upload");
        if (actor) fd.append("actor", actor);
        if (it.width && it.height && !width) { fd.append("width", String(it.width)); fd.append("height", String(it.height)); }
        const j = await jsonOf(await apiFetch("/api/assets", { method: "POST", body: fd }));
        assetId = (j.data as { id?: string } | null)?.id ?? null;
      } else {
        assetId = (await uploadMediaAsset(file, { folder: "product-originals", keepOriginal: true })).asset?.id ?? null;
      }
      if (!assetId) throw new Error("ลงคลังรูปไม่สำเร็จ");
      await jsonOf(await apiFetch("/api/assets/description", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_id: slot.parentId, asset_id: assetId }) }));
      return { assetId };
    }
    if (slot.kind === "png") {
      const file = width ? await downscaleImageWidth(it.file, width) : it.file;
      const key = await uploadMediaFile(file, { folder: "parent-skus/png", keepOriginal: true });
      await jsonOf(await apiFetch("/api/website/product-png", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: slot.parentId, key }) }));
      undo.png.push({ parentId: slot.parentId, before: p.pngKey, after: key });
      return { key };
    }
    // ช่องหน้าเว็บ: อัปรูปก่อน แล้วรวมบันทึกทีเดียวตอนท้าย
    const key = width ? (await uploadResizedImage(it.file, { folder: "storefront-products", max: width })).r2_key : await uploadMediaFile(it.file, { folder: "storefront-images", keepOriginal: true });
    return { webKey: key };
  };

  const batchApi = (body: Record<string, unknown>) =>
    apiFetch("/api/product-images/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOf);

  const runUpload = async (onlyIds?: string[]) => {
    setErr(null);
    const slots = plan.slots
      .map((s) => ({ ...s, ids: onlyIds ? s.ids.filter((id) => onlyIds.includes(id)) : s.ids }))
      .filter((s) => s.ids.length);
    const total = slots.reduce((n, s) => n + s.ids.length, 0);
    if (!total) return setErr("ยังไม่มีรูปที่จะอัป");
    if (!onlyIds && needConfirm && typed !== "CONFIRM") return setErr(`แทนที่รูป ${touchedParents.length} รุ่นพร้อมกัน — พิมพ์ CONFIRM ก่อน`);
    const prevRun = onlyIds ? run : null;
    // 🕘 เปิดประวัติชุดอัป (อัปซ้ำเฉพาะที่พลาด = ชุดเดิม) — เปิดไม่ได้ = ยังไม่อัป (ไม่งั้นย้อนทีหลังไม่ได้)
    let batchId = prevRun?.batchId ?? null;
    if (!batchId) {
      try {
        batchId = String((await batchApi({ action: "create", mode, resize: resizePref, shopIds, parentIds: touchedParents, actorName: actor })).id);
      } catch (e) {
        return setErr(`${(e as Error).message} — ลองกดยืนยันอีกครั้ง`);
      }
    }
    const undo: UndoInfo = { prevPrimary: {}, png: [], web: [], replaced: [] };
    const batch = prevRun?.batch ?? new Date().toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const state: RunState = { done: 0, total, ok: prevRun?.ok ?? 0, failed: [], batch, batchId };
    setRun({ ...state });
    setPhase("run");
    const webDone: { id: string; parentId: string; skuId: string | null; dest: RouteDest; key: string }[] = [];
    const destOf = (id: string) => groupOf.get(id)?.dests[id]?.dest ?? "skip";
    const nameOf = (id: string) => { const g = groupOf.get(id); return `${g?.label ?? ""}/${itemById.get(id)?.path.split("/").pop() ?? id}`; };
    // รูปที่อัปสำเร็จ → ประวัติชุดอัป (ทยอยส่งทีละ 10 · ส่งไม่ได้ = ประวัติไม่ครบ แต่การอัปไม่พัง)
    const buf: BatchItem[] = [];
    const record = (id: string, s: PlanSlot, d: Done) => {
      const it = itemById.get(id);
      if (!it) return;
      buf.push({ source_sig: it.sig ?? "", source_name: nameOf(id), source_bytes: it.file.size, parent_id: s.parentId, sku_id: s.skuId, dest: destOf(id), attachment_id: d.attachmentId ?? null, asset_id: d.assetId ?? null, r2_key: d.key ?? d.webKey ?? null });
    };
    const flush = async () => {
      if (!buf.length) return;
      const part = buf.splice(0).filter((x) => x.source_sig);
      if (part.length) await batchApi({ action: "items", batchId, items: part }).catch(() => null);
    };
    const label = `📂 อัปรูป ${total} รูป · ${touchedParents.map((pid) => byParent.get(pid)?.code).filter(Boolean).slice(0, 3).join(", ")}${touchedParents.length > 3 ? " …" : ""}`;
    runBackgroundTask({
      label,
      total,
      run: async (report) => {
        let next = 0;
        const worker = async () => {
          while (next < slots.length) {
            const s = slots[next++];
            // โหมดแทนที่: เอารูปเดิมของแกลเลอรีนี้ออกก่อน (เก็บเป็นเวอร์ชัน · ย้อนทั้งชุดแล้วคืนให้)
            if (!onlyIds && mode === "replace" && s.replaces && (s.kind === "skuGallery" || s.kind === "parentGallery")) {
              const p = byParent.get(s.parentId);
              const olds = s.kind === "parentGallery" ? (p?.galleryItems ?? []) : (p?.skus.find((x) => x.id === s.skuId)?.items ?? []);
              const table = s.kind === "parentGallery" ? "parent_skus_v2" : "skus_v2";
              const entityId = s.kind === "parentGallery" ? s.parentId : (s.skuId as string);
              for (const o of olds) {
                const r = await apiFetch(`/api/attachments/${o.id}`, { method: "DELETE" }).catch(() => null);
                if (r?.ok) undo.replaced.push({ table, entityId, key: o.key });
              }
            }
            for (const id of s.ids) {
              try {
                const r = await uploadOne(id, s, undo);
                if (r.webKey) webDone.push({ id, parentId: s.parentId, skuId: s.skuId, dest: destOf(id), key: r.webKey });
                else {
                  record(id, s, r);
                  if (buf.length >= 10) await flush();
                }
                state.ok++;
              } catch (e) {
                state.failed.push({ id, why: e instanceof Error ? e.message : "อัปไม่สำเร็จ" });
              }
              state.done++;
              report(state.done, total);
              setRun({ ...state });
            }
          }
        };
        await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
        // ช่องหน้าเว็บ: บันทึกทีเดียว (รวมกับรูปล่าสุดใน DB · audit · ล้างแคชเว็บ)
        const webItems = buildWebItems(webDone);
        if (webItems.length) {
          try {
            const j = await jsonOf(await apiFetch("/api/website/listings/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopIds, mode: onlyIds ? "append" : mode, items: webItems }) }));
            if (Array.isArray(j.changes)) undo.web.push(...j.changes);
            for (const w of webDone) {
              const s = slots.find((x) => x.ids.includes(w.id));
              if (s) record(w.id, s, { webKey: w.key });
            }
          } catch (e) {
            // รูปอัปขึ้นคลังแล้ว แต่ผูกเข้าเว็บไม่ได้ → นับเป็นพลาด (อัปซ้ำได้)
            for (const w of webDone) state.failed.push({ id: w.id, why: `บันทึกลงเว็บไม่สำเร็จ: ${(e as Error).message}` });
            state.ok -= webDone.length;
          }
        }
        await flush();
        // 🕘 ปิดรอบ: ยอดรวม + ข้อมูลไว้ย้อน (รวมกับรอบก่อนของชุดเดียวกัน) + audit
        await batchApi({ action: "finish", batchId, ok: state.ok, failed: state.failed.length, undoInfo: undo, kind: onlyIds ? "retry" : "upload" }).catch(() => toast.warning("อัปรูปแล้ว แต่บันทึกประวัติชุดนี้ไม่ครบ — ย้อนทั้งชุดอาจคืนได้ไม่ครบ"));
        setRun({ ...state });
        setPhase("done");
        onDone?.();
        const failNames = state.failed.map((f) => nameOf(f.id));
        if (failNames.length) toast.warning(`อัปไม่สำเร็จ ${failNames.length} รูป — เปิดหน้าต่าง 📂 แล้วกด "อัปซ้ำเฉพาะรูปที่พลาด"`);
        else toast.success(`อัปรูปครบ ${state.ok} รูปแล้ว`);
        return { ok: state.ok, fail: state.failed.length, message: failNames.length ? `สำเร็จ ${state.ok} · พลาด ${failNames.length}` : `อัปครบ ${state.ok} รูป` };
      },
    });
  };

  // ── ↩ ย้อนทั้งชุด (ฝั่งเซิร์ฟเวอร์ · ทางเดียวกับหน้า 🕘 ประวัติการอัปรูป) ──
  const undoAll = async () => {
    if (!run?.batchId) return;
    setUndoBusy(true);
    try {
      const j = await batchApi({ action: "undo", batchId: run.batchId });
      setRun({ ...run, undone: true });
      onDone?.();
      const msg = undoMessage(j.result as UndoResultView);
      if (msg.warn) toast.warning(msg.text);
      else toast.success(msg.text);
    } catch (e) {
      toast.error((e as Error).message || "ย้อนไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUndoBusy(false);
      setUndoAsk(false);
    }
  };

  const busy = phase === "run" || phase === "loading";
  const close = () => {
    if (phase === "run") toast.info("อัปต่อเบื้องหลัง — ดูความคืบหน้าที่มุมขวาล่าง");
    onClose();
  };

  // ───────────── หน้าจอ ─────────────
  const groupsByParent = useMemo(() => {
    const order: (string | null)[] = [];
    const by = new Map<string | null, GroupState[]>();
    for (const g of groups) {
      const pid = g.target?.parentId ?? g.match.guessParentId ?? null;
      if (!by.has(pid)) { by.set(pid, []); order.push(pid); }
      by.get(pid)!.push(g);
    }
    return order
      .sort((a, b) => (a === null ? 1 : b === null ? -1 : (byParent.get(a)?.code ?? "").localeCompare(byParent.get(b)?.code ?? "", "en", { numeric: true })))
      .map((pid) => ({ pid, groups: by.get(pid)! }));
  }, [groups, byParent]);

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="min-w-[12rem] flex-1 text-xs">
        {err ? (
          <span className="text-rose-600">{err}</span>
        ) : phase === "run" && run ? (
          <span className="text-slate-600">กำลังอัปเบื้องหลัง {run.done}/{run.total} — ปิดหน้าต่างนี้ได้</span>
        ) : phase === "done" && run ? (
          <span className={run.failed.length ? "text-amber-700" : "text-emerald-700"}>อัปแล้ว {run.ok} รูป{run.failed.length ? ` · พลาด ${run.failed.length}` : ""}</span>
        ) : phase === "sort" || phase === "review" ? (
          <span className="text-slate-500">{counts.upload ? `จะอัป ${counts.upload} รูป → ${touchedParents.length} รุ่น · ~${size(sizeTotals.n)}` : "ยังไม่มีรูปที่จะอัป"}</span>
        ) : null}
      </div>
      {phase === "sort" && (
        <>
          <button type="button" onClick={reset} className={btn}>ล้างทั้งหมด</button>
          <button type="button" onClick={() => setPhase("review")} disabled={!counts.upload} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">ตรวจสรุป →</button>
        </>
      )}
      {phase === "review" && (
        <>
          {needConfirm && <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" className="h-9 w-36 rounded-lg border border-rose-300 px-2 font-mono text-sm" />}
          <button type="button" onClick={() => setPhase("sort")} className={btn}>← กลับไปแก้</button>
          <button type="button" onClick={() => void runUpload()} disabled={!uploadIds.length || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">ยืนยัน อัป {uploadIds.length} รูป</button>
        </>
      )}
      {phase === "done" && (
        <>
          <button type="button" onClick={reset} className={btn}>ลากชุดต่อไป</button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">ปิด</button>
        </>
      )}
      {phase === "run" && <button type="button" onClick={close} className={btn}>ปิดหน้าต่าง (อัปต่อเบื้องหลัง)</button>}
    </div>
  );

  return (
    <>
      <ERPModal
        open={open}
        onClose={close}
        title="📂 จัดรูปหลายโฟลเดอร์"
        description="ลากหลายโฟลเดอร์ (ชื่อโฟลเดอร์ = รหัส SKU ลูก / รหัสรุ่น) แล้วเลือกว่ารูปไหนลงช่องไหน · ตรวจก่อนอัปทุกครั้ง"
        size="xl"
        hasUnsavedChanges={items.length > 0 && (phase === "sort" || phase === "review")}
        closeOnBackdrop={false}
        footer={footer}
        storageKey="product-image-router"
      >
        <div {...drop.guard} className="space-y-3">
          {/* ขั้นตอน + 🕘 ประวัติ */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {["1 ลากโฟลเดอร์", "2 จัดรูปลงช่อง", "3 ตรวจแล้วยืนยัน", "4 อัปเบื้องหลัง"].map((t, i) => {
              const cur = phase === "pick" || phase === "loading" ? 0 : phase === "sort" ? 1 : phase === "review" ? 2 : 3;
              return <span key={t} className={`rounded-md border px-2.5 py-1 ${!historyOpen && i === cur ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>{t}</span>;
            })}
            <button type="button" onClick={() => setHistoryOpen((v) => !v)} className={`ml-auto h-7 rounded-md border px-2.5 text-[11px] ${historyOpen ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {historyOpen ? "← กลับไปจัดรูป" : "🕘 ประวัติการอัปรูป"}
            </button>
          </div>
          {historyOpen && <BatchHistory onUndone={() => onDone?.()} />}
          <div className={historyOpen ? "hidden" : "space-y-3"}>

          {/* ① ที่วางไฟล์ */}
          {(phase === "pick" || phase === "loading" || phase === "sort") && (
            <div {...drop.zone("router")} className={`relative rounded-xl border-2 border-dashed px-4 text-center transition ${items.length ? "py-2.5" : "py-6"} ${drop.over === "router" ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-slate-50/50"}`}>
              <FileDropHint show={drop.over === "router"} label="วางเพื่อจัดรูป" />
              <p className="text-sm text-slate-700">
                {items.length ? "ลากโฟลเดอร์/รูปเพิ่มได้อีก · " : "ลากหลายโฟลเดอร์ หรือหลายรูปมาวางที่นี่ · "}
                <button type="button" onClick={() => dirRef.current?.click()} className="text-blue-600 underline">เลือกโฟลเดอร์</button>
                {" · "}
                <button type="button" onClick={() => fileRef.current?.click()} className="text-blue-600 underline">เลือกไฟล์</button>
              </p>
              {!items.length && (
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  ชื่อโฟลเดอร์ = รหัสสี <code className="rounded bg-white px-1">BCG11-01/</code> · รหัสไซส์ <code className="rounded bg-white px-1">BCG12-01-L/</code> (เข้าสีหลัก) · รหัสรุ่น <code className="rounded bg-white px-1">BCG11/</code> (ทั้งรุ่น)
                  <br />
                  ชื่อไฟล์บอกช่องเองได้: <code className="rounded bg-white px-1">1_ปก</code> · <code className="rounded bg-white px-1">hero</code> · <code className="rounded bg-white px-1">hero_m</code> · <code className="rounded bg-white px-1">desc</code> · <code className="rounded bg-white px-1">png</code> · ที่เหลือเรียงตามเลข 1, 2, 3 … · ครั้งละ ≤ {MAX_MASS_FILES} รูป
                </p>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              <input ref={dirRef} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </div>
          )}
          {phase === "loading" && (
            <div className="space-y-2">
              {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
              <p className="text-center text-xs text-slate-500">กำลังหาสินค้าตามชื่อโฟลเดอร์…</p>
            </div>
          )}

          {/* ② จัดรูปลงช่อง */}
          {phase === "sort" && catalog && (
            <>
              {catalog.truncated && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">เจอสินค้าเกิน 60 รุ่น — ลากทีละน้อยลง (บางรุ่นอาจไม่ขึ้น)</p>}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    🧩 แม่แบบ: {Object.entries(template.pos).map(([n, d]) => `รูป ${n} = ${DEST_LABEL[d]}`).join(" · ") || "—"} · ที่เหลือ = {DEST_LABEL[template.rest]} · โฟลเดอร์ทั้งรุ่น = {DEST_LABEL[template.parentFolder]}
                  </span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => reapplyTemplate()} className={btn}>ใช้แม่แบบอีกครั้ง</button>
                    <button type="button" onClick={saveTemplate} className={btn} title="จำการตั้งช่องตอนนี้เป็นแม่แบบของคุณ (ใช้ครั้งหน้า)">จำเป็นแม่แบบ</button>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <span>รูปที่</span>
                  <select value={colPick.n} onChange={(e) => setColPick((c) => ({ ...c, n: Number(e.target.value) }))} className="h-8 rounded-lg border border-slate-300 bg-white px-1.5 text-xs" aria-label="รูปลำดับที่">
                    {Array.from({ length: Math.max(1, ...groups.map((g) => g.order.length)) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <span>ของทุกโฟลเดอร์ →</span>
                  <DestSelect value={colPick.dest} onChange={(d) => setColPick((c) => ({ ...c, dest: d }))} />
                  <button type="button" onClick={applyColumn} className={btn}>ใช้</button>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <span>ขนาดรูป:</span>
                    <button type="button" onClick={() => setResizePref({ ...resizePref, mode: "auto" })} className={seg(resizePref.mode === "auto")}>ลดอัตโนมัติตามช่อง (แนะนำ)</button>
                    <button type="button" onClick={() => setResizePref({ ...resizePref, mode: "fixed" })} className={seg(resizePref.mode === "fixed")}>ลดเท่ากันทุกช่อง</button>
                    <button type="button" onClick={() => setResizePref({ ...resizePref, mode: "none" })} className={seg(resizePref.mode === "none", true)}>ไม่ลดขนาด</button>
                    {resizePref.mode === "fixed" && (
                      <select value={resizePref.px} onChange={(e) => setResizePref({ ...resizePref, px: Number(e.target.value) })} className="h-8 rounded-lg border border-slate-300 bg-white px-1.5 text-xs" aria-label="กว้างสูงสุด">
                        {RESIZE_FIXED_OPTIONS.map((p) => <option key={p} value={p}>กว้าง {p.toLocaleString()} px</option>)}
                      </select>
                    )}
                  </div>
                  <p className={`mt-1 text-[11px] ${resizePref.mode === "none" ? "text-amber-700" : "text-slate-500"}`}>{RESIZE_HINT[resizePref.mode]}</p>
                </div>
                <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  👀 ตรวจรูปหน้าตาซ้ำ (คนละไฟล์ก็จับได้):{" "}
                  {vpPending || existingPending ? (
                    <span className="text-blue-600">กำลังตรวจ… เหลือ {vpPending} รูปใหม่{existingPending ? ` · ${existingPending} รูปเดิม` : ""} (จัดรูปต่อได้เลย)</span>
                  ) : similarOf.size ? (
                    <b className="font-medium text-amber-700">เจอรูปคล้าย {similarOf.size} รูป — กดข้อความใต้รูปเพื่อดูเทียบ</b>
                  ) : (
                    <span>ไม่เจอรูปคล้ายกัน</span>
                  )}
                </p>
                {shopsShown.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    <span>ลงหน้าเว็บร้าน (เฉพาะช่องรูปบนเว็บ/Hero):</span>
                    {shopsShown.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={shopIds.includes(s.id)} onChange={() => setShopPref(shopIds.includes(s.id) ? shopIds.filter((x) => x !== s.id) : [...shopIds, s.id])} />
                        {s.name} <span className="text-slate-400">(มี {parents.filter((p) => p.shopIds.includes(s.id)).length}/{parents.length} รุ่น)</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {groupsByParent.map(({ pid, groups: gs }) => {
                const p = pid ? byParent.get(pid) : undefined;
                return (
                  <div key={pid ?? "none"} className="space-y-2">
                    <p className="pt-1 text-sm font-semibold text-slate-800">
                      {p ? <>{p.code} <span className="font-normal text-slate-500">· {p.name}{p.shopIds.length ? ` · ขายที่ ${(catalog.shops ?? []).filter((s) => p.shopIds.includes(s.id)).map((s) => s.name).join(", ")}` : " · ยังไม่ขายบนเว็บ"}</span></> : "ยังไม่รู้ว่าเป็นของรุ่นไหน"}
                    </p>
                    {gs.map((g) => (
                      <GroupCard
                        key={g.key}
                        g={g}
                        parents={parents}
                        itemById={itemById}
                        plan={plan.images}
                        warnOf={warnOf}
                        seenOf={seenText}
                        similarOf={similarText}
                        onCompare={(id) => setCompareId(id)}
                        sizeOf={(id) => { const it = itemById.get(id); const r = resizeOf(id); if (!it) return ""; const o = estimateBytes(it.file.size, it.width, r.width); return !r.width ? `ตัวเต็ม ${size(it.file.size)}` : o >= it.file.size ? `${size(it.file.size)} · เล็กอยู่แล้ว` : `${size(it.file.size)} → ${size(o)}`; }}
                        onTarget={(v) => setTarget(g.key, v)}
                        onRow={(m) => setRow(g.key, m)}
                        onDest={(id, d) => setDest(g.key, id, d)}
                        onResize={(v) => patchGroup(g.key, (x) => ({ ...x, resize: v }))}
                        onReorder={(from, to) => reorder(g.key, from, to)}
                      />
                    ))}
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-400">ลากรูปสลับตำแหน่งได้ (หรือกด ‹ ›) · โฟลเดอร์ที่ใช้แม่แบบ/ตั้งทั้งโฟลเดอร์อยู่ ย้ายลำดับแล้วช่องจะตั้งใหม่ตามตำแหน่ง · ปรับเองทีละรูปแล้ว ช่องจะติดไปกับรูป</p>
            </>
          )}

          {/* ③ ตรวจแล้วยืนยัน */}
          {phase === "review" && (
            <ReviewPanel
              counts={counts}
              plan={plan}
              parents={parents}
              shops={catalog?.shops ?? []}
              nameOf={(id) => { const g = groupOf.get(id); return `${g?.label ?? ""}/${itemById.get(id)?.path.split("/").pop() ?? ""}`; }}
              warnOf={warnOf}
              sizeTotals={sizeTotals}
              resizePref={resizePref}
              groups={groups}
              mode={mode}
              setMode={setMode}
              canReplace={canDelete}
              replacing={replacing}
              needConfirm={needConfirm}
              touched={touchedParents.length}
              seenSkipped={groups.reduce((n, g) => n + g.order.filter((id) => g.dests[id]?.by === "seen" && g.dests[id]?.dest === "skip").length, 0)}
            />
          )}

          {/* ④ อัปเบื้องหลัง + ผลลัพธ์ */}
          {(phase === "run" || phase === "done") && run && (
            <div className="space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <div className="flex justify-between text-sm">
                  <span>{phase === "run" ? "⏳ กำลังอัปเบื้องหลัง" : run.failed.length ? `อัปแล้ว ${run.ok} รูป · พลาด ${run.failed.length} รูป` : `✓ อัปครบ ${run.ok} รูป`}</span>
                  <span className="text-slate-500">{run.done}/{run.total}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }} /></div>
                {phase === "run" && <p className="mt-2 text-[11px] text-slate-500">ปิดหน้าต่างนี้ได้ ไปทำงานอื่นต่อได้ · ความคืบหน้าอยู่มุมขวาล่าง</p>}
              </div>
              {phase === "done" && run.failed.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-3 text-sm">
                  <p className="font-medium text-slate-800">รูปที่พลาด ({run.failed.length})</p>
                  {run.failed.slice(0, 20).map((f) => (
                    <p key={f.id} className="text-xs text-slate-600">• {groupOf.get(f.id)?.label}/{itemById.get(f.id)?.path.split("/").pop()} — {f.why}</p>
                  ))}
                  <button type="button" onClick={() => void runUpload(run.failed.map((f) => f.id))} className="mt-2 h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">อัปซ้ำเฉพาะ {run.failed.length} รูปที่พลาด</button>
                  <p className="mt-1 text-[11px] text-slate-500">รูปที่สำเร็จแล้วไม่ต้องอัปใหม่</p>
                </div>
              )}
              {phase === "done" && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">🕘 ชุดอัป {run.batch}</p>
                    <p className="text-xs text-slate-500">{run.ok} รูป · {touchedParents.length} รุ่น · โดย {actor ?? "คุณ"}</p>
                    {run.undone && <p className="mt-1 text-xs text-emerald-700">↩ ย้อนแล้ว — กลับเป็นเหมือนก่อนอัป</p>}
                    {!run.undone && <p className="mt-1 text-[11px] text-slate-500">ย้อนทีหลังได้ที่ 🕘 ประวัติการอัปรูป (มุมบนของหน้าต่างนี้){mode === "replace" ? " · ย้อนแล้วคืนรูปเดิมที่ถูกแทนให้ด้วย" : ""}</p>}
                  </div>
                  {!!run.batchId && !run.undone && run.ok > 0 && <button type="button" onClick={() => setUndoAsk(true)} className="h-9 rounded-lg border border-rose-200 bg-white px-4 text-sm text-rose-600 hover:bg-rose-50">↩ ย้อนทั้งชุด</button>}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </ERPModal>
      {/* 👀 ดูเทียบรูปที่หน้าตาคล้ายกัน — คนตัดสินเอง (ระบบไม่ข้ามเอง) */}
      {compareId && (() => {
        const it = itemById.get(compareId);
        const sm = similarOf.get(compareId);
        const g = groupOf.get(compareId);
        if (!it || !sm || !g) return null;
        return (
          <ERPModal
            open
            onClose={() => setCompareId(null)}
            title={`👀 ${SIMILAR_LABEL[sm.level]} — ดูเทียบก่อน`}
            description="ระบบดูจากหน้าตารูป (คนละไฟล์ก็จับได้) · รูปถ่ายต่อกันหรือสีใกล้กันมากอาจถูกนับว่าคล้าย — ตัดสินด้วยตา"
            size="lg"
            footer={
              <div className="flex w-full flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setCompareId(null)} className={btn}>ปิด</button>
                <button type="button" onClick={() => { setNotDup((x) => new Set(x).add(compareId)); setCompareId(null); }} className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">ไม่ซ้ำ — ใช้รูปนี้ต่อ</button>
                <button type="button" onClick={() => { setDest(g.key, compareId, "skip"); setCompareId(null); }} className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700">ซ้ำ — ข้ามรูปใหม่นี้</button>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {[{ t: `รูปใหม่ · ${g.label}/${it.path.split("/").pop()}`, u: it.url }, { t: sm.label, u: sm.url }].map((x) => (
                <figure key={x.t} className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.u} alt="" className="aspect-square w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" />
                  <figcaption className="mt-1 truncate text-xs text-slate-600" title={x.t}>{x.t}</figcaption>
                </figure>
              ))}
            </div>
          </ERPModal>
        );
      })()}
      <ConfirmDialog
        open={undoAsk}
        onClose={() => !undoBusy && setUndoAsk(false)}
        onConfirm={() => void undoAll()}
        title="ย้อนทั้งชุด?"
        message={`เอารูป ${run?.ok ?? 0} รูปของชุดนี้ออกทั้งหมด · รูปที่มีอยู่ก่อนไม่กระทบ · ปกกลับเป็นรูปเดิม · Hero/รูปบนเว็บ/PNG กลับเป็นค่าเดิม (ส่วนที่มีคนแก้ต่อแล้วจะข้าม ไม่ทับ)${mode === "replace" ? " · คืนรูปเดิมที่ถูกแทน" : ""}`}
        confirmText="ย้อนทั้งชุด"
        variant="danger"
        loading={undoBusy}
      />
    </>
  );
}

/** ตั้งช่องของทั้งกลุ่มตามโหมด (ids = เฉพาะรูปเหล่านี้) */
function destsFor(g: GroupState, m: RowMode | "mixed", tpl: RouteTemplate, all: Item[], ids?: string[], seen?: Set<string>): GroupState["dests"] {
  const mode: RowMode = m === "mixed" ? "tpl" : m;
  const base = new Map(all.map((it) => [it.id, it.base]));
  const imgs = g.order.map((id) => ({ id, base: base.get(id) ?? "" }));
  const out: GroupState["dests"] = {};
  // ไฟล์เดี่ยว (กลุ่ม f:…) ไม่ตั้งปกตามตำแหน่ง — กันเพิ่มรูปเดียวแล้วปกเปลี่ยน
  for (const r of applyRowMode(imgs, mode, { parentLevel: !!g.target && !g.target.skuId, template: tpl, loose: g.key.startsWith("f:"), seen })) if (!ids || ids.includes(r.id)) out[r.id] = { dest: r.dest, by: r.by };
  return out;
}

function DestSelect({ value, onChange, label }: { value: RouteDest; onChange: (d: RouteDest) => void; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RouteDest)} aria-label={label ?? "เลือกช่องรูป"} className="h-8 w-full min-w-0 max-w-[13rem] rounded-lg border border-slate-300 bg-white px-1.5 text-[11px]">
      <optgroup label="รูปสินค้า (ERP)">
        {(["skuMain", "sku", "parent", "desc", "png"] as const).map((d) => <option key={d} value={d}>{DEST_LABEL[d]}</option>)}
      </optgroup>
      <optgroup label="หน้าเว็บร้าน">
        {(["webColor", "heroD", "heroM"] as const).map((d) => <option key={d} value={d}>{DEST_LABEL[d]}</option>)}
      </optgroup>
      <option value="skip">{DEST_LABEL.skip}</option>
    </select>
  );
}

function GroupCard({ g, parents, itemById, plan, warnOf, seenOf, similarOf, onCompare, sizeOf, onTarget, onRow, onDest, onResize, onReorder }: {
  g: GroupState;
  parents: CatalogParent[];
  itemById: Map<string, Item>;
  plan: Map<string, { state: string; note?: string }>;
  warnOf: (id: string) => string | null;
  /** 🕘 เคยอัปให้รุ่นนี้แล้ว (ข้อความ) */
  seenOf: (id: string) => string | null;
  /** 👀 รูปหน้าตาเหมือน/คล้าย (ข้อความ) · กดแล้วเปิดดูเทียบ */
  similarOf: (id: string) => string | null;
  onCompare: (id: string) => void;
  sizeOf: (id: string) => string;
  onTarget: (v: string) => void;
  onRow: (m: RowMode) => void;
  onDest: (id: string, d: RouteDest) => void;
  onResize: (v: GroupState["resize"]) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder, { group: `router:${g.key}` });
  const p = g.target ? parents.find((x) => x.parentId === g.target!.parentId) : undefined;
  const sku = p && g.target?.skuId ? p.skus.find((s) => s.id === g.target!.skuId) : undefined;
  const badge = !g.target
    ? <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">{g.match.note ?? "ยังไม่ได้เลือกรุ่น/สี"}</span>
    : g.picked
      ? <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">เลือกเอง</span>
      : <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{g.match.how === "size" ? g.match.note : g.match.how === "parent" ? "รหัสรุ่น · ทั้งรุ่น" : g.match.how === "file" ? "จับคู่จากชื่อไฟล์" : "จับคู่เอง"}</span>;
  const existing = sku ? sku.items : p && !g.target?.skuId ? p.galleryItems : [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium text-slate-800">📁 {g.label}</span>
          {badge}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <select value={g.target ? `${g.target.parentId}|${g.target.skuId ?? "P"}` : ""} onChange={(e) => onTarget(e.target.value)} aria-label="โฟลเดอร์นี้เป็นของ" className="h-8 max-w-[12rem] rounded-lg border border-slate-300 bg-white px-1.5 text-[11px]">
            <option value="">— เลือกรุ่น/สี —</option>
            {parents.map((x) => (
              <optgroup key={x.parentId} label={`${x.code} ${x.name}`}>
                <option value={`${x.parentId}|P`}>{x.code} ทั้งรุ่น (ไม่ผูกสี)</option>
                {x.skus.map((s) => <option key={s.id} value={`${x.parentId}|${s.id}`}>{s.code} {s.label}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={g.mode === "mixed" ? "" : g.mode} onChange={(e) => e.target.value && onRow(e.target.value as RowMode)} aria-label="ตั้งทั้งโฟลเดอร์" className="h-8 max-w-[13rem] rounded-lg border border-slate-300 bg-white px-1.5 text-[11px]">
            {g.mode === "mixed" && <option value="">ปรับเองทีละรูป</option>}
            {(Object.keys(ROW_MODE_LABEL) as RowMode[]).map((m) => <option key={m} value={m}>{ROW_MODE_LABEL[m]}</option>)}
          </select>
          <select value={g.resize} onChange={(e) => onResize(e.target.value as GroupState["resize"])} aria-label="ขนาดรูปของโฟลเดอร์นี้" className="h-8 rounded-lg border border-slate-300 bg-white px-1.5 text-[11px]">
            <option value="">ขนาด: ตามค่ารวม</option>
            <option value="auto">ขนาด: ลดตามช่อง</option>
            <option value="none">ขนาด: ไม่ลด (ตัวเต็ม)</option>
          </select>
        </div>
      </div>
      {g.target && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          <span className="mr-1">มีอยู่แล้ว:</span>
          {existing.slice(0, 9).map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={thumbUrl(a.key, 56)} alt="" loading="lazy" className={`h-7 w-7 rounded object-cover border ${a.primary ? "border-amber-400" : "border-slate-200"}`} title={a.primary ? "ปกตอนนี้" : undefined} />
          ))}
          <span className="ml-1">
            {sku ? `${sku.gallery}/${GALLERY_MAX} รูป · ขอบเหลือง = ปกตอนนี้` : p ? `แกลเลอรี Parent ${p.gallery}/${GALLERY_MAX} · Description ${p.desc} · PNG ${p.png ? "มีแล้ว" : "ยังไม่มี"}` : ""}
          </span>
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {g.order.map((id, i) => {
          const it = itemById.get(id);
          if (!it) return null;
          const st = plan.get(id);
          const d = g.dests[id]?.dest ?? "skip";
          const warn = warnOf(id);
          const sim = st?.state === "error" || st?.state === "over" ? null : similarOf(id);
          const note = st?.state === "error" || st?.state === "over" ? <p className="text-[11px] leading-tight text-rose-600">{st.note}</p> : sim && warn?.startsWith("👀") ? <button type="button" onClick={() => onCompare(id)} className="text-left text-[11px] leading-tight text-amber-700 underline decoration-dotted hover:text-amber-900">{sim} — กดดูเทียบ</button> : warn ? <p className="text-[11px] leading-tight text-amber-700">{warn}</p> : g.dests[id]?.by === "seen" && d === "skip" ? <p className="text-[11px] leading-tight text-slate-500">🕘 {seenOf(id)} — ข้ามให้</p> : g.dests[id]?.by === "name" && d !== "skip" ? <p className="text-[11px] leading-tight text-violet-600">ตั้งจากชื่อไฟล์</p> : null;
          return (
            <div key={id} {...rowProps(i)} className={`min-w-0 rounded-lg ${rowCls(i)} ${d === "skip" ? "opacity-50" : ""}`}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" loading="lazy" decoding="async" draggable={false} {...handleProps(i)} title="ลากเพื่อสลับตำแหน่ง (รูปแรก = ปก)" className="aspect-square w-full cursor-grab rounded-lg border border-slate-200 bg-slate-100 object-cover active:cursor-grabbing" />
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] leading-4 text-white">{i + 1}</span>
                <span className="absolute bottom-1 right-1 flex gap-0.5">
                  {i > 0 && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onReorder(i, i - 1)} aria-label="เลื่อนไปซ้าย" className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">‹</button>}
                  {i < g.order.length - 1 && <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onReorder(i, i + 1)} aria-label="เลื่อนไปขวา" className="h-5 w-5 rounded bg-white/90 text-[11px] leading-none text-slate-700 shadow">›</button>}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-slate-500" title={`${it.path}${it.width ? ` · ${it.width}×${it.height}px` : ""}`}>{it.path.split("/").pop()}</p>
              <p className="truncate text-[10px] text-slate-400">{sizeOf(id)}</p>
              <DestSelect value={d} onChange={(nd) => onDest(id, nd)} label={`${g.label} ${it.path.split("/").pop()}`} />
              {note}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewPanel({ counts, plan, parents, shops, nameOf, warnOf, sizeTotals, resizePref, groups, mode, setMode, canReplace, replacing, needConfirm, touched, seenSkipped }: {
  counts: { upload: number; skip: number; bad: number };
  plan: ReturnType<typeof planRoute>;
  parents: CatalogParent[];
  shops: Shop[];
  nameOf: (id: string) => string;
  warnOf: (id: string) => string | null;
  sizeTotals: { o: number; n: number };
  resizePref: ResizePref;
  groups: GroupState[];
  mode: MassMode;
  setMode: (m: MassMode) => void;
  canReplace: boolean;
  replacing: boolean;
  needConfirm: boolean;
  touched: number;
  seenSkipped: number;
}) {
  const sec = Math.round(sizeTotals.n / (1.25 * 1024 * 1024));
  const diff = groups.filter((g) => g.resize && g.resize !== resizePref.mode).map((g) => `${g.label} ${g.resize === "none" ? "ตัวเต็ม" : "ลดตามช่อง"}`);
  const problems = [...plan.images.values()].filter((p) => p.state === "error" || p.state === "over").map((p) => `${nameOf(p.id)} — ${p.note} (ไม่อัป)`);
  const warns = [...plan.images.values()].filter((p) => p.state === "upload").map((p) => ({ id: p.id, w: warnOf(p.id) })).filter((x) => x.w).map((x) => `${nameOf(x.id)} — ${x.w} (ยังอัปได้)`);
  const shopName = (ids: string[]) => shops.filter((s) => ids.includes(s.id)).map((s) => s.name).join(", ");
  const rowOf = (s: PlanSlot, p: CatalogParent) => {
    const sku = p.skus.find((x) => x.id === s.skuId);
    const label = s.kind === "skuGallery" ? `${sku?.code ?? ""} ${sku?.label ?? ""}` : s.kind === "parentGallery" ? "แกลเลอรี Parent" : s.kind === "desc" ? "รูป Description" : s.kind === "webColor" ? `รูปบนเว็บ · สี${sku?.label ?? ""}` : s.kind === "png" ? "รูปตัด PNG" : s.kind === "heroD" ? "Hero คอม" : "Hero มือถือ";
    const text =
      s.kind === "skuGallery" || s.kind === "parentGallery"
        ? `+${s.ids.length} รูป → รวม ${s.total}/${s.limit}${s.replaces ? ` (แทนที่ ${p.skus.find((x) => x.id === s.skuId)?.gallery ?? p.gallery} รูปเดิม)` : ""}${s.coverId ? ` · ปกใหม่ = ${nameOf(s.coverId)}` : ""}`
        : s.kind === "desc"
          ? `+${s.ids.length} รูป (ต่อท้าย)`
          : s.kind === "webColor"
            ? `+${s.ids.length} รูป → ${shopName(s.shopIds)}${s.replaces ? " (แทนที่ของเดิม)" : ""}`
            : `${nameOf(s.ids[0])}${s.kind === "png" ? "" : ` → ${shopName(s.shopIds)}`}${s.replaces ? " (แทนของเดิม)" : ""}`;
    return { label, text };
  };
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        {[["จะอัป", `${counts.upload} รูป`, ""], ["ข้าม", `${counts.skip} รูป`, ""], ["ไม่อัป (ต้องแก้)", `${counts.bad} รูป`, counts.bad ? "text-rose-600" : ""]].map(([l, v, c]) => (
          <div key={l} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">{l}</p>
            <p className={`text-xl font-semibold ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      {seenSkipped > 0 && <p className="-mt-1 text-xs text-slate-500">🕘 ข้ามให้ {seenSkipped} รูปที่เคยอัปให้รุ่นนั้นแล้ว (จำจากประวัติชุดอัป) · อยากอัปซ้ำจริง ให้เลือกช่องเองในขั้น 2</p>}
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <span>ขนาดรูป: {resizePref.mode === "auto" ? "ลดอัตโนมัติตามช่อง" : resizePref.mode === "fixed" ? `ลดเหลือกว้าง ${resizePref.px.toLocaleString()} px` : "ไม่ลดขนาด (ตัวเต็ม)"}{diff.length ? ` · ยกเว้น ${diff.join(", ")}` : ""}</span>
          <span className="text-slate-500">รวม ~{size(sizeTotals.n)} (ต้นฉบับ {size(sizeTotals.o)})</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">อัปประมาณ {sec >= 60 ? `${Math.floor(sec / 60)} นาที ${sec % 60} วินาที` : `${Math.max(1, sec)} วินาที`} ที่เน็ต 10 Mbps{sizeTotals.n > sizeTotals.o * 0.5 ? " · ใช้พื้นที่เก็บรูปมาก" : ` · ประหยัดพื้นที่ ${Math.round((1 - sizeTotals.n / Math.max(1, sizeTotals.o)) * 100)}%`}</p>
      </div>
      {parents
        .filter((p) => plan.slots.some((s) => s.parentId === p.parentId))
        .map((p) => (
          <div key={p.parentId} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
            <p className="text-sm font-semibold text-slate-800">{p.code} <span className="font-normal text-slate-500">· {p.name}</span></p>
            {plan.slots.filter((s) => s.parentId === p.parentId).map((s) => {
              const r = rowOf(s, p);
              return (
                <div key={s.key} className="flex justify-between gap-3 border-t border-slate-100 py-1.5 text-xs">
                  <span className="text-slate-700">{r.label}</span>
                  <span className={`text-right ${s.replaces ? "text-amber-700" : "text-slate-500"}`}>{r.text}</span>
                </div>
              );
            })}
          </div>
        ))}
      {(problems.length > 0 || warns.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-3.5 py-2.5">
          <p className="mb-1 text-sm font-medium text-slate-800">ต้องดูก่อนยืนยัน ({problems.length + warns.length})</p>
          {[...problems, ...warns].slice(0, 40).map((t) => <p key={t} className="text-xs text-slate-600">• {t}</p>)}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-800">รูปเดิมที่มีอยู่</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setMode("append")} className={seg(mode === "append")}>เพิ่มต่อท้าย</button>
            <button type="button" onClick={() => canReplace && setMode("replace")} disabled={!canReplace} title={canReplace ? undefined : "ต้องมีสิทธิ์ลบรูป (หัวหน้า/แอดมิน)"} className={seg(mode === "replace", true)}>แทนที่ของเดิม</button>
          </div>
        </div>
        <p className={`mt-2 text-[11px] ${mode === "replace" ? "text-rose-600" : "text-slate-500"}`}>
          {mode === "replace"
            ? `โหมดแทนที่: รูปเดิมของแกลเลอรี/รูปบนเว็บที่มีรูปใหม่จะถูกเอาออก (เก็บเป็นเวอร์ชัน ย้อนคืนได้ที่ 🕘) · รูป Description ต่อท้ายเสมอ${replacing ? "" : " · ชุดนี้ไม่มีแกลเลอรีที่จะถูกแทน"}${needConfirm ? ` · แตะ ${touched} รุ่น ต้องพิมพ์ CONFIRM` : ""}`
            : "ของเดิมอยู่ครบ รูปใหม่ต่อท้าย · ตั้งปกใหม่ = ย้ายดาว รูปปกเดิมยังอยู่ · Hero / รูปตัด PNG มีช่องละ 1 (รูปใหม่แทนของเดิม) · บันทึกว่าใครอัปอะไรเมื่อไร · ย้อนทั้งชุดได้หลังอัป"}
        </p>
      </div>
    </div>
  );
}

// ───────────── 🕘 ประวัติการอัปรูป ─────────────

type UndoResultView = { removed: number; alreadyGone: number; restoredOld: number; restoreFailed: number; covers: number; desc: number; png: number; pngChanged: number; web: number; webChanged: number; errors: string[] };
/** สรุปผลย้อนเป็นภาษาคน (warn = มีส่วนที่ข้าม/ไม่สำเร็จ) */
function undoMessage(r: UndoResultView | null | undefined): { text: string; warn: boolean } {
  if (!r) return { text: "ย้อนทั้งชุดแล้ว", warn: false };
  const done = [r.removed && `เอารูปออก ${r.removed}`, r.restoredOld && `คืนรูปเดิม ${r.restoredOld}`, r.covers && `คืนปกเดิม ${r.covers}`, r.desc && `Description ${r.desc}`, r.png && `PNG ${r.png}`, r.web && `รูปบนเว็บ ${r.web} รายการ`].filter(Boolean).join(" · ");
  const skipped = [r.alreadyGone && `${r.alreadyGone} รูปถูกลบไปก่อนแล้ว`, r.pngChanged && `PNG ${r.pngChanged} รุ่นมีคนเปลี่ยนต่อแล้ว`, r.webChanged && `รูปบนเว็บ ${r.webChanged} รายการมีคนแก้ต่อแล้ว`, r.restoreFailed && `คืนรูปเดิมไม่ได้ ${r.restoreFailed}`, r.errors.length && `ผิดพลาด ${r.errors.length}`].filter(Boolean).join(" · ");
  return { text: `ย้อนแล้ว — ${done || "ไม่มีอะไรต้องย้อน"}${skipped ? ` · ข้าม: ${skipped} (ไม่ทับ)` : ""}`, warn: !!skipped };
}

type BatchRow = { id: string; at: string; by: string | null; mine: boolean; mode: string; codes: string[]; ok: number; failed: number; dests: Record<string, number>; status: string; undoneAt: string | null; undoneBy: string | null; canUndo: boolean };

function BatchHistory({ onUndone }: { onUndone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [ask, setAsk] = useState<BatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setErr(null);
    setRows(null);
    try {
      const sp = new URLSearchParams({ limit: "40" });
      if (q.trim()) sp.set("q", q.trim());
      if (mine) sp.set("mine", "1");
      const j = await jsonOf(await apiFetch(`/api/product-images/batches?${sp}`));
      setRows((j.batches ?? []) as BatchRow[]);
    } catch (e) {
      setErr((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    }
  }, [q, mine]);
  useEffect(() => { void load(); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      const j = await jsonOf(await apiFetch("/api/product-images/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", batchId: ask.id }) }));
      const msg = undoMessage(j.result as UndoResultView);
      if (msg.warn) toast.warning(msg.text);
      else toast.success(msg.text);
      setAsk(null);
      onUndone();
      await load();
    } catch (e) {
      toast.error((e as Error).message || "ย้อนไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };
  const fmt = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="ค้นด้วยรหัสรุ่น เช่น BCG11" className="h-8 w-52 rounded-lg border border-slate-300 px-2 text-xs" />
        <button type="button" onClick={() => void load()} className={btn}>ค้นหา</button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={mine} onChange={(e) => setMine(e.target.checked)} /> เฉพาะของฉัน
        </label>
        <span className="ml-auto text-[11px] text-slate-400">ย้อนได้: คนที่อัปชุดนั้นเอง หรือหัวหน้า/แอดมิน</span>
      </div>
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err} <button type="button" onClick={() => void load()} className="ml-1 underline">ลองใหม่</button></div>
      ) : !rows ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">ยังไม่มีชุดอัป{q.trim() ? ` ของ ${q.trim()}` : ""} — ลากโฟลเดอร์แล้วกดยืนยันอัป จะมาโผล่ที่นี่</div>
      ) : (
        rows.map((r) => {
          const dests = Object.entries(r.dests).map(([d, n]) => `${DEST_LABEL[d as RouteDest] ?? d} ${n}`).join(" · ");
          return (
            <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${r.status === "undone" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
              <div className="min-w-0">
                <p className="text-sm text-slate-800">
                  <b className="font-medium">{fmt(r.at)}</b> · {r.ok} รูป{r.failed ? ` (พลาด ${r.failed})` : ""} · {r.codes.slice(0, 4).join(", ")}{r.codes.length > 4 ? ` +${r.codes.length - 4}` : ""}
                  {r.mode === "replace" && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[11px] text-amber-700">แทนที่</span>}
                </p>
                <p className="truncate text-[11px] text-slate-500">โดย {r.by ?? "—"}{r.mine ? " (คุณ)" : ""}{dests ? ` · ${dests}` : ""}</p>
                {r.status === "undone" && <p className="text-[11px] text-emerald-700">↩ ย้อนแล้ว {r.undoneAt ? fmt(r.undoneAt) : ""}{r.undoneBy ? ` โดย ${r.undoneBy}` : ""}</p>}
              </div>
              {r.canUndo && <button type="button" onClick={() => setAsk(r)} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs text-rose-600 hover:bg-rose-50">↩ ย้อนทั้งชุด</button>}
            </div>
          );
        })
      )}
      <ConfirmDialog
        open={!!ask}
        onClose={() => !busy && setAsk(null)}
        onConfirm={() => void undo()}
        title="ย้อนทั้งชุด?"
        message={ask ? `ชุด ${fmt(ask.at)} · ${ask.ok} รูป · ${ask.codes.slice(0, 4).join(", ")} — เอารูปของชุดนี้ออก (เก็บเป็นเวอร์ชัน) · คืนปกเดิม · Hero/รูปบนเว็บ/PNG กลับเป็นค่าเดิม · ส่วนที่มีคนแก้ต่อแล้วจะข้าม ไม่ทับ${ask.mode === "replace" ? " · คืนรูปเดิมที่ถูกแทน" : ""}` : ""}
        confirmText="ย้อนทั้งชุด"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
