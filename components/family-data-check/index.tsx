"use client";

/**
 * ของกลาง — "ตรวจข้อมูล" บนหน้าพิมพ์ใบรวมทั้งรุ่น (เจ้าของเลือกแบบ A + B · 2026-10-31)
 *  A: ปุ่ม "ตรวจข้อมูล (n)" + แผงข้างเอกสาร — ทุกจุดที่ข้อมูลไม่ครบ พร้อมช่องแก้ด่วน (ค่าแนะนำเติมไว้แล้ว)
 *  B: กดกรอบเหลือง/ปุ่ม "แก้" บนเอกสาร → หน้าพิมพ์ส่ง active=คีย์ปัญหา มา → แผงเปิดที่การ์ดนั้น
 * บันทึก = ถาม "จะแก้อะไรบ้าง" (dry run) ก่อน → แก้ครบทุกชั้นที่ติ๊ก (SKU → BOM → ใบสั่งผลิต) ที่ /api/mo/family-print/fix
 * ซับซ้อนกว่าแก้ด่วน → ปุ่มเปิดตัวแก้เต็ม (drawer SKU กลาง / ป๊อปแก้ BOM กลาง)
 * ปัญหา + ค่าแนะนำ คิดที่ lib/family-checks (ไม่ยิง DB)
 */
import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { FIX_LAYER_LABEL, type FamilyIssue, type FixLayer } from "@/lib/family-checks";

// ต้อง dynamic — master-crud import relation-multi อยู่ (import ตรงจะวน) · ดู memory unify_drawer
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
const BomEditorModal = nextDynamic(() => import("@/components/bom-editor-modal").then((m) => m.BomEditorModal), { ssr: false });

type Change = { layer: string; label: string; count: number; detail: string };
type Options = { uoms: string[]; types: string[] };

function IssueCard({ issue, options, active, canEdit, onFixed, onOpenSku, onOpenBom }: {
  issue: FamilyIssue; options: Options; active: boolean; canEdit: boolean;
  onFixed: () => void; onOpenSku: (id: string) => void; onOpenBom: (sku: string) => void;
}) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(issue.fields).map(([k, v]) => [k, v?.suggest || v?.current || ""])) as Record<string, string>);
  const [layers, setLayers] = useState<Record<FixLayer, boolean>>({ sku: true, bom: true, mo: true });
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ changes: Change[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRefresh, setAskRefresh] = useState(false);

  // ใบเก่าถือสำเนาวัตถุดิบตอนสร้างใบ — สูตรแก้แล้วใบไม่เปลี่ยนเอง → "อัพเดตวัตถุดิบตาม BOM" ตัวเดิมของหน้าใบสั่งผลิต (เก็บติ๊ก/ค่าที่กรอกไว้)
  const refreshFromBom = async () => {
    setBusy(true);
    try {
      for (const id of issue.mo_ids) {
        const res = await apiFetch(`/api/mo/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reexplode: true, preserve: true }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.error) throw new Error(j?.error || "อัปเดตใบไม่สำเร็จ");
      }
      toast.success(`อัปเดต ${issue.mo_ids.length} ใบตามสูตรแล้ว — โหลดใบพิมพ์ใหม่`);
      setAskRefresh(false); onFixed();
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัปเดตใบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (active) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [active]);

  const payload = (dry: boolean) => ({
    target: issue.target, code: issue.code, fields: vals, layers, bom_codes: issue.bom_codes, mo_nos: issue.mos, dry_run: dry,
  });
  const post = async (dry: boolean) => {
    const res = await apiFetch("/api/mo/family-print/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(dry)) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
    return j.data as { changes: Change[]; warnings: string[] };
  };
  // ขั้นที่ 1: ตรวจค่า → ถาม "จะแก้อะไรบ้าง"
  const ask = async () => {
    const empty = Object.entries(issue.fields).find(([k]) => !vals[k]?.trim());
    if (empty) { setErr("กรอกให้ครบทุกช่องก่อน"); return; }
    if (issue.target === "material" && !layers.sku && !layers.bom && !layers.mo) { setErr("เลือกอย่างน้อย 1 ชั้นที่จะแก้"); return; }
    setErr(null); setBusy(true);
    try { setPreview(await post(true)); } catch (e) { setErr(e instanceof Error ? e.message : "ตรวจไม่สำเร็จ"); } finally { setBusy(false); }
  };
  // ขั้นที่ 2: แก้จริง
  const apply = async () => {
    setBusy(true);
    try { await post(false); toast.success("แก้แล้ว — โหลดใบพิมพ์ใหม่"); setPreview(null); onFixed(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const input = "h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";
  const fieldRow = (key: string, label: string, el: React.ReactNode, hint?: string) => (
    <div key={key} className="mt-1.5">
      <div className="flex items-center gap-2"><span className="w-14 shrink-0 text-[11px] text-slate-500">{label}</span>{el}</div>
      {hint && <div className="ml-16 mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
  const select = (key: string, opts: string[]) => (
    <select className={input} disabled={!canEdit} value={vals[key] ?? ""} onChange={(e) => { setVals((v) => ({ ...v, [key]: e.target.value })); setErr(null); }}>
      <option value="">— เลือก —</option>
      {[...new Set([vals[key], ...opts].filter(Boolean))].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const text = (key: string) => (
    <input className={input} disabled={!canEdit} value={vals[key] ?? ""} onChange={(e) => { setVals((v) => ({ ...v, [key]: e.target.value })); setErr(null); }} />
  );
  const f = issue.fields;

  return (
    <div ref={ref} className={`rounded-lg border p-2.5 ${active ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
      <div className="text-[12px] font-bold text-slate-800">{issue.title}{issue.title !== issue.code && <span className="ml-1 font-mono text-[11px] font-normal text-slate-400">{issue.code}</span>}</div>
      <div className="text-[11px] text-slate-500">{issue.products.length ? `ใช้กับ ${issue.products.join(", ")}` : ""}</div>
      {issue.problems.map((p) => <div key={p} className="mt-0.5 text-[11px] text-amber-700"><Icon name="warning" /> {p}</div>)}

      {f.uom && fieldRow("uom", "หน่วย", select("uom", options.uoms), f.uom.suggest ? `แนะนำ "${f.uom.suggest}" ตามของชนิดเดียวกันในรุ่น` : undefined)}
      {f.type && fieldRow("type", "ชนิด", select("type", options.types), f.type.suggest ? `แนะนำ "${f.type.suggest}" — ชื่อขึ้นต้นเหมือนตัวที่ตั้งชนิดนี้แล้ว` : "ยังเดาไม่ได้ — เลือกเอง")}
      {f.name && fieldRow("name", "ชื่อไทย", text("name"), f.name.suggest ? "แนะนำจากชื่อของชนิดเดียวกัน + สีในข้อมูลวัตถุดิบ" : "ยังเดาไม่ได้ — พิมพ์เอง")}
      {f.color && fieldRow("color", "ชื่อสี", text("color"), f.color.suggest ? "แนะนำจากสีของวัตถุดิบหลักของสีนี้" : undefined)}

      {issue.target === "material" && (
        <div className="mt-2">
          <div className="text-[11px] text-slate-500">แก้ที่ (ค่าถูกคัดลอกไว้ 3 ที่)</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {(Object.keys(FIX_LAYER_LABEL) as FixLayer[]).map((k) => (
              <label key={k} className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                <input type="checkbox" disabled={!canEdit} checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /> {FIX_LAYER_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
      )}
      {err && <div className="mt-1.5 text-[12px] text-red-600">{err}</div>}

      <div className="mt-2 flex gap-1.5">
        {issue.target !== "bom" && canEdit && (
          <button type="button" onClick={ask} disabled={busy}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            <Icon name="save" /> {busy ? "กำลังตรวจ…" : issue.target === "material" ? "บันทึก (ทุกชั้นที่ติ๊ก)" : "บันทึก"}
          </button>
        )}
        {issue.target === "bom"
          ? issue.products.map((p) => (
            <button key={p} type="button" onClick={() => onOpenBom(p)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 hover:bg-slate-50">
              <Icon name="edit" /> แก้ BOM {p}
            </button>))
          : issue.sku_id && (
            <button type="button" onClick={() => onOpenSku(issue.sku_id!)} title="เปิดตัวแก้เต็ม (drawer ข้อมูล SKU)"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50">
              <Icon name="open" /> ตัวแก้เต็ม
            </button>)}
      </div>

      {issue.target === "bom" && canEdit && issue.mo_ids.length > 0 && (
        <>
          <button type="button" onClick={() => setAskRefresh(true)} disabled={busy}
            className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Icon name="refresh" /> อัปเดตใบตามสูตร ({issue.mo_ids.length} ใบ)
          </button>
          <div className="mt-0.5 text-[11px] text-slate-400">แก้สูตรแล้วกดอันนี้ — ใบเก่ายังถือสำเนาจำนวนเดิมอยู่</div>
          <ConfirmDialog open={askRefresh} onClose={() => setAskRefresh(false)} onConfirm={refreshFromBom} loading={busy}
            title="อัปเดตวัตถุดิบในใบตามสูตรปัจจุบัน" confirmText="อัปเดต"
            message={`${issue.mos.join(", ")} — ดึงวัตถุดิบจากสูตร BOM ตอนนี้มาแทน (เก็บติ๊กเตรียม/ตัด และค่าที่กรอกไว้เดิม) เหมือนปุ่ม "อัพเดตวัตถุดิบตาม BOM" ในหน้าใบสั่งผลิต`} />
        </>
      )}

      <ConfirmDialog open={!!preview} onClose={() => setPreview(null)} onConfirm={apply} loading={busy}
        title={`แก้ข้อมูล ${issue.code}`} confirmText="แก้เลย"
        message={preview && (
          <div className="space-y-1.5 text-sm">
            {preview.changes.map((c) => (
              <div key={c.layer}><b>{c.label}</b> <span className="text-slate-500">({c.count} แถว)</span><div className="text-[12px] text-slate-600">{c.detail}</div></div>
            ))}
            {preview.warnings.map((w) => <div key={w} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800"><Icon name="warning" /> {w}</div>)}
          </div>
        )} />
    </div>
  );
}

export function FamilyDataCheck({ issues, options, open, onOpenChange, active, onFixed }: {
  issues: FamilyIssue[];
  options: Options;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** คีย์ปัญหาที่กดมาจากเอกสาร (แบบ B) — แผงเลื่อนไปการ์ดนั้น */
  active: string | null;
  onFixed: () => void;
}) {
  const canEdit = usePermission("products.edit");
  const [skuId, setSkuId] = useState<string | null>(null);
  const [bomSku, setBomSku] = useState<string | null>(null);
  const n = issues.length;

  return (
    <>
      <button type="button" onClick={() => onOpenChange(!open)}
        title="หาจุดที่ข้อมูลวัตถุดิบ/สินค้าไม่ครบ แล้วแก้จากตรงนี้ได้เลย"
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${n ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
        <Icon name={n ? "warning" : "done"} /> {n ? `ตรวจข้อมูล (${n})` : "ข้อมูลครบ"}
      </button>
      {open && (
        <div className="no-print fixed right-4 top-[76px] z-40 flex max-h-[calc(100vh-96px)] w-[360px] flex-col rounded-xl border border-slate-300 bg-white/95 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50/80 px-3 py-2">
            <span className="flex-1 text-[13px] font-bold text-slate-700"><Icon name="warning" /> ตรวจข้อมูล {n ? `— ${n} จุด` : ""}</span>
            <button type="button" onClick={() => onOpenChange(false)} title="ปิด" className="h-6 rounded border border-slate-200 bg-white px-1.5 text-slate-500 hover:bg-slate-50"><Icon name="cancel" /></button>
          </div>
          <div className="space-y-2 overflow-y-auto px-3 py-2.5">
            {n === 0
              ? <div className="py-6 text-center text-[13px] text-emerald-700"><Icon name="done" /> ไม่พบจุดที่ข้อมูลไม่ครบในรุ่นนี้</div>
              : <p className="text-[11px] leading-snug text-slate-500">จุดเหล่านี้มี<b className="text-amber-700">กรอบเหลือง</b>บนเอกสาร (กดที่กรอบเพื่อมาที่การ์ดนั้นได้ · ตอนพิมพ์ไม่ติดกระดาษ){canEdit ? "" : " · ดูได้อย่างเดียว — แก้ต้องมีสิทธิ์แก้สินค้า"}</p>}
            {issues.map((i) => (
              <IssueCard key={i.key} issue={i} options={options} active={active === i.key} canEdit={canEdit}
                onFixed={onFixed} onOpenSku={setSkuId} onOpenBom={setBomSku} />
            ))}
          </div>
        </div>
      )}
      {skuId && <MasterRecordDrawer moduleKey="skus-v2" recordId={skuId} startInEdit onClose={() => setSkuId(null)} onChanged={onFixed} />}
      {bomSku && <BomEditorModal sku={bomSku} onClose={(changed) => { setBomSku(null); if (changed) onFixed(); }} />}
    </>
  );
}
