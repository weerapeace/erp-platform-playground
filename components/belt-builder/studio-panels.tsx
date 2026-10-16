"use client";

/**
 * แผงในสตูดิโอที่ไม่ใช่กริดชิ้นส่วน:
 *   📏 SizeRulesPanel  — กติกาไซซ์ (ช่วงเอวชาย/หญิง + สูตรตัดหนัง StrapFormulaEditor ของกลาง) แก้ในที่ บันทึกส่งเฉพาะที่แก้
 *   ✒️ EngravingPanel  — ชุดฟอนต์/ตำแหน่งสลักชื่อ (ตายตัวใน lib/belt-builder-public.ts) อ่านอย่างเดียว + บอกว่าแก้ที่ไหน
 *   🧾 DesignsPanel    — แบบที่ลูกค้าบันทึก (DataTable กลาง: รหัส · วันที่ · ราคา · สถานะ · ปุ่มเปิดลิงก์ ?design=)
 */
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { BeltPreview, partToLayer } from "./belt-preview";
import { StrapFormulaEditor } from "./formula-editor";
import { ENGRAVING_FONTS, ENGRAVING_POSITIONS } from "@/lib/belt-builder-public";
import { DEFAULT_STRAP_FORMULA, GENDER_LABEL, strapLengthCm, validateSizeRule, type Gender } from "@/lib/belt-builder";
import { createSizeRule, deleteSizeRule, fetchDesigns, fetchSizeRules, patchSizeRule, DESIGN_STATUS_TH, money, type BeltDesign, type BeltPart, type BeltShopInfo, type SizeRule } from "./studio-data";

/* ───────────────────────── 📏 กติกาไซซ์ ───────────────────────── */

const RULE_KEYS: (keyof SizeRule)[] = ["gender", "label", "waist_min_in", "waist_max_in", "strap_formula", "hole_count", "hole_spacing_cm", "note", "is_active"];

export function SizeRulesPanel({ shopId, canEdit }: { shopId: string; canEdit: boolean }) {
  const toast = useToast();
  const [rules, setRules] = useState<SizeRule[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SizeRule>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [del, setDel] = useState<SizeRule | null>(null);

  const load = () => fetchSizeRules(shopId).then((r) => { setRules(r); setDrafts({}); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  useEffect(() => { setRules(null); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const draftOf = (r: SizeRule) => drafts[r.id] ?? r;
  const setDraft = (r: SizeRule, patch: Partial<SizeRule>) => setDrafts((d) => ({ ...d, [r.id]: { ...draftOf(r), ...patch } }));
  const isDirty = (r: SizeRule) => RULE_KEYS.some((k) => JSON.stringify(draftOf(r)[k] ?? null) !== JSON.stringify(r[k] ?? null));

  const save = async (r: SizeRule) => {
    const d = draftOf(r);
    const patch: Partial<SizeRule> = {};
    RULE_KEYS.forEach((k) => { if (JSON.stringify(d[k] ?? null) !== JSON.stringify(r[k] ?? null)) (patch as Record<string, unknown>)[k] = d[k]; });
    const v = validateSizeRule({ ...d } as unknown as Record<string, unknown>);
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    setSaving(r.id);
    try {
      const saved = await patchSizeRule(r.id, patch);
      setRules((cur) => (cur ?? []).map((x) => (x.id === r.id ? saved : x)));
      setDrafts((cur) => { const n = { ...cur }; delete n[r.id]; return n; });
      toast.success("บันทึกกติกาไซซ์แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(null); }
  };
  const add = async (gender: Gender) => {
    try {
      const r = await createSizeRule({ shop_id: shopId, gender, label: GENDER_LABEL[gender].th, waist_min_in: gender === "men" ? 28 : 24, waist_max_in: gender === "men" ? 46 : 38, strap_formula: DEFAULT_STRAP_FORMULA, hole_count: 5, hole_spacing_cm: 2.5, sort_order: ((rules?.length ?? 0) + 1) * 10, is_active: true });
      setRules((cur) => [...(cur ?? []), r]);
      toast.success("เพิ่มกติกาแล้ว — แก้ช่วงเอวแล้วกดบันทึก");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const confirmDelete = async () => {
    if (!del) return;
    try { await deleteSizeRule(del.id); setRules((cur) => (cur ?? []).filter((x) => x.id !== del.id)); toast.success("ลบกติกาแล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setDel(null); }
  };

  const num = "w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums disabled:bg-slate-50";
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">⚠ {err} <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button></div>;
  if (!rules) return <div className="p-6 text-sm text-slate-500">กำลังโหลดกติกาไซซ์…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-slate-600">ช่วงรอบเอวที่รับทำ (นิ้ว) แยกชาย/หญิง + สูตรคิดความยาวหนัง — ลูกค้าพิมพ์เอวแล้วเว็บบอกว่าตัดหนังกี่ซม. ได้กี่รู</div>
        {canEdit && <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={() => void add("men")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">+ กติกาผู้ชาย</button>
          <button type="button" onClick={() => void add("women")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">+ กติกาผู้หญิง</button>
        </div>}
      </div>
      {rules.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">ยังไม่มีกติกาไซซ์ — เว็บจะไม่มีคู่มือวัดไซซ์จนกว่าจะเพิ่ม</div>}
      {rules.map((r) => {
        const d = draftOf(r); const dirty = isDirty(r);
        return (
          <div key={r.id} className={`rounded-xl border bg-white p-3 shadow-sm ${dirty ? "border-amber-300" : "border-slate-200"} ${!d.is_active ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-600"><div className="mb-0.5">เพศ</div>
                <select className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" value={d.gender} disabled={!canEdit} onChange={(e) => setDraft(r, { gender: e.target.value as Gender })}>
                  <option value="men">{GENDER_LABEL.men.th}</option><option value="women">{GENDER_LABEL.women.th}</option>
                </select></label>
              <label className="text-xs text-slate-600"><div className="mb-0.5">ชื่อที่โชว์ลูกค้า</div><input className="w-32 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50" value={d.label ?? ""} disabled={!canEdit} onChange={(e) => setDraft(r, { label: e.target.value })} /></label>
              <label className="text-xs text-slate-600"><div className="mb-0.5">เอวต่ำสุด (นิ้ว)</div><input type="number" className={num} value={d.waist_min_in} disabled={!canEdit} onChange={(e) => setDraft(r, { waist_min_in: Number(e.target.value) })} /></label>
              <label className="text-xs text-slate-600"><div className="mb-0.5">เอวสูงสุด (นิ้ว)</div><input type="number" className={num} value={d.waist_max_in} disabled={!canEdit} onChange={(e) => setDraft(r, { waist_max_in: Number(e.target.value) })} /></label>
              <label className="text-xs text-slate-600"><div className="mb-0.5">จำนวนรู</div><input type="number" className={num} value={d.hole_count} disabled={!canEdit} onChange={(e) => setDraft(r, { hole_count: Number(e.target.value) })} /></label>
              <label className="text-xs text-slate-600"><div className="mb-0.5">ระยะรู (ซม.)</div><input type="number" step="0.5" className={num} value={d.hole_spacing_cm} disabled={!canEdit} onChange={(e) => setDraft(r, { hole_spacing_cm: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-600"><input type="checkbox" className="accent-emerald-600" checked={d.is_active} disabled={!canEdit} onChange={(e) => setDraft(r, { is_active: e.target.checked })} /> ใช้งาน</label>
              <span className="pb-1.5 text-xs text-slate-400">เอว {d.waist_min_in}″ → ตัดหนัง {strapLengthCm(Number(d.waist_min_in) || 0, d.strap_formula ?? DEFAULT_STRAP_FORMULA)} ซม.</span>
              {canEdit && <div className="ml-auto flex gap-1.5 pb-0.5">
                <button type="button" onClick={() => void save(r)} disabled={!dirty || saving === r.id} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving === r.id ? "กำลังบันทึก…" : "บันทึก"}</button>
                {dirty && <button type="button" onClick={() => setDrafts((cur) => { const n = { ...cur }; delete n[r.id]; return n; })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">ยกเลิก</button>}
                <button type="button" onClick={() => setDel(r)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50">🗑</button>
              </div>}
            </div>
            <div className="mt-3">
              <StrapFormulaEditor value={d.strap_formula} onChange={(f) => setDraft(r, { strap_formula: f })} disabled={!canEdit} form={d as unknown as Record<string, unknown>} />
            </div>
          </div>
        );
      })}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void confirmDelete()} variant="danger" confirmText="ลบกติกา"
        title="ลบกติกาไซซ์นี้?" message={`ลบ "${del?.label ?? ""}" (เอว ${del?.waist_min_in}–${del?.waist_max_in}″) — ลูกค้าที่เอวอยู่ในช่วงนี้จะสั่งไม่ได้จนกว่าจะมีกติกาใหม่`} />
    </div>
  );
}

/* ───────────────────────── ✒️ สลักชื่อ ───────────────────────── */

export function EngravingPanel({ info, parts, onOpenSettings }: { info: BeltShopInfo | null; parts: BeltPart[]; onOpenSettings: () => void }) {
  const [font, setFont] = useState(ENGRAVING_FONTS[0]?.key ?? "serif");
  const [pos, setPos] = useState(ENGRAVING_POSITIONS[0]?.key ?? "tip");
  const [text, setText] = useState("LOUIS M.");
  const layers = useMemo(() => ["strap", "keeper", "buckle"].map((t) => { const p = parts.find((x) => x.part_type === t && x.is_active); return p ? partToLayer(p) : null; }).filter((l): l is NonNullable<typeof l> => !!l), [parts]);
  const f = ENGRAVING_FONTS.find((x) => x.key === font) ?? ENGRAVING_FONTS[0];
  const p = ENGRAVING_POSITIONS.find((x) => x.key === pos) ?? ENGRAVING_POSITIONS[0];
  const enabled = (info?.belt_engraving_max ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-3 text-sm ${enabled ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {enabled ? <>✓ เปิดสลักชื่อ · สูงสุด <b>{info?.belt_engraving_max}</b> ตัวอักษร · ค่าสลัก <b>{money(info?.belt_engraving_fee)}</b></> : <>สลักชื่อ<b>ปิดอยู่</b> (จำนวนตัวอักษรสูงสุด = 0)</>}
        <button type="button" onClick={onOpenSettings} className="ml-2 underline">แก้ที่ตั้งค่าร้าน</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-1 text-xs text-slate-500">ลองพิมพ์ดูว่าตัวอักษรขึ้นตรงไหนบนสายตัวอย่าง (ชิ้นที่เปิดอยู่ตัวแรกของแต่ละประเภท)</div>
          <BeltPreview layers={layers} width={640} engraving={text ? { text, font: f?.css, box: p?.box } : null} showGrid />
          <input className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={text} maxLength={30} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ชื่อทดลอง" />
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">ฟอนต์ที่ลูกค้าเลือกได้ ({ENGRAVING_FONTS.length})</div>
            <div className="space-y-1">
              {ENGRAVING_FONTS.map((x) => (
                <button key={x.key} type="button" onClick={() => setFont(x.key)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left ${font === x.key ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <span>{x.label}</span><span className="text-base" style={{ fontFamily: x.css }}>{text || "Abc"}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">ตำแหน่งสลัก ({ENGRAVING_POSITIONS.length})</div>
            <div className="space-y-1">
              {ENGRAVING_POSITIONS.map((x) => (
                <button key={x.key} type="button" onClick={() => setPos(x.key)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left ${pos === x.key ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <span>{x.label}</span><span className="text-[11px] tabular-nums text-slate-400">{x.box.x},{x.box.y} · {x.box.w}×{x.box.h}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            ชุดฟอนต์/ตำแหน่งเป็น<b>ค่าตายตัวในโค้ด</b> (ยังตั้งจากหน้าจอไม่ได้) — อยากเพิ่ม/ย้าย ให้แจ้งทีมแก้ที่ <code className="rounded bg-white px-1">lib/belt-builder-public.ts</code> (ENGRAVING_FONTS / ENGRAVING_POSITIONS) และฟอนต์ต้องมีบนเว็บร้านด้วย
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 🧾 แบบของลูกค้า ───────────────────────── */

export function DesignsPanel({ shopId, parts, siteUrl, onTotal }: { shopId: string; parts: BeltPart[]; siteUrl: string | null; onTotal?: (n: number) => void }) {
  const [rows, setRows] = useState<BeltDesign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const load = () => fetchDesigns(shopId).then((r) => { setRows(r.rows); setErr(null); onTotal?.(r.total); }).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  useEffect(() => { setRows(null); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const nameOf = (id: unknown) => (id ? byId.get(String(id))?.name_th ?? "—" : "—");
  const code = (d: BeltDesign) => d.id.slice(0, 8).toUpperCase();
  const designUrl = (d: BeltDesign) => (siteUrl ? `${siteUrl}/belt-builder?design=${encodeURIComponent(code(d))}&preview=1` : null);

  const columns = useMemo<ColumnDef<BeltDesign>[]>(() => [
    { id: "code", header: "รหัสแบบ", accessorFn: (d) => code(d), cell: ({ row }) => <span className="font-mono text-xs">{code(row.original)}</span>, size: 110 },
    { id: "created_at", header: "วันที่", accessorKey: "created_at", cell: ({ getValue }) => new Date(String(getValue())).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }), size: 150 },
    { id: "summary", header: "ที่เลือก", accessorFn: (d) => { const s = d.selections ?? {}; return `${nameOf(s.strap_id)} · ${nameOf(s.buckle_id)} · ${nameOf(s.keeper_id)}`; }, size: 300,
      cell: ({ row }) => { const s = row.original.selections ?? {}; const e = (s.engraving ?? {}) as Record<string, unknown>; return <span className="text-xs">{nameOf(s.strap_id)} · {nameOf(s.buckle_id)} · {nameOf(s.keeper_id)}{s.waist_in ? ` · เอว ${s.waist_in}″` : ""}{e.text ? ` · สลัก “${String(e.text)}”` : ""}</span>; } },
    { id: "total_price", header: "ราคา", accessorKey: "total_price", cell: ({ getValue }) => <span className="tabular-nums">{money(getValue())}</span>, size: 100 },
    { id: "status", header: "สถานะ", accessorKey: "status", cell: ({ getValue }) => { const v = String(getValue()); return <span className={`rounded-full px-2 py-0.5 text-[11px] ${v === "ordered" ? "bg-emerald-100 text-emerald-800" : v === "in_cart" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{DESIGN_STATUS_TH[v] ?? v}</span>; }, size: 110 },
    { id: "order_ref", header: "เลขใบสั่งขาย", accessorKey: "order_ref", cell: ({ getValue }) => String(getValue() ?? "") || "—", size: 120 },
    { id: "open", header: "", enableSorting: false, size: 90, cell: ({ row }) => { const u = designUrl(row.original); return u ? <a href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:underline">เปิดบนเว็บ ↗</a> : <span className="text-[11px] text-slate-400">ไม่มีโดเมน</span>; } },
  ], [byId, siteUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-600">แบบที่ลูกค้ากด &quot;บันทึกแบบนี้&quot; บนเว็บ — ตอนนี้ดูอย่างเดียว (ก้อนถัดไป: ใส่ตะกร้า → ใบสั่งขาย จะอัปเดตสถานะ/เลขใบที่นี่)</div>
      <DataTable<BeltDesign>
        tableId="belt-studio-designs"
        data={rows ?? []}
        columns={columns}
        loading={rows === null && !err}
        error={err ?? undefined}
        onRetry={() => void load()}
        emptyMessage="ยังไม่มีลูกค้าบันทึกแบบ"
        searchPlaceholder="ค้นรหัสแบบ / เลขใบสั่งขาย"
        searchableKeys={["id", "order_ref", "status"]}
        pageSize={25}
        exportFilename="belt-designs"
        exportEntityType="belt_designs"
        drawerTitle={(d) => `แบบ ${code(d)}`}
        drawerContent={(d) => {
          const s = d.selections ?? {}; const e = (s.engraving ?? {}) as Record<string, unknown>;
          const layers = ["strap_id", "keeper_id", "buckle_id"].map((k) => { const p = byId.get(String(s[k] ?? "")); return p ? partToLayer(p) : null; }).filter((l): l is NonNullable<typeof l> => !!l);
          return (
            <div className="space-y-3 text-sm">
              <BeltPreview layers={layers} width={560} engraving={e.text ? { text: String(e.text), font: ENGRAVING_FONTS.find((f) => f.key === e.font)?.css, box: ENGRAVING_POSITIONS.find((p) => p.key === e.position)?.box } : null} />
              <div>สายหนัง: {nameOf(s.strap_id)} · หัว: {nameOf(s.buckle_id)} · หู: {nameOf(s.keeper_id)}</div>
              <div>เพศ: {GENDER_LABEL[s.gender as Gender]?.th ?? "—"} · เอว: {s.waist_in ? `${s.waist_in} นิ้ว` : "—"} · กว้างสาย: {s.width_mm ? `${s.width_mm} มม.` : "—"}</div>
              {e.text ? <div>สลักชื่อ: “{String(e.text)}” {e.font ? `· ฟอนต์ ${e.font}` : ""} {e.position ? `· ตำแหน่ง ${e.position}` : ""}</div> : null}
              <div>ราคารวม: <b>{money(d.total_price)}</b> · สถานะ: {DESIGN_STATUS_TH[d.status] ?? d.status}{d.order_ref ? ` · ใบสั่งขาย ${d.order_ref}` : ""}</div>
              {designUrl(d) && <a href={designUrl(d)!} target="_blank" rel="noreferrer" className="inline-block text-indigo-600 hover:underline">เปิดแบบนี้บนเว็บ ↗</a>}
            </div>
          );
        }}
      />
    </div>
  );
}
