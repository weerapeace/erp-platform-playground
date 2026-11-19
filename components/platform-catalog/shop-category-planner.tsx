"use client";

/**
 * หมวดในร้าน — แท็บ (มุมมอง) ในหน้า สินค้าบนแพลตฟอร์ม (/master/platform-catalog · แถบซ้าย "มุมมอง" → หมวดในร้าน)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-19 (widget รอบ 2): แบบ A แยกต่อร้าน + ข้อเสนอ 1 เช็กลิสต์จากส่วนที่เปลี่ยน · 2 แนะนำสินค้า · 3 เตือนยังไม่อยู่หมวด · 4 คัดลอกรหัส/พิมพ์เช็กลิสต์
 * ร้าน = แบรนด์ × แพลตฟอร์ม · ข้อมูล/บันทึก = /api/platform-shop-categories · กติกา = lib/shop-category-plan (pure + เทสต์)
 * แก้ไขได้ทุกอย่าง (ชื่อ · ลำดับ · สินค้า · หมวดกลางที่ผูก) · ย้อนกลับได้ (แจ้งผลมุมจอ "ย้อนกลับ" · ยกเลิกติ๊ก) · ลบ = ลงถังขยะก่อน ลบถาวรต้องยืนยัน
 * ⚠️ ไม่ส่งอะไรขึ้นร้านจริง — Lazada/LINE/TikTok ไม่เปิด API หมวดในร้าน · Shopee เปิดแต่ร้านยังไม่ได้สิทธิ์ (ดู memory platform_shop_category_api)
 * ของกลางที่ใช้: MiniTable (เลือกสินค้า) · ERPModal · ConfirmDialog · toast.undo · useDragReorder/DragHandle · CopyButton · state-views · Icon · sellerCenterHome
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { r2ImageUrl } from "@/lib/r2-image";
import { sellerCenterHome } from "@/lib/platform-links";
import {
  SHOP_CAT_NAME_MAX, SHOP_CAT_NAME_WARN, activeCats, checklistText, normCatName, planItemsOf, shopCategoryChecklist, suggestForCategory, unassignedProducts, validateCatName,
  type ShopCat, type ShopCatItem, type ShopCatProduct, type ShopCatStep, type StepEffect,
} from "@/lib/shop-category-plan";

type Resp = {
  cats: ShopCat[]; items: ShopCatItem[]; products: ShopCatProduct[];
  centrals: { id: string; name: string }[];
  other_plans: { platform_id: string; name: string; count: number }[];
  platform: { id: string; code: string; name: string } | null;
  error: string | null;
};
type AddTab = "suggest" | "free" | "all";
type DoneEntry = { key: string; title: string; undo: StepEffect };

const img = (key: string | null, w = 200) => (key ? r2ImageUrl(key, w) ?? "" : "");

export function ShopCategoryPlanner({ brandId, platformId, platformCode, shopLabel }: {
  brandId: string; platformId: string; platformCode: string;
  /** ชื่อร้านที่โชว์ เช่น "Lazada · IG International" */
  shopLabel: string;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("products.platforms.edit");
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [curId, setCurId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState<AddTab | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [doneLog, setDoneLog] = useState<DoneEntry[]>([]);
  const shopKey = `${brandId}|${platformId}`;

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/platform-shop-categories?brand_id=${encodeURIComponent(brandId)}&platform_id=${encodeURIComponent(platformId)}`).then((r) => r.json()) as Resp;
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); }
  }, [brandId, platformId]);
  useEffect(() => { setData(null); setDoneLog([]); setCurId(null); void load(); }, [load, shopKey]);

  /** ส่งคำสั่ง → โหลดใหม่ · ผิด = แจ้งเตือน คืน null */
  const post = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/platform-shop-categories", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json() as Record<string, unknown>;
      if (!r.ok || j.ok === false) throw new Error(String(j.error || "บันทึกไม่สำเร็จ"));
      await load();
      return j;
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); await load(); return null; }
    finally { setBusy(false); }
  }, [load, toast]);
  const shop = { brand_id: brandId, platform_id: platformId };

  const cats = useMemo(() => (data ? activeCats(data.cats) : []), [data]);
  const trash = useMemo(() => (data ? data.cats.filter((c) => c.deleted_at) : []), [data]);
  const productBy = useMemo(() => new Map((data?.products ?? []).map((p) => [p.id, p])), [data]);
  const cur = cats.find((c) => c.id === curId) ?? cats[0] ?? null;
  const curItems = useMemo(() => (data && cur ? planItemsOf(data.items, cur.id) : []), [data, cur]);
  const steps = useMemo(() => (data ? shopCategoryChecklist(data.cats, data.items, (id) => productBy.get(id)?.code ?? id) : []), [data, productBy]);
  const unassigned = useMemo(() => (data ? unassignedProducts(data.products, data.cats, data.items) : []), [data]);
  const suggest = useMemo(() => (data && cur ? suggestForCategory(cur, data.products, data.cats, data.items) : []), [data, cur]);
  const planned = useMemo(() => {
    const live = new Set(cats.map((c) => c.id));
    return new Set((data?.items ?? []).filter((i) => i.in_plan && live.has(i.category_id)).map((i) => i.parent_sku_id)).size;
  }, [data, cats]);
  const seller = sellerCenterHome(platformCode);

  // ───── หมวด ─────
  const addCategory = async () => {
    if (newName == null || !data) return;
    const name = normCatName(newName);
    const bad = validateCatName(name, data.cats); if (bad) { toast.error(bad); return; }
    const j = await post({ action: "create", ...shop, name });
    if (!j) return;
    const id = String((j.cat as { id?: string } | undefined)?.id ?? "");
    setNewName(null); if (id) setCurId(id);
    toast.undo(`เพิ่มหมวด “${name}” แล้ว`, async () => { if (await post({ action: "delete", id })) await post({ action: "purge", id }); });
  };
  const saveRename = async () => {
    if (!editing || !data) return;
    const name = normCatName(editing.name);
    const old = data.cats.find((c) => c.id === editing.id)?.name ?? "";
    if (name === old) { setEditing(null); return; }
    const bad = validateCatName(name, data.cats, editing.id); if (bad) { toast.error(bad); return; }
    const id = editing.id;
    if (await post({ action: "rename", id, name })) { setEditing(null); toast.undo(`เปลี่ยนชื่อ “${old}” เป็น “${name}” แล้ว`, () => void post({ action: "rename", id, name: old })); }
  };
  const deleteCat = async (c: ShopCat) => {
    if (await post({ action: "delete", id: c.id })) toast.undo(`ย้ายหมวด “${c.name}” ลงถังขยะแล้ว (สินค้ายังอยู่บนร้าน)`, () => void post({ action: "restore", id: c.id }));
  };
  const reorderCats = async (from: number, to: number) => {
    if (!data || from === to) return;
    const before = cats.map((c) => c.id);
    const order = moveItem(before, from, to);
    setData({ ...data, cats: data.cats.map((c) => (order.includes(c.id) ? { ...c, sort_order: order.indexOf(c.id) } : c)) });
    if (await post({ action: "reorder", ...shop, ids: order })) toast.undo("เรียงหมวดใหม่แล้ว", () => void post({ action: "reorder", ...shop, ids: before }));
  };

  // ───── สินค้าในหมวด ─────
  const addItems = async (ids: string[]) => {
    if (!cur || !ids.length) return;
    const catId = cur.id, name = cur.name;
    const j = await post({ action: "set_items", category_id: catId, add: ids });
    if (j) { setAddOpen(null); toast.undo(`ใส่ ${Number(j.added ?? ids.length).toLocaleString()} สินค้าเข้า “${name}” แล้ว`, () => void post({ action: "set_items", category_id: catId, remove: ids })); }
  };
  const removeItem = async (pid: string) => {
    if (!cur) return;
    const catId = cur.id, code = productBy.get(pid)?.code ?? "";
    if (await post({ action: "set_items", category_id: catId, remove: [pid] })) toast.undo(`เอา ${code} ออกจาก “${cur.name}” แล้ว`, () => void post({ action: "set_items", category_id: catId, add: [pid] }));
  };
  const reorderItems = async (from: number, to: number) => {
    if (!data || !cur || from === to) return;
    const order = moveItem(curItems.map((i) => i.parent_sku_id), from, to);
    setData({ ...data, items: data.items.map((i) => (i.category_id === cur.id && order.includes(i.parent_sku_id) ? { ...i, sort_order: order.indexOf(i.parent_sku_id) } : i)) });
    await post({ action: "set_items", category_id: cur.id, order });
  };

  // ───── เช็กลิสต์ ─────
  const markDone = async (s: ShopCatStep) => {
    const j = await post({ action: "mark_done", ...shop, key: s.key });
    if (!j?.undo) return;
    const entry: DoneEntry = { key: s.key, title: s.title, undo: j.undo as StepEffect };
    setDoneLog((xs) => [entry, ...xs]);
    toast.undo("ติ๊กว่าทำในหลังร้านแล้ว", () => void revertDone(entry));
  };
  const revertDone = async (e: DoneEntry) => {
    if (await post({ action: "revert", ...shop, undo: e.undo })) setDoneLog((xs) => xs.filter((x) => x !== e));
  };

  const catDrag = useDragReorder((from, to) => void reorderCats(from, to), { group: "shop-cat-list" });
  const itemDrag = useDragReorder((from, to) => void reorderItems(from, to), { group: "shop-cat-items" });

  if (err && !data) return <ErrorState title="โหลดหมวดในร้านไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-10" />;
  if (!data) return <LoadingState label={`กำลังโหลดหมวดในร้าน ${shopLabel}…`} />;

  const catRow = (c: ShopCat, i: number, inModal = false) => (
    editing?.id === c.id ? (
      <div key={c.id} className="flex items-center gap-1.5 border-b border-slate-100 bg-violet-50/50 px-2 py-1.5">
        <input autoFocus value={editing.name} maxLength={SHOP_CAT_NAME_MAX} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setEditing(null); }}
          className="h-8 min-w-0 flex-1 rounded-md border border-violet-300 px-2 text-sm" aria-label="ชื่อหมวด" />
        <button type="button" disabled={busy} onClick={() => void saveRename()} className="h-8 rounded-md bg-violet-600 px-2 text-xs text-white disabled:opacity-50">บันทึก</button>
        <button type="button" onClick={() => setEditing(null)} className="h-8 rounded-md border border-slate-200 px-2 text-xs">ยกเลิก</button>
      </div>
    ) : (
      <div key={c.id} {...(canEdit ? catDrag.rowProps(i) : {})} onClick={() => { if (!inModal) setCurId(c.id); }}
        className={`group flex cursor-pointer items-center gap-1.5 border-b border-slate-100 px-2 py-2 text-sm ${!inModal && cur?.id === c.id ? "bg-violet-50 font-medium text-violet-800" : "hover:bg-slate-50"} ${canEdit ? catDrag.rowCls(i) : ""}`}>
        {canEdit && <DragHandle {...catDrag.handleProps(i)} title="ลากเพื่อเรียงหมวด" />}
        <span className="min-w-0 flex-1 truncate">{c.name}</span>
        {!c.on_shop && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[10px] text-amber-700" title="ยังไม่ได้ติ๊กว่าสร้างในหลังร้าน">ใหม่</span>}
        <span className="shrink-0 text-xs tabular-nums text-slate-400">{planItemsOf(data.items, c.id).length}</span>
        {canEdit && (
          <span className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover:opacity-100">
            <button type="button" onClick={(e) => { e.stopPropagation(); setEditing({ id: c.id, name: c.name }); }} className="rounded p-1 text-slate-500 hover:bg-white" aria-label={`เปลี่ยนชื่อหมวด ${c.name}`}><Icon name="edit" /></button>
            <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void deleteCat(c); }} className="rounded p-1 text-rose-500 hover:bg-white" aria-label={`ลบหมวด ${c.name}`}><Icon name="delete" /></button>
          </span>
        )}
      </div>
    )
  );
  const addRow = canEdit && (newName == null
    ? <button type="button" onClick={() => setNewName("")} className="flex w-full items-center gap-1.5 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50"><Icon name="add" />เพิ่มหมวด</button>
    : (
      <div className="space-y-1 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <input autoFocus value={newName} maxLength={SHOP_CAT_NAME_MAX} placeholder="ชื่อหมวด เช่น กระเป๋าสตางค์" onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); if (e.key === "Escape") setNewName(null); }}
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" aria-label="ชื่อหมวดใหม่" />
          <button type="button" disabled={busy || !newName.trim()} onClick={() => void addCategory()} className="h-8 rounded-md bg-violet-600 px-2 text-xs text-white disabled:opacity-50">เพิ่ม</button>
          <button type="button" onClick={() => setNewName(null)} className="h-8 rounded-md border border-slate-200 px-2 text-xs">ยกเลิก</button>
        </div>
        {newName.trim().length > SHOP_CAT_NAME_WARN && <p className="text-[11px] text-amber-700">ยาวเกิน {SHOP_CAT_NAME_WARN} ตัวอักษร — Shopee จะรับไม่ได้</p>}
      </div>
    ));

  return (
    <div className="space-y-3">
      {/* แถวสรุป */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">{cats.length.toLocaleString()} หมวด · {planned.toLocaleString()} สินค้า</span>
        {unassigned.length > 0 && (
          <button type="button" disabled={!cur} onClick={() => setAddOpen("free")} className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-800 hover:bg-amber-100 disabled:cursor-default" title={cur ? `ดูแล้วใส่เข้า “${cur.name}”` : "เพิ่มหมวดก่อน"}>
            <Icon name="warning" /> ยังไม่อยู่หมวดไหน {unassigned.length.toLocaleString()}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setTrashOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-slate-500 hover:bg-slate-100"><Icon name="delete" />ถังขยะ ({trash.length})</button>
        {canEdit && data.other_plans.length > 0 && <button type="button" onClick={() => setCopyOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-slate-700 hover:bg-slate-50"><Icon name="list" />คัดลอกแผนจากร้านอื่น</button>}
      </div>

      {cats.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState icon={<Icon name="folder" />} title={`ยังไม่มีหมวดในร้าน ${shopLabel}`}
            hint="จัดหมวดที่ลูกค้าเห็นในหน้าร้านไว้ที่นี่ ระบบจะทำเช็กลิสต์ให้ไปกดในหลังร้าน"
            action={canEdit ? { label: "เพิ่มหมวดแรก", onClick: () => setNewName("") } : undefined}
            actions={canEdit && data.other_plans.length ? [{ label: "คัดลอกแผนจากร้านอื่น", onClick: () => setCopyOpen(true) }] : undefined} />
          {newName != null && <div className="border-t border-slate-100">{addRow}</div>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* รายการหมวด: จอใหญ่ = แถบซ้าย · จอเล็ก = ชิปเลื่อนแนวนอน */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            {cats.map((c, i) => catRow(c, i))}
            {addRow}
          </div>
          <div className="md:hidden">
            <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {cats.map((c) => (
                <button key={c.id} type="button" onClick={() => setCurId(c.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${cur?.id === c.id ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>
                  {c.name} <span className="text-xs text-slate-400">{planItemsOf(data.items, c.id).length}</span>
                </button>
              ))}
            </div>
            {canEdit && (
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" onClick={() => setOrderOpen(true)} className="h-9 flex-1 rounded-lg border border-slate-200 bg-white text-sm text-slate-700">จัดหมวด (เพิ่ม · เรียง · แก้ชื่อ)</button>
              </div>
            )}
          </div>

          {/* สินค้าในหมวด */}
          {cur && (
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-base font-medium text-slate-800">{cur.name}</span>
                <span className="text-xs text-slate-500">{curItems.length.toLocaleString()} สินค้า</span>
                <span className="flex-1" />
                {curItems.length > 0 && <CopyButton value={curItems.map((i) => productBy.get(i.parent_sku_id)?.code ?? "").filter(Boolean).join("\n")} label="คัดลอกรหัส" title="คัดลอกรหัสสินค้าทั้งหมวด (บรรทัดละรหัส)" />}
                {canEdit && <button type="button" onClick={() => setAddOpen(suggest.length ? "suggest" : "free")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700"><Icon name="add" />เพิ่มสินค้า</button>}
              </div>
              {curItems.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">ยังไม่มีสินค้าในหมวดนี้{canEdit ? " — กด “เพิ่มสินค้า”" : ""}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {curItems.map((it, i) => {
                    const p = productBy.get(it.parent_sku_id);
                    return (
                      <div key={it.parent_sku_id} {...(canEdit ? itemDrag.rowProps(i) : {})} className={`group relative overflow-hidden rounded-lg border border-slate-200 bg-white ${canEdit ? itemDrag.rowCls(i) : ""}`}>
                        <div {...(canEdit ? itemDrag.holdProps(i) : {})} className="aspect-square bg-slate-50" title={canEdit ? "กดค้างแล้วลากเพื่อเรียง" : undefined}>
                          {p?.cover ? <img src={img(p.cover)} alt="" loading="lazy" draggable={false} className="pointer-events-none h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-slate-300"><Icon name="image" /></span>}
                        </div>
                        <div className="truncate px-1.5 py-1 font-mono text-[11px] text-slate-700" title={p?.name}>{p?.code ?? "—"}</div>
                        {p && !p.listed && <span className="absolute left-1 top-1 rounded-full bg-rose-50 px-1.5 text-[10px] text-rose-700" title="ไม่พบบนร้านนี้แล้ว (หยุดขาย/ยังไม่ลง)">ไม่อยู่บนร้าน</span>}
                        {canEdit && <button type="button" disabled={busy} onClick={() => void removeItem(it.parent_sku_id)} aria-label={`เอา ${p?.code ?? ""} ออกจากหมวด`}
                          className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600 shadow-sm md:opacity-0 md:group-hover:opacity-100"><Icon name="cancel" /></button>}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit && curItems.length > 1 && <p className="mt-1.5 text-[11px] text-slate-400">กดค้างที่รูปแล้วลากเพื่อเรียง · ปุ่มกากบาท = เอาออกจากหมวด (ย้อนกลับได้)</p>}
              {canEdit && suggest.length > 0 && (
                <button type="button" onClick={() => setAddOpen("suggest")} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-violet-200 px-3 py-2 text-left text-sm text-slate-600 hover:bg-violet-50/50">
                  <Icon name="ai" /><span className="min-w-0 flex-1">ระบบแนะนำ {suggest.length.toLocaleString()} สินค้า (เช่น {suggest.slice(0, 3).map((s) => s.product.code).join(", ")})</span><span className="text-violet-700">ดูแล้วเลือกใส่</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* เช็กลิสต์ไปกดในหลังร้าน */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">ต้องไปกดในหลังร้าน {data.platform?.name ?? ""}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${steps.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{steps.length ? `ทำแล้ว ${doneLog.length}/${doneLog.length + steps.length}` : "ตรงกับแผนแล้ว"}</span>
        </div>
        <p className="mb-2 text-xs text-slate-500">รายการคิดจากส่วนที่แผนต่างจากที่ติ๊กว่าทำแล้วครั้งก่อน · แอปไม่รู้ถ้ามีคนไปแก้ในหลังร้านเอง{platformCode === "shopee" ? " · Shopee ส่งหมวดขึ้นร้านเองได้เมื่อร้านได้สิทธิ์ต่อระบบ (ยังไม่ได้)" : ""}</p>
        {steps.length === 0 && doneLog.length === 0 ? <p className="text-sm text-slate-500">ไม่มีอะไรต้องไปกด</p> : (
          <ul className="space-y-1">
            {steps.map((s) => (
              <li key={s.key} className="flex flex-wrap items-start gap-2 text-sm">
                <input type="checkbox" checked={false} disabled={!canEdit || busy} onChange={() => void markDone(s)} className="mt-0.5 h-4 w-4" aria-label={`ทำแล้ว: ${s.title}`} />
                <span className="min-w-0 flex-1">{s.title}</span>
                {s.codes.length > 0 && <CopyButton value={s.codes.join("\n")} label="คัดลอกรหัส" title={`คัดลอก ${s.codes.length} รหัส`} />}
              </li>
            ))}
            {doneLog.map((d) => (
              <li key={`done-${d.key}`} className="flex flex-wrap items-start gap-2 text-sm text-slate-400">
                <Icon name="done" /><s className="min-w-0 flex-1">{d.title}</s>
                {canEdit && <button type="button" disabled={busy} onClick={() => void revertDone(d)} className="text-xs text-violet-700 hover:underline">ยกเลิกติ๊ก</button>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {seller && <a href={seller.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 hover:bg-slate-50"><Icon name="open" />เปิด {seller.label}</a>}
          {steps.length > 0 && <a href={`/print/shop-categories?brand=${encodeURIComponent(brandId)}&platform=${encodeURIComponent(platformId)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 hover:bg-slate-50"><Icon name="print" />พิมพ์เช็กลิสต์</a>}
          {steps.length > 0 && <CopyButton value={checklistText(steps, shopLabel)} label="คัดลอกเช็กลิสต์" title="คัดลอกเป็นข้อความ ไปวางในแชต/โน้ต" />}
        </div>
      </div>

      {/* ป๊อป: เพิ่มสินค้าเข้าหมวด */}
      {cur && addOpen && (
        <AddProductsModal open tab={addOpen} onTab={setAddOpen} onClose={() => setAddOpen(null)} cat={cur} centrals={data.centrals}
          suggest={suggest} free={unassigned} all={data.products.filter((p) => p.listed && !curItems.some((i) => i.parent_sku_id === p.id))}
          busy={busy} canEdit={canEdit} onAdd={(ids) => void addItems(ids)}
          onLinkCentral={(cid) => { const old = cur.central_category_id; void post({ action: "link_central", id: cur.id, central_category_id: cid }).then((j) => { if (j) toast.undo("ผูกหมวดกลางแล้ว", () => void post({ action: "link_central", id: cur.id, central_category_id: old })); }); }} />
      )}

      {/* ป๊อป: จัดหมวด (จอเล็ก) */}
      <ERPModal open={orderOpen} onClose={() => { setOrderOpen(false); setEditing(null); setNewName(null); }} title="จัดหมวดในร้าน" description="กดค้างที่หูจับแล้วลากเพื่อเรียง · ดินสอ = เปลี่ยนชื่อ · ถังขยะ = ลบ (ย้อนกลับได้)" size="md" storageKey="shop-cat-order">
        <div className="overflow-hidden rounded-lg border border-slate-200">{cats.map((c, i) => catRow(c, i, true))}{addRow}</div>
      </ERPModal>

      {/* ป๊อป: ถังขยะ */}
      <ERPModal open={trashOpen} onClose={() => setTrashOpen(false)} title="ถังขยะหมวดในร้าน" description="กู้คืนได้ทุกหมวด · ลบถาวรได้เฉพาะหมวดที่ไม่ค้างบนร้านแล้ว" size="md" storageKey="shop-cat-trash">
        {trash.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">ถังขยะว่าง</p> : (
          <ul className="divide-y divide-slate-100">
            {trash.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.on_shop && <span className="rounded-full bg-amber-50 px-2 text-[11px] text-amber-800">ยังค้างบนร้าน</span>}
                {canEdit && <button type="button" disabled={busy} onClick={() => void post({ action: "restore", id: c.id }).then((j) => { if (j) toast.success(`กู้คืนหมวด “${c.name}” แล้ว`); })} className="h-8 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กู้คืน</button>}
                {canEdit && !c.on_shop && <button type="button" disabled={busy} onClick={() => setPurgeId(c.id)} className="h-8 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50">ลบถาวร</button>}
              </li>
            ))}
          </ul>
        )}
      </ERPModal>
      <ConfirmDialog open={!!purgeId} onClose={() => setPurgeId(null)} variant="danger" loading={busy} confirmText="ลบถาวร"
        title="ลบหมวดถาวร?" message={`หมวด “${trash.find((c) => c.id === purgeId)?.name ?? ""}” และรายการสินค้าในหมวดจะหายจากแผนถาวร กู้คืนไม่ได้ (สินค้าบนร้านไม่โดนลบ)`}
        onConfirm={() => { const id = purgeId; setPurgeId(null); if (id) void post({ action: "purge", id }).then((j) => { if (j) toast.success("ลบถาวรแล้ว"); }); }} />

      {/* ป๊อป: คัดลอกแผนจากร้านอื่น */}
      <ERPModal open={copyOpen} onClose={() => setCopyOpen(false)} title="คัดลอกแผนจากร้านอื่น" description="คัดลอกหมวด + สินค้าในหมวดมาต่อท้าย · หมวดชื่อซ้ำจะข้าม · แก้ทีหลังได้ทุกอย่าง" size="sm" storageKey="shop-cat-copy">
        <div className="space-y-1.5">
          {data.other_plans.map((o) => (
            <button key={o.platform_id} type="button" disabled={busy} onClick={() => void post({ action: "copy_from", ...shop, from_platform_id: o.platform_id }).then((j) => { if (j) { setCopyOpen(false); toast.success(`คัดลอก ${Number(j.categories ?? 0)} หมวด · ${Number(j.items ?? 0)} สินค้า จาก ${o.name} แล้ว`); } })}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
              <span className="min-w-0 flex-1 truncate">{o.name}</span><span className="text-xs text-slate-500">{o.count} หมวด</span>
            </button>
          ))}
        </div>
      </ERPModal>
    </div>
  );
}

/** ป๊อปเลือกสินค้าเข้าหมวด — แนะนำ / ยังไม่อยู่หมวดไหน / ทั้งร้าน · ติ๊กหลายตัวแล้ว "ใส่ N รายการ" (ตารางกลาง MiniTable) */
function AddProductsModal({ open, tab, onTab, onClose, cat, centrals, suggest, free, all, busy, canEdit, onAdd, onLinkCentral }: {
  open: boolean; tab: AddTab; onTab: (t: AddTab) => void; onClose: () => void;
  cat: ShopCat; centrals: { id: string; name: string }[];
  suggest: { product: ShopCatProduct; reason: string }[]; free: ShopCatProduct[]; all: ShopCatProduct[];
  busy: boolean; canEdit: boolean; onAdd: (ids: string[]) => void; onLinkCentral: (cid: string | null) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { setSel(new Set()); }, [cat.id]);
  const reason = new Map(suggest.map((s) => [s.product.id, s.reason]));
  const rows = tab === "suggest" ? suggest.map((s) => s.product) : tab === "free" ? free : all;
  const cols: MiniColumn<ShopCatProduct>[] = [
    { key: "img", header: "", width: "3rem", cell: (p) => (p.cover ? <img src={img(p.cover, 96)} alt="" loading="lazy" className="h-9 w-9 rounded object-cover" /> : <span className="block h-9 w-9 rounded bg-slate-50" />) },
    { key: "code", header: "รหัส", width: "8rem", cell: (p) => <span className="font-mono text-xs">{p.code}</span> },
    { key: "name", header: "ชื่อสินค้า", width: "1.6fr", cell: (p) => <span className="line-clamp-2 text-sm">{p.name}</span> },
    { key: "why", header: tab === "suggest" ? "ทำไมแนะนำ" : "หมวดกลาง", width: "1fr", cell: (p) => <span className="text-xs text-slate-500">{tab === "suggest" ? reason.get(p.id) : p.central_name ?? "—"}</span> },
  ];
  const tabBtn = (t: AddTab, label: string, n: number) => (
    <button key={t} type="button" onClick={() => { onTab(t); setSel(new Set()); }} aria-pressed={tab === t}
      className={`whitespace-nowrap rounded-md px-3 py-1 text-sm ${tab === t ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{label} ({n.toLocaleString()})</button>
  );
  const picked = [...sel].filter((id) => rows.some((r) => r.id === id));
  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="shop-cat-add" title={`เพิ่มสินค้าเข้า “${cat.name}”`} description="เฉพาะสินค้าที่มีบนร้านนี้ · ติ๊กได้หลายตัว"
      hasUnsavedChanges={picked.length > 0}
      footer={canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">ปิด</button>
          <button type="button" disabled={!picked.length || busy} onClick={() => onAdd(picked)} className="h-9 rounded-lg bg-violet-600 px-4 text-sm text-white hover:bg-violet-700 disabled:opacity-50">ใส่ {picked.length.toLocaleString()} รายการ</button>
        </div>
      ) : undefined}>
      <div className="space-y-2">
        <div className="scrollbar-hide flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5">
          {tabBtn("suggest", "แนะนำ", suggest.length)}{tabBtn("free", "ยังไม่อยู่หมวดไหน", free.length)}{tabBtn("all", "ทั้งร้าน", all.length)}
        </div>
        {tab === "suggest" && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            ผูกหมวดกลาง (ช่วยแนะนำแม่นขึ้น)
            <select value={cat.central_category_id ?? ""} disabled={!canEdit || busy} onChange={(e) => onLinkCentral(e.target.value || null)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
              <option value="">ไม่ผูก — เดาจากชื่อหมวด</option>
              {centrals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <MiniTable rows={rows} columns={cols} rowKey={(p) => p.id} searchText={(p) => `${p.code} ${p.name} ${p.central_name ?? ""}`} dense
          selectable={canEdit} selected={sel} onSelectedChange={setSel} storageKey="shop-cat-add-table"
          emptyText={tab === "suggest" ? "ยังไม่มีสินค้าที่แนะนำ — ลองผูกหมวดกลาง หรือดูแท็บ ทั้งร้าน" : tab === "free" ? "สินค้าทุกตัวบนร้านอยู่ในหมวดแล้ว" : "ไม่มีสินค้าบนร้านนี้ที่ยังไม่อยู่หมวดนี้"} />
      </div>
    </ERPModal>
  );
}
