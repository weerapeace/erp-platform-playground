"use client";

/**
 * 🖨 พิมพ์สรุปงานหน้าสั่งซื้อ — /print/purchasing-orders?mode=order|recv (เจ้าของอนุมัติ 2026-11-02 จาก widget รุ่น 4)
 *   order = ของรอสั่ง (/api/purchasing/orderable) · recv = ของรอรับ (/api/purchasing/receivable) · เปิดจากปุ่ม "พิมพ์สรุป" ใน /purchasing/orders
 *   ตัวสร้างใบ = lib/purchasing-print (เทสต์ได้) · ตั้งค่า = ของกลาง lib/list-print + ListPrintPanel (+ตัวเลือกเฉพาะใบใน extra)
 *   ช่องใบสั่งผลิต = /api/mo/brief (รูป/ชื่อ/จำนวน/กำหนดส่ง) · หมายเหตุพิมพ์เอง = usePrintNotes (ทั้งทีมเห็น)
 *   "เฉพาะที่ติ๊กไว้" = สั่งซื้อ: ที่ติ๊กเลือกหลายชิ้น (erp.poPrint.pick.order) หรือในตะกร้าสั่งซื้อ · รอรับ: ในตะกร้ารับของ
 */
import { shortcutKey } from "@/lib/shortcut-key";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { Check, ListPrintPanel, Section } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { usePrintNotes } from "@/components/report/use-print-notes";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { estimateListPages } from "@/lib/list-print";
import {
  PO_MO_FIELDS, PO_MO_QUICK, PO_PRINT_GROUPS, PO_PRINT_NOTES, PO_PRINT_PICK_KEY, PO_PRINT_SORTS, PO_PRINT_TITLE, PO_PRINT_SIGN, buildPoPrint, poItemsFromOrderable, poItemsFromReceivable,
  poPrintColumns, poPrintDefaults, poPrintOpts, poPrintPresets,
  type MoBrief, type PoMoShow, type PoPrintItem, type PoPrintMode, type PoPrintOpts,
} from "@/lib/purchasing-print";

const PANEL_KEY = "print:panel-open";
const PICK_TTL_MS = 12 * 3600 * 1000;
type Company = { id: string; name: string; logo_key: string | null };

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const chip = (on: boolean) => `inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors ${on ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

/** ที่ติ๊กไว้บนหน้าสั่งซื้อ (อ่านจาก localStorage ของหน้าสั่งซื้อ) */
function readPicks(mode: PoPrintMode): Set<string> | null {
  try {
    if (mode === "order") {
      const p = JSON.parse(localStorage.getItem(PO_PRINT_PICK_KEY) ?? "null") as { ids?: string[]; at?: number } | null;
      if (p?.ids?.length && Date.now() - (p.at ?? 0) < PICK_TTL_MS) return new Set(p.ids);
      const cart = JSON.parse(localStorage.getItem("po_create_cart") ?? "{}") as Record<string, unknown>;
      return Object.keys(cart).length ? new Set(Object.keys(cart)) : null;
    }
    const cart = JSON.parse(localStorage.getItem("po_recv_cart") ?? "{}") as Record<string, unknown>;
    return Object.keys(cart).length ? new Set(Object.keys(cart)) : null;
  } catch { return null; }
}

function PurchasingOrdersPrintInner() {
  const mode: PoPrintMode = useSearchParams().get("mode") === "recv" ? "recv" : "order";
  return <PurchasingOrdersPrintView key={mode} mode={mode} />;
}

function PurchasingOrdersPrintView({ mode }: { mode: PoPrintMode }) {
  const router = useRouter();
  const { can } = useAuth();
  const available = useMemo(() => poPrintColumns(mode), [mode]);
  const defaults = useMemo(() => poPrintDefaults(mode), [mode]);
  const presets = useMemo(() => poPrintPresets(mode), [mode]);
  const print = useListPrintSettings({ reportKey: `purchasing-orders:${mode}`, family: `purchasing-orders:${mode}`, available, defaults });
  const s = print.settings;
  const o = poPrintOpts(s, mode);
  const setOpts = (patch: Partial<PoPrintOpts>, turnMoOn = false) => print.setSettings({
    ...s, opts: { ...s.opts, ...patch },
    // กดปุ่มช่องใบสั่งผลิตตอนคอลัมน์ปิดอยู่ = เปิดคอลัมน์ให้
    columns: turnMoOn && s.groupBy !== "mo" ? s.columns.map((c) => (c.key === "mo" ? { ...c, on: true } : c)) : s.columns,
  });

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setPanelOpen(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  // ---- ข้อมูล ----
  const [items, setItems] = useState<PoPrintItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); setItems(null);
    try {
      const r = await apiFetch(mode === "order" ? "/api/purchasing/orderable" : "/api/purchasing/receivable");
      const j = (await r.json().catch(() => ({}))) as { data?: Record<string, unknown>[]; error?: string };
      if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ไม่มีสิทธิ์ดูรายการนี้" : "โหลดรายการไม่สำเร็จ");
      setItems(mode === "order" ? poItemsFromOrderable(j.data ?? []) : poItemsFromReceivable(j.data ?? []));
    } catch (e) { setError((e as Error).message || "โหลดรายการไม่สำเร็จ"); }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);

  const [mos, setMos] = useState<Map<string, MoBrief>>(new Map());
  useEffect(() => {
    const nos = [...new Set((items ?? []).map((i) => i.mo_no).filter(Boolean) as string[])];
    if (!nos.length) return;
    let on = true;
    (async () => {
      const m = new Map<string, MoBrief>();
      for (let i = 0; i < nos.length; i += 150) {
        const r = await apiFetch(`/api/mo/brief?nos=${encodeURIComponent(nos.slice(i, i + 150).join(","))}`).catch(() => null);
        const j = r?.ok ? ((await r.json().catch(() => ({}))) as { data?: MoBrief[] }) : {};
        for (const b of j.data ?? []) m.set(b.mo_no, b);
      }
      if (on) setMos(m);
    })();
    return () => { on = false; };
  }, [items]);

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;

  // ---- พิมพ์อะไรบ้าง (เฉพาะครั้งนี้ ไม่จำ) ----
  const [shop, setShop] = useState("");
  const [ageMin, setAgeMin] = useState(0);
  const [onlyPicks, setOnlyPicks] = useState(false);
  const [picksAll, setPicksAll] = useState<Set<string> | null>(null);
  useEffect(() => { setPicksAll(readPicks(mode)); }, [mode]);
  const picks = useMemo(() => {
    if (!picksAll || !items) return null;
    const ids = new Set(items.filter((i) => picksAll.has(i.id)).map((i) => i.id));
    return ids.size ? ids : null;
  }, [picksAll, items]);
  useEffect(() => { if (picks) setOnlyPicks(true); }, [picks]);
  const shops = useMemo(() => [...new Set((items ?? []).map((i) => i.shop))].sort((a, b) => a.localeCompare(b, "th")), [items]);

  // ---- หมายเหตุพิมพ์เอง (ทั้งทีมเห็น) ----
  const notes = usePrintNotes(PO_PRINT_NOTES);
  const noteOf = notes.get;
  const notesVer = notes.ver;

  // สร้างใบ — อ่านข้อความล่าสุดจาก ref ตอนสร้าง (พิมพ์ในพรีวิวไม่ทำให้สร้างใหม่ · ปุ่มพิมพ์สร้างใหม่ทุกครั้ง)
  const build = useCallback(() => (items ? buildPoPrint({
    mode, items, mos, settings: s, scope: { shop, ageMin, picks: onlyPicks ? picks : null }, noteOf, company,
    today: todayLocal(), origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }) : null), [mode, items, mos, s, shop, ageMin, onlyPicks, picks, noteOf, company, notesVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useMemo(() => build(), [build]);
  const html = result?.html ?? "";
  const pages = estimateListPages(result?.groupCounts ?? [0], s);
  const doPrint = useCallback(() => { const r = build(); if (r) printReportHtmlInNewWindow(r.html); }, [build]);

  // Ctrl/Cmd+P → หน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doPrint]);

  const defaultTitle = PO_PRINT_TITLE[mode];
  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;
  const moTotal = mos.size, moDue = [...mos.values()].filter((m) => m.due_date).length;
  const moColOn = s.columns.some((c) => c.key === "mo" && c.on) || s.groupBy === "mo";
  const setMo = (show: PoMoShow) => setOpts({ mo: show }, true);

  const notesLine = notes.status === "unavailable"
    ? <span className="text-amber-700"><Icon value="i:alert-triangle" className="mr-1" />ยังเปิดระบบเก็บหมายเหตุไม่ได้ — ข้อความที่พิมพ์ใช้ได้เฉพาะครั้งนี้</span>
    : notes.status === "error" || notes.error
      ? <span className="text-red-600"><Icon value="i:alert-triangle" className="mr-1" />{notes.error ?? "โหลดหมายเหตุไม่สำเร็จ"}</span>
      : notes.saving > 0 ? <span className="text-slate-500">กำลังบันทึกหมายเหตุ…</span>
        : notes.savedAt ? <span className="text-emerald-700"><Icon value="i:check" className="mr-1" />บันทึกหมายเหตุแล้ว</span> : null;

  const extra = (
    <>
      <Section title="พิมพ์อะไรบ้าง" hint="เฉพาะครั้งนี้">
        <select value={shop} onChange={(e) => setShop(e.target.value)} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label="ร้าน">
          <option value="">ทุกร้าน ({items?.length ?? 0} รายการ)</option>
          {shops.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className="mt-1.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label="อายุที่ค้าง">
          <option value={0}>ทุกอายุ</option>
          <option value={14}>ค้างเกิน 14 วัน</option>
          <option value={30}>ค้างเกิน 30 วัน</option>
          <option value={60}>ค้างเกิน 60 วัน</option>
        </select>
        <div className="mt-1.5">
          {picks
            ? <Check checked={onlyPicks} onChange={setOnlyPicks}>เฉพาะที่ติ๊กไว้บนหน้าจอ ({picks.size})</Check>
            : <p className="text-[11px] text-slate-400">อยากพิมพ์บางรายการ: {mode === "order" ? "ติ๊กเลือกหลายชิ้น หรือใส่ตะกร้า" : "ใส่ตะกร้ารับของ"} ในหน้าสั่งซื้อก่อน แล้วกดพิมพ์สรุป</p>}
        </div>
      </Section>

      <Section title="ช่องใบสั่งผลิต (MO) โชว์อะไรบ้าง" hint="กดเปิด/ปิด">
        {!moColOn && <p className="mb-1.5 text-[11px] text-amber-700">คอลัมน์ใบสั่งผลิตปิดอยู่ — กดปุ่มไหนก็ได้เพื่อเปิด</p>}
        <div className="flex flex-wrap gap-1.5">
          {PO_MO_FIELDS.map((f) => (
            <button key={f.key} type="button" aria-pressed={o.mo[f.key]} onClick={() => setMo({ ...o.mo, [f.key]: !o.mo[f.key] })} className={chip(o.mo[f.key])}>
              <Icon value={f.icon} />{f.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-500">แบบด่วน</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PO_MO_QUICK.map((q) => <button key={q.id} type="button" onClick={() => setMo({ ...q.show })} className={chip(false)}>{q.label}</button>)}
        </div>
        <div className="mt-2 text-xs text-slate-500">ขนาดรูปสินค้าที่ผลิต</div>
        <div className="mt-1 flex gap-1.5">
          {(["s", "l"] as const).map((v) => <button key={v} type="button" onClick={() => setOpts({ moImg: v, mo: { ...o.mo, img: true } }, true)} className={chip(o.moImg === v)}>{v === "s" ? "เล็ก" : "ใหญ่"}</button>)}
        </div>
        {moTotal > 0 && <p className="mt-2 text-[11px] text-slate-400">กำหนดส่ง: ใส่ไว้ {moDue} จาก {moTotal} ใบ{moDue < moTotal ? " (ใบที่ไม่มีจะเว้นว่าง)" : ""}</p>}
      </Section>

      <Section title="สรุปงานหัวใบ">
        <Check checked={o.sumCards} onChange={(sumCards) => setOpts({ sumCards })}>กล่องตัวเลขสรุป</Check>
        <Check checked={o.shopTable} onChange={(shopTable) => setOpts({ shopTable })}>ตารางสรุปต่อร้าน</Check>
      </Section>

      <Section title="รวม & จัดวาง">
        <Check checked={o.merge} onChange={(merge) => setOpts({ merge })}>รวมของชิ้นเดียวกันเป็นบรรทัดเดียว</Check>
        <Check checked={o.gTotal} onChange={(gTotal) => setOpts({ gTotal })}>แถวรวมท้ายกลุ่ม</Check>
        <Check checked={o.stack} onChange={(stack) => setOpts({ stack })}>รหัสอยู่บรรทัดบนชื่อ (ประหยัดที่)</Check>
        {o.merge && s.groupBy === "mo" && <p className="mt-1 text-[11px] text-slate-400">จัดกลุ่มตามใบสั่งผลิต = แยกบรรทัดตามใบเสมอ</p>}
      </Section>

      <Section title="หมายเหตุที่พิมพ์เอง">
        <p className="text-[11px] leading-relaxed text-slate-500">ช่องพื้นฟ้าในใบ คลิกแล้วพิมพ์ได้เลย · ทั้งทีมเห็น จำไว้ครั้งหน้า · บันทึกให้เองเมื่อหยุดพิมพ์ (พื้นฟ้าเห็นแค่บนจอ)</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">อยากได้ช่องเพิ่ม: หัวข้อคอลัมน์ด้านล่าง กด “+ ช่องใหม่ (ตั้งชื่อเอง)”</p>
        {notesLine && <p className="mt-1.5 text-[11px]">{notesLine}</p>}
      </Section>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับ
        </button>
        <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          {(["order", "recv"] as const).map((m) => (
            <button key={m} type="button" onClick={() => router.replace(`/print/purchasing-orders?mode=${m}`)}
              className={`h-9 px-3 text-sm ${mode === m ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon value={m === "order" ? "i:shopping-cart" : "i:package-import"} className="mr-1" />{m === "order" ? "สั่งซื้อ" : "รอรับ"}
            </button>
          ))}
        </span>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon value="i:printer" className="mr-1.5" />{s.title.trim() || defaultTitle} · {result?.count ?? 0} รายการ</span>
        <div className="flex-1" />
        {notesLine && <span className="hidden text-xs md:inline">{notesLine}</span>}
        <button onClick={togglePanel} aria-pressed={panelOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${panelOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:layout-sidebar-right" /> ตั้งค่าหน้าพิมพ์
        </button>
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-white py-16 text-center text-sm text-red-600">
              <Icon value="i:alert-triangle" className="mr-1" />{error}
              <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button>
            </div>
          ) : !items ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">กำลังโหลดรายการ…</div>
          ) : (
            <ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} onNote={notes.set} onNoteDone={notes.flush} />
          )}
        </div>
        {panelOpen && (
          <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[340px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
            <ListPrintPanel
              state={print}
              available={available}
              sorts={PO_PRINT_SORTS[mode]}
              groups={PO_PRINT_GROUPS[mode]}
              builtinPresets={presets}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={defaultTitle}
              canSaveTeam={can("admin.users")}
              signatureHint={PO_PRINT_SIGN[mode].join(" / ")}
              textNotes
              extra={extra}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function PurchasingOrdersPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PurchasingOrdersPrintInner /></Suspense>;
}
