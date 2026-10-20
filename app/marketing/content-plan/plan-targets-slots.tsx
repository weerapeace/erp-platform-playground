"use client";

/**
 * วางแผนคอนเทนต์ ก้อน 2 — เป้ารายเดือน + สล็อตประจำสัปดาห์
 *   TargetsEditor / SlotsEditor  = แท็บในหน้าตั้งค่า (ต่อแบรนด์) เพิ่ม/แก้/ลบ
 *   TargetsPanel                = "🎯 เป้าเดือนนี้" บนหน้าแผน (วางแล้ว x/y · โพสต์แล้ว · ขาดอีก)
 *   GenerateModal               = "⚡ สร้างแผนจากสล็อต" พรีวิวก่อนสร้าง แล้วค่อยยืนยัน
 * ของกลาง: ERPModal · ConfirmDialog · PlatformIcon · POST_TYPES · Toast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "@/components/i18n";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { POST_TYPES, type BrandOption, type ContentItem } from "@/app/tasks/data";
import { labelName, type MarketingSkuLabel } from "@/lib/marketing/sku-list";
import { WEEKDAYS_TH, targetProgress, shortThaiDate, dowLabel, type PlanTarget, type PlanSlot, type SlotDraft, type PlacementType } from "@/lib/marketing/content-plan";
import type { PlatformOpt } from "./plan-modal";

const TYPE_META = Object.fromEntries(POST_TYPES.map((t) => [t.value, t]));
/** ป้ายประเภทการลงของเป้า เช่น "🏪 แต่งร้าน" · ไม่ระบุ = "" (ทุกประเภท) */
const placementLabel = (key: string | null | undefined, types: PlacementType[]) => {
  if (!key) return "";
  const t = types.find((x) => x.key === key);
  return t ? `${t.icon ? `${t.icon} ` : ""}${t.label}` : `${key} (ถูกลบแล้ว)`;
};
const input = "h-9 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

async function call(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  const r = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
  return j.data;
}

/** เลือกแบรนด์ (ใช้หัวแท็บเป้า/สล็อต) */
export function BrandSelect({ brands, value, onChange }: { brands: BrandOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      แบรนด์
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${input} min-w-[12rem]`}>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}

// ═══════════ เป้ารายเดือน (ตั้งค่า) ═══════════
const EMPTY_TARGET = { placement_type: "", platform: "", post_type: "", monthly_count: "" };

export function TargetsEditor({ brandId, platforms, placementTypes = [], canEdit, onChanged }: { brandId: string; platforms: PlatformOpt[]; placementTypes?: PlacementType[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<PlanTarget[] | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});   // id → จำนวนที่แก้ (ยังไม่บันทึก)
  const [add, setAdd] = useState(EMPTY_TARGET);
  /** ช่องทางที่เลือกได้ = ของประเภทการลงนั้น (ถ้าเลือกประเภท) ไม่งั้นทุกช่องทาง — เหมือนแท็บรอบเปลี่ยน */
  const addType = placementTypes.find((x) => x.key === add.placement_type);
  const addPlatforms = addType ? addType.platforms.map((k) => platforms.find((p) => p.value === k) ?? { value: k, label: k }) : platforms;
  const [del, setDel] = useState<PlanTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const pfLabel = (k: string) => platforms.find((p) => p.value === k)?.label ?? k;

  const load = useCallback(async () => {
    if (!brandId) return;
    try { const j = await apiFetch(`/api/marketing/content-plan/targets?brand_id=${brandId}`).then((r) => r.json()); setRows((j.data ?? []) as PlanTarget[]); setEdit({}); }
    catch { setRows([]); }
  }, [brandId]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const addRow = () => {
    if (!add.platform) { toast.warning("เลือกช่องทาง"); return; }
    void run(() => call("POST", "/api/marketing/content-plan/targets", { brand_id: brandId, placement_type: add.placement_type || null, platform: add.platform, post_type: add.post_type || null, monthly_count: Number(add.monthly_count) }), "เพิ่มเป้าแล้ว")
      .then(() => setAdd(EMPTY_TARGET));
  };

  if (!rows) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">จำนวนโพสต์ที่อยากได้ต่อเดือน (ใช้ซ้ำทุกเดือน) — หน้าแผนจะโชว์ว่า "วางแล้วกี่ชิ้น / ขาดอีกกี่ชิ้น" · ระบุรูปแบบได้ เช่น IG ทั้งหมด 20 และในนั้นเป็น Reels 8 · เลือกประเภทได้ เช่น 🏪 แต่งร้าน · Shopee เดือนละ 2 (นับเฉพาะคอนเทนต์ที่ติ๊ก &quot;ลงที่ไหน&quot; ตรงประเภท + ช่องทาง)</p>
      {rows.length === 0 && <div className="rounded-lg bg-slate-50 py-4 text-center text-sm text-slate-400">ยังไม่มีเป้าของแบรนด์นี้</div>}
      {rows.map((t) => {
        const v = edit[t.id] ?? String(t.monthly_count);
        const changed = v !== String(t.monthly_count);
        return (
          <div key={t.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 ${changed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
            <PlatformIcon code={t.platform} iconKey={platforms.find((p) => p.value === t.platform)?.icon_key ?? platforms.find((p) => p.value === t.platform)?.icon} size={16} />
            {t.placement_type && <span className="text-sm text-slate-600">{placementLabel(t.placement_type, placementTypes)} ·</span>}
            <span className="text-sm font-medium text-slate-700">{pfLabel(t.platform)}</span>
            <span className="text-xs text-slate-500">{t.post_type ? `${TYPE_META[t.post_type]?.icon ?? ""} ${TYPE_META[t.post_type]?.label ?? t.post_type}` : "ทุกรูปแบบ"}</span>
            <span className="ml-auto text-xs text-slate-500">เดือนละ</span>
            <input value={v} onChange={(e) => setEdit((m) => ({ ...m, [t.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }))} disabled={!canEdit} inputMode="numeric" className={`${input} w-16 text-right`} />
            <span className="text-xs text-slate-500">ชิ้น</span>
            {canEdit && (
              <>
                <button type="button" disabled={!changed || busy} onClick={() => void run(() => call("PATCH", "/api/marketing/content-plan/targets", { id: t.id, monthly_count: Number(v) }), "บันทึกเป้าแล้ว")}
                  className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">บันทึก</button>
                <button type="button" onClick={() => setDel(t)} disabled={busy} title="ลบเป้า" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
              </>
            )}
          </div>
        );
      })}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-2.5 py-2">
          <span className="text-xs font-medium text-slate-500">＋ เป้าใหม่</span>
          <select value={add.placement_type} className={input} title="ประเภทการลง (ตั้งรายการได้ที่แท็บช่องทาง)"
            onChange={(e) => { const t = placementTypes.find((x) => x.key === e.target.value); setAdd({ ...add, placement_type: e.target.value, ...(t && add.platform && !t.platforms.includes(add.platform) ? { platform: "" } : {}) }); }}>
            <option value="">ทุกประเภท</option>
            {placementTypes.map((t) => <option key={t.key} value={t.key}>{t.icon ? `${t.icon} ` : ""}{t.label}</option>)}
          </select>
          <select value={add.platform} onChange={(e) => setAdd({ ...add, platform: e.target.value })} className={input}>
            <option value="">— ช่องทาง —</option>
            {addPlatforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={add.post_type} onChange={(e) => setAdd({ ...add, post_type: e.target.value })} className={input}>
            <option value="">ทุกรูปแบบ</option>
            {POST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <input value={add.monthly_count} onChange={(e) => setAdd({ ...add, monthly_count: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="จำนวน" className={`${input} w-20 text-right`}
            onKeyDown={(e) => { if (e.key === "Enter") addRow(); }} />
          <span className="text-xs text-slate-500">ชิ้น/เดือน</span>
          <button type="button" onClick={addRow} disabled={busy || !add.platform || !add.monthly_count} className="ml-auto h-8 rounded-lg bg-slate-800 px-3 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-30">เพิ่มเป้า</button>
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" loading={busy} confirmText="ลบเป้า"
        title="ลบเป้านี้?" message={del ? `${del.placement_type ? `${placementLabel(del.placement_type, placementTypes)} · ` : ""}${pfLabel(del.platform)} · ${del.post_type ? TYPE_META[del.post_type]?.label ?? del.post_type : "ทุกรูปแบบ"} · เดือนละ ${del.monthly_count} ชิ้น (คอนเทนต์ไม่ถูกแตะ)` : ""}
        onConfirm={() => { const t = del; if (t) void run(() => call("DELETE", `/api/marketing/content-plan/targets?id=${t.id}`), "ลบเป้าแล้ว").then(() => setDel(null)); }} />
    </div>
  );
}

// ═══════════ สล็อตประจำสัปดาห์ (ตั้งค่า) ═══════════
type SlotDraftForm = { weekday: string; post_time: string; platform: string; post_type: string; pillar_id: string; title: string };
const EMPTY_SLOT: SlotDraftForm = { weekday: "0", post_time: "10:00", platform: "", post_type: "", pillar_id: "", title: "" };
const toForm = (s: PlanSlot): SlotDraftForm => ({ weekday: String(s.weekday), post_time: s.post_time, platform: s.platform, post_type: s.post_type ?? "", pillar_id: s.pillar_id ?? "", title: s.title });
const timeOk = (t: string) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t);
/** พิมพ์เวลาแบบง่าย: "1900" "19.00" "9" → 19:00 / 09:00 */
const normTime = (raw: string) => {
  const d = raw.replace(/[^\d]/g, "");
  if (!d) return raw;
  const h = d.length <= 2 ? Number(d) : Number(d.slice(0, d.length - 2));
  const mi = d.length <= 2 ? 0 : Number(d.slice(-2));
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : raw;
};

export function SlotsEditor({ brandId, platforms, pillars, canEdit, onChanged }: { brandId: string; platforms: PlatformOpt[]; pillars: MarketingSkuLabel[]; canEdit: boolean; onChanged: () => void }) {
  useLang();   // ฟังการสลับภาษา → ชื่อป้าย/แนว (labelName) เปลี่ยนตาม (หน้าแรกวาดเป็นไทยก่อน แล้วค่อยสลับ)
  const toast = useToast();
  const [rows, setRows] = useState<PlanSlot[] | null>(null);
  const [forms, setForms] = useState<Record<string, SlotDraftForm>>({});
  const [add, setAdd] = useState<SlotDraftForm>(EMPTY_SLOT);
  const [del, setDel] = useState<PlanSlot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const j = await apiFetch(`/api/marketing/content-plan/slots?brand_id=${brandId}`).then((r) => r.json());
      const list = (j.data ?? []) as PlanSlot[];
      setRows(list); setForms(Object.fromEntries(list.map((s) => [s.id, toForm(s)])));
    } catch { setRows([]); }
  }, [brandId]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); return true; } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };
  const payload = (f: SlotDraftForm) => ({ weekday: Number(f.weekday), post_time: f.post_time, platform: f.platform, post_type: f.post_type || null, pillar_id: f.pillar_id || null, title: f.title.trim() });
  const valid = (f: SlotDraftForm) => !!f.platform && !!f.title.trim() && timeOk(f.post_time);

  // ⚠️ เป็นฟังก์ชันเรียกตรง (ไม่ใช่ component) — ถ้าประกาศเป็น component ในนี้ ช่องพิมพ์จะหลุดโฟกัสทุกตัวอักษร
  const renderFields = (f: SlotDraftForm, set: (p: Partial<SlotDraftForm>) => void, disabled: boolean) => (
    <>
      <select value={f.weekday} onChange={(e) => set({ weekday: e.target.value })} disabled={disabled} className={`${input} w-28`}>
        {WEEKDAYS_TH.map((d, i) => <option key={d} value={i}>ทุก{d}</option>)}
      </select>
      <input value={f.post_time} onChange={(e) => set({ post_time: e.target.value })} onBlur={(e) => set({ post_time: normTime(e.target.value) })} disabled={disabled}
        inputMode="numeric" placeholder="19:00" title="เวลาแบบ 24 ชม." className={`${input} w-[4.5rem] text-center ${timeOk(f.post_time) ? "" : "border-red-300"}`} />
      <select value={f.platform} onChange={(e) => set({ platform: e.target.value })} disabled={disabled} className={`${input} w-32`}>
        <option value="">— ช่องทาง —</option>
        {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <select value={f.post_type} onChange={(e) => set({ post_type: e.target.value })} disabled={disabled} className={`${input} w-28`}>
        <option value="">รูปแบบ…</option>
        {POST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
      </select>
      <select value={f.pillar_id} onChange={(e) => set({ pillar_id: e.target.value })} disabled={disabled} className={`${input} w-32`}>
        <option value="">แนว…</option>
        {pillars.filter((p) => p.is_active || p.id === f.pillar_id).map((p) => <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ""}{labelName(p)}</option>)}
      </select>
      <input value={f.title} onChange={(e) => set({ title: e.target.value })} disabled={disabled} maxLength={200} placeholder="หัวข้อ เช่น สินค้าใหม่ประจำสัปดาห์"
        className={`${input} min-w-[12rem] flex-1`} />
    </>
  );

  if (!rows) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">ตั้งครั้งเดียว เช่น "ทุกจันทร์ 19:00 IG Reels สินค้าใหม่" แล้วกด "⚡ สร้างแผนจากสล็อต" ที่หน้าแผน ระบบจะลงไอเดียให้ครบทุกสัปดาห์ของเดือน (กดซ้ำได้ ไม่สร้างซ้ำ)</p>
      {rows.length === 0 && <div className="rounded-lg bg-slate-50 py-4 text-center text-sm text-slate-400">ยังไม่มีสล็อตของแบรนด์นี้</div>}
      {rows.map((s) => {
        const f = forms[s.id] ?? toForm(s);
        const changed = JSON.stringify(f) !== JSON.stringify(toForm(s));
        return (
          <div key={s.id} className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${changed ? "border-amber-300 bg-amber-50/40" : s.is_active ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50 opacity-70"}`}>
            {renderFields(f, (p) => setForms((m) => ({ ...m, [s.id]: { ...(m[s.id] ?? toForm(s)), ...p } })), !canEdit)}
            {canEdit && (
              <div className="flex items-center gap-1">
                <button type="button" title={s.is_active ? "ปิดสล็อตชั่วคราว (ไม่สร้างในแผน)" : "เปิดสล็อต"} disabled={busy}
                  onClick={() => void run(() => call("PATCH", "/api/marketing/content-plan/slots", { id: s.id, is_active: !s.is_active }), s.is_active ? "ปิดสล็อตแล้ว" : "เปิดสล็อตแล้ว")}
                  className={`h-8 rounded-lg px-2 text-xs ${s.is_active ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-500 hover:bg-slate-100"}`}>{s.is_active ? "● เปิด" : "○ ปิด"}</button>
                <button type="button" disabled={!changed || !valid(f) || busy} onClick={() => void run(() => call("PATCH", "/api/marketing/content-plan/slots", { id: s.id, ...payload(f) }), "บันทึกสล็อตแล้ว")}
                  className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">บันทึก</button>
                <button type="button" onClick={() => setDel(s)} disabled={busy} title="ลบสล็อต" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
              </div>
            )}
          </div>
        );
      })}
      {canEdit && (
        <div className="space-y-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-2">
          <div className="text-xs font-medium text-slate-500">＋ สล็อตใหม่</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {renderFields(add, (p) => setAdd((x) => ({ ...x, ...p })), busy)}
            <button type="button" disabled={busy || !valid(add)}
              onClick={() => void run(() => call("POST", "/api/marketing/content-plan/slots", { brand_id: brandId, ...payload(add) }), "เพิ่มสล็อตแล้ว").then((ok) => { if (ok) setAdd({ ...EMPTY_SLOT, weekday: add.weekday, post_time: add.post_time }); })}
              className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-30">เพิ่มสล็อต</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" loading={busy} confirmText="ลบสล็อต"
        title="ลบสล็อตนี้?" message={del ? `ทุก${WEEKDAYS_TH[del.weekday]} ${del.post_time} · ${del.title} — ไอเดียที่เคยสร้างจากสล็อตนี้ยังอยู่ในแผนตามเดิม (แค่ไม่สร้างเพิ่ม)` : ""}
        onConfirm={() => { const s = del; if (s) void run(() => call("DELETE", `/api/marketing/content-plan/slots?id=${s.id}`), "ลบสล็อตแล้ว").then(() => setDel(null)); }} />
    </div>
  );
}

// ═══════════ 🎯 เป้าเดือนนี้ (หน้าแผน) ═══════════
export function TargetsPanel({ targets, items, month, brandTab, brands, platforms, placementTypes = [], onSetup, canSetup }: {
  targets: PlanTarget[]; items: ContentItem[]; month: string; brandTab: string; brands: BrandOption[]; platforms: PlatformOpt[]; placementTypes?: PlacementType[];
  onSetup: () => void; canSetup: boolean;
}) {
  const [open, setOpen] = useState(true);
  const list = useMemo(() => targets.filter((t) => !brandTab || t.brand_id === brandTab), [targets, brandTab]);
  const rows = useMemo(() => list.map((t) => ({ t, ...targetProgress(t, items, month) })), [list, items, month]);
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
  const pf = (k: string) => platforms.find((p) => p.value === k);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long" });
  const totalT = rows.reduce((a, r) => a + r.t.monthly_count, 0), totalP = rows.reduce((a, r) => a + Math.min(r.planned, r.t.monthly_count), 0);

  if (!rows.length) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
        🎯 ยังไม่ได้ตั้งเป้ารายเดือน{brandTab ? "ของแบรนด์นี้" : ""} — ตั้งแล้วจะเห็นว่าแต่ละช่องทางวางแผนครบหรือยัง
        {canSetup && <button type="button" onClick={onSetup} className="font-medium text-blue-600 hover:underline">ตั้งเป้า →</button>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold text-slate-700">🎯 เป้าเดือน{monthLabel}</span>
        <span className="text-xs text-slate-500">วางแผนแล้ว {totalP}/{totalT} ชิ้น</span>
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-blue-500" style={{ width: `${totalT ? Math.min(100, (totalP / totalT) * 100) : 0}%` }} /></span>
        {canSetup && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onSetup(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSetup(); } }} className="ml-auto rounded px-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700">⚙️ แก้เป้า</span>}
        <span className={`${canSetup ? "" : "ml-auto"} text-xs text-slate-400`}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ t, planned, published }) => {
            const p = pf(t.platform);
            const short = Math.max(0, t.monthly_count - planned);
            const pct = Math.min(100, (planned / t.monthly_count) * 100);
            return (
              <div key={t.id} className="rounded-lg border border-slate-100 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <PlatformIcon code={t.platform} iconKey={p?.icon_key ?? p?.icon} size={14} />
                  {t.placement_type && <span className="text-slate-600">{placementLabel(t.placement_type, placementTypes)} ·</span>}
                  <span className="font-medium text-slate-700">{p?.label ?? t.platform}</span>
                  <span className="text-slate-400">{t.post_type ? `· ${TYPE_META[t.post_type]?.label ?? t.post_type}` : "· ทุกรูปแบบ"}</span>
                  {!brandTab && <span className="ml-auto truncate text-slate-400">{brandName(t.brand_id)}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full ${short === 0 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-700">{planned}/{t.monthly_count}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px]">
                  <span className="text-slate-400">โพสต์แล้ว {published}</span>
                  {short > 0 ? <span className="font-medium text-amber-700">ขาดอีก {short}</span> : <span className="font-medium text-emerald-700">ครบแล้ว ✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════ ⚡ สร้างแผนจากสล็อต (พรีวิว → ยืนยัน) ═══════════
type GenResult = { create: SlotDraft[]; skippedPast: number; skippedExisting: number; created: number };
export function GenerateModal({ open, brandId, brandName, month, platforms, pillars, onClose, onDone, onSetup }: {
  open: boolean; brandId: string; brandName: string; month: string; platforms: PlatformOpt[]; pillars: MarketingSkuLabel[];
  onClose: () => void; onDone: () => void; onSetup: () => void;
}) {
  const toast = useToast();
  const [res, setRes] = useState<GenResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!open) return;
    setRes(null); setErr(null);
    apiFetch("/api/marketing/content-plan/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, month, dry_run: true }) })
      .then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else setRes(j.data as GenResult); })
      .catch(() => setErr("โหลดไม่สำเร็จ กรุณาลองใหม่"));
  }, [open, brandId, month]);

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/marketing/content-plan/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, month, dry_run: false }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "สร้างแผนไม่สำเร็จ");
      toast.success(`ลงแผน ${j.data.created} ชิ้นแล้ว (ขั้นไอเดีย — เติมรายละเอียดต่อได้)`);
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างแผนไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const pf = (k: string) => platforms.find((p) => p.value === k);
  const pl = (id: string | null) => (id ? pillars.find((p) => p.id === id) : undefined);
  return (
    <ERPModal open={open} onClose={onClose} size="lg" defaultExpanded={false} title={`⚡ สร้างแผนจากสล็อต — ${brandName}`} description={`เดือน${monthLabel} · ตรวจรายการก่อนยืนยัน`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void confirm()} disabled={busy || !res || res.create.length === 0}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังสร้าง…" : `ลงแผน ${res?.create.length ?? 0} ชิ้น`}</button>
        </div>
      }>
      {err ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">{err}
          {err.includes("สล็อต") && <button type="button" onClick={onSetup} className="ml-2 font-medium text-blue-600 hover:underline">ตั้งสล็อต →</button>}
        </div>
      ) : !res ? (
        <div className="space-y-1.5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">จะสร้าง {res.create.length} ชิ้น</span>
            {res.skippedExisting > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">มีอยู่แล้ว {res.skippedExisting} (ข้าม)</span>}
            {res.skippedPast > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">วันที่ผ่านไปแล้ว {res.skippedPast} (ข้าม)</span>}
          </div>
          {res.create.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-4 text-center text-sm text-emerald-800">เดือนนี้ลงแผนจากสล็อตครบแล้ว ✓</div>
          ) : (
            <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {res.create.map((c) => {
                const p = pf(c.platform), pi = pl(c.pillar_id);
                return (
                  <div key={`${c.slot_id}|${c.date}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="w-24 whitespace-nowrap text-xs text-slate-500">{dowLabel(c.date)} {shortThaiDate(c.date)} {c.time}</span>
                    <PlatformIcon code={c.platform} iconKey={p?.icon_key ?? p?.icon} size={14} />
                    {c.post_type && <span className="text-xs">{TYPE_META[c.post_type]?.icon}</span>}
                    <span className="min-w-0 flex-1 truncate text-slate-700">{c.title}</span>
                    {pi && <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: pi.color }}>{pi.icon} {pi.name}</span>}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400">สร้างเป็นขั้น "💡 ไอเดีย" ลงวัน/เวลาตามสล็อต — กดการ์ดเพื่อเติมสินค้า/บรีฟ แล้วส่งเป็นงานได้ตามปกติ</p>
        </div>
      )}
    </ERPModal>
  );
}
