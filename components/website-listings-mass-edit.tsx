"use client";
/**
 * ✏️ แก้หลายรายการ (หน้า "สินค้าบนเว็บ" → แถบล่างตอนติ๊กหลายรุ่น)
 * ช่องทั้งหมดวาดจากทะเบียนกลาง lib/website-listing-fields (BULK_FIELDS) — ไม่ฝังช่องไว้ในหน้าจอ
 * ตัวแก้ต่อชนิด: choice · price (ตั้ง/ล้าง) · categories (เพิ่ม/เอาออก/แทนทั้งชุด + ป๊อปเลือกหมวด) · badge (รายการป้ายของร้าน) · text · clear
 * กันพลาด (CLAUDE.md §18): บอกจำนวนที่กระทบ · ช่องที่จะเปลี่ยน · เกิน 20 รุ่นพิมพ์ CONFIRM · ตรวจค่าก่อนส่ง · audit (ฝั่ง API) · สรุปสำเร็จ/ไม่สำเร็จ
 * API: POST /api/website/listings action bulk (patch เดียวกันทุกรุ่น) + setCategories (หมวดคิดต่อรุ่น)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { CardBadgeSelect } from "@/components/website-card-badges";
import { BULK_FIELDS, applyCategoriesOp, massEditPlan, type CategoriesOp, type ListingFieldKey, type MassEditValues, type PriceOp } from "@/lib/website-listing-fields";
import { categoryChoiceLabel } from "@/lib/website-category-tree";
import { useT } from "@/components/i18n";

type Row = { parentId: string; categories: string[] };
const CONFIRM_OVER = 20;
const inputCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400 bg-white";
const seg = (on: boolean) => `px-2.5 py-1 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;

export function WebsiteListingsMassEdit({
  open,
  onClose,
  shopId,
  rows,
  shopCategories,
  onDone,
  preset = null,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  /** รุ่นที่ติ๊กไว้ (หมวดปัจจุบันไว้คิดเพิ่ม/เอาออกต่อรุ่น) */
  rows: Row[];
  shopCategories: { key: string; label: string; icon?: string; parent?: string | null }[];
  onDone: () => void | Promise<void>;
  /** เปิดมาติ๊กช่องนี้ไว้เลย (เช่น ปุ่มลัด "📂 ย้ายหมวด" = categories + โหมดย้าย) */
  preset?: { field: ListingFieldKey; categories?: CategoriesOp } | null;
}) {
  const toast = useToast();
  const t = useT();
  const [on, setOn] = useState<Set<ListingFieldKey>>(new Set());
  const [vals, setVals] = useState<MassEditValues>({});
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setOn(new Set(preset ? [preset.field] : []));
    setVals({ published: "on", featured: "on", price: { mode: "set" }, categories: preset?.categories ?? { mode: "add", keys: [] }, badge: "", stockStatus: "in", unit: "", name: true, description: true });
    setTyped("");
    setErr(null);
    setResult(null);
  }, [open]);

  const n = rows.length;
  const needConfirm = n > CONFIRM_OVER;
  const toggle = (k: ListingFieldKey) =>
    setOn((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });
  const setV = <K extends keyof MassEditValues>(k: K, v: MassEditValues[K]) => {
    setErr(null);
    setVals((o) => ({ ...o, [k]: v }));
  };
  const picked = (): MassEditValues => Object.fromEntries([...on].map((k) => [k, vals[k]])) as MassEditValues;

  const apply = async () => {
    const plan = massEditPlan(picked());
    if (!plan.ok) return setErr(plan.error);
    if (needConfirm && typed !== "CONFIRM") return setErr(t("พิมพ์ CONFIRM เพื่อยืนยันแก้จำนวนมาก", "Type CONFIRM to approve a large edit"));
    setBusy(true);
    let ok = 0;
    let failed = 0;
    const post = async (body: Record<string, unknown>) => (await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    try {
      const ids = rows.map((r) => r.parentId);
      if (Object.keys(plan.patch).length) {
        const j = await post({ shopId, action: "bulk", parentIds: ids, patch: plan.patch });
        if (!j.ok) throw new Error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
        ok = j.count ?? ids.length;
        failed = j.failed ?? 0;
      }
      if (plan.categories) {
        const op = plan.categories;
        // ส่งเฉพาะรุ่นที่หมวดเปลี่ยนจริง (เช่น ย้ายหมวด: รุ่นที่ไม่ได้อยู่หมวดต้นทาง = ไม่ต้องบันทึก/ไม่ขึ้นประวัติ)
        const items = rows
          .map((r) => ({ parentId: r.parentId, categories: applyCategoriesOp(r.categories, op), before: r.categories }))
          .filter((it) => it.categories.join("|") !== it.before.join("|"))
          .map(({ parentId, categories }) => ({ parentId, categories }));
        if (!items.length) {
          // ไม่มีรุ่นไหนต้องเปลี่ยน (เช่น ไม่มีรุ่นที่อยู่หมวดต้นทาง)
          if (!Object.keys(plan.patch).length) {
            setResult({ ok: 0, failed: 0 });
            toast.success(t("ไม่มีรุ่นไหนต้องเปลี่ยนหมวด", "No models needed a category change"));
            return;
          }
        } else {
        const j = await post({ shopId, action: "setCategories", items, category: `mass:${op.mode}:${op.from ? `${op.from}>` : ""}${op.keys.join(",")}` });
        if (!Object.keys(plan.patch).length) ok = j.ok ? j.count ?? items.length : 0;
        if (!j.ok) {
          const m = String(j.error ?? "").match(/(\d+)\/(\d+)/);
          failed = Math.max(failed, m ? Number(m[2]) - Number(m[1]) : items.length);
          if (!m) throw new Error(j.error ?? t("จัดหมวดไม่สำเร็จ", "Couldn't update categories"));
        }
        }
      }
      setResult({ ok, failed });
      if (failed) toast.error(t(`แก้ไม่สำเร็จ ${failed} รุ่น — ลองอีกครั้ง`, `${failed} models failed — try again`));
      else toast.success(t(`แก้ ${ok} รุ่นแล้ว`, `Updated ${ok} models`));
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setBusy(false);
    }
  };

  const editor = (k: ListingFieldKey) => {
    const f = BULK_FIELDS.find((x) => x.key === k)!;
    switch (f.kind) {
      case "choice":
        return (
          <div className="flex flex-wrap gap-1.5">
            {f.choices!.map((c) => (
              <button key={c.value} type="button" className={seg(vals[k] === c.value)} onClick={() => setV(k as "published", c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        );
      case "price": {
        const p = (vals.price ?? { mode: "set" }) as PriceOp;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={seg(p.mode === "set")} onClick={() => setV("price", { ...p, mode: "set" })}>
              {t("ตั้งราคา", "Set price")}
            </button>
            <button type="button" className={seg(p.mode === "clear")} onClick={() => setV("price", { mode: "clear" })}>
              {t("ล้าง (ใช้ราคา ERP)", "Clear (use ERP price)")}
            </button>
            {p.mode === "set" && <input type="number" min={1} value={p.value ?? ""} onChange={(e) => setV("price", { mode: "set", value: Number(e.target.value) || undefined })} placeholder="890" className={`${inputCls} w-28`} />}
          </div>
        );
      }
      case "categories": {
        const c = (vals.categories ?? { mode: "add", keys: [] }) as CategoriesOp;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["add", t("เพิ่มหมวด", "Add category")],
                  ["remove", t("เอาหมวดออก", "Remove category")],
                  ["replace", t("แทนทั้งชุด", "Replace all")],
                  ["move", t("↪ ย้ายหมวด", "↪ Move category")],
                ] as const
              ).map(([m, l]) => (
                <button key={m} type="button" className={seg(c.mode === m)} onClick={() => setV("categories", { ...c, mode: m })}>
                  {l}
                </button>
              ))}
            </div>
            {c.mode === "move" ? (
              (() => {
                // ↪ ย้ายจากหมวด A → B (ตำแหน่งเดิม) — โชว์ว่ามีกี่รุ่นที่อยู่หมวดต้นทาง
                const inFrom = c.from ? rows.filter((r) => r.categories.includes(c.from!)).length : 0;
                const fromOpts = shopCategories.filter((x) => rows.some((r) => r.categories.includes(x.key)));
                return (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span>{t("จากหมวด", "From")}</span>
                      <select value={c.from ?? ""} onChange={(e) => setV("categories", { ...c, from: e.target.value || undefined })} className={`${inputCls} w-auto`}>
                        <option value="">{t("— เลือก —", "— Pick —")}</option>
                        {fromOpts.map((x) => (
                          <option key={x.key} value={x.key}>
                            {categoryChoiceLabel(x)} ({rows.filter((r) => r.categories.includes(x.key)).length})
                          </option>
                        ))}
                      </select>
                      <span>{t("→ ไปหมวด", "→ To")}</span>
                      <select value={c.keys[0] ?? ""} onChange={(e) => setV("categories", { ...c, keys: e.target.value ? [e.target.value] : [] })} className={`${inputCls} w-auto`}>
                        <option value="">{t("— เลือก —", "— Pick —")}</option>
                        {shopCategories.filter((x) => x.key !== c.from).map((x) => (
                          <option key={x.key} value={x.key}>
                            {categoryChoiceLabel(x)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {c.from ? t(`ย้าย ${inFrom} จาก ${n} รุ่นที่เลือก${n - inFrom > 0 ? ` · อีก ${n - inFrom} รุ่นไม่ได้อยู่หมวดนี้ → ไม่เปลี่ยน` : ""}`, `Moving ${inFrom} of ${n} picked models${n - inFrom > 0 ? ` · the other ${n - inFrom} aren't in this category → unchanged` : ""}`) : t("เลือกหมวดต้นทาง", "Pick the source category")} · {t("หมวดหลักยังเป็นหมวดหลัก (เปลี่ยนเป็นหมวดใหม่ที่ตำแหน่งเดิม)", "The main category stays main (replaced by the new one in the same position)")}
                    </p>
                  </div>
                );
              })()
            ) : (
            <FieldChipsPicker
              value={c.keys}
              onChange={(keys) => setV("categories", { ...c, keys })}
              fields={shopCategories.map((x) => ({ key: x.key, label: x.label, icon: x.icon || undefined }))}
              title={t("เลือกหมวด", "Pick categories")}
              description={c.mode === "replace" ? t("ทุกรุ่นที่เลือกจะอยู่เฉพาะหมวดเหล่านี้ · ★ = หมวดหลัก", "Every picked model will be only in these categories · ★ = main category") : c.mode === "add" ? t("เพิ่มต่อท้ายหมวดเดิมของแต่ละรุ่น (หมวดหลักเดิมไม่เปลี่ยน)", "Added after each model's current categories (main category unchanged)") : t("เอาหมวดเหล่านี้ออกจากทุกรุ่นที่เลือก", "Remove these categories from every picked model")}
              addLabel={t("＋ เลือกหมวด", "＋ Pick categories")}
              searchPlaceholder={t("ค้นหาหมวด…", "Search categories…")}
              unit={t("หมวด", "categories")}
              showKeys={false}
              markFirst={c.mode === "replace" ? t("หมวดหลัก", "Main category") : undefined}
              compact
            />
            )}
          </div>
        );
      }
      case "badge":
        return <CardBadgeSelect shopId={shopId} value={String(vals.badge ?? "")} onChange={(v) => setV("badge", v)} />;
      case "text":
        return <input value={String(vals[k as "unit"] ?? "")} onChange={(e) => setV(k as "unit", e.target.value)} placeholder={f.hint} className={inputCls} />;
      case "clear":
        return <span className="text-xs text-slate-500">{f.hint}</span>;
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t(`✏️ แก้หลายรายการ — ${n} รุ่น`, `✏️ Bulk edit — ${n} models`)}
      description={t("ติ๊กช่องที่จะเปลี่ยน · ช่องที่ไม่ติ๊ก = ไม่แตะ · ทุกการแก้ถูกบันทึกประวัติว่าใครแก้", "Tick the fields to change · unticked = untouched · every edit is logged with who made it")}
      size="lg"
      hasUnsavedChanges={on.size > 0 && !result}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[12rem] text-xs">
            {err ? (
              <span className="text-rose-600">{err}</span>
            ) : result ? (
              <span className={result.failed ? "text-amber-700" : "text-emerald-700"}>
                {t(`สำเร็จ ${result.ok} รุ่น`, `${result.ok} models done`)}{result.failed ? t(` · ไม่สำเร็จ ${result.failed} รุ่น`, ` · ${result.failed} failed`) : ""}
              </span>
            ) : (
              <span className="text-slate-500">{on.size ? t(`จะเปลี่ยน ${on.size} ช่อง × ${n} รุ่น`, `Will change ${on.size} fields × ${n} models`) : t("ยังไม่ได้ติ๊กช่องที่จะแก้", "No fields ticked yet")}</span>
            )}
          </div>
          {needConfirm && !result && (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("พิมพ์ CONFIRM", "Type CONFIRM")} className="h-9 w-36 rounded-lg border border-rose-300 px-2 text-sm font-mono" />
          )}
          {result ? (
            <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white">
              {t("ปิด", "Close")}
            </button>
          ) : (
            <button type="button" onClick={() => void apply()} disabled={!on.size || busy || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? t("กำลังบันทึก…", "Saving…") : on.size ? t(`บันทึก ${on.size} ช่อง × ${n} รุ่น`, `Save ${on.size} fields × ${n} models`) : t("บันทึก", "Save")}
            </button>
          )}
        </div>
      }
    >
      <div className="divide-y divide-slate-100">
        {BULK_FIELDS.map((f) => {
          const checked = on.has(f.key);
          return (
            <div key={f.key} className="grid grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] items-start gap-2 py-2.5">
              <input type="checkbox" checked={checked} onChange={() => toggle(f.key)} className="mt-1 w-4 h-4 accent-blue-600" aria-label={f.label} />
              <button type="button" onClick={() => toggle(f.key)} className="text-left text-sm text-slate-800 mt-0.5">
                {f.label}
              </button>
              <div className={checked ? "" : "pointer-events-none opacity-35"}>{editor(f.key)}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{t("ไม่เปิดแก้หลายรายการ: รูป · รูปรายสี · แบนเนอร์ · ปั๊มชื่อ · รายละเอียดเฉพาะรุ่น (เป็นของแต่ละรุ่น — แก้ในหน้าต่างสินค้า)", "Not available in bulk edit: images · per-color images · banners · name stamping · model-specific details (edit these in the product window)")}</p>
      {needConfirm && !result && <p className="mt-1 text-[11px] text-rose-600">{t(`⚠️ แก้ ${n} รุ่นพร้อมกัน — ต้องพิมพ์ CONFIRM ที่แถบล่างก่อนบันทึก`, `⚠️ Editing ${n} models at once — type CONFIRM in the bottom bar before saving`)}</p>}
    </ERPModal>
  );
}
