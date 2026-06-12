"use client";

/**
 * Card Layout (ของกลาง) — เลือก field ที่จะโชว์บนการ์ด + เรียงลำดับ
 *   default ของทุกคน (admin) + ส่วนตัวรายคน (override) เก็บที่ /api/card-layouts
 *
 * ใช้:
 *   const { fields, reload } = useCardLayout("receive-tracking");
 *   const visible = fields ?? AVAILABLE.map(f => f.key);   // ยังไม่ตั้ง = โชว์ทั้งหมด
 *   <CardLayoutEditor scopeKey="receive-tracking" available={AVAILABLE} current={fields} ... />
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export type CardField = { key: string; label: string };

/** อ่านเลย์เอาต์การ์ด — คืน fields ที่ควรโชว์ (รายคน → default → null=ทั้งหมด) */
export function useCardLayout(scopeKey: string) {
  const [data, setData] = useState<{ def: string[] | null; mine: string[] | null }>({ def: null, mine: null });
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/card-layouts?scope=${encodeURIComponent(scopeKey)}`).then((r) => r.json());
      setData({ def: Array.isArray(j.default) ? j.default : null, mine: Array.isArray(j.mine) ? j.mine : null });
    } catch { /* ignore */ }
    finally { setLoaded(true); }
  }, [scopeKey]);
  useEffect(() => { void reload(); }, [reload]);
  // visible: รายคน → default → null (consumer ใช้ "ทั้งหมด" แทน)
  const fields = data.mine ?? data.def ?? null;
  return { fields, def: data.def, mine: data.mine, loaded, reload };
}

/** ป๊อปออกแบบการ์ด — เลือก/เรียง field · บันทึกเป็นของฉัน หรือ default ทุกคน (admin) */
export function CardLayoutEditor({ scopeKey, available, current, canManageDefault, onClose, onSaved }: {
  scopeKey: string; available: CardField[]; current: string[] | null;
  canManageDefault?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const init = (current && current.length ? current.filter((k) => available.some((a) => a.key === k)) : available.map((a) => a.key));
  const [sel, setSel] = useState<string[]>(init);
  const [saving, setSaving] = useState(false);
  const labelOf = (k: string) => available.find((a) => a.key === k)?.label ?? k;
  const remove = (k: string) => setSel((s) => s.filter((x) => x !== k));
  const add = (k: string) => setSel((s) => s.includes(k) ? s : [...s, k]);
  const move = (k: string, dir: -1 | 1) => setSel((s) => { const i = s.indexOf(k); const j = i + dir; if (i < 0 || j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const unsel = available.filter((a) => !sel.includes(a.key));

  const save = async (target: "me" | "all") => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/card-layouts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: scopeKey, fields: sel, target }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(target === "all" ? "บันทึกเป็นค่าเริ่มต้นของทุกคนแล้ว" : "บันทึกการ์ดของฉันแล้ว");
      onSaved();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };
  const reset = async (target: "me" | "all") => {
    setSaving(true);
    try {
      await apiFetch(`/api/card-layouts?scope=${encodeURIComponent(scopeKey)}&target=${target}`, { method: "DELETE" });
      toast.success(target === "all" ? "ล้างค่าเริ่มต้นแล้ว" : "ล้างการ์ดของฉันแล้ว");
      onSaved();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" storageKey="card-layout"
      title="🎨 ออกแบบการ์ด"
      description="เลือกข้อมูลที่จะโชว์บนการ์ด + เรียงลำดับ"
      footer={<>
        {canManageDefault && <button onClick={() => void reset("all")} disabled={saving} className="px-3 h-9 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">↺ ล้างค่าเริ่มต้น</button>}
        <button onClick={onClose} disabled={saving} className="ml-auto px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
        {canManageDefault && <button onClick={() => void save("all")} disabled={saving} className="px-4 h-9 text-sm font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">{saving ? "…" : "บันทึกเป็นค่าเริ่มต้น (ทุกคน)"}</button>}
        <button onClick={() => void save("me")} disabled={saving} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก (เฉพาะฉัน)"}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        {/* ที่เลือกไว้ (เรียงได้) */}
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1.5">โชว์บนการ์ด ({sel.length})</div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 min-h-[200px]">
            {sel.length === 0 && <div className="p-3 text-xs text-slate-300 text-center">— ยังไม่เลือก —</div>}
            {sel.map((k, i) => (
              <div key={k} className="flex items-center gap-1 px-2 py-1.5 text-sm">
                <span className="flex-1 truncate text-slate-700">{i + 1}. {labelOf(k)}</span>
                <button onClick={() => move(k, -1)} disabled={i === 0} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-30">▲</button>
                <button onClick={() => move(k, 1)} disabled={i === sel.length - 1} className="w-6 h-6 text-slate-400 hover:text-slate-700 disabled:opacity-30">▼</button>
                <button onClick={() => remove(k)} title="เอาออก" className="w-6 h-6 text-slate-400 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
        {/* ที่ซ่อนไว้ (กดเพิ่ม) */}
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1.5">ซ่อนอยู่ ({unsel.length})</div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 min-h-[200px]">
            {unsel.length === 0 && <div className="p-3 text-xs text-slate-300 text-center">— เลือกครบแล้ว —</div>}
            {unsel.map((f) => (
              <button key={f.key} onClick={() => add(f.key)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left text-slate-600 hover:bg-slate-50">
                <span className="text-slate-300">＋</span><span className="flex-1 truncate">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">💡 &quot;เฉพาะฉัน&quot; = เห็นคนเดียว · &quot;ค่าเริ่มต้น&quot; = ทุกคนที่ยังไม่ตั้งเอง (เฉพาะ admin)</p>
    </ERPModal>
  );
}
