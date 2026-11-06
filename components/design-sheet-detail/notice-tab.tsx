"use client";

/**
 * แท็บ "📣 แจ้งลูกค้า" ในใบงานออกแบบ — เจ้าของขอ 2026-11-06 (ดู widget แล้ว "สร้างเลย")
 *
 * 1 ใบงานมีได้หลายใบแจ้ง (เก็บเป็นประวัติ) · แต่ละใบ:
 *   แบบแจ้ง (ผ้าที่มาทำได้กี่ใบ / ใช้ผ้ากี่หลาต่อใบ / แจ้งทั่วไป) · หัวข้อ · รูปหลายรูป + คำอธิบายใต้รูปทีละรูป
 *   · ตารางผ้าต่อไซส์ (ใช้ต่อใบดึงจากแท็บตีราคาได้) · ข้อความถึงลูกค้า
 * พรีวิวทางขวา = ใบเดียวกับที่ออก PDF/JPEG (lib/design-sheet-notice buildNoticeHtml)
 * กด PDF / JPEG → หน้าพิมพ์ /print/design-sheet/[id]/notice/[noticeId] (มีแผงเลือกโชว์/ซ่อนแบบละเอียด)
 *
 * ของกลาง: SheetImagePicker (รูปใบงาน + ImageManager) · LineItemsGrid · SearchableSelect · ERPModal · ConfirmDialog · PrintFrame · useUserPref · Icon
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { PrintFrame } from "@/components/report";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import type { SheetSize } from "@/lib/cost-usage";
import {
  buildNoticeHtml, cleanNotice, cleanNoticeDisplay, computeNotice, DEFAULT_NOTICE_DISPLAY, newNoticeDoc, noticeCompanyFrom, noticeDateText,
  noticeHasCalc, noticeKindMeta, noticeMaterialsFromCost, noticeRowsFromMaterial, noticeTabRow, noticeTabsFor, NOTICE_KINDS,
  type NoticeCostLine, type NoticeCostTab, type NoticeDisplay, type NoticeDoc, type NoticeImage, type NoticeKind, type NoticeRecord, type NoticeRow,
} from "@/lib/design-sheet-notice";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";
import { SheetImagePicker } from "./sheet-image-picker";

type Draft = NoticeDoc & { id: string | null; created_by_name: string | null; created_at: string | null };
type GridRow = NoticeRow & { _k: string };

const KIND_ICON: Record<NoticeKind, string> = { yield: "cut", usage: "ruler", free: "chat" };
const snap = (d: Draft | null) => (d ? JSON.stringify(cleanNotice(d)) : "");
const toDraft = (r: NoticeRecord): Draft => ({ ...r, id: r.id, created_by_name: r.created_by_name, created_at: r.created_at });
const fmtN = (n: number | null | undefined, d = 2) => (n == null ? "—" : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH"));
let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** ช่องตัวเลข (ว่าง = null) — อยู่นอกตัวแท็บ กันช่องหลุดโฟกัสตอนพิมพ์ */
function NumIn({ value, onChange, disabled, step = "any", placeholder, className = "w-24" }: {
  value: number | null; onChange: (v: number | null) => void; disabled?: boolean; step?: string; placeholder?: string; className?: string;
}) {
  return (
    <input type="number" inputMode="decimal" min={0} step={step} value={value ?? ""} disabled={disabled} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
      className={`h-8 px-2 text-sm text-right border border-slate-200 rounded-lg disabled:bg-slate-50 ${className}`} />
  );
}

function Seg<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" disabled={disabled} onClick={() => onChange(o.v)}
          className={`h-7 px-2.5 text-xs rounded-md ${value === o.v ? "bg-white text-slate-900 font-medium shadow-sm" : "text-slate-500 hover:text-slate-800"} disabled:opacity-60`}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function DesignSheetNoticeTab({ sheetId, canEdit, sheet, costTabs, costLines, sheetOf, orderOf, onDirtyChange, saveRef, onCountChange }: {
  sheetId: string;
  canEdit: boolean;
  sheet: { code: string; name: string; brandName: string };
  /** แท็บไซส์ของตีราคา (ทั่วไป + Parent จริง/ร่าง + แท็บค้าง) */
  costTabs: NoticeCostTab[];
  /** บรรทัดตีราคาทุกแท็บ (ไม่มีสิทธิ์ดูต้นทุน = ว่าง → พิมพ์ใช้ต่อใบเอง) */
  costLines: NoticeCostLine[];
  sheetOf?: (itemId: string) => SheetSize | null | undefined;
  /** จำนวนสั่งตั้งต้นของไซส์ (เช่น จากรอบเสนอราคาล่าสุด) */
  orderOf?: (tabKey: string) => number | null;
  onDirtyChange?: (dirty: boolean) => void;
  /** ปุ่ม "บันทึกแล้วปิด" ของป๊อปใบงาน เรียกบันทึกแท็บนี้ได้ */
  saveRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  onCountChange?: (n: number) => void;
}) {
  const t = useT();
  const toast = useToast();
  const { user } = useAuth();
  const [list, setList] = useState<NoticeRecord[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [cur, setCur] = useState<Draft | null>(null);
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickImg, setPickImg] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const [companies, setCompanies] = useState<Record<string, unknown>[]>([]);
  const [allOrder, setAllOrder] = useState<number | null>(null);
  // ค่าตั้งต้น "สิ่งที่จะโชว์" ของคนนี้ (หน้าพิมพ์ติ๊ก "จำไว้ใช้ครั้งหน้า") → ใบแจ้งใหม่ใช้ค่านี้
  const [defDisplay] = useUserPref<NoticeDisplay>("ds_notice_display", DEFAULT_NOTICE_DISPLAY, (v) => (v && typeof v === "object" ? cleanNoticeDisplay(v) : null));

  const dirty = !!cur && canEdit && snap(cur) !== base;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (list) onCountChange?.(list.length); }, [list, onCountChange]);

  const mats = useMemo(() => noticeMaterialsFromCost(costLines, sheetOf), [costLines, sheetOf]);
  const matOptions: SelectOption[] = useMemo(() => mats.map((m) => ({
    value: m.key, label: m.name,
    sub: costTabs.filter((tb) => m.perTab[tb.key] != null).map((tb) => `${tb.label} ${fmtN(m.perTab[tb.key], 3)}`).join(" · ") + ` ${m.unit}`,
  })), [mats, costTabs]);

  // ---- โหลดรายการ + ทะเบียนบริษัท (หัวกระดาษ) ----
  const curRef = useRef<Draft | null>(null);
  useEffect(() => { curRef.current = cur; }, [cur]);
  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/notices`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const rows = (j.data ?? []) as NoticeRecord[];
      setList(rows); setLoadErr(null);
      if (!curRef.current && rows[0]) { const first = toDraft(rows[0]); setCur(first); setBase(snap(first)); }   // เปิดมาเห็นใบล่าสุด
    } catch (e) { setLoadErr(e instanceof Error ? e.message : t("โหลดใบแจ้งไม่ได้", "Could not load notices")); setList([]); }
  }, [sheetId, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => r.json()).then((j) => setCompanies((j.data ?? []) as Record<string, unknown>[])).catch(() => { /* ไม่มีหัวบริษัทก็ยังแจ้งได้ */ });
  }, []);

  // ---- สร้าง / สลับใบ (มีแก้ค้าง = ถามก่อน) ----
  const guard = (fn: () => void) => { if (dirty) setPendingSwitch(() => fn); else fn(); };
  const seedRows = useCallback((): { rows: NoticeRow[]; material: string; unit: string; unit_note: string } => {
    const fabric = mats[0];   // จัดอันดับไว้แล้ว: ผ้า → แพงสุด (= ผ้าหลัก) — lib noticeMaterialsFromCost
    if (fabric) return { rows: noticeRowsFromMaterial(fabric, costTabs, orderOf), material: fabric.name, unit: fabric.unit, unit_note: fabric.note };
    const tabs = costTabs.filter((tb) => tb.key !== "");
    const rows = (tabs.length ? tabs : costTabs.slice(0, 1)).map((tb) => ({ key: tb.key || "general", label: tb.label, use: null, order: orderOf?.(tb.key) ?? null }));
    return { rows, material: "", unit: "หลา", unit_note: "" };
  }, [mats, costTabs, orderOf]);
  const startNew = (kind: NoticeKind) => guard(() => {
    const d: Draft = { ...newNoticeDoc(kind, defDisplay), id: null, created_by_name: user?.name ?? null, created_at: null };
    if (noticeHasCalc(kind)) d.calc = { ...d.calc, ...seedRows() };
    setCur(d); setBase(snap(d));
  });
  const openNotice = (r: NoticeRecord) => guard(() => { const d = toDraft(r); setCur(d); setBase(snap(d)); });
  const duplicate = () => {
    if (!cur) return;
    guard(() => { const d: Draft = { ...cleanNotice(cur), id: null, created_by_name: user?.name ?? null, created_at: null, title: `${cur.title} (ใหม่)` }; setCur(d); setBase(""); });
  };

  const patch = (p: Partial<NoticeDoc>) => setCur((c) => (c ? { ...c, ...p } : c));
  const patchCalc = (p: Partial<NoticeDoc["calc"]>) => setCur((c) => (c ? { ...c, calc: { ...c.calc, ...p } } : c));
  const changeKind = (kind: NoticeKind) => setCur((c) => {
    if (!c || c.kind === kind) return c;
    const old = noticeKindMeta(c.kind), nw = noticeKindMeta(kind);
    const next: Draft = { ...c, kind,
      title: !c.title.trim() || c.title === old.title ? nw.title : c.title,
      note: !c.note.trim() || c.note === old.note ? nw.note : c.note };
    if (noticeHasCalc(kind) && !c.calc.rows.length) next.calc = { ...c.calc, ...seedRows() };
    return next;
  });

  // ---- รูป ----
  const toggleImage = (im: DesignSheetImage) => setCur((c) => {
    if (!c) return c;
    const has = c.images.some((x) => x.url === im.url || (!!x.key && x.key === im.key));
    return { ...c, images: has ? c.images.filter((x) => !(x.url === im.url || (!!x.key && x.key === im.key))) : [...c.images, { url: im.url, key: im.key, caption: "" }] };
  });
  const setImage = (i: number, p: Partial<NoticeImage>) => setCur((c) => (c ? { ...c, images: c.images.map((x, j) => (j === i ? { ...x, ...p } : x)) } : c));
  const moveImage = (i: number, d: -1 | 1) => setCur((c) => {
    if (!c) return c; const j = i + d; if (j < 0 || j >= c.images.length) return c;
    const arr = [...c.images]; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...c, images: arr };
  });
  const removeImage = (i: number) => setCur((c) => (c ? { ...c, images: c.images.filter((_, j) => j !== i) } : c));

  // ---- วัตถุดิบที่กำลังแจ้ง (ชื่อตรงกับในตีราคา) → ชิปเลือกไซส์จากแท็บตีราคา ----
  const curMatBase = useMemo(() => (cur ? mats.find((m) => m.name === cur.calc.material.trim()) ?? null : null), [mats, cur]);
  // ใช้ตัวเลขของหน่วยที่เลือกอยู่ (ผ้าแบบผืน: หลา / ผืน)
  const curMat = useMemo(() => {
    if (!curMatBase || !cur) return null;
    const u = curMatBase.units.find((x) => x.unit === cur.calc.unit);
    return u ? { ...curMatBase, unit: u.unit, perTab: u.perTab, note: u.note } : curMatBase;
  }, [curMatBase, cur]);
  const curMatTabs = useMemo(() => (curMat ? noticeTabsFor(curMat, costTabs).all : []), [curMat, costTabs]);
  const toggleTab = (tb: NoticeCostTab) => {
    if (!cur || !curMat) return;
    const key = tb.key || "general";
    const on = cur.calc.rows.some((r) => r.key === key);
    patchCalc({ rows: on ? cur.calc.rows.filter((r) => r.key !== key) : [...cur.calc.rows, noticeTabRow(curMat, tb, orderOf)] });
  };
  // สลับหน่วย (หลา ↔ ผืน) → ใช้ต่อใบของแถวที่มาจากแท็บตีราคาเปลี่ยนตาม · แถวที่พิมพ์เองไม่แตะ
  const switchUnit = (unit: string) => {
    if (!cur || !curMatBase) return;
    const u = curMatBase.units.find((x) => x.unit === unit); if (!u) return;
    const tabOf = new Map(costTabs.map((tb) => [tb.key || "general", tb.key]));
    patchCalc({
      unit: u.unit, unit_note: u.note,
      rows: cur.calc.rows.map((r) => { const k = tabOf.get(r.key); return k != null && u.perTab[k] != null ? { ...r, use: u.perTab[k] } : r; }),
    });
  };

  // ---- ดึงใช้ต่อใบจากตีราคา (เก็บจำนวนสั่งที่พิมพ์ไว้แล้ว) ----
  const pullMaterial = (key: string) => {
    const m = mats.find((x) => x.key === key); if (!m || !cur) return;
    const prevOrder = new Map(cur.calc.rows.map((r) => [r.key, r.order]));
    const rows = noticeRowsFromMaterial(m, costTabs, orderOf).map((r) => ({ ...r, order: prevOrder.get(r.key) ?? r.order }));
    patchCalc({ material: m.name, unit: m.unit, unit_note: m.note, rows: rows.length ? rows : cur.calc.rows });
    if (!rows.length) toast.error(t("วัตถุดิบนี้ไม่มีตัวเลขใช้ต่อใบในแท็บตีราคา", "This material has no per-bag usage in costing"));
  };

  // ---- บันทึก ----
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!cur) return null;
    if (!canEdit) { toast.error(t("คุณไม่มีสิทธิ์แก้ใบแจ้ง", "You cannot edit notices")); return null; }
    setSaving(true);
    try {
      const doc = cleanNotice(cur);
      const res = cur.id
        ? await apiFetch(`/api/design-sheets/${sheetId}/notices/${cur.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) })
        : await apiFetch(`/api/design-sheets/${sheetId}/notices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      const rec = j.data as NoticeRecord;
      setList((prev) => [rec, ...(prev ?? []).filter((x) => x.id !== rec.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      const d = toDraft(rec); setCur(d); setBase(snap(d));
      toast.success(t("บันทึกใบแจ้งแล้ว", "Notice saved"));
      return rec.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"));
      return null;
    } finally { setSaving(false); }
  }, [cur, canEdit, sheetId, t, toast]);
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = async () => (await saveDraft()) != null;
    return () => { saveRef.current = null; };
  }, [saveRef, saveDraft]);

  const doDelete = async () => {
    if (!cur?.id) return;
    const res = await apiFetch(`/api/design-sheets/${sheetId}/notices/${cur.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) { toast.error(j.error || t("ลบไม่สำเร็จ", "Delete failed")); return; }
    const rest = (list ?? []).filter((x) => x.id !== cur.id);
    setList(rest);
    const next = rest[0] ? toDraft(rest[0]) : null;
    setCur(next); setBase(snap(next)); setConfirmDel(false);
    toast.success(t("ลบใบแจ้งแล้ว", "Notice deleted"));
  };

  // ---- ส่งออก: บันทึกก่อน (ถ้ามีแก้) แล้วเปิดหน้าพิมพ์ ----
  const openExport = async (as: "pdf" | "jpg") => {
    if (!cur) return;
    const url = (id: string) => `/print/design-sheet/${sheetId}/notice/${id}?as=${as}`;
    if (cur.id && !dirty) { window.open(url(cur.id), "_blank", "noopener"); return; }
    if (!canEdit) return;
    const w = window.open("", "_blank");   // เปิดแท็บก่อน (ตอนยังเป็นการกดของผู้ใช้) กันโดนบล็อกป๊อปอัป
    const id = await saveDraft();
    if (id && w) w.location.href = url(id);
    else if (id) window.open(url(id), "_blank", "noopener");
    else w?.close();
  };

  // ---- พรีวิว (หน่วงเล็กน้อย กันกระพริบตอนพิมพ์) ----
  const [html, setHtml] = useState("");
  const company = useMemo(() => noticeCompanyFrom(companies, cur?.display.fmt.company_id ?? null), [companies, cur?.display.fmt.company_id]);
  useEffect(() => {
    if (!cur) { setHtml(""); return; }
    const h = setTimeout(() => {
      setHtml(buildNoticeHtml(cleanNotice(cur), {
        sheetCode: sheet.code, sheetName: sheet.name, brandName: sheet.brandName, company,
        senderName: cur.created_by_name || user?.name || "", dateText: noticeDateText(cur.created_at),
      }));
    }, 300);
    return () => clearTimeout(h);
  }, [cur, company, sheet.code, sheet.name, sheet.brandName, user?.name]);

  const res = useMemo(() => (cur && noticeHasCalc(cur.kind) ? computeNotice(cur.calc) : null), [cur]);
  const ro = !canEdit;

  // ---- ตารางไซส์ (ตารางบรรทัดกลาง) ----
  const gridRows: GridRow[] = useMemo(() => (cur?.calc.rows ?? []).map((r, i) => ({ ...r, _k: `${r.key}#${i}` })), [cur?.calc.rows]);
  const columns: LineColumn<GridRow>[] = useMemo(() => [
    { key: "label", header: t("ไซส์", "Size"), minWidth: 110,
      render: (r, up, readonly) => <input value={r.label} disabled={readonly} onChange={(e) => up({ label: e.target.value })} placeholder={t("เช่น XS", "e.g. XS")} className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" /> },
    { key: "use", header: t(`ใช้ต่อใบ (${cur?.calc.unit || "หลา"})`, `Per bag (${cur?.calc.unit || "yd"})`), width: 130, align: "right",
      render: (r, up, readonly) => <NumIn value={r.use} disabled={readonly} onChange={(v) => up({ use: v })} className="w-full" /> },
    { key: "order", header: t("จำนวนสั่ง (ใบ)", "Order (pcs)"), width: 130, align: "right",
      render: (r, up, readonly) => <NumIn value={r.order} step="1" disabled={readonly} onChange={(v) => up({ order: v == null ? null : Math.round(v) })} className="w-full" /> },
  ], [t, cur?.calc.unit]);

  if (list == null) return <p className="text-sm text-slate-400 py-6 text-center">{t("กำลังโหลดใบแจ้ง…", "Loading notices…")}</p>;

  return (
    <div className="space-y-3">
      {loadErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{loadErr}</div>}

      {/* แถบบน: ใบแจ้งที่เคยทำ + สร้างใหม่ */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-600 inline-flex items-center gap-1.5"><Icon name="campaign" /> {t(`ใบแจ้งลูกค้า (${list.length})`, `Customer notices (${list.length})`)}</span>
        {canEdit && <span className="text-xs text-slate-400 ml-1">{t("ใบใหม่:", "New:")}</span>}
        {canEdit && NOTICE_KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => startNew(k.key)}
            className="h-8 px-2.5 text-xs border border-dashed border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-blue-300 inline-flex items-center gap-1">
            <Icon name="add" /> <Icon name={KIND_ICON[k.key]} /> {t(k.label, k.label)}
          </button>
        ))}
      </div>
      {list.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((r) => {
            const on = cur?.id === r.id;
            return (
              <button key={r.id} type="button" onClick={() => openNotice(r)}
                className={`shrink-0 w-52 text-left rounded-lg border px-3 py-2 ${on ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 min-w-0"><Icon name={KIND_ICON[r.kind]} /><span className="truncate">{r.title || noticeKindMeta(r.kind).title}</span></span>
                <span className="block text-[11px] text-slate-400 truncate">{noticeKindMeta(r.kind).label} · {noticeDateText(r.created_at)}{r.created_by_name ? ` · ${r.created_by_name}` : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      {!cur ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
          <p className="text-sm text-slate-600">{t("ยังไม่มีใบแจ้งลูกค้าในใบงานนี้", "No customer notices on this sheet yet")}</p>
          <p className="text-xs text-slate-400 mt-1">{canEdit
            ? t("เลือกแบบแจ้งด้านบน เช่น ผ้าที่ลูกค้าส่งมาทำได้กี่ใบ หรือแจ้งทั่วไปพร้อมรูปและคำอธิบาย แล้วออกเป็น PDF / JPEG ส่งลูกค้า", "Pick a notice type above, then export it as PDF / JPEG for the customer")
            : t("คุณดูได้อย่างเดียว — ให้คนที่มีสิทธิ์แก้ใบงานเป็นคนสร้าง", "View only — someone who can edit the sheet must create one")}</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ซ้าย: แก้ไขใบแจ้ง */}
          <div className="space-y-3 min-w-0">
            <div>
              <div className="text-xs text-slate-500 mb-1">{t("แบบแจ้ง", "Notice type")}</div>
              <div className="flex gap-1.5 flex-wrap">
                {NOTICE_KINDS.map((k) => (
                  <button key={k.key} type="button" disabled={ro} onClick={() => changeKind(k.key)}
                    className={`h-8 px-2.5 text-xs rounded-lg border inline-flex items-center gap-1 ${cur.kind === k.key ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"} disabled:opacity-70`}>
                    <Icon name={KIND_ICON[k.key]} /> {t(k.label, k.label)}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs text-slate-500">{t("หัวข้อ (ขึ้นบนหัวใบ)", "Title (top of the notice)")}</span>
              <input value={cur.title} disabled={ro} onChange={(e) => patch({ title: e.target.value })} maxLength={200}
                className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
            </label>

            {/* รูป + คำอธิบายใต้รูป */}
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-600 inline-flex items-center gap-1.5"><Icon name="image" /> {t(`รูป (${cur.images.length})`, `Images (${cur.images.length})`)}</span>
                <span className="flex-1" />
                <span className="text-xs text-slate-400">{t("รูปต่อแถว", "Per row")}</span>
                <Seg value={cur.img_cols} disabled={ro} options={[1, 2, 3, 4].map((n) => ({ v: n, label: String(n) }))} onChange={(v) => patch({ img_cols: v })} />
                {canEdit && <button type="button" onClick={() => setPickImg(true)} className="h-8 px-2.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"><Icon name="add" /> {t("เลือกรูป", "Pick images")}</button>}
              </div>
              {cur.images.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">{t("ยังไม่มีรูป — กด \"เลือกรูป\" เลือกจากรูปในใบงานหรืออัปโหลดเพิ่ม (เลือกได้หลายรูป หลายสินค้า)", "No images yet — pick from this sheet or upload (several images / products)")}</p>
              ) : (
                <div className="space-y-2">
                  {cur.images.map((im, i) => (
                    <div key={`${im.url}#${i}`} className="flex gap-2 items-start">
                      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute left-0.5 top-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-900/80 text-white text-[10px] flex items-center justify-center">{i + 1}</span>
                      </div>
                      <textarea value={im.caption} disabled={ro} onChange={(e) => setImage(i, { caption: e.target.value })} rows={2} maxLength={1000}
                        placeholder={t("คำอธิบายใต้รูป (เว้นว่างได้) เช่น ไซส์ / สี / จุดที่อยากให้ลูกค้าดู", "Caption under the image (optional)")}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-200 rounded-lg resize-y disabled:bg-slate-50" />
                      {canEdit && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} title={t("เลื่อนขึ้น", "Move up")} className="h-6 w-7 text-xs border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 disabled:opacity-30">▲</button>
                          <button type="button" onClick={() => moveImage(i, 1)} disabled={i === cur.images.length - 1} title={t("เลื่อนลง", "Move down")} className="h-6 w-7 text-xs border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 disabled:opacity-30">▼</button>
                          <button type="button" onClick={() => removeImage(i)} title={t("เอารูปนี้ออก", "Remove image")} className="h-6 w-7 inline-flex items-center justify-center border border-slate-200 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Icon name="delete" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ตารางผ้า (เฉพาะแบบที่มีตัวเลข) */}
            {noticeHasCalc(cur.kind) && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-600 inline-flex items-center gap-1.5"><Icon name="ruler" /> {t("ผ้า / วัตถุดิบที่แจ้ง", "Material")}</span>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <input value={cur.calc.material} disabled={ro} onChange={(e) => patchCalc({ material: e.target.value })} maxLength={200}
                    placeholder={t("ชื่อผ้า เช่น ผ้าลายสก็อตแดง (ลูกค้าส่งมา)", "Material name")}
                    className="flex-1 min-w-[180px] h-8 px-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
                  <input value={cur.calc.unit} disabled={ro} onChange={(e) => patchCalc({ unit: e.target.value })} maxLength={20} title={t("หน่วย", "Unit")}
                    className="w-16 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg disabled:bg-slate-50" />
                  {curMatBase && curMatBase.units.length > 1 && (
                    <Seg value={cur.calc.unit} disabled={ro} onChange={switchUnit}
                      options={curMatBase.units.map((u) => ({ v: u.unit, label: u.note ? `${u.unit} (${u.note})` : u.unit }))} />
                  )}
                  {canEdit && matOptions.length > 0 && (
                    <div className="w-full sm:w-64">
                      <SearchableSelect value="" options={matOptions} onChange={pullMaterial} placeholder={t("ดึงใช้ต่อใบจากแท็บตีราคา…", "Pull usage from costing…")} />
                    </div>
                  )}
                </div>
                <input value={cur.calc.unit_note} disabled={ro} onChange={(e) => patchCalc({ unit_note: e.target.value })} maxLength={120}
                  placeholder={t("หมายเหตุหน่วย (ขึ้นในใบ) เช่น คิดจากหน้ากว้าง 80 ซม.", "Unit note (printed)")}
                  className="w-full h-8 px-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50" />
                {curMat && canEdit && curMatTabs.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400">{t("ไซส์จากแท็บตีราคา (กดเพิ่ม/เอาออก):", "Sizes from costing (click to add/remove):")}</span>
                    {curMatTabs.map((tb) => {
                      const on = cur.calc.rows.some((r) => r.key === (tb.key || "general"));
                      return (
                        <button key={tb.key || "general"} type="button" onClick={() => toggleTab(tb)}
                          title={tb.kind === "orphan" ? t("แท็บนี้ไม่อยู่ในรายการ Parent แล้ว (อาจเป็นของเก่า)", "Not in the Parent list any more (may be old)") : undefined}
                          className={`h-7 px-2 text-xs rounded-lg border ${on ? "border-blue-400 bg-blue-50 text-blue-700" : "border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
                          {on ? "✓ " : "+ "}{tb.label}{tb.kind === "orphan" ? " ·เก่า" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {matOptions.length === 0 && canEdit && (
                  <p className="text-[11px] text-slate-400">{t("แท็บตีราคายังไม่มีวัตถุดิบที่คิดปริมาณได้ (หรือคุณไม่มีสิทธิ์ดูต้นทุน) — พิมพ์ใช้ต่อใบเองในตารางด้านล่าง", "No usable costing lines (or no cost permission) — type per-bag usage below")}</p>
                )}
                <div className="flex gap-x-4 gap-y-2 flex-wrap items-center text-sm text-slate-600">
                  {cur.kind === "yield" && (
                    <span className="inline-flex items-center gap-1.5">{t("ผ้าที่ได้รับ", "Received")} <NumIn value={cur.calc.received} disabled={ro} onChange={(v) => patchCalc({ received: v })} /> {cur.calc.unit}</span>
                  )}
                  <span className="inline-flex items-center gap-1.5">{t("เผื่อเสีย", "Waste")} <NumIn value={cur.calc.waste_pct || null} disabled={ro} onChange={(v) => patchCalc({ waste_pct: Math.min(100, v ?? 0) })} className="w-16" placeholder="0" /> %</span>
                  {cur.kind === "yield" && (
                    <Seg value={cur.calc.mode} disabled={ro} onChange={(v) => patchCalc({ mode: v })}
                      options={[{ v: "ratio", label: t("แบ่งตามที่สั่ง", "Split by order") }, { v: "single", label: t("ถ้าทำไซส์เดียว", "One size only") }]} />
                  )}
                </div>
                <LineItemsGrid<GridRow>
                  rows={gridRows}
                  columns={columns}
                  rowId={(r) => r._k}
                  readonly={ro}
                  onChange={(rows) => patchCalc({ rows: rows.map(({ _k, ...r }) => { void _k; return r; }) })}
                  onAdd={() => ({ key: newKey(), label: "", use: null, order: null, _k: newKey() })}
                  addLabel={t("＋ เพิ่มไซส์", "＋ Add size")}
                  emptyText={t("ยังไม่มีไซส์ — เพิ่มเอง หรือดึงจากแท็บตีราคา", "No sizes yet — add one or pull from costing")}
                  addExtra={canEdit && gridRows.length > 1 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      {t("จำนวนสั่งเท่ากันทุกไซส์", "Same order for all")}
                      <NumIn value={allOrder} step="1" onChange={setAllOrder} className="w-20" />
                      <button type="button" disabled={allOrder == null} onClick={() => patchCalc({ rows: cur.calc.rows.map((r) => ({ ...r, order: allOrder })) })}
                        className="h-8 px-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">{t("ใส่", "Apply")}</button>
                    </span>
                  ) : undefined}
                />
                {res && res.rows.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {cur.kind === "usage"
                      ? t(`ต้องเตรียมผ้ารวม ${fmtN(res.need)} ${cur.calc.unit}`, `Total needed ${fmtN(res.need)} ${cur.calc.unit}`)
                      : res.enough == null ? t(`ต้องใช้ผ้ารวม ${fmtN(res.need)} ${cur.calc.unit} — ใส่ "ผ้าที่ได้รับ" เพื่อคิดว่าทำได้กี่ใบ`, `Needs ${fmtN(res.need)} ${cur.calc.unit} — enter received to calculate`)
                      : res.enough ? t(`ผ้าพอ · เหลือ ${fmtN(res.left)} ${cur.calc.unit}`, `Enough · ${fmtN(res.left)} left`)
                      : t(`ผ้าขาดอีก ${fmtN(res.short)} ${cur.calc.unit} · ทำได้รวม ${res.can.toLocaleString("th-TH")} ใบ`, `Short ${fmtN(res.short)} · can make ${res.can}`)}
                  </p>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-xs text-slate-500">{t("ข้อความถึงลูกค้า", "Message to the customer")}</span>
              <textarea value={cur.note} disabled={ro} onChange={(e) => patch({ note: e.target.value })} rows={4} maxLength={5000}
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y disabled:bg-slate-50" />
            </label>

            {canEdit && (
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => void saveDraft()} disabled={saving || (!dirty && !!cur.id)}
                  className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Icon name="save" /> {saving ? t("กำลังบันทึก…", "Saving…") : cur.id ? t("บันทึกใบแจ้ง", "Save notice") : t("บันทึกใบแจ้งใหม่", "Save new notice")}
                </button>
                {dirty && <span className="text-xs text-amber-600">{t("มีแก้ไขที่ยังไม่บันทึก", "Unsaved changes")}</span>}
                <span className="flex-1" />
                {cur.id && <button type="button" onClick={duplicate} className="h-9 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">{t("คัดลอกเป็นใบใหม่", "Copy as new")}</button>}
                {cur.id && <button type="button" onClick={() => setConfirmDel(true)} className="h-9 px-3 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 inline-flex items-center gap-1"><Icon name="delete" /> {t("ลบ", "Delete")}</button>}
              </div>
            )}
          </div>

          {/* ขวา: พรีวิว + ส่งออก */}
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">{t("ตัวอย่างใบแจ้ง", "Preview")}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => void openExport("pdf")} disabled={saving || (!cur.id && !canEdit)}
                className="h-8 px-3 text-sm border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"><Icon name="print" /> PDF</button>
              <button type="button" onClick={() => void openExport("jpg")} disabled={saving || (!cur.id && !canEdit)}
                className="h-8 px-3 text-sm border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"><Icon name="image" /> {t("JPEG (ส่ง LINE)", "JPEG (LINE)")}</button>
            </div>
            <p className="text-[11px] text-slate-400">{t("กด PDF / JPEG = เปิดหน้าส่งออก เลือกได้ว่าจะโชว์หรือซ่อนอะไรในใบ (บันทึกให้ก่อนอัตโนมัติ)", "PDF / JPEG opens the export page where you choose what to show (saves first)")}</p>
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-2">
              {html ? <PrintFrame html={html} fit /> : <p className="text-xs text-slate-400 py-10 text-center">{t("กำลังสร้างตัวอย่าง…", "Building preview…")}</p>}
            </div>
          </div>
        </div>
      )}

      <ERPModal open={pickImg} onClose={() => setPickImg(false)} title={t("เลือกรูปใส่ใบแจ้ง (กดซ้ำ = เอาออก)", "Pick images (click again to remove)")} size="lg"
        footer={<button type="button" onClick={() => setPickImg(false)} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t(`เสร็จ (${cur?.images.length ?? 0} รูป)`, `Done (${cur?.images.length ?? 0})`)}</button>}>
        {pickImg && <SheetImagePicker sheetId={sheetId} onPick={toggleImage} usedLabel={t("เลือกแล้ว", "Picked")}
          usedKeys={new Set((cur?.images ?? []).flatMap((x) => [x.url, ...(x.key ? [x.key] : [])]))} />}
      </ERPModal>
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={() => void doDelete()} variant="danger"
        title={t("ลบใบแจ้งนี้", "Delete this notice")} confirmText={t("ลบ", "Delete")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`ลบใบแจ้ง "${cur?.title ?? ""}" หรือไม่? (รูปในใบงานไม่ถูกลบ)`, `Delete notice "${cur?.title ?? ""}"? (sheet images are kept)`)} />
      <ConfirmDialog open={pendingSwitch !== null} onClose={() => setPendingSwitch(null)}
        onConfirm={() => { const fn = pendingSwitch; setPendingSwitch(null); fn?.(); }}
        title={t("ยังไม่ได้บันทึก", "Not saved")} confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")} cancelText={t("อยู่ต่อ", "Stay")} variant="danger"
        message={t("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?", "You have unsaved changes. Leave without saving?")} />
    </div>
  );
}
