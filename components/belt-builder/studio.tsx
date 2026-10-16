"use client";

/**
 * 🧵 สตูดิโอออกแบบเข็มขัด — หน้าจัดการหลักของ Belt Builder (/admin/belt-builder)
 *
 * เจ้าของขอ: หาหน้าจัดการเจอง่าย · โหลดรูปง่าย · จัดการข้อมูลแบบเห็นภาพ (ไม่ใช่ตารางล้วน)
 *   แถบบน      ชื่อร้าน + สถานะเปิดใช้ · ดูหน้าเว็บ (?preview=1) · ⚙ ตั้งค่าร้าน (ShopSettingsDrawer) · การ์ดสถานะ 4 ใบ
 *   รางซ้าย    สายหนัง / หัว / หู (นับจำนวน) · 📏 กติกาไซซ์ · ✒️ สลักชื่อ · 🧾 แบบของลูกค้า
 *   กริดการ์ด  PartCard: รูปย่อ R2 · สวิตช์เปิด/ปิด (PATCH ทันที) · ลากจัดลำดับ (useDragReorder → /parts/reorder) · ลาก PNG วางบนการ์ด = เปลี่ยนรูป
 *              ตัวกรองชิป (กว้าง 35/40 · ไม่มีรูป · ปิดอยู่) · ติ๊กหลายใบ → BulkActionBar (เปิด/ปิด/ลบ) · + เพิ่ม · อัปโหลดหลายรูป
 *   แผงแก้ไข   PartEditor ใต้กริด (คอม) หรือ Drawer (มือถือ) — ส่งเฉพาะฟิลด์ที่แก้
 * ของกลางที่ใช้: DataTable · Drawer/ERPModal/ConfirmDialog · BulkActionBar · MoneyInput · ColorInput · AssetPicker · useDragReorder · useToast · useMediaQuery
 * API: /api/belt-builder/* (guardApi belt_builder.view/edit + writeAudit) + /api/website/settings (กลุ่ม 🧵) · กฎ lib/belt-builder.ts
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { moveItem, useDragReorder } from "@/components/sortable-list";
import { useToast } from "@/components/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { PART_TYPES, PART_TYPE_LABEL, type PartType } from "@/lib/belt-builder";
import { invalidateRefParts } from "./anchor-editor";
import { PartCard } from "./studio-part-card";
import { PartEditor, blankPart, duplicateBody } from "./studio-part-editor";
import { BulkUploadModal } from "./studio-bulk-upload";
import { ShopSettingsDrawer } from "./studio-settings-drawer";
import { DesignsPanel, EngravingPanel, SizeRulesPanel } from "./studio-panels";
import { createPart, fetchParts, fetchShopInfo, fetchShops, hasImage, money, partWidth, patchPart, reorderParts, softDeletePart, type BeltPart, type BeltShop, type BeltShopInfo } from "./studio-data";
import { uploadBeltPartPng } from "./upload-png";

type Rail = PartType | "sizes" | "engraving" | "designs";
const WIDTHS = [35, 40];

export function BeltStudio({ shopId: shopIdProp, onShopChange, onOpenTables }: {
  /** ร้านที่เลือกจากหน้าแม่ (ว่าง = ให้สตูดิโอเลือกเอง: louismontini หรือร้านแรก) */
  shopId?: string;
  onShopChange?: (shop: BeltShop) => void;
  /** กดแท็บ "📋 ตาราง" (มุมมองขั้นสูง) */
  onOpenTables?: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can("belt_builder.edit");
  const isWide = useMediaQuery("(min-width: 1024px)");

  const [shops, setShops] = useState<BeltShop[]>([]);
  const [shopId, setShopId] = useState(shopIdProp ?? "");
  const [shopErr, setShopErr] = useState<string | null>(null);
  const shop = shops.find((s) => s.id === shopId) ?? null;
  const [info, setInfo] = useState<BeltShopInfo | null>(null);

  const [parts, setParts] = useState<BeltPart[] | null>(null);
  const [partsErr, setPartsErr] = useState<string | null>(null);
  const [rail, setRail] = useState<Rail>("strap");
  const [widthFilter, setWidthFilter] = useState<number | null>(null);
  const [onlyNoImage, setOnlyNoImage] = useState(false);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; danger?: boolean; run: () => Promise<void> } | null>(null);
  const [designsTotal, setDesignsTotal] = useState<number | null>(null);

  // ── โหลดร้าน ──
  useEffect(() => {
    fetchShops().then((rows) => {
      setShops(rows);
      if (rows.length === 0) setShopErr("ยังไม่มีร้านที่เปิดอยู่ในระบบ (ตาราง shops)");
      setShopId((cur) => cur || shopIdProp || rows.find((s) => s.slug === "louismontini")?.id || rows[0]?.id || "");
    }).catch((e) => setShopErr(e instanceof Error ? e.message : "โหลดรายชื่อร้านไม่สำเร็จ"));
  }, [shopIdProp]);
  useEffect(() => { if (shopIdProp && shopIdProp !== shopId) setShopId(shopIdProp); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIdProp]);
  useEffect(() => { if (shop) onShopChange?.(shop); }, [shop, onShopChange]);

  // ── โหลดชิ้นส่วน + ข้อมูลร้าน ──
  const loadParts = useCallback(async () => {
    if (!shopId) return;
    try { setParts(await fetchParts(shopId)); setPartsErr(null); }
    catch (e) { setPartsErr(e instanceof Error ? e.message : "โหลดชิ้นส่วนไม่สำเร็จ"); }
  }, [shopId]);
  useEffect(() => { setParts(null); setSelectedId(null); setChecked(new Set()); setDesignsTotal(null); void loadParts(); }, [loadParts]);
  useEffect(() => {
    if (!shop) return;
    setInfo(null);
    fetchShopInfo(shop.slug).then(setInfo).catch(() => setInfo({ belt_enabled: false, belt_base_price: 0, belt_engraving_fee: 0, belt_engraving_max: 0, belt_lead_time: "" }));
  }, [shop]);
  useEffect(() => {
    if (!shopId || designsTotal !== null) return;
    import("./studio-data").then((m) => m.fetchDesigns(shopId)).then((r) => setDesignsTotal(r.total)).catch(() => setDesignsTotal(0));
  }, [shopId, designsTotal]);

  // ── รายการที่โชว์ ──
  const partType: PartType | null = PART_TYPES.includes(rail as PartType) ? (rail as PartType) : null;
  const typeList = useMemo(() => (parts ?? []).filter((p) => p.part_type === partType).sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? "").localeCompare(b.created_at ?? "")), [parts, partType]);
  const filtered = useMemo(() => typeList.filter((p) => (widthFilter == null || partWidth(p) === widthFilter) && (!onlyNoImage || !hasImage(p)) && (!onlyInactive || !p.is_active)), [typeList, widthFilter, onlyNoImage, onlyInactive]);
  const filtering = widthFilter != null || onlyNoImage || onlyInactive;
  const selected = parts?.find((p) => p.id === selectedId) ?? null;
  const widthsInType = useMemo(() => Array.from(new Set(typeList.map(partWidth).filter((w): w is number => w != null))).sort((a, b) => a - b), [typeList]);
  const widthChips = widthsInType.length ? widthsInType : WIDTHS;

  const counts = useMemo(() => {
    const all = parts ?? [];
    return { total: all.length, noImage: all.filter((p) => !hasImage(p)).length, byType: Object.fromEntries(PART_TYPES.map((t) => [t, all.filter((p) => p.part_type === t).length])) as Record<PartType, number> };
  }, [parts]);

  // ── แก้ไขรายใบ ──
  const replacePart = (p: BeltPart) => setParts((cur) => (cur ?? []).map((x) => (x.id === p.id ? p : x)));
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyIds((s) => new Set(s).add(id));
    try { await fn(); } finally { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };
  const toggleActive = (p: BeltPart, next: boolean) => withBusy(p.id, async () => {
    try { replacePart(await patchPart(p.id, { is_active: next })); invalidateRefParts(shopId); toast.success(next ? `เปิด "${p.name_th}" แล้ว` : `ปิด "${p.name_th}" แล้ว (ซ่อนจากเว็บ)`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  });
  const dropFile = (p: BeltPart, file: File) => withBusy(p.id, async () => {
    try {
      const up = await uploadBeltPartPng(file);
      replacePart(await patchPart(p.id, { image_key: up.r2_key, image_url: null }));
      invalidateRefParts(shopId);
      up.warnings.forEach((w) => toast.warning(w));
      toast.success(`เปลี่ยนรูป "${p.name_th}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
  });
  const addPart = async () => {
    if (!partType) return;
    try {
      const created = await createPart(blankPart(shopId, partType, (typeList[typeList.length - 1]?.sort_order ?? 0) + 10));
      setParts((cur) => [...(cur ?? []), created]);
      setSelectedId(created.id);
      toast.success("เพิ่มชิ้นใหม่แล้ว (ปิดไว้ก่อน) — ใส่ชื่อ/รูป แล้วกดบันทึก");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const duplicate = async (p: BeltPart) => {
    try {
      const created = await createPart(duplicateBody(p, p.sort_order + 5));
      setParts((cur) => [...(cur ?? []), created]);
      setSelectedId(created.id);
      toast.success(`ทำสำเนา "${p.name_th}" แล้ว (ปิดไว้ก่อน)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำสำเนาไม่สำเร็จ"); }
  };
  const askDelete = (p: BeltPart) => setConfirm({
    title: `ลบ "${p.name_th}"?`, danger: true,
    message: "ชิ้นนี้จะหายจากเว็บและสตูดิโอทันที (ลบแบบกู้คืนได้ — ดูที่แท็บ \"ตาราง\" แล้วติ๊กโชว์ที่ปิดอยู่ ถ้าต้องการกู้)",
    run: async () => {
      await softDeletePart(p.id);
      setParts((cur) => (cur ?? []).filter((x) => x.id !== p.id));
      if (selectedId === p.id) setSelectedId(null);
      invalidateRefParts(shopId);
      toast.success(`ลบ "${p.name_th}" แล้ว`);
    },
  });

  // ── ลากจัดลำดับ (เฉพาะตอนไม่กรอง — จะได้ไม่สับสนว่าลำดับจริงเป็นยังไง) ──
  const reorder = async (from: number, to: number) => {
    if (!partType || filtering) return;
    const prev = typeList;
    const next = moveItem(prev, from, to);
    setParts((cur) => (cur ?? []).map((p) => { const i = next.findIndex((n) => n.id === p.id); return i >= 0 ? { ...p, sort_order: (i + 1) * 10 } : p; }));
    try { await reorderParts(shopId, next.map((p) => p.id)); invalidateRefParts(shopId); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ"); void loadParts(); }
  };
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => void reorder(from, to));

  // ── หลายใบ ──
  const checkedParts = (parts ?? []).filter((p) => checked.has(p.id));
  const bulkActive = (next: boolean) => setConfirm({
    title: `${next ? "เปิด" : "ปิด"} ${checkedParts.length} ชิ้น?`,
    message: next ? "ลูกค้าจะเลือกชิ้นเหล่านี้บนเว็บได้ทันที" : "ชิ้นเหล่านี้จะหายจากตัวเลือกบนเว็บ (ข้อมูลยังอยู่ เปิดกลับได้)",
    run: async () => {
      const results = await Promise.allSettled(checkedParts.filter((p) => p.is_active !== next).map((p) => patchPart(p.id, { is_active: next })));
      results.forEach((r) => { if (r.status === "fulfilled") replacePart(r.value); });
      const failed = results.filter((r) => r.status === "rejected").length;
      invalidateRefParts(shopId);
      setChecked(new Set());
      if (failed) toast.error(`มี ${failed} ชิ้นบันทึกไม่สำเร็จ`); else toast.success(`${next ? "เปิด" : "ปิด"} ${results.length} ชิ้นแล้ว`);
    },
  });
  const bulkDelete = () => setConfirm({
    title: `ลบ ${checkedParts.length} ชิ้น?`, danger: true,
    message: "ลบแบบกู้คืนได้ — ชิ้นเหล่านี้จะหายจากเว็บและสตูดิโอ (กู้คืนได้จากแท็บ \"ตาราง\")",
    run: async () => {
      const results = await Promise.allSettled(checkedParts.map((p) => softDeletePart(p.id)));
      const okIds = new Set(checkedParts.filter((_, i) => results[i].status === "fulfilled").map((p) => p.id));
      setParts((cur) => (cur ?? []).filter((p) => !okIds.has(p.id)));
      if (selectedId && okIds.has(selectedId)) setSelectedId(null);
      invalidateRefParts(shopId);
      setChecked(new Set());
      const failed = results.length - okIds.size;
      if (failed) toast.error(`มี ${failed} ชิ้นลบไม่สำเร็จ`); else toast.success(`ลบ ${okIds.size} ชิ้นแล้ว`);
    },
  });

  const runConfirm = async () => { const c = confirm; setConfirm(null); if (!c) return; try { await c.run(); } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); } };

  // ── UI ──
  const siteUrl = shop?.site_url ?? null;
  const previewUrl = siteUrl ? `${siteUrl}/belt-builder?preview=1` : null;
  const chip = (on: boolean, extra = "") => `rounded-full border px-3 py-1 text-xs transition ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"} ${extra}`;
  const railBtn = (on: boolean) => `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${on ? "bg-indigo-50 font-medium text-indigo-800" : "text-slate-600 hover:bg-slate-100"}`;

  if (shopErr && !shopId) return <div className="p-6 text-sm text-amber-700">⚠ {shopErr} — ต้องเข้าสู่ระบบและมีสิทธิ์ &quot;ดูตั้งค่าออกแบบเข็มขัด&quot; (belt_builder.view)</div>;

  const editorPanel = selected && (
    <PartEditor key={selected.id} part={selected} shopId={shopId} canEdit={canEdit} previewWidth={isWide ? 640 : Math.min(640, (typeof window !== "undefined" ? window.innerWidth : 400) - 48)}
      onSaved={(p) => replacePart(p)} onClose={() => setSelectedId(null)} onDuplicate={(p) => void duplicate(p)} onDelete={askDelete} />
  );

  return (
    <div className="min-h-[70vh] bg-slate-50/60">
      {/* ── แถบบน ── */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">🧵</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-slate-800">สตูดิโอออกแบบเข็มขัด</h1>
              {shops.length > 1 ? (
                <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm">
                  {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : <span className="text-sm text-slate-600">{shop?.name ?? "…"}</span>}
              {info && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.belt_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{info.belt_enabled ? "● เปิดใช้บนเว็บ" : "○ ปิดอยู่"}</span>
              )}
            </div>
            <div className="text-xs text-slate-500">ลูกค้าประกอบเข็มขัดเองบนเว็บ — ที่นี่คือที่ใส่รูปชิ้นส่วน ตั้งราคา และจัดตำแหน่งบนพรีวิว</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">👁 ดูหน้าเว็บ ↗</a>
            ) : (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-400" title="ร้านนี้ยังไม่ตั้งโดเมน (shop_domains)">👁 ดูหน้าเว็บ (ยังไม่มีโดเมน)</span>
            )}
            <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">⚙ ตั้งค่าร้าน</button>
            {onOpenTables && <button type="button" onClick={onOpenTables} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100" title="มุมมองตารางแบบละเอียด (ขั้นสูง)">📋 ตาราง</button>}
          </div>
        </div>

        {/* การ์ดสถานะ 4 ใบ */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatusCard label="ราคาฐาน" value={info ? (info.belt_base_price > 0 ? money(info.belt_base_price) : "ยังไม่ตั้ง") : "…"} tone={info && info.belt_base_price <= 0 ? "danger" : "ok"}
            hint={info && info.belt_base_price <= 0 ? "เว็บจะโชว์ \"สอบถามราคา\" — กดตั้ง" : "ก่อนบวกราคาเพิ่มของแต่ละชิ้น"} onClick={() => setSettingsOpen(true)} />
          <StatusCard label="ค่าสลักชื่อ" value={info ? (info.belt_engraving_max > 0 ? `${money(info.belt_engraving_fee)} · ${info.belt_engraving_max} ตัว` : "ปิดสลักชื่อ") : "…"} tone="neutral" hint="ค่าธรรมเนียม · จำนวนตัวอักษรสูงสุด" onClick={() => setRail("engraving")} />
          <StatusCard label="รูปที่ยังไม่อัปโหลด" value={parts ? `${counts.noImage} / ${counts.total}` : "…"} tone={counts.noImage > 0 ? "warn" : "ok"} hint={counts.noImage > 0 ? "กดเพื่อกรองเฉพาะชิ้นที่ไม่มีรูป" : "ครบทุกชิ้นแล้ว"}
            onClick={() => { if (!partType) setRail("strap"); setOnlyNoImage(true); setOnlyInactive(false); }} />
          <StatusCard label="แบบของลูกค้า" value={designsTotal == null ? "…" : `${designsTotal} แบบ`} tone="neutral" hint="ที่ลูกค้ากดบันทึกบนเว็บ" onClick={() => setRail("designs")} />
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
        {/* ── รางซ้าย ── */}
        <aside className="border-b border-slate-200 bg-white p-2 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            <div className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">ชิ้นส่วน</div>
            {PART_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => { setRail(t); setSelectedId(null); setChecked(new Set()); }} className={`${railBtn(rail === t)} shrink-0 lg:shrink`}>
                <span>{PART_TYPE_LABEL[t].icon}</span><span className="whitespace-nowrap">{PART_TYPE_LABEL[t].th}</span>
                <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-500">{parts ? counts.byType[t] : "…"}</span>
              </button>
            ))}
            <div className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">กติกา</div>
            <button type="button" onClick={() => setRail("sizes")} className={`${railBtn(rail === "sizes")} shrink-0`}>📏 <span className="whitespace-nowrap">กติกาไซซ์</span></button>
            <button type="button" onClick={() => setRail("engraving")} className={`${railBtn(rail === "engraving")} shrink-0`}>✒️ <span className="whitespace-nowrap">สลักชื่อ</span></button>
            <div className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">ลูกค้า</div>
            <button type="button" onClick={() => setRail("designs")} className={`${railBtn(rail === "designs")} shrink-0`}>🧾 <span className="whitespace-nowrap">แบบของลูกค้า</span>{designsTotal != null && <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-500">{designsTotal}</span>}</button>
          </div>
          {partType && (
            <div className="mt-3 hidden rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500 lg:block">
              <b className="text-slate-700">วิธีใช้</b><br />• กดการ์ด = แก้ไข/ปรับจุดยึด<br />• ลากไฟล์ PNG วางบนการ์ด = เปลี่ยนรูป<br />• ลากที่ ⠿ = จัดลำดับที่โชว์บนเว็บ<br />• สวิตช์ = เปิด/ปิดให้ลูกค้าเลือก
            </div>
          )}
        </aside>

        {/* ── เนื้อหา ── */}
        <main className="min-w-0 p-4">
          {partType && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{PART_TYPE_LABEL[partType].icon} {PART_TYPE_LABEL[partType].th} <span className="font-normal text-slate-400">({filtered.length}{filtering ? ` จาก ${typeList.length}` : ""})</span></span>
                <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
                {(partType === "strap" || partType === "buckle") && widthChips.map((w) => (
                  <button key={w} type="button" className={chip(widthFilter === w)} onClick={() => setWidthFilter(widthFilter === w ? null : w)}>กว้าง {w} มม.</button>
                ))}
                <button type="button" className={chip(onlyNoImage)} onClick={() => setOnlyNoImage(!onlyNoImage)}>ไม่มีรูป{counts.noImage ? ` (${typeList.filter((p) => !hasImage(p)).length})` : ""}</button>
                <button type="button" className={chip(onlyInactive)} onClick={() => setOnlyInactive(!onlyInactive)}>ปิดอยู่ ({typeList.filter((p) => !p.is_active).length})</button>
                {filtering && <button type="button" onClick={() => { setWidthFilter(null); setOnlyNoImage(false); setOnlyInactive(false); }} className="text-xs text-slate-500 underline">ล้างตัวกรอง</button>}
                {canEdit && (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" onClick={() => setBulkOpen(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">📤 อัปโหลดหลายรูป</button>
                    <button type="button" onClick={() => void addPart()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">+ เพิ่ม{PART_TYPE_LABEL[partType].th}</button>
                  </div>
                )}
              </div>
              {filtering && canEdit && <div className="mb-2 text-[11px] text-slate-400">กำลังกรองอยู่ — ลากจัดลำดับได้เมื่อล้างตัวกรอง</div>}

              {partsErr ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠ {partsErr} <button className="ml-2 underline" onClick={() => void loadParts()}>ลองใหม่</button></div>
              ) : parts === null ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-slate-200/70" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                  {typeList.length === 0 ? <>ยังไม่มี{PART_TYPE_LABEL[partType].th}ในร้านนี้{canEdit && <> — กด <b>+ เพิ่ม{PART_TYPE_LABEL[partType].th}</b> เพื่อเริ่ม</>}</> : "ไม่มีชิ้นที่ตรงตัวกรอง"}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {filtered.map((p, i) => (
                    <div key={p.id} {...(filtering ? {} : rowProps(i))} className={filtering ? "" : rowCls(i)}>
                      <PartCard part={p} selected={selectedId === p.id} checked={checked.has(p.id)} canEdit={canEdit} busy={busyIds.has(p.id)}
                        dragHandleProps={filtering ? undefined : handleProps(i)}
                        onSelect={() => setSelectedId(selectedId === p.id ? null : p.id)}
                        onToggleCheck={() => setChecked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                        onToggleActive={(next) => void toggleActive(p, next)}
                        onDropFile={(f) => void dropFile(p, f)} />
                    </div>
                  ))}
                </div>
              )}

              {/* แผงแก้ไข (คอม = ใต้กริด · มือถือ = Drawer) */}
              {selected && isWide && (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">{editorPanel}</div>
              )}
              {selected && !isWide && (
                <Drawer open onClose={() => setSelectedId(null)} title={`${PART_TYPE_LABEL[selected.part_type].icon} ${selected.name_th}`} size="xl" storageKey="belt-studio-editor">{editorPanel}</Drawer>
              )}

              {canEdit && (
                <BulkActionBar count={checked.size} unit="ชิ้น" onClear={() => setChecked(new Set())}
                  extra={<button type="button" className="underline" onClick={() => setChecked(new Set(filtered.map((p) => p.id)))}>เลือกทั้งหมดที่แสดง ({filtered.length})</button>}>
                  <button type="button" onClick={() => bulkActive(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500">เปิดใช้</button>
                  <button type="button" onClick={() => bulkActive(false)} className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm hover:bg-slate-500">ปิด</button>
                  <button type="button" onClick={bulkDelete} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500">ลบ</button>
                </BulkActionBar>
              )}
            </>
          )}

          {rail === "sizes" && <SizeRulesPanel shopId={shopId} canEdit={canEdit} />}
          {rail === "engraving" && <EngravingPanel info={info} parts={parts ?? []} onOpenSettings={() => setSettingsOpen(true)} />}
          {rail === "designs" && <DesignsPanel shopId={shopId} parts={parts ?? []} siteUrl={siteUrl} onTotal={setDesignsTotal} />}
        </main>
      </div>

      <ShopSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} shopId={shopId} info={info} canEdit={canEdit} onSaved={setInfo} />
      <BulkUploadModal open={bulkOpen} onClose={() => setBulkOpen(false)} parts={partType ? typeList : parts ?? []} shopId={shopId}
        onDone={(updated) => updated.forEach(replacePart)} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => void runConfirm()} title={confirm?.title ?? ""} message={confirm?.message ?? ""}
        variant={confirm?.danger ? "danger" : "default"} confirmText={confirm?.danger ? "ลบ" : "ยืนยัน"} />
    </div>
  );
}

function StatusCard({ label, value, hint, tone, onClick }: { label: string; value: string; hint?: string; tone: "ok" | "warn" | "danger" | "neutral"; onClick?: () => void }) {
  const cls = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-800";
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${cls}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] opacity-70">{hint}</div>}
    </button>
  );
}
