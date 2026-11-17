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
import { useT } from "@/components/i18n";
import { tr, getLang } from "@/lib/lang";
import { labelEn } from "@/lib/website-admin-en";

type FileInfo = { name: string; size: number | null; w: number | null; h: number | null };
type Img = SiteImage & { alt: string; file: FileInfo | null };
/** ไปแก้ที่แท็บ (หน้าแรก = เปิด Section นั้นให้เลย) */
export type SiteImageGo = { tab: "layout" | "pages" | "design" | "newdrops"; blockId?: string | null };
type Changed = { kind: SiteDocKind; id: string; label: string; count: number };

const TAB_OF: Record<SiteDocKind, SiteImageGo["tab"]> = { home: "layout", page: "pages", theme: "design", drop: "newdrops" };
const TAB_NAME: Record<SiteImageGo["tab"], string> = {
  get layout() { return tr("🧱 หน้าแรก", "🧱 Home page"); },
  get pages() { return tr("📄 หน้าเว็บ", "📄 Web pages"); },
  get design() { return tr("🎨 ดีไซน์", "🎨 Design"); },
  get newdrops() { return tr("🆕 มาใหม่", "🆕 New drops"); },
};
/** ป้าย "ใช้อยู่ที่ไหน" (server ต่อเป็น "ส่วน › ชิ้นที่ 2 › มือถือ") → แปลทีละท่อนตอนแสดง (โหมด EN) */
function whereEn(s: string): string {
  if (getLang() !== "en" || !s) return s;
  return s
    .split(" › ")
    .map((seg) => {
      let m = /^(หน้า|มาใหม่) (“.*”)$/.exec(seg);
      if (m) return `${m[1] === "หน้า" ? "Page" : "New drop"} ${m[2] === "“ไม่มีชื่อ”" ? "“Untitled”" : m[2]}`;
      m = /^หน้าพิเศษ \((.*)\)$/.exec(seg);
      if (m) return `Special page (${m[1]})`;
      const whole = labelEn(seg);
      if (whole !== seg) return whole;
      m = /^(.+?) (\S+)$/.exec(seg);
      if (m) {
        const head = labelEn(m[1]);
        if (head !== m[1]) return `${head} ${m[2]}`;
      }
      return seg;
    })
    .join(" › ");
}
const PLACES: { k: "all" | SiteDocKind; l: string }[] = [
  { k: "all", get l() { return tr("ทุกที่", "Everywhere"); } },
  { k: "home", get l() { return tr("หน้าแรก", "Home page"); } },
  { k: "page", get l() { return tr("หน้าอื่น", "Other pages"); } },
  { k: "theme", get l() { return tr("ดีไซน์ (เมนู · โลโก้ · หัว/ท้ายเว็บ)", "Design (menu · logo · header/footer)"); } },
  { k: "drop", get l() { return tr("ชุดมาใหม่", "New drops"); } },
];
type Chip = "noAlt" | "multi" | "video" | "heavy" | "draftOnly";
const CHIPS: { k: Chip; l: string }[] = [
  { k: "noAlt", get l() { return tr("ยังไม่มีคำอธิบาย", "No description"); } },
  { k: "multi", get l() { return tr("ใช้หลายที่", "Used in several places"); } },
  { k: "heavy", get l() { return tr("⚠ ไฟล์หนัก", "⚠ Large file"); } },
  { k: "video", get l() { return tr("▶ วิดีโอ", "▶ Video"); } },
  { k: "draftOnly", get l() { return tr("📝 อยู่แค่ในร่าง", "📝 Only in drafts"); } },
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
  const t = useT();
  if (u.live && u.draft) return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{t("บนเว็บ", "Live")}</span>;
  if (u.draft) return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{t("ร่าง · ยังไม่ขึ้นเว็บ", "Draft · not live yet")}</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t("เอาออกในร่างแล้ว", "Removed in draft")}</span>;
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
  const t = useT();
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
        setError(e.message || tr("โหลดรูปไม่สำเร็จ", "Couldn't load images"));
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
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Couldn't save"));
      return j;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Couldn't save"));
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
    toast.success(j.alt ? t("บันทึกคำอธิบายแล้ว — ขึ้นเว็บแล้ว", "Description saved — now live") : t("ลบคำอธิบายแล้ว", "Description removed"));
  };

  const doSwap = async () => {
    if (!sel || !swap?.to) return;
    const j = await patch({ action: "replace", from: sel.key, to: swap.to });
    if (!j) return;
    setSwap(null);
    setDone({ what: t(`เปลี่ยน “${mediaFileName(sel.key)}”`, `Replaced “${mediaFileName(sel.key)}”`), changed: j.changed ?? [], readOnly: j.readOnly ?? 0, noAccess: j.noAccess ?? 0 });
    toast.success(t("ลงร่างแล้ว — ลูกค้ายังเห็นรูปเดิมจนกว่าจะกดเผยแพร่", "Saved to draft — customers see the old image until you publish"));
    load();
  };

  const doMakeSet = async () => {
    if (!sel || !mkSet) return;
    const j = await patch({ action: "make-set", key: sel.key, name: mkSet.name });
    if (!j) return;
    setMkSet(null);
    notifyImageSetsChanged();
    setDone({ what: t(`ผูกชุดรูป “${j.set?.name ?? mkSet.name}”`, `Linked image set “${j.set?.name ?? mkSet.name}”`), changed: j.changed ?? [], readOnly: j.readOnly ?? 0, noAccess: j.noAccess ?? 0 });
    toast.success(t("สร้างชุดรูปแล้ว — ปรับรูป/ตั้งเวลาต่อได้ที่แท็บ 🖼 ชุดรูป", "Image set created — adjust images/schedule in the 🖼 Image sets tab"));
    load();
  };

  const previewUrl = (u: SiteImageUse) => (site.siteUrl ? `${site.siteUrl}${withPreviewKey(withPreviewParam(u.path), site.previewKey)}` : null);
  const goEdit = (u: SiteImageUse) => onGo({ tab: TAB_OF[u.kind], blockId: u.kind === "home" ? u.blockId : null });
  const editableUses = sel?.uses.filter((u) => u.editable && u.draft) ?? [];
  const readOnlyUses = sel?.uses.filter((u) => !u.editable) ?? [];

  if (error) return <ErrorState title={t("โหลดรูปบนเว็บไม่สำเร็จ", "Couldn't load site images")} hint={error} onRetry={load} />;
  if (!images) return <LoadingState label={t("กำลังรวบรวมรูปจากทุกหน้า…", "Collecting images from every page…")} />;

  return (
    <div className="space-y-3" data-site-images>
      <p className="text-sm text-slate-500">{t("รูปและวิดีโอทุกรูปที่ใส่เองบนเว็บ (ไม่รวมรูปสินค้า) — ดูว่าใช้ที่ไหน · เปลี่ยนทุกที่ทีเดียว · ใส่คำอธิบายรูป", "Every image and video you added to the site (excluding product images) — see where each is used · replace everywhere at once · add descriptions")}</p>

      {/* ตัวเลขสรุป */}
      <div className="flex flex-wrap gap-2">
        {[
          [stats.n, t("รูป/วิดีโอที่ใส่เอง", "Images/videos added")],
          [stats.uses, t("จุดที่ใช้บนเว็บ", "Places used on the site")],
          [stats.noAlt, t("รูปที่ยังไม่มีคำอธิบาย", "Images without description")],
          [stats.heavy, t("ไฟล์หนัก (โหลดช้า)", "Large files (slow to load)")],
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
              📝 {done.what} — {t("ลงร่างแล้ว", "saved to draft")} {done.changed.map((c) => `${whereEn(c.label)} (${c.count})`).join(" · ") || t("ไม่มีที่ที่แก้ได้", "no editable places")}
              {done.readOnly > 0 && t(` · อีก ${done.readOnly} ที่อยู่ในชุดมาใหม่ ต้องเปลี่ยนเองที่แท็บ 🆕 มาใหม่`, ` · ${done.readOnly} more in new drops — change them in the 🆕 New drops tab`)}
              {/* 👷 ติ๊กหัวข้อแท็บ: ไม่แตะร่างดีไซน์/หน้าที่ไม่มีสิทธิ์ */}
              {(done.noAccess ?? 0) > 0 && t(` · อีก ${done.noAccess} ที่อยู่ในส่วนที่คุณไม่มีสิทธิ์แก้ (เช่น ดีไซน์) — ให้หัวหน้าเปลี่ยน`, ` · ${done.noAccess} more in areas you can't edit (e.g. Design) — ask your lead`)}
              <br />
              {t("ลูกค้ายังเห็นรูปเดิมจนกว่าจะกด “เผยแพร่” ที่แท็บเหล่านี้:", "Customers see the old image until you press “Publish” in these tabs:")}
            </span>
            <button type="button" onClick={() => setDone(null)} className="text-amber-700 hover:text-amber-900" aria-label={t("ปิด", "Close")}>
              ✕
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...new Set([...done.changed.map((c) => TAB_OF[c.kind]), ...(done.readOnly ? (["newdrops"] as const) : [])])].map((tab) => (
              <button key={tab} type="button" onClick={() => onGo({ tab })} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-amber-800 hover:border-amber-500">
                {tab === "newdrops" ? t("ไปเปลี่ยนเองที่", "Change it in") : t("ไปเผยแพร่ที่", "Publish in")} {TAB_NAME[tab]} →
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
          {t("รวมรูปสินค้าที่วางในหน้า", "Include product images placed on pages")}
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("🔎 ค้นชื่อไฟล์ / ที่ใช้", "🔎 Search file name / place")} className="ml-auto w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:w-56" />
      </div>

      {!shown.length ? (
        <EmptyState icon="🗂" title={pool.length ? t("ไม่พบรูปตามตัวกรอง", "No images match the filters") : t("ยังไม่มีรูปที่ใส่เองบนเว็บ", "No images added to the site yet")} hint={pool.length ? t("ลองเอาตัวกรองออก หรือเปลี่ยนคำค้น", "Try removing filters or changing the search") : t("รูปที่ใส่ใน Section หน้าแรก / หน้าเว็บ / เมนู / โลโก้ จะมาโผล่ที่นี่เอง", "Images added to home page sections / web pages / menu / logo will show up here")} />
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
                  {i.kind === "video" && <span className="rounded bg-slate-900/80 px-1.5 text-[10px] text-white">{t("▶ วิดีโอ", "▶ Video")}</span>}
                  {isHeavy(i) && <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">{t("⚠ หนัก", "⚠ Large")}</span>}
                  {i.product && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-800">{t("รูปสินค้า", "Product image")}</span>}
                  {!i.uses.some((u) => u.live) && <span className="rounded bg-amber-50 px-1.5 text-[10px] text-amber-700">{t("ร่าง", "Draft")}</span>}
                </span>
                <span className="block px-2 py-1.5 text-[11px] leading-snug text-slate-500">
                  <b className="block truncate text-xs font-medium text-slate-800">{i.file?.name || mediaFileName(i.key)}</b>
                  {fileLine(i) && <span className="block truncate">{fileLine(i)}</span>}
                  {t(`ใช้ ${i.uses.length} ที่`, `Used in ${i.uses.length}`)}{i.kind === "image" && !i.alt ? t(" · ไม่มีคำอธิบาย", " · no description") : ""}
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
                {fileLine(sel) || t("ไม่ทราบขนาดไฟล์", "Unknown file size")} · {sel.key}
              </div>

              <div>
                <div className="mb-1 text-sm font-semibold text-slate-800">{t(`ใช้อยู่ ${sel.uses.length} ที่`, `Used in ${sel.uses.length} places`)}</div>
                <ul className="divide-y divide-slate-100 text-xs">
                  {sel.uses.map((u, n) => {
                    const pv = previewUrl(u);
                    return (
                      <li key={n} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                        <span className="min-w-0 flex-1 text-slate-700">{whereEn(u.where)}</span>
                        <UseState u={u} />
                        {pv && (
                          <a href={pv} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-800" title={t("ดูหน้านี้ในพรีวิว (เห็นร่าง)", "View this page in preview (shows draft)")}>
                            👁
                          </a>
                        )}
                        <button type="button" onClick={() => goEdit(u)} className="text-blue-600 hover:text-blue-800">
                          {u.editable ? t("✏️ ไปแก้", "✏️ Edit") : t(`ไปที่ ${TAB_NAME.newdrops}`, `Go to ${TAB_NAME.newdrops}`)} →
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {sel.kind === "image" && (
                <div>
                  <label className="text-xs text-slate-600" htmlFor="site-img-alt">
                    {t("📝 คำอธิบายรูป", "📝 Image description")} <span className="text-slate-400">{t("(ช่วย Google ค้นเจอ + โปรแกรมอ่านจอ · ขึ้นเว็บทันที)", "(helps Google + screen readers · goes live immediately)")}</span>
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      id="site-img-alt"
                      value={alt}
                      maxLength={IMAGE_ALT_MAX}
                      onChange={(e) => setAlt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && alt.trim() !== sel.alt && void saveAlt()}
                      placeholder={t("เช่น กระเป๋าหนังสีน้ำตาลวางบนโต๊ะไม้", "e.g. Brown leather bag on a wooden table")}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                    <button type="button" disabled={busy || alt.trim() === sel.alt} onClick={() => void saveAlt()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                      {t("บันทึก", "Save")}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={busy || !editableUses.length} onClick={() => setSwap({ to: null })} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40" title={editableUses.length ? "" : t("รูปนี้อยู่แค่ในชุดมาใหม่ — เปลี่ยนที่แท็บ 🆕 มาใหม่", "This image is only in new drops — change it in the 🆕 New drops tab")}>
                  {t(`🔄 เปลี่ยนรูปนี้ทุกที่ (${editableUses.length})`, `🔄 Replace everywhere (${editableUses.length})`)}
                </button>
                {sel.kind === "image" && (
                  <button type="button" disabled={busy || !editableUses.length} onClick={() => setMkSet({ name: "" })} className={btn} title={t("ผูกทุกที่เข้าชุดรูปกลาง — ต่อไปเปลี่ยนรูป/ตั้งเวลาเปลี่ยนที่แท็บ 🖼 ชุดรูป", "Link every place to a shared image set — then change/schedule images in the 🖼 Image sets tab")}>
                    {t("🔗 ทำเป็นชุดรูปกลาง", "🔗 Make shared image set")}
                  </button>
                )}
                <a href={`/api/r2-image?key=${encodeURIComponent(sel.key)}`} target="_blank" rel="noreferrer" className={btn}>
                  {t("⬇ เปิดไฟล์เต็ม", "⬇ Open full file")}
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
          title={sel.kind === "video" ? t("🔄 เปลี่ยนวิดีโอนี้ทุกที่", "🔄 Replace this video everywhere") : t("🔄 เปลี่ยนรูปนี้ทุกที่", "🔄 Replace this image everywhere")}
          description={t("ลงร่างก่อน — ลูกค้ายังเห็นรูปเดิมจนกว่าจะกดเผยแพร่ที่แท็บนั้น", "Saved to draft first — customers see the old image until you publish in that tab")}
          size="md"
          hasUnsavedChanges={!!swap.to}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSwap(null)} className={btn}>
                {t("ยกเลิก", "Cancel")}
              </button>
              <button type="button" disabled={busy || !swap.to} onClick={() => void doSwap()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                {busy ? t("กำลังเปลี่ยน…", "Replacing…") : t(`เปลี่ยน ${editableUses.length} ที่ (ลงร่าง)`, `Replace in ${editableUses.length} places (draft)`)}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
              <div>
                <div className="mb-1 text-[11px] text-slate-500">{t("รูปเดิม", "Current image")}</div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <Thumb img={sel} h={80} />
                </div>
              </div>
              <div>
                {sel.kind === "video" ? (
                  <WebsiteVideoField value={swap.to} onChange={(k) => setSwap({ to: k })} slot={t("วิดีโอใหม่", "New video")} />
                ) : (
                  <ImageUploadField label={t("รูปใหม่", "New image")} hint={t("อัปโหลด · เลือกจากคลัง · หรือ 🔗 ใช้ชุดรูปกลาง", "Upload · pick from library · or 🔗 use a shared image set")} value={swap.to} onChange={(k) => setSwap({ to: k })} height={80} />
                )}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <div className="mb-1 font-medium text-slate-700">{t("จะเปลี่ยนที่:", "Will replace in:")}</div>
              <ul className="list-inside list-disc space-y-0.5">
                {editableUses.map((u, n) => (
                  <li key={n}>{whereEn(u.where)}</li>
                ))}
              </ul>
              {readOnlyUses.length > 0 && <p className="mt-1.5 text-amber-700">{t(`อีก ${readOnlyUses.length} ที่อยู่ในชุดมาใหม่ — ต้องเปลี่ยนเองที่แท็บ 🆕 มาใหม่`, `${readOnlyUses.length} more in new drops — change them in the 🆕 New drops tab`)}</p>}
            </div>
          </div>
        </ERPModal>
      )}

      {/* 🔗 ทำเป็นชุดรูปกลาง */}
      {sel && mkSet && (
        <ERPModal
          open
          onClose={() => setMkSet(null)}
          title={t("🔗 ทำเป็นชุดรูปกลาง", "🔗 Make shared image set")}
          description={t("ทุกที่ที่ใช้รูปนี้จะผูกกับชุดเดียวกัน — ต่อไปเปลี่ยนรูปครั้งเดียว ทุกที่เปลี่ยนตาม (ปรับ/ตั้งเวลาได้ที่แท็บ 🖼 ชุดรูป)", "Every place using this image links to one set — change it once and every place follows (adjust/schedule in the 🖼 Image sets tab)")}
          size="sm"
          hasUnsavedChanges={!!mkSet.name.trim()}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMkSet(null)} className={btn}>
                {t("ยกเลิก", "Cancel")}
              </button>
              <button type="button" disabled={busy || !mkSet.name.trim()} onClick={() => void doMakeSet()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                {busy ? t("กำลังสร้าง…", "Creating…") : t(`สร้างชุด + ผูก ${editableUses.length} ที่ (ลงร่าง)`, `Create set + link ${editableUses.length} places (draft)`)}
              </button>
            </div>
          }
        >
          <label className="block text-xs text-slate-600">
            {t("ชื่อชุด", "Set name")}
            <input autoFocus value={mkSet.name} maxLength={60} onChange={(e) => setMkSet({ name: e.target.value })} placeholder={t("เช่น แบนเนอร์หน้าแรก", "e.g. Home page banner")} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
        </ERPModal>
      )}
    </div>
  );
}
