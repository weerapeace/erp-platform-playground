"use client";

/**
 * 📝 DetailInsertButton (ของกลาง) — ปุ่ม "＋ แทรก" ข้างหัวข้อช่องคำอธิบาย → ป๊อปเลือกรายละเอียดแล้วพิมพ์บรรทัดลงให้ตรงตำแหน่งที่เลือก
 *   เปิดใช้ที่ทะเบียนฟิลด์: ui_style.insert_details = true (ตอนนี้ = Description ของ Parent SKU) — ต่อสายใน components/master-crud ที่เดียว
 *   แท็บ: 📝 ข้อความสำเร็จรูป · 🧵 วัสดุ (ลิงก์ไปหน้าวัสดุบนเว็บอัตโนมัติ) · 🔢 ช่อง + ตัวเลข ("ช่องใส่บัตรเครดิต 6 ช่อง")
 *   ตำแหน่ง: คลิกช่องว่างระหว่างบรรทัดในตัวอย่าง (เห็นบรรทัดใหม่สีส้มตรงที่จะแทรก) · ฝั่งอังกฤษแทรกให้ด้วยถ้ามีคำอธิบายอังกฤษ
 *   เพิ่มรายการกลางได้ในป๊อป · แก้/ลบที่ /m/product_highlight_items และ /m/product_materials
 * กฎคิดบรรทัด: lib/detail-snippets.ts · วัสดุ: lib/product-materials.ts
 */
import { Fragment, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useTickCatalog } from "@/components/tick-list-field";
import { composeLines, enInsertAt, insertLines, isSlot, slotText, splitLines, type SnippetItem } from "@/lib/detail-snippets";
import { hasMaterialPage, type MaterialRow } from "@/lib/product-materials";

type Tab = "phrase" | "material" | "slot";

const SNIP = "product_highlight_items";
const MAT = "product_materials";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "phrase", label: "📝 ข้อความสำเร็จรูป", hint: "ติ๊กได้หลายข้อ — ได้บรรทัดละข้อ" },
  { key: "material", label: "🧵 วัสดุ", hint: "ติ๊กได้หลายตัว — รวมเป็นบรรทัดเดียว \"วัสดุ: …\" · วัสดุที่มีหน้า ลูกค้ากดดูบนเว็บได้" },
  { key: "slot", label: "🔢 ช่อง (ใส่ตัวเลข)", hint: "พิมพ์แค่จำนวน — ช่องที่ใส่ตัวเลขรวมเป็นบรรทัดเดียว" },
];

export function DetailInsertButton({
  thText,
  enText,
  hasEn,
  saveLabel,
  onApply,
}: {
  thText: string;
  enText: string;
  /** มีช่องคำอธิบายภาษาอังกฤษคู่กัน (ui_style.lang_en) */
  hasEn: boolean;
  /** หน้า "ดู" = บันทึกทันที → ปุ่มเขียน "แทรกและบันทึก" */
  saveLabel?: string;
  onApply: (next: { th: string; en?: string }) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-detail-insert
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="เลือกรายละเอียดสำเร็จรูป / วัสดุ / จำนวนช่อง แล้วแทรกลงคำอธิบายตรงตำแหน่งที่เลือก"
        className="ml-1.5 inline-flex items-center rounded-full border border-orange-300 px-2 py-[1px] align-middle text-[10.5px] font-medium text-orange-600 hover:bg-orange-50"
      >
        ＋ แทรก
      </button>
      {open && <DetailInsertModal thText={thText} enText={enText} hasEn={hasEn} saveLabel={saveLabel} onApply={onApply} onClose={() => setOpen(false)} />}
    </>
  );
}

function DetailInsertModal({
  thText,
  enText,
  hasEn,
  saveLabel,
  onApply,
  onClose,
}: {
  thText: string;
  enText: string;
  hasEn: boolean;
  saveLabel?: string;
  onApply: (next: { th: string; en?: string }) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: snipRows, loading: snipLoading, revalidate: reloadSnips } = useTickCatalog(SNIP);
  const { data: matRows, loading: matLoading, revalidate: reloadMats } = useTickCatalog(MAT);
  const snips = (snipRows ?? []) as unknown as SnippetItem[];
  const mats = (matRows ?? []) as unknown as MaterialRow[];
  const phraseItems = snips.filter((x) => !isSlot(x));
  const slotItems = snips.filter(isSlot);

  const lines = useMemo(() => splitLines(thText), [thText]);
  const [tab, setTab] = useState<Tab>("phrase");
  const [q, setQ] = useState("");
  const [phraseIds, setPhraseIds] = useState<string[]>([]);
  const [matIds, setMatIds] = useState<string[]>([]);
  const [slotN, setSlotN] = useState<Record<string, string>>({});
  const [at, setAt] = useState(lines.length);
  const [withEn, setWithEn] = useState(hasEn && enText.trim() !== "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const sel = {
    phrases: phraseIds.map((id) => phraseItems.find((x) => x.id === id)).filter((x): x is SnippetItem => !!x),
    materials: matIds.map((id) => mats.find((x) => x.id === id)).filter((x): x is MaterialRow => !!x),
    slots: slotItems.map((item) => ({ item, n: Math.floor(Number(slotN[item.id])) || 0 })).filter((p) => p.n > 0),
  };
  const out = composeLines(sel);
  const picked = out.th.length > 0;
  const enLines = splitLines(enText);
  const enAppend = withEn && enLines.length > 0 && enLines.length !== lines.length;

  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const needle = q.trim().toLowerCase();
  const match = (x: { name: string; name_en?: string | null }) => !needle || `${x.name} ${x.name_en ?? ""}`.toLowerCase().includes(needle);

  const addItem = async () => {
    const name = newName.trim();
    if (!name) {
      toast.warning("พิมพ์ชื่อก่อน");
      return;
    }
    const list: { name: string }[] = tab === "material" ? mats : tab === "slot" ? slotItems : phraseItems;
    if (list.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.warning(`มี "${name}" อยู่แล้ว — เลือกในรายการได้เลย`);
      return;
    }
    setBusy(true);
    try {
      const catalog = tab === "material" ? MAT : SNIP;
      const body = tab === "material" ? { name, sort_order: 500, is_active: true } : { name, kind: tab, sort_order: 500, is_active: true };
      const r = await apiFetch(`/api/master-v2/${catalog}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error || !j.data?.id) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      await (tab === "material" ? reloadMats(true) : reloadSnips(true));
      const id = String(j.data.id);
      if (tab === "phrase") setPhraseIds((p) => [...p, id]);
      if (tab === "material") setMatIds((p) => [...p, id]);
      setNewName("");
      setAdding(false);
      toast.success(`เพิ่ม "${name}" เข้ารายการกลางแล้ว (ใช้ได้ทุกรุ่น)${tab === "slot" ? " — ใส่จำนวนได้เลย" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!picked) {
      toast.warning("ยังไม่ได้เลือกรายละเอียด");
      return;
    }
    const th = insertLines(thText, out.th, at);
    const en = withEn && hasEn && out.en.length ? insertLines(enText, out.en, enInsertAt(thText, enText, at)) : undefined;
    setSaving(true);
    try {
      const ok = await onApply({ th, en });
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  };

  const loading = (snipLoading && !snipRows) || (matLoading && !matRows);
  const tabInfo = TABS.find((t) => t.key === tab)!;
  const countOf = (t: Tab) => (t === "phrase" ? sel.phrases.length : t === "material" ? sel.materials.length : sel.slots.length);

  return (
    <ERPModal
      open
      onClose={onClose}
      size="lg"
      defaultExpanded={false}
      hasUnsavedChanges={picked}
      title="แทรกรายละเอียด"
      description="เลือกรายละเอียด แล้วคลิกตำแหน่งในตัวอย่างด้านล่างว่าจะแทรกตรงไหน — ระบบพิมพ์บรรทัดลงคำอธิบายให้ (แก้ต่อได้เหมือนพิมพ์เอง)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">{picked ? `จะแทรก ${out.th.length} บรรทัด` : "ยังไม่ได้เลือก"}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button type="button" onClick={() => void apply()} disabled={saving || !picked} data-detail-insert-apply
            className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : saveLabel ?? "แทรก"}
          </button>
        </div>
      }
    >
      <div className="space-y-3" data-detail-insert-modal>
        {/* แท็บชนิด — เลือกข้ามแท็บได้ (รวมกันตอนแทรก) */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setAdding(false); setNewName(""); }}
              className={`h-8 rounded-lg border px-3 text-[12.5px] font-medium ${tab === t.key ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {t.label}
              {countOf(t.key) > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white">{countOf(t.key)}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11.5px] text-slate-500">{tabInfo.hint}</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…"
            className="h-8 w-40 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <div className="max-h-60 space-y-1 overflow-auto pr-1">
            {tab === "phrase" &&
              (phraseItems.filter(match).length ? phraseItems.filter(match).map((it) => {
                const on = phraseIds.includes(it.id);
                return (
                  <label key={it.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input type="checkbox" checked={on} onChange={() => setPhraseIds((p) => toggle(p, it.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                    <span className={`flex-1 text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{it.name}</span>
                    {it.name_en ? <span className="truncate text-[11px] text-slate-400">{it.name_en}</span> : <span className="text-[11px] text-slate-300">ไม่มีอังกฤษ</span>}
                  </label>
                );
              }) : <p className="py-3 text-center text-xs text-slate-400">ไม่พบข้อความ — เพิ่มใหม่ได้ด้านล่าง</p>)}

            {tab === "material" &&
              (mats.filter(match).length ? mats.filter(match).map((m) => {
                const on = matIds.includes(m.id);
                const page = hasMaterialPage(m);
                return (
                  <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={on} onChange={() => setMatIds((p) => toggle(p, m.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                      <span className={`text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{m.name}</span>
                      {m.name_en && <span className="truncate text-[11px] text-slate-400">{m.name_en}</span>}
                    </label>
                    {page ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-700" title="ชื่อวัสดุนี้บนเว็บกดไปหน้าวัสดุได้">🔗 มีหน้าวัสดุ</span>
                    ) : (
                      <a href={`/m/${MAT}?open=${m.id}`} target="_blank" rel="noreferrer" title="เขียนคำอธิบายวัสดุ → บนเว็บจะกดลิงก์มาหน้านี้ได้"
                        className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500 hover:text-blue-600">ยังไม่มีหน้า · เขียน ↗</a>
                    )}
                  </div>
                );
              }) : <p className="py-3 text-center text-xs text-slate-400">ไม่พบวัสดุ — เพิ่มใหม่ได้ด้านล่าง</p>)}

            {tab === "slot" &&
              (slotItems.filter(match).length ? slotItems.filter(match).map((it) => {
                const n = Math.floor(Number(slotN[it.id])) || 0;
                return (
                  <div key={it.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${n > 0 ? "border-orange-300 bg-orange-50" : "border-slate-200"}`}>
                    <span className={`flex-1 text-sm ${n > 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>{it.name}</span>
                    {n > 0 && <span className="hidden truncate text-[11px] text-slate-400 sm:inline">→ {slotText(it, n, "th")}</span>}
                    <input aria-label={`จำนวน ${it.name}`} type="number" inputMode="numeric" min={0} max={99} step={1} value={slotN[it.id] ?? ""} placeholder="0"
                      onChange={(e) => setSlotN((p) => ({ ...p, [it.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                      className="h-8 w-16 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    <span className="w-6 text-xs text-slate-400">ช่อง</span>
                  </div>
                );
              }) : <p className="py-3 text-center text-xs text-slate-400">ไม่พบช่อง — เพิ่มใหม่ได้ด้านล่าง</p>)}
          </div>
        )}

        {/* เพิ่มรายการกลาง + ลิงก์แก้/ลบ */}
        <div className="border-t border-slate-100 pt-2">
          {adding ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={160} autoFocus
                placeholder={tab === "material" ? "ชื่อวัสดุ เช่น หนังวัวแท้" : tab === "slot" ? "ชื่อช่อง เช่น ช่องใส่เหรียญ" : "ข้อความ เช่น ผลิตในประเทศไทย"}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
                className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <button type="button" onClick={() => void addItem()} disabled={busy} className="h-8 rounded-md bg-slate-800 px-3 text-xs text-white disabled:opacity-50">{busy ? "กำลังเพิ่ม…" : "เพิ่ม"}</button>
              <button type="button" onClick={() => { setAdding(false); setNewName(""); }} className="h-8 px-1.5 text-xs text-slate-500">ยกเลิก</button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => setAdding(true)} className="text-orange-600 hover:underline">
                ＋ เพิ่ม{tab === "material" ? "วัสดุ" : tab === "slot" ? "ช่อง" : "ข้อความ"}ใหม่
              </button>
              <a href={`/m/${tab === "material" ? MAT : SNIP}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 hover:underline">
                {tab === "material" ? "แก้วัสดุ / เขียนหน้าวัสดุ ↗" : "แก้/ลบรายการกลาง (ชื่ออังกฤษ · รูปแบบบรรทัด) ↗"}
              </a>
            </div>
          )}
        </div>

        {/* ตำแหน่ง: บรรทัดเดิม + ช่องคลิกระหว่างบรรทัด · บรรทัดใหม่สีส้มตรงที่จะแทรก */}
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11.5px] text-slate-500">
            <span className="flex-1 font-medium text-slate-600">ตำแหน่งที่จะแทรก — คลิกระหว่างบรรทัด</span>
            <button type="button" onClick={() => setAt(0)} className={`rounded px-1.5 ${at === 0 ? "bg-orange-100 text-orange-700" : "hover:bg-slate-100"}`}>บนสุด</button>
            <button type="button" onClick={() => setAt(lines.length)} className={`rounded px-1.5 ${at === lines.length ? "bg-orange-100 text-orange-700" : "hover:bg-slate-100"}`}>ท้ายสุด</button>
          </div>
          <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50/60 p-1.5 text-[13px] leading-snug" data-detail-insert-preview>
            {Array.from({ length: lines.length + 1 }).map((_, i) => (
              <Fragment key={i}>
                {i === at ? (
                  <div className="my-0.5 rounded-md border border-dashed border-orange-300 bg-orange-50 px-2 py-1" data-insert-here>
                    {picked ? out.th.map((l, j) => <div key={j} className="text-orange-700">{l}</div>) : <span className="text-[11.5px] text-orange-600">⤵ บรรทัดใหม่จะอยู่ตรงนี้</span>}
                  </div>
                ) : (
                  <button type="button" onClick={() => setAt(i)} title="แทรกตรงนี้" data-insert-gap={i}
                    className="group flex h-3 w-full items-center rounded hover:h-5 hover:bg-orange-50">
                    <span className="hidden pl-2 text-[10.5px] text-orange-600 group-hover:inline">⤵ แทรกตรงนี้</span>
                  </button>
                )}
                {i < lines.length && <div className="whitespace-pre-wrap px-2 text-slate-600">{lines[i] || " "}</div>}
              </Fragment>
            ))}
            {!lines.length && <p className="px-2 text-[11.5px] text-slate-400">คำอธิบายยังว่าง — จะใส่เป็นบรรทัดแรก</p>}
          </div>
        </div>

        {hasEn && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={withEn} onChange={(e) => setWithEn(e.target.checked)} className="h-4 w-4 accent-orange-500" />
              <span>ใส่ภาษาอังกฤษในคำอธิบายอังกฤษด้วย</span>
            </label>
            {withEn && picked && out.en.length > 0 && <div className="pl-6 text-slate-500">{out.en.map((l, j) => <div key={j}>{l}</div>)}</div>}
            {!enText.trim() && <p className="pl-6 text-slate-400">คำอธิบายอังกฤษยังว่าง — ติ๊กแล้วจะได้แค่บรรทัดใหม่ หรือปล่อยไว้แล้วกด 🌐 แปลทั้งหมด ทีหลัง</p>}
            {withEn && out.enMissing > 0 && <p className="pl-6 text-amber-700">⚠️ {out.enMissing} บรรทัดยังไม่มีชื่ออังกฤษในรายการกลาง — ฝั่งอังกฤษจะข้ามบรรทัดนั้น</p>}
            {enAppend && <p className="pl-6 text-slate-400">จำนวนบรรทัดอังกฤษไม่เท่าภาษาไทย — ฝั่งอังกฤษจะต่อท้ายให้</p>}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
