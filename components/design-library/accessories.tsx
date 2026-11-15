"use client";

/**
 * 📚 Design Library — ส่วนเสริม (รอบ 7 · เจ้าของเลือก 2026-11-14): พวงกุญแจ ชาร์ม สายคล้องแขน ฯลฯ
 * รายการของทีม (ตัวเลือก list_key "accessory": รูป + กลุ่ม + ผูก SKU ได้ไม่บังคับ) → เลือกได้หลายชิ้นต่อสูตร + โน้ตต่อชิ้น
 * เก็บสำเนาใน spec.accessories (ชื่อ/รูป ณ ตอนเลือก) · ขึ้นในใบสรุป + prompt ({ส่วนเสริม}) + ใบสั่งทำตัวอย่าง · ทุกชุดสีใช้ร่วมกัน
 * รอบ 8 (เจ้าของเลือก 2026-11-15):
 *   ป๊อปเลือก: "+ เพิ่มใหม่" (ชื่อ กลุ่ม รูป — ลากวาง / Ctrl+V / อัป / คลังรูป · เริ่มจาก SKU ได้) · แก้/ลบบนการ์ด
 *     ทุกคนที่แก้สูตรได้ทำได้ (API actions save_accessory / delete_accessory — ลบ = ซ่อน สูตรเดิมยังมีสำเนา)
 *   การ์ดในสูตร: จำนวน (เข้าทุน + ใบสั่งทำตัวอย่าง) · ปักตำแหน่งบนรูป (ป้าย A1, A2 ขึ้นในใบสรุป)
 */
import { useMemo, useState, type ClipboardEvent as RClipboardEvent } from "react";
import nextDynamic from "next/dynamic";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { SkuPicker } from "@/components/pickers";
import { useFileDrop } from "@/components/file-drop";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { accessoryFromChoice, accessoryLabel, MAX_ACCESSORIES, pinQty, type AccessoryPick, type Choice } from "@/lib/design-library";
import { StockBadge } from "./pick-panel";
import { api, img, newId } from "./shared";

const AssetPicker = nextDynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });
const QUICK_GROUPS = ["พวงกุญแจ", "ชาร์ม", "สายคล้องแขน"];
const groupOf = (c: Choice) => String(c.config?.group ?? "").trim() || "อื่น ๆ";

const Thumb = ({ k, size = 40 }: { k: string | null; size?: number }) => (k
  // eslint-disable-next-line @next/next/no-img-element
  ? <img src={img(k, size * 3)} alt="" className="rounded-md object-contain bg-slate-50 border border-slate-100 shrink-0" style={{ width: size, height: size }} loading="lazy" />
  : <span className="rounded-md bg-slate-100 shrink-0 inline-flex items-center justify-center text-slate-300" style={{ width: size, height: size }}><Icon value="i:photo" /></span>);

export function AccessoriesCard({ items, choices, stock, readOnly, onChange, onChoices, placing, onPlace }: {
  items: AccessoryPick[]; choices: Choice[]; stock: Record<string, number>; readOnly: boolean; onChange: (items: AccessoryPick[]) => void;
  /** รายการของทีมเปลี่ยน (เพิ่ม/แก้/ลบจากป๊อป) → หน้าแม่อัปเดตตัวเลือก */
  onChoices: (next: Choice[]) => void;
  /** ส่วนเสริมที่กำลังรอปักบนรูป (กดบนรูปครั้งถัดไป = วางตรงนั้น) */
  placing: string | null; onPlace: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const patch = (id: string, p: Partial<AccessoryPick>) => onChange(items.map((a) => (a.id === id ? { ...a, ...p } : a)));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[14px] font-medium text-slate-800 flex items-center gap-2"><Icon value="i:key" />ส่วนเสริม</span>
        {items.length > 0 && <span className="text-[11px] px-1.5 rounded-full bg-slate-100 text-slate-500">{items.length}</span>}
        {!readOnly && <button type="button" onClick={() => setOpen(true)} className="ml-auto h-8 px-3 text-[12.5px] rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เลือกส่วนเสริม</button>}
      </div>
      {placing && <p className="mb-2 rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1.5 text-[12px] text-violet-800 flex items-center gap-2"><Icon value="i:map-pin" />กดบนรูปตรงที่จะห้อย/ติดส่วนเสริม
        <button type="button" onClick={() => onPlace(null)} className="ml-auto text-violet-700 hover:underline">ยกเลิก</button></p>}
      {items.length === 0 ? (
        <p className="text-[12.5px] text-slate-400">{readOnly ? "สูตรนี้ไม่มีส่วนเสริม" : "เช่น พวงกุญแจ ชาร์ม สายคล้องแขน — กด “เลือกส่วนเสริม”"}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((a, k) => (
            <div key={a.id} className={`flex items-start gap-2 rounded-lg border p-1.5 ${placing === a.id ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`}>
              <Thumb k={a.image_key} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] min-w-0">
                  {a.pos && <span className="text-[10.5px] px-1.5 rounded bg-violet-600 text-white font-semibold shrink-0" title="ปักบนรูปแล้ว">{accessoryLabel(k)}</span>}
                  <span className="truncate text-slate-800">{a.name}</span>
                  {a.group && <span className="text-[10.5px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">{a.group}</span>}
                  {a.sku_id && <StockBadge onHand={stock[a.sku_id]} />}
                </div>
                {readOnly ? <div className="text-[11.5px] text-slate-500 truncate">{pinQty(a)} ชิ้น{a.note ? ` · ${a.note}` : ""}</div> : (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11.5px] text-slate-500 shrink-0" title="จำนวนต่อใบ (เข้าทุน + ใบสั่งทำตัวอย่าง)">×
                      <input type="number" min={1} max={99} value={pinQty(a)} onChange={(e) => { const n = Math.round(Number(e.target.value)); patch(a.id, { qty: n > 1 ? Math.min(99, n) : undefined }); }}
                        className="w-12 h-7 px-1.5 border border-slate-200 rounded-md text-[12px] text-right" /></label>
                    <input value={a.note} onChange={(e) => patch(a.id, { note: e.target.value.slice(0, 300) })} placeholder="โน้ต เช่น ห้อยหูซ้าย"
                      className="min-w-0 flex-1 h-7 px-2 border border-slate-200 rounded-md text-[12px] text-slate-700" />
                  </div>
                )}
              </div>
              {!readOnly && (
                <div className="flex items-center shrink-0">
                  <button type="button" onClick={() => onPlace(placing === a.id ? null : a.id)} aria-pressed={placing === a.id}
                    title={a.pos ? "ย้ายตำแหน่งบนรูป (กดบนรูปจุดใหม่)" : "ปักตำแหน่งบนรูป"} aria-label={a.pos ? `ย้าย ${a.name} บนรูป` : `ปัก ${a.name} บนรูป`}
                    className={`h-7 w-7 rounded-md inline-flex items-center justify-center ${placing === a.id ? "bg-violet-600 text-white" : a.pos ? "text-violet-700 hover:bg-violet-50" : "text-slate-500 hover:bg-slate-100"}`}><Icon value="i:map-pin" /></button>
                  {a.pos && <button type="button" onClick={() => patch(a.id, { pos: null })} title="เอาออกจากรูป" aria-label={`เอา ${a.name} ออกจากรูป`}
                    className="h-7 w-7 rounded-md text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"><Icon value="i:circle-x" /></button>}
                  <button type="button" onClick={() => onChange(items.filter((x) => x.id !== a.id))} aria-label={`เอา ${a.name} ออก`} title="เอาออกจากสูตร"
                    className="h-7 w-7 rounded-md text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"><Icon value="i:x" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open && <AccessoryPickerModal choices={choices} items={items} onChoices={onChoices} onClose={() => setOpen(false)} onApply={(next) => { onChange(next); setOpen(false); }} />}
    </div>
  );
}

type Form = { id?: string; name: string; name_en: string; group: string; image_key: string; sku_id: string; sku_code: string };
const EMPTY_FORM: Form = { name: "", name_en: "", group: "", image_key: "", sku_id: "", sku_code: "" };

/** ป๊อปเลือกส่วนเสริม — แบ่งกลุ่ม · ค้นหา · กดการ์ด = ติ๊ก/เอาออก (เลือกได้หลายชิ้น) · เพิ่ม/แก้/ลบรายการของทีมได้ในป๊อปนี้ */
function AccessoryPickerModal({ choices, items, onChoices, onClose, onApply }: {
  choices: Choice[]; items: AccessoryPick[]; onChoices: (next: Choice[]) => void; onClose: () => void; onApply: (items: AccessoryPick[]) => void;
}) {
  const toast = useToast();
  const list = useMemo(() => choices.filter((c) => c.list_key === "accessory" && c.is_active !== false), [choices]);
  const groups = useMemo(() => [...new Set(list.map(groupOf))], [list]);
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(items.map((a) => a.code)));
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [del, setDel] = useState<Choice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const shown = list.filter((c) => (!group || groupOf(c) === group)
    && (!q.trim() || `${c.code} ${c.name} ${c.name_en ?? ""} ${String(c.config?.sku_code ?? "")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const toggle = (code: string) => setSel((p) => { const n = new Set(p); if (n.has(code)) n.delete(code); else if (n.size < MAX_ACCESSORIES) n.add(code); return n; });
  const apply = () => {
    const keep = items.filter((a) => sel.has(a.code));   // ของเดิมคงโน้ต/จำนวน/ตำแหน่งไว้
    const add = list.filter((c) => sel.has(c.code) && !items.some((a) => a.code === c.code)).map((c) => accessoryFromChoice(c, newId()));
    onApply([...keep, ...add]);
  };

  const editOf = (c: Choice): Form => ({ id: c.id, name: c.name, name_en: c.name_en ?? "", group: String(c.config?.group ?? ""), image_key: String(c.config?.image_key ?? ""), sku_id: String(c.config?.sku_id ?? ""), sku_code: String(c.config?.sku_code ?? "") });
  const uploadImage = async (files: File[]) => {
    const f = files.find((x) => x.type.startsWith("image/"));
    if (!f || !form) return;
    setUploading(true);
    try {
      const up = await uploadImagesWithDupCheck([f], { folder: "design-library/accessories", max: 1600, onError: (_, e) => toast.error(e.message) });
      const key = up?.keys[0];
      if (key) setForm((p) => (p ? { ...p, image_key: key, name: p.name || f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) } : p));
    } catch { toast.error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setUploading(false); }
  };
  const drop = useFileDrop((files) => void uploadImage(files), { accept: "image/", disabled: !form || uploading, onReject: () => toast.error("วางได้เฉพาะไฟล์รูป") });
  const onPaste = (e: RClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault(); void uploadImage(files);
  };
  const save = async () => {
    if (!form || saving) return;
    if (!form.name.trim()) { toast.error("ต้องใส่ชื่อส่วนเสริม"); return; }
    setSaving(true);
    try {
      const row = await api<Choice>(`/api/design-library/actions`, { json: { action: "save_accessory", ...form } });
      const exists = choices.some((c) => c.id === row.id);
      onChoices(exists ? choices.map((c) => (c.id === row.id ? row : c)) : [...choices, row]);
      if (!exists) setSel((p) => (p.size < MAX_ACCESSORIES ? new Set([...p, row.code]) : p));   // เพิ่มใหม่ = ติ๊กให้เลย
      toast.success(exists ? "แก้ส่วนเสริมแล้ว" : `เพิ่ม “${row.name}” แล้ว และติ๊กให้ในสูตรนี้`);
      setForm(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api(`/api/design-library/actions`, { json: { action: "delete_accessory", id: del.id } });
      onChoices(choices.filter((c) => c.id !== del.id));
      setSel((p) => { const n = new Set(p); n.delete(del.code); return n; });
      toast.success(`ลบ “${del.name}” ออกจากรายการแล้ว — สูตรที่เลือกไว้ก่อนหน้ายังเห็นเหมือนเดิม`);
      setDel(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setDeleting(false); }
  };

  const inp = "w-full h-9 px-2.5 border border-slate-200 rounded-lg text-sm text-slate-800";
  return (
    <ERPModal open onClose={onClose} title="เลือกส่วนเสริม" size="lg" storageKey="design-library-accessory" hasUnsavedChanges={!!form && !!form.name.trim()}
      description={form ? (form.id ? "แก้ส่วนเสริมของทีม" : "เพิ่มส่วนเสริมใหม่เข้ารายการของทีม") : "กดการ์ดเพื่อติ๊ก — เลือกได้หลายชิ้น · เพิ่ม/แก้/ลบรายการได้ในป๊อปนี้"}
      footer={form ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setForm(null)} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">กลับไปรายการ</button>
          <button type="button" disabled={saving || uploading} onClick={() => void save()} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : form.id ? "บันทึกการแก้ไข" : "เพิ่มเข้ารายการ"}</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-500">เลือกอยู่ {sel.size} ชิ้น</span>
          <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={apply} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">ใช้ที่เลือก</button>
        </div>
      )}>
      {form ? (
        <div className="space-y-3" {...drop.guard}>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
            <div className="text-[12px] text-slate-500 mb-1">เริ่มจาก SKU (ไม่บังคับ) — ดึงชื่อ + รูปให้เอง และเห็นสต็อก/ทุน</div>
            {form.sku_id ? (
              <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-[13px]">
                <Icon value="i:barcode" className="text-slate-400" /><code className="text-[12px]">{form.sku_code}</code>
                <button type="button" onClick={() => setForm({ ...form, sku_id: "", sku_code: "" })} className="ml-auto text-[12px] text-rose-600 hover:underline">เลิกผูก</button>
              </div>
            ) : <SkuPicker value={null} placeholder="ค้นรหัส / ชื่อ SKU" onChange={(v) => v && setForm((p) => (p ? { ...p, sku_id: v.id, sku_code: v.code, name: p.name || v.name, image_key: p.image_key || v.image_key || "" } : p))} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div {...drop.zone("acc")} onPaste={onPaste} tabIndex={0}
              className={`rounded-xl border-2 border-dashed aspect-square flex flex-col items-center justify-center gap-1 text-center text-[11.5px] text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 overflow-hidden relative ${drop.over === "acc" ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {form.image_key ? <img src={img(form.image_key, 400)} alt="" className="absolute inset-0 w-full h-full object-contain bg-white" />
                : <><Icon value={uploading ? "i:hourglass" : "i:photo"} className="text-[22px] text-slate-400" />{uploading ? "กำลังอัป…" : <>ลากรูปมาวาง<br />หรือคลิกแล้ว Ctrl+V</>}</>}
            </div>
            <div className="space-y-2">
              <label className="block text-[12px] text-slate-500">ชื่อส่วนเสริม <span className="text-rose-500">*</span>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 120) })} placeholder="เช่น พวงกุญแจหมีหนัง" className={`${inp} mt-1`} /></label>
              <label className="block text-[12px] text-slate-500">ชื่ออังกฤษ (ใช้ใน prompt · ไม่บังคับ)
                <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value.slice(0, 120) })} placeholder="e.g. leather bear keychain" className={`${inp} mt-1`} /></label>
              <div className="text-[12px] text-slate-500">กลุ่ม
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...new Set([...QUICK_GROUPS, ...groups.filter((g) => g !== "อื่น ๆ")])].map((g) => (
                    <button key={g} type="button" onClick={() => setForm({ ...form, group: form.group === g ? "" : g })}
                      className={`h-7 px-2.5 text-[12px] rounded-full border ${form.group === g ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{g}</button>
                  ))}
                </div>
                <input value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value.slice(0, 80) })} placeholder="หรือพิมพ์กลุ่มใหม่" className={`${inp} mt-1.5`} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <label className="h-8 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
                  <Icon value="i:upload" />{form.image_key ? "เปลี่ยนรูป" : "อัปรูป"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadImage(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                </label>
                <button type="button" onClick={() => setAssetOpen(true)} className="h-8 px-3 text-[12.5px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:photo" />เลือกจากคลังรูป</button>
                {form.image_key && <button type="button" onClick={() => setForm({ ...form, image_key: "" })} className="h-8 px-2 text-[12px] text-rose-600 hover:underline">เอารูปออก</button>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ / รหัส" className="flex-1 min-w-[180px] h-9 px-3 border border-slate-200 rounded-lg text-sm" />
            <button type="button" onClick={() => setForm({ ...EMPTY_FORM, group: group && group !== "อื่น ๆ" ? group : "" })} className="h-9 px-3 text-[13px] rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"><Icon value="i:plus" />เพิ่มใหม่</button>
          </div>
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {["", ...groups].map((g) => (
                <button key={g || "_all"} type="button" onClick={() => setGroup(g)}
                  className={`h-7 px-2.5 text-[12px] rounded-full border ${group === g ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{g || "ทั้งหมด"}</button>
              ))}
            </div>
          )}
          {list.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-slate-500 mb-3">ยังไม่มีรายการส่วนเสริม — เพิ่มชิ้นแรกได้เลย (ใส่รูป + กลุ่ม เช่น พวงกุญแจ / ชาร์ม / สายคล้องแขน)</p>
              <button type="button" onClick={() => setForm({ ...EMPTY_FORM })} className="h-10 px-4 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1.5"><Icon value="i:plus" />เพิ่มส่วนเสริมชิ้นแรก</button>
            </div>
          ) : (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-h-[55vh] overflow-y-auto pr-1">
              {shown.map((c) => {
                const on = sel.has(c.code), key = String(c.config?.image_key ?? "") || null;
                return (
                  <div key={c.id} className="group relative">
                    <button type="button" onClick={() => toggle(c.code)} aria-pressed={on}
                      className={`w-full rounded-xl border p-2 text-left ${on ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-400"}`}>
                      {on && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[11px]"><Icon value="i:check" /></span>}
                      <div className="aspect-square w-full rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center mb-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {key ? <img src={img(key, 400)} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Icon value="i:photo" className="text-[28px] text-slate-300" />}
                      </div>
                      <div className="text-[12.5px] text-slate-800 line-clamp-2 leading-snug">{c.name}</div>
                      <div className="text-[10.5px] text-slate-400 truncate">{groupOf(c)}{c.config?.sku_code ? ` · ${String(c.config.sku_code)}` : ""}</div>
                    </button>
                    <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button type="button" onClick={() => setForm(editOf(c))} title="แก้ไข" aria-label={`แก้ ${c.name}`} className="h-7 w-7 rounded-full bg-white/95 border border-slate-200 text-slate-600 hover:text-indigo-700 inline-flex items-center justify-center"><Icon value="i:pencil" /></button>
                      <button type="button" onClick={() => setDel(c)} title="ลบออกจากรายการ" aria-label={`ลบ ${c.name}`} className="h-7 w-7 rounded-full bg-white/95 border border-slate-200 text-rose-600 inline-flex items-center justify-center"><Icon value="i:trash" /></button>
                    </div>
                  </div>
                );
              })}
              {shown.length === 0 && <div className="col-span-full py-8 text-center text-[13px] text-slate-400">ไม่พบส่วนเสริมที่ค้น — กด “เพิ่มใหม่” ได้เลย</div>}
            </div>
          )}
        </div>
      )}
      <AssetPicker open={assetOpen} onClose={() => setAssetOpen(false)} typeFilter="image" title="เลือกรูปส่วนเสริมจากคลังรูป"
        onSelect={(a) => { const x = a[0]; if (x && form) setForm({ ...form, image_key: x.r2_key, name: form.name || (x.title || x.file_name || "").slice(0, 120) }); setAssetOpen(false); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void remove()} variant="danger" confirmText="ลบออกจากรายการ" loading={deleting}
        title={`ลบ “${del?.name ?? ""}” ออกจากรายการ?`} message="จะไม่ขึ้นให้เลือกอีก · สูตรที่เลือกชิ้นนี้ไว้แล้วยังเห็นเหมือนเดิม (ผู้ดูแลกู้คืนได้ที่ ตัวเลือก)" />
    </ERPModal>
  );
}
