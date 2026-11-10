"use client";

/**
 * 💼 ตัวช่วยกล่อง "ค่าใช้จ่ายเพิ่ม" แท็บตีราคา (ใบงานออกแบบ) — เจ้าของขอ 2026-11-07
 *   useCostPresets      — โหลด/แก้ ราคากลาง (/api/design-sheets/cost-presets)
 *   LaborRefPicker      — ค่าแรงผลิต: ดูว่าสินค้าไหนเคยผลิตค่าแรงเท่าไหร่ (สูตรผลิต / จ่ายจริง / ใบงานก่อนหน้า) กดเลือกได้
 *   OverheadBreakdown   — ค่าโสหุ้ยแยกรายการ (QC / แพ็ก / ถุง / กล่อง / ค่าส่ง) จากขนาดสินค้าตอนแพ็ก
 *   OtherCostPicker     — ต้นทุนอื่นๆ: ติ๊กเลือกจากรายการกลาง
 *   CostPresetsManager  — ป๊อปตั้งค่าราคากลาง (เพิ่ม / แก้ / ลบ)
 *   CutRateByMaterial   — แท็บค่าตัดต่อชิ้น: ค่ากลาง + ตั้งรายวัตถุดิบ / ทั้งกลุ่ม + ตัวช่วยคิดจากค่าแรงต่อวัน
 *   OrderQtyBar         — แถบ "จำนวนที่สั่ง" บนแท็บตีราคา (ใส่ครั้งเดียว ใช้ทุกที่: หารจำนวนสั่ง · ค่าตัดทั้งล็อต · ต้นทุนทั้งล็อต)
 * คิดเลขอยู่ lib/design-cost-presets · ของกลาง: Popover · ERPModal · askConfirm · Icon
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@/components/popover";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import {
  cutLaborSummary, cutMaterialGroups, cutRateFromWage, DEFAULT_OH, ORDER_QTY_QUICK, stepOrderQty, groupCutRows, overheadRows, overheadTotal, PRESET_KIND_META, PRESET_KINDS,
  type CartonOption, type PackSuggestion, type CostPreset, type CutMaterial, type CutMaterialGroup, type CutRateSource, type CutRow, type LaborRef, type OverheadCfg, type PackDims, type PresetKind,
} from "@/lib/design-cost-presets";

const baht = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inCls = "h-8 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── ราคากลาง ──
export function useCostPresets(enabled: boolean) {
  const [presets, setPresets] = useState<CostPreset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const j = await apiFetch("/api/design-sheets/cost-presets").then((r) => r.json());
      if (Array.isArray(j?.data)) setPresets(j.data as CostPreset[]);
    } catch { /* เงียบ — กล่องยังใส่เองได้ */ }
    finally { setLoaded(true); }
  }, [enabled]);
  useEffect(() => { void reload(); }, [reload]);
  const save = useCallback(async (p: Partial<CostPreset> & { kind: PresetKind }): Promise<string | null> => {
    const res = await apiFetch(p.id ? `/api/design-sheets/cost-presets/${p.id}` : "/api/design-sheets/cost-presets", {
      method: p.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) return String(j?.error ?? "บันทึกไม่สำเร็จ");
    const row = j.data as CostPreset;
    setPresets((list) => (p.id ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
    return null;
  }, []);
  const remove = useCallback(async (id: string): Promise<string | null> => {
    const res = await apiFetch(`/api/design-sheets/cost-presets/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) return String(j?.error ?? "ลบไม่สำเร็จ");
    setPresets((list) => list.filter((x) => x.id !== id));
    return null;
  }, []);
  return { presets, loaded, reload, save, remove };
}
export type CostPresetsApi = ReturnType<typeof useCostPresets>;
export const presetsOf = (presets: CostPreset[], kind: PresetKind) => presets.filter((p) => p.kind === kind).sort((a, b) => a.sort_order - b.sort_order);

// ── ค่าแรงที่เคยผลิต ──
let refsCache: { at: number; data: Record<"bom" | "wo" | "ds", LaborRef[]> } | null = null;
const SRC: { key: "bom" | "wo" | "ds"; label: string; icon: string }[] = [
  { key: "bom", label: "สูตรผลิต", icon: "i:hierarchy-2" },
  { key: "wo", label: "จ่ายจริง", icon: "i:building-factory" },
  { key: "ds", label: "ใบงานก่อนหน้า", icon: "i:file-text" },
];

export function LaborRefPicker({ sheetId, onPick }: { sheetId?: string | null; onPick: (ref: LaborRef) => void }) {
  const [data, setData] = useState<Record<"bom" | "wo" | "ds", LaborRef[]> | null>(refsCache && Date.now() - refsCache.at < 5 * 60_000 ? refsCache.data : null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<"bom" | "wo" | "ds">("bom");
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    if (data) return;
    apiFetch(`/api/design-sheets/labor-refs${sheetId ? `?exclude=${encodeURIComponent(sheetId)}` : ""}`).then((r) => r.json()).then((j) => {
      const d = j?.data;
      if (j?.error || !d || !Array.isArray(d.bom) || !Array.isArray(d.wo) || !Array.isArray(d.ds)) { setErr(String(j?.error ?? "โหลดไม่สำเร็จ")); return; }
      refsCache = { at: Date.now(), data: d }; setData(d);
    }).catch(() => setErr("โหลดไม่สำเร็จ"));
  }, [data, sheetId]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.[src] ?? []).filter((r) => !s || `${r.code} ${r.name} ${r.note ?? ""}`.toLowerCase().includes(s)).slice(0, 150);
  }, [data, src, q]);
  return (
    <Popover align="right" panelClassName="w-[380px] max-w-[92vw]"
      trigger={(toggle, open) => (
        <button type="button" onClick={() => { load(); toggle(); }} title="ดูว่าสินค้าไหนเคยผลิตค่าแรงเท่าไหร่ แล้วกดเลือก"
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:history" className="text-[13px]" /> ดูที่เคยผลิต
        </button>
      )}>
      {(close) => (
        <div className="space-y-2 p-2">
          <div className="flex flex-wrap gap-1">
            {SRC.map((s) => (
              <button key={s.key} type="button" onClick={() => setSrc(s.key)}
                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${src === s.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                <Icon value={s.icon} className="text-[12px]" /> {s.label} <span className="opacity-70">{data?.[s.key].length ?? "…"}</span>
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสรุ่น / ชื่อสินค้า" className={`${inCls} w-full`} autoFocus />
          <div className="max-h-[320px] overflow-y-auto">
            {err ? <p className="p-3 text-center text-xs text-rose-600">{err}</p>
              : !data ? <p className="p-3 text-center text-xs text-slate-400">กำลังโหลด…</p>
              : list.length === 0 ? <p className="p-3 text-center text-xs text-slate-400">ไม่พบ</p>
              : list.map((r, i) => (
                <button key={`${r.code}-${i}`} type="button" onClick={() => { onPick(r); close(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  <HoverImage url={r.image ?? null} size={40} previewSize={260} alt={r.name} rounded="rounded-md" fallback="—" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-800"><b className="font-semibold">{r.code}</b> <span className="text-slate-500">{r.name !== r.code ? r.name : ""}</span></span>
                    <span className="block truncate text-[11px] text-slate-400">{[r.note, r.at].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">{baht(r.amount)}</span>
                </button>
              ))}
          </div>
          <p className="px-1 text-[11px] text-slate-400">กดรายการ = ใส่ค่าแรงนั้น + จดไว้ว่าอ้างอิงจากอะไร</p>
        </div>
      )}
    </Popover>
  );
}

// ── ค่าโสหุ้ยแยกรายการ ──
export function OverheadBreakdown({ cfg, presets, tabLabel, readOnly, qty, suggestions = [], onChange, onManage }: {
  cfg: OverheadCfg;
  presets: CostPreset[];
  tabLabel: string;
  readOnly: boolean;
  /** จำนวนที่สั่ง (แถบด้านบน) — ใช้นับว่าต้องใช้กี่ลัง และคิดค่าส่งต่อชิ้นจากจำนวนลังจริง */
  qty?: number | null;
  /** ขนาดที่ระบบรู้ (ขนาดสินค้า / กล่องส่ง / ชิ้นใหญ่สุด) — เลือกแล้วเติมช่องขนาดให้ */
  suggestions?: PackSuggestion[];
  onChange: (cfg: OverheadCfg, total: number) => void;
  onManage?: () => void;
}) {
  const rows = overheadRows(cfg, presets, qty);
  const total = overheadTotal(rows);
  const set = (next: OverheadCfg) => onChange(next, overheadTotal(overheadRows(next, presets, qty)));
  const setDim = (k: keyof PackDims, v: string) => {
    const n = v === "" ? null : Number(v);
    set({ ...cfg, dims: { ...cfg.dims, [k]: n != null && Number.isFinite(n) && n > 0 ? n : null } });
  };
  const toggle = (key: string, on: boolean) => set({ ...cfg, off: on ? cfg.off.filter((k) => k !== key) : [...cfg.off, key] });
  const dimIn = (k: keyof PackDims, ph: string, w = "w-12") => (
    <input type="number" min={0} step="any" value={cfg.dims[k] ?? ""} placeholder={ph} disabled={readOnly} aria-label={ph}
      onChange={(e) => setDim(k, e.target.value)} className={`h-6 ${w} rounded border border-slate-200 px-1 text-right text-xs tabular-nums disabled:bg-slate-50`} />
  );
  const noPresets = !presets.some((p) => p.kind === "oh_fixed" || p.kind === "bag" || p.kind === "box" || p.kind === "carton" || p.kind === "parcel");
  const q = qty != null && qty > 0 ? Math.round(qty) : 0;
  const sz = (o: CartonOption) => `${o.preset.w_cm}×${o.preset.l_cm}×${o.preset.h_cm}`;
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-1 text-slate-600">
        <span className="w-12 text-[11px] text-slate-400" title={`ขนาดสินค้าตอนแพ็ก (${tabLabel})`}>ขนาด</span>
        {dimIn("w", "กว้าง")}×{dimIn("l", "ยาว")}×{dimIn("t", "หนา")}<span className="text-slate-400">ซม. ·</span>{dimIn("g", "กรัม", "w-14")}<span className="text-slate-400">ก.</span>
        {!readOnly && suggestions.length > 0 && (
          <select value="" aria-label="เลือกขนาดที่คำนวณได้" onChange={(e) => { const sgg = suggestions.find((x) => x.key === e.target.value); if (sgg) set({ ...cfg, dims: { w: sgg.dims.w, l: sgg.dims.l, t: sgg.dims.t ?? cfg.dims.t, g: sgg.dims.g ?? cfg.dims.g } }); }}
            className="h-6 max-w-[16rem] rounded border border-blue-200 bg-blue-50 px-1 text-xs text-blue-700">
            <option value="">เลือกขนาดที่คำนวณได้ ▾</option>
            {suggestions.map((x) => <option key={x.key} value={x.key}>{x.label} · {[x.dims.w, x.dims.l, x.dims.t].map((v) => v ?? "?").join("×")}{x.dims.g ? ` · ${x.dims.g} ก.` : ""}</option>)}
          </select>
        )}
      </div>
      {noPresets ? (
        <p className="text-[11px] text-amber-700">ยังไม่ได้ตั้งราคากลางของโสหุ้ย (QC / ถุง / กล่อง / ลังส่ง){onManage ? <> — <button type="button" onClick={onManage} className="underline">ตั้งค่าราคากลาง</button></> : null}</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-100 bg-white">
          {rows.map((r) => (
            <div key={r.key} className={`flex items-center gap-1.5 px-1.5 py-1 ${r.on ? "" : "opacity-50"}`}>
              {!readOnly && <input type="checkbox" checked={r.on} onChange={(e) => toggle(r.key, e.target.checked)} aria-label={`นับ ${r.label}`} className="h-3.5 w-3.5 shrink-0" />}
              <span className="shrink-0 text-slate-700">{r.label}</span>
              {r.key === "ship" && r.cartons && r.cartons.some((o) => o.perCarton > 0) ? (
                <select value={cfg.carton && r.cartons.some((o) => o.preset.id === cfg.carton && o.perCarton > 0) ? cfg.carton : ""} disabled={readOnly} aria-label="เลือกลังส่ง"
                  onChange={(e) => set({ ...cfg, carton: e.target.value || null })}
                  className="h-6 min-w-0 max-w-[15rem] rounded border border-slate-200 px-1 text-xs disabled:bg-slate-50">
                  <option value="">อัตโนมัติ (คุ้มสุด)</option>
                  {r.cartons.map((o) => (
                    <option key={o.preset.id} value={o.preset.id} disabled={!(o.perCarton > 0)}>
                      {sz(o)} · {o.perCarton > 0 ? `${o.perCarton}/ลัง${q ? ` · ${o.cartons} ลัง` : ""} · ${baht(o.perUnit)}/ชิ้น` : "ใส่ไม่ได้"}{o.preset.id === r.bestCarton ? " · คุ้มสุด" : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              <span className={`min-w-0 flex-1 truncate text-[11px] ${r.warn ? "text-rose-600" : "text-slate-400"}`} title={r.detail}>{r.detail}</span>
              <span className="shrink-0 tabular-nums text-slate-800">{baht(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {!readOnly && <>
          <span className="text-[11px] text-slate-400">ค่าส่ง</span>
          {([["carton", "ลังส่ง"], ["parcel", "รายชิ้น"], ["none", "ไม่คิด"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ ...cfg, ship: k })}
              className={`h-6 rounded border px-1.5 text-[11px] ${cfg.ship === k ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </>}
        {q > 0 && (() => { const bag = rows.find((r) => r.key === "bag" && r.on && r.amount > 0); return bag ? <span className="text-[11px] text-slate-400">· ถุง {q.toLocaleString("th-TH")} ใบ = {Math.round(bag.amount * q).toLocaleString("th-TH")} ฿</span> : null; })()}
        <span className="ml-auto text-slate-500">รวมโสหุ้ย <b className="tabular-nums text-emerald-700">{baht(total)}</b> ฿/ชิ้น</span>
        {onManage && <button type="button" onClick={onManage} className="text-[11px] text-slate-400 underline hover:text-blue-700">ราคากลาง</button>}
      </div>
    </div>
  );
}

export const ohCfgOf = (raw: OverheadCfg | null | undefined): OverheadCfg => raw ?? DEFAULT_OH;

// ── ต้นทุนอื่นๆ: เลือกจากรายการกลาง ──
export function OtherCostPicker({ presets, onAdd, onManage }: { presets: CostPreset[]; onAdd: (items: CostPreset[]) => void; onManage?: () => void }) {
  const others = presetsOf(presets, "other");
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <Popover align="right" panelClassName="w-[320px] max-w-[92vw]"
      trigger={(toggle, open) => (
        <button type="button" onClick={() => { setSel(new Set()); toggle(); }}
          className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:list-check" className="text-[13px]" /> เลือกต้นทุนอื่นๆ
        </button>
      )}>
      {(close) => (
        <div className="space-y-2 p-2">
          {others.length === 0 ? (
            <p className="p-2 text-center text-xs text-slate-400">ยังไม่มีรายการ{onManage ? <> — <button type="button" onClick={() => { close(); onManage(); }} className="text-blue-700 underline">เพิ่มรายการ</button></> : null}</p>
          ) : (
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
              {others.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-1 py-1.5 text-[13px]">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">{p.label}{p.mode === "split" && <span className="text-[11px] text-slate-400"> · หารจำนวนสั่ง</span>}</span>
                  <span className="shrink-0 tabular-nums text-slate-700">{baht(p.amount)}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {onManage && <button type="button" onClick={() => { close(); onManage(); }} className="text-[11px] text-slate-500 underline hover:text-blue-700">จัดการรายการ</button>}
            <button type="button" disabled={sel.size === 0} onClick={() => { onAdd(others.filter((p) => sel.has(p.id))); close(); }}
              className="ml-auto h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">ใส่ {sel.size || ""} รายการ</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

// ── ป๊อปตั้งค่าราคากลาง ──
type Draft = Partial<CostPreset> & { kind: PresetKind; _key: string };
const toDraft = (p: CostPreset): Draft => ({ ...p, _key: p.id });

export function CostPresetsManager({ open, api, initialKind, onClose, materials, onMaterialRate }: {
  open: boolean; api: CostPresetsApi; initialKind?: PresetKind | null; onClose: () => void;
  /** วัตถุดิบตีราคา (แท็บค่าตัดต่อชิ้น — ตั้งราคารายวัตถุดิบ/ทั้งกลุ่ม) */
  materials?: CutMaterial[];
  /** บันทึกค่าตัดของวัตถุดิบ (null = กลับไปใช้ค่ากลาง) → ข้อความผิดพลาด หรือ null */
  onMaterialRate?: (itemId: string, rate: number | null) => Promise<string | null>;
}) {
  const [kind, setKind] = useState<PresetKind>(initialKind ?? "labor_cut");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // บันทึกทั้งหมด (เจ้าของสั่ง 2026-11-10: หน้าที่ต้องกดบันทึกหลายแถว ต้องมีปุ่มบันทึกทั้งหมด) — แถวราคากลาง + ค่าตัดรายวัตถุดิบ
  const [matPending, setMatPending] = useState(0);
  const matSaveAll = useRef<(() => Promise<{ ok: number; fail: number }>) | null>(null);
  const onMatPending = useCallback((n: number, fn: () => Promise<{ ok: number; fail: number }>) => { setMatPending(n); matSaveAll.current = fn; }, []);
  useEffect(() => { if (open) { setKind(initialKind ?? "labor_cut"); setErr(null); setOkMsg(null); } }, [open, initialKind]);
  useEffect(() => { setDrafts(presetsOf(api.presets, kind).map(toDraft)); }, [api.presets, kind]);
  const meta = PRESET_KIND_META[kind];
  const orig = (key: string) => api.presets.find((p) => p.id === key);
  const dirty = (d: Draft) => {
    const o = d.id ? orig(d.id) : null;
    if (!o) return true;
    return (["label", "amount", "w_cm", "l_cm", "h_cm", "max_kg", "mode"] as const).some((k) => String(o[k] ?? "") !== String(d[k] ?? ""));
  };
  const patch = (key: string, p: Partial<Draft>) => { setOkMsg(null); setDrafts((l) => l.map((d) => (d._key === key ? { ...d, ...p } : d))); };
  const dirtyDrafts = drafts.filter(dirty);
  const pending = dirtyDrafts.length + (kind === "cut_rate" ? matPending : 0);
  const saveAll = async () => {
    setBusy("all"); setErr(null); setOkMsg(null);
    let ok = 0, fail = 0, lastErr: string | null = null;
    for (const d of dirtyDrafts) {
      const { _key, ...p } = d; void _key;
      const e = await api.save({ ...p, sort_order: p.sort_order ?? drafts.indexOf(d) });
      if (e) { fail++; lastErr = e; } else ok++;
    }
    if (kind === "cut_rate" && matSaveAll.current) { const r = await matSaveAll.current(); ok += r.ok; fail += r.fail; }
    setBusy(null);
    if (fail) setErr(`บันทึกไม่สำเร็จ ${fail} รายการ${lastErr ? ` — ${lastErr}` : ""}`);
    if (ok) setOkMsg(`บันทึกแล้ว ${ok} รายการ`);
  };
  const saveRow = async (d: Draft) => {
    setBusy(d._key); setErr(null);
    const { _key, ...p } = d; void _key;
    const e = await api.save({ ...p, sort_order: p.sort_order ?? drafts.indexOf(d) });
    setBusy(null);
    if (e) setErr(e);
  };
  const delRow = async (d: Draft) => {
    if (!d.id) { setDrafts((l) => l.filter((x) => x._key !== d._key)); return; }
    const ok = await askConfirm({ title: `ลบ "${d.label || meta.label}" ออกจากราคากลาง?`, message: "ใบงานที่ใส่ราคานี้ไปแล้วไม่เปลี่ยน — แค่ไม่มีให้เลือกอีก", confirmText: "ลบ", variant: "danger" });
    if (!ok) return;
    setBusy(d._key); setErr(null);
    const e = await api.remove(d.id);
    setBusy(null);
    if (e) setErr(e);
  };
  const num = (v: string) => (v === "" ? null : Number(v));
  const cell = (d: Draft, k: "w_cm" | "l_cm" | "h_cm" | "max_kg" | "amount", ph: string, w = "w-20") => (
    <input type="number" min={0} step="any" value={d[k] ?? ""} placeholder={ph} onChange={(e) => patch(d._key, { [k]: num(e.target.value) } as Partial<Draft>)}
      className={`${inCls} ${w} text-right tabular-nums`} />
  );
  return (
    <ERPModal open={open} onClose={onClose} title="ราคากลางค่าใช้จ่ายเพิ่ม" size="lg" hasUnsavedChanges={pending > 0}
      description="ใช้ร่วมกันทุกใบงาน · แก้แล้วใบที่ใส่ราคาไปแล้วไม่เปลี่ยน · มีประวัติว่าใครแก้เมื่อไหร่"
      footer={<>
        <span className="mr-auto text-xs">{pending > 0 ? <span className="text-amber-700">แก้ค้างไว้ {pending} รายการ — ยังไม่ได้บันทึก</span> : okMsg ? <span className="text-emerald-700">{okMsg}</span> : null}</span>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
        {pending > 0 && (
          <button type="button" disabled={busy === "all"} onClick={() => void saveAll()} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === "all" ? "กำลังบันทึก…" : `บันทึกทั้งหมด (${pending})`}
          </button>
        )}
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {PRESET_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`h-8 rounded-md border px-2.5 text-xs ${kind === k ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {PRESET_KIND_META[k].label} <span className="opacity-70">{presetsOf(api.presets, k).length}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{meta.hint}</p>
        {kind === "cut_rate" && <div className="text-sm font-semibold text-slate-700">ค่ากลาง <span className="text-xs font-normal text-slate-400">— ใช้กับวัตถุดิบที่ยังไม่ได้ตั้งค่าตัดเฉพาะ</span></div>}
        <div className="space-y-1.5">
          {drafts.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">ยังไม่มีรายการ — กด “เพิ่ม” ด้านล่าง</p>}
          {drafts.map((d) => (
            <div key={d._key} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-100 p-1.5">
              {(meta.needLabel || kind === "labor_cut") && (
                <input value={d.label ?? ""} placeholder={kind === "labor_cut" ? "ชื่อ (ไม่บังคับ)" : "ชื่อรายการ"} onChange={(e) => patch(d._key, { label: e.target.value })} className={`${inCls} min-w-0 flex-1`} />
              )}
              {meta.dims >= 2 && <>{cell(d, "w_cm", "กว้าง", "w-16")}<span className="text-xs text-slate-400">×</span>{cell(d, "l_cm", "ยาว", "w-16")}</>}
              {meta.dims >= 3 && <><span className="text-xs text-slate-400">×</span>{cell(d, "h_cm", "สูง", "w-16")}</>}
              {meta.dims >= 2 && <span className="text-xs text-slate-400">ซม.</span>}
              {meta.weight && <><span className="text-xs text-slate-500">ไม่เกิน</span>{cell(d, "max_kg", "กก.", "w-16")}<span className="text-xs text-slate-400">กก.</span></>}
              {kind === "other" && (
                <select value={d.mode ?? "piece"} onChange={(e) => patch(d._key, { mode: e.target.value as "piece" | "split" })} className={`${inCls} w-32`}>
                  <option value="piece">ต่อชิ้น</option><option value="split">หารจำนวนสั่ง</option>
                </select>
              )}
              <span className="ml-auto flex items-center gap-1">{cell(d, "amount", "0.00")}<span className="text-xs text-slate-400">{meta.amountLabel}</span></span>
              {dirty(d) && (
                <button type="button" disabled={busy === d._key} onClick={() => void saveRow(d)} className="h-8 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy === d._key ? "…" : "บันทึก"}</button>
              )}
              <button type="button" disabled={busy === d._key} onClick={() => void delRow(d)} aria-label="ลบ" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon value="i:trash" className="text-[14px]" /></button>
            </div>
          ))}
        </div>
        {!(kind === "cut_rate" && drafts.length >= 1) && (
          <button type="button" onClick={() => setDrafts((l) => [...l, { kind, _key: `n${Date.now()}`, amount: 0, mode: kind === "other" ? "piece" : null }])}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-blue-300 px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">
            <Icon value="i:plus" className="text-[13px]" /> {kind === "cut_rate" ? "ตั้งค่ากลาง" : `เพิ่ม${meta.label}`}
          </button>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {kind === "cut_rate" && materials && onMaterialRate && (
          <CutRateByMaterial materials={materials} central={presetsOf(api.presets, "cut_rate")[0]?.amount ?? null} onSave={onMaterialRate} onPending={onMatPending} />
        )}
      </div>
    </ERPModal>
  );
}

// ── แถบจำนวนที่สั่ง (บนแท็บตีราคา) ──
export function OrderQtyBar({ qty, fromQuote, quoteQtys, readOnly, perUnit, splitPerUnit, cutPiecesPerUnit, onChange }: {
  qty: number | null;
  /** ตัวเลขตอนนี้มาจากรอบเสนอราคา (ยังไม่ได้พิมพ์เอง) */
  fromQuote: boolean;
  /** จำนวนในรอบเสนอราคาของแท็บนี้ (กดใช้ได้) */
  quoteQtys: { qty: number; label: string }[];
  readOnly: boolean;
  perUnit: number;            // ต้นทุนต่อใบตอนนี้ (รวมรายการหารจำนวนสั่งที่คิดจากจำนวนนี้แล้ว)
  splitPerUnit: number;       // ส่วนของ "หารจำนวนสั่ง" ต่อใบ
  cutPiecesPerUnit: number;   // ชิ้นงานตัดต่อใบ
  onChange: (q: number | null) => void;
}) {
  const [text, setText] = useState(qty != null ? String(qty) : "");
  useEffect(() => { setText(qty != null ? String(qty) : ""); }, [qty]);
  const commit = (raw: string) => { const v = Math.round(Number(raw)); onChange(raw.trim() === "" || !(v > 0) ? null : v); };
  const q = qty ?? 0;
  const chip = (on: boolean, tone: "blue" | "green") => `h-7 rounded-md border px-2.5 text-xs tabular-nums disabled:opacity-50 ${on
    ? tone === "blue" ? "border-blue-500 bg-blue-600 text-white" : "border-emerald-500 bg-emerald-600 text-white"
    : tone === "blue" ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"}`;
  const quick = ORDER_QTY_QUICK.filter((v) => !quoteQtys.some((x) => x.qty === v));
  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-2.5" aria-label="จำนวนที่สั่ง">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold text-slate-700">จำนวนที่สั่ง</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={readOnly} onClick={() => onChange(stepOrderQty(qty, -1))} aria-label="ลดจำนวน" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Icon value="i:minus" className="text-[15px]" /></button>
          <input type="number" min={1} step={1} value={text} disabled={readOnly} placeholder="0" aria-label="จำนวนที่สั่ง (ใบ)"
            onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
            className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-right text-lg font-semibold tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          <button type="button" disabled={readOnly} onClick={() => onChange(stepOrderQty(qty, 1))} aria-label="เพิ่มจำนวน" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Icon value="i:plus" className="text-[15px]" /></button>
          <span className="text-sm text-slate-500">ใบ</span>
        </div>
        <span className="text-[11px] text-slate-400">{qty == null ? "ยังไม่ได้ใส่ — ใส่แล้วต้นทุนทั้งล็อตขึ้นให้" : fromQuote ? "ตั้งต้นจากรอบเสนอราคาล่าสุด" : "บันทึกพร้อมตีราคา"}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>ต่อใบ <b className="text-sm tabular-nums text-slate-800">{baht(perUnit)}</b></span>
          {q > 0 && <span>ทั้งล็อต <b className="text-sm tabular-nums text-emerald-700">{Math.round(perUnit * q).toLocaleString("th-TH")} ฿</b></span>}
          {q > 0 && splitPerUnit > 0 && <span title="รายการแบบ “หารจำนวนสั่ง” เช่น ค่าบล็อกสกรีน">หารจำนวนสั่ง <b className="tabular-nums text-slate-700">{baht(splitPerUnit)}</b>/ใบ</span>}
          {q > 0 && cutPiecesPerUnit > 0 && <span>ชิ้นงานตัด <b className="tabular-nums text-slate-700">{Math.round(cutPiecesPerUnit * q).toLocaleString("th-TH")}</b> ชิ้น</span>}
        </span>
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {quoteQtys.map((x) => <button key={`q${x.qty}`} type="button" onClick={() => onChange(x.qty)} className={chip(x.qty === q, "green")} title="จำนวนในรอบเสนอราคา">{x.label} · {x.qty.toLocaleString("th-TH")}</button>)}
          {quoteQtys.length > 0 && quick.length > 0 && <span className="mx-1 h-4 w-px bg-slate-200" />}
          {quick.map((v) => <button key={v} type="button" onClick={() => onChange(v)} className={chip(v === q, "blue")}>{v.toLocaleString("th-TH")}</button>)}
        </div>
      )}
    </div>
  );
}

// ── ค่าตัดต่อชิ้น แยกตามวัตถุดิบ (ในป๊อปราคากลาง) ──
const WAGE_KEY = "cut-rate-wage";   // ค่าแรงช่างตัดต่อวัน (จำในเครื่อง — ใช้คิดราคาจาก "ชิ้น/วัน")
const GROUP_STATE_CLS: Record<CutMaterialGroup["state"], string> = {
  same: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mixed: "border-violet-200 bg-violet-50 text-violet-700",
  none: "border-slate-200 bg-white text-slate-500",
};

export function CutRateByMaterial({ materials, central, onSave, onPending }: {
  materials: CutMaterial[];
  central: number | null;
  onSave: (itemId: string, rate: number | null) => Promise<string | null>;
  /** แจ้งจำนวนที่แก้ค้าง + ฟังก์ชันบันทึกทั้งหมด (ให้ปุ่ม "บันทึกทั้งหมด" ท้ายป๊อปใช้) */
  onPending?: (count: number, saveAll: () => Promise<{ ok: number; fail: number }>) => void;
}) {
  const [wage, setWage] = useState("400");
  useEffect(() => { try { const v = localStorage.getItem(WAGE_KEY); if (v) setWage(v); } catch { /* ไม่มีก็ใช้ 400 */ } }, []);
  const saveWage = (v: string) => { setWage(v); try { localStorage.setItem(WAGE_KEY, v); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const [q, setQ] = useState("");
  const [showHw, setShowHw] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [grpIn, setGrpIn] = useState<Record<string, { pcs: string; rate: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const groups = useMemo(() => cutMaterialGroups(materials), [materials]);
  const curOf = (id: string) => { const m = materials.find((x) => x.id === id); return m?.cut_rate != null ? String(m.cut_rate) : ""; };
  const dirtyIds = Object.keys(edits).filter((id) => edits[id] !== curOf(id));
  const saveAllMats = async (): Promise<{ ok: number; fail: number }> => {
    let ok = 0, fail = 0;
    setBusy("all"); setErr(null);
    for (const id of dirtyIds) {
      const v = edits[id];
      const e = await onSave(id, v === "" ? null : Math.max(0, Number(v) || 0));
      if (e) { fail++; setErr(e); } else { ok++; setEdits((m) => { const n = { ...m }; delete n[id]; return n; }); }
    }
    setBusy(null);
    return { ok, fail };
  };
  const saveAllRef = useRef(saveAllMats); saveAllRef.current = saveAllMats;
  const dirtyKey = dirtyIds.join(",");
  useEffect(() => { onPending?.(dirtyIds.length, () => saveAllRef.current()); }, [dirtyKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ql = q.trim().toLowerCase();
  const visible = groups.filter((g) => showHw || !g.hardware || (ql && g.items.some((i) => i.name.toLowerCase().includes(ql))))
    .map((g) => ({ g, items: ql ? g.items.filter((i) => i.name.toLowerCase().includes(ql) || g.group.toLowerCase().includes(ql)) : g.items }))
    .filter((x) => x.items.length);
  const hwCount = groups.filter((g) => g.hardware).reduce((s, g) => s + g.items.length, 0);
  const centralTxt = central != null ? `ค่ากลาง ${baht(central)}` : "ค่ากลาง (ยังไม่ตั้ง)";

  const saveOne = async (id: string, rate: number | null) => {
    setBusy(id); setErr(null);
    const e = await onSave(id, rate);
    setBusy(null);
    if (e) setErr(e); else setEdits((m) => { const n = { ...m }; delete n[id]; return n; });
  };
  const applyGroup = async (g: CutMaterialGroup) => {
    const raw = grpIn[g.group]?.rate ?? "";
    const rate = raw === "" ? NaN : Number(raw);
    if (!(rate >= 0)) { setErr(`ใส่ราคาต่อชิ้นของกลุ่ม "${g.group}" ก่อน (หรือใส่ ชิ้น/วัน ให้ระบบคิด)`); return; }
    const ok = await askConfirm({
      title: `ใส่ค่าตัด ${baht(rate)} ฿/ชิ้น ให้ทั้งกลุ่ม "${g.group}"?`,
      message: `${g.items.length} วัตถุดิบ — ทับราคาที่ตั้งไว้เดิมของวัตถุดิบในกลุ่มนี้ · ใบงานที่แก้ราคาในใบไว้เองไม่เปลี่ยน`,
      confirmText: "ใส่ทั้งกลุ่ม",
    });
    if (!ok) return;
    setBusy(`g:${g.group}`); setErr(null);
    let fail = 0;
    for (const it of g.items) { if (await onSave(it.id, rate)) fail++; }
    setBusy(null);
    if (fail) setErr(`บันทึกไม่สำเร็จ ${fail} จาก ${g.items.length} วัตถุดิบ`);
    else setGrpIn((m) => ({ ...m, [g.group]: { pcs: "", rate: "" } }));
  };

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-white py-1">
        <span className="text-sm font-semibold text-slate-700">ตั้งตามวัตถุดิบ <span className="text-xs font-normal text-slate-400">— ตีราคาใช้ราคาของวัตถุดิบก่อน ไม่มีค่อยใช้ค่ากลาง · คิดให้อัตโนมัติ</span></span>
        {dirtyIds.length > 0 && (
          <button type="button" disabled={busy === "all"} onClick={() => void saveAllMats()}
            className="ml-auto h-7 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy === "all" ? "กำลังบันทึก…" : `บันทึกทั้งหมด (${dirtyIds.length})`}</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
        <Icon value="i:calculator" className="text-[14px]" />ค่าแรงช่างตัดต่อวัน
        <input type="number" min={0} step="any" value={wage} onChange={(e) => saveWage(e.target.value)} aria-label="ค่าแรงช่างตัดต่อวัน" className={`${inCls} w-20 text-right tabular-nums`} />บาท
        <span className="text-slate-400">· ค่าตัดต่อชิ้น = ค่าแรงต่อวัน ÷ ตัดได้กี่ชิ้นต่อวัน (ใส่ “ชิ้น/วัน” ที่หัวกลุ่ม ระบบคิดราคาให้)</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นวัตถุดิบ เช่น PU, ผ้าซับใน" className={`${inCls} min-w-0 flex-1`} />
        {hwCount > 0 && <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={showHw} onChange={(e) => setShowHw(e.target.checked)} className="h-3.5 w-3.5" />แสดงอะไหล่/ซิป ({hwCount}) — ปกติไม่นับค่าตัด</label>}
      </div>
      {materials.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">ยังไม่มีรายการวัตถุดิบตีราคา — เพิ่มที่ “จัดการวัสดุตีราคา”</p>}
      {materials.length > 0 && visible.length === 0 && <p className="text-center text-xs text-slate-400">ไม่พบวัตถุดิบที่ค้น</p>}
      {visible.map(({ g, items }) => {
        const gi = grpIn[g.group] ?? { pcs: "", rate: "" };
        const gBusy = busy === `g:${g.group}`;
        return (
          <div key={g.group} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
              <b className="text-sm font-semibold text-slate-700">{g.group}</b>
              <span className="text-[11px] text-slate-400">{g.items.length} วัตถุดิบ{g.used ? ` · ใช้ในตีราคา ${g.used} บรรทัด` : ""}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${GROUP_STATE_CLS[g.state]}`}>
                {g.state === "same" ? `ทั้งกลุ่ม ${baht(g.rate ?? 0)}` : g.state === "mixed" ? "หลายราคา" : `ใช้${centralTxt}`}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                <input type="number" min={0} step="any" value={gi.pcs} placeholder="ชิ้น/วัน" aria-label={`ตัดได้กี่ชิ้นต่อวัน กลุ่ม ${g.group}`} title="ตัดได้กี่ชิ้นต่อวัน → ระบบคิดราคาต่อชิ้นให้"
                  onChange={(e) => { const pcs = e.target.value; const r = cutRateFromWage(Number(wage), Number(pcs)); setGrpIn((m) => ({ ...m, [g.group]: { pcs, rate: r != null ? String(r) : gi.rate } })); }}
                  className="h-7 w-20 rounded border border-slate-200 px-1.5 text-right tabular-nums" />
                <span>→</span>
                <input type="number" min={0} step="any" value={gi.rate} placeholder="฿/ชิ้น" aria-label={`ค่าตัดต่อชิ้น กลุ่ม ${g.group}`}
                  onChange={(e) => setGrpIn((m) => ({ ...m, [g.group]: { pcs: "", rate: e.target.value } }))}
                  className="h-7 w-20 rounded border border-slate-200 px-1.5 text-right tabular-nums" />
                <button type="button" disabled={gBusy || gi.rate === ""} onClick={() => void applyGroup(g)}
                  className="h-7 rounded-md bg-blue-600 px-2 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-40">{gBusy ? "กำลังใส่…" : "ใส่ทั้งกลุ่ม"}</button>
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {items.map((it) => {
                const cur = it.cut_rate != null ? String(it.cut_rate) : "";
                const typed = edits[it.id];
                const dirty = typed != null && typed !== cur;
                return (
                  <div key={it.id} className="flex flex-wrap items-center gap-1.5 px-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={it.name}>{it.name}</span>
                    <span className="text-[11px] text-slate-400">{it.used_lines ? `${it.used_lines} บรรทัด · ${it.used_pieces ?? 0} ชิ้น` : "ยังไม่มีใบงานใช้"}</span>
                    <input type="number" min={0} step="any" value={typed ?? cur} placeholder={centralTxt} aria-label={`ค่าตัดต่อชิ้น ${it.name}`}
                      onChange={(e) => setEdits((m) => ({ ...m, [it.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && dirty) void saveOne(it.id, typed === "" ? null : Math.max(0, Number(typed) || 0)); }}
                      className={`h-7 w-28 rounded border px-1.5 text-right tabular-nums ${it.cut_rate != null ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`} />
                    <span className="w-10 text-[11px] text-slate-400">฿/ชิ้น</span>
                    {dirty ? (
                      <button type="button" disabled={busy === it.id} onClick={() => void saveOne(it.id, typed === "" ? null : Math.max(0, Number(typed) || 0))}
                        className="h-7 rounded-md bg-blue-600 px-2 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy === it.id ? "…" : "บันทึก"}</button>
                    ) : it.cut_rate != null ? (
                      <button type="button" disabled={busy === it.id} onClick={() => void saveOne(it.id, null)} title="ล้างราคานี้ → กลับไปใช้ค่ากลาง" aria-label={`ล้างค่าตัด ${it.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                    ) : <span className="w-7" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {err && <p className="text-sm text-rose-600">{err}</p>}
    </div>
  );
}

// ── ค่าแรงตัด/ปลอก/วาด ตามจำนวนชิ้นวัตถุดิบ ──
const SRC_LABEL: Record<CutRateSource, string> = { line: "แก้ในใบนี้", material: "ตามวัสดุ", central: "กลาง", none: "ยังไม่ตั้งราคา" };
const SRC_CLS: Record<CutRateSource, string> = {
  line: "border-blue-200 bg-blue-50 text-blue-700",
  material: "border-amber-200 bg-amber-50 text-amber-800",
  central: "border-slate-200 bg-slate-50 text-slate-600",
  none: "border-rose-200 bg-rose-50 text-rose-600",
};

export function CutLaborBreakdown({ rows, orderQty, onOrderQty, readOnly, onToggle, onOverride, onSaveMaterial, onManageMaterials, onManageCentral }: {
  rows: CutRow[];
  orderQty: number | null;
  /** เปลี่ยนจำนวนที่สั่ง (กลางของแท็บ) — ไม่ส่ง = ช่องในกล่องนี้ใช้ชั่วคราว */
  onOrderQty?: (q: number) => void;
  readOnly: boolean;
  /** นับ/ไม่นับ ทุกบรรทัดของวัสดุนั้น — null = กลับเป็นอัตโนมัติ (อะไหล่ไม่นับ) */
  onToggle: (lineKeys: string[], count: boolean | null) => void;
  /** แก้ราคาเฉพาะใบนี้ ทุกบรรทัดของวัสดุนั้น — null = กลับไปใช้ราคาวัสดุ/กลาง */
  onOverride: (lineKeys: string[], rate: number | null) => void;
  /** บันทึกเป็นราคาตัดของวัสดุ (ใช้ทุกใบงาน) */
  onSaveMaterial?: (itemId: string, rate: number, lineKeys: string[]) => void;
  onManageMaterials?: () => void;
  onManageCentral?: () => void;
}) {
  const s = cutLaborSummary(rows);
  const groups = groupCutRows(rows);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());   // วัสดุที่กางดูรายบรรทัด
  const toggleOpen = (k: string) => setOpenKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [qty, setQty] = useState<number>(orderQty && orderQty > 0 ? orderQty : 1000);
  useEffect(() => { if (orderQty && orderQty > 0) setQty(orderQty); }, [orderQty]);
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      {groups.length === 0 ? <p className="text-[11px] text-slate-400">ยังไม่มีวัตถุดิบในตารางตีราคาของแท็บนี้</p> : (
        <div className="overflow-x-auto rounded-lg bg-white">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400">
              <th className="w-7 px-2 py-1" /><th className="px-1 py-1">วัตถุดิบ</th><th className="px-1 py-1">ชนิด</th>
              <th className="px-1 py-1 text-right">ชิ้น/ใบ</th><th className="px-1 py-1">ราคาตัด/ชิ้น</th><th className="px-2 py-1 text-right">รวม</th>
            </tr></thead>
            <tbody>
              {groups.map((g) => {
                const label = g.source === "mixed" ? "หลายราคา" : SRC_LABEL[g.source];
                const cls = g.source === "mixed" ? "border-violet-200 bg-violet-50 text-violet-700" : SRC_CLS[g.source];
                const isLine = g.source === "line";
                const opened = openKeys.has(g.key);
                return (
                  <Fragment key={g.key}>
                  <tr className={`border-b border-slate-50 ${g.on === "none" ? "text-slate-400" : ""}`}>
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={g.on !== "none"} disabled={readOnly}
                        ref={(el) => { if (el) el.indeterminate = g.on === "some"; }}
                        title={g.auto ? "นับอัตโนมัติ (อะไหล่ไม่นับ)" : "ตั้งเองแล้ว — กด “อัตโนมัติ” เพื่อกลับ"}
                        onChange={(e) => onToggle(g.lineKeys, e.target.checked)} className="h-3.5 w-3.5" />
                    </td>
                    <td className="max-w-[200px] px-1 py-1">
                      <span className="block truncate" title={g.name}>{g.name}</span>
                      {g.lines > 1 ? (
                        <button type="button" onClick={() => toggleOpen(g.key)} aria-expanded={opened}
                          className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline" title="ดูว่ามีชิ้นไหนบ้าง ชิ้นละเท่าไหร่">
                          <Icon value={opened ? "i:chevron-up" : "i:chevron-down"} className="text-[11px]" />{g.lines} บรรทัด — {opened ? "ซ่อน" : "ดูทีละชิ้น"}
                        </button>
                      ) : g.rows[0]?.detail ? <span className="block truncate text-[10px] text-slate-400" title={g.rows[0].detail}>{g.rows[0].detail}</span> : null}
                    </td>
                    <td className="px-1 py-1 text-slate-500">{g.group}{!g.auto && <button type="button" disabled={readOnly} onClick={() => onToggle(g.lineKeys, null)} className="ml-1 text-[10px] text-slate-400 underline" title="กลับเป็นอัตโนมัติ">อัตโนมัติ</button>}</td>
                    <td className="px-1 py-1 text-right tabular-nums">{g.pieces}</td>
                    <td className="px-1 py-1">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {isLine && !readOnly && (
                          <input type="number" min={0} step="any" value={g.rate ?? ""} onChange={(e) => onOverride(g.lineKeys, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0))}
                            className="h-6 w-16 rounded border border-slate-200 px-1 text-right text-[12px] tabular-nums" />
                        )}
                        <button type="button" disabled={readOnly}
                          onClick={() => onOverride(g.lineKeys, isLine ? null : (g.rate ?? 0))}
                          title={isLine ? "กดเพื่อกลับไปใช้ราคาวัสดุ/ราคากลาง" : "กดเพื่อใส่ราคาตัดของวัสดุนี้ (ใบนี้)"}
                          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
                          {g.source === "none" ? "ใส่ราคา" : label}{g.source !== "line" && g.source !== "none" && g.rate != null ? ` ${baht(g.rate)}` : ""}
                        </button>
                        {/* ราคาที่ใส่ในใบนี้ → บันทึกเป็นราคาวัสดุ ใบงานถัดไปได้เลยไม่ต้องใส่ซ้ำ */}
                        {isLine && !readOnly && onSaveMaterial && g.itemId && g.rate != null && g.rate > 0 && (
                          <button type="button" onClick={() => onSaveMaterial(g.itemId as string, g.rate as number, g.lineKeys)}
                            title="บันทึกเป็นราคาตัดของวัสดุนี้ — ใบงานอื่นใช้ราคานี้อัตโนมัติ"
                            className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100">ใช้ทุกใบงาน</button>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{g.on !== "none" ? baht(g.amount) : "—"}</td>
                  </tr>
                  {opened && g.rows.map((r, i) => (
                    <tr key={r.key} className={`border-b border-slate-50 bg-slate-50/60 text-[11px] ${r.on ? "text-slate-600" : "text-slate-400 line-through"}`}>
                      <td />
                      <td className="max-w-[200px] px-1 py-0.5 pl-3"><span className="block truncate" title={r.detail || undefined}>└ {r.detail || `บรรทัดที่ ${i + 1}`}</span></td>
                      <td className="px-1 py-0.5 text-slate-400">{r.on ? "" : "ไม่นับ"}</td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{r.pieces}</td>
                      <td className="px-1 py-0.5 tabular-nums text-slate-500">× {baht(r.rate)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{r.on ? baht(r.amount) : "—"}</td>
                    </tr>
                  ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* ติดตามจำนวนงาน: ต่อใบ + ตามจำนวนสั่ง */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-white px-2 py-1.5"><div className="text-[11px] text-slate-400">ชิ้นงานตัดต่อใบ</div><div className="text-base font-semibold tabular-nums text-slate-800">{s.pieces.toLocaleString("th-TH")}</div></div>
        <div className="rounded-lg bg-white px-2 py-1.5">
          <div className="text-[11px] text-slate-400">ถ้าสั่ง <input type="number" min={1} value={qty} onChange={(e) => { const v = Math.max(1, Math.round(Number(e.target.value)) || 1); setQty(v); onOrderQty?.(v); }} className="h-5 w-16 rounded border border-slate-200 px-1 text-right text-[11px]" /> ใบ = ชิ้นงานรวม</div>
          <div className="text-base font-semibold tabular-nums text-slate-800">{Math.round(s.pieces * qty).toLocaleString("th-TH")}</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-1.5"><div className="text-[11px] text-slate-400">ค่าแรงตัดทั้งล็อต</div><div className="text-base font-semibold tabular-nums text-emerald-700">{Math.round(s.total * qty).toLocaleString("th-TH")} ฿</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {s.missingRate > 0 && <span className="text-rose-600">{groups.filter((g) => g.on !== "none" && g.source === "none").length} วัสดุยังไม่มีราคาตัด — กด “ใส่ราคา” หรือตั้งราคากลาง</span>}
        <span className="ml-auto text-slate-500">รวมค่าตัด <b className="tabular-nums text-emerald-700">{baht(s.total)}</b> ฿/ใบ</span>
        {onManageMaterials && <button type="button" onClick={onManageMaterials} className="text-slate-500 underline hover:text-blue-700">ราคาตามวัสดุ</button>}
        {onManageCentral && <button type="button" onClick={onManageCentral} className="text-slate-500 underline hover:text-blue-700">ราคากลาง</button>}
      </div>
    </div>
  );
}
