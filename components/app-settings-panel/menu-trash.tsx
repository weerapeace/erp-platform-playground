"use client";
/**
 * 🗑 ถังขยะเมนู (ของกลาง) — ส่วนหนึ่งของหน้ารวมทุกแอป /admin/app-manager (หน้าจัดการแอป รอบ 3 · 2026-11-12)
 *   เมนูที่ "ปิดทั้งระบบ" (is_active=false) หรือ "ไม่อยู่แอปไหน" (app_keys ว่าง) มาอยู่ที่นี่ — กฎ trashReason ใน lib/app-menu-membership
 *   กู้คืน: ปิดอยู่ → เปิดกลับ (กลับไปทุกแอปที่เคยอยู่) · ไม่อยู่แอปไหน → เลือกแอปแล้วเพิ่ม (addToAppPatch) — PATCH /api/menu (มีประวัติ menu.update)
 *   ลบถาวร: ที่นี่ที่เดียว · กล่องยืนยันกลาง + พิมพ์ชื่อเมนู · DELETE /api/menu (เซิร์ฟเวอร์ยอมเฉพาะเมนูในถังขยะ · จดค่าเดิม + ประวัติ menu.delete)
 *   ลบเมนู = ลบลิงก์ในเมนูเท่านั้น ไม่ลบข้อมูลในหน้านั้น
 */
import { useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { addToAppPatch, trashReason, type MembershipMenu } from "@/lib/app-menu-membership";

export type TrashMenu = MembershipMenu & { icon?: string | null; updated_at?: string | null; parent_id?: string | null };
type AppLite = { key: string; label: string; default_href?: string | null };

const pill = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap";
const fmtDate = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export function MenuTrash({ menus, allMenus, apps, onChanged }: {
  /** เมนูในถังขยะ (กรองด้วย trashReason แล้ว) */
  menus: TrashMenu[];
  /** เมนูทั้งระบบ — นับเมนูย่อยที่ชี้มาที่เมนูนี้ */
  allMenus: TrashMenu[];
  apps: AppLite[];
  /** กู้คืน/ลบแล้ว — โหลดใหม่ */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "off" | "no_app">("all");
  const [target, setTarget] = useState<Record<string, string>>({});   // ไม่อยู่แอปไหน → แอปที่จะกู้คืนเข้า
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<TrashMenu | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const appName = (k: string) => apps.find((a) => a.key === k)?.label ?? k;
  const homeOf = (m: TrashMenu) => apps.filter((a) => a.default_href && a.default_href === m.href).map((a) => a.label);
  const kidsOf = (m: TrashMenu) => allMenus.filter((k) => k.parent_id === m.id).length;
  const norm = (s: string) => s.toLowerCase().trim();
  const list = menus
    .filter((m) => kind === "all" || trashReason(m) === kind)
    .filter((m) => !q.trim() || norm(m.label).includes(norm(q)) || norm(m.href).includes(norm(q)))
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  const nOff = menus.filter((m) => trashReason(m) === "off").length;

  const restore = async (m: TrashMenu, appKey?: string) => {
    const key = appKey ?? (m.app_keys ?? [])[0];
    if (!key) { toast.error("เลือกแอปที่จะกู้คืนเข้าไปก่อน"); return; }
    setBusy(m.id);
    try {
      const patch = addToAppPatch(m, key);
      const r = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, patch }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "กู้คืนไม่สำเร็จ");
      toast.success(appKey ? `เพิ่ม “${m.label}” เข้าแอป ${appName(key)} แล้ว` : `เปิด “${m.label}” กลับแล้ว — กลับไปอยู่ ${(m.app_keys ?? []).map(appName).join(", ")}`);
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
    finally { setBusy(null); }
  };
  const doDelete = async () => {
    if (!del || delBusy) return;
    setDelBusy(true);
    try {
      const r = await apiFetch(`/api/menu?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ลบเมนู “${del.label}” ถาวรแล้ว`);
      setDel(null); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setDelBusy(false); }
  };
  const chip = (on: boolean) => `h-8 rounded-full border px-3 text-xs ${on ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-3 p-4 pb-16">
        <div>
          <h1 className="text-lg font-semibold text-slate-800"><Icon name="delete" /> ถังขยะเมนู</h1>
          <p className="mt-1 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
            เมนูที่ <b>ปิดทั้งระบบ</b> หรือ <b>ไม่อยู่แอปไหนแล้ว</b> มาอยู่ที่นี่ — กู้คืนได้เสมอ · <b>ลบถาวรได้ที่นี่ที่เดียว</b> (พิมพ์ชื่อเมนูยืนยัน · มีประวัติว่าใครลบ)
            <br />ลบเมนู = ลบลิงก์ในเมนูเท่านั้น ข้อมูลในหน้านั้นไม่หาย · เมนูที่ยังใช้อยู่ ลบถาวรไม่ได้ ต้องเอาออกจากแอป/ปิดก่อน
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setKind("all")} className={chip(kind === "all")}>ทั้งหมด ({menus.length})</button>
          <button type="button" onClick={() => setKind("off")} className={chip(kind === "off")}>ปิดทั้งระบบ ({nOff})</button>
          <button type="button" onClick={() => setKind("no_app")} className={chip(kind === "no_app")}>ไม่อยู่แอปไหน ({menus.length - nOff})</button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อเมนูหรือลิงก์" aria-label="ค้นหาในถังขยะ"
            className="ml-auto h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-64 focus:border-violet-400 focus:outline-none" />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {!list.length ? (
            <div className="px-3 py-10 text-center text-sm text-slate-500">{menus.length ? "ไม่พบเมนูที่ตรงคำค้น" : "ถังขยะว่าง — ไม่มีเมนูที่ปิดอยู่หรือไม่อยู่แอปไหน"}</div>
          ) : list.map((m) => {
            const reason = trashReason(m);
            const keys = (m.app_keys ?? []).filter(Boolean);
            const homes = homeOf(m);
            const kids = kidsOf(m);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2.5 first:border-t-0">
                <span className="w-6 text-center text-slate-400"><Icon value={m.icon ?? "•"} /></span>
                <div className="min-w-[12rem] flex-1">
                  <div className="truncate text-sm font-medium text-slate-700">{m.label} <span className="font-mono text-[11px] font-normal text-slate-400">{m.href}</span></div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {reason === "off"
                      ? <span className={`${pill} bg-rose-50 text-rose-700`} title={keys.length ? `เปิดกลับแล้วจะอยู่: ${keys.map(appName).join(", ")}` : undefined}>ปิดทั้งระบบ{keys.length ? ` · เคยอยู่ ${keys.map(appName).join(", ")}` : " · ไม่อยู่แอปไหน"}</span>
                      : <span className={`${pill} bg-slate-100 text-slate-600`}>ไม่อยู่แอปไหน</span>}
                    {homes.length > 0 && <span className={`${pill} bg-amber-50 text-amber-800`}><Icon name="home" /> เป็นหน้าแรกของ {homes.join(", ")}</span>}
                    {kids > 0 && <span className={`${pill} bg-slate-100 text-slate-500`}>มีเมนูย่อย {kids}</span>}
                    {m.updated_at && <span className={`${pill} text-slate-400`}>แก้ล่าสุด {fmtDate(m.updated_at)}</span>}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                  {reason === "off" && keys.length > 0 ? (
                    <button type="button" disabled={busy === m.id} onClick={() => void restore(m)} className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                      <Icon name="refresh" /> เปิดกลับ
                    </button>
                  ) : (
                    <>
                      <select value={target[m.id] ?? ""} onChange={(e) => setTarget((t) => ({ ...t, [m.id]: e.target.value }))} aria-label={`เลือกแอปที่จะกู้คืน ${m.label} เข้าไป`}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                        <option value="">— กู้คืนเข้าแอป —</option>
                        {apps.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </select>
                      <button type="button" disabled={busy === m.id} onClick={() => void restore(m, target[m.id] || undefined)} className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                        <Icon name="add" /> กู้คืน
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setDel(m)} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs text-rose-700 hover:bg-rose-50">
                    <Icon name="delete" /> ลบถาวร
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {del && (
        <ConfirmDialog open onClose={() => !delBusy && setDel(null)} onConfirm={() => void doDelete()} loading={delBusy} variant="danger"
          title={`ลบเมนู “${del.label}” ถาวร`} confirmText="ลบถาวร" requireTyped={del.label}
          message={<div className="space-y-2 text-sm">
            <p>เมนูนี้จะหายถาวรและ<b>ย้อนกลับไม่ได้</b> — การตั้งค่า “ใครเห็น” / ลำดับ / ชื่อในแต่ละแอปของเมนูนี้หายด้วย</p>
            {homeOf(del).length > 0 && <p className="text-amber-800">เมนูนี้เป็นหน้าแรกของ {homeOf(del).join(", ")} — ลบแล้วแอปนั้นจะเปิดเมนูแรกที่เห็นแทน</p>}
            {kidsOf(del) > 0 && <p className="text-slate-600">มีเมนูย่อย {kidsOf(del)} ตัว — จะกลายเป็นเมนูหลักแทน (ไม่ถูกลบ)</p>}
            <p className="text-xs text-slate-500">ข้อมูลในหน้านั้นไม่หาย ลบแค่ลิงก์ในเมนู · มีบันทึกประวัติว่าใครลบ · พิมพ์ชื่อเมนูด้านล่างเพื่อยืนยัน</p>
          </div>} />
      )}
    </div>
  );
}
