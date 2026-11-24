"use client";

/**
 * แก้ "ขาดหมวด" ได้ในแถวเลย — ตัวช่วยลงสินค้า ส่วน "ร้านอื่น — บันทึกร่างไว้ก่อน" (เจ้าของเลือก 2026-11-24 แบบแก้ในแถว + ข้อเสนอ 1, 2, 3)
 * --------------------------------------------------------------------------
 * หมวดของร้าน = หมวดกลางของสินค้า → การจับคู่หมวดกลางกับร้านนั้น · ขาดตรงไหนแก้ตรงนั้น (กฎตัดสิน categoryGap ใน lib/platform-add-plan):
 *   ยังไม่มีหมวดกลาง → CentralCategoryPicker (ค้นหา + "เพิ่มหมวดใหม่" + ปุ่มจับคู่ ในตัว)
 *   หมวดกลางยังไม่จับคู่กับร้าน → PlatformCategoryPicker ของร้านนั้น → บันทึกเป็น "ค่ามาตรฐานของหมวดกลาง" (ทุกสินค้าในหมวดได้ด้วย)
 *       + ปุ่ม "แนะนำ: …" จากตัวเดาฟรี (ตัวเดียวกับปุ่มใส่ให้เอง ในหน้าจับคู่หมวด — /api/platform-category-map/autofill?central_id=&platform_id=)
 *   จับคู่แล้วแต่ร่างเดิมยังไม่มีหมวด → ปุ่ม "ใช้หมวดมาตรฐาน"
 * บันทึกผ่าน PATCH /api/product-platforms เดิม (set_platform_category · save_mapping · ร่าง category_path) — มีประวัติเก่า→ใหม่ทุกครั้ง
 * หลังบันทึก: ตัวช่วยตรวจใหม่ให้เอง + แจ้งผลมุมจอมีปุ่ม "ย้อนกลับ" (onSaved รับ undo) · สิทธิ์ = products.platforms.edit (ผู้เรียกเช็ก canEdit)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { CentralCategoryPicker } from "@/components/central-category-picker";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import type { AutofillCandidate } from "@/lib/platform-category-autofill";
import { categoryGap, type AddReadinessRow } from "@/lib/platform-add-plan";

export type FixShop = { pf: { id: string; code: string; name_th: string; icon_key: string | null }; row: AddReadinessRow };
export type FixSaved = { message: string; undo: () => Promise<void> };

/** PATCH /api/product-platforms (คืน json · error = โยน) — ใช้ทั้งตัวแก้หมวด และตัวช่วย (เติมหมวดลงร่าง / ย้อนกลับ) */
export async function patchProductPlatforms(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const j = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.json());
  if (j.error) throw new Error(String(j.error));
  return j as Record<string, unknown>;
}

// ตัวเดาหมวดฟรี ต่อ (หมวดกลาง × ร้าน) — หลายสินค้าหมวดเดียวกันใช้ผลเดียวกัน (ไม่ยิงซ้ำ)
type Sugs = { candidates: AutofillCandidate[]; sure: boolean };
const sugCache = new Map<string, Promise<Sugs>>();
function loadSuggestions(centralId: string, platformId: string): Promise<Sugs> {
  const k = `${centralId}:${platformId}`;
  let p = sugCache.get(k);
  if (!p) {
    p = apiFetch(`/api/platform-category-map/autofill?${new URLSearchParams({ central_id: centralId, platform_id: platformId })}`)
      .then((r) => r.json())
      .then((j) => ({ candidates: ((j?.suggestion?.candidates ?? []) as AutofillCandidate[]).slice(0, 2), sure: j?.suggestion?.confidence === "high" }))
      .catch(() => { sugCache.delete(k); return { candidates: [], sure: false }; });
    sugCache.set(k, p);
  }
  return p;
}

export function CategoryFix({ parentId, shops, onSaved }: {
  parentId: string;
  /** ร้านของสินค้านี้ที่ "ขาดหมวด" (categoryGap ≠ null) */
  shops: FixShop[];
  onSaved: (r: FixSaved) => void | Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const noCentral = shops.filter((s) => categoryGap(s.row) === "no_central");
  const noMap = shops.filter((s) => categoryGap(s.row) === "no_mapping");
  const draftEmpty = shops.filter((s) => categoryGap(s.row) === "draft_empty");

  const run = async (fn: () => Promise<FixSaved>) => {
    setBusy(true);
    try { await onSaved(await fn()); }
    catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  // ① ตั้งหมวดกลางให้สินค้านี้
  const setCentral = (id: string | null) => {
    if (!id) return;
    void run(async () => {
      const j = await patchProductPlatforms({ set_platform_category: true, parent_sku_id: parentId, platform_category_id: id });
      const prev = ((j.previous ?? {}) as Record<string, string | null>)[parentId] ?? null;
      return { message: "ตั้งหมวดกลางแล้ว · ตรวจใหม่ให้แล้ว", undo: async () => { await patchProductPlatforms({ set_platform_category: true, parent_sku_id: parentId, platform_category_id: prev }); } };
    });
  };

  // ② จับคู่หมวดกลาง → หมวดของร้าน (ค่ามาตรฐาน — ทุกสินค้าในหมวดกลางนี้)
  const saveMapping = (s: FixShop, path: string) => {
    const central = s.row.central_category_id;
    if (!central || !path.trim()) return;
    void run(async () => {
      const j = await patchProductPlatforms({ save_mapping: true, central_category_id: central, platform_id: s.pf.id, platform_category_path: path });
      const prev = (j.previous as string | null | undefined) ?? null;
      return {
        message: `จับคู่หมวด "${s.row.central_category || "หมวดกลาง"}" กับ ${s.pf.name_th} แล้ว — สินค้าอื่นในหมวดนี้ได้ด้วย`,
        undo: async () => { await patchProductPlatforms({ save_mapping: true, central_category_id: central, platform_id: s.pf.id, platform_category_path: prev ?? "" }); },
      };
    });
  };

  // ③ ใส่หมวดมาตรฐานลงร่างที่เตรียมไว้ก่อนหน้า
  const fillDraft = (s: FixShop) => {
    const path = (s.row.mapped_category ?? "").trim();
    if (!path) return;
    void run(async () => {
      await patchProductPlatforms({ parent_sku_id: parentId, platform_id: s.pf.id, category_path: path });
      return { message: `ใส่หมวด ${s.pf.name_th} ลงร่างแล้ว`, undo: async () => { await patchProductPlatforms({ parent_sku_id: parentId, platform_id: s.pf.id, category_path: "" }); } };
    });
  };

  return (
    <div className={`mt-1.5 space-y-1.5 ${busy ? "pointer-events-none opacity-60" : ""}`} aria-busy={busy}>
      {noCentral.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0 text-xs text-slate-500">หมวดกลาง</span>
            <CentralCategoryPicker value={null} onChange={setCentral} disabled={busy} className="min-w-0 flex-1" placeholder="— เลือกหมวดกลาง (ค้นหา / เพิ่มหมวดใหม่ได้) —" />
          </div>
          <div className="text-xs text-rose-700">
            {noCentral.map((s) => s.pf.name_th).join(" · ")}: ขาดหมวด — เลือกหมวดกลางก่อน ร้านที่จับคู่หมวดไว้แล้วจะได้หมวดอัตโนมัติ
          </div>
        </div>
      )}
      {noMap.map((s) => <MappingLine key={s.pf.id} shop={s} disabled={busy} onPick={(path) => saveMapping(s, path)} />)}
      {draftEmpty.map((s) => (
        <div key={s.pf.id} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-rose-700">{s.pf.name_th}: ร่างที่เตรียมไว้ยังไม่มีหมวด</span>
          <button type="button" onClick={() => fillDraft(s)} disabled={busy} className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-violet-200 px-2 text-violet-700 hover:bg-violet-50">
            <Icon name="done" /><span className="truncate">ใช้หมวดมาตรฐาน: {s.row.mapped_category}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

/** ร้าน 1 ร้านที่หมวดกลางยังไม่จับคู่ — ปุ่มแนะนำ (ฟรี) + ค้นหมวดของร้าน */
function MappingLine({ shop, disabled, onPick }: { shop: FixShop; disabled: boolean; onPick: (path: string) => void }) {
  const central = shop.row.central_category_id ?? "";
  const [sugs, setSugs] = useState<Sugs | null>(null);
  useEffect(() => {
    let alive = true;
    if (central) void loadSuggestions(central, shop.pf.id).then((c) => { if (alive) setSugs(c); });
    return () => { alive = false; };
  }, [central, shop.pf.id]);
  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-rose-200 p-2">
      <div className="flex items-center gap-1.5 text-xs text-rose-700">
        <PlatformIcon code={shop.pf.code} iconKey={shop.pf.icon_key} size={14} />
        <span className="min-w-0">{shop.pf.name_th}: หมวดกลาง &quot;{shop.row.central_category || "—"}&quot; ยังไม่จับคู่กับ {shop.pf.name_th}</span>
      </div>
      {sugs && sugs.candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugs.candidates.map((c, i) => (
            <button key={c.value} type="button" disabled={disabled} onClick={() => onPick(c.value)} title={`ระบบเดาจากชื่อหมวด (ฟรี ไม่ใช้ AI) · ใกล้เคียง ${Math.round(c.score * 100)}%`}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 hover:bg-amber-100">
              <Icon name="tip" /><span className="truncate">{i === 0 && sugs.sure ? "แนะนำ" : "อาจเป็น (ควรตรวจ)"}: {c.value}</span>
            </button>
          ))}
        </div>
      )}
      <PlatformCategoryPicker platformId={shop.pf.id} onPick={onPick} placeholder={`ค้นหมวด ${shop.pf.name_th} (พิมพ์ เช่น กระเป๋า / bag)`} />
      <p className="text-[11px] text-slate-400">เลือกแล้วบันทึกเป็นค่ามาตรฐานของหมวด &quot;{shop.row.central_category || "—"}&quot; — สินค้าอื่นในหมวดนี้ได้หมวดนี้ด้วย</p>
    </div>
  );
}
