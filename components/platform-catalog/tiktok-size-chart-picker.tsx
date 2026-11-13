"use client";
/**
 * ตารางขนาดของสินค้าบน TikTok — "รูปตาราง" หรือ "แม่แบบตาราง (กรอกเป็นแถว)" · ใช้ในลิ้นชักสินค้าบนร้าน + หน้าลงฉบับร่าง
 * เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 2)
 *
 *   <TiktokSizeChartBox by={{ listingId }} categoryId rules value baseRef baseImageUrl valueName can onChange matchedParent matchedCode />
 *   value/baseRef = ref: "tpl:<id>" แม่แบบบน TikTok · "tts:<uri>" รูปบน TikTok · "r2:<key>" รูปใหม่จากระบบ
 *   เลือกแม่แบบ = ฟอร์มเปลี่ยนเฉย ๆ (ยังไม่ส่ง — ส่งตอนกดบันทึกของหน้านั้น) · สร้างแม่แบบใหม่ = สร้างบน TikTok ทันที (ถามก่อน · ยังไม่ผูกกับสินค้า)
 * ข้อมูล: GET/POST /api/tiktok-shop/size-charts · กฎ: lib/tiktok-size-chart (planTiktokSizeTable — หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * ของกลางที่ใช้: ERPModal · ConfirmDialog · ListingImagePicker · state-views · Icon · lib/paste-table
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { parsePastedGrid } from "@/lib/paste-table";
import {
  planTiktokSizeTable, sizeTableFromGrid, starterSizeTable, tiktokSizeTemplateRef, tiktokTemplateIdOfRef, ttsSizeSystemLabel,
  TTS_MEASUREMENT_LABEL, TTS_SIZE_CELL_MAX, TTS_SIZE_MAX_HEADERS, TTS_SIZE_MAX_ROWS,
  type TtsSizeTable, type TtsSizeTemplate,
} from "@/lib/tiktok-size-chart";
import type { TtsCategoryRules } from "@/lib/tiktok-attrs";
import { ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";

type By = { listingId?: string | null; brandId?: string | null };
type Tpl = TtsSizeTemplate & { fits: boolean };
const qs = (by: By) => (by.listingId ? `listing_id=${encodeURIComponent(by.listingId)}` : by.brandId ? `brand_id=${encodeURIComponent(by.brandId)}` : "");

/** แม่แบบตารางขนาดของร้าน (โหลดเมื่อ enabled) */
export function useTiktokSizeTemplates(by: By, categoryId: string | null, enabled: boolean) {
  const [st, setSt] = useState<{ key: string; list: Tpl[] | null; error: string | null; loading: boolean }>({ key: "", list: null, error: null, loading: false });
  const key = `${qs(by)}|${categoryId ?? ""}`;
  const load = useCallback(async (fresh = false) => {
    if (!qs(by)) return;
    setSt((s) => ({ ...s, key, loading: true, error: null }));
    try {
      const r = await apiFetch(`/api/tiktok-shop/size-charts?${qs(by)}${categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ""}${fresh ? "&fresh=1" : ""}`);
      const j = await r.json().catch(() => ({ templates: null, error: `HTTP ${r.status}` })) as { templates: Tpl[] | null; error: string | null };
      setSt({ key, list: j.templates ?? null, error: j.error ?? (j.templates ? null : "โหลดแม่แบบไม่สำเร็จ"), loading: false });
    } catch { setSt({ key, list: null, error: "โหลดแม่แบบไม่สำเร็จ — ลองใหม่", loading: false }); }
  }, [key, by, categoryId]);
  useEffect(() => { if (enabled && st.key !== key) void load(); }, [enabled, key, st.key, load]);
  const mine = st.key === key;
  return { list: mine ? st.list : null, error: mine ? st.error : null, loading: mine && st.loading, reload: () => load(true) };
}

/** กล่องตารางขนาด: โชว์ของปัจจุบัน + ปุ่มเลือกรูปจากระบบ / ใช้แม่แบบตาราง */
export function TiktokSizeChartBox({ by, categoryId, rules, value, baseRef, baseImageUrl, valueName, can, onChange, matchedParent, matchedCode, extraActions }: {
  by: By; categoryId: string | null; rules: TtsCategoryRules | null;
  value: string | null; baseRef?: string | null; baseImageUrl?: string | null; valueName?: string | null;
  can: boolean; onChange: (ref: string | null, name?: string | null) => void;
  matchedParent?: string | null; matchedCode?: string | null; extraActions?: React.ReactNode;
}) {
  const sys = useSystemImages(matchedParent ?? null);
  const [picking, setPicking] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const tplId = tiktokTemplateIdOfRef(value);
  const tpls = useTiktokSizeTemplates(by, categoryId, !!tplId || tplOpen);
  const tpl = tplId ? tpls.list?.find((t) => t.id === tplId) ?? null : null;
  const name = tpl?.name ?? valueName ?? null;
  const imgSrc = !value || tplId ? null : value.startsWith("tts:") ? (value === baseRef ? baseImageUrl ?? null : null) : listingImgSrc(value, 400);
  const changed = (baseRef ?? null) !== value;
  if (rules?.sizeChartSupported === false) return <p className="text-xs text-slate-500">หมวดนี้ TikTok ไม่รองรับตารางขนาด</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white ${changed ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"} ${value ? "" : "border-dashed text-slate-300"}`}>
          {imgSrc ? <img src={imgSrc} alt="" className="h-full w-full object-contain" />
            : tplId ? (tpl?.image ? <img src={tpl.image} alt="" className="h-full w-full object-contain" /> : <Icon name="table-view" className="text-2xl text-violet-500" />)
            : <Icon name="image" />}
        </div>
        <div className="min-w-0 text-xs">
          <div className="text-slate-700">
            {!value ? "ยังไม่มี" : tplId ? <>แม่แบบตาราง: <b>{name ?? (tpls.loading ? "กำลังโหลดชื่อ…" : `#${tplId}`)}</b></> : value.startsWith("r2:") ? "รูปใหม่จากระบบ (ส่งตอนบันทึก)" : "รูปตารางขนาดบน TikTok"}
          </div>
          {tpl?.table && <div className="mt-0.5 text-[11px] text-slate-400">{tpl.table.headers.length} คอลัมน์ · {tpl.table.rows.length} แถว</div>}
          {can && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <button type="button" onClick={() => setTplOpen(true)} className="text-violet-700 hover:underline">{tplId ? "เปลี่ยนแม่แบบ" : "ใช้แม่แบบตาราง (กรอกเป็นแถว)"}</button>
              <button type="button" disabled={!matchedParent} onClick={() => { setPicking(true); sys.load(); }} className="text-violet-700 hover:underline disabled:opacity-40" title={matchedParent ? "" : "จับคู่สินค้าในระบบก่อน"}>{value && !tplId ? "เปลี่ยนรูป" : "เลือกรูปจากระบบ"}</button>
              {changed && <button type="button" onClick={() => onChange(baseRef ?? null)} className="text-slate-500 hover:underline">คืนค่าเดิม</button>}
              {extraActions}
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate-400">แม่แบบ = ตารางที่ลูกค้าเห็นเป็นแถว/คอลัมน์ (ใช้ซ้ำได้หลายสินค้า) · รูป = ด้านสั้น ≥ 1,024px</p>
        </div>
      </div>
      {can && (
        <ListingImagePicker open={picking} onClose={() => setPicking(false)} mode="variant" storageKey="tiktok-size-chart-picker"
          title="เลือกรูปตารางขนาด" description="เลือกรูปตารางขนาดจากคลังรูปของสินค้า (ควรเป็นตารางชัด ๆ ด้านสั้นอย่างน้อย 1,024px)"
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          onPick={(ref) => { onChange(ref); setPicking(false); }} />
      )}
      {can && tplOpen && (
        <SizeTemplateModal open={tplOpen} onClose={() => setTplOpen(false)} by={by} categoryId={categoryId} rules={rules} tpls={tpls} currentId={tplId}
          onPick={(t) => { onChange(tiktokSizeTemplateRef(t.id), t.name); setTplOpen(false); }} />
      )}
    </div>
  );
}

/** ตารางย่อ (ดูอย่างเดียว) */
function SizeTablePreview({ table, max = 6 }: { table: TtsSizeTable; max?: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 text-slate-500"><tr>{table.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium">{h.name}</th>)}</tr></thead>
        <tbody>{table.rows.slice(0, max).map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1 text-slate-700">{c || <span className="text-slate-300">—</span>}</td>)}</tr>)}</tbody>
      </table>
      {table.rows.length > max && <div className="border-t border-slate-100 px-2 py-0.5 text-[10px] text-slate-400">และอีก {table.rows.length - max} แถว</div>}
    </div>
  );
}

function SizeTemplateModal({ open, onClose, by, categoryId, rules, tpls, currentId, onPick }: {
  open: boolean; onClose: () => void; by: By; categoryId: string | null; rules: TtsCategoryRules | null;
  tpls: ReturnType<typeof useTiktokSizeTemplates>; currentId: string | null; onPick: (t: { id: string; name: string }) => void;
}) {
  const [tab, setTab] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState("");
  const list = useMemo(() => (tpls.list ?? []).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())), [tpls.list, q]);
  const fits = list.filter((t) => t.fits); const others = list.filter((t) => !t.fits);
  const card = (t: Tpl) => (
    <button key={t.id} type="button" onClick={() => onPick(t)}
      className={`w-full rounded-lg border p-2 text-left hover:border-violet-400 hover:bg-violet-50/40 ${t.id === currentId ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}>
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.name}</span>
        {t.id === currentId && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700">ใช้อยู่</span>}
        {!t.fits && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">คนละหมวด</span>}
      </div>
      {t.table ? <SizeTablePreview table={t.table} max={4} /> : t.image ? <img src={t.image} alt="" className="max-h-28 rounded border border-slate-100" /> : <p className="text-[11px] text-slate-400">ไม่มีตัวอย่าง</p>}
    </button>
  );
  return (
    <ERPModal open={open} onClose={onClose} title="ตารางขนาดแบบแม่แบบ (TikTok)" size="lg" storageKey="tiktok-size-template" defaultExpanded={false}
      description="เลือกแม่แบบที่มีอยู่ หรือสร้างตารางใหม่ (กรอกเป็นแถว/วางจาก Excel) — เลือกแล้วกดบันทึกขึ้น TikTok ในหน้าสินค้าอีกทีถึงจะใช้กับสินค้านี้">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(["pick", "new"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 ${tab === k ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"}`}>
            {k === "pick" ? `เลือกแม่แบบที่มี${tpls.list ? ` (${tpls.list.length})` : ""}` : "สร้างตารางใหม่"}
          </button>
        ))}
      </div>
      {tab === "pick" ? (
        tpls.loading && !tpls.list ? <LoadingState label="กำลังโหลดแม่แบบจาก TikTok…" />
          : tpls.error && !tpls.list ? <ErrorState title={tpls.error} onRetry={() => void tpls.reload()} />
          : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อแม่แบบ" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
                <button type="button" onClick={() => void tpls.reload()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"><Icon name="refresh" />โหลดใหม่</button>
              </div>
              {!list.length ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                  {tpls.list?.length ? "ไม่เจอแม่แบบที่ค้น" : "ร้านยังไม่มีแม่แบบตารางขนาด"}
                  <div className="mt-2"><button type="button" onClick={() => setTab("new")} className="text-violet-700 hover:underline">สร้างตารางใหม่</button></div>
                </div>
              ) : (
                <>
                  {fits.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{fits.map(card)}</div>}
                  {others.length > 0 && (
                    <details className="rounded-lg border border-slate-200 px-2 py-1">
                      <summary className="cursor-pointer text-xs text-slate-500">แม่แบบของหมวดอื่น ({others.length}) — TikTok อาจไม่รับกับหมวดนี้</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">{others.map(card)}</div>
                    </details>
                  )}
                </>
              )}
            </div>
          )
      ) : (
        <SizeTableEditor by={by} categoryId={categoryId} rules={rules} onCreated={(id, name) => { void tpls.reload(); onPick({ id, name }); }} />
      )}
    </ERPModal>
  );
}

/** สร้างแม่แบบใหม่: ชื่อ + แบบวัด + ตาราง (เพิ่ม/ลบแถว-คอลัมน์ · วางจาก Excel · ปุ่มเพิ่มคอลัมน์วัดมาตรฐานของหมวด) */
function SizeTableEditor({ by, categoryId, rules, onCreated }: { by: By; categoryId: string | null; rules: TtsCategoryRules | null; onCreated: (id: string, name: string) => void }) {
  const toast = useToast();
  const meta = rules?.size ?? null;
  const [mtype, setMtype] = useState<string | null>(meta?.measures[0]?.type ?? null);
  const [name, setName] = useState("");
  const [table, setTable] = useState<TtsSizeTable>(() => starterSizeTable(meta, meta?.measures[0]?.type ?? null));
  const [paste, setPaste] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => planTiktokSizeTable({ categoryId, name, measurementType: mtype, table }, meta), [categoryId, name, mtype, table, meta]);
  const measure = meta?.measures.find((m) => m.type === mtype) ?? null;
  const usedIds = new Set(table.headers.map((h) => h.id).filter(Boolean));
  const setCell = (r: number, c: number, v: string) => setTable((t) => ({ ...t, rows: t.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }));
  const setHead = (c: number, v: string) => setTable((t) => ({ ...t, headers: t.headers.map((h, j) => (j === c ? { ...h, name: v } : h)) }));
  const addCol = (h: { id: string | null; name: string }) => setTable((t) => (t.headers.length >= TTS_SIZE_MAX_HEADERS ? t : { headers: [...t.headers, h], rows: t.rows.map((r) => [...r, ""]) }));
  const delCol = (c: number) => setTable((t) => (t.headers.length <= 1 ? t : { headers: t.headers.filter((_, j) => j !== c), rows: t.rows.map((r) => r.filter((_, j) => j !== c)) }));
  const addRow = () => setTable((t) => (t.rows.length >= TTS_SIZE_MAX_ROWS ? t : { ...t, rows: [...t.rows, t.headers.map(() => "")] }));
  const delRow = (r: number) => setTable((t) => (t.rows.length <= 1 ? t : { ...t, rows: t.rows.filter((_, i) => i !== r) }));
  const applyPaste = () => {
    const t = sizeTableFromGrid(parsePastedGrid(paste ?? ""), meta);
    if (!t) { toast.error("วางไม่ได้ — ต้องมีแถวหัวตาราง + อย่างน้อย 1 แถว (คัดลอกจาก Excel/Sheets มาทั้งตาราง)"); return; }
    setTable(t); setPaste(null); toast.success(`วางตาราง ${t.headers.length} คอลัมน์ × ${t.rows.length} แถวแล้ว`);
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/tiktok-shop/size-charts", { method: "POST", body: JSON.stringify({ ...(by.listingId ? { listing_id: by.listingId } : { brand_id: by.brandId }), category_id: categoryId, name, measurement_type: mtype, table }) });
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as { ok: boolean; template_id?: string; name?: string; warnings?: string[]; error: string | null };
      if (!j.ok || !j.template_id) { toast.error(r.status === 401 ? "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน" : (j.error ?? `HTTP ${r.status}`)); return; }
      toast.success(`สร้างแม่แบบ "${j.name ?? name}" บน TikTok แล้ว — เลือกให้สินค้านี้แล้ว (กดบันทึกขึ้น TikTok เพื่อใช้)`);
      (j.warnings ?? []).forEach((w) => toast.warning(w));
      setAsking(false);
      onCreated(j.template_id, j.name ?? name);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const cell = "h-8 w-full min-w-[4.5rem] rounded border border-slate-200 px-1.5 text-sm";
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">ชื่อแม่แบบ (ลูกค้าไม่เห็น)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น กระเป๋าสะพาย ไซซ์ S-L" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        {meta && meta.measures.length > 1 && (
          <label className="block text-xs text-slate-500">วัดแบบ
            <select value={mtype ?? ""} onChange={(e) => setMtype(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {meta.measures.map((m) => <option key={m.type} value={m.type}>{TTS_MEASUREMENT_LABEL[m.type] ?? m.type}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button type="button" onClick={() => setPaste("")} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50"><Icon name="import" />วางจาก Excel</button>
        <button type="button" onClick={addRow} disabled={table.rows.length >= TTS_SIZE_MAX_ROWS} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Icon name="add" />แถว</button>
        <button type="button" onClick={() => addCol({ id: null, name: "" })} disabled={table.headers.length >= TTS_SIZE_MAX_HEADERS} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Icon name="add" />คอลัมน์</button>
        {[...(measure?.options ?? [])].filter((o) => !usedIds.has(o.id)).slice(0, 8).map((o) => (
          <button key={o.id} type="button" onClick={() => addCol({ id: o.id, name: `${o.name}${o.unit === "LENGTH" || o.unit === "HEIGHT" ? " (ซม.)" : o.unit === "WEIGHT" ? " (กก.)" : ""}`.slice(0, TTS_SIZE_CELL_MAX) })}
            className={`h-7 rounded-full border px-2 ${o.role === "KEY" ? "border-violet-300 text-violet-700" : "border-slate-200 text-slate-500"} hover:bg-violet-50`} title={o.role === "KEY" ? "คอลัมน์หลักที่ TikTok แนะนำ" : "คอลัมน์ที่แนะนำ"}>+ {o.name}</button>
        ))}
        {[...(measure?.sizeSystems ?? meta?.sizeSystems ?? [])].filter((id) => !usedIds.has(id)).slice(0, 4).map((id) => (
          <button key={id} type="button" onClick={() => addCol({ id, name: ttsSizeSystemLabel(id) })} className="h-7 rounded-full border border-slate-200 px-2 text-slate-500 hover:bg-violet-50">+ ไซซ์ {ttsSizeSystemLabel(id)}</button>
        ))}
      </div>
      {paste != null && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} autoFocus placeholder={"คัดลอกตารางจาก Excel/Google Sheets มาวางที่นี่ (แถวแรก = หัวตาราง)\nเช่น\nไซซ์\tกว้าง (ซม.)\tยาว (ซม.)\nS\t20\t15"} className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs" />
          <div className="mt-1 flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => setPaste(null)} className="h-7 rounded-md border border-slate-200 px-2 text-slate-600">ยกเลิก</button>
            <button type="button" onClick={applyPaste} className="h-7 rounded-md bg-violet-600 px-2 text-white">ใช้ตารางนี้ (แทนของเดิม)</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="text-sm">
          <thead className="bg-slate-50">
            <tr>
              {table.headers.map((h, c) => (
                <th key={c} className="p-1 align-bottom">
                  <div className="flex items-center gap-0.5">
                    <input value={h.name} onChange={(e) => setHead(c, e.target.value)} placeholder="หัวคอลัมน์" className={`${cell} font-medium ${h.id ? "border-violet-200 bg-violet-50/50" : ""}`} title={h.id ? "คอลัมน์มาตรฐานของ TikTok" : "คอลัมน์ตั้งเอง"} />
                    {table.headers.length > 1 && <button type="button" onClick={() => delCol(c)} className="text-slate-300 hover:text-rose-500" aria-label="ลบคอลัมน์"><Icon name="delete" /></button>}
                  </div>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((v, c) => <td key={c} className="p-1"><input value={v} onChange={(e) => setCell(i, c, e.target.value)} className={cell} /></td>)}
                <td className="p-1">{table.rows.length > 1 && <button type="button" onClick={() => delRow(i)} className="text-slate-300 hover:text-rose-500" aria-label="ลบแถว"><Icon name="delete" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">คอลัมน์แรก = ไซซ์ (ห้ามว่าง) · หัวสีม่วง = คอลัมน์มาตรฐานของ TikTok (ช่วยลูกค้าเลือกไซซ์) · ได้สูงสุด {TTS_SIZE_MAX_HEADERS} คอลัมน์ × {TTS_SIZE_MAX_ROWS} แถว · ช่องละ ≤ {TTS_SIZE_CELL_MAX} ตัวอักษร</p>
      {plan.errors.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {plan.warnings.map((w) => <p key={w} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
      <div className="flex justify-end">
        <button type="button" disabled={plan.errors.length > 0 || busy} onClick={() => setAsking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />สร้างแม่แบบบน TikTok</button>
      </div>
      <ConfirmDialog open={asking} onClose={() => { if (!busy) setAsking(false); }} onConfirm={() => void create()} loading={busy}
        title={`สร้างแม่แบบตารางขนาด "${name}" บน TikTok?`} confirmText="สร้างแม่แบบ"
        message={(
          <div className="space-y-2 text-sm">
            <p>ระบบจะสร้างแม่แบบ {plan.rows} แถว × {table.headers.length} คอลัมน์ ในร้าน TikTok (ใช้ซ้ำกับสินค้าอื่นได้) · มีประวัติว่าใครสร้าง</p>
            <p className="text-xs text-slate-500">ยังไม่ผูกกับสินค้า — หลังสร้าง ระบบเลือกให้สินค้านี้ แล้วต้องกด “บันทึกขึ้น TikTok” อีกครั้งถึงจะใช้ (TikTok ตรวจใหม่)</p>
          </div>
        )} />
    </div>
  );
}
