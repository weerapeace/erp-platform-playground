"use client";

/**
 * 🖼 แท็บชุดรูปกลาง (ERP › เว็บไซต์ › ร้าน › 🖼 ชุดรูป) — เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกชุดนี้เปลี่ยนตาม (คอม + มือถือ)
 * ผูก: ช่องรูปทุกช่องในแท็บหน้าแรก / หน้าเว็บ / ดีไซน์ (ของกลาง ImageUploadField) มีปุ่ม "🔗 ใช้ชุดรูป"
 * ที่นี่: ตั้งรูปคอม/มือถือ · จุดสำคัญของรูป (ครอปทุกที่ไม่ให้หน้าโดนตัด) · ลิงก์ของชุด · ⏰ ตั้งเวลาเปลี่ยน · ย้อนรูปก่อนหน้า · ดูว่าใช้ที่ไหนบ้าง
 * แก้แล้วขึ้นเว็บจริงทันที (ไม่ต้องเผยแพร่) — API /api/website/image-sets · กฎ lib/website-image-sets.ts
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { getLang } from "@/lib/lang";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ImageSetsContext, notifyImageSetsChanged } from "@/components/website-image-sets-context";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { effectiveVersion, isEmptyVersion, type ImageSet, type ImageSetUse, type ImageSetVersion } from "@/lib/website-image-sets";

type SetRow = ImageSet & { updatedAt?: string | null; updatedBy?: string | null };

const card = "rounded-xl border border-slate-200 bg-white p-4";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50";
const fmt = (iso: string) => new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
/** "YYYY-MM-DDTHH:mm" ของ input datetime-local (เวลาเครื่อง) → ISO */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
/** ลิงก์หน้าเว็บ + ?preview=1 (ก่อน #ส่วนของหน้า) */
const withPreviewParam = (path: string) => {
  const at = path.indexOf("#");
  const base = at >= 0 ? path.slice(0, at) : path;
  return `${base}${base.includes("?") ? "&" : "?"}preview=1${at >= 0 ? path.slice(at) : ""}`;
};

/** จุดสำคัญของรูป: คลิก/ลากบนรูป = ตั้งจุด · ใต้รูปเห็นตัวอย่างครอป 3 แบบ (กว้าง · สี่เหลี่ยม · แนวตั้ง) */
function FocalPicker({ imageKey, x, y, onChange, label }: { imageKey: string | null; x: number; y: number; onChange: (x: number, y: number) => void; label: string }) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const url = keyUrl(imageKey, 900);
  if (!url) return null;
  const at = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))) };
  };
  const cur = drag ?? { x, y };
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-slate-500">📍 {t("จุดสำคัญ", "Focal point")} — {label} {t("(คลิก/ลากไปที่หน้าคนหรือสินค้า)", "(click/drag onto the face or product)")}</p>
      <div
        ref={boxRef}
        className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-200"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const p = at(e);
          if (p) setDrag(p);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = at(e);
          if (p) setDrag(p);
        }}
        onPointerUp={() => {
          if (drag) onChange(drag.x, drag.y);
          setDrag(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} className="block max-h-56 w-auto max-w-full" />
        <span className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pink-500/70 shadow" style={{ left: `${cur.x}%`, top: `${cur.y}%` }} />
      </div>
      <div className="flex items-end gap-2">
        {[
          { r: "21 / 9", w: 126, l: t("แบนเนอร์กว้าง", "Wide banner") },
          { r: "1 / 1", w: 54, l: t("สี่เหลี่ยม", "Square") },
          { r: "4 / 5", w: 48, l: t("แนวตั้ง", "Portrait") },
        ].map((f) => (
          <div key={f.l} className="text-center">
            <div className="overflow-hidden rounded border border-slate-200 bg-slate-100" style={{ width: f.w, aspectRatio: f.r }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${cur.x}% ${cur.y}%` }} />
            </div>
            <span className="text-[10px] text-slate-400">{f.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** รูปคอม + มือถือ ของรุ่นหนึ่ง (ไม่มีปุ่มชุดรูปซ้อนในนี้) */
function VersionImages({ v, onChange }: { v: ImageSetVersion; onChange: (p: Partial<ImageSetVersion>) => void }) {
  const t = useT();
  return (
    <ImageSetsContext.Provider value={null}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageUploadField label={t("🖥 รูปคอม", "🖥 Desktop image")} hint={t("แนวนอน · กว้างอย่างน้อย 1600px", "Landscape · at least 1600px wide")} value={v.desk} onChange={(k) => onChange({ desk: k, fx: 50, fy: 50 })} height={90} />
        <ImageUploadField label={t("📱 รูปมือถือ", "📱 Mobile image")} hint={t("ไม่ใส่ = ใช้รูปคอม", "Empty = use desktop image")} value={v.mob} onChange={(k) => onChange({ mob: k, mfx: 50, mfy: 50 })} height={90} />
      </div>
    </ImageSetsContext.Provider>
  );
}

export function WebsiteImageSetsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const t = useT();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [uses, setUses] = useState<ImageSetUse[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [cats, setCats] = useState<{ key: string; label: string; parent?: string | null }[]>([]);
  const [draft, setDraft] = useState<{ at: string; until: string; v: ImageSetVersion } | null>(null);
  // 👁 พรีวิวทุกที่ (เว็บจริง ?preview=1 = เห็นร่างของชุด)
  const [site, setSite] = useState<{ siteUrl: string | null; previewKey: string | null }>({ siteUrl: null, previewKey: null });
  const [pv, setPv] = useState<{ path: string; device: "desktop" | "mobile" } | null>(null);
  // ร่าง "ไม่มีรูป" → ขึ้นเว็บต้องยืนยัน (ทุกที่ที่ผูกจะไม่มีรูป)
  const [askEmpty, setAskEmpty] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/website/image-sets?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j: { sets?: SetRow[]; uses?: ImageSetUse[]; shop?: { siteUrl: string | null; previewKey: string | null }; error?: string }) => {
        if (j.error) throw new Error(j.error);
        setSets(j.sets ?? []);
        setUses(j.uses ?? []);
        if (j.shop) setSite(j.shop);
        setSelId((cur) => cur ?? j.sets?.[0]?.id ?? null);
      })
      .catch((e: Error) => {
        setSets([]);
        toast.error(e.message || t("โหลดชุดรูปไม่สำเร็จ", "Could not load image sets"));
      });
  }, [shopSlug, toast, t]);
  useEffect(load, [load]);
  // หมวดสินค้าของร้าน (ตัวเลือกลิงก์ "ไปหน้าหมวด")
  useEffect(() => {
    fetch(`/api/public/storefront/site?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j: { categories?: { key: string; label: string; parent?: string | null }[] }) => setCats(j.categories ?? []))
      .catch(() => {});
  }, [shopSlug]);
  const linkCtx = useMemo(() => ({ shopSlug, shopId, categories: cats }), [shopSlug, shopId, cats]);

  const sel = sets?.find((s) => s.id === selId) ?? null;
  const usesOf = (id: string) => uses.filter((u) => u.setId === id);

  const patch = async (body: Record<string, unknown>, ok = t("บันทึกแล้ว — ขึ้นเว็บจริงทันที", "Saved — live now")) => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/image-sets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, id: sel.id, ...body }) });
      const j = (await r.json()) as { set?: SetRow; error?: string };
      if (!r.ok || !j.set) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      setSets((cur) => (cur ?? []).map((s) => (s.id === j.set!.id ? { ...s, ...j.set! } : s)));
      notifyImageSetsChanged();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  // 📝 แก้รูป/จุดสำคัญ = เป็นร่างก่อน (เว็บจริงยังเห็นรูปเดิม) → ดูตัวอย่างทุกที่ → "ใช้รูปนี้"
  const work = sel ? sel.draft ?? sel.cur : null;
  const setWork = (p: Partial<ImageSetVersion>) => {
    if (!sel || !work) return;
    const v = { ...work, ...p };
    void patch({ action: "draft", version: v }, isEmptyVersion(v) && !isEmptyVersion(sel.cur) ? t("เอารูปออกแล้ว (เป็นร่าง) — เว็บจริงยังเห็นรูปเดิม จนกว่าจะใส่รูปใหม่หรือกดขึ้นเว็บ", "Image removed (draft) — the live site keeps the old image until you add a new one or publish") : t("เก็บเป็นร่างแล้ว — กด “ใช้รูปนี้” เมื่อพร้อมขึ้นเว็บ", "Saved as draft — press “Use this image” when ready to go live"));
  };
  const draftEmpty = !!sel?.draft && isEmptyVersion(sel.draft);
  const publish = () => patch({ action: "publish" }, draftEmpty ? t("เอารูปออกจากเว็บแล้ว — ย้อนได้ด้วยปุ่ม “ย้อนรูปก่อนหน้า”", "Image removed from the website — undo with “Previous image”") : t("ใช้รูปนี้แล้ว — ขึ้นเว็บจริงทุกที่", "Image in use — live everywhere"));
  // นับที่ที่ผูกบนเว็บจริง (ไม่นับร่างของหน้า) — บอกในป๊อปยืนยัน
  const liveUses = (id: string) => new Set(usesOf(id).filter((u) => u.state === "live").map((u) => u.where)).size;

  const create = async () => {
    const name = newName.trim();
    if (!name) return toast.error(t("ตั้งชื่อชุดก่อน เช่น New Arrival", "Name the set first, e.g. New Arrival"));
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/image-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, name }) });
      const j = (await r.json()) as { set?: SetRow; error?: string };
      if (!r.ok || !j.set) throw new Error(j.error || t("สร้างไม่สำเร็จ", "Create failed"));
      setSets((cur) => [...(cur ?? []), j.set!].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setSelId(j.set.id);
      setNewName("");
      notifyImageSetsChanged();
      toast.success(t(`สร้างชุด “${name}” แล้ว — ใส่รูปได้เลย`, `Set “${name}” created — add images now`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!sel || !window.confirm(t(`ลบชุดรูป “${sel.name}”?`, `Delete image set “${sel.name}”?`))) return;
    const r = await apiFetch(`/api/website/image-sets?shop=${encodeURIComponent(shopSlug)}&id=${sel.id}`, { method: "DELETE" });
    const j = (await r.json()) as { error?: string; uses?: ImageSetUse[] };
    if (!r.ok) return toast.error(j.uses?.length ? `${j.error} (${j.uses.map((u) => u.where).join(" · ")})` : j.error || t("ลบไม่สำเร็จ", "Delete failed"));
    setSets((cur) => (cur ?? []).filter((s) => s.id !== sel.id));
    setSelId(null);
    notifyImageSetsChanged();
    toast.success(t("ลบชุดรูปแล้ว", "Image set deleted"));
  };

  if (!sets) return <p className="py-10 text-center text-sm text-slate-400">{t("กำลังโหลดชุดรูป…", "Loading image sets…")}</p>;
  const now = effectiveVersion(sel ?? { cur: { desk: null, mob: null, fx: 50, fy: 50, mfx: 50, mfy: 50 }, queue: [] });
  const onSchedule = sel ? sel.queue.find((q) => Date.parse(q.at) <= Date.now() && (!q.until || Date.parse(q.until) > Date.now())) : null;

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-base font-semibold text-slate-800">🖼 {t("ชุดรูปกลาง", "Image sets")}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {t("เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกชุดนี้เปลี่ยนตาม (คอม + มือถือ) — ผูกได้ที่ช่องรูปทุกช่องในแท็บ 🧱 หน้าแรก / 📄 หน้าเว็บ / 🎨 ดีไซน์ รวมรูปในผืนผ้าใบ (กด", "Change the image once and every place linked to this set follows (desktop + mobile) — link from any image field in the 🧱 Home / 📄 Pages / 🎨 Design tabs, including canvas images (press")} <b>🔗 {t("ใช้ชุดรูป", "Use image set")}</b>) {t("· แก้รูปที่นี่ = เป็นร่างก่อน → 👁 ดูตัวอย่างทุกที่ → ✅ ใช้รูปนี้ (ขึ้นเว็บทุกที่พร้อมกัน)", "· edits here start as a draft → 👁 preview everywhere → ✅ Use this image (goes live everywhere at once)")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* รายชื่อชุด */}
        <div className={`${card} space-y-2 self-start`}>
          {sets.length === 0 && <p className="text-xs text-slate-500">{t("ยังไม่มีชุดรูป — ตั้งชื่อด้านล่างแล้วกดสร้าง", "No image sets yet — enter a name below and press Create")}</p>}
          {sets.map((s) => {
            const thumb = keyUrl(effectiveVersion(s).desk ?? effectiveVersion(s).mob, 160);
            const n = new Set(usesOf(s.id).map((u) => u.where)).size;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelId(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left ${s.id === selId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-slate-400">{t("ยังไม่มีรูป", "No image")}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{s.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {n ? t(`ใช้ ${n} ที่`, `Used in ${n}`) : t("ยังไม่ได้ผูก", "Not linked")}
                    {s.queue.length ? ` · ⏰ ${s.queue.length}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} maxLength={60} placeholder={t("ชื่อชุดใหม่ เช่น New Arrival", "New set name, e.g. New Arrival")} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            <button type="button" onClick={() => void create()} disabled={busy} className={btn}>
              ＋ {t("สร้าง", "Create")}
            </button>
          </div>
        </div>

        {/* ชุดที่เลือก */}
        {!sel ? (
          <div className={`${card} text-sm text-slate-400`}>{t("เลือกชุดทางซ้าย หรือสร้างชุดใหม่", "Pick a set on the left or create a new one")}</div>
        ) : (
          <div className="space-y-4">
            <div className={`${card} space-y-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  key={sel.id}
                  defaultValue={sel.name}
                  maxLength={60}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== sel.name && void patch({ action: "update", name: e.target.value.trim() }, t("เปลี่ยนชื่อแล้ว", "Renamed"))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold"
                />
                <button type="button" onClick={() => void patch({ action: "undo" }, t("ย้อนกลับเป็นรูปก่อนหน้าแล้ว", "Reverted to the previous image"))} disabled={busy || !sel.history.length} className={btn} title={t("กลับไปใช้รูปก่อนหน้า", "Go back to the previous image")}>
                  ↩ {t("ย้อนรูปก่อนหน้า", "Previous image")}
                </button>
                <button type="button" onClick={() => void remove()} className={`${btn} border-red-200 text-red-600 hover:border-red-400`}>
                  {t("ลบชุด", "Delete set")}
                </button>
              </div>
              {onSchedule && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">⏰ {t("ตอนนี้เว็บกำลังใช้รูปที่ตั้งเวลาไว้ (ถึง", "The website is using a scheduled image now (until")} {onSchedule.until ? fmt(onSchedule.until) : "—"}) {t("— หมดเวลาแล้วกลับเป็นรูปด้านล่าง", "— afterwards it goes back to the image below")}</p>}
              {/* 📝 ร่าง: เว็บจริงยังเห็นรูปเดิม จนกด "ใช้รูปนี้" */}
              {sel.draft ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <span className="text-xs font-semibold text-amber-800">{draftEmpty ? t("📝 ร่าง: เอารูปออกหมด (ยังไม่ขึ้นเว็บ)", "📝 Draft: all images removed (not live yet)") : t("📝 มีร่างที่ยังไม่ขึ้นเว็บ", "📝 Draft not live yet")}</span>
                  <span className="flex items-center gap-1 text-[11px] text-amber-700">
                    {t("บนเว็บตอนนี้:", "Live now:")}
                    {[sel.cur.desk, sel.cur.mob].map((k, i) => {
                      const thumb = keyUrl(k, 120);
                      return thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={thumb} alt="" className="h-7 w-10 rounded border border-amber-200 object-cover" />
                      ) : null;
                    })}
                  </span>
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setPv({ path: usesOf(sel.id)[0]?.path ?? "/", device: "desktop" })} className={btn}>
                      👁 {t("ดูตัวอย่างทุกที่", "Preview everywhere")}
                    </button>
                    {draftEmpty ? (
                      <button type="button" disabled={busy} onClick={() => setAskEmpty(true)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                        {t("เอารูปออกจากเว็บ", "Remove image from website")}
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void publish()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
                        ✅ {t("ใช้รูปนี้ (ขึ้นเว็บ)", "Use this image (go live)")}
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => void patch({ action: "discard" }, t("ทิ้งร่างแล้ว — กลับไปเป็นรูปบนเว็บ", "Draft discarded — back to the live image"))} className={btn}>
                      {t("ทิ้งร่าง", "Discard draft")}
                    </button>
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{t("เปลี่ยนรูป/จุดสำคัญด้านล่าง = เก็บเป็นร่างก่อน · ดูตัวอย่างทุกที่ แล้วค่อยกด \"ใช้รูปนี้\"", "Changing images/focal points below saves a draft first · preview everywhere, then press \"Use this image\"")}</span>
                  <button type="button" onClick={() => setPv({ path: usesOf(sel.id)[0]?.path ?? "/", device: "desktop" })} className={`${btn} ml-auto`}>
                    👁 {t("ดูทุกที่ที่ใช้ชุดนี้", "View everywhere this set is used")}
                  </button>
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">{sel.draft ? t("📝 ร่าง (ยังไม่ขึ้นเว็บ)", "📝 Draft (not live yet)") : t("รูปตอนนี้", "Current image")}</p>
                <VersionImages v={work!} onChange={setWork} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FocalPicker imageKey={work!.desk} x={work!.fx} y={work!.fy} label={t("รูปคอม", "Desktop image")} onChange={(fx, fy) => setWork({ fx, fy })} />
                <FocalPicker imageKey={work!.mob} x={work!.mfx} y={work!.mfy} label={t("รูปมือถือ", "Mobile image")} onChange={(mfx, mfy) => setWork({ mfx, mfy })} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">🔗 {t("ลิงก์ของชุด (ว่าง = แต่ละที่ใช้ลิงก์ของตัวเอง)", "Set link (empty = each place uses its own link)")}</p>
                  <LinkTargetPicker value={sel.link} onChange={(href) => void patch({ action: "update", link: href }, href ? t("ตั้งลิงก์แล้ว — ทุกที่ที่ผูกจะลิงก์ไปที่นี่", "Link set — every linked place points here") : t("เอาลิงก์ของชุดออกแล้ว", "Set link removed"))} ctx={linkCtx} size="sm" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">{t("คำอธิบายรูป (alt · ช่วย SEO)", "Image description (alt · helps SEO)")}</p>
                  <input
                    key={`alt-${sel.id}`}
                    defaultValue={sel.alt}
                    maxLength={160}
                    placeholder={t("เช่น กระเป๋าคอลเลกชันใหม่", "e.g. New collection bags")}
                    onBlur={(e) => e.target.value.trim() !== sel.alt && void patch({ action: "update", alt: e.target.value.trim() })}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              {sel.history.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">🕘 {t("รูปก่อนหน้า (ล่าสุดอยู่ซ้าย · กด ↩ ย้อนได้)", "Previous images (latest on the left · press ↩ to undo)")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sel.history.map((h, i) => {
                      const thumb = keyUrl(h.desk ?? h.mob, 120);
                      return (
                        <span key={i} title={fmt(h.at)} className="flex h-9 w-14 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ⏰ ตั้งเวลาเปลี่ยน */}
            <div className={`${card} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">⏰ {t("ตั้งเวลาเปลี่ยนรูป", "Schedule image change")}</p>
                {!draft && (
                  <button type="button" onClick={() => setDraft({ at: "", until: "", v: { desk: null, mob: null, fx: 50, fy: 50, mfx: 50, mfy: 50 } })} className={btn}>
                    ＋ {t("ตั้งเวลา", "Schedule")}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">{t("อัปรูปชุดถัดไปไว้ก่อน ถึงเวลาทุกที่เปลี่ยนเอง (ภายใน ~1 นาที) · ใส่ \"กลับรูปเดิมเมื่อ\" = ใช้ชั่วคราว เช่น ช่วง Sale", "Upload the next images ahead of time; everything switches on time (within ~1 min) · set \"Revert at\" for temporary use, e.g. during a sale")}</p>
              {sel.queue.length === 0 && !draft && <p className="text-xs text-slate-400">{t("ยังไม่ได้ตั้งเวลา", "Nothing scheduled")}</p>}
              {sel.queue.map((q) => {
                const thumb = keyUrl(q.desk ?? q.mob, 160);
                return (
                  <div key={q.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1 text-xs text-slate-700">
                      {t("เริ่ม", "Starts")} {fmt(q.at)}
                      {q.until ? ` → ${t("กลับรูปเดิม", "reverts")} ${fmt(q.until)}` : t(" (ใช้ต่อไปเลย)", " (permanent)")}
                      {q.mob ? t(" · มีรูปมือถือ", " · has mobile image") : ""}
                    </span>
                    <button type="button" onClick={() => void patch({ action: "schedule-remove", entryId: q.id }, t("ยกเลิกเวลานี้แล้ว", "Schedule cancelled"))} className="text-[11px] text-red-600 hover:underline">
                      {t("ยกเลิก", "Cancel")}
                    </button>
                  </div>
                );
              })}
              {draft && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] text-slate-600">
                      {t("เริ่มใช้เมื่อ (เวลาไทย)", "Start at (Thai time)")}
                      <input type="datetime-local" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      {t("กลับรูปเดิมเมื่อ (ไม่ใส่ = ใช้ต่อไปเลย)", "Revert at (empty = permanent)")}
                      <input type="datetime-local" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    </label>
                  </div>
                  <VersionImages v={draft.v} onChange={(p) => setDraft({ ...draft, v: { ...draft.v, ...p } })} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FocalPicker imageKey={draft.v.desk} x={draft.v.fx} y={draft.v.fy} label={t("รูปคอม", "Desktop image")} onChange={(fx, fy) => setDraft({ ...draft, v: { ...draft.v, fx, fy } })} />
                    <FocalPicker imageKey={draft.v.mob} x={draft.v.mfx} y={draft.v.mfy} label={t("รูปมือถือ", "Mobile image")} onChange={(mfx, mfy) => setDraft({ ...draft, v: { ...draft.v, mfx, mfy } })} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!draft.at) return toast.error(t("เลือกวันเวลาที่เริ่มใช้ก่อน", "Pick a start date/time first"));
                        if (!draft.v.desk && !draft.v.mob) return toast.error(t("ใส่รูปอย่างน้อย 1 รูป", "Add at least 1 image"));
                        if (draft.until && Date.parse(toIso(draft.until)) <= Date.parse(toIso(draft.at))) return toast.error(t("เวลากลับรูปเดิมต้องหลังเวลาเริ่ม", "Revert time must be after the start time"));
                        const ok = await patch({ action: "schedule-add", entry: { ...draft.v, at: toIso(draft.at), until: draft.until ? toIso(draft.until) : null } }, t("ตั้งเวลาแล้ว — ถึงเวลาทุกที่เปลี่ยนเอง", "Scheduled — everything switches on time"));
                        if (ok) setDraft(null);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {t("บันทึกเวลา", "Save schedule")}
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className={btn}>
                      {t("ยกเลิก", "Cancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ใช้อยู่ที่ไหนบ้าง */}
            <div className={`${card} space-y-2`}>
              <p className="text-sm font-semibold text-slate-800">📍 {t("ใช้อยู่ที่ไหนบ้าง", "Where it's used")}</p>
              {usesOf(sel.id).length === 0 ? (
                <p className="text-xs text-slate-500">{t("ยังไม่ได้ผูกที่ไหน — ไปที่ช่องรูปที่อยากใช้ชุดนี้ (เช่น Banner ในแท็บ 🧱 หน้าแรก · รูปในเมนู/รูปคั่นสินค้า/หน้าขอบคุณ ในแท็บ 🎨 ดีไซน์) แล้วกด 🔗 ใช้ชุดรูป", "Not linked anywhere — go to an image field where you want this set (e.g. a banner in the 🧱 Home tab · menu/product-divider/thank-you images in the 🎨 Design tab) and press 🔗 Use image set")}</p>
              ) : (
                <ul className="space-y-1">
                  {usesOf(sel.id).map((u, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => setPv({ path: u.path, device: "desktop" })} className="flex items-center gap-2 text-left text-xs text-slate-700 hover:text-blue-700" title={t("ดูตัวอย่างที่นี่", "Preview here")}>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${u.state === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.state === "live" ? t("เผยแพร่แล้ว", "Published") : t("ร่าง", "Draft")}</span>
                        {u.where} <span className="text-slate-400">👁</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">{t("ผูกในร่างแล้วต้องกดเผยแพร่ที่แท็บนั้นหนึ่งครั้ง · หลังจากนั้นเปลี่ยนรูปที่นี่ (ร่าง → ใช้รูปนี้) ไม่ต้องเผยแพร่หน้านั้นอีก · กดรายการ = ดูตัวอย่างที่นั้น", "Links made in a draft need one publish in that tab · after that, changing images here (draft → Use this image) needs no republish · click an item to preview it")}</p>
            </div>
            {now.desk === null && now.mob === null && <p className="text-[11px] text-amber-700">⚠️ {t("ชุดนี้ยังไม่มีรูป — ที่ที่ผูกไว้จะไม่มีรูปจนกว่าจะใส่", "This set has no image — linked places show no image until you add one")}</p>}
          </div>
        )}
      </div>

      {/* 👁 ดูตัวอย่างทุกที่ — เว็บจริงในโหมดพรีวิว (เห็นร่างของชุด · ลูกค้ายังเห็นรูปเดิม) */}
      {pv && sel && (() => {
        const places = [...new Map(usesOf(sel.id).map((u) => [u.path, u.where])).entries()];
        if (!places.length) places.push(["/", t("หน้าแรก", "Home")]);
        const src = site.siteUrl ? `${site.siteUrl}${withPreviewKey(withPreviewParam(pv.path), site.previewKey)}` : null;
        return (
          <ERPModal open onClose={() => setPv(null)} title={`👁 ${t("ตัวอย่างชุด", "Preview set")} “${sel.name}”${sel.draft ? t(" (ร่าง)", " (draft)") : ""}`} size="xl" defaultExpanded>
            {!src ? (
              <p className="py-8 text-center text-sm text-slate-500">{t("ร้านนี้ยังไม่ผูกโดเมน — ดูตัวอย่างไม่ได้", "This shop has no domain yet — preview unavailable")}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {places.map(([path, where]) => (
                    <button key={path} type="button" onClick={() => setPv({ ...pv, path })} className={`rounded-full border px-2.5 py-1 text-[11px] ${pv.path === path ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                      {where}
                    </button>
                  ))}
                  <span className="ml-auto flex gap-1">
                    {(["desktop", "mobile"] as const).map((d) => (
                      <button key={d} type="button" onClick={() => setPv({ ...pv, device: d })} className={`rounded-lg border px-2.5 py-1 text-xs ${pv.device === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>
                        {d === "desktop" ? t("🖥 คอม", "🖥 Desktop") : t("📱 มือถือ", "📱 Mobile")}
                      </button>
                    ))}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{sel.draft ? t("เห็นร่างของชุดนี้ — ลูกค้ายังเห็นรูปเดิมจนกว่าจะกด “ใช้รูปนี้”", "Showing this set's draft — customers see the old image until you press “Use this image”") : t("ตอนนี้ไม่มีร่าง — เห็นรูปเดียวกับที่ลูกค้าเห็น", "No draft — you see what customers see")} {t("· เมนู: ชี้เมนูเพื่อเปิด · ป๊อปอัป: รอให้ขึ้น", "· Menus: hover to open · Popups: wait for them")}</p>
                <div className="flex justify-center rounded-lg bg-slate-100 p-2">
                  <iframe key={src + pv.device} src={src} title={t("ตัวอย่าง", "Preview")} className="rounded border border-slate-200 bg-white" style={{ width: pv.device === "mobile" ? 390 : "100%", height: "68vh" }} />
                </div>
                {sel.draft && (
                  <div className="flex justify-end gap-2">
                    {draftEmpty ? (
                      <button type="button" disabled={busy} onClick={() => setAskEmpty(true)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                        {t("เอารูปออกจากเว็บ", "Remove image from website")}
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={async () => (await publish()) && setPv(null)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
                        ✅ {t("ใช้รูปนี้ (ขึ้นเว็บ)", "Use this image (go live)")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </ERPModal>
        );
      })()}

      {/* ร่าง "ไม่มีรูป" → ยืนยันก่อนขึ้นเว็บ (ทุกที่ที่ผูกจะไม่มีรูป) */}
      <ConfirmDialog
        open={askEmpty && draftEmpty}
        onClose={() => setAskEmpty(false)}
        onConfirm={async () => {
          const ok = await publish();
          setAskEmpty(false);
          if (ok) setPv(null);
        }}
        title={t("เอารูปออกจากเว็บ?", "Remove image from website?")}
        message={
          <>
            {t("ชุด", "Set")} “{sel?.name}” {t("จะไม่มีรูป —", "will have no image —")} {sel && liveUses(sel.id) ? t(`ที่ที่ผูกไว้ ${liveUses(sel.id)} ที่`, `${liveUses(sel.id)} linked places`) : t("ทุกที่ที่ผูกไว้", "every linked place")} {t("จะไม่มีรูปบนเว็บจนกว่าจะใส่รูปใหม่", "will show no image until you add a new one")}
            <br />
            {t("ย้อนกลับได้ด้วยปุ่ม “↩ ย้อนรูปก่อนหน้า”", "Undo with “↩ Previous image”")}
          </>
        }
        confirmText={t("เอารูปออก", "Remove image")}
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
