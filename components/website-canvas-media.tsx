"use client";

/**
 * ของกลางของผืนผ้าใบอิสระ — หน้าต่าง "เพิ่มรูป" และ "คลังของตกแต่ง"
 *
 * ImageChooser   : อัปโหลดจากเครื่อง (เก็บเข้าคลังไฟล์กลางให้) · เลือกจากคลังรูป (AssetPicker) · รูปสินค้าของร้าน
 * DecorLibrary   : ลายในตัว (SVG สีตามธีม) + ของร้าน (อัลบั้ม "ของตกแต่งเว็บ · <ร้าน>" ในคลังไฟล์กลาง — แยกต่อร้าน)
 *                  อัปโหลด/ลบ ผ่าน API คลังไฟล์เดิม → ลบ = ย้ายไปถังขยะ (กู้คืนได้) · ของที่ยังขึ้นเว็บอยู่ลบไม่ได้ (409)
 *
 * ทั้งคู่คืนแค่ r2 key + ขนาดจริงของรูป → ตัวที่เรียกเป็นคนวางลงผืน (lib/website-canvas.ts fitImageBox)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { AssetPicker } from "@/components/asset-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { CANVAS_SHAPES } from "@/lib/website-canvas";
import { CanvasShape } from "@/components/website-canvas-shapes";

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
async function uploadToLibrary(file: File, collectionId?: string): Promise<{ key: string; title: string }> {
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
}: {
  open: boolean;
  onClose: () => void;
  shopSlug: string;
  title?: string;
  onPick: (img: PickedImage) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [products, setProducts] = useState<{ code: string; name: string; images: string[] }[] | null>(null);

  useEffect(() => {
    if (!open) {
      setShowProducts(false);
      setBusy(false);
    }
  }, [open]);

  const done = async (key: string, title?: string) => {
    const size = await measureImage(key);
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
    fetch(`/api/public/storefront/products?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => setProducts(((j?.products ?? []) as { code: string; name: string; images?: string[] }[]).map((p) => ({ code: p.code, name: p.name, images: p.images ?? [] }))))
      .catch(() => setProducts([]));
  };

  return (
    <>
      <ERPModal open={open && !libOpen} onClose={onClose} title={title} size="lg" defaultExpanded={false} resizable={false}>
        {!showProducts ? (
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
            <button className={optCls} disabled={busy} onClick={openProducts}>
              <span className="text-2xl">🛍️</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">รูปสินค้าของร้าน</span>
                <span className="block text-xs text-slate-500">รูปของสินค้าที่ขายบนเว็บนี้</span>
              </span>
            </button>
            <p className="text-[11px] text-slate-400 pt-1">วางลงผืนตามสัดส่วนรูปจริง · ยังไม่มีกรอบ — แต่งกรอบทีหลังได้ที่ตัวรูป</p>
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setShowProducts(false)} className="text-xs text-slate-500 hover:text-blue-600">
              ← กลับ
            </button>
            {products === null ? (
              <p className="text-sm text-slate-400 py-8 text-center">กำลังโหลดสินค้า…</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">ร้านนี้ยังไม่มีสินค้าบนเว็บ</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
                {products.flatMap((p) =>
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
            )}
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

type Sticker = { id: string; key: string; title: string };

export function DecorLibrary({
  open,
  onClose,
  shopId,
  color,
  onPickShape,
  onPickSticker,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  /** สีที่ใช้วาดตัวอย่างลายในตัว (สีแบรนด์ของร้าน) */
  color: string;
  onPickShape: (shape: string) => void;
  onPickSticker: (img: PickedImage) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Sticker[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [confirmDel, setConfirmDel] = useState<Sticker | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (aid: string) => {
    const r = await apiFetch(`/api/assets?collection_id=${encodeURIComponent(aid)}&type=image&source=all&limit=200`);
    const j = await r.json().catch(() => ({}));
    setStickers(((j?.data ?? []) as { id: string; r2_key: string; title: string }[]).map((a) => ({ id: a.id, key: a.r2_key, title: a.title })));
  }, []);

  // เปิดครั้งแรก → หา/สร้างอัลบั้มของร้าน แล้วโหลดรายการ
  useEffect(() => {
    if (!open || !shopId) return;
    let alive = true;
    (async () => {
      try {
        let aid = albumId;
        if (!aid) {
          const r = await apiFetch("/api/website/canvas-decor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId }) });
          const j = await r.json();
          if (!r.ok || !j.albumId) throw new Error(j.error || "เปิดคลังของตกแต่งไม่สำเร็จ");
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

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !albumId) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      try {
        await uploadToLibrary(f, albumId);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
      setUploading((n) => n - 1);
    }
    if (fileRef.current) fileRef.current.value = "";
    if (ok) toast.success(`เพิ่มของตกแต่ง ${ok} ชิ้นแล้ว`);
    await load(albumId);
  };

  const doDelete = async () => {
    if (!confirmDel || !albumId) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/api/assets/${confirmDel.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "ลบไม่สำเร็จ");
      toast.success("ย้ายไปถังขยะของคลังไฟล์แล้ว (กู้คืนได้)");
      setConfirmDel(null);
      await load(albumId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const pickSticker = async (s: Sticker) => {
    const size = await measureImage(s.key);
    onPickSticker({ key: s.key, ...size, title: s.title });
    onClose();
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="คลังของตกแต่ง" size="xl" defaultExpanded={false}>
        <div className="space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="flex-1 text-sm font-semibold text-slate-800">ของร้าน <span className="font-normal text-xs text-slate-400">(อัปโหลดเอง · เก็บถาวร · ใช้ได้ทุกหน้าของร้านนี้)</span></p>
              <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/gif,image/jpeg" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <button disabled={!albumId || uploading > 0} onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50">
                {uploading > 0 ? `กำลังอัปโหลด… (${uploading})` : "⬆️ อัปโหลด"}
              </button>
            </div>
            {stickers === null ? (
              <p className="text-xs text-slate-400 py-4">กำลังโหลด…</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {stickers.map((s) => (
                  <div key={s.id} className="group relative">
                    <button title={s.title} onClick={() => void pickSticker(s)} className="w-full aspect-square rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2 hover:border-blue-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl(s.key, 200)} alt={s.title} className="w-full h-full object-contain" loading="lazy" />
                    </button>
                    <button title="ลบ" onClick={() => setConfirmDel(s)} className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-white border border-slate-300 text-[11px] text-red-600 shadow-sm">
                      ✕
                    </button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()} disabled={!albumId} className="aspect-square rounded-lg border-2 border-dashed border-slate-300 text-slate-400 text-xl hover:border-blue-400 hover:text-blue-500 disabled:opacity-50" title="อัปโหลดของตกแต่ง">
                  +
                </button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">แนะนำ PNG พื้นใส (เช่น โบว์ ดอกไม้ สติกเกอร์ของแบรนด์) · ไฟล์อยู่ในคลังไฟล์ อัลบั้ม &quot;ของตกแต่งเว็บ&quot; ของร้านนี้</p>
          </section>

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
        </div>
      </ERPModal>
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => void doDelete()}
        loading={deleting}
        variant="danger"
        title="ลบของตกแต่งนี้?"
        message={`"${confirmDel?.title ?? ""}" จะย้ายไปถังขยะของคลังไฟล์ (กู้คืนได้) — ถ้ายังวางอยู่บนเว็บ ระบบจะไม่ให้ลบ`}
        confirmText="ลบ"
      />
    </>
  );
}
