"use client";

/**
 * 🖼 รูปแทรกในตารางสินค้าของชุดมาใหม่ — แก้ได้จากแผง Section 🆕 ชุดมาใหม่ ในตัวจัดหน้าของชุด (/new/<ชุด>)
 *
 * เจ้าของเลือก (2026-10-22): รูปแทรก "เป็นของชุด" = ข้อมูลที่เดียวกับแท็บ 🆕 มาใหม่ (store_new_drops.inserts)
 *   → โชว์ทุกที่ที่ชุดนี้ขึ้น · กดบันทึกแล้วขึ้นเว็บจริงทันที (ไม่ผ่านร่างของหน้า) → โหลดพรีวิวใหม่ให้เห็นผล
 * ของกลางที่ใช้: ListingInsertsEditor (where="drop") · API /api/website/new-drops (GET ชุด · PATCH ทั้งชุด + audit)
 * Section ที่โชว์ชุดอื่น (ล่าสุด / เร็ว ๆ นี้) หรือหน้าที่ไม่ใช่หน้าชุด = บอกว่าตั้งที่ไหนแทน
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadWebNewDrops } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ListingInsertsEditor } from "@/components/website-listing-panel";
import { normalizeListingInserts, type ListingInsert } from "@/lib/website-listing";
import type { NewDrop } from "@/lib/website-new-drops";
import type { SchemaFormContext } from "@/components/website-schema-form";

export function DropInsertsField({ ctx, which, onSaved }: { ctx: SchemaFormContext; which: string; onSaved: () => void }) {
  const toast = useToast();
  const t = useT();
  const dropId = which === "this" ? ctx.dropId ?? null : null;
  const [drop, setDrop] = useState<NewDrop | null>(null);
  const [list, setList] = useState<ListingInsert[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dropId) return;
    setLoadErr(null);
    try {
      const j = await loadWebNewDrops<NewDrop>(ctx.shopSlug, true);
      if (j.error) throw new Error(j.error);
      const d = (j.drops ?? []).find((x) => x.id === dropId) ?? null;
      if (!d) throw new Error(tr("ไม่พบชุดนี้", "Drop not found"));
      setDrop(d);
      setList(normalizeListingInserts(d.inserts));
      setDirty(false);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, [dropId, ctx.shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!drop || saving) return;
    setSaving(true);
    try {
      const { id, ...rest } = drop;
      const r = await apiFetch("/api/website/new-drops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: ctx.shopId, id, drop: { ...rest, inserts: list } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      setDrop(j.drop as NewDrop);
      setList(normalizeListingInserts((j.drop as NewDrop).inserts));
      setDirty(false);
      toast.success(t("บันทึกรูปแทรกแล้ว — ขึ้นเว็บจริงทันที", "Inserted images saved — live now"));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const box = "rounded-lg border border-slate-200 bg-white p-3 space-y-2";
  const title = <p className="text-xs font-semibold text-slate-700">🖼 {t("รูปแทรกในตารางสินค้าของชุด", "Images inserted in this drop's product grid")}</p>;
  if (!dropId)
    return (
      <div className={box}>
        {title}
        <p className="text-[11px] text-slate-500">
          {which === "this"
            ? t("หน้านี้ไม่ใช่หน้าของชุด — Section นี้โชว์ชุดล่าสุด · รูปแทรกตั้งรายชุดที่แท็บ 🆕 มาใหม่ (หรือกด \"จัดหน้าชุดนี้\")", "This is not a drop page — this section shows the latest drop · set inserted images per drop in the 🆕 New drops tab (or press \"Lay out this drop\")")
            : t("Section นี้โชว์ชุดล่าสุด/ที่กำลังจะเปิด — รูปแทรกตั้งรายชุดที่แท็บ 🆕 มาใหม่ (หรือกด \"จัดหน้าชุดนี้\")", "This section shows the latest/upcoming drop — set inserted images per drop in the 🆕 New drops tab (or press \"Lay out this drop\")")}
        </p>
      </div>
    );
  return (
    <div className={box}>
      {title}
      <p className="text-[11px] text-slate-500">
        {t("เป็นของชุด", "Belongs to drop")} <b>{drop?.title ?? "…"}</b> {t("(ที่เดียวกับแท็บ 🆕 มาใหม่) · โชว์ทุกที่ที่ชุดนี้ขึ้น · ⚠️ กดบันทึกแล้วขึ้นเว็บจริงทันที ไม่ผ่านร่าง", "(same as the 🆕 New drops tab) · shows wherever this drop appears · ⚠️ saving goes live immediately, no draft")}
      </p>
      {loadErr ? (
        <p className="text-xs text-red-600">
          {loadErr}{" "}
          <button type="button" onClick={() => void load()} className="underline">
            {t("ลองใหม่", "Retry")}
          </button>
        </p>
      ) : !drop ? (
        <p className="text-xs text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
      ) : (
        <>
          <ListingInsertsEditor
            where="drop"
            list={list}
            onChange={(next) => {
              setList(next);
              setDirty(true);
            }}
            categories={[]}
            products={drop.codes.map((code) => ({ code, name: "" }))}
            linkCtx={ctx}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? t("กำลังบันทึก…", "Saving…") : t("💾 บันทึกรูปแทรก (ขึ้นเว็บทันที)", "💾 Save inserted images (goes live now)")}
            </button>
            {dirty && (
              <button type="button" onClick={() => void load()} className="text-[11px] text-slate-500 hover:text-red-600">
                {t("ยกเลิกที่แก้", "Discard changes")}
              </button>
            )}
            {dirty && <span className="text-[11px] text-amber-700">{t("ยังไม่บันทึก — พรีวิวยังเป็นของเดิม", "Not saved — preview still shows the old version")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
