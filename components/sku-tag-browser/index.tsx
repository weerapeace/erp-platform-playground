"use client";

/**
 * SkuTagBrowser — ของกลาง "เลือกดู SKU ตามกลุ่มแท็ก" (drill-down)
 *
 * กลุ่มหลัก → กลุ่มย่อย/แท็ก → การ์ด SKU · breadcrumb ย้อนกลับ · ค้นหา SKU ทั้งหมด
 * การ์ดปรับแต่งได้ (เลือกฟิลด์ที่โชว์) บันทึกผ่าน /api/card-layouts (ของฉัน/ทุกคน)
 * อ่านผ่าน /api/sku-browser (tree + การ์ด) — ใช้โครง product_family_groups/families เดิม
 */
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import type { BrowseTree, BrowseGroup, BrowseTag, SkuCard } from "@/app/api/sku-browser/route";

type Crumb = { id: string; name: string };

const CARD_FIELDS: { key: string; label: string }[] = [
  { key: "image",  label: "รูป" },
  { key: "code",   label: "รหัส" },
  { key: "name",   label: "ชื่อ" },
  { key: "price",  label: "ราคาขาย" },
  { key: "stock",  label: "สต๊อกคงเหลือ" },
  { key: "tags",   label: "แท็ก" },
  { key: "status", label: "สถานะ" },
];
const DEFAULT_CARD_FIELDS = CARD_FIELDS.map((f) => f.key);
const CARD_SCOPE = "sku-browser";

export function SkuTagBrowser() {
  const toast = useToast();
  const [tree, setTree] = useState<BrowseTree | null>(null);
  const [groupPath, setGroupPath] = useState<Crumb[]>([]);
  const [tag, setTag] = useState<Crumb | null>(null);
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<SkuCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingCards, setLoadingCards] = useState(false);

  const [cardFields, setCardFields] = useState<string[]>(DEFAULT_CARD_FIELDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/sku-browser").then((r) => r.json())
      .then((j) => setTree(j.tree ?? { groups: [], tags: [] })).catch(() => {});
    apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json())
      .then((j) => { const f = (j.mine ?? j.default) as string[] | null; if (f && f.length) setCardFields(f); }).catch(() => {});
  }, []);

  const cardsMode = !!tag || !!search.trim();
  const currentGroupId = groupPath.length ? groupPath[groupPath.length - 1].id : null;

  useEffect(() => {
    if (!cardsMode) { setCards([]); setTotal(0); return; }
    let alive = true;
    setLoadingCards(true);
    const p = new URLSearchParams();
    if (tag) p.set("family_id", tag.id);
    if (search.trim()) p.set("search", search.trim());
    p.set("limit", "120");
    apiFetch(`/api/sku-browser?${p.toString()}`).then((r) => r.json())
      .then((j) => { if (!alive) return; setCards(j.cards ?? []); setTotal(j.total ?? 0); })
      .catch(() => {}).finally(() => { if (alive) setLoadingCards(false); });
    return () => { alive = false; };
  }, [tag, search, cardsMode]);

  const childGroups = (tree?.groups ?? []).filter((g) => g.parent_group_id === currentGroupId);
  const childTags   = (tree?.tags   ?? []).filter((t) => t.group_id === currentGroupId);

  const openGroup = (g: BrowseGroup) => { setTag(null); setGroupPath((p) => [...p, { id: g.id, name: g.name }]); };
  const openTag   = (t: BrowseTag)   => { setTag({ id: t.id, name: t.name }); };
  const goRoot    = () => { setGroupPath([]); setTag(null); setSearch(""); };
  const goCrumb   = (i: number) => { setGroupPath((p) => p.slice(0, i + 1)); setTag(null); };

  const saveCard = async (fields: string[], target: "me" | "all") => {
    try {
      const res = await apiFetch("/api/card-layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: CARD_SCOPE, fields, target }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setCardFields(fields); setCustomizeOpen(false);
      toast.success(target === "all" ? "บันทึกเป็นค่าเริ่มต้นของทุกคนแล้ว" : "บันทึกการ์ดของคุณแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const resetCard = async () => {
    try {
      await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}&target=me`, { method: "DELETE" });
      const j = await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json());
      setCardFields(((j.default as string[] | null) && (j.default as string[]).length ? (j.default as string[]) : DEFAULT_CARD_FIELDS));
      setCustomizeOpen(false); toast.success("รีเซ็ตการ์ดแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "รีเซ็ตไม่สำเร็จ"); }
  };

  return (
    <div>
      {/* search + ปรับการ์ด */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา SKU ทั้งหมด (รหัส / ชื่อ) — หาได้จากทุกกลุ่ม"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <button onClick={() => setCustomizeOpen(true)}
          className="h-10 px-3 text-[13px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ ปรับการ์ด</button>
      </div>

      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap">
        <button onClick={goRoot} className={`hover:underline ${groupPath.length === 0 && !tag && !search ? "text-slate-700 font-medium" : "text-indigo-600"}`}>🏠 ทั้งหมด</button>
        {search.trim() && <><span className="text-slate-300">›</span><span className="text-slate-500">ค้นหา “{search.trim()}”</span></>}
        {!search.trim() && groupPath.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <button onClick={() => goCrumb(i)} className={`hover:underline ${i === groupPath.length - 1 && !tag ? "text-slate-700 font-medium" : "text-indigo-600"}`}>{c.name}</button>
          </span>
        ))}
        {!search.trim() && tag && <><span className="text-slate-300">›</span><span className="text-slate-700 font-medium">{tag.name}</span></>}
      </div>

      {/* body */}
      {cardsMode ? (
        loadingCards ? <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
        : cards.length === 0 ? <div className="text-center py-16 text-slate-400 text-sm">ไม่พบ SKU</div>
        : <>
            <p className="text-[12px] text-slate-400 mb-2">{total.toLocaleString("th-TH")} รายการ{total > cards.length ? ` (แสดง ${cards.length})` : ""}</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {cards.map((c) => <SkuCardView key={c.id} c={c} fields={cardFields} />)}
            </div>
          </>
      ) : (
        (childGroups.length === 0 && childTags.length === 0)
          ? <div className="text-center py-16 text-slate-400 text-sm">ยังไม่มีกลุ่มย่อย/แท็กในนี้</div>
          : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {childGroups.map((g) => (
                <button key={g.id} onClick={() => openGroup(g)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl">{g.icon || "📁"}</span><span className="text-slate-300">›</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{g.name}</p>
                  <p className="text-[11px] text-slate-400">กลุ่ม</p>
                </button>
              ))}
              {childTags.map((t) => (
                <button key={t.id} onClick={() => openTag(t)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl">🏷️</span><span className="text-[11px] text-slate-400">{t.sku_count.toLocaleString("th-TH")} SKU</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{t.name}</p>
                  <p className="text-[11px] text-indigo-500">ดูการ์ด SKU →</p>
                </button>
              ))}
            </div>
      )}

      {customizeOpen && (
        <CardCustomizeModal value={cardFields}
          onClose={() => setCustomizeOpen(false)} onSave={saveCard} onReset={resetCard} />
      )}
    </div>
  );
}

function SkuCardView({ c, fields }: { c: SkuCard; fields: string[] }) {
  const has = (k: string) => fields.includes(k);
  const showTopRow = has("code") || has("status");
  const showPriceRow = has("price") || has("stock");
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {has("image") && (
        <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
          {c.image
            ? <img src={withImageWidth(c.image, 320) ?? c.image} alt={c.code} loading="lazy" className="w-full h-full object-cover" />
            : <span className="text-3xl text-slate-300">🏷️</span>}
        </div>
      )}
      <div className="p-2.5">
        {showTopRow && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {has("code") && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c.code}</span>}
            {has("status") && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? "ใช้งาน" : "ปิด"}</span>}
          </div>
        )}
        {has("name") && <p className="text-[12px] text-slate-700 mt-1" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}>{c.name || "—"}</p>}
        {showPriceRow && (
          <div className="flex items-center justify-between mt-1.5">
            {has("price") ? <span className="text-[13px] font-medium text-slate-800">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</span> : <span />}
            {has("stock") && <span className="text-[11px] text-slate-400">สต๊อก {c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</span>}
          </div>
        )}
        {has("tags") && c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {c.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
            {c.tags.length > 3 && <span className="text-[10px] text-slate-400">+{c.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function CardCustomizeModal({ value, onClose, onSave, onReset }: {
  value: string[]; onClose: () => void; onSave: (f: string[], t: "me" | "all") => void; onReset: () => void;
}) {
  const [sel, setSel] = useState<string[]>(value);
  const [target, setTarget] = useState<"me" | "all">("me");
  const toggle = (k: string) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  return (
    <ERPModal open onClose={onClose} title="ปรับแต่งการ์ด SKU" size="sm"
      footer={
        <div className="flex items-center justify-between w-full">
          <button onClick={onReset} className="h-9 px-3 text-[13px] text-slate-500 hover:underline">รีเซ็ตเป็นค่าเริ่มต้น</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => onSave(sel, target)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
          </div>
        </div>
      }>
      <p className="text-[12px] text-slate-500 mb-2">เลือกฟิลด์ที่จะโชว์บนการ์ด</p>
      <div className="flex flex-col gap-1.5 mb-4">
        {CARD_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4" />
            {f.label}
          </label>
        ))}
      </div>
      <div className="pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-500 mb-1.5">บันทึกให้</p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
            <input type="radio" checked={target === "me"} onChange={() => setTarget("me")} /> เฉพาะฉัน
          </label>
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
            <input type="radio" checked={target === "all"} onChange={() => setTarget("all")} /> ทุกคน (ต้องมีสิทธิ์)
          </label>
        </div>
      </div>
    </ERPModal>
  );
}
