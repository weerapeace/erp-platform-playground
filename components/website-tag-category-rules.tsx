"use client";

/**
 * WebsiteTagCategoryRules — การ์ด "🏷️ แท็ก → หมวดบนเว็บ" ในหน้าจัดเว็บ (แท็บ ⚙️ จับคู่ฟิลด์)
 *   ตารางกฎทั้งร้าน: แท็ก → หมวด · เพิ่ม/เปลี่ยน/ลบ = บันทึกทันที (PUT /api/website/tag-categories)
 *   ปุ่ม "ใส่หมวดตามกฎให้รุ่นที่มีอยู่" = เพิ่มหมวดอย่างเดียว ไม่ลบของเดิม (POST apply)
 *   ข้อมูลชุดเดียวกับป๊อป 🔗 ของแท็ก (components/tag-usage) · กฎคิดหมวด lib/website-tag-categories
 * ของกลางที่ใช้: WebCategorySelect · SearchableSelect · ConfirmDialog · Toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ConfirmDialog } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { WebCategorySelect } from "@/components/website-category-select";

type Cat = { key: string; label: string; parent: string | null };
type TagRow = { id: string; name: string; name_en: string | null; group_path: string[]; depth: number; listed: number };
type Data = {
  shop: { id: string; name: string; slug: string };
  categories: Cat[];
  rules: { tag_id: string; key: string }[];
  tags: TagRow[];
  listed_total: number;
  apply_preview: { changes: number; auto: number; items: { code: string; add: string[] }[] };
};

export function WebsiteTagCategoryRules({ shopSlug }: { shopSlug: string }) {
  const toast = useToast();
  const t = useT();
  const { can } = useAuth();
  const canEdit = can("products.edit" as never);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [askApply, setAskApply] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/website/tag-categories?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { setErr(j.error || tr("โหลดกฎแท็กไม่สำเร็จ", "Could not load tag rules")); return; }
      setData(j.data as Data); setErr(null);
    } catch { setErr(tr("เกิดข้อผิดพลาดในการโหลดกฎแท็ก กรุณาลองใหม่", "Error loading tag rules, please try again")); }
  }, [shopSlug]);
  useEffect(() => { void load(); }, [load]);

  const tagById = useMemo(() => new Map((data?.tags ?? []).map((tg) => [tg.id, tg])), [data]);
  const catLabel = useCallback((k: string) => {
    const c = data?.categories.find((x) => x.key === k);
    if (!c) return k;
    const p = c.parent ? data?.categories.find((x) => x.key === c.parent) : null;
    return p ? `${p.label} › ${c.label}` : c.label;
  }, [data]);
  // เรียงตามกลุ่มแท็ก → แท็กแม่ก่อนแท็กย่อย → ชื่อ (อ่านง่าย · ลำดับการคิดหมวดดูที่ lib)
  const rows = useMemo(() => (data?.rules ?? [])
    .map((r) => ({ ...r, tag: tagById.get(r.tag_id) }))
    .filter((r) => r.tag)
    .sort((a, b) => a.tag!.group_path.join("/").localeCompare(b.tag!.group_path.join("/"), "th") || a.tag!.depth - b.tag!.depth || a.tag!.name.localeCompare(b.tag!.name, "th")),
  [data, tagById]);
  const freeTags = useMemo(() => (data?.tags ?? []).filter((tg) => !(data?.rules ?? []).some((r) => r.tag_id === tg.id)), [data]);

  const setRule = async (tagId: string, key: string | null) => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/tag-categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: data.shop.id, tag_id: tagId, key }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { toast.error(j.error || t("บันทึกไม่สำเร็จ", "Save failed")); return; }
      const name = tagById.get(tagId)?.name ?? "";
      toast.success(key ? t(`บันทึกแล้ว — สินค้าที่ติดแท็ก “${name}” อยู่หมวด ${catLabel(key)}`, `Saved — products tagged “${name}” go in ${catLabel(key)}`) : t(`ลบกฎของแท็ก “${name}” แล้ว`, `Rule for tag “${name}” removed`));
      setNewTag("");
      await load();
    } catch { toast.error(t("เชื่อมต่อไม่ได้ กรุณาลองใหม่", "Connection failed, please try again")); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/tag-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: data.shop.id, action: "apply" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { toast.error(j.error || t("ใส่หมวดไม่สำเร็จ", "Could not assign categories")); return; }
      toast.success(t(`ใส่หมวดตามกฎให้ ${j.data?.changes ?? 0} รุ่นแล้ว (ไม่ได้ลบหมวดเดิม)`, `Categories assigned to ${j.data?.changes ?? 0} models (existing categories kept)`));
      setAskApply(false);
      await load();
    } catch { toast.error(t("เชื่อมต่อไม่ได้ กรุณาลองใหม่", "Connection failed, please try again")); }
    finally { setBusy(false); }
  };

  const card = "rounded-xl border border-slate-200 bg-white p-4";
  if (err) return <div className={card}><p className="text-sm text-red-600">{err} <button onClick={() => void load()} className="ml-2 underline">{t("ลองใหม่", "Retry")}</button></p></div>;
  if (!data) return <div className={card}><div className="h-16 animate-pulse rounded-lg bg-slate-100" /></div>;

  const preview = data.apply_preview;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">🏷️ {t("แท็ก → หมวดบนเว็บ", "Tag → web category")}</h3>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">{t("บันทึกทันที", "Saves instantly")}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {t("สินค้าที่ติดแท็กซ้าย จะอยู่หมวดขวาบนเว็บร้านนี้อัตโนมัติ · ติดหลายแท็ก = อยู่ทุกหมวดที่ตรง (แท็กย่อยเป็นหมวดหลัก) · มาก่อน “จับคู่หมวด ERP” ด้านล่าง · ตั้งจากป๊อป 🔗 ของแท็กได้ด้วย (ข้อมูลชุดเดียวกัน)", "Products with the tag on the left go into the category on the right on this shop automatically · multiple tags = every matching category (sub-tag is the main category) · takes priority over “ERP category mapping” below · can also be set from the tag's 🔗 popup (same data)")}
      </p>

      {data.categories.length === 0 ? (
        <p className="mt-3 py-6 text-center text-sm text-slate-400">{t("ร้านนี้ยังไม่มีหมวดบนเว็บ — เพิ่มหมวดที่แท็บ 📂 หมวดหมู่ก่อน", "This shop has no web categories yet — add some in the 📂 Categories tab first")}</p>
      ) : (
        <>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
            {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("ยังไม่มีกฎ — เลือกแท็กด้านล่างเพื่อเริ่ม (เช่น กระเป๋าเป้ → Backpacks)", "No rules yet — pick a tag below to start (e.g. backpack → Backpacks)")}</p>}
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.tag_id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{r.tag!.depth > 0 ? "↳ " : ""}{r.tag!.name}</div>
                    <div className="truncate text-[11px] text-slate-400">{r.tag!.group_path.join(" ↳ ") || t("ไม่มีกลุ่ม", "No group")}</div>
                  </div>
                  <span className="text-xs text-slate-300" aria-hidden>→</span>
                  <WebCategorySelect cats={data.categories} value={r.key} disabled={!canEdit || busy}
                    onChange={(v) => void setRule(r.tag_id, v || null)} emptyLabel={t("— เลิกใช้กฎนี้ —", "— Stop using this rule —")}
                    className="w-full border-blue-200 bg-blue-50/40 text-slate-800 sm:w-56" ariaLabel={t(`หมวดบนเว็บของแท็ก ${r.tag!.name}`, `Web category for tag ${r.tag!.name}`)} />
                  <span className={`w-24 text-right text-xs ${r.tag!.listed ? "text-slate-500" : "text-slate-300"}`} title={t("รุ่นบนเว็บร้านนี้ที่ติดแท็กนี้", "Models on this shop with this tag")}>{r.tag!.listed} {t("รุ่นบนเว็บ", "on web")}</span>
                  {canEdit && (
                    <button type="button" disabled={busy} onClick={() => void setRule(r.tag_id, null)} title={t("ลบกฎนี้", "Delete this rule")}
                      className="h-7 w-7 rounded text-slate-300 hover:bg-red-50 hover:text-red-500">✕</button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {canEdit && freeTags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-600">＋ {t("เพิ่มกฎ", "Add rule")}</span>
              <div className="w-56">
                <SearchableSelect value={newTag} placeholder={t("เลือกแท็ก…", "Pick a tag…")} disabled={busy}
                  options={freeTags.map((tg) => ({ value: tg.id, label: tg.name, sub: `${tg.group_path.join(" ↳ ") || t("ไม่มีกลุ่ม", "No group")} · ${tg.listed} ${t("รุ่นบนเว็บ", "on web")}`, searchText: `${tg.name} ${tg.name_en ?? ""}` }))}
                  onChange={setNewTag} />
              </div>
              {newTag && (
                <>
                  <span className="text-xs text-slate-300" aria-hidden>→</span>
                  <WebCategorySelect cats={data.categories} value="" emptyLabel={t("— เลือกหมวดบนเว็บ —", "— Pick a web category —")} disabled={busy}
                    onChange={(v) => { if (v) void setRule(newTag, v); }} className="w-56 border-slate-200 text-slate-800" ariaLabel={t("หมวดบนเว็บของแท็กที่เลือก", "Web category for the selected tag")} />
                </>
              )}
            </div>
          )}

          {/* ใส่หมวดให้รุ่นที่มีอยู่ (เพิ่มอย่างเดียว) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{t("สินค้าบนเว็บ", "Web products")} {data.listed_total} {t("รุ่น", "models")}{preview.auto ? t(` · ${preview.auto} รุ่นยังไม่จัดหมวดเอง (ใช้กฎแท็กอัตโนมัติอยู่แล้ว)`, ` · ${preview.auto} models not categorized manually (already using tag rules)`) : ""}</span>
            {preview.changes > 0 ? (
              canEdit && (
                <button type="button" disabled={busy} onClick={() => setAskApply(true)}
                  className="ml-auto h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  📂 {t(`ใส่หมวดตามกฎให้ ${preview.changes} รุ่นที่มีอยู่`, `Apply rules to ${preview.changes} existing models`)}
                </button>
              )
            ) : rows.length > 0 ? (
              <span className="ml-auto text-emerald-600">✓ {t("รุ่นบนเว็บที่ติดแท็กตามกฎ อยู่ในหมวดครบแล้ว", "All tagged web models are already in their categories")}</span>
            ) : null}
          </div>
        </>
      )}

      <ConfirmDialog open={askApply} onClose={() => setAskApply(false)} loading={busy} onConfirm={() => void apply()}
        title={t(`ใส่หมวดตามกฎให้ ${preview.changes} รุ่น?`, `Apply rules to ${preview.changes} models?`)}
        message={
          <div className="space-y-2 text-sm">
            <p>{t("เพิ่มหมวดให้รุ่นที่จัดหมวดเองไว้แล้ว (หมวดเดิมไม่ถูกลบ · หมวดหลักเดิมคงเดิม · มีประวัติย้อนดูได้)", "Adds categories to manually categorized models (existing categories kept · main category unchanged · history available)")}</p>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 text-xs">
              {preview.items.map((it) => (
                <li key={it.code} className="flex gap-2 border-b border-slate-50 px-2 py-1 last:border-0">
                  <span className="w-24 shrink-0 font-medium text-slate-700">{it.code}</span>
                  <span className="text-slate-500">＋ {it.add.map(catLabel).join(", ")}</span>
                </li>
              ))}
            </ul>
            {preview.changes > preview.items.length && <p className="text-xs text-slate-400">{t("และอีก", "and")} {preview.changes - preview.items.length} {t("รุ่น", "more models")}</p>}
          </div>
        }
        confirmText={t("ใส่หมวด", "Assign")} />
    </div>
  );
}
