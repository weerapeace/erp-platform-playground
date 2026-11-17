"use client";
/**
 * 🧷 ของกลาง — ป๊อป "เพิ่มอะไหล่" แบบตะกร้า (เจ้าของขอ 2026-11-17 · ใบงานออกแบบ แท็บตีราคา)
 *   เลือกเฉพาะวัสดุตีราคากลุ่ม อะไหล่ / ซิป / เทป (กลุ่มคิด "นับชิ้น" หรือ "ตามความยาว") → ใส่ตะกร้า ปรับจำนวน → "ลงตารางตีราคา" ทีเดียว
 *   · มุมมอง ตาราง ↔ การ์ด (จำต่อคน useUserPref) · การ์ดใช้ไอคอนตามชนิด (วัสดุตีราคายังไม่มีรูป)
 *   · ชุด: วัสดุที่ตั้งชุดไว้ (design_price_items.set_items) → ใส่ตะกร้าแล้วถามว่าจะลงตัวในชุดด้วยไหม (ติ๊กออกได้ เช่น ไม่มีหางซิป)
 *   · เพิ่มอะไหล่ใหม่ = MaterialQuickCreate (ของกลางตัวเดียวกับสตูดิโอ) · แก้ชื่อ/ราคา/หน่วย · เอาออก (ปิดใช้งาน ไม่ลบจริง) · ตั้งชุด
 *     ผ่าน API กลาง /api/master-v2/design-price-items (ด่านสิทธิ์ products.edit + ประวัติ audit อยู่ที่นั่น)
 *
 *   <PartsCartModal open onClose={…} items={priceItems} onConfirm={(cart) => …} onItemsChanged={reload} canEdit />
 *   สูตรลงบรรทัด (บวกเข้าบรรทัดเดิม / บรรทัดใหม่) = lib/parts-cart applyCartToLines · คู่มือ docs/parts-cart.md
 * ใช้ที่: components/design-sheet-detail (ปุ่ม "เพิ่มอะไหล่" ใต้ตารางตีราคา)
 * ห้ามใช้: เลือกวัสดุชิ้นตัด/ผ้า (มีขนาด) → ช่องวัสดุในตาราง/MaterialAddSelect · วัตถุดิบ SKU จริง → MaterialPicker
 */
import { useMemo, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { SearchableSelect } from "@/components/searchable-select";
import { StepInput } from "@/components/step-input";
import { MaterialQuickCreate } from "@/components/material-quick-create";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";
import {
  MAX_SET_ITEMS, PARTS_MAX_CM, PARTS_MAX_QTY, addToCart, cartEntryAmount, partsModeOf,
  type CartEntry, type PartsMode, type SetItem,
} from "@/lib/parts-cart";

export type PartsItem = CostItemLike & { set_items?: SetItem[] };
type View = "table" | "grid";
const ALL = "__all";
const money = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ICON: Record<PartsMode, string> = { count: "i:circle-dot", length: "i:line-dashed" };

export function PartsCartModal({ open, onClose, items, onConfirm, onItemsChanged, canEdit = true }: {
  open: boolean;
  onClose: () => void;
  /** วัสดุตีราคาทั้งหมด (ป๊อปกรองเหลือกลุ่มอะไหล่/ซิป/เทปเอง) */
  items: PartsItem[];
  /** กด "ลงตารางตีราคา" — หน้าแม่เอาไปลงบรรทัด (lib/parts-cart applyCartToLines) */
  onConfirm: (cart: CartEntry[]) => void;
  /** แก้/เพิ่ม/เอาออก/ตั้งชุด สำเร็จ → หน้าแม่โหลดวัสดุตีราคาใหม่ */
  onItemsChanged: () => void;
  /** ใบนี้แก้ได้ไหม (ไม่ได้ = ดูอย่างเดียว ใส่ตะกร้าไม่ได้) */
  canEdit?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const canManage = usePermission("products.edit") && canEdit;
  const canCreate = usePermission("products.create") && canEdit;
  const [view, setView] = useUserPref<View>("parts_cart_view", "table", (raw) => (raw === "table" || raw === "grid" ? raw : null));
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState<string>(ALL);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [ask, setAsk] = useState<{ id: string; on: Record<string, boolean> } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; price: string; uom: string } | null>(null);
  const [setFor, setSetFor] = useState<{ id: string; list: SetItem[] } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parts = useMemo(() => items.flatMap((it) => { const mode = partsModeOf(it.calc_method); return mode ? [{ ...it, mode }] : []; }), [items]);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const groups = useMemo(() => [...new Set(parts.map((p) => p.group_name ?? t("ไม่ระบุชนิด", "No type")))], [parts, t]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return parts.filter((p) => (grp === ALL || (p.group_name ?? t("ไม่ระบุชนิด", "No type")) === grp) && (!k || p.name.toLowerCase().includes(k) || (p.group_name ?? "").toLowerCase().includes(k)));
  }, [parts, q, grp, t]);
  const qtyOf = (id: string) => cart.find((c) => c.item_id === id)?.qty ?? 0;
  const total = cart.reduce((s, c) => s + cartEntryAmount(c, byId.get(c.item_id)), 0);

  const reset = () => { setCart([]); setAsk(null); setEditing(null); setSetFor(null); setCreating(null); setQ(""); };
  const close = () => { reset(); onClose(); };

  const add = (id: string, n = 1) => {
    const p = byId.get(id); if (!p || !canEdit) return;
    const first = qtyOf(id) === 0;
    setCart((c) => addToCart(c, id, p.mode, n));
    const set = (p.set_items ?? []).filter((s) => byId.has(s.item_id));
    if (first && set.length) setAsk({ id, on: Object.fromEntries(set.map((s) => [s.item_id, s.on])) });
  };
  const bump = (id: string, d: number) => setCart((c) => c.flatMap((x) => (x.item_id !== id ? [x] : x.qty + d <= 0 ? [] : [{ ...x, qty: Math.min(PARTS_MAX_QTY, x.qty + d) }])));
  const setQty = (id: string, v: number | null) => setCart((c) => c.flatMap((x) => (x.item_id !== id ? [x] : !v || v <= 0 ? [] : [{ ...x, qty: Math.min(PARTS_MAX_QTY, Math.round(v)) }])));
  const setCm = (id: string, v: number | null) => setCart((c) => c.map((x) => (x.item_id === id ? { ...x, cm: v == null ? null : Math.min(PARTS_MAX_CM, Math.max(0, v)) } : x)));
  const acceptSet = () => {
    if (!ask) return;
    const p = byId.get(ask.id);
    let next = cart;
    for (const s of p?.set_items ?? []) {
      const sp = byId.get(s.item_id);
      if (sp && ask.on[s.item_id]) next = addToCart(next, s.item_id, sp.mode, s.qty);
    }
    setCart(next); setAsk(null);
  };

  const api = async (id: string, method: "PATCH" | "DELETE", body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${id}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) throw new Error(t("คุณไม่มีสิทธิ์แก้วัสดุตีราคา", "You don't have permission to edit costing materials"));
      if (!res.ok || j.error) throw new Error(typeof j.error === "string" ? j.error : t("บันทึกไม่สำเร็จ กรุณาลองใหม่", "Couldn't save. Try again."));
      onItemsChanged();
      return true;
    } catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { toast.error(t("กรุณาใส่ชื่ออะไหล่", "Enter a part name")); return; }
    const price = editing.price.trim() === "" ? null : Number(editing.price.replace(/,/g, ""));
    if (price != null && (!Number.isFinite(price) || price < 0)) { toast.error(t("ราคาต้องเป็นตัวเลขไม่ติดลบ", "Price must be a non-negative number")); return; }
    if (await api(editing.id, "PATCH", { name: name.slice(0, 120), price_per_unit: price, uom: editing.uom.trim() || null })) { setEditing(null); toast.success(t("บันทึกแล้ว", "Saved")); }
  };
  const saveSet = async () => {
    if (!setFor) return;
    if (await api(setFor.id, "PATCH", { set_items: setFor.list.slice(0, MAX_SET_ITEMS) })) { setSetFor(null); toast.success(t("บันทึกชุดแล้ว", "Set saved")); }
  };
  const doDelete = async () => {
    if (!delId) return;
    if (await api(delId, "DELETE")) { setCart((c) => c.filter((x) => x.item_id !== delId)); toast.success(t("เอาออกจากรายการแล้ว", "Removed from the list")); }
    setDelId(null);
  };

  const unitLabel = (p: { mode: PartsMode; uom: string | null }) => p.uom ?? (p.mode === "length" ? t("หลา", "yd") : t("ชิ้น", "pcs"));
  const priceText = (p: { price_per_unit: number | null; mode: PartsMode; uom: string | null }) =>
    p.price_per_unit == null ? t("ยังไม่มีราคา", "No price") : `${money(p.price_per_unit)}/${unitLabel(p)}`;
  const setBadge = (p: PartsItem) => (p.set_items?.length ? <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-1.5 text-[11px] text-emerald-700" title={t("มีชุด — ใส่ตะกร้าแล้วจะถามตัวในชุด", "Has a set — asks for set items when added")}>{t("ชุด", "Set")}</span> : null);
  const qtyBtns = (id: string, size = "h-7 w-7") => (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => bump(id, -1)} aria-label={t("ลดจำนวน", "Decrease")} className={`${size} inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50`}><Icon value="i:minus" className="text-xs" /></button>
      <span className="min-w-6 text-center text-sm tabular-nums">{qtyOf(id)}</span>
      <button type="button" onClick={() => add(id)} aria-label={t("เพิ่มจำนวน", "Increase")} className={`${size} inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50`}><Icon value="i:plus" className="text-xs" /></button>
    </span>
  );
  const addBtn = (id: string) => !canEdit ? null : qtyOf(id) > 0 ? qtyBtns(id) : (
    <button type="button" onClick={() => add(id)} className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 px-2 text-xs font-medium text-amber-700 hover:bg-amber-50">
      <Icon value="i:plus" className="text-xs" />{t("ใส่ตะกร้า", "Add")}</button>
  );
  const manageBtns = (p: PartsItem) => canManage && (
    <span className="inline-flex items-center">
      <button type="button" title={t("แก้ชื่อ/ราคา/หน่วย", "Edit name/price/unit")} aria-label={t(`แก้ ${p.name}`, `Edit ${p.name}`)} onClick={() => setEditing({ id: p.id, name: p.name, price: p.price_per_unit == null ? "" : String(p.price_per_unit), uom: p.uom ?? "" })}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:pencil" className="text-sm" /></button>
      <button type="button" title={t("ตั้งชุด (ลงพร้อมกัน)", "Set up a set")} aria-label={t(`ตั้งชุดของ ${p.name}`, `Set up set for ${p.name}`)} onClick={() => setSetFor({ id: p.id, list: [...(p.set_items ?? [])] })}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:link" className="text-sm" /></button>
      <button type="button" title={t("เอาออกจากรายการ", "Remove from list")} aria-label={t(`เอา ${p.name} ออก`, `Remove ${p.name}`)} onClick={() => setDelId(p.id)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:trash" className="text-sm" /></button>
    </span>
  );

  const editPanel = editing && (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-xs">
      <label className="flex min-w-40 flex-1 flex-col gap-0.5 text-slate-600">{t("ชื่ออะไหล่", "Part name")}
        <input value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8 rounded border border-slate-200 bg-white px-2 text-sm" /></label>
      <label className="flex w-28 flex-col gap-0.5 text-slate-600">{t("ราคา/หน่วย", "Price/unit")}
        <input value={editing.price} inputMode="decimal" onChange={(e) => setEditing({ ...editing, price: e.target.value })} className="h-8 rounded border border-slate-200 bg-white px-2 text-right text-sm tabular-nums" /></label>
      <label className="flex w-24 flex-col gap-0.5 text-slate-600">{t("หน่วย", "Unit")}
        <input value={editing.uom} maxLength={20} onChange={(e) => setEditing({ ...editing, uom: e.target.value })} className="h-8 rounded border border-slate-200 bg-white px-2 text-sm" /></label>
      <button type="button" disabled={busy} onClick={() => void saveEdit()} className="h-8 rounded-md bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      <button type="button" onClick={() => setEditing(null)} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
    </div>
  );

  const setPanel = setFor && (() => {
    const owner = byId.get(setFor.id);
    const opts = parts.filter((p) => p.id !== setFor.id && !setFor.list.some((s) => s.item_id === p.id)).map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }));
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-xs">
        <div className="font-medium text-emerald-800">{t(`ชุดของ "${owner?.name ?? ""}" — ใส่ตะกร้าแล้วจะถามว่าจะลงตัวไหนด้วย`, `Set for "${owner?.name ?? ""}" — asked when added to the cart`)}</div>
        {setFor.list.length === 0 && <div className="text-slate-500">{t("ยังไม่มีของในชุด — เลือกอะไหล่ด้านล่าง", "No set items yet — pick parts below")}</div>}
        {setFor.list.map((s, i) => (
          <div key={s.item_id} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-sm">{byId.get(s.item_id)?.name ?? t("(วัสดุนี้ถูกเอาออกแล้ว)", "(removed material)")}</span>
            <StepInput value={s.qty} step={1} min={1} max={PARTS_MAX_QTY} integer className="h-8 w-24" ariaLabel={t("จำนวนในชุด", "Qty in set")}
              onChange={(v) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, qty: Math.max(1, Math.round(v ?? 1)) } : x)) })} />
            <label className="inline-flex items-center gap-1 text-slate-600"><input type="checkbox" checked={s.on} onChange={(e) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)) })} />{t("ติ๊กไว้ก่อน", "Ticked by default")}</label>
            <button type="button" aria-label={t("เอาออกจากชุด", "Remove from set")} onClick={() => setSetFor({ ...setFor, list: setFor.list.filter((_, k) => k !== i) })} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:x" className="text-sm" /></button>
          </div>
        ))}
        {setFor.list.length < MAX_SET_ITEMS && (
          <div className="w-72 max-w-full"><SearchableSelect value="" options={opts} placeholder={t("＋ เพิ่มอะไหล่ในชุด", "＋ Add a part to the set")}
            onChange={(v) => v && setSetFor({ ...setFor, list: [...setFor.list, { item_id: v, qty: 1, on: true }] })} /></div>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void saveSet()} className="h-8 rounded-md bg-emerald-600 px-3 text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกชุด", "Save set")}</button>
          <button type="button" onClick={() => setSetFor(null)} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        </div>
      </div>
    );
  })();

  const askPanel = ask && (() => {
    const p = byId.get(ask.id);
    const set = (p?.set_items ?? []).filter((s) => byId.has(s.item_id));
    return (
      <div className="space-y-1.5 rounded-lg border border-blue-300 bg-blue-50 p-2.5 text-sm text-blue-900" role="dialog" aria-label={t("ลงชุดด้วยไหม", "Add set items?")}>
        <div className="font-medium">{t(`${p?.name ?? ""} มีชุด — ลงอะไรด้วยไหม?`, `${p?.name ?? ""} has a set — add these too?`)}</div>
        {set.map((s) => (
          <label key={s.item_id} className="flex items-center gap-2">
            <input type="checkbox" checked={!!ask.on[s.item_id]} onChange={(e) => setAsk({ ...ask, on: { ...ask.on, [s.item_id]: e.target.checked } })} />
            <span>{byId.get(s.item_id)?.name} × {s.qty}</span>
          </label>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={acceptSet} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">{t("ใส่ตะกร้าที่ติ๊ก", "Add ticked items")}</button>
          <button type="button" onClick={() => setAsk(null)} className="h-8 rounded-md border border-blue-200 bg-white px-3 text-xs text-blue-800 hover:bg-blue-50">{t(`เฉพาะ ${p?.name ?? ""}`, `Only ${p?.name ?? ""}`)}</button>
        </div>
      </div>
    );
  })();

  const cartBox = (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-2.5 md:sticky md:top-0 md:w-72 md:shrink-0 md:self-start">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Icon value="i:shopping-cart" className="text-base" />{t("ตะกร้า", "Cart")}{cart.length > 0 && <span className="text-slate-400">({cart.length})</span>}</div>
      {cart.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">{t("กด ＋ ใส่ตะกร้า ที่อะไหล่", "Press ＋ Add on a part")}</p> : (
        <div className="divide-y divide-slate-100">
          {cart.map((c) => {
            const p = byId.get(c.item_id); if (!p) return null;
            return (
              <div key={c.item_id} className="space-y-1 py-1.5 text-xs">
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 text-slate-700">{p.name}</span><span className="shrink-0 tabular-nums text-slate-600">{money(cartEntryAmount(c, p))}</span></div>
                <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                  <StepInput value={c.qty} step={1} min={1} max={PARTS_MAX_QTY} integer unit={p.mode === "length" ? t("เส้น", "pcs") : unitLabel(p)} className="h-8 w-28" ariaLabel={t(`จำนวน ${p.name}`, `Quantity ${p.name}`)} onChange={(v) => setQty(c.item_id, v)} />
                  {p.mode === "length" && <StepInput value={c.cm ?? null} step={1} min={0} max={PARTS_MAX_CM} unit={t("ซม./เส้น", "cm each")} className="h-8 w-32" ariaLabel={t(`ยาวต่อเส้น ${p.name}`, `Length each ${p.name}`)} onChange={(v) => setCm(c.item_id, v)} />}
                  <button type="button" aria-label={t(`เอา ${p.name} ออกจากตะกร้า`, `Remove ${p.name} from cart`)} onClick={() => setCart((x) => x.filter((y) => y.item_id !== c.item_id))} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:x" className="text-sm" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm"><span className="text-slate-500">{t("รวมต่อใบ", "Total per unit")}</span><span className="font-semibold tabular-nums">{money(total)}</span></div>
      <p className="mt-1 text-[11px] text-slate-400">{t("มีอะไหล่ตัวเดียวกันในตารางแล้ว = บวกจำนวนเข้าบรรทัดเดิม", "Same part already in the table = adds to that line")}</p>
    </div>
  );

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
      <button type="button" disabled={!cart.length || !canEdit} onClick={() => { onConfirm(cart); reset(); onClose(); }}
        className="h-9 rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">{t(`ลงตารางตีราคา${cart.length ? ` (${cart.length})` : ""}`, `Add to costing${cart.length ? ` (${cart.length})` : ""}`)}</button>
    </div>
  );

  return (
    <>
      <ERPModal open={open} onClose={close} title={t("เพิ่มอะไหล่ · ซิป · เทป", "Add parts · zips · tapes")} size="xl" storageKey="parts-cart-modal" hasUnsavedChanges={cart.length > 0} footer={footer}>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Icon value="i:search" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นอะไหล่ เช่น หัวซิป", "Search parts, e.g. zipper slider")} className="h-9 w-full rounded-lg border border-slate-200 pl-7 pr-2 text-sm" aria-label={t("ค้นอะไหล่", "Search parts")} />
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={t("มุมมอง", "View")}>
                {(["table", "grid"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} title={v === "table" ? t("ตาราง", "Table") : t("การ์ด", "Grid")}
                    className={`inline-flex h-8 w-9 items-center justify-center rounded-md ${view === v ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:bg-slate-50"}`}><Icon value={v === "table" ? "i:list" : "i:layout-grid"} className="text-base" /></button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[ALL, ...groups].map((g) => (
                <button key={g} type="button" aria-pressed={grp === g} onClick={() => setGrp(g)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${grp === g ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{g === ALL ? t("ทั้งหมด", "All") : g}</button>
              ))}
            </div>
            {askPanel}{editPanel}{setPanel}
            {parts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">{t("ยังไม่มีวัสดุกลุ่มอะไหล่/ซิป/เทป (หรือคุณไม่มีสิทธิ์ดูราคาต้นทุน)", "No parts/zips/tapes yet (or you can't see cost prices)")}</p>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t("ไม่พบอะไหล่ ลองเปลี่ยนคำค้น หรือเพิ่มอะไหล่ใหม่ด้านล่าง", "No parts found. Try another search or add a new part below")}</p>
            ) : view === "table" ? (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {shown.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-800">{p.name}{setBadge(p)}</div>
                      <div className="text-[11px] text-slate-500">{p.group_name ?? "—"} · {priceText(p)}</div>
                    </div>
                    {addBtn(p.id)}{manageBtns(p)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((p) => (
                  <div key={p.id} className="flex flex-col rounded-lg border border-slate-200 p-2">
                    <div className="flex h-14 items-center justify-center rounded-md bg-slate-50 text-slate-400"><Icon value={ICON[p.mode]} className="text-2xl" /></div>
                    <div className="mt-1.5 line-clamp-2 text-sm text-slate-800">{p.name}</div>
                    <div className="mb-1.5 text-[11px] text-slate-500">{priceText(p)}{setBadge(p)}</div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-1">{addBtn(p.id)}{manageBtns(p)}</div>
                  </div>
                ))}
              </div>
            )}
            {canCreate && (creating == null ? (
              <button type="button" onClick={() => setCreating(q.trim())} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Icon value="i:plus" className="text-sm" />{t("เพิ่มอะไหล่ใหม่", "Add a new part")}</button>
            ) : (
              <MaterialQuickCreate name={creating} materials={parts.map((p) => ({ id: p.id, name: p.name, sub: p.group_name }))}
                groupFilter={(g) => partsModeOf(g.calc_method) != null} saveLabel={t("เพิ่มอะไหล่", "Add part")}
                onPickExisting={(m) => { setCreating(null); add(m.id); }} onCancel={() => setCreating(null)}
                onCreated={() => { setCreating(null); onItemsChanged(); toast.success(t("เพิ่มอะไหล่แล้ว — ใส่ราคาด้วยปุ่มดินสอ", "Part added — set its price with the pencil")); }} />
            ))}
          </div>
          {cartBox}
        </div>
      </ERPModal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} onConfirm={() => void doDelete()} variant="danger" loading={busy}
        title={t("เอาอะไหล่ออกจากรายการ?", "Remove this part from the list?")}
        message={t(`"${delId ? byId.get(delId)?.name ?? "" : ""}" จะไม่ขึ้นให้เลือกอีก (ใบงานที่ใช้อยู่แล้วไม่เปลี่ยน · เปิดใช้คืนได้ที่หน้าวัสดุตีราคา)`, `"${delId ? byId.get(delId)?.name ?? "" : ""}" won't be offered anymore (existing sheets keep it · re-enable on the costing materials page)`)}
        confirmText={t("เอาออก", "Remove")} />
    </>
  );
}
