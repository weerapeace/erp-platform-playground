"use client";

/**
 * 📚 Design Library — ป๊อป "ติดแท็กอะไหล่จากชื่อ SKU" (รอบ 7 · เจ้าของเลือก: ระบบเสนอ คนติ๊กยืนยัน)
 * ระบบเดาแท็กย่อยจากชื่อ (lib/design-library-hwtags) → คนติ๊กออกตัวที่ไม่ใช่ → ยืนยัน → API ติดแท็กให้ (แท็กพ่อ "อะไหล่" ติดเองผ่าน roll-up)
 * ตัวที่ติดแท็กนั้นอยู่แล้ว = ติ๊กไว้และกดไม่ได้ · ไม่ลบแท็กเดิมของใคร
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { api, img } from "./shared";

type Item = { id: string; code: string; name: string; image_key: string | null; tagged: boolean };
type Group = { tag: string; words: string[]; exists: boolean; items: Item[] };

export function HwTagSuggestModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());   // ตัวที่ติ๊กออก (ค่าเริ่ม = ติ๊กทุกตัวที่ยังไม่ติดแท็ก)
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState(0);

  const load = async () => {
    setErr(null); setGroups(null);
    try {
      const d = await api<{ groups: Group[]; skipped_finished: number }>(`/api/design-library/hw-tags`);
      setGroups(d.groups); setSkipped(d.skipped_finished); setOff(new Set()); setOpenTag(d.groups[0]?.tag ?? null);
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { if (open) void load(); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => (groups ?? []).map((g) => ({ tag: g.tag, ids: g.items.filter((i) => !i.tagged && !off.has(i.id)).map((i) => i.id) })), [groups, off]);
  const total = picked.reduce((n, g) => n + g.ids.length, 0);
  const toggle = (id: string) => setOff((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (g: Group, on: boolean) => setOff((p) => { const n = new Set(p); for (const i of g.items) if (!i.tagged) { if (on) n.delete(i.id); else n.add(i.id); } return n; });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ linked: number; created_tags: string[] }>(`/api/design-library/hw-tags`, { json: { items: picked.filter((g) => g.ids.length).map((g) => ({ tag: g.tag, sku_ids: g.ids })) } });
      toast.success(`ติดแท็กแล้ว ${r.linked.toLocaleString("th-TH")} รายการ${r.created_tags.length ? ` · แท็กใหม่: ${r.created_tags.join(", ")}` : ""}`);
      setAsk(false); onDone?.(); await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="ติดแท็กอะไหล่จากชื่อ SKU" size="xl" storageKey="design-library-hwtags"
      description="ระบบเดาจากชื่อ — ติ๊กออกตัวที่ไม่ใช่ แล้วกดติดแท็ก · แท็กย่อยอยู่ในกลุ่ม “อะไหล่” และติดแท็ก “อะไหล่” ให้เองด้วย"
      footer={<div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500">{groups ? `จะติดแท็ก ${total.toLocaleString("th-TH")} รายการ` : ""}</span>
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ปิด</button>
        <button type="button" disabled={!total || saving} onClick={() => setAsk(true)} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">ติดแท็ก {total.toLocaleString("th-TH")} รายการ</button>
      </div>}>
      {err ? <ErrorState title="โหลดรายการไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !groups ? <LoadingState label="กำลังหา SKU ที่ชื่อเหมือนอะไหล่…" />
        : groups.length === 0 ? <div className="py-10 text-center text-[13px] text-slate-500">ไม่พบ SKU ที่ชื่อเหมือนอะไหล่</div>
        : (
          <div className="space-y-2">
            {skipped > 0 && <p className="text-[12px] text-slate-500">ข้ามสินค้าสำเร็จรูป {skipped.toLocaleString("th-TH")} รายการ (มีแท็กแบรนด์/หมวดหมู่สินค้า)</p>}
            {groups.map((g) => {
              const fresh = g.items.filter((i) => !i.tagged), on = fresh.filter((i) => !off.has(i.id)).length, isOpen = openTag === g.tag;
              return (
                <div key={g.tag} className="rounded-xl border border-slate-200 overflow-hidden">
                  <button type="button" onClick={() => setOpenTag(isOpen ? null : g.tag)} className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-left hover:bg-slate-100">
                    <Icon value={isOpen ? "i:chevron-down" : "i:chevron-right"} />
                    <span className="text-[14px] font-medium text-slate-800">{g.tag}</span>
                    {!g.exists && <span className="text-[11px] px-1.5 rounded bg-indigo-50 text-indigo-700">แท็กใหม่</span>}
                    <span className="text-[12px] text-slate-500 truncate">คำที่ใช้เดา: {g.words.join(", ")}</span>
                    <span className="ml-auto text-[12px] text-slate-600 whitespace-nowrap">ติ๊ก {on}/{fresh.length}{g.items.length > fresh.length ? ` · ติดแล้ว ${g.items.length - fresh.length}` : ""}</span>
                  </button>
                  {isOpen && (
                    <div className="p-2">
                      <div className="flex gap-2 mb-2">
                        <button type="button" onClick={() => setAll(g, true)} className="h-7 px-2.5 text-[12px] rounded-lg border border-slate-200 hover:bg-slate-50">ติ๊กทั้งหมด</button>
                        <button type="button" onClick={() => setAll(g, false)} className="h-7 px-2.5 text-[12px] rounded-lg border border-slate-200 hover:bg-slate-50">เอาออกทั้งหมด</button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 max-h-[45vh] overflow-y-auto pr-1">
                        {g.items.map((i) => {
                          const checked = i.tagged || !off.has(i.id);
                          return (
                            <label key={i.id} className={`flex items-center gap-2 p-1.5 rounded-lg border text-[13px] ${i.tagged ? "border-emerald-200 bg-emerald-50/50 cursor-default" : checked ? "border-indigo-200 bg-indigo-50/30 cursor-pointer" : "border-slate-200 cursor-pointer opacity-70"}`}>
                              <input type="checkbox" checked={checked} disabled={i.tagged} onChange={() => toggle(i.id)} />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {i.image_key ? <img src={img(i.image_key, 120)} alt="" className="w-9 h-9 rounded object-cover bg-slate-50 shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded bg-slate-100 shrink-0" />}
                              <span className="min-w-0 flex-1"><code className="block text-[10.5px] text-slate-400">{i.code}</code><span className="block truncate text-slate-700">{i.name}</span></span>
                              {i.tagged && <span className="text-[11px] text-emerald-700 shrink-0">ติดแล้ว</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <ConfirmDialog open={ask} onClose={() => setAsk(false)} onConfirm={() => void save()} loading={saving}
        title={`ติดแท็กอะไหล่ ${total.toLocaleString("th-TH")} รายการ?`}
        message={picked.filter((g) => g.ids.length).map((g) => `${g.tag} ${g.ids.length}`).join(" · ") + " — แท็กเดิมของแต่ละ SKU ยังอยู่ครบ (เอาแท็กออกทีหลังได้ที่หน้า SKU)"} confirmText="ติดแท็ก" />
    </ERPModal>
  );
}
