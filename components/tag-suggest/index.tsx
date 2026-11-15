"use client";

/**
 * 🏷️ TagSuggestModal — ป๊อป "ระบบช่วยเดาแท็ก" (ของกลาง · เจ้าของเลือก 2026-11-15)
 *
 * ระบบเดาแท็กให้สินค้าที่ยังไม่มี แล้วให้คนยืนยัน "ทีละกลุ่ม" (ไม่ต้องไล่ทีละตัว)
 *   แน่นอน     = ก๊อปจากช่องแบรนด์/หมวดหมู่ที่มีอยู่แล้ว → กด "ใส่ทั้งกลุ่ม" แล้วกด ✗ ตัวที่ไม่ใช่ได้
 *   มั่นใจสูง  = รหัส/คำในชื่อชัด (ZIP → ซิป, LEA → หนัง, พียู → PU, หัวเข็มขัด → อะไหล่)
 *   ควรเช็ก    = ติ๊กเลือกทีละตัว (ผ้า, สาย/เทป, ตัวเสริม)
 *   ต้องสร้างแท็กก่อน = ยังไม่มีแท็กในระบบ (ด้าย, บรรจุภัณฑ์ …) — สร้างในคลังแท็กแล้วกดโหลดใหม่
 * ข้อมูล/บันทึก: /api/product-tags/suggest (คำนวณใหม่ตอนบันทึก · เคารพกลุ่มเลือกได้ 1 · audit) · กฎ: lib/tag-suggest-rules
 * ใช้ที่: หน้า Tags Manager (/master/tags-manager) ปุ่ม "ระบบช่วยเดาแท็ก" · ไม่ใช้ AI
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";

export type TagSuggestEntity = "skus" | "parent-skus";
type Conf = "sure" | "high" | "check" | "new";
type Item = { id: string; code: string; name: string; image: string | null; tag_id: string; tag: string; reason: string };
type Group = { key: string; label: string; tag: string; conf: Conf; count: number; items: Item[]; missing_tag: boolean };
type Data = { entity: TagSuggestEntity; scanned: number; groups: Group[]; unmatched: { kind: string; name: string; count: number }[]; item_cap: number };

const CONF: Record<Conf, { label: string; cls: string }> = {
  sure: { label: "แน่นอน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  high: { label: "มั่นใจสูง", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  check: { label: "ควรเช็ก", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  new: { label: "ต้องสร้างแท็กก่อน", cls: "bg-slate-50 text-slate-500 border-dashed border-slate-300" },
};
const PAGE = 40;
const BIG = 1000;   // ใส่เยอะกว่านี้ = พิมพ์ "ยืนยัน" ก่อน
const fmt = (n: number) => n.toLocaleString("th-TH");
const thumb = (k: string | null) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}&w=96` : null);
const toggleIn = (m: Record<string, Set<string>>, key: string, id: string) => {
  const s = new Set(m[key] ?? []);
  if (s.has(id)) s.delete(id); else s.add(id);
  return { ...m, [key]: s };
};

export function TagSuggestModal({ open, onClose, entity, onDone }: {
  open: boolean; onClose: () => void; entity: TagSuggestEntity; onDone?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [on, setOn] = useState<Set<string>>(new Set());                    // กลุ่มที่กด "ใส่ทั้งกลุ่ม"
  const [off, setOff] = useState<Record<string, Set<string>>>({});         // ✗ รายตัวในกลุ่มที่ใส่ทั้งกลุ่ม
  const [inc, setInc] = useState<Record<string, Set<string>>>({});         // ติ๊กรายตัว (กลุ่มควรเช็ก)
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null); setData(null); setOn(new Set()); setOff({}); setInc({}); setOpenKey(null);
    try {
      const r = await apiFetch(`/api/product-tags/suggest?entity=${entity}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error || !j.data) throw new Error(j.error ?? `โหลดคำแนะนำไม่สำเร็จ (${r.status})`);
      setData(j.data as Data);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดคำแนะนำไม่สำเร็จ"); }
  }, [entity]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const groups = useMemo(() => (data?.groups ?? []).filter((g) => g.count > 0), [data]);
  const countOf = useCallback((g: Group) => (g.conf === "check" ? inc[g.key]?.size ?? 0 : on.has(g.key) ? g.count - (off[g.key]?.size ?? 0) : 0), [inc, on, off]);
  const total = useMemo(() => groups.reduce((n, g) => n + countOf(g), 0), [groups, countOf]);
  const highGroups = groups.filter((g) => (g.conf === "sure" || g.conf === "high") && !on.has(g.key));
  const highTotal = highGroups.reduce((n, g) => n + g.count, 0);
  const dirty = total > 0;

  const save = async () => {
    type Pick = { key: string; mode: "all" | "only"; include?: string[]; exclude?: string[] };
    const picks = groups.flatMap((g): Pick[] => g.conf === "check"
      ? (inc[g.key]?.size ? [{ key: g.key, mode: "only", include: [...inc[g.key]] }] : [])
      : on.has(g.key) ? [{ key: g.key, mode: "all", exclude: [...(off[g.key] ?? [])] }] : []);
    if (!picks.length) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/product-tags/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, picks }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error ?? `บันทึกไม่สำเร็จ (${r.status})`);
      const d = j.data as { linked: number; blocked: number };
      toast.success(`ใส่แท็กแล้ว ${fmt(d.linked)} รายการ${d.blocked ? ` · ข้าม ${fmt(d.blocked)} (มีแท็กในกลุ่ม “เลือกได้ 1” อยู่แล้ว)` : ""}`);
      setAsk(false); onDone?.(); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const confirmMsg = groups.filter((g) => countOf(g) > 0).map((g) => `${g.conf === "sure" ? g.label : g.tag} ${fmt(countOf(g))}`).join(" · ")
    + " — แท็กเดิมของแต่ละตัวยังอยู่ครบ · เอาออกทีหลังได้ที่ตะกร้า (กด ✕ ที่แท็ก)";

  return (
    <ERPModal open={open} onClose={onClose} title={`ระบบช่วยเดาแท็ก (${entity === "skus" ? "SKU" : "Parent SKU"})`} size="xl" storageKey="tag-suggest"
      hasUnsavedChanges={dirty}
      description="ระบบเดาจากรหัส ชื่อ และข้อมูลของ Parent — ตรวจทีละกลุ่ม กด ✗ ตัวที่ไม่ใช่ แล้วกดบันทึก (ไม่ใช้ AI ไม่มีค่าใช้จ่าย)"
      footer={<div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-slate-500">{data ? `จะใส่แท็ก ${fmt(total)} รายการ` : ""}</span>
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ปิด</button>
        <button type="button" disabled={!total || saving} onClick={() => setAsk(true)}
          className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">บันทึก: ใส่แท็ก {fmt(total)} รายการ</button>
      </div>}>
      {err ? <ErrorState title="โหลดคำแนะนำไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !data ? <LoadingState label="กำลังดูสินค้าที่ยังไม่มีแท็ก…" />
        : groups.length === 0 ? <div className="py-10 text-center text-[13px] text-slate-500">ไม่มีอะไรให้เดาแล้ว — สินค้าที่เดาได้มีแท็กครบแล้ว</div>
        : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-slate-500">
              <span>ดูสินค้า {fmt(data.scanned)} ตัว · เดาได้ {groups.length} กลุ่ม</span>
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 hover:bg-slate-50"><Icon value="i:refresh" /> โหลดใหม่</button>
              {highGroups.length > 0 && (
                <button type="button" onClick={() => setOn((p) => new Set([...p, ...highGroups.map((g) => g.key)]))}
                  className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                  <Icon value="i:checks" /> ยอมรับทุกกลุ่ม “แน่นอน + มั่นใจสูง” ({fmt(highTotal)} รายการ)
                </button>
              )}
            </div>
            {data.unmatched.length > 0 && (
              <p className="text-[12px] text-slate-500 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5">
                <Icon value="i:info-circle" /> ยังไม่มีแท็กชื่อนี้ (สร้างในคลังแท็กแล้วกดโหลดใหม่ ระบบจะเดาให้):{" "}
                {data.unmatched.slice(0, 8).map((u) => `${u.kind === "category" ? "หมวด " : ""}${u.name} ${fmt(u.count)}`).join(" · ")}
              </p>
            )}
            {groups.map((g) => {
              const isOpen = openKey === g.key, accepted = on.has(g.key), c = CONF[g.conf];
              const offSet = off[g.key], incSet = inc[g.key];
              return (
                <div key={g.key} className={`rounded-xl border overflow-hidden ${accepted ? "border-emerald-300" : "border-slate-200"}`}>
                  <div className={`flex items-center gap-2 flex-wrap px-3 py-2 ${accepted ? "bg-emerald-50/60" : "bg-slate-50"}`}>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded border ${c.cls}`}>{c.label}</span>
                    <span className="text-[13px] text-slate-700 min-w-0">{g.label}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">{g.tag}</span>
                    <span className="ml-auto text-[13px] font-medium text-slate-700 whitespace-nowrap">{fmt(g.count)} {entity === "skus" ? "ตัว" : "Parent"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-t border-slate-100">
                    <button type="button" onClick={() => { setOpenKey(isOpen ? null : g.key); setShown(PAGE); }}
                      className="inline-flex items-center gap-1 h-7 px-2.5 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50">
                      <span className={`inline-flex transition-transform ${isOpen ? "rotate-180" : ""}`}><Icon value="i:chevron-down" /></span> {isOpen ? "ซ่อน" : "ดูรายการ"}
                    </button>
                    {(g.conf === "sure" || g.conf === "high") && (accepted
                      ? <button type="button" onClick={() => setOn((p) => { const n = new Set(p); n.delete(g.key); return n; })}
                          className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิกกลุ่มนี้</button>
                      : <button type="button" onClick={() => setOn((p) => new Set([...p, g.key]))}
                          className="inline-flex items-center gap-1 h-7 px-2.5 text-[12px] rounded-md border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50"><Icon value="i:check" /> ใส่ทั้งกลุ่ม</button>)}
                    {accepted && <span className="text-[12px] text-emerald-700">จะใส่ {fmt(countOf(g))}{offSet?.size ? ` · ไม่ใช่ ${fmt(offSet.size)}` : ""}</span>}
                    {g.conf === "check" && <span className="text-[12px] text-amber-700">ติ๊กเลือกทีละตัว · ติ๊กแล้ว {fmt(incSet?.size ?? 0)}</span>}
                    {g.conf === "new" && <span className="text-[12px] text-slate-500">ยังไม่มีแท็ก “{g.tag}” — สร้างในคลังแท็กด้านบนก่อน แล้วกดโหลดใหม่</span>}
                  </div>
                  {isOpen && (
                    <div className="p-2 border-t border-slate-100">
                      {g.conf === "check" && (
                        <div className="flex gap-2 mb-2">
                          <button type="button" onClick={() => setInc((m) => ({ ...m, [g.key]: new Set(g.items.slice(0, shown).map((i) => i.id)) }))} className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50">ติ๊กทุกตัวที่แสดง</button>
                          <button type="button" onClick={() => setInc((m) => ({ ...m, [g.key]: new Set() }))} className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50">เอาออกทั้งหมด</button>
                        </div>
                      )}
                      <div className="grid gap-1.5 sm:grid-cols-2 max-h-[45vh] overflow-y-auto pr-1">
                        {g.items.slice(0, shown).map((it) => {
                          const canTick = g.conf === "check" || accepted;
                          const ticked = g.conf === "check" ? !!incSet?.has(it.id) : accepted && !offSet?.has(it.id);
                          const src = thumb(it.image);
                          return (
                            <label key={it.id} className={`flex items-center gap-2 p-1.5 rounded-lg border text-[13px] ${!canTick ? "border-slate-200 cursor-default" : ticked ? "border-emerald-200 bg-emerald-50/40 cursor-pointer" : "border-slate-200 cursor-pointer opacity-70"}`}>
                              {canTick && g.conf !== "new" && (
                                <input type="checkbox" checked={ticked} className="accent-emerald-600"
                                  onChange={() => (g.conf === "check" ? setInc((m) => toggleIn(m, g.key, it.id)) : setOff((m) => toggleIn(m, g.key, it.id)))} />
                              )}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {src ? <img src={src} alt="" loading="lazy" className="w-9 h-9 rounded object-cover bg-slate-50 shrink-0" /> : <span className="w-9 h-9 rounded bg-slate-100 shrink-0" />}
                              <span className="min-w-0 flex-1">
                                <code className="block text-[11px] text-slate-500">{it.code}</code>
                                <span className="block truncate text-slate-700" title={it.name}>{it.name || "—"}</span>
                                <span className="block truncate text-[11px] text-slate-400">{it.reason}</span>
                              </span>
                              {g.conf === "sure" && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">{it.tag}</span>}
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[12px] text-slate-500 flex-wrap">
                        <span>แสดง {fmt(Math.min(shown, g.items.length))} จาก {fmt(g.count)} (เรียงตามรหัส)</span>
                        {shown < g.items.length && <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-7 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50">แสดงเพิ่ม</button>}
                        {g.count > g.items.length && <span>· {g.conf === "check" ? "ติ๊กได้เฉพาะตัวที่แสดง" : `ตัวที่เหลือ ${fmt(g.count - g.items.length)} ตัวจะใส่ตามกฎเดียวกัน`}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <ConfirmDialog open={ask} onClose={() => setAsk(false)} onConfirm={() => void save()} loading={saving}
        title={`ใส่แท็ก ${fmt(total)} รายการ?`} message={confirmMsg} confirmText="ใส่แท็ก"
        requireTyped={total >= BIG ? "ยืนยัน" : undefined} />
    </ERPModal>
  );
}
