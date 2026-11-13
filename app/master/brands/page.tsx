"use client";

/**
 * จัดการแบรนด์ (สำหรับโกดัง QC / บอร์ดจ่ายงาน / คลัง Artwork) — แบบตารางคอลัมน์ (เจ้าของเลือกแบบ A 2026-11-06 "ให้ดู minimal")
 * - ต่อแบรนด์: โลโก้ · สีประจำแบรนด์ (สีการ์ด) · ธง "งานลูกค้า" (→ badge งานลูกค้า) · OEM (ไม่มีราคาขาย) · ซ่อนใน Artwork
 *   งานลูกค้า → ตั้ง "ลูกค้าประจำแบรนด์" ใต้ชื่อ — หลายสาขาได้ (เจ้าของขอ 2026-11-07) · กติกา lib/brand-customers.ts
 *   ใช้ที่ป๊อปสร้างใบสั่งผลิต/ลงออเดอร์: รายเดียว = เติมให้ · หลายราย = มีปุ่มให้กดเลือกสาขา (lib/mo-so-rule.ts)
 * - ช่างเหมา: ย้ายไปติ๊กที่หน้าพนักงาน (/payroll/employees/<id> ปุ่ม "ช่างเหมา" · employees.is_subcontract) — เดิมเป็นแท็บในหน้านี้
 *   ลูกค้าเยอะ (เช่น 30 สาขา) → โชว์ 3 รายแรก + "+N ดูทั้งหมด" · กางแล้วจัดกลุ่มตามบริษัท (เจ้าของขอ 2026-11-11)
 * - 🛒 ซ่อนในช่องทางขาย (2026-11-13): ไม่โชว์ในตัวเลือกแบรนด์ของแอปช่องทางขาย (/api/platform-accounts · /api/platform-dashboard) — ข้อมูลร้าน/ออเดอร์ไม่หาย
 *   เปิด "งานลูกค้า" = เปิดสวิตช์นี้ให้ด้วย (พฤติกรรมเดิม · ปิดเองได้) · แบรนด์ที่มีร้านผูกอยู่ = ถามก่อนซ่อน
 * ของกลาง: ToggleSwitch · ImageInput · CustomerPicker · FloatingDropdown · askConfirm · useToast · Icon · ChipOverflow · lib/company-branch
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { ToggleSwitch } from "@/components/toggle-switch";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import type { Brand } from "@/app/api/brands/route";
import { BRAND_CUSTOMER_MAX, type BrandCustomer } from "@/lib/brand-customers";
import { ChipOverflow } from "@/components/chip-overflow";
import { groupByCompany } from "@/lib/company-branch";

// คอลัมน์ตาราง: แบรนด์ | งานลูกค้า | OEM | ซ่อนใน Artwork | ซ่อนในช่องทางขาย | ⋯
const GRID = "grid grid-cols-[minmax(0,1fr)_76px_64px_88px_96px_36px] items-center gap-2";

export default function BrandsPage() {
  const canView = usePermission("products.view");
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);   // กำลังแก้ชื่อแบรนด์ไหน
  const [editName, setEditName] = useState("");

  const loadBrands = useCallback(async () => {
    try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void loadBrands(); }, [loadBrands]);

  const patchBrand = async (id: string, p: Partial<Brand>) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, ...p } : b));
    const { default_customer: _dc, default_customers: _dcs, ...send } = p; void _dc; void _dcs;   // ชื่อลูกค้าไว้โชว์อย่างเดียว ไม่ส่งไปบันทึก
    try { const r = await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...send }) }); const j = await r.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void loadBrands(); }
  };
  const addBrand = async () => {
    const name = newBrand.trim(); if (!name) return;
    try { const r = await apiFetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await r.json(); if (j.error) throw new Error(j.error); setNewBrand(""); toast.success("เพิ่มแบรนด์แล้ว"); await loadBrands(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const saveRename = async (id: string) => {
    const name = editName.trim();
    setEditingId(null);
    const cur = brands.find((b) => b.id === id);
    if (!name || !cur || name === cur.name) return;   // ไม่เปลี่ยน → ไม่ต้องบันทึก
    await patchBrand(id, { name });
  };
  /** ตั้งรายการลูกค้าประจำแบรนด์ทั้งรายการ (เพิ่ม/เอาออก) */
  const setCustomers = (id: string, list: BrandCustomer[]) =>
    patchBrand(id, { default_customer_ids: list.map((c) => c.id), default_customers: list, default_customer: list[0] ?? null });
  const deleteBrand = async (id: string, name: string) => {
    const ok = await askConfirm({ title: `ลบแบรนด์ “${name}”?`, message: "ซ่อนจากรายการ — ข้อมูลเดิมที่อ้างถึงแบรนด์นี้ยังอยู่", confirmText: "ลบแบรนด์", variant: "danger" });
    if (!ok) return;
    setBrands((bs) => bs.filter((b) => b.id !== id));
    try { const r = await apiFetch(`/api/brands?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success("ลบแบรนด์แล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); void loadBrands(); }
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-[860px] mx-auto px-5 py-5">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-800"><Icon value="🎨" /> แบรนด์</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          สีประจำแบรนด์ · งานลูกค้า · OEM · ซ่อนใน Artwork · ซ่อนในช่องทางขาย — ใช้แสดงสี/ป้ายบนโกดัง QC และบอร์ดจ่ายงาน
          <span className="text-slate-400"> · ช่างเหมาตั้งที่ </span>
          <Link href="/payroll/employees" className="text-indigo-600 hover:underline">หน้าพนักงาน</Link>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-slate-100">
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} placeholder="เพิ่มแบรนด์ใหม่…" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={addBrand} className="h-9 px-3 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">+ เพิ่ม</button>
        </div>
        {/* หัวคอลัมน์บอกครั้งเดียว — ทุกแถวเป็นสวิตช์ตรงกัน */}
        <div className={`${GRID} px-3 py-2 bg-slate-50 text-[11px] font-medium text-slate-500`}>
          <span>แบรนด์</span>
          <span className="text-center" title="งานรับทำให้ลูกค้า → ป้าย “งานลูกค้า” บนโกดัง QC/บอร์ด · ตั้งลูกค้าประจำได้">งานลูกค้า</span>
          <span className="text-center" title="รับจ้างผลิต ราคาคิดต่อออเดอร์ — หน้าแผนผู้บริหารไม่เตือนว่า “ยังไม่ตั้งราคาขาย”">OEM</span>
          <span className="text-center" title="ไม่โชว์แบรนด์นี้ในตัวเลือกของคลัง Artwork">ซ่อนใน Artwork</span>
          <span className="text-center" title="ไม่โชว์แบรนด์นี้ในตัวเลือกแบรนด์ของแอปช่องทางขาย (แดชบอร์ดแพลตฟอร์ม · ลงสินค้า · สินค้าบนแพลตฟอร์ม · ออเดอร์ ฯลฯ) — ข้อมูลร้าน/ออเดอร์เดิมไม่หาย">ซ่อนในช่องทางขาย</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {brands.map((b) => (
            <div key={b.id} className={`${GRID} px-3 py-2`}>
              <div className="flex items-center gap-2.5 min-w-0">
                {/* โลโก้แบรนด์ (ของกลาง ImageInput — อัป/ลากวาง/วาง/เลือกจากคลัง, เก็บ R2 key ใน logo_url) */}
                <div className="shrink-0" title="โลโก้แบรนด์">
                  <ImageInput compact value={b.logo_url ?? null} onChange={(key) => patchBrand(b.id, { logo_url: key })} folder="brands" />
                </div>
                {/* สีแบรนด์ — กดจุดสีเพื่อเปลี่ยน */}
                <label className="relative h-4 w-4 shrink-0 cursor-pointer rounded-full border border-slate-300" style={{ background: b.color ?? "transparent" }} title="กดเพื่อเปลี่ยนสีแบรนด์">
                  <input type="color" value={b.color ?? "#94a3b8"} onChange={(e) => patchBrand(b.id, { color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`สีแบรนด์ ${b.name}`} />
                </label>
                <div className="min-w-0 flex-1">
                  {editingId === b.id ? (
                    <input
                      autoFocus value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveRename(b.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => void saveRename(b.id)}
                      className="w-full h-7 px-2 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <div className="truncate text-sm text-slate-800" title="ดับเบิลคลิกเพื่อแก้ชื่อ" onDoubleClick={() => { setEditingId(b.id); setEditName(b.name); }}>{b.name}</div>
                  )}
                  {/* ลูกค้าประจำแบรนด์ — เฉพาะงานลูกค้า · อยู่ใต้ชื่อ · หลายสาขาได้ */}
                  {b.is_customer_job && (
                    <BrandCustomersCell list={b.default_customers ?? []} onChange={(list) => void setCustomers(b.id, list)} />
                  )}
                </div>
              </div>
              <div className="flex justify-center"><ToggleSwitch size="sm" on={!!b.is_customer_job} onChange={(v) => {
                // เปิดงานลูกค้า = ซ่อนในช่องทางขายให้ด้วย (พฤติกรรมเดิม) · ปิดเองได้ที่สวิตช์ข้าง ๆ
                if (v && !b.hide_in_sales_channels) { void patchBrand(b.id, { is_customer_job: true, hide_in_sales_channels: true }); toast.info(`ซ่อน ${b.name} ในช่องทางขายให้ด้วย — ถ้าขายออนไลน์ ปิดสวิตช์ "ซ่อนในช่องทางขาย" ได้`); }
                else void patchBrand(b.id, { is_customer_job: v });
              }} title={`${b.name}: งานลูกค้า`} /></div>
              <div className="flex justify-center"><ToggleSwitch size="sm" on={b.pricing_mode === "oem"} onChange={(v) => patchBrand(b.id, { pricing_mode: v ? "oem" : "own" })} title={`${b.name}: OEM (ไม่มีราคาขาย)`} /></div>
              <div className="flex justify-center"><ToggleSwitch size="sm" on={!!b.hide_in_artwork} onChange={(v) => patchBrand(b.id, { hide_in_artwork: v })} title={`${b.name}: ซ่อนใน Artwork`} /></div>
              <div className="flex flex-col items-center">
                <ToggleSwitch size="sm" on={!!b.hide_in_sales_channels} title={`${b.name}: ซ่อนในช่องทางขาย${b.shop_count ? ` (มีร้านผูกอยู่ ${b.shop_count} ร้าน)` : ""}`}
                  onChange={async (v) => {
                    if (v && (b.shop_count ?? 0) > 0) {
                      const ok = await askConfirm({ title: `ซ่อน ${b.name} ในช่องทางขาย?`, confirmText: "ซ่อน",
                        message: `แบรนด์นี้มีร้าน/บัญชีแพลตฟอร์มผูกอยู่ ${b.shop_count} ร้าน — ซ่อนแล้วจะไม่เห็นในตัวเลือกแบรนด์ของหน้าแพลตฟอร์ม (ลงสินค้า · จับคู่ · ออเดอร์) แต่ร้าน ออเดอร์ และสินค้าเดิมยังอยู่ครบ · ตั้งค่าร้านยังทำได้ที่หน้า "ร้าน/บัญชีแพลตฟอร์ม"` });
                      if (!ok) return;
                    }
                    void patchBrand(b.id, { hide_in_sales_channels: v });
                  }} />
                {(b.shop_count ?? 0) > 0 && <span className="mt-0.5 text-[10px] text-slate-400">{b.shop_count} ร้าน</span>}
              </div>
              <RowMenu onRename={() => { setEditingId(b.id); setEditName(b.name); }} onDelete={() => void deleteBrand(b.id, b.name)} />
            </div>
          ))}
          {loaded && brands.length === 0 && <div className="text-center text-sm text-slate-400 py-12">ยังไม่มีแบรนด์ — พิมพ์ชื่อด้านบนแล้วกด + เพิ่ม</div>}
          {!loaded && <div className="text-center text-sm text-slate-400 py-12">กำลังโหลด…</div>}
        </div>
      </div>
    </div>
  );
}

/** ลูกค้าประจำแบรนด์ (หลายสาขา): ชิปชื่อ + × เอาออก · ช่องเลือกลูกค้ากลางโหมดติ๊กหลายรายการ (ตัวที่เลือกแล้วไม่โชว์ในรายการ) */
function BrandCustomersCell({ list, onChange }: { list: BrandCustomer[]; onChange: (list: BrandCustomer[]) => void }) {
  const toast = useToast();
  const full = list.length >= BRAND_CUSTOMER_MAX;
  const addMany = (vs: CustomerPickerValue[]) => {
    const fresh = vs.filter((c) => !list.some((x) => x.id === c.id)).map((c) => ({ id: c.id, code: c.code, name: c.name }));
    const room = BRAND_CUSTOMER_MAX - list.length;
    if (fresh.length > room) toast.error(`ตั้งลูกค้าประจำแบรนด์ได้สูงสุด ${BRAND_CUSTOMER_MAX} ราย — เพิ่มให้ ${room} รายแรก`);
    if (fresh.length && room > 0) onChange([...list, ...fresh.slice(0, room)]);
  };
  // กางดูทั้งหมด → จัดกลุ่มตามบริษัท ชิปโชว์แค่ชื่อสาขา · สาขาชื่อซ้ำในบริษัทเดียวกัน = น่าจะเป็นคู่ค้าซ้ำในทะเบียน → ติดป้าย "ซ้ำ?"
  const groups = groupByCompany(list, (c) => c.name);
  const branchOf = new Map<string, string>();
  const dupIds = new Set<string>();
  for (const g of groups) {
    const seen = new Map<string, string>();
    for (const { item, branch } of g.items) {
      branchOf.set(item.id, branch);
      const k = branch.toLowerCase();
      const first = seen.get(k);
      if (branch && first) { dupIds.add(item.id); dupIds.add(first); }
      else seen.set(k, item.id);
    }
  }
  return (
    <div className="mt-1 space-y-1">
      <ChipOverflow
        items={list} getKey={(c) => c.id} max={3}
        groupItems={() => groups.map((g) => ({ label: g.company, items: g.items.map((x) => x.item) }))}
        renderChip={(c, { grouped }) => (
          <span title={c.code ? `${c.code} · ${c.name}` : c.name}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] leading-snug text-slate-700">
            {/* ชื่อเต็ม (ไม่ตัด) — สาขามักต่างกันแค่ท้ายชื่อ เช่น "…สำนักงานใหญ่" / "…สาขาเซ็นทรัลเวิลด์" · ตอนจัดกลุ่มโชว์แค่สาขา (ชี้ดูชื่อเต็ม) */}
            <span className="min-w-0 break-words">{grouped ? branchOf.get(c.id) || c.name : c.name}</span>
            {grouped && dupIds.has(c.id) && (
              <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700" title="สาขาชื่อนี้มี 2 รายในทะเบียนคู่ค้า — อาจเป็นรายเดียวกันที่ลงซ้ำ (ชี้ที่ชิปเพื่อดูชื่อเต็ม)">ซ้ำ?</span>
            )}
            <button type="button" onClick={() => onChange(list.filter((x) => x.id !== c.id))} aria-label={`เอา ${c.name} ออก`} title="เอาออกจากลูกค้าประจำแบรนด์"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs leading-none text-slate-400 hover:bg-slate-200 hover:text-slate-700">
              ×
            </button>
          </span>
        )}
      />
      {full && (
        <div className="text-[11px] text-slate-400">ใส่ครบ {BRAND_CUSTOMER_MAX} รายแล้ว (สูงสุด) — เอาออกก่อนถึงจะเพิ่มได้</div>
      )}
      {!full && (
        <div className="max-w-[240px]" title="ลูกค้าประจำแบรนด์ — ติ๊กได้หลายสาขาพร้อมกัน · ตอนสร้างใบสั่งขายจะมีปุ่มให้กดเลือกสาขา">
          <CustomerPicker placeholder={list.length ? "+ เพิ่มลูกค้า / สาขา…" : "ลูกค้าประจำแบรนด์…"} value={null} onChange={() => {}}
            exclude={list.map((c) => c.id)} onPickMany={addMany} />
        </div>
      )}
    </div>
  );
}

/** ปุ่ม ⋯ ท้ายแถว: แก้ชื่อ · ลบ (dropdown กลาง) */
function RowMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span ref={ref} className="flex justify-center">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="ตัวเลือกเพิ่มเติม" title="แก้ชื่อ / ลบ"
        className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">⋯</button>
      <FloatingDropdown anchorRef={ref} open={open} onClose={close} minWidth={140}>
        <div className="rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-sm">
          <button type="button" onClick={() => { close(); onRename(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"><Icon name="edit" /> แก้ชื่อ</button>
          <button type="button" onClick={() => { close(); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50"><Icon name="delete" /> ลบแบรนด์</button>
        </div>
      </FloatingDropdown>
    </span>
  );
}
