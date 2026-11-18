"use client";
/**
 * 🧷 ของกลาง — ป๊อป "เพิ่มอะไหล่" แบบตะกร้า (เจ้าของขอ 2026-11-17 · ใบงานออกแบบ แท็บตีราคา)
 *   เลือกเฉพาะวัสดุตีราคากลุ่ม อะไหล่ / ซิป / เทป (กลุ่มคิด "นับชิ้น" หรือ "ตามความยาว") → ใส่ตะกร้า ปรับจำนวน → "ลงตารางตีราคา" ทีเดียว
 *   · มุมมอง ตาราง ↔ การ์ด (จำต่อคน useUserPref) · การ์ดใช้ไอคอนตามชนิด (วัสดุตีราคายังไม่มีรูป)
 *   · ชุด: วัสดุที่ตั้งชุดไว้ (design_price_items.set_items) → ใส่ตะกร้าแล้วถามว่าจะลงตัวในชุดด้วยไหม (ติ๊กออกได้ เช่น ไม่มีหางซิป)
 *   · ปุ่ม "เพิ่มอะไหล่ใหม่" อยู่บนสุดข้างช่องค้นหา · เพิ่มเสร็จเปิดช่องราคาให้ทันที (2026-11-17)
 *   · ช่องแก้ราคา: "เช็คราคาจาก SKU" (ComponentPicker) → ต้นทุนมาตรฐาน + ราคาซื้อล่าสุด (/api/sku-trade-history) → กดใช้ราคา
 *   · แท็บ "ชุดสำเร็จรูป" (2026-11-18): อะไหล่ที่ตั้งชุดไว้ = การ์ดเห็นของในชุด · จำนวนชุด ×N · "เลือกอย่างใดอย่างหนึ่ง" (group)
 *     · สร้างชุดใหม่ / แก้ / ลบชุด (ย้อนกลับได้จากแจ้งผล) · ยาวตัวหลักต่อชุด (เช่น สายผ้า 120 ซม.) — lib/parts-cart kitToCart
 *   · แท็บ "สต็อกจริง (SKU)": เลือกวัตถุดิบ SKU จริงใส่ตะกร้าได้ → onConfirm(cart, skuCart) หน้าแม่ลงเป็นบรรทัด SKU
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
import { ComponentPicker } from "@/components/material-picker";
import type { BomComponent } from "@/app/api/bom/components/route";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";
import {
  MAX_SET_ITEMS, PARTS_MAX_CM, PARTS_MAX_QTY, addToCart, cartEntryAmount, kitDefaultChoices, kitMembers, kitSelfCm, kitToCart, partsModeOf,
  type CartEntry, type PartsMode, type SetItem,
} from "@/lib/parts-cart";

export type PartsItem = CostItemLike & { set_items?: SetItem[] };
type View = "table" | "grid";
/** วัตถุดิบ SKU จริงในตะกร้า (แท็บสต็อกจริง) */
export type SkuCartEntry = { c: BomComponent; qty: number };
const ALL = "__all";
const money = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ICON: Record<PartsMode, string> = { count: "i:circle-dot", length: "i:line-dashed" };

export function PartsCartModal({ open, onClose, items, onConfirm, onItemsChanged, canEdit = true, onManage }: {
  open: boolean;
  onClose: () => void;
  /** วัสดุตีราคาทั้งหมด (ป๊อปกรองเหลือกลุ่มอะไหล่/ซิป/เทปเอง) */
  items: PartsItem[];
  /** กด "ลงตารางตีราคา" — หน้าแม่เอาไปลงบรรทัด (lib/parts-cart applyCartToLines) · skuCart = วัตถุดิบ SKU จริง */
  onConfirm: (cart: CartEntry[], skuCart: SkuCartEntry[]) => void;
  /** แก้/เพิ่ม/เอาออก/ตั้งชุด สำเร็จ → หน้าแม่โหลดวัสดุตีราคาใหม่ */
  onItemsChanged: () => void;
  /** ใบนี้แก้ได้ไหม (ไม่ได้ = ดูอย่างเดียว ใส่ตะกร้าไม่ได้) */
  canEdit?: boolean;
  /** กด "จัดการอะไหล่ ↗" (เปิดหน้าวัสดุตีราคาแท็บใหม่) — หน้าแม่ใช้รู้ว่าต้องโหลดวัสดุใหม่ตอนกลับมา */
  onManage?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const canManage = usePermission("products.edit") && canEdit;
  const canCreate = usePermission("products.create") && canEdit;
  const [view, setView] = useUserPref<View>("parts_cart_view", "table", (raw) => (raw === "table" || raw === "grid" ? raw : null));
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState<string>(ALL);
  const [cart, setCart] = useState<CartEntry[]>([]);
  type KitPick = { qty: number; on: Record<string, boolean>; choices: Record<string, string> };
  const [ask, setAsk] = useState<({ id: string } & KitPick) | null>(null);
  const [kitState, setKitState] = useState<Record<string, KitPick>>({});
  const [newKitFor, setNewKitFor] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; price: string; uom: string } | null>(null);
  const [setFor, setSetFor] = useState<{ id: string; list: SetItem[]; selfCm: number | null } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"parts" | "kits" | "sku">("parts");
  const [skuCart, setSkuCart] = useState<SkuCartEntry[]>([]);
  const addSku = (c: BomComponent) => setSkuCart((x) => (x.some((y) => y.c.id === c.id) ? x.map((y) => (y.c.id === c.id ? { ...y, qty: Math.min(PARTS_MAX_QTY, y.qty + 1) } : y)) : [...x, { c, qty: 1 }]));

  const parts = useMemo(() => items.flatMap((it) => { const mode = partsModeOf(it.calc_method); return mode ? [{ ...it, mode }] : []; }), [items]);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const kits = useMemo(() => parts.filter((p) => kitMembers(p.set_items).length > 0 && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))), [parts, q]);
  const groups = useMemo(() => [...new Set(parts.map((p) => p.group_name ?? t("ไม่ระบุชนิด", "No type")))], [parts, t]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return parts.filter((p) => (grp === ALL || (p.group_name ?? t("ไม่ระบุชนิด", "No type")) === grp) && (!k || p.name.toLowerCase().includes(k) || (p.group_name ?? "").toLowerCase().includes(k)));
  }, [parts, q, grp, t]);
  const qtyOf = (id: string) => cart.find((c) => c.item_id === id)?.qty ?? 0;
  const total = cart.reduce((s, c) => s + cartEntryAmount(c, byId.get(c.item_id)), 0) + skuCart.reduce((s, x) => s + (x.c.standard_price ?? 0) * x.qty, 0);
  const cartCount = cart.length + skuCart.length;

  const reset = () => { setSkuCart([]); setTab("parts"); setCart([]); setAsk(null); setKitState({}); setEditing(null); setSetFor(null); setCreating(null); setQ(""); };
  const close = () => { reset(); onClose(); };

  const add = (id: string, n = 1) => {
    const p = byId.get(id); if (!p || !canEdit) return;
    const first = qtyOf(id) === 0;
    setCart((c) => addToCart(c, id, p.mode, n, kitSelfCm(p.set_items)));
    const set = kitMembers(p.set_items).filter((s) => byId.has(s.item_id));
    if (first && set.length) setAsk({ id, qty: 1, on: Object.fromEntries(set.map((s) => [s.item_id, s.on])), choices: kitDefaultChoices(p.set_items) });
  };
  const modeOf = (id: string) => byId.get(id)?.mode ?? null;
  const pickOf = (ownerId: string): KitPick => kitState[ownerId] ?? (() => {
    const set = byId.get(ownerId)?.set_items;
    return { qty: 1, on: Object.fromEntries(kitMembers(set).map((m) => [m.item_id, m.on])), choices: kitDefaultChoices(set) };
  })();
  const setPick = (ownerId: string, p: Partial<KitPick>) => setKitState((m) => ({ ...m, [ownerId]: { ...pickOf(ownerId), ...p } }));
  /** ใส่ทั้งชุด (แท็บชุดสำเร็จรูป) */
  const addKit = (ownerId: string) => {
    const p = byId.get(ownerId); if (!p || !canEdit) return;
    const pk = pickOf(ownerId);
    setCart((c) => kitToCart(c, ownerId, p.set_items, modeOf, pk, pk.qty));
    toast.success(t(`ใส่ชุด "${p.name}" × ${pk.qty} ลงตะกร้าแล้ว`, `Added set "${p.name}" × ${pk.qty} to the cart`));
  };
  /** ราคาต่อชุด (ตามที่ติ๊ก/เลือกอยู่) */
  const kitAmount = (ownerId: string, pk: KitPick) => kitToCart([], ownerId, byId.get(ownerId)?.set_items, modeOf, pk, 1)
    .reduce((sum, c) => sum + cartEntryAmount(c, byId.get(c.item_id)), 0);
  /** ของในชุด: ติ๊ก (ตัวทั่วไป) · วงกลม (กลุ่มเลือก 1 อย่าง) — ใช้ทั้งแท็บชุดและตอนถามหลังใส่ตัวหลัก */
  const kitRows = (ownerId: string, pk: KitPick, onPk: (p: Partial<KitPick>) => void) => {
    const set = byId.get(ownerId)?.set_items;
    const mem = kitMembers(set).filter((m) => byId.has(m.item_id));
    const groupsSeen = new Set<string>();
    return mem.map((m) => {
      if (m.group) {
        if (groupsSeen.has(m.group)) return null;
        groupsSeen.add(m.group);
        const opts = mem.filter((x) => x.group === m.group);
        return (
          <div key={`g:${m.group}`} className="rounded-md border border-dashed border-blue-300 px-2 py-1">
            <div className="text-[11px] text-slate-500">{t("เลือกอย่างใดอย่างหนึ่ง", "Choose one")}</div>
            {opts.map((o) => (
              <label key={o.item_id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="radio" name={`kit-${ownerId}-${m.group}`} checked={pk.choices[m.group!] === o.item_id} onChange={() => onPk({ choices: { ...pk.choices, [m.group!]: o.item_id } })} />
                <span className="min-w-0 flex-1 truncate">{byId.get(o.item_id)?.name}</span><span className="text-xs text-slate-500">× {o.qty}{o.cm ? ` · ${o.cm} ซม.` : ""}</span>
              </label>
            ))}
          </div>
        );
      }
      return (
        <label key={m.item_id} className="flex items-center gap-2 py-0.5 text-sm">
          <input type="checkbox" checked={pk.on[m.item_id] ?? m.on} onChange={(e) => onPk({ on: { ...pk.on, [m.item_id]: e.target.checked } })} />
          <span className="min-w-0 flex-1 truncate">{byId.get(m.item_id)?.name}</span><span className="text-xs text-slate-500">× {m.qty}{m.cm ? ` · ${m.cm} ซม.` : ""}</span>
        </label>
      );
    });
  };
  const openSetEditor = (id: string) => { const p = byId.get(id); setSetFor({ id, list: kitMembers(p?.set_items).map((m) => ({ ...m })), selfCm: kitSelfCm(p?.set_items) }); };
  const bump = (id: string, d: number) => setCart((c) => c.flatMap((x) => (x.item_id !== id ? [x] : x.qty + d <= 0 ? [] : [{ ...x, qty: Math.min(PARTS_MAX_QTY, x.qty + d) }])));
  const setQty = (id: string, v: number | null) => setCart((c) => c.flatMap((x) => (x.item_id !== id ? [x] : !v || v <= 0 ? [] : [{ ...x, qty: Math.min(PARTS_MAX_QTY, Math.round(v)) }])));
  const setCm = (id: string, v: number | null) => setCart((c) => c.map((x) => (x.item_id === id ? { ...x, cm: v == null ? null : Math.min(PARTS_MAX_CM, Math.max(0, v)) } : x)));
  const acceptSet = () => {
    if (!ask) return;
    setCart((c) => kitToCart(c, ask.id, byId.get(ask.id)?.set_items, modeOf, ask, 1, false));   // ตัวหลักใส่ไปแล้ว
    setAsk(null);
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
    const list: SetItem[] = [...setFor.list.slice(0, MAX_SET_ITEMS), ...(setFor.selfCm && setFor.selfCm > 0 ? [{ item_id: setFor.id, qty: 1, on: true, cm: setFor.selfCm, self: true as const }] : [])];
    if (await api(setFor.id, "PATCH", { set_items: list })) { setKitState((m) => { const n = { ...m }; delete n[setFor.id]; return n; }); setSetFor(null); toast.success(t("บันทึกชุดแล้ว", "Set saved")); }
  };
  /** ลบชุด (ล้างของในชุด — ตัวอะไหล่ยังอยู่) · ย้อนกลับได้จากแจ้งผล */
  const deleteKit = async (id: string) => {
    const p = byId.get(id); if (!p) return;
    const before = p.set_items ?? [];
    if (await api(id, "PATCH", { set_items: [] })) {
      setSetFor(null);
      toast.action(t(`ลบชุด "${p.name}" แล้ว`, `Removed set "${p.name}"`), t("ย้อนกลับ", "Undo"), () => { void api(id, "PATCH", { set_items: before }); });
    }
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
      <button type="button" title={t("ตั้งชุด (ลงพร้อมกัน)", "Set up a set")} aria-label={t(`ตั้งชุดของ ${p.name}`, `Set up set for ${p.name}`)} onClick={() => openSetEditor(p.id)}
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
      <SkuPriceCheck onUse={(price, uom) => setEditing((e) => (e ? { ...e, price: String(price), uom: e.uom || uom || "" } : e))} />
    </div>
  );

  const setPanel = setFor && (() => {
    const owner = byId.get(setFor.id);
    const opts = parts.filter((p) => p.id !== setFor.id && !setFor.list.some((s) => s.item_id === p.id)).map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }));
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-xs">
        <div className="font-medium text-emerald-800">{t(`ชุดของ "${owner?.name ?? ""}" — ใส่ตะกร้าแล้วจะถามว่าจะลงตัวไหนด้วย`, `Set for "${owner?.name ?? ""}" — asked when added to the cart`)}</div>
        {owner?.mode === "length" && (
          <label className="flex flex-wrap items-center gap-2 text-slate-600">{t(`ยาว "${owner.name}" ต่อชุด`, `Length of "${owner.name}" per set`)}
            <StepInput value={setFor.selfCm} step={1} min={0} max={PARTS_MAX_CM} unit={t("ซม.", "cm")} className="h-8 w-32" ariaLabel={t("ยาวต่อชุด", "Length per set")}
              onChange={(v) => setSetFor({ ...setFor, selfCm: v && v > 0 ? v : null })} />
            <span className="text-[11px] text-slate-400">{t("ว่าง = 30 ซม. แก้ในตะกร้าได้", "Empty = 30 cm, editable in the cart")}</span>
          </label>
        )}
        {setFor.list.length === 0 && <div className="text-slate-500">{t("ยังไม่มีของในชุด — เลือกอะไหล่ด้านล่าง", "No set items yet — pick parts below")}</div>}
        {setFor.list.map((s, i) => (
          <div key={s.item_id} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-sm">{byId.get(s.item_id)?.name ?? t("(วัสดุนี้ถูกเอาออกแล้ว)", "(removed material)")}</span>
            <StepInput value={s.qty} step={1} min={1} max={PARTS_MAX_QTY} integer className="h-8 w-24" ariaLabel={t("จำนวนในชุด", "Qty in set")}
              onChange={(v) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, qty: Math.max(1, Math.round(v ?? 1)) } : x)) })} />
            {byId.get(s.item_id)?.mode === "length" && (
              <StepInput value={s.cm ?? null} step={1} min={0} max={PARTS_MAX_CM} unit={t("ซม./เส้น", "cm each")} className="h-8 w-32" ariaLabel={t("ยาวต่อเส้นในชุด", "Length each in set")}
                onChange={(v) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, cm: v && v > 0 ? v : undefined } : x)) })} />
            )}
            {/* เลือกอย่างใดอย่างหนึ่ง: ตัวที่อยู่กลุ่มเดียวกัน = ให้เลือกได้ตัวเดียวตอนใส่ตะกร้า */}
            <select value={s.group ?? ""} aria-label={t("กลุ่มเลือก 1 อย่าง", "Choose-one group")} title={t("ตัวที่อยู่กลุ่มเดียวกัน = เลือกได้อย่างเดียว (เช่น หัวเข็มขัด / ปรับสาย)", "Items in the same group = pick one (e.g. buckle / adjuster)")}
              onChange={(e) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, group: e.target.value || undefined } : x)) })}
              className="h-8 rounded border border-slate-200 bg-white px-1.5 text-xs">
              <option value="">{t("ใส่ทุกครั้ง", "Always")}</option>
              {["ก", "ข", "ค", "ง"].map((g) => <option key={g} value={g}>{t(`เลือก 1 อย่าง กลุ่ม ${g}`, `Choose one · group ${g}`)}</option>)}
            </select>
            {!s.group && <label className="inline-flex items-center gap-1 text-slate-600"><input type="checkbox" checked={s.on} onChange={(e) => setSetFor({ ...setFor, list: setFor.list.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)) })} />{t("ติ๊กไว้ก่อน", "Ticked by default")}</label>}
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
          {kitMembers(byId.get(setFor.id)?.set_items).length > 0 && (
            <button type="button" disabled={busy} onClick={() => void deleteKit(setFor.id)} className="ml-auto h-8 rounded-md border border-rose-200 bg-white px-3 text-rose-600 hover:bg-rose-50 disabled:opacity-50">{t("ลบชุดนี้", "Delete this set")}</button>
          )}
        </div>
      </div>
    );
  })();

  const askPanel = ask && (() => {
    const p = byId.get(ask.id);
    const set = kitMembers(p?.set_items).filter((s) => byId.has(s.item_id));
    return (
      <div className="space-y-1.5 rounded-lg border border-blue-300 bg-blue-50 p-2.5 text-sm text-blue-900" role="dialog" aria-label={t("ลงชุดด้วยไหม", "Add set items?")}>
        <div className="font-medium">{t(`${p?.name ?? ""} มีชุด — ลงอะไรด้วยไหม?`, `${p?.name ?? ""} has a set — add these too?`)}</div>
        {set.length > 0 && kitRows(ask.id, ask, (pp) => setAsk({ ...ask, ...pp }))}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={acceptSet} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">{t("ใส่ตะกร้าที่ติ๊ก", "Add ticked items")}</button>
          <button type="button" onClick={() => setAsk(null)} className="h-8 rounded-md border border-blue-200 bg-white px-3 text-xs text-blue-800 hover:bg-blue-50">{t(`เฉพาะ ${p?.name ?? ""}`, `Only ${p?.name ?? ""}`)}</button>
        </div>
      </div>
    );
  })();

  const cartBox = (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-2.5 md:sticky md:top-0 md:w-72 md:shrink-0 md:self-start">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Icon value="i:shopping-cart" className="text-base" />{t("ตะกร้า", "Cart")}{cartCount > 0 && <span className="text-slate-400">({cartCount})</span>}</div>
      {skuCart.length > 0 && (
        <div className="mb-1 divide-y divide-slate-100 border-b border-slate-100">
          {skuCart.map((x) => (
            <div key={x.c.id} className="space-y-1 py-1.5 text-xs">
              <div className="flex items-start justify-between gap-2"><span className="min-w-0 text-slate-700"><span className="mr-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700">SKU</span>{x.c.code} {x.c.name}</span><span className="shrink-0 tabular-nums text-slate-600">{x.c.standard_price != null ? money(x.c.standard_price * x.qty) : t("ไม่มีราคา", "No price")}</span></div>
              <div className="flex items-center gap-1.5">
                <StepInput value={x.qty} step={1} min={1} max={PARTS_MAX_QTY} integer unit={x.c.uom_name ?? t("ชิ้น", "pcs")} className="h-8 w-28" ariaLabel={t(`จำนวน ${x.c.name}`, `Quantity ${x.c.name}`)}
                  onChange={(v) => setSkuCart((l) => l.map((y) => (y.c.id === x.c.id ? { ...y, qty: Math.max(1, Math.min(PARTS_MAX_QTY, Math.round(v ?? 1))) } : y)))} />
                <button type="button" aria-label={t(`เอา ${x.c.name} ออกจากตะกร้า`, `Remove ${x.c.name}`)} onClick={() => setSkuCart((l) => l.filter((y) => y.c.id !== x.c.id))} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:x" className="text-sm" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {cart.length === 0 && skuCart.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">{t("กด ＋ ใส่ตะกร้า ที่อะไหล่", "Press ＋ Add on a part")}</p> : (
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
      <button type="button" disabled={!cartCount || !canEdit} onClick={() => { onConfirm(cart, skuCart); reset(); onClose(); }}
        className="h-9 rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">{t(`ลงตารางตีราคา${cartCount ? ` (${cartCount})` : ""}`, `Add to costing${cartCount ? ` (${cartCount})` : ""}`)}</button>
    </div>
  );

  return (
    <>
      <ERPModal open={open} onClose={close} title={t("เพิ่มอะไหล่ · ซิป · เทป", "Add parts · zips · tapes")} size="xl" storageKey="parts-cart-modal" hasUnsavedChanges={cartCount > 0} footer={footer}>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Icon value="i:search" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นอะไหล่ เช่น หัวซิป", "Search parts, e.g. zipper slider")} className="h-9 w-full rounded-lg border border-slate-200 pl-7 pr-2 text-sm" aria-label={t("ค้นอะไหล่", "Search parts")} />
              </div>
              {canCreate && tab === "parts" && (
                <button type="button" onClick={() => setCreating(q.trim())}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100"><Icon value="i:plus" className="text-sm" />{t("เพิ่มอะไหล่ใหม่", "New part")}</button>
              )}
              <a href="/master/design-price-items" target="_blank" rel="noopener noreferrer" onClick={() => onManage?.()}
                title={t("เปิดหน้าวัสดุตีราคา (เพิ่ม/แก้/ปิดใช้ อะไหล่ทั้งหมด) ในแท็บใหม่ · กลับมาแล้วรายการโหลดใหม่เอง", "Open the costing materials page in a new tab · the list reloads when you come back")}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon value="i:settings" className="text-sm" />{t("จัดการอะไหล่", "Manage parts")}<Icon value="i:external-link" className="text-xs" /></a>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={t("มุมมอง", "View")}>
                {(["table", "grid"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} title={v === "table" ? t("ตาราง", "Table") : t("การ์ด", "Grid")}
                    className={`inline-flex h-8 w-9 items-center justify-center rounded-md ${view === v ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:bg-slate-50"}`}><Icon value={v === "table" ? "i:list" : "i:layout-grid"} className="text-base" /></button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("แหล่งอะไหล่", "Part source")}>
              {(["parts", "kits", "sku"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium ${tab === k ? "border-amber-400 bg-amber-100 text-amber-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <Icon value={k === "parts" ? "i:paperclip" : k === "kits" ? "i:link" : "i:package"} className="text-xs" />{k === "parts" ? t("อะไหล่ตีราคา", "Costing parts") : k === "kits" ? t(`ชุดสำเร็จรูป (${kits.length})`, `Ready sets (${kits.length})`) : t("สต็อกจริง (SKU)", "Real stock (SKU)")}
                  {k === "sku" && skuCart.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{skuCart.length}</span>}
                </button>
              ))}
            </div>
            {tab === "kits" ? (
              <div className="space-y-2">
                {setPanel}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 p-2 text-xs text-emerald-800">
                    <Icon value="i:plus" className="text-xs" />{t("สร้างชุดใหม่ — เลือกตัวหลักของชุด (เช่น สายผ้า 2 cm.)", "New set — pick the main part (e.g. 2 cm strap)")}
                    <div className="w-64 max-w-full"><SearchableSelect value={newKitFor} placeholder={t("— เลือกตัวหลัก —", "— Main part —")}
                      options={parts.filter((p) => !kitMembers(p.set_items).length).map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }))}
                      onChange={(v) => { setNewKitFor(""); if (v) openSetEditor(v); }} /></div>
                  </div>
                )}
                {kits.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{t("ยังไม่มีชุด — สร้างชุดใหม่ด้านบน", "No sets yet — create one above")}</p> : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {kits.map((p) => {
                      const pk = pickOf(p.id); const selfCm = kitSelfCm(p.set_items);
                      return (
                        <div key={p.id} className="flex flex-col rounded-lg border border-slate-200 p-2.5">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-800">{t(`ชุด${p.name}`, `${p.name} set`)}</div>
                              <div className="text-[11px] text-slate-500">{p.name}{p.mode === "length" ? ` · ${selfCm ?? 30} ซม./ชุด` : " × 1"}</div></div>
                            {canManage && <button type="button" onClick={() => openSetEditor(p.id)} title={t("แก้ชุด", "Edit set")} aria-label={t(`แก้ชุด ${p.name}`, `Edit set ${p.name}`)}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:pencil" className="text-sm" /></button>}
                          </div>
                          <div className="space-y-0.5">{kitRows(p.id, pk, (pp) => setPick(p.id, pp))}</div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                            <StepInput value={pk.qty} step={1} min={1} max={PARTS_MAX_QTY} integer unit={t("ชุด", "sets")} className="h-8 w-28" ariaLabel={t("จำนวนชุด", "Number of sets")}
                              onChange={(v) => setPick(p.id, { qty: Math.max(1, Math.round(v ?? 1)) })} />
                            <span className="text-[11px] text-slate-500">{t(`ต่อชุด ${money(kitAmount(p.id, pk))}`, `Per set ${money(kitAmount(p.id, pk))}`)}</span>
                            {canEdit && <button type="button" onClick={() => addKit(p.id)} className="h-8 rounded-md bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-600">{t("ใส่ตะกร้าทั้งชุด", "Add whole set")}</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : tab === "sku" ? (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{t("เลือกวัตถุดิบ SKU จริงจากคลัง → ใส่ตะกร้า (ราคา = ต้นทุนมาตรฐานของ SKU) · ลงตารางเป็นบรรทัด SKU", "Pick a real stock SKU → into the cart (price = SKU standard cost) · becomes an SKU line")}</p>
                {canEdit ? <ComponentPicker sku="" name="" placeholder={t("ค้นหา SKU อะไหล่ เช่น หัวซิป", "Search an SKU, e.g. zipper slider")} onPick={addSku} />
                  : <p className="text-xs text-slate-400">{t("ดูอย่างเดียว", "View only")}</p>}
              </div>
            ) : (<>
            <div className="flex flex-wrap gap-1.5">
              {[ALL, ...groups].map((g) => (
                <button key={g} type="button" aria-pressed={grp === g} onClick={() => setGrp(g)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${grp === g ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{g === ALL ? t("ทั้งหมด", "All") : g}</button>
              ))}
            </div>
            {canCreate && tab === "parts" && creating != null && (
              <MaterialQuickCreate name={creating} materials={parts.map((p) => ({ id: p.id, name: p.name, sub: p.group_name }))}
                groupFilter={(g) => partsModeOf(g.calc_method) != null} saveLabel={t("เพิ่มอะไหล่", "Add part")}
                onPickExisting={(m) => { setCreating(null); add(m.id); }} onCancel={() => setCreating(null)}
                onCreated={(m) => {
                  setCreating(null); onItemsChanged();
                  // เพิ่มเสร็จ → เปิดช่องราคาให้ทันที (มีเช็คราคาจาก SKU)
                  if (canManage && m?.id) setEditing({ id: m.id, name: m.name ?? "", price: "", uom: "" });
                  toast.success(t("เพิ่มอะไหล่แล้ว — ใส่ราคา (หรือเช็คราคาจาก SKU) แล้วกดบันทึก", "Part added — set the price (or check an SKU price), then save"));
                }} />
            )}
            {askPanel}{editPanel}{tab === "parts" && setPanel}
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
            </>)}
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

/** เช็คราคาจาก SKU (ช่องแก้ราคาอะไหล่) — ต้นทุนมาตรฐานของ SKU + ราคาซื้อล่าสุด (ราคาซื้อเห็นเฉพาะคนมีสิทธิ์ดูต้นทุน · ตัดที่เซิร์ฟเวอร์) */
function SkuPriceCheck({ onUse }: { onUse: (price: number, uom: string | null) => void }) {
  const t = useT();
  const [c, setC] = useState<BomComponent | null>(null);
  const [last, setLast] = useState<{ price: number; date: string | null; partner: string | null } | null | undefined>(undefined);
  const pick = (x: BomComponent) => {
    setC(x); setLast(undefined);
    apiFetch(`/api/sku-trade-history?sku_id=${encodeURIComponent(x.id)}`).then((r) => r.json()).then((j) => {
      const lb = j?.summary?.last_buy as { price: number; date: string | null } | null | undefined;
      const po = ((j?.purchases ?? []) as { kind: string; price: number | null; partner: string | null }[]).find((p) => p.kind === "po" && p.price != null);
      setLast(lb ? { price: lb.price, date: lb.date, partner: po?.partner ?? null } : null);
    }).catch(() => setLast(null));
  };
  const useBtn = (price: number, label: string) => (
    <button type="button" onClick={() => onUse(Math.round(price * 100) / 100, c?.uom_name ?? null)} className="h-7 rounded-md border border-blue-300 bg-white px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-50">{label}</button>
  );
  return (
    <div className="w-full space-y-1.5 border-t border-blue-100 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-slate-600"><Icon value="i:search" className="text-xs" />{t("เช็คราคาจาก SKU", "Check price from an SKU")}</span>
        <div className="min-w-48 flex-1"><ComponentPicker sku={c?.code ?? ""} name={c?.name ?? ""} placeholder={t("เลือก SKU ที่ตรงกับอะไหล่นี้", "Pick the matching SKU")} onPick={pick} /></div>
      </div>
      {c && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white px-2 py-1.5 text-[11px] text-slate-600">
          <span>{t("ต้นทุนมาตรฐาน", "Standard cost")} <b className="tabular-nums text-slate-800">{c.standard_price != null ? money(c.standard_price) : "—"}</b>{c.uom_name ? `/${c.uom_name}` : ""}</span>
          {c.standard_price != null && useBtn(c.standard_price, t(`ใช้ ${money(c.standard_price)}`, `Use ${money(c.standard_price)}`))}
          <span className="text-slate-300">|</span>
          {last === undefined ? <span className="text-slate-400">{t("กำลังดูราคาซื้อล่าสุด…", "Loading last purchase…")}</span>
            : last ? <><span>{t("ซื้อล่าสุด", "Last bought")} <b className="tabular-nums text-slate-800">{money(last.price)}</b>{last.partner ? ` · ${last.partner}` : ""}{last.date ? ` · ${new Date(last.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}` : ""}</span>{useBtn(last.price, t(`ใช้ ${money(last.price)}`, `Use ${money(last.price)}`))}</>
            : <span className="text-slate-400">{t("ยังไม่เคยซื้อ (หรือไม่มีสิทธิ์ดูราคาซื้อ)", "No purchases yet (or no permission to see buy prices)")}</span>}
        </div>
      )}
    </div>
  );
}
