"use client";
/**
 * ⇆ จัดเรียง 2 ฝั่ง (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17 ข้อ 1-5)
 * - แบ่งจอซ้าย/ขวา (มือถือ = บน/ล่าง) · แต่ละฝั่งเข้า-ออกอัลบั้มได้เอง (เส้นทาง + "เลือกอัลบั้ม…" แบบมีรูปปก)
 * - ลากรูป / ลากการ์ดอัลบั้ม ข้ามฝั่ง: วางในพื้นที่ฝั่งนั้น = ย้ายเข้าอัลบั้มที่ฝั่งนั้นเปิดอยู่ · วางบนการ์ดอัลบั้ม = ย้ายเข้าการ์ดนั้น
 *   (อัลบั้ม→การ์ดอัลบั้ม = ถามรวม/ใส่ข้างใน ผ่าน onAlbumOnAlbum ของหน้า)
 * - เลือกหลายรูป: คลิก / Shift+คลิก (เป็นช่วง) / ลากคลุม (useMarqueeSelect) · ทุกครั้งมีปุ่ม "ย้อนกลับ"
 * - เส้นกลางลากปรับความกว้างได้ (ของกลาง SplitHandle · จำรายคน) · Ctrl+ลูกกลิ้ง ย่อ/ขยายแยกแต่ละฝั่ง
 * - มือถือ: ปุ่ม "ส่งไปอีกฝั่ง" แทนการลาก
 * ย้ายจริงผ่าน api.ts (movePhotosTo / moveAlbumTo) → onChanged() ให้หน้าโหลดใหม่ (ฝั่งทั้งสองโหลดรูปตามรายการอัลบั้มที่เปลี่ยน)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { AlbumCover } from "@/components/album-cover";
import { useGalleryColumns } from "@/components/gallery-columns";
import { SplitHandle, useSplitWidth } from "@/components/split-handle";
import { useMediaQuery } from "@/lib/use-media-query";
import { useMarqueeSelect } from "@/lib/use-marquee-select";
import { albumPath, brandViewItems, inBrandTab, canMoveAlbum, isAutoAlbumName, productLinkLabel, sortAlbums, sortPhotos, type SampleAlbum, type SampleBrand, type SamplePhoto } from "@/lib/sample-images";
import { loadSamples, moveAlbumTo, movePhotosTo } from "./api";
import { SamplePhotoTile, sampleImgUrl } from "./parts";
import { SampleAlbumPickerModal } from "./album-picker";
import { ImageLightbox } from "@/components/image-lightbox";

const MIME = "application/x-sample-two-pane";
type Side = "L" | "R";
type Payload = { side: Side; kind: "photos"; ids: string[]; from: string } | { side: Side; kind: "album"; id: string };

type Shared = {
  albums: SampleAlbum[];
  brands: SampleBrand[];
  tab: string;
  canEdit: boolean;
  nameOf: (a: SampleAlbum | null | undefined) => string;
  /** ย้ายเสร็จ → หน้าโหลดรายการใหม่ */
  onChanged: () => Promise<void> | void;
  /** ลากอัลบั้มวางบนการ์ดอัลบั้ม → หน้าถามรวม/ใส่ข้างใน */
  onAlbumOnAlbum: (src: SampleAlbum, dst: SampleAlbum) => void;
};

function Pane({ side, albumId, setAlbumId, other, sendTo, sh }: {
  side: Side; albumId: string | null; setAlbumId: (id: string | null) => void;
  /** อัลบั้มที่อีกฝั่งเปิดอยู่ (ปุ่มส่งไปอีกฝั่ง) */
  other: string | null;
  sendTo: (p: Payload, to: string | null) => Promise<void>;
  sh: Shared;
}) {
  const t = useT();
  const { albums, tab, canEdit, nameOf } = sh;
  const tree = useMemo(() => albums.map((a) => ({ id: a.id, parent_id: a.parent_id })), [albums]);
  const album = albumId ? albums.find((a) => a.id === albumId) ?? null : null;
  const [photos, setPhotos] = useState<SamplePhoto[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [viewAt, setViewAt] = useState(-1);   // ดูรูปใหญ่
  const shift = useRef(false);
  const last = useRef<string | null>(null);
  const grid = useGalleryColumns(`sample-two-pane-${side}`, 4, "0.4rem", { ctrlWheel: true });

  // โหลดรูปของอัลบั้มที่ฝั่งนี้เปิด — โหลดใหม่ทุกครั้งที่รายการอัลบั้มเปลี่ยน (หลังย้าย)
  useEffect(() => {
    setSel(new Set());
    if (!albumId) { setPhotos([]); return; }
    let alive = true;
    setPhotos(null);
    loadSamples(albumId).then((d) => { if (alive) setPhotos(sortPhotos((d.photos ?? []).filter((p) => !p.trashed), "manual")); }).catch(() => { if (alive) setPhotos([]); });
    return () => { alive = false; };
  }, [albumId, albums]);

  const kids = useMemo(() => (albumId
    ? sortAlbums(albums.filter((a) => a.parent_id === albumId), "manual")
    : brandViewItems(albums, tab, "newest", null).flatMap((i) => (i.kind === "album" ? [i.album] : [i.album]))), [albums, albumId, tab]);
  const list = photos ?? [];
  const ids = list.map((p) => p.id);
  const mq = useMarqueeSelect({
    disabled: !canEdit,
    getSelected: () => [...sel].map((x) => `p:${x}`),
    setSelected: (xs) => setSel(new Set(xs.filter((x) => x.startsWith("p:")).map((x) => x.slice(2)))),
  });
  const mqRef = mq.ref, wheelRef = grid.wheelRef;
  const bodyRef = useCallback((el: HTMLDivElement | null) => { mqRef(el); wheelRef(el); }, [mqRef, wheelRef]);

  const toggle = (id: string) => {
    const from = last.current;
    if (shift.current && from && ids.includes(from)) {
      const a = ids.indexOf(from), b = ids.indexOf(id);
      setSel((s) => new Set([...s, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)]));
    } else setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    last.current = id;
  };
  const startDrag = (e: DragEvent, p: Payload) => { e.dataTransfer.setData(MIME, JSON.stringify(p)); e.dataTransfer.effectAllowed = "move"; };
  const read = (e: DragEvent): Payload | null => { try { return JSON.parse(e.dataTransfer.getData(MIME)) as Payload; } catch { return null; } };
  const isOurs = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(MIME);
  // วางในพื้นที่ฝั่งนี้ = ย้ายเข้าอัลบั้มที่ฝั่งนี้เปิด · วางบนการ์ด = ย้ายเข้าการ์ด
  const zone = (key: string, target: SampleAlbum | null) => ({
    onDragOver: (e: DragEvent) => { if (!isOurs(e) || !canEdit) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); },
    onDragLeave: (e: DragEvent) => { const to = e.relatedTarget as Node | null; if (to && (e.currentTarget as HTMLElement).contains(to)) return; setOver((k) => (k === key ? null : k)); },
    onDrop: (e: DragEvent) => {
      if (!isOurs(e)) return;
      e.preventDefault(); e.stopPropagation(); setOver(null);
      const p = read(e); if (!p) return;
      if (target && p.kind === "album") {
        const src = albums.find((a) => a.id === p.id);
        if (src && src.id !== target.id && canMoveAlbum(tree, src.id, target.id)) sh.onAlbumOnAlbum(src, target);
        return;
      }
      if (!target && p.side === side) return;   // ลากในฝั่งเดียวกัน (พื้นที่ว่าง) = ไม่ทำอะไร
      void sendTo(p, target ? target.id : albumId);
    },
  });

  const path = albumId ? albumPath(tree, albumId).map((id) => albums.find((a) => a.id === id)).filter((a): a is SampleAlbum => !!a) : [];
  const brandName = sh.brands.find((b) => b.id === album?.brand_id)?.name ?? null;
  const picks = useMemo(() => albums.filter((a) => inBrandTab(a, tab)), [albums, tab]);

  return (
    <div {...zone(`pane:${side}`, null)} className={`flex min-h-[50vh] min-w-0 flex-col rounded-xl border bg-white p-2 ${over === `pane:${side}` ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-[12px]">
        <button type="button" onClick={() => setAlbumId(null)} className="rounded px-1 text-violet-700 hover:underline">{t("อัลบั้มทั้งหมด", "All albums")}</button>
        {path.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1"><span className="text-slate-300">›</span>
            <button type="button" onClick={() => setAlbumId(a.id)} className={`max-w-[12rem] truncate rounded px-1 ${a.id === albumId ? "font-semibold text-slate-800" : "text-violet-700 hover:underline"}`}>{nameOf(a)}</button>
          </span>
        ))}
        <button type="button" onClick={() => setPicking(true)} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50"><Icon value="i:folder" />{t("เลือกอัลบั้ม…", "Pick album…")}</button>
      </div>

      <div ref={bodyRef} className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5" style={{ maxHeight: "68vh" }}>
        {kids.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {kids.map((a) => {
              const auto = isAutoAlbumName(a.name), link = productLinkLabel(a);
              return (
                <div key={a.id} draggable={canEdit} onDragStart={(e) => startDrag(e, { side, kind: "album", id: a.id })} {...zone(`al:${a.id}`, a)}
                  onDoubleClick={() => setAlbumId(a.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border p-1 ${over === `al:${a.id}` ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-violet-300"}`}
                  onClick={() => setAlbumId(a.id)} title={t("กด = เปิด · ลากไปอีกฝั่งได้", "Click to open · drag to the other side")}>
                  <span className="w-10 shrink-0 overflow-hidden rounded"><AlbumCover keys={a.preview_keys ?? []} total={a.deep?.photos} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-slate-800">{auto ? (link ?? t("ยังไม่เชื่อมสินค้า", "No product")) : nameOf(a)}</span>
                    <span className="text-[11px] text-slate-500">{t(`${a.deep?.photos ?? 0} รูป`, `${a.deep?.photos ?? 0}`)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!albumId ? <p className="py-6 text-center text-[12px] text-slate-400">{t("กดเปิดอัลบั้มด้านบน หรือ \"เลือกอัลบั้ม…\"", "Open an album above or \"Pick album…\"")}</p>
          : photos === null ? <p className="py-6 text-center text-[12px] text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
          : !list.length ? <p className="py-6 text-center text-[12px] text-slate-400">{t("อัลบั้มนี้ยังไม่มีรูป — ลากรูปจากอีกฝั่งมาวางได้", "No photos — drag some here")}</p>
          : (
            <div style={grid.gridStyle} {...grid.compactAttr}>
              {list.map((p) => (
                <SamplePhotoTile key={p.id} photo={p} on={sel.has(p.id)} onToggle={() => toggle(p.id)} thumbW={240} onView={() => setViewAt(list.indexOf(p))}
                  extra={{
                    draggable: canEdit,
                    onMouseDown: (e) => { shift.current = e.shiftKey; },
                    onDragStart: (e) => { const ids2 = sel.has(p.id) ? [...sel] : [p.id]; startDrag(e, { side, kind: "photos", ids: ids2, from: albumId ?? "" }); },
                    ...({ "data-select-id": `p:${p.id}` } as Record<string, string>),
                  }} />
              ))}
            </div>
          )}
        {mq.box && <div style={mq.box} className="rounded border border-violet-400 bg-violet-400/10" />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
        <span>{album ? t(`${list.length} รูป`, `${list.length} photos`) : ""}{sel.size ? t(` · เลือก ${sel.size}`, ` · ${sel.size} selected`) : ""}</span>
        {sel.size > 0 && albumId && (
          <button type="button" disabled={!other} onClick={() => void sendTo({ side, kind: "photos", ids: [...sel], from: albumId ?? "" }, other)}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 font-medium text-white hover:bg-violet-700 disabled:opacity-40">
            {other ? t(`ส่ง ${sel.size} รูปไปอีกฝั่ง`, `Send ${sel.size} to the other side`) : t("อีกฝั่งยังไม่ได้เปิดอัลบั้ม", "Open an album on the other side")} {side === "L" ? "→" : "←"}</button>
        )}
      </div>

      <ImageLightbox index={viewAt} onClose={() => setViewAt(-1)} onIndex={setViewAt} thumbnails
        images={list.map((p) => ({ url: sampleImgUrl(p.r2_key), thumbUrl: sampleImgUrl(p.r2_key, 240), label: p.file_name }))} />
      <SampleAlbumPickerModal open={picking} onClose={() => setPicking(false)} title={t("เปิดอัลบั้มในฝั่งนี้", "Open an album here")} brandName={brandName}
        albums={picks} labelOf={(a) => albumPath(tree, a.id).map((id) => nameOf(albums.find((x) => x.id === id))).join(" › ")}
        onPick={(a) => { setPicking(false); setAlbumId(a.id); }} />
    </div>
  );
}

/** left/right = อัลบั้มที่แต่ละฝั่งเปิด (หน้าเก็บไว้ · เปลี่ยนแล้วจดก้าว ปุ่มย้อนของเมาส์ถอยได้) */
export function SampleTwoPane({ left, right, onLeft, onRight, onClose, ...sh }: Shared & { left: string | null; right: string | null; onLeft: (id: string | null) => void; onRight: (id: string | null) => void; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const wide = useMediaQuery("(min-width: 1024px)");
  const split = useSplitWidth("sample-two-pane", { min: 320, reserve: 320 });

  // ย้ายข้ามฝั่ง + ย้อนกลับ
  const sendTo = async (p: Payload, to: string | null) => {
    try {
      if (p.kind === "photos") {
        if (!to) { toast.warning(t("ฝั่งนี้ยังไม่ได้เปิดอัลบั้ม — เปิดอัลบั้มก่อนค่อยวางรูป", "Open an album on this side first")); return; }
        if (p.from === to) return;
        const r = await movePhotosTo(p.ids, p.from, to);
        await sh.onChanged();
        const dst = sh.albums.find((a) => a.id === to);
        toast.action(t(`ย้าย ${r.moved} รูปไป "${sh.nameOf(dst)}" แล้ว`, `Moved ${r.moved} photo(s)`), t("ย้อนกลับ", "Undo"),
          () => void movePhotosTo(p.ids, to, p.from).then(() => sh.onChanged()), { ms: 8000 });
        return;
      }
      const src = sh.albums.find((a) => a.id === p.id);
      if (!src || src.parent_id === to || src.id === to) return;
      const tree = sh.albums.map((a) => ({ id: a.id, parent_id: a.parent_id }));
      if (!canMoveAlbum(tree, src.id, to)) { toast.warning(t("ย้ายอัลบั้มเข้าไปในตัวเอง หรือในอัลบั้มย่อยของตัวเองไม่ได้", "Can't move an album into itself")); return; }
      const was = src.parent_id ?? null;
      await moveAlbumTo(src.id, to);
      await sh.onChanged();
      toast.action(t(`ย้ายอัลบั้ม "${sh.nameOf(src)}" แล้ว`, "Album moved"), t("ย้อนกลับ", "Undo"),
        () => void moveAlbumTo(src.id, was).then(() => sh.onChanged()), { ms: 8000 });
    } catch (e) { toast.error((e as Error).message); }
  };

  const L = <Pane side="L" albumId={left} setAlbumId={onLeft} other={right} sendTo={sendTo} sh={sh} />;
  const R = <Pane side="R" albumId={right} setAlbumId={onRight} other={left} sendTo={sendTo} sh={sh} />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">⇆ {t("จัดเรียง 2 ฝั่ง", "Two-pane organizer")}</span>
        <span className="text-[12px] text-slate-500">{wide ? t("ลากรูป/อัลบั้มข้ามฝั่ง · วางบนการ์ดอัลบั้ม = ใส่เข้าการ์ดนั้น · ลากเส้นกลางปรับขนาด", "Drag across · drop on a card to put inside · drag the divider to resize") : t("เลือกรูปแล้วกด \"ส่งไปอีกฝั่ง\"", "Pick photos then \"Send to the other side\"")}</span>
        <button type="button" onClick={onClose} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:x" />{t("ปิดโหมดจัดเรียง", "Close organizer")}</button>
      </div>
      {wide ? (
        <div ref={split.containerRef} className="grid grid-cols-[minmax(0,1fr)_14px_var(--pv-w)]" style={split.style("minmax(320px,50%)")}>
          {L}<SplitHandle split={split} />{R}
        </div>
      ) : (
        <div className="space-y-2">{L}{R}</div>
      )}
    </div>
  );
}


