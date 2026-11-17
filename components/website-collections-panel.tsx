"use client";
/**
 * 🎞 แท็บ "คอลเลกชัน" ในหน้าจัดการเว็บ — เปิดหน้าคอลเลกชัน (/collection/<ลิงก์>) + แบนเนอร์ · เรื่องราว · Google ต่อคอลเลกชัน
 * คอลเลกชันมาจาก ERP (ตาราง collections ที่ผูกกับ Parent SKU) — โชว์เฉพาะที่มีสินค้าอยู่ในร้านนี้
 * ลาก ⠿ เรียงลำดับ (ใช้กับ Section "คอลเลกชัน" ในตัวจัดหน้า) · บันทึก = ขึ้นเว็บเลย (ไม่ต้องเผยแพร่)
 * ของกลาง: useDragReorder/DragHandle · ImageUploadField · CopyButton · lib/website-collections · API /api/website/collections
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { TranslateButton } from "@/components/translation-table";
import { pickTranslations } from "@/lib/content-i18n";
import { COLLECTION_TEXT_KEYS } from "@/lib/website-collections";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { CopyButton } from "@/components/copy-button";
import { slugifyCollection, type WebCollection } from "@/lib/website-collections";
import { SaveBar } from "@/components/save-bar";
import { webForm } from "@/lib/website-form-styles";

type Item = { id: string; name: string; count: number; published: number; imageKey: string | null };
type Row = WebCollection & { name: string; count: number; published: number; imageKey: string | null };

const inputCls = webForm.inputPlain;
const lbl = webForm.labelPlain;

const blank = (it: Item): WebCollection => ({
  id: it.id,
  slug: slugifyCollection(it.name) || `c-${it.id.slice(0, 8)}`,
  enabled: false,
  title: "",
  bannerKey: null,
  mobileBannerKey: null,
  story: "",
  seoTitle: "",
  seoDescription: "",
});

export function WebsiteCollectionsPanel({ shopSlug, shopId, siteUrl }: { shopSlug: string; shopId: string; siteUrl?: string | null }) {
  const toast = useToast();
  const t = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await apiFetch(`/api/website/collections?shop=${encodeURIComponent(shopSlug)}`)).json();
      if (j.error) return toast.error(j.error);
      const cfg = new Map(((j.collections ?? []) as WebCollection[]).map((c) => [c.id, c]));
      const next: Row[] = ((j.items ?? []) as Item[]).map((it) => ({ ...(cfg.get(it.id) ?? blank(it)), name: it.name, count: it.count, published: it.published, imageKey: it.imageKey }));
      setRows(next);
      setSaved(JSON.stringify(next.map(strip)));
    } catch {
      toast.error(tr("โหลดคอลเลกชันไม่สำเร็จ", "Could not load collections"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  // 🌐 เก็บคำแปล (<key>_en + _i18n) ไปด้วย ไม่งั้นหายตอนบันทึก
  const strip = (r: Row): WebCollection => ({ id: r.id, slug: r.slug, enabled: r.enabled, title: r.title, bannerKey: r.bannerKey, mobileBannerKey: r.mobileBannerKey, story: r.story, seoTitle: r.seoTitle, seoDescription: r.seoDescription, ...pickTranslations(r as unknown as Record<string, unknown>) });
  const dirty = useMemo(() => JSON.stringify(rows.map(strip)) !== saved, [rows, saved]);
  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const drag = useDragReorder((from, to) => setRows((rs) => moveItem(rs, from, to)));
  const dupSlug = (r: Row) => rows.some((x) => x.id !== r.id && x.slug === r.slug);

  const save = async () => {
    if (rows.some((r) => !r.slug || dupSlug(r))) return toast.error(t("ลิงก์ของคอลเลกชันต้องไม่ว่างและไม่ซ้ำกัน", "Collection links must not be empty or duplicated"));
    setSaving(true);
    try {
      const j = await (await apiFetch("/api/website/collections", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, collections: rows.map(strip) }) })).json();
      if (!j.ok) return toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      toast.success(t("บันทึกคอลเลกชันแล้ว — เว็บอัปเดตเลย", "Collections saved — website updated"));
      await load();
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = rows.filter((r) => r.enabled).length;
  const base = (siteUrl ?? "").replace(/\/$/, "");

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">{t("กำลังโหลดคอลเลกชัน…", "Loading collections…")}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {t("เปิดหน้าคอลเลกชันให้ลูกค้าเข้า", "Open collection pages for customers at")} <code>/collection/&lt;{t("ลิงก์", "link")}&gt;</code> — {t("แบนเนอร์ + เรื่องราว + สินค้าในชุด · ลาก ⠿ เรียงลำดับ (ใช้กับ Section \"คอลเลกชัน\") · เปิดอยู่", "banner + story + products · drag ⠿ to reorder (used by the \"Collections\" section) · open")} {enabledCount}/{rows.length}
        </p>
        {/* 🌐 ชื่อ / เรื่องราว / SEO ภาษาอังกฤษ — ชื่อบนเว็บว่าง = ใช้ชื่อคอลเลกชันใน ERP มาให้แปล */}
        <TranslateButton
          className="ml-auto"
          value={rows.map((r) => ({ ...r, title: r.title || r.name }))}
          onChange={(next) => setRows(next.map((n, i) => ({ ...n, title: !rows[i]?.title && n.title === rows[i]?.name ? "" : n.title })))}
          keys={COLLECTION_TEXT_KEYS}
          crumbOf={(f) => ({ title: t("ชื่อบนเว็บ", "Web name"), story: t("เรื่องราว", "Story"), seoTitle: t("ชื่อใน Google", "Google title"), seoDescription: t("คำอธิบายใน Google", "Google description") })[f] ?? null}
          title={t("คอลเลกชันภาษาอังกฤษ — ชื่อ · เรื่องราว · SEO", "Collections in English — name · story · SEO")}
          description={t("แก้แล้วกด 💾 บันทึก ของแท็บนี้ · ช่องที่ยังว่าง ลูกค้าหน้า /en เห็นภาษาไทยแทน", "After editing press 💾 Save on this tab · empty fields show Thai to customers on /en")}
        />
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
          {saving ? t("กำลังบันทึก…", "Saving…") : t("💾 บันทึก", "💾 Save")}
        </button>
      </div>
      {!rows.length && <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">{t("ยังไม่มีสินค้าในร้านนี้ที่ผูกคอลเลกชันไว้ (ตั้งคอลเลกชันที่หน้า Parent SKU)", "No products in this shop are linked to a collection yet (set collections on the Parent SKU page)")}</div>}
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const open = openId === r.id;
          const thumb = r.bannerKey ?? r.imageKey;
          const url = base ? `${base}/collection/${r.slug}` : `/collection/${r.slug}`;
          return (
            <li key={r.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${open ? "border-blue-300" : "border-slate-200"} ${drag.rowCls(i)} ${r.enabled ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2.5 px-2 py-2">
                <DragHandle {...drag.handleProps(i)} />
                <div className="w-14 h-10 rounded-md bg-slate-100 overflow-hidden shrink-0">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(thumb, 160) ?? undefined} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.title || r.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {r.count} {t("รุ่นในร้าน · ขึ้นเว็บ", "models in shop · live")} {r.published}
                    {r.title && r.title !== r.name ? t(` · ใน ERP: ${r.name}`, ` · in ERP: ${r.name}`) : ""}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.id, { enabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                  {t("เปิดหน้า", "Open page")}
                </label>
                {r.enabled && (
                  <span className="flex items-center gap-1">
                    <code className="text-[11px] text-slate-500">/collection/{r.slug}</code>
                    <CopyButton value={url} title={t("คัดลอกลิงก์หน้าคอลเลกชัน", "Copy collection page link")} />
                  </span>
                )}
                <button type="button" onClick={() => setOpenId(open ? null : r.id)} className={`text-xs px-2 py-1 rounded border ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  ⚙ {t("ตั้งค่า", "Settings")}
                </button>
              </div>
              {open && (
                <div className="border-t border-slate-100 px-3 py-3 grid gap-3 sm:grid-cols-2 bg-slate-50/40">
                  <div>
                    <label className={lbl}>{t("ลิงก์ (/collection/…) — อังกฤษ/ตัวเลข/ขีด", "Link (/collection/…) — letters/numbers/dashes")}</label>
                    <input value={r.slug} onChange={(e) => patch(r.id, { slug: slugifyCollection(e.target.value) })} className={`${inputCls} ${dupSlug(r) || !r.slug ? "border-rose-400" : ""}`} placeholder="roar-2000s" />
                    {(dupSlug(r) || !r.slug) && <p className="text-[11px] text-rose-600 mt-0.5">{t("ต้องไม่ว่างและไม่ซ้ำกับคอลเลกชันอื่น", "Must not be empty or match another collection")}</p>}
                  </div>
                  <div>
                    <label className={lbl}>{t("ชื่อบนเว็บ (ว่าง =", "Web name (empty =")} {r.name})</label>
                    <input value={r.title} onChange={(e) => patch(r.id, { title: e.target.value.slice(0, 120) })} className={inputCls} placeholder={r.name} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lbl}>{t("เรื่องราวของคอลเลกชัน (โชว์ใต้แบนเนอร์)", "Collection story (shown under the banner)")}</label>
                    <textarea rows={3} value={r.story} onChange={(e) => patch(r.id, { story: e.target.value.slice(0, 3000) })} className={inputCls} placeholder={t("เช่น กลิ่นอาย Y2K ผสมความหรูแบบเมทัลลิก — แรงบันดาลใจจากแฟชั่นยุคมิลเลนเนียม", "e.g. Y2K vibes with metallic luxury — inspired by millennium fashion")} />
                  </div>
                  <ImageUploadField label={t("แบนเนอร์ (คอม)", "Banner (desktop)")} hint={t("แนะนำ 2400×900 ขึ้นไป · ว่าง = ใช้หัวข้อตัวอักษรอย่างเดียว", "Recommended 2400×900 or larger · empty = text heading only")} value={r.bannerKey} onChange={(k) => patch(r.id, { bannerKey: k })} height={80} />
                  <ImageUploadField label={t("แบนเนอร์ (มือถือ)", "Banner (mobile)")} hint={t("แนะนำแนวตั้ง 1080×1350 · ว่าง = ใช้ของคอม", "Recommended portrait 1080×1350 · empty = use desktop")} value={r.mobileBannerKey} onChange={(k) => patch(r.id, { mobileBannerKey: k })} height={80} />
                  <div>
                    <label className={lbl}>🔎 {t("ชื่อใน Google (ว่าง = ชื่อบนเว็บ)", "Google title (empty = web name)")}</label>
                    <input value={r.seoTitle} onChange={(e) => patch(r.id, { seoTitle: e.target.value.slice(0, 120) })} className={inputCls} />
                  </div>
                  <div>
                    <label className={lbl}>🔎 {t("คำอธิบายใน Google (ว่าง = เรื่องราว)", "Google description (empty = story)")}</label>
                    <input value={r.seoDescription} onChange={(e) => patch(r.id, { seoDescription: e.target.value.slice(0, 300) })} className={inputCls} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* 💾 แถบบันทึก (ของกลาง) — ติดขอบล่างเสมอ ไม่ต้องเลื่อนขึ้นหาปุ่ม */}
      <SaveBar dirty={dirty} saving={saving} onSave={save} note={t("บันทึกแล้วขึ้นเว็บทันที", "Saving goes live immediately")} />
    </div>
  );
}
