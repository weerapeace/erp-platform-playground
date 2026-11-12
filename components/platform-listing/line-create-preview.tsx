"use client";

/**
 * ดูและแก้ก่อนส่งขึ้น LINE — ใช้ในตัวช่วยลงสินค้า (AddToPlatformWizard) ขั้น 2
 * เจ้าของขอ 2026-11-10: "ต้องบอกด้วยว่ารายละเอียดจะดึงอะไรไปบ้าง แก้ได้ด้วย ทำให้ดูง่ายด้วย"
 *
 * ข้อมูล = GET /api/line-shopping/create-product?parent_sku_id= (ของกลาง lib/line-create-payload — ตัวเดียวกับตอนส่งจริง)
 * ทุกช่องบอก "มาจากไหน" + ปุ่มแก้:
 *   ชื่อ / รายละเอียด / หมวด → ร่างของ LINE (PATCH /api/product-platforms) — ไม่เปลี่ยนข้อมูลสินค้าในระบบ
 *   แบรนด์ / น้ำหนัก / รูป → ร่าง extra (brand / weight / line_images) — ไม่เปลี่ยนข้อมูลสินค้าในระบบ
 *   ราคา → **เปลี่ยนราคาในระบบ** (POST /api/product-platforms/sku-price · มีประวัติ) — เจ้าของเลือก 2026-11-10 ให้ราคามีที่เดียว
 *     ราคาที่สืบทอดจากตัวสี → แก้ที่ตัวสี (ทุกตัวที่ใช้ราคานั้นเปลี่ยนตาม)
 * ของกลางที่ใช้: MiniTable · MoneyInput · RichTextEditor · PlatformCategoryPicker · sortable-list · state-views · Icon
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { PlatformCategoryPicker } from "@/components/platform-category-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { r2ImageUrl, avatarSrc } from "@/lib/r2-image";
import { linePrice } from "@/lib/platform-listing-builder";
import { MAX_LINE_DESC_IMAGES } from "@/lib/line-listing-edit";
import { sameGift, type GiftSetting } from "@/lib/line-gift";
import { LineGiftPicker } from "./line-gift-picker";
import { LINE_CREATE_MAX_IMAGES, type LineCreatePreview, type LineCreateVariantRow } from "@/lib/line-create-payload";

const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false, loading: () => <div className="h-40 rounded-lg bg-slate-50" /> });

type EditKey = "name" | "brand" | "weight" | "desc" | "cat" | null;
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const numOrNull = (raw: string): number | null => { const s = raw.replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : null; };

export function LineCreatePreviewEditor({ parentId, canEdit, canEditPrice, onLoaded }: {
  parentId: string;
  /** แก้ร่าง (ชื่อ/หมวด/รูป ฯลฯ) — products.platforms.edit */
  canEdit: boolean;
  /** แก้ราคาในระบบ — products.edit */
  canEditPrice: boolean;
  /** โหลด/แก้เสร็จ → ส่งสรุปให้ตัวช่วย (ขาดอะไร) */
  onLoaded?: (pv: LineCreatePreview) => void;
}) {
  const toast = useToast();
  const [pv, setPv] = useState<LineCreatePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditKey>(null);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<string[] | null>(null);            // รูปที่ติ๊กเลือก (null = ตามที่จะส่งตอนนี้)
  const [dsel, setDsel] = useState<string[] | null>(null);          // รูปในรายละเอียด ที่ติ๊ก (null = ตามร่าง)
  const [gsel, setGsel] = useState<GiftSetting | null>(null);       // ของขวัญที่กำลังแก้ (null = ตามร่าง/ค่าเริ่ม)
  const [dpick, setDpick] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [pool, setPool] = useState<{ key: string; source: string }[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});  // `${sku_id}:fake|sale` → ค่าที่พิมพ์

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/line-shopping/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json()) as { preview: LineCreatePreview | null; error: string | null };
      if (j.error || !j.preview) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setPv(j.preview); onLoaded?.(j.preview);
    } catch (e) { setErr((e as Error).message); }
  }, [parentId, onLoaded]);
  useEffect(() => { setPv(null); setEdit(null); setSel(null); setDsel(null); setGsel(null); setDpick(false); setPool(null); setPrices({}); setDescOpen(false); void load(); }, [load]);

  const patchDraft = async (body: Record<string, unknown>, okMsg: string) => {
    if (!pv) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentId, platform_id: pv.platform_id, ...body }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(okMsg); setEdit(null); setSel(null); setDsel(null); setGsel(null); setDpick(false);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const patchExtra = (partial: Record<string, unknown>, okMsg: string) => patchDraft({ extra: { ...(pv?.draft_extra ?? {}), ...partial } }, okMsg);

  const startEdit = (k: EditKey, v: string) => { setEdit(k); setVal(v); };
  const saveField = () => {
    if (!pv) return;
    if (edit === "name") { if (!val.trim()) { toast.warning("ชื่อว่างไม่ได้"); return; } void patchDraft({ title: val.trim() }, "บันทึกชื่อแล้ว"); }
    else if (edit === "desc") void patchDraft({ description: val }, "บันทึกรายละเอียดแล้ว");
    else if (edit === "brand") void patchExtra({ brand: val.trim() || null }, "บันทึกแบรนด์แล้ว");
    else if (edit === "weight") {
      const n = val.trim() ? Number(val) : null;
      if (n != null && (!Number.isFinite(n) || n < 0)) { toast.warning("น้ำหนักต้องเป็นตัวเลข (กิโลกรัม)"); return; }
      void patchExtra({ weight: n != null ? Math.round(n * 100) / 100 : null }, n != null ? "บันทึกน้ำหนักแล้ว" : "กลับไปใช้น้ำหนักสินค้าในระบบ");
    }
  };

  // ---------- รูป: รูปทั้งหมดของสินค้า → ติ๊กเลือก (≤7) + ลากเรียง · บันทึก = ร่าง extra.line_images ----------
  const curImgs = sel ?? pv?.images.keys ?? [];
  const imgDirty = !!sel && !!pv && sel.join("|") !== pv.images.keys.join("|");
  const drag = useDragReorder((from, to) => setSel((xs) => moveItem(xs ?? curImgs, from, to)), { group: "line-create-images" });
  const toggleImg = (key: string) => setSel(() => {
    const cur = curImgs;
    if (cur.includes(key)) return cur.filter((k) => k !== key);
    return cur.length < LINE_CREATE_MAX_IMAGES ? [...cur, key] : cur;
  });
  // รูปในรายละเอียด: ต่อท้ายข้อความหลังลงร้าน (ฝากรูปผ่านแกลเลอรี) · บันทึก = ร่าง extra.line_desc_images
  const curDesc = dsel ?? pv?.desc_images ?? [];
  const descDirty = !!dsel && !!pv && dsel.join("|") !== pv.desc_images.join("|");
  const dragDesc = useDragReorder((from, to) => setDsel((xs) => moveItem(xs ?? curDesc, from, to)), { group: "line-create-desc-images" });
  const toggleDesc = (key: string) => setDsel(() => {
    const cur = curDesc;
    if (cur.includes(key)) return cur.filter((k) => k !== key);
    return cur.length < MAX_LINE_DESC_IMAGES ? [...cur, key] : cur;
  });

  useEffect(() => {
    if (!pv || pool) return;
    let alive = true;
    apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json())
      .then((j: { images?: { key: string; source: string }[]; descImages?: { key: string; source: string }[] }) => {
        if (!alive) return;
        const seen = new Set<string>(); const all: { key: string; source: string }[] = [];
        for (const im of [...(j.images ?? []), ...(j.descImages ?? [])]) if (im.key && !seen.has(im.key)) { seen.add(im.key); all.push({ key: im.key, source: im.source.replace(/^Description (\d+)$/, "รูปในรายละเอียด $1") }); }
        setPool(all);
      })
      .catch(() => { if (alive) setPool([]); });
    return () => { alive = false; };
  }, [pv, pool, parentId]);

  // ---------- ราคา (เปลี่ยนในระบบ) ----------
  const priceKey = (id: string, f: "fake" | "sale") => `${id}:${f}`;
  const changed = useMemo(() => {
    if (!pv) return [] as { sku_id: string; field: "fake_price" | "list_price"; price: number | null; code: string }[];
    const out = new Map<string, { sku_id: string; field: "fake_price" | "list_price"; price: number | null; code: string }>();
    for (const v of pv.variants) {
      for (const f of ["fake", "sale"] as const) {
        const raw = prices[priceKey(v.sku_id, f)];
        if (raw === undefined) continue;
        const n = numOrNull(raw);
        const cur = f === "fake" ? v.fake : v.sale;
        if ((n ?? null) === (cur ?? null)) continue;
        const owner = f === "fake" ? v.fake_sku_id : v.sale_sku_id;
        const code = (f === "fake" ? v.fake_sku_code : v.sale_sku_code) ?? v.code;
        if (owner) out.set(`${owner}:${f}`, { sku_id: owner, field: f === "fake" ? "fake_price" : "list_price", price: n, code });
      }
    }
    return [...out.values()];
  }, [pv, prices]);
  const savePrices = async () => {
    if (!changed.length) return;
    setSaving(true);
    let ok = 0; const fails: string[] = [];
    for (const c of changed) {
      try {
        const r = await apiFetch("/api/product-platforms/sku-price", { method: "POST", body: JSON.stringify({ sku_id: c.sku_id, price: c.price, field: c.field }) });
        const j = await r.json();
        if (!r.ok || j.error) fails.push(`${c.code}: ${j.error || "ไม่สำเร็จ"}`); else ok++;
      } catch (e) { fails.push(`${c.code}: ${(e as Error).message}`); }
    }
    setSaving(false);
    if (ok) toast.success(`บันทึกราคาในระบบแล้ว ${ok} ช่อง`);
    if (fails.length) toast.error(`บันทึกไม่สำเร็จ: ${fails.slice(0, 3).join(" · ")}`);
    setPrices({});
    await load();
  };

  if (err && !pv) return <ErrorState hint={err} onRetry={() => void load()} />;
  if (!pv) return <LoadingState label="กำลังเตรียมข้อมูลที่จะส่งขึ้น LINE..." />;

  const pending = (v: LineCreateVariantRow, f: "fake" | "sale") => prices[priceKey(v.sku_id, f)];
  // ลูกค้าจ่าย = กฎกลาง linePrice (ราคาเต็ม − ส่วนลด) · คิดจากค่าที่กำลังพิมพ์ด้วย
  const pay = (v: LineCreateVariantRow) => {
    const fake = pending(v, "fake") !== undefined ? numOrNull(pending(v, "fake")!) : v.fake;
    const sale = pending(v, "sale") !== undefined ? numOrNull(pending(v, "sale")!) : v.sale;
    const lp = linePrice(fake, sale);
    return { full: lp?.price ?? 0, pay: lp ? lp.price - lp.discount : 0 };
  };
  const priceCell = (v: LineCreateVariantRow, f: "fake" | "sale") => {
    const owner = f === "fake" ? v.fake_sku_code : v.sale_sku_code;
    const inherited = owner && owner !== v.code;
    const cur = f === "fake" ? v.fake : v.sale;
    return (
      <div>
        {canEditPrice
          ? <MoneyInput value={pending(v, f) ?? (cur ?? "")} onChange={(raw) => setPrices((p) => ({ ...p, [priceKey(v.sku_id, f)]: raw }))} placeholder="—" className={`h-8 w-full rounded-md border px-2 text-right text-sm ${pending(v, f) !== undefined ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`} />
          : <span>{cur ? baht(cur) : "—"}</span>}
        {inherited && <div className="truncate text-[10px] text-slate-400" title={`ราคานี้มาจาก ${owner} (ตัวสี) — แก้แล้วทุกตัวที่ใช้ราคานี้เปลี่ยนตาม`}>จาก {owner}</div>}
      </div>
    );
  };
  const cols: MiniColumn<LineCreateVariantRow>[] = [
    { key: "opt", header: pv.option_names.join(" · ") || "ตัวเลือก", width: "1.6fr", cell: (v) => (
      <div className="flex min-w-0 items-center gap-2">
        {v.image_key ? <img src={r2ImageUrl(v.image_key, 96) ?? ""} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-50 text-slate-300"><Icon name="image" /></span>}
        <div className="min-w-0"><div className="truncate">{v.options.join(" · ") || "—"}</div><div className="truncate font-mono text-[11px] text-slate-400">{v.code}</div></div>
      </div>
    ) },
    { key: "fake", header: "ราคาเต็ม", width: "6.5rem", align: "right", cell: (v) => priceCell(v, "fake") },
    { key: "sale", header: "ราคาขาย", width: "6.5rem", align: "right", cell: (v) => priceCell(v, "sale") },
    { key: "pay", header: "ลูกค้าจ่าย", width: "6rem", align: "right", cell: (v) => { const x = pay(v); return x.pay ? <span className={x.pay < x.full ? "text-emerald-700" : ""}>{baht(x.pay)}</span> : <span className="text-rose-600">ไม่มีราคา</span>; } },
    { key: "stock", header: "สต๊อก", width: "4rem", align: "right", cell: (v) => <span className={v.stock > 0 ? "" : "text-amber-700"}>{v.stock.toLocaleString()}</span> },
  ];

  const fieldRow = (k: Exclude<EditKey, null>, label: string, value: ReactNode, src: string, startVal: string, bad = false) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-2 border-t border-slate-100 py-2 text-sm">
      <span className="pt-0.5 text-slate-500">{label}</span>
      <div className="min-w-0">
        {edit === k ? (
          k === "desc" ? <RichTextEditor value={val} onChange={setVal} minHeight={180} />
          : k === "cat" ? <PlatformCategoryPicker platformId={pv.platform_id} placeholder="พิมพ์ค้นหมวด LINE เช่น กระเป๋า / bag" onPick={(label) => void patchDraft({ category_path: label }, "บันทึกหมวด LINE แล้ว")} />
          : <input autoFocus value={val} onChange={(e) => setVal(k === "weight" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveField(); if (e.key === "Escape") setEdit(null); }}
              placeholder={k === "weight" ? "กิโลกรัม เช่น 0.35 · ว่าง = ใช้น้ำหนักในระบบ" : ""} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
        ) : <div className={bad ? "text-rose-700" : "break-words"}>{value}</div>}
        <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {src}</div>
      </div>
      {canEdit && (edit === k ? (
        <div className="flex gap-1">
          {k !== "cat" && <button type="button" disabled={saving} onClick={saveField} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>}
          <button type="button" onClick={() => setEdit(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
        </div>
      ) : <button type="button" disabled={saving} onClick={() => startEdit(k, startVal)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50 disabled:opacity-40">{k === "cat" ? (pv.category.id ? "เปลี่ยน" : "เลือก") : "แก้"}</button>)}
    </div>
  );

  // รูปทั้งหมดให้เลือก = รูปของสินค้าในระบบ + รูปที่ใช้อยู่แต่ไม่อยู่ในคลัง (เช่น ร่างเก่า / ลิงก์รูปที่คัดลอกจากร้านต้นทาง — เอาออกแล้วเลือกกลับได้)
  const poolAll = [...[...new Set([...curImgs, ...pv.images.keys])].filter((k) => !(pool ?? []).some((im) => im.key === k)).map((k) => ({ key: k, source: /^https?:\/\//i.test(k) ? "จากร้านต้นทาง" : "ใช้อยู่" })), ...(pool ?? [])];
  return (
    <div className="space-y-3">
      {(pv.missing.length > 0 || pv.blockers.length > 0) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {pv.missing.length > 0 && <div><Icon name="warning" /> ยังขาด: {pv.missing.join(" · ")} — ต้องเติมก่อนถึงจะลงได้</div>}
          {pv.blockers.map((b) => <div key={b}><Icon name="warning" /> {b}</div>)}
        </div>
      )}

      {/* รูป: ที่จะส่ง (ลากเรียง) + รูปทั้งหมดของสินค้า (ติ๊กเลือก) */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">รูปที่จะส่ง {curImgs.length}/{LINE_CREATE_MAX_IMAGES} · รูปแรก = ปก{canEdit ? " · ลากที่หูจับเพื่อเรียง" : ""}</span>
          {canEdit && (imgDirty || pv.images.custom) && (
            <div className="flex gap-1">
              {imgDirty && <button type="button" disabled={saving || curImgs.length === 0} onClick={() => void patchExtra({ line_images: curImgs }, "บันทึกรูปแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกรูปที่เลือก</button>}
              {imgDirty && <button type="button" onClick={() => setSel(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
              {!imgDirty && pv.images.custom && <button type="button" disabled={saving} onClick={() => void patchExtra({ line_images: null }, "กลับไปใช้รูปอัตโนมัติ")} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้รูปอัตโนมัติ</button>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {curImgs.map((k, i) => (
            <div key={`${k}-${i}`} {...(canEdit ? drag.rowProps(i) : {})} className={`relative h-20 w-20 overflow-hidden rounded-lg border bg-slate-50 ${i === 0 ? "border-violet-400" : "border-slate-200"} ${canEdit ? drag.rowCls(i) : ""}`}>
              <img src={avatarSrc(k, 200) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className={`absolute left-1 top-1 rounded-full px-1.5 text-[10px] ${i === 0 ? "bg-violet-600 text-white" : "bg-white/90 text-slate-600"}`}>{i === 0 ? "ปก" : i + 1}</span>
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-white/90 px-1 text-[10px]">
                  <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียง" />
                  <button type="button" onClick={() => toggleImg(k)} className="ml-auto text-rose-600 hover:underline">เอาออก</button>
                </div>
              )}
            </div>
          ))}
          {curImgs.length === 0 && <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-rose-300 text-[11px] text-rose-600">ไม่มีรูป</div>}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">มาจาก: {imgDirty ? "ที่เลือกตอนนี้ (ยังไม่บันทึก)" : pv.images.src}</div>
        {canEdit && (
          <div className="mt-2 rounded-lg border border-slate-200 p-2">
            <div className="mb-1.5 text-xs text-slate-500">รูปทั้งหมดของสินค้านี้ {pool ? `(${poolAll.length.toLocaleString()} รูป)` : ""} — กดเพื่อเลือก / เอาออก · เลือกได้ {LINE_CREATE_MAX_IMAGES} รูป</div>
            {!pool ? <div className="text-xs text-slate-400">กำลังโหลดรูป...</div> : poolAll.length === 0 ? <div className="text-xs text-slate-400">สินค้านี้ยังไม่มีรูปในระบบ</div> : (
              <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 overflow-y-auto">
                {poolAll.map((im) => {
                  const idx = curImgs.indexOf(im.key);
                  const full = idx < 0 && curImgs.length >= LINE_CREATE_MAX_IMAGES;
                  return (
                    <button key={im.key} type="button" onClick={() => toggleImg(im.key)} disabled={full}
                      title={full ? `เลือกครบ ${LINE_CREATE_MAX_IMAGES} รูปแล้ว — เอารูปอื่นออกก่อน` : idx >= 0 ? "กดเพื่อเอาออก" : "กดเพื่อเลือก"}
                      className={`min-w-0 rounded-lg border p-1 text-left ${idx >= 0 ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 hover:bg-slate-50"} disabled:opacity-40`}>
                      <div className="relative aspect-square overflow-hidden rounded bg-slate-50">
                        <img src={avatarSrc(im.key, 200) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <span className={`absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${idx >= 0 ? "bg-violet-600 text-white" : "border border-slate-300 bg-white/90 text-transparent"}`}>{idx >= 0 ? (idx === 0 ? "ปก" : idx + 1) : "·"}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500" title={im.source}>{im.source}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ช่องข้อความ */}
      <div>
        {fieldRow("name", "ชื่อ", pv.name.value || "(ยังไม่มีชื่อ)", pv.name.src, pv.name.value, !pv.name.value)}
        {fieldRow("cat", "หมวด LINE", pv.category.label || "ยังไม่ได้เลือก — ต้องเลือกก่อนส่ง", pv.category.src, "", !pv.category.id)}
        {fieldRow("brand", "แบรนด์", pv.brand.value || "(ไม่มี)", pv.brand.src, pv.brand.value)}
        {fieldRow("desc", "รายละเอียด", pv.description.value ? (
          <div>
            {/* แสดงแบบที่ LINE จะเห็น: ย่อหน้า + บรรทัดว่าง + ย่อหน้าเยื้อง (แปลงจากข้อความธรรมดาด้วย noteToHtml · LINE_DESC_HTML) */}
            <div className={`tiptap-content overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm leading-relaxed text-slate-700 [&_img]:max-w-full [&_p]:my-0 ${descOpen ? "max-h-[60vh]" : "max-h-44"}`}
              dangerouslySetInnerHTML={{ __html: pv.description.value }} />
            <button type="button" onClick={() => setDescOpen((o) => !o)} className="mt-1 text-xs text-violet-700 hover:underline">{descOpen ? "ย่อ" : "ดูทั้งหมด"}</button>
          </div>
        ) : "(ไม่มีรายละเอียด)", `${pv.description.src} · จัดย่อหน้าให้แบบเดียวกับบน LINE · รูปต่อท้ายเลือกได้ที่ช่อง "รูปในรายละเอียด" ด้านล่าง`, pv.description.value, !pv.description.value)}
        {/* รูปในรายละเอียด — ทดสอบผ่านแล้ว 2026-11-10/12 (LINE รับ · รูปไม่หายหลัง 2 วัน) */}
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-2 border-t border-slate-100 py-2 text-sm">
          <span className="pt-0.5 text-slate-500">รูปในรายละเอียด</span>
          <div className="min-w-0">
            {curDesc.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {curDesc.map((k, i) => (
                  <div key={`${k}-${i}`} {...(canEdit ? dragDesc.rowProps(i) : {})} className={`relative h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-50 ${canEdit ? dragDesc.rowCls(i) : ""}`}>
                    <img src={r2ImageUrl(k, 160) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <span className="absolute left-0.5 top-0.5 rounded-full bg-white/90 px-1 text-[10px] text-slate-600">{i + 1}</span>
                    {canEdit && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center bg-white/90 px-0.5 text-[10px]">
                        <DragHandle {...dragDesc.handleProps(i)} title="ลากเพื่อเรียง" />
                        <button type="button" onClick={() => toggleDesc(k)} className="ml-auto text-rose-600 hover:underline">ออก</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <span className="text-slate-400">ไม่มี</span>}
            <div className="mt-0.5 text-[11px] text-slate-400">ต่อท้ายข้อความรายละเอียด หลังลงร้านเสร็จ (ฝากรูปผ่านรูปสินค้าชั่วคราวแล้วคืน) · สูงสุด {MAX_LINE_DESC_IMAGES} รูป · ร้านส่วนใหญ่ใส่ 6–7 รูป</div>
            {canEdit && dpick && (
              <div className="mt-2 rounded-lg border border-slate-200 p-2">
                {!pool ? <div className="text-xs text-slate-400">กำลังโหลดรูป...</div> : pool.length === 0 ? <div className="text-xs text-slate-400">สินค้านี้ยังไม่มีรูปในระบบ</div> : (
                  <>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>กดเลือกตามลำดับที่อยากให้เรียง · เลือกแล้ว {curDesc.length}</span>
                      {pool.some((im) => im.source.startsWith("รูปในรายละเอียด")) && (
                        <button type="button" onClick={() => setDsel(pool.filter((im) => im.source.startsWith("รูปในรายละเอียด")).map((im) => im.key).slice(0, MAX_LINE_DESC_IMAGES))} className="text-violet-700 hover:underline">
                          ใช้รูปรายละเอียดในระบบทั้งหมด ({pool.filter((im) => im.source.startsWith("รูปในรายละเอียด")).length})
                        </button>
                      )}
                    </div>
                    <div className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto">
                      {pool.map((im) => {
                        const idx = curDesc.indexOf(im.key);
                        const full = idx < 0 && curDesc.length >= MAX_LINE_DESC_IMAGES;
                        return (
                          <button key={im.key} type="button" disabled={full} onClick={() => toggleDesc(im.key)} title={im.source}
                            className={`min-w-0 rounded-md border p-0.5 text-left ${idx >= 0 ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 hover:bg-slate-50"} disabled:opacity-40`}>
                            <div className="relative aspect-square overflow-hidden rounded bg-slate-50">
                              <img src={r2ImageUrl(im.key, 160) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                              {idx >= 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] text-white">{idx + 1}</span>}
                            </div>
                            <div className="truncate text-[10px] text-slate-500">{im.source}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1">
              {descDirty && <button type="button" disabled={saving} onClick={() => void patchExtra({ line_desc_images: curDesc.length ? curDesc : null }, "บันทึกรูปในรายละเอียดแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>}
              {descDirty && <button type="button" onClick={() => { setDsel(null); setDpick(false); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
              {!descDirty && <button type="button" disabled={saving} onClick={() => setDpick((o) => !o)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50 disabled:opacity-40">{dpick ? "ปิด" : "เลือกรูป"}</button>}
            </div>
          )}
        </div>
        {/* ส่งเป็นของขวัญ (LINE ไม่รับผ่าน API = เตือนให้ตั้งเอง) — ร่าง extra.gift_status / gift_categories (คีย์เดียวกับ ProductPlatformManager) */}
        {(() => {
          const g = gsel ?? pv.gift;
          const gDirty = !!gsel && !sameGift(gsel, pv.gift);
          return (
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-2 border-t border-slate-100 py-2 text-sm">
              <span className="pt-0.5 text-slate-500">ของขวัญ<br /><span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">ตั้งเองใน LINE</span></span>
              <div className="min-w-0">
                <LineGiftPicker value={g} onChange={setGsel} disabled={!canEdit || saving} />
                <div className="mt-0.5 text-[11px] text-slate-400">มาจาก: {pv.gift.isDefault && !gDirty ? "ค่าเริ่มของร้าน (แบบเดียวกับ 119 สินค้าบน LINE)" : "ตั้งไว้สำหรับ LINE"}</div>
                <div className="text-[11px] text-amber-700">LINE ไม่ให้ตั้งของขวัญผ่านระบบ (ทดสอบแล้ว) — ลงเสร็จต้องไปติ๊กเองใน LINE Seller Center · ระบบจะเตือนค่านี้ในผลลัพธ์</div>
              </div>
              {canEdit && gDirty && (
                <div className="flex flex-col gap-1">
                  <button type="button" disabled={saving} onClick={() => void patchExtra({ gift_status: g.status, gift_categories: g.categories }, "บันทึกของขวัญแล้ว")} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>
                  <button type="button" onClick={() => setGsel(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
                </div>
              )}
            </div>
          );
        })()}
        {fieldRow("weight", "น้ำหนัก", pv.weight.kg > 0 ? `${pv.weight.kg} กก. (ทุกตัวเลือก)` : "ไม่ส่ง", pv.weight.src, pv.weight.kg > 0 ? String(pv.weight.kg) : "")}
      </div>

      {/* ตัวเลือก + ราคา + สต๊อก */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">ตัวเลือก + ราคา + สต๊อก ({pv.variants.length.toLocaleString()} ตัวเลือก)</span>
          {canEditPrice && changed.length > 0 && (
            <div className="flex gap-1">
              <button type="button" disabled={saving} onClick={() => void savePrices()} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกราคาในระบบ ({changed.length})</button>
              <button type="button" disabled={saving} onClick={() => setPrices({})} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            </div>
          )}
        </div>
        <MiniTable rows={pv.variants} columns={cols} rowKey={(v) => v.sku_id} hideToolbar dense emptyText="ไม่มี SKU ที่เปิดขาย" />
        <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
          <div>มาจาก: ราคาเต็ม / ราคาขาย ของแต่ละ SKU (ไม่มีราคาเต็ม = ใช้ราคาขาย ไม่มีส่วนลด) · สต๊อก = พร้อมขาย (มี − จอง) · รูปต่อสี = ปกของสีนั้น</div>
          {canEditPrice
            ? <div className="text-amber-700">แก้ราคาที่นี่ = เปลี่ยนราคาในระบบ (ใช้ทุกช่องทาง) · มีบันทึกประวัติว่าใครแก้</div>
            : <div>แก้ราคาต้องมีสิทธิ์แก้สินค้า</div>}
          <div>ไม่ส่งตอนลง: {pv.not_sent.join(", ")} — ตั้งทีหลังในลิ้นชักสินค้าได้</div>
        </div>
      </div>
      {canEdit && <p className="text-[11px] text-slate-400">ชื่อ · หมวด · แบรนด์ · รายละเอียด · น้ำหนัก · รูป ที่แก้ตรงนี้ = ใช้กับ LINE เท่านั้น (เก็บในร่าง) ไม่เปลี่ยนข้อมูลสินค้าในระบบ</p>}
    </div>
  );
}
