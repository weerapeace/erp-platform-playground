"use client";
// ป๊อป "📄 ดึงวัตถุดิบตีราคาจากใบงานอื่น" (ไม่ใช่จาก SKU)
// ค้นใบงาน → เลือกแท็บต้นทาง (ทั่วไป / เวอร์ชัน / ไซส์) → ติ๊กวัตถุดิบที่ต้องการ → เพิ่มต่อท้าย หรือ แทนที่ทั้งแท็บที่กำลังดู
// (แทนโมดอล "คัดลอกตีราคาจากใบอื่น" เดิม ที่ดึงได้แค่แท็บทั่วไปทั้งก้อน + โผล่เฉพาะโหมดแก้ไข)
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";

export type PullExtra = { label: string; amount: number };
export type PullMode = "append" | "replace";
type Source = { sheet: DesignSheetListItem; lines: CostLine[]; extra: unknown; generalLabel: string; codes: string[]; drafts: string[] };

const fmt = (n: number | null | undefined, d = 2) => (n == null ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: d }));
const pkey = (s: string | null | undefined) => s ?? "";
const arrOf = (a: unknown): PullExtra[] => (Array.isArray(a) ? a : [])
  .map((c) => ({ label: String((c as PullExtra)?.label ?? ""), amount: Number((c as PullExtra)?.amount) || 0 }))
  .filter((c) => c.label || c.amount);
// ค่าใช้จ่ายเพิ่มของแท็บต้นทาง: เก็บได้ทั้ง object {แท็บ: [...]} (ใหม่) และ array (เดิม = แท็บทั่วไป)
const extraOf = (raw: unknown, key: string): PullExtra[] =>
  raw && !Array.isArray(raw) && typeof raw === "object" ? arrOf((raw as Record<string, unknown>)[key]) : key === "" ? arrOf(raw) : [];

export function PullCostFromSheetModal({ open, excludeId, targetLabel, targetCount, onClose, onApply }: {
  open: boolean;
  excludeId: string | null;
  targetLabel: string;     // ชื่อแท็บปลายทาง (แท็บที่กำลังดู)
  targetCount: number;     // จำนวนบรรทัดที่มีอยู่แล้วในแท็บปลายทาง
  onClose: () => void;
  onApply: (lines: CostLine[], extra: PullExtra[] | null, mode: PullMode, sourceLabel: string) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyCosted, setOnlyCosted] = useState(true);
  const [rows, setRows] = useState<DesignSheetListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<Source | null>(null);
  const [tab, setTab] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());   // index ในบรรทัดของแท็บต้นทาง
  const [withExtra, setWithExtra] = useState(false);
  const [mode, setMode] = useState<PullMode>("append");

  // เปิดใหม่ = เริ่มจากค้นใบงาน
  useEffect(() => { if (!open) { setQ(""); setRows(null); setSrc(null); setErr(null); setMode("append"); setWithExtra(false); } }, [open]);
  useEffect(() => {
    if (!open || src) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets?limit=40${q ? `&search=${encodeURIComponent(q)}` : ""}`).then((r) => r.json())
        .then((j) => setRows(((j.data ?? []) as DesignSheetListItem[]).filter((s) => s.id !== excludeId)))
        .catch(() => setRows([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, excludeId, src]);

  const tabLines = useMemo(() => (src ? src.lines.filter((l) => pkey(l.parent_code) === tab) : []), [src, tab]);
  // แท็บต้นทาง: ทั่วไปก่อน → รหัส Parent → เวอร์ชัน → ที่เหลือ (เฉพาะที่มีบรรทัด)
  const srcTabs = useMemo(() => {
    if (!src) return [];
    const counts = new Map<string, number>();
    for (const l of src.lines) counts.set(pkey(l.parent_code), (counts.get(pkey(l.parent_code)) ?? 0) + 1);
    const order = ["", ...src.codes, ...src.drafts, ...counts.keys()];
    return [...new Set(order)].filter((k) => counts.has(k)).map((k) => ({ key: k, label: costTabLabel(k, src.generalLabel), n: counts.get(k) ?? 0 }));
  }, [src]);
  const tabExtra = useMemo(() => (src ? extraOf(src.extra, tab) : []), [src, tab]);

  const choose = async (s: DesignSheetListItem) => {
    setBusyId(s.id); setErr(null);
    try {
      const [lr, dr] = await Promise.all([
        apiFetch(`/api/design-sheets/${s.id}/cost-lines`).then((r) => r.json()),
        apiFetch(`/api/design-sheets/${s.id}`).then((r) => r.json()),
      ]);
      if (lr.error || dr.error) throw new Error(lr.error || dr.error);
      const d = (dr.data ?? {}) as Record<string, unknown>;
      const lines = (lr.data ?? []) as CostLine[];
      const next: Source = {
        sheet: s, lines, extra: d.cost_extra, generalLabel: generalLabelOf(d.cost_general_label as string | null),
        codes: Array.isArray(d.parent_sku_codes) ? (d.parent_sku_codes as string[]) : [],
        drafts: Array.isArray(d.parent_sku_drafts) ? (d.parent_sku_drafts as string[]) : [],
      };
      const first = lines.some((l) => !l.parent_code) ? "" : pkey(lines[0]?.parent_code);
      setSrc(next); pickTab(next, first);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดใบงานไม่สำเร็จ"); }
    finally { setBusyId(null); }
  };
  const pickTab = (s: Source, key: string) => {
    setTab(key);
    setPicked(new Set(s.lines.filter((l) => pkey(l.parent_code) === key).map((_, i) => i)));   // เริ่มต้น = ติ๊กทุกบรรทัด
    setWithExtra(false);
  };
  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const allOn = tabLines.length > 0 && picked.size === tabLines.length;

  const apply = () => {
    if (!src) return;
    const lines = tabLines.filter((_, i) => picked.has(i));
    if (lines.length === 0 && !(withExtra && tabExtra.length)) return;
    onApply(lines, withExtra ? tabExtra : null, mode, `${src.sheet.code} · ${costTabLabel(tab, src.generalLabel)}`);
  };
  const pickedTotal = tabLines.reduce((s, l, i) => s + (picked.has(i) ? Number(l.amount) || 0 : 0), 0);
  const shown = (rows ?? []).filter((s) => !onlyCosted || s.has_cost);

  return (
    <ERPModal open={open} onClose={onClose} size="xl" title="📄 ดึงวัตถุดิบตีราคาจากใบงานอื่น"
      description={src ? `เลือกวัตถุดิบจาก ${src.sheet.code} มาใส่แท็บ "${targetLabel}"` : `ค้นใบงานต้นทาง — วัตถุดิบที่เลือกจะมาอยู่ในแท็บ "${targetLabel}" ที่กำลังดู`}
      footer={src ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">เลือก {picked.size}/{tabLines.length} บรรทัด · รวม {fmt(pickedTotal)} บาท</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={apply} disabled={picked.size === 0 && !(withExtra && tabExtra.length)}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {mode === "replace" ? "♻ แทนที่ด้วย" : "➕ ดึงมา"} {picked.size} บรรทัด
            </button>
          </div>
        </div>
      ) : undefined}>
      {!src ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขใบ / ชื่องาน..."
              className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-200 px-3 text-sm" />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={onlyCosted} onChange={(e) => setOnlyCosted(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              เฉพาะใบที่ตีราคาแล้ว
            </label>
          </div>
          {err && <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">⚠️ {err}</p>}
          {loading ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
            : shown.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">— ไม่พบใบงาน —</div>
            : <div className="max-h-[55vh] space-y-1 overflow-auto">
                {shown.map((s) => (
                  <button key={s.id} type="button" disabled={busyId === s.id || !s.has_cost} onClick={() => void choose(s)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-100 p-2 text-left hover:border-blue-200 hover:bg-blue-50/40 disabled:opacity-50 disabled:hover:bg-transparent">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                      {s.cover_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.cover_url} alt="" className="h-full w-full object-cover" /> : <span className="text-slate-300">📦</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-800">{s.code} · {s.name}</div>
                      <div className="text-[11px] text-slate-400">{s.brand_name ?? "—"}{s.has_cost ? " · ✅ มีตีราคา" : " · ยังไม่ตีราคา"}</div>
                    </div>
                    <span className="shrink-0 text-xs text-blue-700">{busyId === s.id ? "กำลังโหลด…" : "เลือก ›"}</span>
                  </button>
                ))}
              </div>}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSrc(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">‹ เลือกใบอื่น</button>
            <span className="truncate text-sm font-medium text-slate-800">{src.sheet.code} · {src.sheet.name}</span>
          </div>
          {srcTabs.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">ใบนี้ยังไม่มีบรรทัดตีราคา</div> : (
            <>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] text-slate-400">แท็บต้นทาง:</span>
                {srcTabs.map((t) => (
                  <button key={t.key || "__gen__"} type="button" onClick={() => pickTab(src, t.key)}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs ${tab === t.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {t.label}<span className={`rounded-full px-1 text-[10px] ${tab === t.key ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{t.n}</span>
                  </button>
                ))}
              </div>
              <div className="max-h-[42vh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-1.5 text-left">
                        <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(tabLines.map((_, i) => i)))} className="h-4 w-4 accent-blue-600" title="เลือกทั้งหมด" />
                      </th>
                      <th className="px-2 py-1.5 text-left">วัสดุ</th>
                      <th className="px-2 py-1.5 text-left">ขนาด</th>
                      <th className="px-2 py-1.5 text-right">ปริมาณ</th>
                      <th className="px-2 py-1.5 text-right">ราคา/หน่วย</th>
                      <th className="px-2 py-1.5 text-right">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabLines.map((l, i) => (
                      <tr key={l.id ?? i} onClick={() => toggle(i)} className={`cursor-pointer border-t border-slate-100 ${picked.has(i) ? "bg-blue-50/40" : "hover:bg-slate-50"}`}>
                        <td className="px-2 py-1.5"><input type="checkbox" readOnly checked={picked.has(i)} className="pointer-events-none h-4 w-4 accent-blue-600" /></td>
                        <td className="px-2 py-1.5">
                          <div className="text-slate-800">{l.item_name || l.item_sku_code || "—"}</div>
                          {(l.group_name || l.note) && <div className="text-[10px] text-slate-400">{[l.group_name, l.note].filter(Boolean).join(" · ")}</div>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">
                          {l.width_cm != null || l.length_cm != null ? `${fmt(l.width_cm)}×${fmt(l.length_cm)} cm` : "—"}{l.pieces ? ` ×${fmt(l.pieces)}` : ""}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-600">{fmt(l.qty, 4)} {l.uom ?? ""}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-600">{fmt(l.unit_price)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-slate-800">{fmt(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1 rounded-lg border border-slate-200 p-2 text-[13px]">
                  <label className="flex items-start gap-2">
                    <input type="radio" name="pull-mode" checked={mode === "append"} onChange={() => setMode("append")} className="mt-0.5 accent-blue-600" />
                    <span>➕ เพิ่มต่อท้ายแท็บ <b>{targetLabel}</b><span className="block text-[11px] text-slate-400">ของเดิม {targetCount} บรรทัดอยู่ครบ</span></span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="pull-mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-0.5 accent-blue-600" />
                    <span>♻ แทนที่ทั้งแท็บ <b>{targetLabel}</b><span className="block text-[11px] text-slate-400">ลบของเดิม {targetCount} บรรทัด แล้วใส่ที่เลือก</span></span>
                  </label>
                </div>
                <label className={`flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-[13px] ${tabExtra.length ? "" : "opacity-50"}`}>
                  <input type="checkbox" checked={withExtra} disabled={!tabExtra.length} onChange={(e) => setWithExtra(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
                  <span>ดึงค่าใช้จ่ายเพิ่มมาด้วย ({tabExtra.length} รายการ)
                    <span className="block text-[11px] text-slate-400">{tabExtra.length ? `${tabExtra.map((c) => c.label).slice(0, 3).join(", ")}${tabExtra.length > 3 ? "…" : ""} — แทนที่ค่าใช้จ่ายเพิ่มของแท็บนี้` : "แท็บนี้ไม่มีค่าใช้จ่ายเพิ่ม"}</span>
                  </span>
                </label>
              </div>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">💡 ดึงมาแล้วแก้ตัวเลข/วัสดุต่อได้ — อย่าลืมกด <b>บันทึกตีราคา</b></p>
            </>
          )}
        </div>
      )}
    </ERPModal>
  );
}
