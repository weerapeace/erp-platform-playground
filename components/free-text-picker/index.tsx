"use client";

/**
 * ของกลาง — ช่อง "พิมพ์ชื่อเอง" แบบมีรายการให้เลือก (เพิ่ม / แก้ไข / ลบ ได้ในตัว)
 *
 *   <FreeTextPicker value={name} onChange={setName} kind="bom_material" />
 *
 * ใช้ตอนที่ผู้ใช้ "ยังไม่มีรหัสของจริง" แต่ต้องพิมพ์ชื่อไว้ก่อน เช่น วัตถุดิบในคำขอแก้สูตร
 *  • พิมพ์เองได้อิสระ (ไม่บังคับให้เลือกจากรายการ) — พิมพ์แล้วกดปุ่มบันทึกเข้ารายการก็ได้
 *  • เลือกจากรายการที่เคยใช้ (ชื่อที่ใช้บ่อยลอยขึ้นบน)
 *  • ✏️ แก้ชื่อ / 🗑 ลบ ในรายการ — เฉพาะคนมีสิทธิ์แก้ข้อมูลสินค้า (products.edit)
 * เบื้องหลัง: /api/free-text-names (ตาราง free_text_names · แยกด้วย kind)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import type { FreeTextName } from "@/app/api/free-text-names/route";

export function FreeTextPicker({
  value, onChange, kind = "bom_material", placeholder = "พิมพ์ชื่อที่รู้ เช่น ผ้าแคนวาสรีไซเคิล", className = "",
}: {
  value: string;
  onChange: (name: string) => void;
  kind?: string;
  placeholder?: string;
  className?: string;
}) {
  const toast = useToast();
  const canManage = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FreeTextName[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/free-text-names?kind=${encodeURIComponent(kind)}`).then((r) => r.json());
      setItems((j.data ?? []) as FreeTextName[]);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  // คลิกนอกช่อง = ปิดรายการ
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setEditId(null); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const typed = value.trim();
  const filtered = typed
    ? items.filter((i) => i.name.toLowerCase().includes(typed.toLowerCase()))
    : items;
  const exactHit = items.find((i) => i.name.toLowerCase() === typed.toLowerCase()) ?? null;

  /** เลือกชื่อจากรายการ → เติมลงช่อง + นับว่าใช้ (ครั้งหน้าลอยขึ้นบน) */
  const pick = (it: FreeTextName) => {
    onChange(it.name);
    setOpen(false);
    apiFetch("/api/free-text-names", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, bump: true }) })
      .catch(() => { /* นับไม่ได้ก็ไม่เป็นไร */ });
  };

  /** บันทึกชื่อที่พิมพ์ไว้เข้ารายการ (คนอื่นเลือกใช้ต่อได้) */
  const saveNew = async () => {
    if (!typed) return;
    setBusy(true);
    try {
      const j = await apiFetch("/api/free-text-names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name: typed }) })
        .then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(j.existed ? "ชื่อนี้มีในรายการอยู่แล้ว" : `เพิ่ม “${typed}” เข้ารายการแล้ว`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const saveEdit = async (it: FreeTextName) => {
    const nm = editText.trim();
    if (!nm) return;
    setBusy(true);
    try {
      const j = await apiFetch("/api/free-text-names", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, name: nm }) })
        .then((r) => r.json());
      if (j.error) throw new Error(j.error);
      if (value.trim() === it.name) onChange(nm);   // ช่องนี้ใช้ชื่อเดิมอยู่ → เปลี่ยนตาม
      setEditId(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const remove = async (it: FreeTextName) => {
    if (!window.confirm(`เอา “${it.name}” ออกจากรายการ?\n(คำขอเก่าที่เคยใช้ชื่อนี้ยังอยู่เหมือนเดิม)`)) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/free-text-names?id=${encodeURIComponent(it.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center gap-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 min-w-0 h-8 px-2 text-sm border border-amber-300 bg-amber-50/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <button type="button" onClick={() => setOpen((v) => !v)} title="เลือกจากชื่อที่เคยใช้"
          className="shrink-0 h-7 w-6 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded">▾</button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[320px] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-2.5 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-b border-slate-100">
            ชื่อที่เคยใช้ {canManage && <span>· ✏️ แก้ · 🗑 ลบ ได้</span>}
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading ? <div className="px-2.5 py-3 text-[11px] text-slate-400">กำลังโหลด…</div>
              : filtered.length === 0 ? <div className="px-2.5 py-3 text-[11px] text-slate-400">{typed ? "ไม่มีชื่อนี้ในรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม" : "ยังไม่มีชื่อในรายการ"}</div>
              : filtered.map((it) => (
                <div key={it.id} className="flex items-center gap-1 px-1.5 py-1 border-b border-slate-50 last:border-0 hover:bg-amber-50/50">
                  {editId === it.id ? (
                    <>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(it); if (e.key === "Escape") setEditId(null); }}
                        className="flex-1 min-w-0 h-7 px-1.5 text-[12px] border border-slate-200 rounded" />
                      <button type="button" disabled={busy} onClick={() => void saveEdit(it)} className="shrink-0 h-6 px-1.5 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded">บันทึก</button>
                      <button type="button" onClick={() => setEditId(null)} className="shrink-0 h-6 px-1 text-[11px] text-slate-400 hover:bg-slate-50 rounded">ยกเลิก</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => pick(it)} className="flex-1 min-w-0 text-left px-1 py-0.5">
                        <span className="block text-[12px] text-slate-700 truncate">{it.name}</span>
                        {it.use_count > 0 && <span className="block text-[10px] text-slate-400">ใช้ไปแล้ว {it.use_count} ครั้ง</span>}
                      </button>
                      {canManage && (
                        <>
                          <button type="button" title="แก้ชื่อ" onClick={() => { setEditId(it.id); setEditText(it.name); }}
                            className="shrink-0 h-6 w-6 text-[11px] text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded">✏️</button>
                          <button type="button" title="เอาออกจากรายการ" disabled={busy} onClick={() => void remove(it)}
                            className="shrink-0 h-6 w-6 text-[11px] text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded">🗑</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>

          {typed && !exactHit && (
            <button type="button" disabled={busy} onClick={() => void saveNew()}
              className="w-full px-2.5 py-2 text-left text-[12px] font-medium text-amber-800 bg-amber-50 border-t border-amber-100 hover:bg-amber-100 disabled:opacity-50">
              ＋ เพิ่ม “{typed}” เข้ารายการ <span className="font-normal text-amber-600">(ครั้งหน้าเลือกได้เลย)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
