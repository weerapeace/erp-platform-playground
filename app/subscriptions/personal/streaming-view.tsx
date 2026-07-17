"use client";

/**
 * มุมมอง "📺 Streaming" (โหมดส่วนตัว) — จัดการคลังบริการ streaming + ดูว่าบริการไหนได้จากรายการไหน
 */
import { useMemo, useState } from "react";
import type { StreamingService, Subscription } from "@/lib/subscriptions";

export function StreamingView({
  services, mine, onAdd, onRename, onDelete, onEditSub,
}: {
  services: StreamingService[];
  mine: Subscription[];
  onAdd: (name: string) => Promise<StreamingService | null>;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onEditSub: (s: Subscription) => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // service id → รายการ (ของฉัน) ที่ติ๊กบริการนี้
  const subsByService = useMemo(() => {
    const m = new Map<string, Subscription[]>();
    for (const s of services) m.set(s.id, []);
    for (const sub of mine) for (const id of sub.streaming ?? []) m.get(id)?.push(sub);
    return m;
  }, [services, mine]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try { const svc = await onAdd(name); if (svc) setNewName(""); }
    finally { setAdding(false); }
  };

  const startEdit = (s: StreamingService) => { setEditId(s.id); setEditName(s.name); };
  const saveEdit = async () => {
    if (editId && editName.trim()) await onRename(editId, editName.trim());
    setEditId(null); setEditName("");
  };

  return (
    <div className="space-y-3">
      {/* เพิ่มบริการใหม่ */}
      <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2.5 shadow-sm">
        <span className="text-sm text-slate-500 hidden sm:inline">➕ เพิ่มบริการ Streaming:</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="เช่น iQIYI, WeTV, Netflix, Disney+, Viu"
          className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-400" />
        <button onClick={add} disabled={!newName.trim() || adding}
          className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {adding ? "…" : "เพิ่ม"}
        </button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          ยังไม่มีบริการ Streaming ในคลัง — เพิ่มด้านบน แล้วไปติ๊กในแต่ละรายการ (กดแก้ไขรายการ)
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map((s) => {
            const subs = subsByService.get(s.id) ?? [];
            return (
              <div key={s.id} className="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {editId === s.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditId(null); setEditName(""); } }}
                        className="flex-1 h-8 px-2 text-sm border border-violet-300 rounded-md outline-none" />
                      <button onClick={saveEdit} className="h-8 px-2 text-xs bg-violet-600 text-white rounded-md">✓</button>
                      <button onClick={() => { setEditId(null); setEditName(""); }} className="h-8 px-2 text-xs border border-slate-200 rounded-md">✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="font-semibold text-violet-700 flex items-center gap-2 min-w-0">
                        <span className="text-base">📺</span>
                        <span className="truncate">{s.name}</span>
                        <span className="text-xs font-normal text-slate-400">({subs.length})</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(s)} title="เปลี่ยนชื่อ"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                        {confirmDel === s.id ? (
                          <button onClick={() => { onDelete(s.id); setConfirmDel(null); }} title="ยืนยันลบ"
                            className="h-7 px-2 inline-flex items-center rounded-md bg-red-600 text-white text-[11px]">ยืนยันลบ</button>
                        ) : (
                          <button onClick={() => setConfirmDel(s.id)} title="ลบบริการ"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {/* รายการที่ให้บริการนี้ */}
                {subs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map((sub) => (
                      <button key={sub.id} onClick={() => onEditSub(sub)}
                        className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100">
                        {sub.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">ยังไม่มีรายการไหนติ๊กว่าได้บริการนี้ — เปิดแก้ไขรายการแล้วติ๊ก</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
