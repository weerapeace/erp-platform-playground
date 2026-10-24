"use client";

/**
 * ของกลางของผืนผ้าใบอิสระ — หน้าต่าง "เพิ่มรูป" และ "คลังของตกแต่ง"
 *
 * ImageChooser   : อัปโหลดจากเครื่อง (เก็บเข้าคลังไฟล์กลางให้) · เลือกจากคลังรูป (AssetPicker) · รูปสินค้าของร้าน
 * DecorLibrary   : ลายในตัว (SVG สีตามธีม) + ของร้าน (อัลบั้ม "ของตกแต่งเว็บ · <ร้าน>" ในคลังไฟล์กลาง — แยกต่อร้าน)
 *                  🎨 ลายของร้าน = ไฟล์ SVG ในอัลบั้มเดียวกัน (มี onPickPattern) → วางเป็นลายที่เปลี่ยนสีพื้น/สีเส้น/ความหนาได้
 *                  (lib/svg-frame-import loadShopPattern · ใช้ไม่ได้ เช่น มีแต่รูปฝัง = วางเป็นรูปให้แทน)
 *                  เพิ่ม = อัปโหลด หรือ 📁 เลือกจากคลังไฟล์ (ใส่ไฟล์เดิมเข้าอัลบั้มนี้ — ไม่ก๊อปไฟล์ ไม่ย้ายออกจากอัลบั้มเดิม)
 *                  ✕ = เอาออกจากอัลบั้มนี้เท่านั้น (ไฟล์ยังอยู่ในคลังไฟล์ — กันไฟล์ที่ใช้ที่อื่นหายไปด้วย)
 *
 * ทั้งคู่คืนแค่ r2 key + ขนาดจริงของรูป → ตัวที่เรียกเป็นคนวางลงผืน (lib/website-canvas.ts fitImageBox)
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { AssetPicker } from "@/components/asset-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { loadStorefrontProducts } from "@/lib/website-data";
import { CANVAS_SHAPES } from "@/lib/website-canvas";
import { CanvasShape } from "@/components/website-canvas-shapes";
import { ImageSetsContext } from "@/components/website-image-sets-context";
import { imgSetRef } from "@/lib/website-image-sets";
import { loadShopPattern } from "@/lib/svg-frame-import";
import type { ShopPattern } from "@/lib/website-frames";

export type PickedImage = { key: string; w: number; h: number; title?: string };

const imgUrl = (key: string, w = 400) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** ขนาดจริงของรูป (โหลดตัวย่อมาวัดสัดส่วน) — โหลดไม่ได้ = ถือว่าจัตุรัส */
export function measureImage(key: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = imgUrl(key, 600);
  });
}

/** อัปโหลดไฟล์เข้าคลังไฟล์กลาง (กันไฟล์ซ้ำให้เอง) → คืน r2 key */
/** อัปโหลดรูปเข้าคลังรูป (assets) → r2 key — ตัวเดียวกับปุ่ม "อัปโหลดจากเครื่อง" ใน ImageChooser (ใช้ซ้ำได้ เช่น ลากรูปมาวาง) */
export async function uploadToLibrary(file: File, collectionId?: string): Promise<{ key: string; title: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("title", file.name.replace(/\.[^.]+$/, ""));
  if (collectionId) fd.append("collection_id", collectionId);
  const r = await apiFetch("/api/assets", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.r2_key) throw new Error(j?.error || "อัปโหลดไม่สำเร็จ");
  return { key: j.data.r2_key as string, title: String(j.data.title ?? file.name) };
}

const keyFromUrl = (u: string): string | null => {
  try {
    return new URL(u, "http://x").searchParams.get("key");
  } catch {
    return null;
  }
};

const optCls = "w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50";

/* ─────────── เพิ่มรูป ─────────── */

export function ImageChooser({
  open,
  onClose,
  shopSlug,
  title = "เพิ่มรูป",
  onPick,
  initialView = "menu",
  categoryKeys,
  categoryLabel,
  note = "วางลงผืนตามสัดส่วนรูปจริง · ยังไม่มีกรอบ — แต่งกรอบทีหลังได้ที่ตัวรูป",
}: {
  open: boolean;
  onClose: () => void;
  shopSlug: string;
  title?: string;
  onPick: (img: PickedImage) => void;
  /** "products" = เปิดมาที่รูปสินค้าของร้านเลย */
  initialView?: "menu" | "products";
  /** โชว์เฉพาะสินค้าในหมวดเหล่านี้ก่อน (สลับดูทั้งร้านได้) — หมวดแม่นับสินค้าหมวดย่อยด้วย (API สาธารณะเติมหมวดแม่ให้) */
  categoryKeys?: string[];
  categoryLabel?: string;
  /** ข้อความเล็กท้ายเมนู (null = ไม่โชว์) */
  note?: string | null;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  // 🔗 ชุดรูปกลาง (มีเฉพาะในหน้าเว็บไซต์ของร้าน) — เลือกชุด = รูปนี้เปลี่ยนตามชุด (คอม/มือถือ · ร่าง → ใช้รูปนี้)
  const setsCtx = useContext(ImageSetsContext);
  const [showSets, setShowSets] = useState(false);
  const [products, setProducts] = useState<{ code: string; name: string; images: string[]; categories: string[] }[] | null>(null);
  // กรองตามหมวด (ถ้าส่ง categoryKeys) — ปิดได้ด้วยปุ่ม "ดูสินค้าทั้งร้าน"
  const [onlyCat, setOnlyCat] = useState(true);

  useEffect(() => {
    if (!open) {
      setShowProducts(false);
      setShowSets(false);
      setBusy(false);
    } else {
      setOnlyCat(true);
      if (initialView === "products") openProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** measureKey = รูปที่ใช้วัดสัดส่วน (ชุดรูป: วัดจากรูปคอมจริงของชุด ไม่ผ่านลิงก์ส่งต่อ) */
  const done = async (key: string, title?: string, measureKey = key) => {
    const size = await measureImage(measureKey);
    onPick({ key, ...size, title });
    onClose();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("เลือกได้เฉพาะไฟล์รูป");
      return;
    }
    setBusy(true);
    try {
      const up = await uploadToLibrary(f);
      await done(up.key, up.title);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openProducts = () => {
    setShowProducts(true);
    if (products) return;
    loadStorefrontProducts<{ code: string; name: string; images?: string[]; categories?: string[] }>(shopSlug, true)
      .then((j) => setProducts((j.products ?? []).map((p) => ({ code: p.code, name: p.name, images: p.images ?? [], categories: p.categories ?? [] }))))
      .catch(() => setProducts([]));
  };

  return (
    <>
      <ERPModal open={open && !libOpen} onClose={onClose} title={title} size="lg" defaultExpanded={false} resizable={false}>
        {showSets && setsCtx ? (
          <div className="space-y-3">
            <button onClick={() => setShowSets(false)} className="text-xs text-slate-500 hover:text-blue-600">
              ← กลับ
            </button>
            {setsCtx.sets.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีชุดรูป — สร้างได้ที่แท็บ 🖼 ชุดรูป</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {setsCtx.sets.map((x) => {
                  const k = x.desk ?? x.mob;
                  return (
                    <button key={x.id} type="button" disabled={busy || !k} title={k ? x.name : "ชุดนี้ยังไม่มีรูป"} onClick={() => k && void done(imgSetRef(x.id), x.name, k)} className="overflow-hidden rounded-lg border border-slate-200 text-left hover:border-blue-500 disabled:opacity-50">
                      {k ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgUrl(k, 320)} alt={x.name} className="aspect-video w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex aspect-video w-full items-center justify-center bg-slate-100 text-[11px] text-slate-400">ยังไม่มีรูป</span>
                      )}
                      <span className="block truncate px-2 py-1.5 text-xs text-slate-700">🔗 {x.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-400">รูปนี้จะเปลี่ยนตามชุด — แก้รูปของชุดที่แท็บ 🖼 ชุดรูป ทีเดียวทุกที่ (มือถือใช้รูปมือถือของชุด)</p>
          </div>
        ) : !showProducts ? (
          <div className="space-y-2.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <button className={optCls} disabled={busy} onClick={() => fileRef.current?.click()}>
              <span className="text-2xl">⬆️</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{busy ? "กำลังอัปโหลด…" : "อัปโหลดจากเครื่อง"}</span>
                <span className="block text-xs text-slate-500">เก็บเข้าคลังรูปให้ด้วย ใช้ซ้ำที่อื่นได้</span>
              </span>
            </button>
            <button className={optCls} disabled={busy} onClick={() => setLibOpen(true)}>
              <span className="text-2xl">📁</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">เลือกจากคลังรูป</span>
                <span className="block text-xs text-slate-500">รูปที่เคยอัปไว้ในระบบ</span>
              </span>
            </button>
            {setsCtx && (
              <button className={optCls} disabled={busy} onClick={() => setShowSets(true)}>
                <span className="text-2xl">🔗</span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">ชุดรูป (เปลี่ยนทีเดียวหลายที่)</span>
                  <span className="block text-xs text-slate-500">ผูกรูปนี้กับชุด เช่น New Arrival — เปลี่ยนรูปของชุดแล้วที่นี่เปลี่ยนตาม</span>
                </span>
              </button>
            )}
            <button className={optCls} disabled={busy} onClick={openProducts}>
              <span className="text-2xl">🛍️</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">รูปสินค้าของร้าน</span>
                <span className="block text-xs text-slate-500">รูปของสินค้าที่ขายบนเว็บนี้</span>
              </span>
            </button>
            {note && <p className="text-[11px] text-slate-400 pt-1">{note}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowProducts(false)} className="text-xs text-slate-500 hover:text-blue-600">
                ← กลับ
              </button>
              {categoryKeys?.length ? (
                <span className="ml-auto flex items-center gap-1 text-xs">
                  <button type="button" onClick={() => setOnlyCat(true)} className={`rounded-full border px-2.5 py-1 ${onlyCat ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                    เฉพาะหมวด {categoryLabel ?? ""}
                  </button>
                  <button type="button" onClick={() => setOnlyCat(false)} className={`rounded-full border px-2.5 py-1 ${!onlyCat ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                    ทั้งร้าน
                  </button>
                </span>
              ) : null}
            </div>
            {(() => {
              const shown = products && categoryKeys?.length && onlyCat ? products.filter((p) => p.categories.some((k) => categoryKeys.includes(k))) : products;
              return shown === null ? (
              <p className="text-sm text-slate-400 py-8 text-center">กำลังโหลดสินค้า…</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">{products?.length ? "ยังไม่มีสินค้าในหมวดนี้บนเว็บ — กด \"ทั้งร้าน\" เพื่อเลือกจากสินค้าอื่น" : "ร้านนี้ยังไม่มีสินค้าบนเว็บ"}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
                {shown.flatMap((p) =>
                  p.images.map((u, i) => {
                    const key = keyFromUrl(u);
                    if (!key) return null;
                    return (
                      <button key={`${p.code}-${i}`} title={`${p.code} ${p.name}`} onClick={() => void done(key, p.name)} className="group rounded-lg border border-slate-200 overflow-hidden hover:border-blue-500">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl(key, 240)} alt={p.name} className="w-full aspect-square object-cover" loading="lazy" />
                        <span className="block px-1.5 py-1 text-[10px] text-slate-500 truncate text-left">{p.code}</span>
                      </button>
                    );
                  })
                )}
              </div>
            );
            })()}
          </div>
        )}
      </ERPModal>
      <AssetPicker
        open={libOpen}
        onClose={() => setLibOpen(false)}
        typeFilter="image"
        title="เลือกรูปจากคลัง"
        onSelect={(assets) => {
          setLibOpen(false);
          const a = assets[0];
          if (a?.r2_key) void done(a.r2_key, a.title);
        }}
      />
    </>
  );
}

/* ─────────── คลังของตกแต่ง ─────────── */

type Sticker = { id: string; key: string; title: string; svg: boolean };
const isSvgAsset = (a: { content_type?: string | null; ext?: string | null; r2_key?: string | null }) => a.content_type === "image/svg+xml" || /^svg$/i.test(a.ext ?? "") || /\.svg$/i.test(a.r2_key ?? "");

export function DecorLibrary({
  open,
  onClose,
  shopId,
  color,
  onPickShape,
  onPickSticker,
  onPickPattern,
  kind = "decor",
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  /** สีที่ใช้วาดตัวอย่างลายในตัว (สีแบรนด์ของร้าน) */
  color: string;
  onPickShape?: (shape: string) => void;
  onPickSticker: (img: PickedImage) => void;
  /** 🎨 ลายของร้าน (ไฟล์ SVG ในอัลบั้ม) → วางเป็นลายที่เปลี่ยนสีได้ · ไม่ส่ง = SVG วางเป็นรูปเหมือนไฟล์อื่น */
  onPickPattern?: (pattern: ShopPattern) => void;
  /** decor = คลังของตกแต่ง (มีลายในตัว) · frame = กรอบรูปของร้าน (PNG วางทับรูป) — อัลบั้มแยกกันต่อร้าน */
  kind?: "decor" | "frame";
}) {
  const isFrame = kind === "frame";
  const noun = isFrame ? "กรอบ" : "ของตกแต่ง";
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [readingSvg, setReadingSvg] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Sticker[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [confirmDel, setConfirmDel] = useState<Sticker | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (aid: string) => {
    const r = await apiFetch(`/api/assets?collection_id=${encodeURIComponent(aid)}&type=image&source=all&limit=200`);
    const j = await r.json().catch(() => ({}));
    setStickers(((j?.data ?? []) as { id: string; r2_key: string; title: string; content_type?: string | null; ext?: string | null }[]).map((a) => ({ id: a.id, key: a.r2_key, title: a.title, svg: isSvgAsset(a) })));
  }, []);

  // เปิดครั้งแรก → หา/สร้างอัลบั้มของร้าน แล้วโหลดรายการ
  useEffect(() => {
    if (!open || !shopId) return;
    let alive = true;
    (async () => {
      try {
        let aid = albumId;
        if (!aid) {
          const r = await apiFetch("/api/website/canvas-decor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, kind }) });
          const j = await r.json();
          if (!r.ok || !j.albumId) throw new Error(j.error || `เปิดคลัง${noun}ไม่สำเร็จ`);
          aid = j.albumId as string;
          if (alive) setAlbumId(aid);
        }
        await load(aid);
      } catch (e) {
        if (alive) {
          setStickers([]);
          toast.error((e as Error).message);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopId]);

  /** อัปโหลดเข้าอัลบั้มของร้าน · onlySvg = ปุ่มของ 🎨 ลายของร้าน (อัปชิ้นเดียว = วางลงเลย) */
  const onFiles = async (files: FileList | null, onlySvg = false) => {
    if (!files?.length || !albumId) return;
    const svgFile = (f: File) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
    const list = [...files].filter((f) => (onlySvg ? svgFile(f) : f.type.startsWith("image/")));
    if (onlySvg && list.length < files.length) toast.warning("ลายของร้านรับเฉพาะไฟล์ SVG — ไฟล์อื่นอัปที่ \"ของร้าน\" ด้านบน");
    setUploading(list.length);
    const done: Sticker[] = [];
    for (const f of list) {
      try {
        const up = await uploadToLibrary(f, albumId);
        done.push({ id: "", key: up.key, title: up.title, svg: svgFile(f) });
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
      setUploading((n) => n - 1);
    }
    if (fileRef.current) fileRef.current.value = "";
    if (svgRef.current) svgRef.current.value = "";
    await load(albumId);
    if (onlySvg && done.length === 1) await pickSticker(done[0]);
    else if (done.length) toast.success(`เพิ่ม${onlySvg ? "ลายของร้าน" : noun} ${done.length} ชิ้นแล้ว`);
  };

  /** 📁 เลือกจากคลังไฟล์ → ใส่เข้าอัลบั้มของร้าน (ไฟล์เดิม ไม่ก๊อป) · เลือกชิ้นเดียว = วางลงผืนเลย */
  const addFromLibrary = async (assets: { id: string; r2_key?: string | null; title?: string | null }[]) => {
    setLibOpen(false);
    const list = assets.filter((a) => a.id && a.r2_key);
    if (!list.length || !albumId) return;
    setAdding(true);
    try {
      const r = await apiFetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", asset_ids: list.map((a) => a.id), collection_id: albumId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `เพิ่ม${noun}ไม่สำเร็จ`);
      await load(albumId);
      if (list.length === 1) await pickSticker({ id: list[0].id, key: String(list[0].r2_key), title: String(list[0].title ?? ""), svg: isSvgAsset(list[0] as { r2_key?: string | null }) });
      else toast.success(`เพิ่ม${noun} ${list.length} ชิ้นแล้ว — กดเลือกชิ้นที่จะวาง`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  /** ✕ = เอาออกจากอัลบั้มนี้เท่านั้น (อัลบั้มอื่น/ตัวไฟล์ในคลังยังอยู่) */
  const doDelete = async () => {
    if (!confirmDel || !albumId) return;
    setDeleting(true);
    try {
      const g = await apiFetch(`/api/assets/${confirmDel.id}`);
      const gj = await g.json().catch(() => ({}));
      if (!g.ok) throw new Error(gj?.error || "เอาออกไม่สำเร็จ");
      const ids = ((gj?.data?.collection_ids ?? []) as string[]).filter((c) => c !== albumId);
      const r = await apiFetch(`/api/assets/${confirmDel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection_ids: ids }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "เอาออกไม่สำเร็จ");
      toast.success(`เอาออกจาก${isFrame ? "กรอบของร้าน" : "ของร้าน"}แล้ว — ไฟล์ยังอยู่ในคลังไฟล์`);
      setConfirmDel(null);
      await load(albumId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const pickSticker = async (s: Sticker) => {
    // 🎨 SVG = ลายที่เปลี่ยนสีได้ (อ่านไฟล์ ทำความสะอาด เก็บสีเดิม) · ใช้ไม่ได้ = วางเป็นรูปแทน
    if (s.svg && onPickPattern) {
      setReadingSvg(s.key);
      const res = await loadShopPattern(s.key, s.title);
      setReadingSvg(null);
      if (res.pattern) {
        for (const w of res.warnings) toast.warning(w);
        onPickPattern(res.pattern);
        onClose();
        return;
      }
      toast.warning(`${res.error ?? "ใช้เป็นลายของร้านไม่ได้"} — วางเป็นรูปให้แทน (เปลี่ยนสีไม่ได้)`);
    }
    const size = await measureImage(s.key);
    onPickSticker({ key: s.key, ...size, title: s.title });
    onClose();
  };

  return (
    <>
      <ERPModal open={open && !libOpen} onClose={onClose} title={isFrame ? "กรอบรูปของร้าน" : "คลังของตกแต่ง"} size="xl" defaultExpanded={false}>
        <div className="space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="flex-1 text-sm font-semibold text-slate-800">
                {isFrame ? "กรอบของร้าน" : "ของร้าน"} <span className="font-normal text-xs text-slate-400">(อัปโหลด / เลือกจากคลังไฟล์ · เก็บถาวร · ใช้ได้ทุกหน้าของร้านนี้)</span>
              </p>
              <button disabled={!albumId || adding} onClick={() => setLibOpen(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
                {adding ? "กำลังเพิ่ม…" : "📁 เลือกจากคลังไฟล์"}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/gif,image/jpeg" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <button disabled={!albumId || uploading > 0} onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
                {uploading > 0 ? `กำลังอัปโหลด… (${uploading})` : "⬆️ อัปโหลด"}
              </button>
            </div>
            {stickers === null ? (
              <p className="text-xs text-slate-400 py-4">กำลังโหลด…</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {stickers.filter((s) => !(onPickPattern && s.svg)).map((s) => (
                  <div key={s.id} className="group relative">
                    <button title={s.title} onClick={() => void pickSticker(s)} className="w-full aspect-square rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2 hover:border-blue-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl(s.key, 200)} alt={s.title} className="w-full h-full object-contain" loading="lazy" />
                    </button>
                    <button title="เอาออก" onClick={() => setConfirmDel(s)} className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-white border border-slate-300 text-[11px] text-red-600 shadow-sm">
                      ✕
                    </button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()} disabled={!albumId} className="aspect-square rounded-lg border-2 border-dashed border-slate-300 text-slate-400 text-xl hover:border-blue-400 hover:text-blue-500 disabled:opacity-50" title={`อัปโหลด${noun}`}>
                  +
                </button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              {isFrame
                ? 'แนะนำ PNG พื้นใส ตรงกลางโปร่ง (เช่น กรอบวินเทจ/กรอบดอกไม้จาก Canva) · กดเลือกแล้วกรอบจะวางทับรูป ปรับ "รูปห่างขอบ" ได้ · ไฟล์อยู่ในคลังไฟล์ อัลบั้ม "กรอบรูปเว็บ" ของร้านนี้'
                : 'แนะนำ PNG พื้นใส (เช่น โบว์ ดอกไม้ สติกเกอร์ของแบรนด์) · ไฟล์อยู่ในคลังไฟล์ อัลบั้ม "ของตกแต่งเว็บ" ของร้านนี้'}
            </p>
          </section>

          {!isFrame && onPickPattern && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <p className="flex-1 text-sm font-semibold text-slate-800">
                  🎨 ลายของร้าน <span className="font-normal text-xs text-slate-400">(ไฟล์ SVG · เปลี่ยนสีพื้น สีเส้น ความหนาเส้นได้หลังวาง)</span>
                </p>
                <input ref={svgRef} type="file" accept=".svg,image/svg+xml" multiple className="hidden" onChange={(e) => void onFiles(e.target.files, true)} />
                <button disabled={!albumId || uploading > 0} onClick={() => svgRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
                  {uploading > 0 ? `กำลังอัปโหลด… (${uploading})` : "⬆️ อัป SVG"}
                </button>
              </div>
              {stickers === null ? (
                <p className="text-xs text-slate-400 py-4">กำลังโหลด…</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {stickers.filter((s) => s.svg).map((s) => (
                    <div key={s.id} className="group relative">
                      <button
                        title={`${s.title} — กดเพื่อวาง (เปลี่ยนสีได้)`}
                        disabled={!!readingSvg}
                        onClick={() => void pickSticker(s)}
                        className="w-full aspect-square rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2 hover:border-blue-500 disabled:opacity-60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl(s.key, 200)} alt={s.title} className="w-full h-full object-contain" loading="lazy" />
                        {readingSvg === s.key && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 text-[11px] text-slate-600">กำลังอ่านไฟล์…</span>}
                      </button>
                      <button title="เอาออก" onClick={() => setConfirmDel(s)} className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-white border border-slate-300 text-[11px] text-red-600 shadow-sm">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button onClick={() => svgRef.current?.click()} disabled={!albumId} className="aspect-square rounded-lg border-2 border-dashed border-slate-300 text-slate-400 text-xs hover:border-blue-400 hover:text-blue-500 disabled:opacity-50" title="อัปไฟล์ SVG">
                    + SVG
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                ส่งออกเป็น SVG จาก Illustrator / Figma / Canva · ต้องเป็นรูปทรงล้วน (ตัวหนังสือแปลงเป็นเส้นก่อน · รูปถ่ายที่ฝังจะถูกตัดออก) · ระบบตัดสคริปต์/ลิงก์แฝงในไฟล์ทิ้งให้ · ไฟล์อยู่ในอัลบั้ม &quot;ของตกแต่งเว็บ&quot; ของร้านนี้
              </p>
            </section>
          )}

          {!isFrame && onPickShape && (
          <section>
            <p className="text-sm font-semibold text-slate-800 mb-2">
              ลายในตัว <span className="font-normal text-xs text-slate-400">(เปลี่ยนสีตามธีม/เลือกสีเองได้หลังวาง)</span>
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {CANVAS_SHAPES.map((o) => {
                const wide = ["pearls", "scallop", "wave", "line"].includes(o.v);
                return (
                  <button
                    key={o.v}
                    title={o.l}
                    onClick={() => {
                      onPickShape(o.v);
                      onClose();
                    }}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 hover:border-blue-500"
                  >
                    <span className="block w-full h-10">
                      <CanvasShape it={{ shape: o.v, w: wide ? 120 : 60, h: wide ? 20 : 48, outline: o.v === "rect" || o.v === "ellipse" || o.v === "arch" ? true : false, strokeWidth: 2 }} color={color} />
                    </span>
                    <span className="text-[10px] text-slate-500 truncate w-full text-center">{o.l.replace(/^[^\p{L}]+/u, "")}</span>
                  </button>
                );
              })}
            </div>
          </section>
          )}
        </div>
      </ERPModal>
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => void doDelete()}
        loading={deleting}
        variant="default"
        title={`เอา${noun}นี้ออก?`}
        message={`"${confirmDel?.title ?? ""}" จะหายจากรายการนี้เท่านั้น — ไฟล์ยังอยู่ในคลังไฟล์ (ชิ้นที่วางบนเว็บแล้วไม่หาย) · ลบไฟล์ถาวรได้ที่หน้าคลังไฟล์`}
        confirmText="เอาออก"
      />
      <AssetPicker
        open={libOpen}
        onClose={() => setLibOpen(false)}
        multiple
        typeFilter="image"
        title={isFrame ? "เลือกกรอบจากคลังไฟล์" : "เลือกของตกแต่งจากคลังไฟล์"}
        onSelect={(assets) => void addFromLibrary(assets)}
      />
    </>
  );
}
