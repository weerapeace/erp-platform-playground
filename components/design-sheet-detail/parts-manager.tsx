"use client";

/**
 * 🧩 จัดการอะไหล่ (ตีราคา) — การ์ดอะไหล่/วัตถุดิบของแท็บตีราคาที่ดูอยู่ · ร่าง (ยังไม่ผูก SKU) → ผูกของจริง (เจ้าของสั่ง 2026-11-24 · ข้อ 1-4, 6-8)
 *  • การ์ด 1 ใบ = วัสดุ 1 ตัว (รวมทุกแถวที่ใช้ตัวเดียวกัน) · กรอง ทั้งหมด / ร่าง / ของจริง
 *  • ร่าง: แนะนำ SKU (จาก Tags ที่ผูกชื่อไว้ก่อน ไม่เจอค่อยค้นตามชื่อ) กดเลือกได้เลย · "ผูกของจริง…" = ป๊อปเลือก (แท็บ ตรง Tags / SKU ทั้งหมด)
 *  • ผูกชื่อกับ Tags: จำว่า ชื่อร่าง → tag ไหน (ทั้งทีม · ui_config costing_part_tag_map) — แก้/ลบชิปได้ในป๊อปผูก
 *  • ผูกแล้วไม่ทับราคาเดิมเงียบ ๆ → แจ้งผลมีปุ่ม "ใช้ราคา SKU" · ผูก/เลิกผูก มีย้อนกลับ 5 วิ
 *  • "+ เพิ่มวัตถุดิบ/อะไหล่" = เปิดป๊อปตะกร้าเดิม (PartsCartModal) · "สร้าง SKU ใหม่" = Wizard SKU เดิม แล้วผูกให้เลย
 * ของกลาง: ERPModal · MaterialSearchPanel (ตัวค้นวัตถุดิบกลาง) · SkuWizard · useToast · Icon — การเขียนแถว = หน้าแม่ (quickApply → บันทึกเอง/ตามโหมดแก้ไข)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { MaterialSearchPanel } from "@/components/material-picker";
import type { BomComponent } from "@/app/api/bom/components/route";

const SkuWizard = dynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });

export const PART_TAG_MAP_KEY = "costing_part_tag_map";

export type PmRow = {
  key: string; item_sku_id?: string | null; item_sku_code?: string | null; item_id?: string | null; item_name?: string | null;
  group_name?: string | null; qty?: number | null; uom?: string | null; amount?: number | null; unit_price?: number | null;
};
type Part<T extends PmRow> = { key: string; label: string; real: boolean; code: string | null; kind: string | null; rows: T[]; qty: number; uom: string | null; amount: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const money = (n: number) => `฿${(Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function groupParts<T extends PmRow>(rows: T[]): Part<T>[] {
  const m = new Map<string, Part<T>>();
  for (const r of rows) {
    const label = (r.item_name || r.item_sku_code || "").trim();
    if (!label && !r.item_sku_id) continue;
    const key = r.item_sku_id ? `sku:${r.item_sku_id}` : r.item_id ? `item:${r.item_id}` : `name:${norm(label)}`;
    const p = m.get(key) ?? m.set(key, { key, label: label || "?", real: !!r.item_sku_id, code: r.item_sku_code ?? null, kind: r.group_name ?? null, rows: [], qty: 0, uom: r.uom ?? null, amount: 0 }).get(key)!;
    p.rows.push(r); p.qty += Number(r.qty) || 0; p.amount += Number(r.amount) || 0;
  }
  return [...m.values()];
}

export function PartsManagerModal<T extends PmRow>({ open, onClose, rows, canEdit, onBind, onUsePrice, onUnbind, onRestore, onOpenCart }: {
  open: boolean; onClose: () => void; rows: T[]; canEdit: boolean;
  /** ผูกแถว keys กับ SKU c (ราคาเดิมไม่ทับ — แถวที่ยังไม่มีราคาใช้ราคา SKU) */
  onBind: (keys: string[], c: BomComponent) => void;
  onUsePrice: (keys: string[], price: number) => void;
  onUnbind: (keys: string[]) => void;
  /** ย้อนกลับ: คืนแถวตาม snapshot (จับคู่ด้วย key) */
  onRestore: (snapshot: T[]) => void;
  onOpenCart: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "draft" | "real">("all");
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});
  const [bindFor, setBindFor] = useState<Part<T> | null>(null);
  const [wizardFor, setWizardFor] = useState<Part<T> | null>(null);
  const [sugs, setSugs] = useState<Record<string, BomComponent[]>>({});

  const parts = useMemo(() => groupParts(rows), [rows]);
  const shown = parts.filter((p) => filter === "all" || (filter === "draft" ? !p.real : p.real));
  const drafts = parts.filter((p) => !p.real);

  useEffect(() => {
    if (!open) return;
    apiFetch(`/api/ui-config?key=${PART_TAG_MAP_KEY}`).then((r) => r.json())
      .then((j) => setTagMap((j?.value?.map ?? {}) as Record<string, string[]>)).catch(() => {});
  }, [open]);
  const tagsOf = useCallback((label: string) => tagMap[norm(label)] ?? [label.trim()], [tagMap]);

  // แนะนำ SKU ให้การ์ดร่าง: ตาม Tags ก่อน → ไม่เจอค้นตามชื่อ (ใบละ 2 ตัว)
  const draftSig = drafts.map((p) => `${p.key}=${tagsOf(p.label).join("|")}`).join(",");
  useEffect(() => {
    if (!open || !drafts.length) return;
    let alive = true;
    void Promise.all(drafts.map(async (p) => {
      const tags = tagsOf(p.label).filter(Boolean);
      const get = async (qs: string) => { const r = await apiFetch(`/api/bom/components?${qs}&limit=2`); const j = await r.json(); return (j?.data ?? []) as BomComponent[]; };
      let list = tags.length ? await get(`tags=${encodeURIComponent(tags.join(","))}`).catch(() => []) : [];
      if (!list.length) list = await get(`search=${encodeURIComponent(p.label)}`).catch(() => []);
      return [p.key, list] as const;
    })).then((res) => { if (alive) setSugs(Object.fromEntries(res)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftSig]);

  const saveTagMap = (next: Record<string, string[]>) => {
    const prev = tagMap;
    setTagMap(next);
    void apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: PART_TAG_MAP_KEY, value: { map: next } }) })
      .then((r) => { if (!r.ok) throw new Error(); }).catch(() => { setTagMap(prev); toast.error(t("บันทึกการผูกชื่อกับ Tags ไม่สำเร็จ", "Couldn't save the name → tags link")); });
  };

  const bind = (p: Part<T>, c: BomComponent) => {
    const snap = p.rows.map((r) => ({ ...r }));
    const keys = p.rows.map((r) => r.key);
    onBind(keys, c);
    setBindFor(null);
    toast.undo(t(`ผูก "${p.label}" กับ ${c.code} แล้ว`, `Linked "${p.label}" to ${c.code}`), () => onRestore(snap));
    const oldPrice = p.rows.find((r) => r.unit_price != null)?.unit_price ?? null;
    if (c.standard_price != null && oldPrice != null && Math.abs(Number(oldPrice) - Number(c.standard_price)) > 0.001) {
      toast.action(t(`ราคาเดิม ${money(Number(oldPrice))} · ราคาใน SKU ${money(Number(c.standard_price))}`, `Current ${money(Number(oldPrice))} · SKU price ${money(Number(c.standard_price))}`),
        t("ใช้ราคา SKU", "Use SKU price"), () => onUsePrice(keys, Number(c.standard_price)));
    }
  };
  const unbind = (p: Part<T>) => {
    const snap = p.rows.map((r) => ({ ...r }));
    onUnbind(p.rows.map((r) => r.key));
    toast.undo(t(`เลิกผูก "${p.label}" แล้ว (กลับเป็นร่าง)`, `Unlinked "${p.label}" (back to draft)`), () => onRestore(snap));
  };
  const afterWizard = async (p: Part<T>, code: string | undefined) => {
    setWizardFor(null);
    if (!code) return;
    try {
      const r = await apiFetch(`/api/bom/components?search=${encodeURIComponent(code)}&limit=10`); const j = await r.json();
      const c = ((j?.data ?? []) as BomComponent[]).find((x) => x.code === code);
      if (c) bind(p, c); else toast.info(t(`สร้าง ${code} แล้ว — กด "ผูกของจริง" แล้วค้นหารหัสนี้`, `Created ${code} — use "Link" and search for it`));
    } catch { /* แจ้งผลจาก wizard แล้ว */ }
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="xl" storageKey="dsd-parts-manager"
        title={t("จัดการอะไหล่", "Manage parts")}
        description={t(`${parts.length} รายการ · ร่าง ${drafts.length} · ของจริง ${parts.length - drafts.length} — ผูกครั้งเดียวมีผลทุกแถวของวัสดุนั้น`, `${parts.length} items · ${drafts.length} drafts · ${parts.length - drafts.length} real — one link applies to every row of that item`)}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["all", "draft", "real"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`h-8 rounded-md px-3 text-xs font-medium ${filter === k ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {k === "all" ? t(`ทั้งหมด (${parts.length})`, `All (${parts.length})`) : k === "draft" ? t(`ร่าง (${drafts.length})`, `Drafts (${drafts.length})`) : t(`ของจริง (${parts.length - drafts.length})`, `Real (${parts.length - drafts.length})`)}
            </button>
          ))}
          <span className="flex-1" />
          {canEdit && (
            <button type="button" onClick={() => { onClose(); onOpenCart(); }} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700">
              <Icon value="i:shopping-cart" /> {t("+ เพิ่มวัตถุดิบ/อะไหล่", "+ Add materials/parts")}
            </button>
          )}
        </div>
        {!shown.length ? (
          <div className="py-12 text-center text-sm text-slate-400">{parts.length ? t("ไม่มีรายการในตัวกรองนี้", "Nothing in this filter") : t("แท็บนี้ยังไม่มีวัตถุดิบ — กด + เพิ่มวัตถุดิบ/อะไหล่", "No materials in this tab yet — press + Add")}</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <div key={p.key} className={`rounded-xl border bg-white p-2.5 text-xs ${p.real ? "border-slate-200" : "border-dashed border-amber-300"}`}>
                <div className="flex gap-2">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${p.real ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}><Icon value={p.real ? "i:package" : "i:pencil"} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800" title={p.label}>{p.label}</div>
                    <div className="text-[11px] text-slate-400">{[p.kind, t(`${p.rows.length} แถว`, `${p.rows.length} rows`), p.qty ? `${Math.round(p.qty * 1000) / 1000} ${p.uom ?? ""}` : null, money(p.amount)].filter(Boolean).join(" · ")}</div>
                    {p.real
                      ? <span className="mt-0.5 inline-block rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">{t("ของจริง", "Real")} · {p.code}</span>
                      : <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">{t("ร่าง · ยังไม่ผูก SKU", "Draft · no SKU yet")}</span>}
                  </div>
                </div>
                {!p.real && canEdit && (sugs[p.key] ?? []).map((c) => (
                  <button key={c.id} type="button" onClick={() => bind(p, c)} title={t("กดเพื่อผูกกับ SKU นี้", "Click to link this SKU")}
                    className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-slate-200 px-1.5 py-1 text-left hover:border-indigo-300 hover:bg-indigo-50/40">
                    {c.image_key ? <img src={r2ImageUrl(c.image_key, 80) ?? ""} alt="" className="h-7 w-7 rounded object-cover" /> : <Icon value="i:sparkles" className="text-violet-500" />}
                    <span className="min-w-0 flex-1 truncate"><b className="font-medium">{c.code}</b> {c.name}</span>
                    {c.standard_price != null && <span className="text-[10px] text-slate-500">{money(Number(c.standard_price))}</span>}
                  </button>
                ))}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button type="button" onClick={() => setBindFor(p)} className={`h-7 rounded-md px-2.5 text-[11px] font-medium ${p.real ? "border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                      {p.real ? t("เปลี่ยน", "Change") : t("ผูกของจริง…", "Link real item…")}
                    </button>
                    {p.real
                      ? <button type="button" onClick={() => unbind(p)} className="h-7 rounded-md px-2 text-[11px] text-rose-600 hover:bg-rose-50">{t("เลิกผูก", "Unlink")}</button>
                      : <button type="button" onClick={() => setWizardFor(p)} className="h-7 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50">{t("สร้าง SKU ใหม่", "New SKU")}</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">{t("ผูก/เลิกผูกแล้วบันทึกตีราคาให้เอง (ถ้ากำลังแก้ไขอยู่ ให้กดบันทึกตีราคา) · ย้อนกลับได้ 5 วินาที", "Linking saves the costing (if you are editing, press Save costing) · 5-second undo")}</p>
      </ERPModal>

      {bindFor && <BindModal part={bindFor} tags={tagsOf(bindFor.label)} onTags={(tags) => saveTagMap({ ...tagMap, [norm(bindFor.label)]: tags })}
        onClose={() => setBindFor(null)} onPick={(c) => bind(bindFor, c)} />}

      {wizardFor && <SkuWizard open onClose={() => setWizardFor(null)} prefill={{ name_th: wizardFor.label }}
        onCreated={(res) => void afterWizard(wizardFor, res?.skus?.[0]?.code)} />}
    </>
  );
}

/** ป๊อปผูกของจริง — แถบ "ชื่อนี้ผูกกับ Tags" + แท็บ ตรง Tags / SKU ทั้งหมด (ตัวค้นวัตถุดิบกลาง MaterialSearchPanel) */
function BindModal({ part, tags, onTags, onClose, onPick }: { part: { label: string; real: boolean }; tags: string[]; onTags: (t: string[]) => void; onClose: () => void; onPick: (c: BomComponent) => void }) {
  const t = useT();
  const [tab, setTab] = useState<"tag" | "all">(tags.length ? "tag" : "all");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  useEffect(() => {
    apiFetch("/api/master-v2/product_families?limit=2000").then((r) => r.json())
      .then((j) => setAllTags(((j?.data ?? []) as { name?: string }[]).map((x) => String(x.name ?? "")).filter(Boolean))).catch(() => {});
  }, []);
  const add = () => { const v = adding.trim(); if (!v || tags.includes(v)) { setAdding(""); return; } onTags([...tags, v]); setAdding(""); };
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="dsd-parts-bind" title={t(`ผูกของจริง: "${part.label}"`, `Link real item: "${part.label}"`)}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-2 text-[11px]">
        <span className="text-slate-500">{t(`ชื่อ "${part.label}" ผูกกับ Tags:`, `"${part.label}" is linked to tags:`)}</span>
        {tags.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">#{x}
            <button type="button" onClick={() => onTags(tags.filter((y) => y !== x))} aria-label={t(`เอา ${x} ออก`, `Remove ${x}`)} className="text-violet-400 hover:text-violet-700">✕</button>
          </span>
        ))}
        <input list="dsd-part-tags" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={t("+ tag (พิมพ์แล้ว Enter)", "+ tag (type, Enter)")} className="h-6 w-40 rounded-md border border-slate-200 bg-white px-2 text-[11px]" />
        <datalist id="dsd-part-tags">{allTags.slice(0, 2000).map((x) => <option key={x} value={x} />)}</datalist>
        <span className="text-slate-400">{t("จำไว้ใช้ทุกใบงาน", "remembered for every sheet")}</span>
      </div>
      <div className="mb-2 flex gap-1">
        <button type="button" onClick={() => setTab("tag")} aria-pressed={tab === "tag"} className={`h-7 rounded-md px-3 text-xs ${tab === "tag" ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{t("ตรง Tags", "Matching tags")}</button>
        <button type="button" onClick={() => setTab("all")} aria-pressed={tab === "all"} className={`h-7 rounded-md px-3 text-xs ${tab === "all" ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{t("SKU ทั้งหมด", "All SKUs")}</button>
      </div>
      {tab === "tag"
        ? (tags.length
            ? <MaterialSearchPanel key={`tag-${tags.join("|")}`} allowedTags={tags} onItem={onPick} emptyText={t("ยังไม่มี SKU ที่ติด tag นี้ — ลองแท็บ SKU ทั้งหมด หรือเพิ่ม tag", "No SKU has these tags — try All SKUs or add a tag")} />
            : <div className="py-10 text-center text-sm text-slate-400">{t("ยังไม่ได้ผูก tag — เพิ่ม tag ด้านบน หรือใช้แท็บ SKU ทั้งหมด", "No tags linked — add one above or use All SKUs")}</div>)
        : <MaterialSearchPanel key="all" initialSearch={part.label} onItem={onPick} />}
    </ERPModal>
  );
}
