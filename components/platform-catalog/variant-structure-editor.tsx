"use client";
/**
 * ตัวเลือกของสินค้าบน LINE (แท็บ "ตัวเลือก & ราคา" → โหมด "ชื่อ · เพิ่ม/ลบตัวเลือก" ของลิ้นชักสินค้าบนร้าน)
 *
 * เปลี่ยนชื่อค่า (2026-11-25 · แบบ A ข้อ 1/6): แก้ในช่อง · ปุ่ม "ชื่อตามระบบ" / "ใช้ชื่อตามระบบทั้งหมด" · "ย้อน" → "ส่งชื่อใหม่" (ถามก่อน) — ทำได้แม้เปิดขาย
 * เพิ่ม/ลบ (กันพลาด): ทำได้เฉพาะสินค้าที่ปิดขายอยู่ · ลบ = ลบทุกตัวเลือกที่มีค่านั้น (โชว์รายการที่จะหายก่อนยืนยัน) · ห้ามลบจนไม่เหลือ
 * เพิ่มค่าใหม่ → กรอกราคา/น้ำหนัก/SKU/สต๊อก ต่อแถว (สินค้า 2 ชั้น = 1 แถวต่อค่าของอีกชั้น) · ส่วนลดตั้งทีหลังในโหมดราคา
 *   สต๊อก: LINE บังคับ > 0 → รหัสตรงกับ SKU ในระบบ = ใช้สต๊อกในระบบ (หลังบ้านอ่านซ้ำตอนส่ง) · ไม่ตรง = ค่าที่กรอก
 *   "มีในระบบ ยังไม่อยู่บนร้าน" (ข้อ 3/5): สีในระบบที่ยังไม่มีรหัสบนร้าน → กด "เพิ่มขึ้น LINE" = เติมฟอร์มเพิ่มให้ (ชื่อ/รหัส/สต๊อกตามระบบ)
 * ส่งทันทีทีละเรื่อง (ไม่รวมกับปุ่ม "บันทึกขึ้น LINE") — POST /api/line-shopping/listing-variants · กฎ lib/line-variant-structure
 * ของกลางที่ใช้: ConfirmDialog · MoneyInput · Icon · toast · useSysVariants · lib/listing-option-sync
 */
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { Icon } from "@/components/icon";
import { LINE_STOCK_MAX, planAddOptionValue, planDeleteOptionValue, planRenameOptionValues, variantsWithValue, type LineOptionStructure, type NewVariantRow } from "@/lib/line-variant-structure";
import { pickColorTier, sizeSkusForNewColor, sysOptionName, sysVariantOfOption, sysVariantsNotOnShop, type SysVariantView } from "@/lib/listing-option-sync";
import { useSysVariants } from "./use-sys-variants";

const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };

export function VariantStructureEditor({ listingId, structure, display, canEdit, blockedReason, defaults, matchedParent, onDone }: {
  listingId: string;
  structure: LineOptionStructure | null;
  /** เปิดขายอยู่ไหม — ต้องปิดขายก่อนถึงเพิ่ม/ลบได้ (เปลี่ยนชื่อได้เลย) */
  display: boolean | null;
  canEdit: boolean;
  /** เหตุที่ยังทำไม่ได้ (เช่น มีที่แก้ค้างยังไม่บันทึก) */
  blockedReason?: string | null;
  /** ค่าตั้งต้นของแถวใหม่ (จากตัวเลือกแรกของสินค้า) */
  defaults: { price: number | null; weight: number | null };
  /** Parent SKU ที่จับคู่ — ใช้หา "ชื่อตามระบบ" + สีที่ยังไม่อยู่บนร้าน */
  matchedParent?: string | null;
  /** ส่งสำเร็จ → ลิ้นชักโหลดใหม่ */
  onDone: () => void;
}) {
  const toast = useToast();
  const sysV = useSysVariants(listingId, !!matchedParent && !!structure);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<{ idx: number; value: string } | null>(null);
  const [addIdx, setAddIdx] = useState<number | null>(null);
  const [newValue, setNewValue] = useState("");
  const [rows, setRows] = useState<NewVariantRow[]>([]);
  const [askAdd, setAskAdd] = useState(false);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [askRename, setAskRename] = useState(false);

  const locked = !canEdit || display !== false || !!blockedReason;
  const renameLocked = !canEdit || !!blockedReason;
  const delPlan = useMemo(() => (structure && del ? planDeleteOptionValue(structure, del.idx, del.value) : null), [structure, del]);
  const addPlan = useMemo(() => (structure && addIdx != null ? planAddOptionValue(structure, addIdx, newValue, rows) : null), [structure, addIdx, newValue, rows]);
  const renameN = Object.keys(renames).length;
  const renamePlan = useMemo(() => (structure && renameN ? planRenameOptionValues(structure, renames) : null), [structure, renames, renameN]);

  if (!structure) return <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">ยังไม่มีข้อมูลตัวเลือกของสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ก่อน</p>;

  // สีในระบบ ↔ ตัวเลือกบนร้าน (ชั้นสีหาเอง — บางสินค้าเรียง "จำนวน · สี")
  const sysList = sysV.variants ?? [];
  const tiers = structure.options.map((o, i) => ({ name: o.name, values: o.values.map((v) => ({ skus: variantsWithValue(structure, i, v).map((x) => x.sku) })) }));
  const colorIdx = Math.max(0, pickColorTier(tiers, sysList.map((x) => x.code)));
  const otherIdx = structure.options.length === 2 ? 1 - colorIdx : -1;
  const models = structure.variants.map((v) => ({
    sku: v.sku, price: null,
    tierIndex: [structure.options[colorIdx].values.indexOf(v.values[colorIdx] ?? ""), ...(otherIdx >= 0 ? [structure.options[otherIdx].values.indexOf(v.values[otherIdx] ?? "")] : [])],
  }));
  const sysNameOf = (i: number) => sysOptionName(sysVariantOfOption(models, i, sysList));
  const missing = matchedParent ? sysVariantsNotOnShop(structure.variants.map((v) => v.sku), sysList) : [];
  const nameOf = (idx: number, v: string) => renames[`${idx}|${v}`] ?? v;
  const setName = (idx: number, v: string, name: string) => setRenames((r) => { const n = { ...r }; if (name === v) delete n[`${idx}|${v}`]; else n[`${idx}|${v}`] = name; return n; });
  const sysDiff = structure.options[colorIdx].values.map((v, i) => ({ v, n: sysNameOf(i) })).filter((x) => x.n && x.n !== nameOf(colorIdx, x.v).trim());
  const useSysNames = () => sysDiff.forEach((x) => setName(colorIdx, x.v, x.n!));

  const startAdd = (idx: number) => {
    const other = structure.options.length === 2 ? structure.options[1 - idx] : null;
    setAddIdx(idx); setNewValue("");
    setRows((other ? other.values : [null]).map((ov) => ({ otherValue: ov, price: defaults.price, weight: defaults.weight, sku: "", barcode: null, stock: null })));
  };
  // สีจากระบบ → เติมฟอร์มเพิ่มให้ (ชื่อ/รหัส/สต๊อกตามระบบ · 2 ชั้น: รหัสต่อค่าตามแบบของสีเดิม)
  const startAddFromSys = (sv: SysVariantView) => {
    const other = otherIdx >= 0 ? structure.options[otherIdx] : null;
    const skus = other ? sizeSkusForNewColor(models, sysList, sv.code, other.values.length) : [];
    setAddIdx(colorIdx); setNewValue(sysOptionName(sv) ?? sv.code);
    setRows(other
      ? other.values.map((ov, k) => ({ otherValue: ov, price: defaults.price, weight: defaults.weight, sku: skus[k] ?? "", barcode: null, stock: null }))
      : [{ otherValue: null, price: defaults.price, weight: defaults.weight, sku: sv.code, barcode: null, stock: sv.stock && sv.stock > 0 ? sv.stock : null }]);
  };
  const setRow = (i: number, patch: Partial<NewVariantRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const sysStockOf = (sku: string) => sysList.find((x) => x.code.trim().toUpperCase() === sku.trim().toUpperCase())?.stock ?? null;

  const send = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-variants", { method: "POST", body: JSON.stringify({ listing_id: listingId, ...body }) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!j.ok) { toast.error(`LINE ไม่รับ: ${j.error ?? `HTTP ${r.status}`}`); return false; }
      toast.success(okText); onDone(); return true;
    } catch (e) { toast.error(`ส่งไป LINE ไม่สำเร็จ: ${(e as Error).message}`); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {display !== false && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Icon name="warning" className="mt-0.5 shrink-0" />
          เปลี่ยนชื่อตัวเลือกทำได้เลย · เพิ่ม/ลบตัวเลือกได้เฉพาะสินค้าที่ปิดขายอยู่ (กันลูกค้าเห็นระหว่างแก้) — ปิดขายที่สวิตช์มุมบน แก้เสร็จแล้วค่อยเปิดขายใหม่
        </p>
      )}
      {blockedReason && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{blockedReason}</p>}
      {!renameLocked && sysDiff.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>ชื่อ{structure.options[colorIdx].name}บนร้านต่างจากระบบ {sysDiff.length.toLocaleString()} ตัว</span>
          <button type="button" onClick={useSysNames} className="h-7 rounded-md border border-violet-300 bg-white px-2 text-violet-800 hover:bg-violet-50">ใช้ชื่อตามระบบทั้งหมด</button>
        </div>
      )}

      {structure.options.map((opt, idx) => (
        <div key={opt.name} className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">{opt.name} <span className="font-normal text-slate-400">({opt.values.length} ค่า{idx === colorIdx && structure.options.length > 1 ? " · ชั้นสี" : ""})</span></span>
            {!locked && addIdx !== idx && <button type="button" onClick={() => startAdd(idx)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="add" />เพิ่ม{opt.name}</button>}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {opt.values.map((v, i) => {
              const n = variantsWithValue(structure, idx, v).length;
              const name = nameOf(idx, v);
              const changed = name.trim() !== v;
              const sysName = idx === colorIdx ? sysNameOf(i) : null;
              return (
                <div key={v} className="flex items-center gap-1.5 rounded-lg border border-slate-100 p-1.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {renameLocked
                      ? <div className="truncate text-sm text-slate-700">{v}</div>
                      : <input value={name} onChange={(e) => setName(idx, v, e.target.value)} aria-label={`ชื่อ ${v}`}
                          className={`h-8 w-full rounded-md border px-2 text-sm ${changed ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />}
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                      <span>{n} ตัวเลือก</span>
                      {!renameLocked && sysName && sysName !== name.trim() && (
                        <button type="button" onClick={() => setName(idx, v, sysName)} title="ใช้ชื่อตามระบบ (ยังไม่ส่งจนกด “ส่งชื่อใหม่”)"
                          className="rounded border border-violet-200 bg-white px-1 text-violet-700 hover:bg-violet-50">ชื่อตามระบบ: {sysName}</button>
                      )}
                      {sysName && sysName === name.trim() && <span className="rounded bg-emerald-50 px-1 text-emerald-700">ตรงระบบ</span>}
                      {changed && <span className="line-through">{v}</span>}
                      {changed && !renameLocked && <button type="button" onClick={() => setName(idx, v, v)} className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"><Icon name="history" />ย้อน</button>}
                    </div>
                  </div>
                  {!locked && opt.values.length > 1 && (
                    <button type="button" onClick={() => setDel({ idx, value: v })} aria-label={`ลบ ${v}`} title={`ลบ${opt.name} “${v}” (ลบ ${n} ตัวเลือก)`}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="cancel" /></button>
                  )}
                </div>
              );
            })}
          </div>

          {addIdx === idx && !locked && (
            <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5">
              <label className="block text-xs text-slate-600">ค่า{opt.name}ใหม่
                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={`เช่น ${opt.values[0] ?? ""}`} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-sm" />
              </label>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500">
                    {structure.options.length === 2 && <th className="py-1 pr-2 font-medium">{structure.options[1 - idx].name}</th>}
                    <th className="py-1 pr-2 font-medium">ราคาเต็ม</th><th className="py-1 pr-2 font-medium">น้ำหนัก (กก.)</th><th className="py-1 pr-2 font-medium">SKU</th><th className="py-1 pr-2 font-medium">สต๊อก</th><th className="py-1 font-medium">บาร์โค้ด</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const sysStock = sysStockOf(r.sku);
                      return (
                        <tr key={i}>
                          {structure.options.length === 2 && <td className="py-1 pr-2 text-slate-700">{r.otherValue}</td>}
                          <td className="py-1 pr-2"><MoneyInput value={r.price} onChange={(raw) => setRow(i, { price: numOrNull(raw) })} className="h-8 w-24 rounded-md border border-slate-200 px-2 text-right" /></td>
                          <td className="py-1 pr-2"><input type="number" step="0.01" value={r.weight ?? ""} onChange={(e) => setRow(i, { weight: numOrNull(e.target.value) })} className="h-8 w-20 rounded-md border border-slate-200 px-2 text-right" /></td>
                          <td className="py-1 pr-2"><input value={r.sku} onChange={(e) => setRow(i, { sku: e.target.value })} className="h-8 w-32 rounded-md border border-slate-200 px-2 font-mono" /></td>
                          <td className="py-1 pr-2">
                            {sysStock != null
                              ? <span className={sysStock > 0 ? "text-slate-700" : "text-rose-600"} title="รหัสนี้ตรงกับ SKU ในระบบ — ใช้สต๊อกในระบบ (ระบบอ่านซ้ำตอนส่ง)">{sysStock.toLocaleString()} <span className="text-[10px] text-slate-400">ตามระบบ</span></span>
                              : <input type="number" min={1} max={LINE_STOCK_MAX} step={1} inputMode="numeric" value={r.stock ?? ""} placeholder="สต๊อก" onChange={(e) => setRow(i, { stock: numOrNull(e.target.value) })}
                                  className={`h-8 w-20 rounded-md border px-2 text-right ${r.stock == null || r.stock < 1 ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />}
                          </td>
                          <td className="py-1"><input value={r.barcode ?? ""} onChange={(e) => setRow(i, { barcode: e.target.value })} className="h-8 w-32 rounded-md border border-slate-200 px-2 font-mono" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {addPlan && addPlan.errors.length > 0 && newValue.trim() && <p className="text-[11px] text-rose-600">{addPlan.errors[0]}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-[11px] text-slate-500">สต๊อก: LINE บังคับมีอย่างน้อย 1 — รหัสตรงกับในระบบใช้สต๊อกในระบบครั้งเดียว ไม่ตรงให้กรอกเอง · ตั้งราคาที่ลูกค้าจ่าย (ส่วนลด) ทีหลังในโหมดราคา · รูปตัวเลือกใส่ที่โหมด “น้ำหนัก · บาร์โค้ด · รูป · SKU”</span>
                <button type="button" onClick={() => setAddIdx(null)} className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-white">ยกเลิก</button>
                <button type="button" disabled={!addPlan?.payload || busy} onClick={() => setAskAdd(true)} className="h-8 rounded-md bg-violet-600 px-2.5 text-xs text-white hover:bg-violet-700 disabled:opacity-40">เพิ่มขึ้น LINE ({rows.length})</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {renameN > 0 && !renameLocked && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
          <span className="min-w-0 flex-1">{renamePlan?.errors.length ? <span className="text-rose-600">{renamePlan.errors[0]}</span> : `เปลี่ยนชื่อ ${renamePlan?.changes.length ?? 0} ค่า — ยังไม่ได้ส่งขึ้น LINE`}</span>
          <button type="button" onClick={() => setRenames({})} className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>
          <button type="button" disabled={!renamePlan?.payload || busy} onClick={() => setAskRename(true)} className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700 disabled:opacity-40">ส่งชื่อใหม่ขึ้น LINE</button>
        </div>
      )}

      {!!matchedParent && (missing.length > 0 || sysV.loading || sysV.error) && (
        <div className="overflow-hidden rounded-lg border border-dashed border-violet-300">
          <div className="flex flex-wrap items-center gap-2 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900">
            <span className="font-medium">มีในระบบ ยังไม่อยู่บนร้าน ({missing.length.toLocaleString()})</span>
            {sysV.loading && <span className="text-slate-500">กำลังโหลดสีในระบบ…</span>}
            {sysV.error && <span className="text-rose-600">{sysV.error} <button type="button" onClick={sysV.reload} className="underline">ลองใหม่</button></span>}
            {locked && missing.length > 0 && <span className="text-slate-500">· {display !== false ? "ปิดขายก่อนถึงเพิ่มได้" : "เพิ่มไม่ได้ตอนนี้"}</span>}
          </div>
          {missing.map((sv) => {
            const noStock = otherIdx < 0 && !(sv.stock && sv.stock > 0);
            return (
              <div key={sv.code} className="flex flex-wrap items-center gap-2 border-t border-violet-100 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">{sysOptionName(sv) ?? sv.code}<span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800">ในระบบ</span></div>
                  <div className="text-[11px] text-slate-500"><span className="font-mono">{sv.code}</span> · ในระบบมี {sv.stock == null ? "—" : sv.stock.toLocaleString()} ชิ้น{noStock ? <span className="text-rose-600"> · สต๊อก 0 — LINE ต้องมีสต๊อก (กรอกเองในฟอร์มเพิ่มได้ถ้ารหัสไม่ตรงระบบ)</span> : null}</div>
                </div>
                <button type="button" disabled={locked || noStock || addIdx != null} onClick={() => startAddFromSys(sv)}
                  title={locked ? "ปิดขายสินค้านี้ก่อน แล้วค่อยเพิ่มตัวเลือก" : noStock ? "สต๊อกในระบบเป็น 0" : addIdx != null ? "มีฟอร์มเพิ่มเปิดอยู่ — เพิ่ม/ยกเลิกอันนั้นก่อน" : "เติมฟอร์มเพิ่มให้ (ตรวจแล้วกดเพิ่มขึ้น LINE)"}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-white px-2.5 text-xs text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><Icon name="add" />เพิ่มขึ้น LINE</button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog open={askRename && !!renamePlan?.payload} onClose={() => { if (!busy) setAskRename(false); }} loading={busy}
        title={`เปลี่ยนชื่อตัวเลือก ${renamePlan?.changes.length ?? 0} ค่า บน LINE?`} confirmText="ส่งชื่อใหม่"
        onConfirm={() => { void send({ action: "rename", renames }, `เปลี่ยนชื่อตัวเลือกบน LINE แล้ว ${renamePlan?.changes.length ?? 0} ค่า`).then((ok) => { if (ok) { setAskRename(false); setRenames({}); } }); }}
        message={renamePlan?.payload ? (
          <div className="space-y-2 text-sm">
            <p>ลูกค้าเห็นชื่อใหม่ทันที · รหัส SKU/ราคา/สต๊อกเหมือนเดิม · มีประวัติว่าใครแก้ · ย้อนได้โดยเปลี่ยนกลับเป็นชื่อเดิม</p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              {renamePlan.changes.map((c, i) => <li key={i}><span className="text-slate-500">{c.option}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>)}
            </ul>
          </div>
        ) : ""} />

      <ConfirmDialog open={!!del && !!delPlan} onClose={() => { if (!busy) setDel(null); }} loading={busy} variant="danger"
        title={delPlan ? `ลบ${delPlan.name} “${delPlan.value}” บน LINE?` : ""} confirmText={delPlan ? `ลบ ${delPlan.affected.length} ตัวเลือก` : "ลบ"}
        onConfirm={() => { if (delPlan && !delPlan.error && del) void send({ action: "delete", option_index: del.idx, value: delPlan.value }, `ลบ${delPlan.name} “${delPlan.value}” แล้ว`).then((ok) => { if (ok) setDel(null); }); }}
        message={delPlan ? (delPlan.error ? <p className="text-sm text-rose-600">{delPlan.error}</p> : (
          <div className="space-y-2 text-sm">
            <p>LINE จะลบ <b>ทุกตัวเลือกที่มี{delPlan.name} “{delPlan.value}”</b> ออกจากสินค้า — กู้คืนไม่ได้ (ต้องเพิ่มใหม่เอง)</p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
              {delPlan.affected.map((v) => <li key={v.id}>{v.sku ?? v.id} · {v.values.join(" / ")}</li>)}
            </ul>
          </div>
        )) : ""} />

      <ConfirmDialog open={askAdd && !!addPlan?.payload} onClose={() => { if (!busy) setAskAdd(false); }} loading={busy}
        title={addIdx != null ? `เพิ่ม${structure.options[addIdx].name} “${newValue.trim()}” บน LINE?` : ""} confirmText={`เพิ่ม ${rows.length} ตัวเลือก`}
        onConfirm={() => { if (addIdx != null) void send({ action: "add", option_index: addIdx, value: newValue.trim(), rows }, `เพิ่มตัวเลือกบน LINE แล้ว ${rows.length} ตัว`).then((ok) => { if (ok) { setAskAdd(false); setAddIdx(null); } }); }}
        message={addPlan?.payload ? (
          <div className="space-y-2 text-sm">
            <p>ตัวเลือกใหม่ {rows.length} ตัว — ส่งขึ้นร้าน LINE จริง · สต๊อกตั้งต้นตามที่เห็น (รหัสตรงระบบ = ระบบอ่านสต๊อกซ้ำตอนส่ง) แล้วระบบซิงค์สต๊อกดูแลต่อ · มีประวัติว่าใครเพิ่ม · เอาออก = ลบค่านี้ (ปิดขายก่อน)</p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
              {addPlan.payload.variants.map((v, i) => <li key={i}>{v.sku} · {v.price.toLocaleString()}฿ · {v.weight} กก. · สต๊อก {v.onHandNumber.toLocaleString()}</li>)}
            </ul>
          </div>
        ) : ""} />
    </div>
  );
}
