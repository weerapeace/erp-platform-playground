"use client";
/**
 * 📸 ลงรูปเว็บทีละมาก (หน้า "สินค้าบนเว็บ" ของแต่ละร้าน → ปุ่มหัวตาราง / แถบล่างตอนติ๊ก = เฉพาะที่เลือก)
 * --------------------------------------------------------------------------
 * 1) ลากทั้งโฟลเดอร์/หลายไฟล์ (หรือกดเลือก) → จับคู่ชื่อไฟล์กับรหัสรุ่น/สี (ของกลาง lib/website-image-match)
 *      JEAN08_1.jpg = รูปบนเว็บ · JEAN08-01_2.jpg = รูปสี · JEAN08_hero(.jpg / _m) = Hero คอม/มือถือ · โฟลเดอร์ชื่อรหัสก็ได้
 *      🎬 วิดีโอ (mp4/webm/mov) = Hero เสมอ: JEAN08.mp4 = คอม · JEAN08_m.mp4 = มือถือ (≤ 200 MB · ไฟล์ > 4 MB ส่งตรงเข้า R2)
 * 2) ตรวจก่อนลง: แยกตามสินค้า → ช่อง (บอกรหัส SKU + ร้านที่ลง) → รูปใหม่ตามลำดับ · ไฟล์ที่ต้องดู (ไม่พบรหัส/สีไม่มี/เกินเพดาน/Hero ซ้ำ/ข้ามเอง) เลือกช่องเองได้
 *    แต่ละแถวโชว์รูปเดิมบนเว็บจางๆ ก่อนรูปใหม่ (ต่อท้าย = เลขต่อจากของเดิม · แทนที่ = ขีดฆ่า "จะเอาออก")
 *    ↕ ลากรูปสลับลำดับในแถว (หรือ ‹ ›) · ✎ ย้ายทั้งแถวไปสินค้า/ช่องอื่น · 🔁 เปลี่ยนสินค้าทั้งรุ่น (อ่านชื่อผิด — สีจับคู่ตามเลขสีเดิม)
 *    ค่าเริ่มต้น = เพิ่มต่อท้าย (ของเดิมอยู่ครบ) · แทนที่ = เฉพาะช่องที่มีรูปใหม่ · เกิน 20 สินค้า + แทนที่ = พิมพ์ CONFIRM
 * 3) กดลงรูป → รูปย่อ ≤ 2000px (uploadResizedImage) · วิดีโอใช้ตัวอัปกลาง uploadMediaFile (ตัวเดียวกับช่อง Hero ทีละตัว) → R2 (ทีละ 3 ไฟล์ · ไฟล์ที่ไม่ได้ลงจะไม่อัป) → POST /api/website/listings/images (รวมกับรูปล่าสุดใน DB + audit + ล้างแคชเว็บ)
 * ของกลาง: ERPModal · useFileDrop(folders) · useDragReorder · uploadResizedImage · uploadMediaFile · toast
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useFileDrop, FileDropHint, filePathOf } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { uploadResizedImage } from "@/components/image-attach";
import { r2ImageUrl } from "@/lib/r2-image";
import { uploadMediaFile, MediaUploadError } from "@/lib/media-upload";
import { BIG_VIDEO_MAX_BYTES, fileMb } from "@/lib/media-upload-limits";
import {
  MAX_MASS_FILES,
  buildCodeIndex,
  buildMassItems,
  isVideoName,
  matchImagePath,
  planImageUpload,
  targetLabel,
  type CatalogParent,
  type ImageMatch,
  type ImageTarget,
  type MassMode,
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
  /** เลือกช่องเอง (ทับผลจับคู่) · "skip" = ข้ามไฟล์นี้ */
  manual?: { parentId: string; target: ImageTarget | null } | "skip";
  /** ↕ ลำดับที่ลากสลับเอง (ทับเลขท้ายชื่อไฟล์) */
  pos?: number;
};
type Phase = "pick" | "uploading" | "saving" | "done";
type Result = { uploaded: number; uploadFailed: { name: string; why: string }[]; updated: number; failed: number; skippedShops: number };

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
  const [alsoShops, setAlsoShops] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  /** วิดีโอไฟล์ใหญ่ที่กำลังส่ง (%) · null = ไม่มี */
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const clearItems = () => {
    for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    setItems([]);
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
    clearItems();
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
    const room = MAX_MASS_FILES - itemsRef.current.length;
    if (fresh.length > room) toast.warning(`ลงได้ครั้งละไม่เกิน ${MAX_MASS_FILES} ไฟล์ — รับ ${Math.max(0, room)} ไฟล์แรก`);
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
      if (m === "skip") return { ...base, id: it.id, name: it.path, parentId: it.match.parentId, target: it.match.target, order, skip: true };
      if (m) return { ...base, id: it.id, name: it.path, parentId: m.parentId, target: m.target, order };
      return { ...base, id: it.id, name: it.path, parentId: it.match.parentId, target: it.match.target, order };
    });
    return planImageUpload(ins, parents, mode);
  }, [items, parents, mode]);
  const planById = useMemo(() => new Map(plan.files.map((f) => [f.id, f])), [plan]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const uploadIds = plan.dests.flatMap((d) => d.fileIds);
  const touched = [...new Set(plan.dests.map((d) => d.parentId))];
  const needLook = plan.files.filter((f) => f.plan !== "upload");
  const countOf = (p: PlanFile["plan"]) => plan.files.filter((f) => f.plan === p).length;
  const needConfirm = mode === "replace" && touched.length > CONFIRM_OVER;

  // ร้านอื่นที่มีรุ่นที่จะลงรูป
  const otherShops = useMemo(() => {
    if (!catalog) return [];
    return catalog.otherShops
      .map((s) => ({ ...s, has: touched.filter((id) => byId.get(id)?.otherShopIds.includes(s.id)).length }))
      .filter((s) => s.has > 0);
  }, [catalog, touched, byId]);

  const setManual = (id: string, manual: Item["manual"]) => setItems((xs) => xs.map((it) => (it.id === id ? { ...it, manual } : it)));
  // ↕ สลับลำดับในช่องเดียวกัน (รูปแรก = รูปหลักของช่องนั้นบนเว็บ) — ทับเลขท้ายชื่อไฟล์
  const reorderDest = (ids: string[], from: number, to: number) => {
    const next = moveItem(ids, from, to);
    setItems((xs) => xs.map((it) => { const i = next.indexOf(it.id); return i >= 0 ? { ...it, pos: i + 1 } : it; }));
  };
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

  const run = async () => {
    setErr(null);
    if (!uploadIds.length) return setErr("ยังไม่มีรูปที่จะลง");
    if (needConfirm && typed !== "CONFIRM") return setErr(`แทนที่รูป ${touched.length} สินค้าพร้อมกัน — พิมพ์ CONFIRM ก่อน`);
    setPhase("uploading");
    setProgress({ done: 0, total: uploadIds.length });
    const keys = new Map<string, string>();
    const failedNames: { name: string; why: string }[] = [];
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < uploadIds.length) {
        const id = uploadIds[next++];
        const it = itemById.get(id);
        if (!it) continue;
        try {
          if (it.video) {
            // วิดีโอ: ตัวอัปกลางตัวเดียวกับช่อง Hero ทีละตัว (≤ 4 MB ผ่าน ERP · ใหญ่กว่านั้นส่งตรงเข้า R2 มีแถบ %)
            keys.set(id, await uploadMediaFile(it.file, { folder: "storefront-hero", onProgress: (pct) => setVideoPct(pct) }));
            setVideoPct(null);
          } else keys.set(id, (await uploadResizedImage(it.file, { folder: "storefront-products", max: 2000 })).r2_key);
        } catch (e) {
          setVideoPct(null);
          failedNames.push({ name: it.path, why: e instanceof MediaUploadError || e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" });
        }
        setProgress({ done: ++done, total: uploadIds.length });
      }
    };
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
    const massItems = buildMassItems(plan.dests, (id) => keys.get(id) ?? null, (id) => !!itemById.get(id)?.video);
    if (!massItems.length) {
      setPhase("pick");
      return setErr("อัปโหลดรูปไม่สำเร็จเลย — ตรวจการเชื่อมต่อแล้วลองใหม่");
    }
    setPhase("saving");
    try {
      const shopIds = [shop.id, ...[...alsoShops].filter((s) => otherShops.some((o) => o.id === s))];
      const r = await apiFetch("/api/website/listings/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopIds, mode, items: massItems }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      const res: Result = {
        uploaded: keys.size,
        uploadFailed: failedNames,
        updated: Number(j.updated) || 0,
        failed: Array.isArray(j.failed) ? j.failed.length : 0,
        skippedShops: Array.isArray(j.skipped) ? j.skipped.filter((s: { shopId: string }) => s.shopId !== shop.id).length : 0,
      };
      setResult(res);
      setPhase("done");
      if (res.failed || res.uploadFailed.length) toast.warning("ลงรูปเสร็จ แต่มีบางรายการไม่สำเร็จ — ดูสรุปในหน้าต่าง");
      else toast.success(`ลงรูป ${res.uploaded} ไฟล์แล้ว — เว็บเปลี่ยนตามทันที`);
      void onDone();
    } catch (e) {
      setPhase("pick");
      setErr(`${(e as Error).message} — รูปอัปขึ้นคลังแล้ว ${keys.size} ไฟล์ กดลงรูปอีกครั้งได้`);
    }
  };

  const busy = phase === "uploading" || phase === "saving";
  const close = () => {
    if (busy) return toast.info("กำลังลงรูปอยู่ รอให้เสร็จก่อน");
    onClose();
  };

  const thumb = (id: string, opts: { muted?: boolean; onSkip?: () => void; handle?: Record<string, unknown>; index?: number; onMove?: (dir: -1 | 1) => void; canPrev?: boolean; canNext?: boolean } = {}) => {
    const it = itemById.get(id);
    if (!it) return null;
    const parts = it.path.split("/");
    const fileName = parts.pop();
    const folder = parts.pop();
    return (
      <div key={id} className={`group relative w-16 shrink-0 ${opts.muted ? "opacity-50" : ""}`} title={it.path}>
        {it.video ? (
          <>
            <video src={`${it.url}#t=0.1`} muted playsInline preload="metadata" className="h-20 w-16 rounded-md border border-slate-200 object-cover bg-slate-800" />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">🎬 {fileMb(it.file.size)}</span>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.url} alt="" loading="lazy" decoding="async" draggable={false} {...(opts.handle ?? {})} title={opts.handle ? "กดค้างแล้วลาก = สลับลำดับ (เลข 1 = รูปหลัก)" : it.path} className={`h-20 w-16 rounded-md border border-slate-200 object-cover bg-slate-100 ${opts.handle ? "cursor-grab active:cursor-grabbing" : ""}`} />
        )}
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
          <span className={result.failed || result.uploadFailed.length ? "text-amber-700" : "text-emerald-700"}>
            ลงรูป {result.uploaded} ไฟล์ · อัปเดต {result.updated} รายการ{result.failed ? ` · ไม่สำเร็จ ${result.failed}` : ""}
          </span>
        ) : busy ? (
          <span className="text-slate-600">{phase === "saving" ? "กำลังบันทึกลงเว็บ…" : `กำลังอัปโหลด ${progress.done}/${progress.total}${videoPct !== null ? ` · วิดีโอ ${videoPct}%` : ""}`}</span>
        ) : (
          <span className="text-slate-500">{uploadIds.length ? `จะลง ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า${alsoShops.size ? ` (+ร้านอื่น ${alsoShops.size})` : ""}` : "ยังไม่มีรูปที่จะลง"}</span>
        )}
      </div>
      {needConfirm && phase === "pick" && (
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" className="h-9 w-36 rounded-lg border border-rose-300 px-2 font-mono text-sm" />
      )}
      {phase === "done" ? (
        <>
          <button type="button" onClick={() => { clearItems(); setResult(null); setPhase("pick"); void load(); }} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            ลงชุดต่อไป
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">
            ปิด
          </button>
        </>
      ) : (
        <>
          {items.length > 0 && !busy && (
            <button type="button" onClick={clearItems} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">
              ล้างไฟล์ทั้งหมด
            </button>
          )}
          <button type="button" onClick={() => void run()} disabled={busy || !uploadIds.length || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? "กำลังลงรูป…" : uploadIds.length ? `ลงรูป ${uploadIds.length} ไฟล์ → ${touched.length} สินค้า` : "ลงรูป"}
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
      hasUnsavedChanges={items.length > 0 && phase !== "done"}
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
                  หรือแยกโฟลเดอร์ชื่อ <code className="rounded bg-white px-1">JEAN08/</code> · <code className="rounded bg-white px-1">JEAN08-01/</code> ก็ได้ · เลขท้าย _1 _2 (2) = ลำดับรูป · ครั้งละ ≤ {MAX_MASS_FILES} ไฟล์
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
                  <span className="ml-auto text-slate-400">
                    {items.length} ไฟล์ · {touched.length} สินค้า
                  </span>
                </div>

                {/* ② แยกตามสินค้า */}
                {touched.map((pid) => {
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
                        return (
                          <div key={d.key} className="mt-2 grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-2 border-t border-slate-100 pt-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-700" title={dl.title}>{dl.title}</p>
                              <p className="truncate text-[11px] text-slate-500" title={dl.sub}>{dl.sub}</p>
                              {phase === "pick" && (
                                <button type="button" onClick={() => setEditDest(editing ? null : { key: d.key, pid })} className="mt-0.5 text-[11px] text-blue-600 hover:underline">
                                  {editing ? "ปิด" : "✎ ย้ายแถวนี้ (อ่านผิด)"}
                                </button>
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
                                onReorder={(from, to) => reorderDest(d.fileIds, from, to)}
                                render={(id, i, handle) =>
                                  thumb(id, {
                                    onSkip: () => setManual(id, "skip"),
                                    handle,
                                    index: numbered ? base + i : undefined,
                                    onMove: d.fileIds.length > 1 ? (dir) => reorderDest(d.fileIds, i, i + dir) : undefined,
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

                {/* ③ ไฟล์ที่ต้องดู */}
                {needLook.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-3.5 py-2.5">
                    <p className="mb-1 text-sm font-medium text-slate-800">ไฟล์ที่ต้องดู ({needLook.length})</p>
                    {needLook.map((f) => {
                      const it = itemById.get(f.id)!;
                      const man = it.manual && it.manual !== "skip" ? it.manual : null;
                      const pid = man?.parentId ?? f.parentId ?? "";
                      const p = pid ? byId.get(pid) : undefined;
                      const why =
                        f.plan === "skip" ? "ข้ามไว้" : man && !man.target ? "เลือกช่องรูปต่อ" : f.plan === "unmatched" ? it.match.reason || "ยังไม่ได้เลือกช่อง" : f.note || "";
                      return (
                        <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-amber-100 py-2 first:border-t-0">
                          {thumb(f.id, { muted: true })}
                          <div className="min-w-[10rem] flex-1">
                            <p className="truncate text-xs text-slate-700">{it.path}</p>
                            <p className={`text-[11px] ${f.plan === "skip" ? "text-slate-500" : "text-amber-800"}`}>{why}</p>
                          </div>
                          {phase === "pick" && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={pid}
                                onChange={(e) => {
                                  const np = e.target.value;
                                  if (!np) return setManual(f.id, "skip");
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
                              {f.plan !== "skip" && (
                                <button type="button" onClick={() => setManual(f.id, "skip")} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
                                  ข้าม
                                </button>
                              )}
                            </div>
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
                  {busy && (
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${phase === "saving" ? 100 : Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                    </div>
                  )}
                </div>

                {/* ⑤ สรุปผล */}
                {phase === "done" && result && (
                  <div className={`rounded-xl border px-3.5 py-3 text-sm ${result.failed || result.uploadFailed.length ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                    <p className="font-medium text-slate-800">
                      ✓ ลงรูป {result.uploaded} ไฟล์ · อัปเดต {result.updated} รายการ — เว็บเปลี่ยนตามทันที
                    </p>
                    {result.skippedShops > 0 && <p className="mt-1 text-xs text-slate-500">ร้านอื่น: ข้าม {result.skippedShops} รายการที่ไม่มีสินค้านั้นในร้าน</p>}
                    {result.failed > 0 && <p className="mt-1 text-xs text-rose-700">บันทึกไม่สำเร็จ {result.failed} รายการ — ลองลงชุดนั้นใหม่อีกครั้ง</p>}
                    {result.uploadFailed.length > 0 && (
                      <p className="mt-1 text-xs text-rose-700">
                        อัปโหลดไม่สำเร็จ {result.uploadFailed.length} ไฟล์: {result.uploadFailed.slice(0, 8).map((f) => `${f.name} (${f.why})`).join(" · ")}
                        {result.uploadFailed.length > 8 ? " …" : ""}
                      </p>
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
