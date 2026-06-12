"use client";

/**
 * จัดการชุดไซส์มาตรฐาน — /admin/size-templates
 * เพิ่ม/แก้/ลบ/เรียง ชุดไซส์ (ชื่อ + รายการไซส์) → ใช้เติมไซส์ให้สูตร BOM เร็วๆ
 */
import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { SizeTemplate } from "@/app/api/admin/size-templates/route";

export default function SizeTemplatesPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const toast = useToast();

  const [list, setList] = useState<SizeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/admin/size-templates"); const j = await res.json(); setList((j.data ?? []) as SizeTemplate[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (id: string, p: Partial<SizeTemplate>) => {
    setList((ls) => ls.map((x) => x.id === id ? { ...x, ...p } : x));
    try { const res = await apiFetch("/api/admin/size-templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) }); const j = await res.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void load(); }
  }, [toast, load]);
  const addTemplate = useCallback(async () => {
    const name = newName.trim(); if (!name) return;
    try { const res = await apiFetch("/api/admin/size-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, labels: [] }) }); const j = await res.json(); if (j.error) throw new Error(j.error); setNewName(""); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  }, [newName, toast, load]);
  const del = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/admin/size-templates?id=${id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setConfirmDel(null); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast, load]);
  const move = useCallback((idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    const arr = [...list]; const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    setList(arr);
    void patch(arr[idx].id, { sort_order: idx }); void patch(arr[j].id, { sort_order: j });
  }, [list, patch]);
  const addLabel = (t: SizeTemplate) => { const v = (newLabel[t.id] ?? "").trim(); if (!v || t.labels.includes(v)) return; void patch(t.id, { labels: [...t.labels, v] }); setNewLabel((s) => ({ ...s, [t.id]: "" })); };
  const removeLabel = (t: SizeTemplate, lab: string) => void patch(t.id, { labels: t.labels.filter((x) => x !== lab) });

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-[820px] mx-auto px-5 py-5">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">📐 จัดการชุดไซส์มาตรฐาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">ชุดไซส์ใช้เติมรายการไซส์ให้สูตร BOM เร็วๆ (เช่น เสื้อ S/M/L, เข็มขัด 38–44&quot;)</p>
        </div>

        {canEdit && (
          <div className="flex gap-2 mb-4">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addTemplate(); }}
              placeholder="ชื่อชุดไซส์ใหม่ (เช่น กางเกง: 28–36)" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => void addTemplate()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">＋ เพิ่มชุดไซส์</button>
          </div>
        )}

        {loading ? <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>
          : list.length === 0 ? <div className="text-center py-16 text-slate-300">ยังไม่มีชุดไซส์</div>
            : (
              <div className="space-y-2">
                {list.map((t, i) => (
                  <div key={t.id} className="border border-slate-200 rounded-xl bg-white p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex flex-col text-[10px] leading-none">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                        <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                      </div>
                      <input defaultValue={t.name} disabled={!canEdit} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void patch(t.id, { name: v }); }}
                        className="flex-1 h-8 px-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                      {canEdit && (confirmDel === t.id
                        ? <div className="flex gap-1"><button onClick={() => void del(t.id)} className="h-8 px-2 text-xs bg-rose-600 text-white rounded-lg">ยืนยันลบ</button><button onClick={() => setConfirmDel(null)} className="h-8 px-2 text-xs border border-slate-200 rounded-lg">ยกเลิก</button></div>
                        : <button onClick={() => setConfirmDel(t.id)} className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button>)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-7">
                      {t.labels.map((lab) => (
                        <span key={lab} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {lab}{canEdit && <button onClick={() => removeLabel(t, lab)} className="text-indigo-400 hover:text-rose-500">✕</button>}
                        </span>
                      ))}
                      {t.labels.length === 0 && <span className="text-[11px] text-slate-300">ยังไม่มีไซส์ในชุดนี้</span>}
                      {canEdit && (
                        <input value={newLabel[t.id] ?? ""} onChange={(e) => setNewLabel((s) => ({ ...s, [t.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(t); } }}
                          placeholder="+ เพิ่มไซส์ (เช่น M)" className="h-7 px-2 text-xs border border-slate-200 rounded-lg w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>
    </PlaygroundShell>
  );
}
