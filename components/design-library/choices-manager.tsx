"use client";

/**
 * 📚 Design Library — ⚙️ จัดการตัวเลือก (เพิ่ม / แก้ / ลบ) ทุกรายการในที่เดียว
 * แท็บ: หมวด · สีอะไหล่ · สีด้าย · แบบช่อง · กฎห้ามคู่ · Prompt (lib/design-library CHOICE_LISTS)
 * แท็บ Prompt (รอบ 6): prompt ระบบ 5 ตัว = สวิตช์เปิด/ปิดตั้งต้นของทีม (แถว code = คีย์ระบบ) · แม่แบบ prompt ทีม = config.text + คำแทน {…}
 * รอบ 7: หมวด = แท็กวัสดุ + ปุ่มลัดค้น (ป๊อปเลือกวัสดุ 3 แท็บ) · วิธีทำโลโก้ = แบบย่อย/คำเตือน/แท็กที่ไม่เหมาะ/ต้องเลือกวัสดุ · ส่วนเสริม = รูป + กลุ่ม + ผูก SKU
 *        ช่องรายการ (แท็ก ฯลฯ) เก็บเป็นข้อความคั่นด้วย , ตามที่พิมพ์ (lib อ่านได้ทั้งข้อความและ array)
 * แก้หลายแถวแล้วกด "บันทึกทั้งหมด" ครั้งเดียว · ลบ = ปิดไว้ (กู้คืนได้จาก "โมดูลทั้งหมด") ผ่าน ConfirmDialog กลาง
 * สิทธิ์ design_library.manage · audit ทุกแถว (handler กลาง lib/crud-resource-api)
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { SkuPicker } from "@/components/pickers";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { buildPrompts, CATEGORY_SOURCES, CHOICE_LISTS, cleanSpec, logoOptions, PROMPT_SYSTEM_KEYS, PROMPT_VARS, type Choice, type ChoiceListKey } from "@/lib/design-library";
import { api, img, newId } from "./shared";

/** ค่าที่เป็นรายการใน config → ข้อความโชว์ในช่อง (array เดิม = คั่นด้วย , ) */
const listText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");

type Row = Choice & { _new?: boolean; _dirty?: boolean };

export function ChoicesManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<ChoiceListKey>("category");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Row | null>(null);
  const [optDraft, setOptDraft] = useState<Record<string, string>>({});   // ข้อความแบบย่อยโลโก้ที่กำลังพิมพ์ (ไม่ให้บรรทัดว่างหาย)
  const [upId, setUpId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api<Choice[]>(`/api/design-library/choices?limit=2000`)); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const list = useMemo(() => (rows ?? []).filter((r) => r.list_key === tab), [rows, tab]);
  const dirty = (rows ?? []).some((r) => r._dirty || r._new);
  const cats = useMemo(() => (rows ?? []).filter((r) => r.list_key === "category"), [rows]);

  const patch = (id: string, p: Partial<Row>) => setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...p, _dirty: true } : r)));
  const patchCfg = (r: Row, p: Record<string, unknown>) => patch(r.id, { config: { ...r.config, ...p } });
  const add = () => setRows((prev) => [...(prev ?? []), {
    id: `new-${newId()}`, list_key: tab, code: "", name: "", name_en: null, hex: tab === "hw_color" || tab === "thread_color" ? "#cccccc" : null,
    config: tab === "category" ? { source: "sku_text" } : tab === "rule" ? { a: "", b: "", reason: "" } : tab === "prompt" ? { text: "", default_on: true } : tab === "accessory" ? { group: "" } : {},
    sort_order: (list.at(-1)?.sort_order ?? 0) + 10, is_active: true, _new: true,
  }]);

  const saveAll = async () => {
    const todo = (rows ?? []).filter((r) => r._dirty || r._new);
    const bad = todo.find((r) => !r.code.trim() || !r.name.trim());
    if (bad) { setTab(bad.list_key); toast.error("ทุกแถวต้องมีรหัสและชื่อ"); return; }
    const badPrompt = todo.find((r) => r.list_key === "prompt" && !(PROMPT_SYSTEM_KEYS as readonly string[]).includes(r.code) && !String(r.config.text ?? "").trim());
    if (badPrompt) { setTab("prompt"); toast.error(`แม่แบบ prompt “${badPrompt.name}” ยังไม่มีข้อความ`); return; }
    setSaving(true);
    let ok = 0; const fails: string[] = [];
    for (const r of todo) {
      const body = { list_key: r.list_key, code: r.code.trim(), name: r.name.trim(), name_en: r.name_en?.trim() || null, hex: r.hex || null, config: r.config, sort_order: r.sort_order };
      try {
        if (r._new) await api(`/api/design-library/choices`, { json: body });
        else { const { list_key: _lk, ...rest } = body; void _lk; await api(`/api/design-library/choices/${r.id}`, { method: "PATCH", json: rest }); }
        ok++;
      } catch (e) { fails.push(`${r.name || r.code}: ${(e as Error).message}`); }
    }
    setSaving(false);
    if (fails.length) toast.error(`บันทึกไม่ผ่าน ${fails.length} แถว — ${fails[0]}`);
    if (ok) { toast.success(`บันทึกแล้ว ${ok} แถว`); onChanged(); }
    await load();
  };

  const remove = async (r: Row) => {
    if (r._new) { setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); setDel(null); return; }
    try { await api(`/api/design-library/choices/${r.id}`, { method: "DELETE" }); toast.success("ลบแล้ว"); onChanged(); setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); }
    catch (e) { toast.error((e as Error).message); }
    setDel(null);
  };

  /** สวิตช์ค่าเริ่มของ prompt ระบบ (ไม่มีแถว = เปิด) → สร้าง/แก้แถว code = คีย์ระบบ */
  const sysPromptRow = (key: string) => (rows ?? []).find((r) => r.list_key === "prompt" && r.code === key && !String(r.config.text ?? "").trim());
  const toggleSysPrompt = (key: string, title: string) => {
    const r = sysPromptRow(key);
    if (r) { patchCfg(r, { default_on: r.config.default_on === false }); return; }
    setRows((prev) => [...(prev ?? []), { id: `new-${newId()}`, list_key: "prompt", code: key, name: title, name_en: null, hex: null, config: { default_on: false }, sort_order: 0, is_active: true, _new: true }]);
  };
  const SYS_TITLES = useMemo(() => Object.fromEntries(buildPrompts({ name: "x" }, cleanSpec({}), []).map((p) => [p.key, p.title])), []);

  /** แบบย่อยของวิธีทำโลโก้: บรรทัดละแบบ "ชื่อไทย=English" → เก็บเป็น [{code,name,name_en}] · รหัสเดิมคงไว้ (จับคู่ชื่อ แล้วค่อยตำแหน่ง) ให้สูตรเก่าไม่หลุด */
  const optText = (r: Row) => optDraft[r.id] ?? logoOptions(r).map((o) => (o.name_en ? `${o.name}=${o.name_en}` : o.name)).join("\n");
  const setOpts = (r: Row, text: string) => {
    setOptDraft((p) => ({ ...p, [r.id]: text }));
    const old = logoOptions(r), used = new Set<string>();
    const options = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l, i) => {
      const [a, b] = l.split("="); const name = a.trim().slice(0, 80), name_en = (b ?? "").trim().slice(0, 80);
      let code = old.find((o) => o.name === name && !used.has(o.code))?.code ?? (old[i] && !used.has(old[i].code) ? old[i].code : "");
      if (!code || used.has(code)) code = `o${Date.now().toString(36)}${i}`;
      used.add(code);
      return { code, name, name_en };
    }).filter((o) => o.name);
    patchCfg(r, { options });
  };
  const uploadAcc = async (r: Row, file?: File) => {
    if (!file) return;
    setUpId(r.id);
    try {
      const up = await uploadImagesWithDupCheck([file], { folder: "design-library/accessories", max: 1200, onError: (_, e) => toast.error(e.message) });
      const key = up?.keys[0];
      if (key) patchCfg(r, { image_key: key });
    } catch { toast.error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setUpId(null); }
  };
  const accGroups = useMemo(() => [...new Set((rows ?? []).filter((r) => r.list_key === "accessory").map((r) => String(r.config.group ?? "").trim()).filter(Boolean))], [rows]);
  /** ช่องตั้งค่าเพิ่มใต้แถว (หมวด / วิธีทำโลโก้ / ส่วนเสริม) */
  const extra = (r: Row) => {
    const box = "rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 -mt-1 grid gap-2";
    const lab = "block text-[11px] text-slate-500";
    if (r.list_key === "category") return (
      <div className={`${box} sm:grid-cols-2`}>
        <label className={lab}>แท็กวัสดุของหมวด (คั่นด้วย ,) — กรองแผงผ้า + รายการในป๊อปเลือก
          <input className={`${inp} mt-0.5`} value={listText(r.config.tags)} onChange={(e) => patchCfg(r, { tags: e.target.value.slice(0, 300) })} placeholder="เช่น ซิป  หรือ  ผ้า, หนัง, PU" /></label>
        <label className={lab}>ปุ่มลัดค้น (คั่นด้วย ,) — ชื่อปุ่ม=คำค้น
          <input className={`${inp} mt-0.5`} value={listText(r.config.chips)} onChange={(e) => patchCfg(r, { chips: e.target.value.slice(0, 500) })} placeholder="เช่น เบอร์ 30=THREAD-30, เบอร์ 40=THREAD-40" /></label>
      </div>
    );
    if (r.list_key === "logo_method") return (
      <div className={`${box} sm:grid-cols-2`}>
        <label className={lab}>แบบย่อย (บรรทัดละแบบ · ชื่อไทย=English)
          <textarea rows={4} value={optText(r)} onChange={(e) => setOpts(r, e.target.value)} placeholder={"พิมพ์จม=Debossed\nพิมพ์ฟอยล์ทอง=Gold foil"}
            className="mt-0.5 w-full px-2 py-1.5 border border-slate-200 rounded-md text-[12.5px]" /></label>
        <div className="space-y-2">
          <label className={lab}>คำเตือนที่ขึ้นทุกครั้งที่เลือก
            <input className={`${inp} mt-0.5`} value={String(r.config.warn ?? "")} onChange={(e) => patchCfg(r, { warn: e.target.value.slice(0, 200) })} placeholder="เช่น พิมพ์บนบางวัสดุไม่ได้" /></label>
          <label className={lab}>แท็กวัสดุตัวกระเป๋าที่ไม่เหมาะ — เตือนเอง (คั่นด้วย ,)
            <input className={`${inp} mt-0.5`} value={listText(r.config.avoid_tags)} onChange={(e) => patchCfg(r, { avoid_tags: e.target.value.slice(0, 300) })} placeholder="เช่น PU, หนัง" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[12px] text-slate-600 whitespace-nowrap"><input type="checkbox" checked={r.config.needs_material === true} onChange={(e) => patchCfg(r, { needs_material: e.target.checked })} />ต้องเลือกวัสดุของโลโก้</label>
            {r.config.needs_material === true && <input className={`${inp} flex-1 min-w-[140px]`} value={listText(r.config.material_tags)} onChange={(e) => patchCfg(r, { material_tags: e.target.value.slice(0, 200) })} placeholder="แท็กวัสดุ เช่น หนัง, PU" title="ป๊อปเลือกวัสดุโลโก้ เปิดรายการที่ติดแท็กนี้ก่อน" />}
          </div>
        </div>
      </div>
    );
    if (r.list_key === "accessory") {
      const key = String(r.config.image_key ?? "") || null;
      return (
        <div className={`${box} sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)] items-center`}>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {key ? <img src={img(key, 160)} alt="" className="w-12 h-12 rounded-md object-contain bg-white border border-slate-200" /> : <span className="w-12 h-12 rounded-md bg-white border border-dashed border-slate-300 inline-flex items-center justify-center text-slate-300"><Icon value="i:photo" /></span>}
            <label className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">
              <Icon value="i:upload" />{upId === r.id ? "กำลังอัป…" : key ? "เปลี่ยนรูป" : "อัปรูป"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadAcc(r, e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          <label className={lab}>กลุ่ม
            <input className={`${inp} mt-0.5`} list="dl-acc-groups" value={String(r.config.group ?? "")} onChange={(e) => patchCfg(r, { group: e.target.value.slice(0, 80) })} placeholder="เช่น พวงกุญแจ / ชาร์ม / สายคล้องแขน" /></label>
          <div className={lab}>ผูก SKU (ไม่บังคับ — ผูกแล้วเห็นสต็อก)
            {r.config.sku_id ? (
              <div className="mt-0.5 flex items-center gap-1.5 h-8 px-2 rounded-md border border-slate-200 bg-white text-[12.5px] text-slate-700">
                <code className="text-[11.5px]">{String(r.config.sku_code ?? "")}</code>
                <button type="button" onClick={() => patchCfg(r, { sku_id: null, sku_code: "" })} className="ml-auto text-rose-600 text-[11.5px] hover:underline">เอาออก</button>
              </div>
            ) : <div className="mt-0.5"><SkuPicker value={null} placeholder="ค้นรหัส / ชื่อ SKU" onChange={(v) => v && patchCfg(r, { sku_id: v.id, sku_code: v.code, ...(!r.config.image_key && v.image_key ? { image_key: v.image_key } : {}) })} /></div>}
          </div>
        </div>
      );
    }
    return null;
  };
  const inp = "h-8 px-2 border border-slate-200 rounded-md text-[13px] text-slate-800 w-full";
  const info = CHOICE_LISTS.find((l) => l.key === tab)!;

  return (
    <ERPModal open={open} onClose={onClose} title="ตั้งค่าตัวเลือก Design Library" size="xl" hasUnsavedChanges={dirty} storageKey="design-library-choices"
      footer={<div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500">{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}</span>
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ปิด</button>
        <button type="button" onClick={() => void saveAll()} disabled={!dirty || saving} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกทั้งหมด"}</button>
      </div>}>
      <div className="flex flex-wrap gap-1 mb-3">
        {CHOICE_LISTS.map((l) => (
          <button key={l.key} type="button" onClick={() => setTab(l.key)}
            className={`h-8 px-3 text-[13px] rounded-full border ${tab === l.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l.label} <span className="text-slate-400">{(rows ?? []).filter((r) => r.list_key === l.key).length}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-slate-500 mb-2">{info.hint}</p>
      {err ? <ErrorState title="โหลดตัวเลือกไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดตัวเลือก…" />
        : (
          tab === "prompt" ? (
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-medium text-slate-700 mb-1">Prompt ของระบบ — เปิดตั้งต้นทุกสูตรไหม</div>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {PROMPT_SYSTEM_KEYS.map((k) => { const r = sysPromptRow(k); const on = r?.config.default_on !== false; return (
                  <label key={k} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${r?._dirty || r?._new ? "bg-amber-50/50" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleSysPrompt(k, SYS_TITLES[k] ?? k)} />
                    <span className="text-[13px] text-slate-800">{SYS_TITLES[k] ?? k}</span>
                    <span className="ml-auto text-[11px] text-slate-400">{on ? "เปิดตั้งต้น" : "ปิดตั้งต้น (เปิดเองได้ในสูตร)"}</span>
                  </label>
                ); })}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-slate-700 mb-1">แม่แบบ prompt ของทีม — โผล่ในทุกสูตร</div>
              <p className="text-[11.5px] text-slate-500 mb-2">คำแทนที่ใช้ได้: {PROMPT_VARS.map((v) => <code key={v.key} title={v.label} className="mx-0.5 px-1 rounded bg-slate-100 text-[11px]">{`{${v.key}}`}</code>)}</p>
              <div className="space-y-2">
                {list.filter((r) => String(r.config.text ?? "").trim() || (r._new && !(PROMPT_SYSTEM_KEYS as readonly string[]).includes(r.code))).map((r) => (
                  <div key={r.id} className={`rounded-lg border p-2 space-y-2 ${r._dirty || r._new ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                    <div className="grid gap-2 grid-cols-[110px_minmax(0,1fr)_auto_64px_32px] items-center">
                      <input className={`${inp} font-mono`} value={r.code} placeholder="รหัส" onChange={(e) => patch(r.id, { code: e.target.value })} title="รหัส (ตัวอังกฤษ/ตัวเลข)" />
                      <input className={inp} value={r.name} placeholder="ชื่อ เช่น ถ่ายบนโต๊ะไม้" onChange={(e) => patch(r.id, { name: e.target.value })} />
                      <label className="flex items-center gap-1 text-[12px] text-slate-600 whitespace-nowrap"><input type="checkbox" checked={r.config.default_on !== false} onChange={(e) => patchCfg(r, { default_on: e.target.checked })} />เปิดตั้งต้น</label>
                      <input type="number" className={inp} value={r.sort_order} onChange={(e) => patch(r.id, { sort_order: Number(e.target.value) || 0 })} title="ลำดับ" />
                      <button type="button" onClick={() => setDel(r)} className="h-8 w-8 rounded-md text-rose-600 hover:bg-rose-50" aria-label="ลบ" title="ลบ">✕</button>
                    </div>
                    <textarea rows={3} value={String(r.config.text ?? "")} onChange={(e) => patchCfg(r, { text: e.target.value.slice(0, 4000) })} placeholder="เช่น Lifestyle photo of the {กระเป๋า} on a wooden table, soft daylight. {อ้างอิง}"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-[12px] font-mono" />
                  </div>
                ))}
                <button type="button" onClick={add} className="h-9 px-4 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เพิ่มแม่แบบ prompt</button>
              </div>
            </div>
          </div>
          ) : (
          <div className="space-y-2">
            {list.length === 0 && <div className="text-center text-[13px] text-slate-400 py-6">ยังไม่มีรายการ — กด “เพิ่ม” ด้านล่าง</div>}
            {tab === "accessory" && <datalist id="dl-acc-groups">{accGroups.map((g) => <option key={g} value={g} />)}</datalist>}
            {list.map((r) => (
              <Fragment key={r.id}>
              <div className={`grid gap-2 items-center rounded-lg border px-2 py-2 ${r._dirty || r._new ? "border-amber-300 bg-amber-50/40" : "border-slate-200"} grid-cols-2 sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_64px_32px]`}>
                <input className={`${inp} font-mono`} value={r.code} placeholder="รหัส" onChange={(e) => patch(r.id, { code: e.target.value })} title="รหัส (ตัวอังกฤษ/ตัวเลข)" />
                <input className={inp} value={r.name} placeholder="ชื่อ" onChange={(e) => patch(r.id, { name: e.target.value })} />
                {tab === "rule" ? (
                  <input className={inp} value={String(r.config.reason ?? "")} placeholder="เหตุผลที่ทีมเห็น" onChange={(e) => patchCfg(r, { reason: e.target.value })} />
                ) : (
                  <input className={inp} value={r.name_en ?? ""} placeholder="ชื่ออังกฤษ (ใช้ใน prompt)" onChange={(e) => patch(r.id, { name_en: e.target.value })} />
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  {(tab === "hw_color" || tab === "thread_color") && (
                    <><input type="color" value={r.hex ?? "#cccccc"} onChange={(e) => patch(r.id, { hex: e.target.value })} className="h-8 w-10 rounded border border-slate-200 shrink-0" title="สี" />
                      <span className="text-[11px] text-slate-400 font-mono">{r.hex}</span></>
                  )}
                  {tab === "category" && (
                    <>
                      <select value={String(r.config.source ?? "sku_text")} onChange={(e) => patchCfg(r, { source: e.target.value })} className={inp} title="เลือกจากไหน">
                        {CATEGORY_SOURCES.map((s) => <option key={s.key} value={s.key}>เลือกจาก: {s.label}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap" title="หมวดนี้ใช้สีอะไหล่ทั้งใบ">
                        <input type="checkbox" checked={r.config.hw === true} onChange={(e) => patchCfg(r, { hw: e.target.checked })} />สีอะไหล่
                      </label>
                    </>
                  )}
                  {tab === "rule" && (
                    <div className="grid grid-cols-2 gap-1 w-full">
                      <RuleSide value={String(r.config.a ?? "")} cats={cats} onChange={(v) => patchCfg(r, { a: v })} label="ถ้ามี" />
                      <RuleSide value={String(r.config.b ?? "")} cats={cats} onChange={(v) => patchCfg(r, { b: v })} label="คู่กับ" />
                    </div>
                  )}
                </div>
                <input type="number" className={inp} value={r.sort_order} onChange={(e) => patch(r.id, { sort_order: Number(e.target.value) || 0 })} title="ลำดับ (น้อย = ขึ้นก่อน)" />
                <button type="button" onClick={() => setDel(r)} className="h-8 w-8 rounded-md text-rose-600 hover:bg-rose-50" aria-label="ลบ" title="ลบ">✕</button>
              </div>
              {extra(r)}
              </Fragment>
            ))}
            <button type="button" onClick={add} className="h-9 px-4 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เพิ่ม{info.label}</button>
            {tab === "rule" && <p className="text-[11px] text-slate-400">ตัวอย่าง: ถ้ามี “ซิป : ZP-5G” คู่กับ “สีอะไหล่ : silver” → เตือนในหน้าสูตรและใบสรุป (รหัสต้องตรงกับรหัสของสิ่งที่เลือก)</p>}
          </div>
          )
        )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && void remove(del)} variant="danger"
        title="ลบตัวเลือกนี้?" message={`“${del?.name || del?.code || ""}” จะไม่โผล่ให้เลือกอีก (สูตรเดิมที่ใช้อยู่ยังเห็นชื่อเดิม)`} confirmText="ลบ" />
    </ERPModal>
  );
}

/** ฝั่งหนึ่งของกฎ: หมวด (หรือสีอะไหล่) + รหัส → เก็บเป็น "หมวด:รหัส" */
function RuleSide({ value, cats, onChange, label }: { value: string; cats: Choice[]; onChange: (v: string) => void; label: string }) {
  const [cat, code] = value.includes(":") ? [value.split(":")[0], value.split(":").slice(1).join(":")] : ["", value];
  return (
    <div className="flex gap-1 min-w-0" title={label}>
      <select value={cat} onChange={(e) => onChange(`${e.target.value}:${code}`)} className="h-8 px-1 border border-slate-200 rounded-md text-[12px] min-w-0 flex-1">
        <option value="">{label}…</option>
        <option value="hw_color">สีอะไหล่</option>
        {cats.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
      </select>
      <input value={code} onChange={(e) => onChange(`${cat}:${e.target.value}`)} placeholder="รหัส" className="h-8 px-1 border border-slate-200 rounded-md text-[12px] font-mono w-20" />
    </div>
  );
}
