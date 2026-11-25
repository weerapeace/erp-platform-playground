"use client";
/**
 * PublishThemeDialog — เผยแพร่ + เลือกแอปที่ใช้ธีมนี้ ในขั้นเดียว (ตัวแก้ธีมใช้ง่าย ข้อ 2)
 *   โน้ตเวอร์ชัน (ไม่บังคับ) · ติ๊กธีมบริษัท/แอปที่จะใช้ธีมนี้ (ติ๊กไว้ก่อน = ที่ใช้อยู่แล้ว)
 *   ไม่มีสิทธิ์ theme.assign = เผยแพร่อย่างเดียว · เลือกแอปผ่าน /api/themes/assignments (ย้อนกลับได้ในแท็บแอปใช้ธีมไหน)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { COMPANY_SCOPE, appScope } from "@/lib/erp-theme-assign";

type App = { key: string; label: string; icon: string | null };

export function PublishThemeDialog({ open, themeId, themeName, onClose, onPublish }: {
  open: boolean; themeId: string; themeName: string; onClose: () => void;
  /** ทำงานจริง: เผยแพร่ (note) แล้วตามด้วยเปลี่ยนการเลือกแอป (changes) — คืน error ถ้าไม่สำเร็จ */
  onPublish: (note: string, changes: { scope: string; theme_id: string | null }[]) => Promise<void>;
}) {
  const canAssign = usePermission("theme.assign");
  const [note, setNote] = useState("");
  const [apps, setApps] = useState<App[]>([]);
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote("");
    if (!canAssign) return;
    void (async () => {
      const r = await apiFetch("/api/themes/assignments");
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) return;
      setApps(j.apps ?? []);
      const cur = Object.fromEntries(((j.assignments ?? []) as { scope: string; theme_id: string }[]).map((a) => [a.scope, a.theme_id]));
      setCurrent(cur);
      setPicked(new Set(Object.entries(cur).filter(([, t]) => t === themeId).map(([s]) => s)));
    })();
  }, [open, canAssign, themeId]);

  const changes = useMemo(() => {
    const out: { scope: string; theme_id: string | null }[] = [];
    const scopes = [COMPANY_SCOPE, ...apps.map((a) => appScope(a.key))];
    for (const s of scopes) {
      const was = current[s] === themeId, now = picked.has(s);
      if (now && !was) out.push({ scope: s, theme_id: themeId });
      if (!now && was) out.push({ scope: s, theme_id: null });
    }
    return out;
  }, [apps, current, picked, themeId]);

  const toggle = (s: string) => setPicked((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const go = async () => { setBusy(true); try { await onPublish(note.trim(), changes); onClose(); } finally { setBusy(false); } };
  const takenBy = (s: string) => current[s] && current[s] !== themeId;

  return (
    <ERPModal open={open} onClose={onClose} title={`เผยแพร่ "${themeName}"`} size="md" storageKey="erp-theme-publish"
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm">ยกเลิก</button>
        <button type="button" disabled={busy} onClick={() => void go()} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">{busy ? "กำลังเผยแพร่…" : changes.length ? `เผยแพร่ + ใช้กับ ${changes.filter((c) => c.theme_id).length} ที่` : "เผยแพร่"}</button></div>}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">จดสั้น ๆ ว่าเปลี่ยนอะไร (ไม่บังคับ)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="เช่น เปลี่ยนเป็นสไตล์เทศกาล" className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        {canAssign ? (
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1.5">ใช้ธีมนี้กับ</div>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[45vh] overflow-y-auto">
              {[{ s: COMPANY_SCOPE, label: "ธีมบริษัท (ทุกแอปที่ไม่ได้เลือกเอง)", icon: null as string | null }, ...apps.map((a) => ({ s: appScope(a.key), label: a.label, icon: a.icon }))].map((row) => (
                <label key={row.s} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(row.s)} onChange={() => toggle(row.s)} />
                  {row.icon && <Icon value={row.icon} />}
                  <span className="flex-1">{row.label}</span>
                  {takenBy(row.s) && !picked.has(row.s) && <span className="text-[10px] text-slate-400">ใช้ธีมอื่นอยู่</span>}
                  {takenBy(row.s) && picked.has(row.s) && <span className="text-[10px] text-amber-700">จะเปลี่ยนจากธีมเดิม</span>}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">ย้อนได้ที่แท็บ "แอปใช้ธีมไหน" · ทุกการเปลี่ยนบันทึกประวัติ</p>
          </div>
        ) : <p className="text-xs text-slate-500">คุณไม่มีสิทธิ์เลือกธีมให้แอป (theme.assign) — เผยแพร่ได้อย่างเดียว</p>}
      </div>
    </ERPModal>
  );
}
