"use client";

/**
 * 🗂 แท็บรูปบนเว็บ (ERP › เว็บไซต์ › ร้าน › 🗂 รูปบนเว็บ) — รูป/วิดีโอทุกรูปที่ "ใส่เอง" (ไม่ใช่รูปสินค้า) ในที่เดียว
 * ดูว่าแต่ละรูปใช้ที่ไหนบ้าง · 🔄 เปลี่ยนรูปทุกที่ทีเดียว (ลงร่าง → ไปกดเผยแพร่ที่แท็บนั้น) · ✏️ ไปแก้ที่ Section · 👁 ดูในพรีวิว
 * 📝 คำอธิบายรูป (ช่วย Google + คนตาบอด · ขึ้นเว็บทันที) · 🔗 ทำเป็นชุดรูปกลาง (ปรับ/ตั้งเวลาต่อได้ที่แท็บ 🖼 ชุดรูป)
 * API /api/website/site-images · กฎ lib/website-site-images.ts · ช่องรูป/วิดีโอใช้ของกลาง ImageUploadField / WebsiteVideoField
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { WebsiteVideoField } from "@/components/website-video-field";
import { notifyImageSetsChanged } from "@/components/website-image-sets-context";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { IMAGE_ALT_MAX, mediaFileName, type SiteDocKind, type SiteImage, type SiteImageUse } from "@/lib/website-site-images";

type FileInfo = { name: string; size: number | null; w: number | null; h: number | null };
type Img = SiteImage & { alt: string; file: FileInfo | null };
/** ไปแก้ที่แท็บ (หน้าแรก = เปิด Section นั้นให้เลย) */
export type SiteImageGo = { tab: "layout" | "pages" | "design" | "newdrops"; blockId?: string | null };
type Changed = { kind: SiteDocKind; id: string; label: string; count: number };

const TAB_OF: Record<SiteDocKind, SiteImageGo["tab"]> = { home: "layout", page: "pages", theme: "design", drop: "newdrops" };
const TAB_NAME: Record<SiteImageGo["tab"], string> = { layout: "🧱 หน้าแรก", pages: "📄 หน้าเว็บ", design: "🎨 ดีไซน์", newdrops: "🆕 มาใหม่" };
const PLACES: { k: "all" | SiteDocKind; l: string }[] = [
  { k: "all", l: "ทุกที่" },
  { k: "home", l: "หน้าแรก" },
  { k: "page", l: "หน้าอื่น" },
  { k: "theme", l: "ดีไซน์ (เมนู · โลโก้ · หัว/ท้ายเว็บ)" },
  { k: "drop", l: "ชุดมาใหม่" },
];
type Chip = "noAlt" | "multi" | "video" | "heavy" | "draftOnly";
const CHIPS: { k: Chip; l: string }[] = [
  { k: "noAlt", l: "ยังไม่มีคำอธิบาย" },
  { k: "multi", l: "ใช้หลายที่" },
  { k: "heavy", l: "⚠ ไฟล์หนัก" },
  { k: "video", l: "▶ วิดีโอ" },
  { k: "draftOnly", l: "📝 อยู่แค่ในร่าง" },
];
const HEAVY = { image: 1.5 * 1024 * 1024, video: 20 * 1024 * 1024 };
const isHeavy = (i: Img) => (i.file?.size ?? 0) > HEAVY[i.kind];
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fileLine = (i: Img) => [i.file?.size ? mb(i.file.size) : "", i.file?.w && i.file?.h ? `${i.file.w}×${i.file.h}` : ""].filter(Boolean).join(" · ");
/** ลิงก์หน้าเว็บ + ?preview=1 (ก่อน #ส่วนของหน้า) — เห็นร่าง */
const withPreviewParam = (path: string) => {
  const at = path.indexOf("#");
  const base = at >= 0 ? path.slice(0, at) : path;
  return `${base}${base.includes("?") ? "&" : "?"}preview=1${at >= 0 ? path.slice(at) : ""}`;
};
const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1 text-xs transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-500"}`;
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50";

/** สถานะของที่ใช้: เผยแพร่ / ร่าง / เอาออกในร่างแล้ว */
function UseState({ u }: { u: SiteImageUse }) {
  if (u.live && u.draft) return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">บนเว็บ</span>;
  if (u.draft) return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">ร่าง · ยังไม่ขึ้นเว็บ</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">เอาออกในร่างแล้ว</span>;
}

function Thumb({ img, h = 112 }: { img: Img; h?: number }) {
  if (img.kind === "video")
    return (
      <div className="flex items-center justify-center bg-slate-800 text-2xl text-white" style={{ height: h }}>
        ▶
      </div>
    );
  return (
    <div className="bg-slate-100" style={{ height: h, background: "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 12px 12px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={keyUrl(img.key, 400) ?? ""} alt={img.alt} loading="lazy" className="h-full w-full object-contain" />
    </div>
  );
}

export function WebsiteSiteImagesPanel({ shopSlug, onGo }: { shopSlug: string; onGo: (g: SiteImageGo) => void }) {
  const toast = useToast();
  const [images, setImages] = useState<Img[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<{ siteUrl: string | null; previewKey: string | null }>({ siteUrl: null, previewKey: null });
  const [place, setPlace] = useState<"all" | SiteDocKind>("all");
  const [chips, setChips] = useState<Set<Chip>>(new Set());
  const [withProducts, setWithProducts] = useState(false);
  const [q, setQ] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  // 🔄 เปลี่ยนทุกที่ / 🔗 ทำเป็นชุดรูป (หน้าต่างเด้ง)
  const [swap, setSwap] = useState<{ to: string | null } | null>(null);
  const [mkSet, setMkSet] = useState<{ name: string } | null>(null);
  // ผลล่าสุด: ลงร่างที่ไหนบ้าง → ปุ่มไปกดเผยแพร่
  const [done, setDone] = useState<{ what: string; changed: Changed[]; readOnly: number; noAccess?: number } | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiFetch(`/api/website/site-images?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j: { images?: Img[]; shop?: { siteUrl: string | null; previewKey: string | null }; error?: string }) => {
        if (j.error) throw new Error(j.error);
        setImages(j.images ?? []);
        if (j.shop) setSite(j.shop);
      })
      .catch((e: Error) => {
        setImages(null);
        setError(e.message || "โหลดรูปไม่สำเร็จ");
      });
  }, [shopSlug]);
  useEffect(load, [load]);

  const pool = useMemo(() => (images ?? []).filter((i) => withProducts || !i.product), [images, withProducts]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pool.filter((i) => {
      if (place !== "all" && !i.uses.some((u) => u.kind === place)) return false;
      if (chips.has("noAlt") && (i.alt || i.kind === "video")) return false;
      if (chips.has("multi") && i.uses.length < 2) return false;
      if (chips.has("video") && i.kind !== "video") return false;
      if (chips.has("heavy") && !isHeavy(i)) return false;
      if (chips.has("draftOnly") && i.uses.some((u) => u.live)) return false;
      if (s && !`${i.key} ${i.file?.name ?? ""} ${i.alt} ${i.uses.map((u) => u.where).join(" ")}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [pool, place, chips, q]);
  const sel = shown.find((i) => i.key === selKey) ?? shown[0] ?? null;
  useEffect(() => setAlt(sel?.alt ?? ""), [sel?.key, sel?.alt]);
  // 📱 จอแคบ: รายละเอียดอยู่ใต้การ์ดทั้งหมด → กดการ์ดแล้วเลื่อนลงไปให้เอง
  useEffect(() => {
    if (!selKey || window.matchMedia("(min-width: 1024px)").matches) return;
    document.querySelector("[data-site-image-detail]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selKey]);

  const stats = useMemo(
    () => ({
      n: pool.length,
      uses: pool.reduce((s, i) => s + i.uses.length, 0),
      noAlt: pool.filter((i) => i.kind === "image" && !i.alt).length,
      heavy: pool.filter(isHeavy).length,
    }),
    [pool],
  );

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/site-images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, ...body }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      return j;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveAlt = async () => {
    if (!sel) return;
    const j = await patch({ action: "alt", key: sel.key, alt });
    if (!j) return;
    setImages((cur) => cur?.map((i) => (i.key === sel.key ? { ...i, alt: j.alt ?? "" } : i)) ?? cur);
    toast.success(j.alt ? "บันทึกคำอธิบายแล้ว — ขึ้นเว็บแล้ว" : "ลบคำอธิบายแล้ว");
  };

  const doSwap = async () => {
    if (!sel || !swap?.to) return;
    const j = await patch({ action: "replace", from: sel.key, to: swap.to });
    if (!j) return;
    setSwap(null);
    setDone({ what: `เปลี่ยน “${mediaFileName(sel.key)}”`, changed: j.changed ?? [], readOnly: j.readOnly ?? 0, noAccess: j.noAccess ?? 0 });
    toast.success("ลงร่างแล้ว — ลูกค้ายังเห็นรูปเดิมจนกว่าจะกดเผยแพร่");
    load();
  };

  const doMakeSet = async () => {
    if (!sel || !mkSet) return;
    const j = await patch({ action: "make-set", key: sel.key, name: mkSet.name });
    if (!j) return;
    setMkSet(null);
    notifyImageSetsChanged();
    setDone({ what: `ผูกชุดรูป “${j.set?.name ?? mkSet.name}”`, changed: j.changed ?? [], readOnly: j.readOnly ?? 0, noAccess: j.noAccess ?? 0 });
    toast.success("สร้างชุดรูปแล้ว — ปรับรูป/ตั้งเวลาต่อได้ที่แท็บ 🖼 ชุดรูป");
    load();
  };

  const previewUrl = (u: SiteImageUse) => (site.siteUrl ? `${site.siteUrl}${withPreviewKey(withPreviewParam(u.path), site.previewKey)}` : null);
  const goEdit = (u: SiteImageUse) => onGo({ tab: TAB_OF[u.kind], blockId: u.kind === "home" ? u.blockId : null });
  const editableUses = sel?.uses.filter((u) => u.editable && u.draft) ?? [];
  const readOnlyUses = sel?.uses.filter((u) => !u.editable) ?? [];

  if (error) return <ErrorState title="โหลดรูปบนเว็บไม่สำเร็จ" hint={error} onRetry={load} />;
  if (!images) return <LoadingState label="กำลังรวบรวมรูปจากทุกหน้า…" />;

  return (
    <div className="space-y-3" data-site-images>
      <p className="text-sm text-slate-500">รูปและวิดีโอทุกรูปที่ใส่เองบนเว็บ (ไม่รวมรูปสินค้า) — ดูว่าใช้ที่ไหน · เปลี่ยนทุกที่ทีเดียว · ใส่คำอธิบายรูป</p>

      {/* ตัวเลขสรุป */}
      <div className="flex flex-wrap gap-2">
        {[
          [stats.n, "รูป/วิดีโอที่ใส่เอง"],
          [stats.uses, "จุดที่ใช้บนเว็บ"],
          [stats.noAlt, "รูปที่ยังไม่มีคำอธิบาย"],
          [stats.heavy, "ไฟล์หนัก (โหลดช้า)"],
        ].map(([n, l]) => (
          <div key={l} className="min-w-[8.5rem] rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <b className="block text-lg font-semibold text-slate-800">{n}</b>
            {l}
          </div>
        ))}
      </div>

      {/* ผลล่าสุด → ไปกดเผยแพร่ */}
      {done && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-site-images-done>
          <div className="flex items-start gap-2">
            <span className="flex-1">
              📝 {done.what} — ลงร่างแล้ว {done.changed.map((c) => `${c.label} (${c.count})`).join(" · ") || "ไม่มีที่ที่แก้ได้"}
              {done.readOnly > 0 && ` · อีก ${done.readOnly} ที่อยู่ในชุดมาใหม่ ต้องเปลี่ยนเองที่แท็บ 🆕 มาใหม่`}
              {/* 👷 ติ๊กหัวข้อแท็บ: ไม่แตะร่างดีไซน์/หน้าที่ไม่มีสิทธิ์ */}
              {(done.noAccess ?? 0) > 0 && ` · อีก ${done.noAccess} ที่อยู่ในส่วนที่คุณไม่มีสิทธิ์แก้ (เช่น ดีไซน์) — ให้หัวหน้าเปลี่ยน`}
              <br />
              ลูกค้ายังเห็นรูปเดิมจนกว่าจะกด “เผยแพร่” ที่แท็บเหล่านี้:
            </span>
            <button type="button" onClick={() => setDone(null)} className="text-amber-700 hover:text-amber-900" aria-label="ปิด">
              ✕
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...new Set([...done.changed.map((c) => TAB_OF[c.kind]), ...(done.readOnly ? (["newdrops"] as const) : [])])].map((t) => (
              <button key={t} type="button" onClick={() => onGo({ tab: t })} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-amber-800 hover:border-amber-500">
                {t === "newdrops" ? "ไปเปลี่ยนเองที่" : "ไปเผยแพร่ที่"} {TAB_NAME[t]} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PLACES.map((p) => (
          <button key={p.k} type="button" onClick={() => setPlace(p.k)} className={chip(place === p.k)}>
            {p.l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.k}
            type="button"
            onClick={() => setChips((cur) => {
              const n = new Set(cur);
              if (n.has(c.k)) n.delete(c.k);
              else n.add(c.k);
              return n;
            })}
            className={chip(chips.has(c.k))}
          >
            {c.l}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={withProducts} onChange={(e) => setWithProducts(e.target.checked)} />
          รวมรูปสินค้าที่วางในหน้า
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 ค้นชื่อไฟล์ / ที่ใช้" className="ml-auto w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:w-56" />
      </div>

      {!shown.length ? (
        <EmptyState icon="🗂" title={pool.length ? "ไม่พบรูปตามตัวกรอง" : "ยังไม่มีรูปที่ใส่เองบนเว็บ"} hint={pool.length ? "ลองเอาตัวกรองออก หรือเปลี่ยนคำค้น" : "รูปที่ใส่ใน Section หน้าแรก / หน้าเว็บ / เมนู / โลโก้ จะมาโผล่ที่นี่เอง"} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          {/* การ์ดรูป */}
          <div className="grid content-start gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {shown.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setSelKey(i.key)}
                className={`relative overflow-hidden rounded-xl border bg-white text-left transition ${sel?.key === i.key ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400"}`}
              >
                <Thumb img={i} />
                <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                  {i.kind === "video" && <span className="rounded bg-slate-900/80 px-1.5 text-[10px] text-white">▶ วิดีโอ</span>}
                  {isHeavy(i) && <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">⚠ หนัก</span>}
                  {i.product && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-800">รูปสินค้า</span>}
                  {!i.uses.some((u) => u.live) && <span className="rounded bg-amber-50 px-1.5 text-[10px] text-amber-700">ร่าง</span>}
                </span>
                <span className="block px-2 py-1.5 text-[11px] leading-snug text-slate-500">
                  <b className="block truncate text-xs font-medium text-slate-800">{i.file?.name || mediaFileName(i.key)}</b>
                  {fileLine(i) && <span className="block truncate">{fileLine(i)}</span>}
                  ใช้ {i.uses.length} ที่{i.kind === "image" && !i.alt ? " · ไม่มีคำอธิบาย" : ""}
                </span>
              </button>
            ))}
          </div>

          {/* รายละเอียดรูปที่เลือก */}
          {sel && (
            <div className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-2" data-site-image-detail>
              <div className="overflow-hidden rounded-lg border border-slate-100">
                {sel.kind === "video" ? (
                  <video key={sel.key} src={`/api/r2-image?key=${encodeURIComponent(sel.key)}`} className="max-h-56 w-full bg-black" controls muted playsInline preload="metadata" />
                ) : (
                  <Thumb img={sel} h={200} />
                )}
              </div>
              <div className="text-[11px] text-slate-500 break-all">
                {sel.file?.name ? `${sel.file.name} · ` : ""}
                {fileLine(sel) || "ไม่ทราบขนาดไฟล์"} · {sel.key}
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold text-slate-800">ใช้อยู่ {sel.uses.length} ที่</div>
                <ul className="divide-y divide-slate-100 text-xs">
                  {sel.uses.map((u, n) => {
                    const pv = previewUrl(u);
                    return (
                      <li key={n} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                        <span className="min-w-0 flex-1 text-slate-700">{u.where}</span>
                        <UseState u={u} />
                        {pv && (
                          <a href={pv} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800" title="ดูหน้านี้ในพรีวิว (เห็นร่าง)">
                            👁
                          </a>
                        )}
                        <button type="button" onClick={() => goEdit(u)} className="text-blue-600 hover:text-blue-800">
                          {u.editable ? "✏️ ไปแก้" : `ไปที่ ${TAB_NAME.newdrops}`} →
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {sel.kind === "image" && (
                <div>
                  <label className="text-xs text-slate-600" htmlFor="site-img-alt">
                    📝 คำอธิบายรูป <span className="text-slate-400">(ช่วย Google ค้นเจอ + โปรแกรมอ่านจอ · ขึ้นเว็บทันที)</span>
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      id="site-img-alt"
                      value={alt}
                      maxLength={IMAGE_ALT_MAX}
                      onChange={(e) => setAlt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && alt.trim() !== sel.alt && void saveAlt()}
                      placeholder="เช่น กระเป๋าหนังสีน้ำตาลวางบนโต๊ะไม้"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                    <button type="button" disabled={busy || alt.trim() === sel.alt} onClick={() => void saveAlt()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                      บันทึก
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={busy || !editableUses.length} onClick={() => setSwap({ to: null })} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40" title={editableUses.length ? "" : "รูปนี้อยู่แค่ในชุดมาใหม่ — เปลี่ยนที่แท็บ 🆕 มาใหม่"}>
                  🔄 เปลี่ยนรูปนี้ทุกที่ ({editableUses.length})
                </button>
                {sel.kind === "image" && (
                  <button type="button" disabled={busy || !editableUses.length} onClick={() => setMkSet({ name: "" })} className={btn} title="ผูกทุกที่เข้าชุดรูปกลาง — ต่อไปเปลี่ยนรูป/ตั้งเวลาเปลี่ยนที่แท็บ 🖼 ชุดรูป">
                    🔗 ทำเป็นชุดรูปกลาง
                  </button>
                )}
                <a href={`/api/r2-image?key=${encodeURIComponent(sel.key)}`} target="_blank" rel="noreferrer" className={btn}>
                  ⬇ เปิดไฟล์เต็ม
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🔄 เปลี่ยนรูปทุกที่ */}
      {sel && swap && (
        <ERPModal
          open
          onClose={() => setSwap(null)}
          title={`🔄 เปลี่ยน${sel.kind === "video" ? "วิดีโอ" : "รูป"}นี้ทุกที่`}
          description="ลงร่างก่อน — ลูกค้ายังเห็นรูปเดิมจนกว่าจะกดเผยแพร่ที่แท็บนั้น"
          size="md"
          hasUnsavedChanges={!!swap.to}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSwap(null)} className={btn}>
                ยกเลิก
              </button>
              <button type="button" disabled={busy || !swap.to} onClick={() => void doSwap()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                {busy ? "กำลังเปลี่ยน…" : `เปลี่ยน ${editableUses.length} ที่ (ลงร่าง)`}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
              <div>
                <div className="mb-1 text-[11px] text-slate-500">รูปเดิม</div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Thumb img={sel} h={80} />
                </div>
              </div>
              <div>
                {sel.kind === "video" ? (
                  <WebsiteVideoField value={swap.to} onChange={(k) => setSwap({ to: k })} slot="วิดีโอใหม่" />
                ) : (
                  <ImageUploadField label="รูปใหม่" hint="อัปโหลด · เลือกจากคลัง · หรือ 🔗 ใช้ชุดรูปกลาง" value={swap.to} onChange={(k) => setSwap({ to: k })} height={80} />
                )}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div className="mb-1 font-medium text-slate-700">จะเปลี่ยนที่:</div>
              <ul className="list-inside list-disc space-y-0.5">
                {editableUses.map((u, n) => (
                  <li key={n}>{u.where}</li>
                ))}
              </ul>
              {readOnlyUses.length > 0 && <p className="mt-1.5 text-amber-700">อีก {readOnlyUses.length} ที่อยู่ในชุดมาใหม่ — ต้องเปลี่ยนเองที่แท็บ 🆕 มาใหม่</p>}
            </div>
          </div>
        </ERPModal>
      )}

      {/* 🔗 ทำเป็นชุดรูปกลาง */}
      {sel && mkSet && (
        <ERPModal
          open
          onClose={() => setMkSet(null)}
          title="🔗 ทำเป็นชุดรูปกลาง"
          description="ทุกที่ที่ใช้รูปนี้จะผูกกับชุดเดียวกัน — ต่อไปเปลี่ยนรูปครั้งเดียว ทุกที่เปลี่ยนตาม (ปรับ/ตั้งเวลาได้ที่แท็บ 🖼 ชุดรูป)"
          size="sm"
          hasUnsavedChanges={!!mkSet.name.trim()}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMkSet(null)} className={btn}>
                ยกเลิก
              </button>
              <button type="button" disabled={busy || !mkSet.name.trim()} onClick={() => void doMakeSet()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                {busy ? "กำลังสร้าง…" : `สร้างชุด + ผูก ${editableUses.length} ที่ (ลงร่าง)`}
              </button>
            </div>
          }
        >
          <label className="block text-xs text-slate-600">
            ชื่อชุด
            <input autoFocus value={mkSet.name} maxLength={60} onChange={(e) => setMkSet({ name: e.target.value })} placeholder="เช่น แบนเนอร์หน้าแรก" className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
        </ERPModal>
      )}
    </div>
  );
}
