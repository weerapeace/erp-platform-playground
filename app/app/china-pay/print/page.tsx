"use client";

/**
 * 🖨 พิมพ์สรุปบิลจีน — /app/china-pay/print?filter=<ตัวกรอง>&picked=1 (เจ้าของอนุมัติ 2026-11-03 จาก widget)
 *   เปิดจากปุ่ม "พิมพ์" ในแท็บ "บิลจีนทั้งหมด" (แท็บใหม่) · picked=1 = เฉพาะบิลที่ติ๊กไว้ (localStorage CHINA_BILLS_PRINT_PICK_KEY)
 *   อยู่ใต้ /app/china-pay → ได้ด่านสิทธิ์ app.china_pay จาก layout เดียวกับตัวแอป
 *   ตัวสร้างใบ = lib/china-bills-print (เทสต์ได้) · ตั้งค่า = ของกลาง lib/list-print + ListPrintPanel (+สวิตช์ เรท / ค่าโอน / บัญชีร้าน ใน extra)
 *   เรทฐานสำหรับบิลที่ยังไม่มีเรท = เรทล่าสุดในเมนู "เรท" (แก้ได้เฉพาะครั้งนี้ ไม่บันทึกลงระบบ)
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { Check, ListPrintPanel, Section } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { cleanListPrintSettings, estimateListPages } from "@/lib/list-print";
import { ALL_FILTERS, billInFilter } from "@/lib/china-pay";
import {
  CB_PRINT_COLUMNS, CB_PRINT_GROUPS, CB_PRINT_SIGN, CB_PRINT_SORTS, CHINA_BILLS_PRINT_PICK_KEY, buildChinaBillsPrint, cbBillsFromApi, cbPrintColumnsFor,
  cbPrintDefaults, cbPrintOpts, cbPrintPresets, cbPrintTitle, cbThDate,
  type CbBank, type CbPrintOpts,
} from "@/lib/china-bills-print";

const PANEL_KEY = "print:panel-open";
const PICK_TTL_MS = 12 * 3600 * 1000;
type Company = { id: string; name: string; logo_key: string | null };

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** บิลที่ติ๊กไว้บนหน้า "บิลจีนทั้งหมด" */
function readPicks(): Set<string> | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHINA_BILLS_PRINT_PICK_KEY) ?? "null") as { ids?: string[]; at?: number } | null;
    return p?.ids?.length && Date.now() - (p.at ?? 0) < PICK_TTL_MS ? new Set(p.ids) : null;
  } catch { return null; }
}

function ChinaBillsPrintView() {
  const router = useRouter();
  const params = useSearchParams();
  const { can, user } = useAuth();
  const defaults = useMemo(() => cbPrintDefaults(), []);
  const presets = useMemo(() => cbPrintPresets(), []);
  const print = useListPrintSettings({ reportKey: "china-bills", family: "china-bills", available: CB_PRINT_COLUMNS, defaults });
  const s = print.settings;
  const o = cbPrintOpts(s);
  const setOpts = (patch: Partial<CbPrintOpts>) => print.setSettings({ ...s, opts: { ...s.opts, ...patch } });
  const panelColumns = useMemo(() => cbPrintColumnsFor(o), [o.fee, o.rate]); // eslint-disable-line react-hooks/exhaustive-deps
  // แผงเห็นแค่คอลัมน์ตามสวิตช์ → ตอนกดแบบที่บันทึกไว้ คอลัมน์ค่าโอน/เรทที่ซ่อนอยู่จะหลุดจากค่าตั้ง — เติมกลับทุกครั้งที่แผงแก้ค่า
  const panelState = useMemo(() => ({ ...print, setSettings: (next: typeof s) => print.setSettings(cleanListPrintSettings(next, CB_PRINT_COLUMNS, defaults)) }), [print, defaults]);

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setPanelOpen(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  // ---- ข้อมูลบิล ----
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); setRows(null);
    try {
      const r = await apiFetch("/api/master-v2/china-bills?limit=300&sort_by=bill_date&sort_dir=desc");
      const j = (await r.json().catch(() => ({}))) as { data?: Record<string, unknown>[]; error?: string };
      if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ไม่มีสิทธิ์ดูบิลจีน" : "โหลดบิลไม่สำเร็จ");
      setRows(j.data ?? []);
    } catch (e) { setError((e as Error).message || "โหลดบิลไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // ---- เรทฐาน (R1) สำหรับบิลที่ยังไม่มีเรท — เรทล่าสุดในระบบ แก้ได้เฉพาะครั้งนี้ ----
  const [r1Text, setR1Text] = useState("");
  const [rateLabel, setRateLabel] = useState("");
  const [rateLoaded, setRateLoaded] = useState(false);
  useEffect(() => {
    apiFetch("/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc").then((r) => r.json()).then((j: { data?: Record<string, unknown>[] }) => {
      const row = j.data?.[0];
      if (row && Number(row.rate) > 0) {
        setR1Text(String(Number(row.rate)));
        const d = String(row.rate_date ?? "");
        setRateLabel(d === todayLocal() ? "เรทวันนี้" : `เรทล่าสุด ${cbThDate(d)}`);
      }
    }).catch(() => { /* ไม่มีเรท = บิลที่ยังไม่มีเรทโชว์ "รอเรท" */ }).finally(() => setRateLoaded(true));
  }, []);
  const [rateEdited, setRateEdited] = useState(false);
  const r1 = Math.max(0, Number(r1Text) || 0);

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;

  // ---- พิมพ์อะไรบ้าง (เฉพาะครั้งนี้ ไม่จำ) ----
  const [filter, setFilter] = useState(() => {
    const f = params.get("filter") ?? "";
    return (ALL_FILTERS as readonly string[]).includes(f) ? f : "ค้างโอน";
  });
  const [picksAll, setPicksAll] = useState<Set<string> | null>(null);
  const [onlyPicks, setOnlyPicks] = useState(false);
  useEffect(() => {
    const p = params.get("picked") === "1" ? readPicks() : null;
    setPicksAll(p);
    setOnlyPicks(!!p);
  }, [params]);
  const picks = useMemo(() => {
    if (!picksAll || !rows) return null;
    const ids = new Set(rows.filter((r) => picksAll.has(String(r.id))).map((r) => String(r.id)));
    return ids.size ? ids : null;
  }, [picksAll, rows]);
  const chosen = useMemo(() => (rows ?? []).filter((r) => (onlyPicks && picks ? picks.has(String(r.id)) : billInFilter(r, filter))), [rows, onlyPicks, picks, filter]);
  const bills = useMemo(() => cbBillsFromApi(chosen), [chosen]);

  // ---- บัญชีธนาคารร้าน (โหลดเมื่อเปิดสวิตช์) ----
  const [banks, setBanks] = useState<Map<string, CbBank>>(new Map());
  const supIds = useMemo(() => [...new Set(bills.map((b) => b.supplierId).filter(Boolean) as string[])].sort().join(","), [bills]);
  useEffect(() => {
    if (!o.bank || !supIds) return;
    let on = true;
    const ids = supIds.split(",").filter((id) => !banks.has(id));
    if (!ids.length) return;
    Promise.all(ids.map((id) => apiFetch(`/api/master-v2/partners/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((list: ({ data?: Record<string, unknown> } | null)[]) => {
        if (!on) return;
        setBanks((prev) => {
          const m = new Map(prev);
          list.forEach((j, i) => {
            const p = j?.data;
            m.set(ids[i], { bank: String(p?.bank_name_brief ?? "").trim(), account: String(p?.account_number ?? "").trim(), name: String(p?.bank_account_name ?? "").trim() });
          });
          return m;
        });
      });
    return () => { on = false; };
  }, [o.bank, supIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultTitle = cbPrintTitle(onlyPicks && picks ? "" : filter);
  const scopeText = onlyPicks && picks ? "เฉพาะบิลที่ติ๊กไว้" : `ตัวกรอง: ${filter}`;
  const build = useCallback(() => (rows ? buildChinaBillsPrint({
    bills, settings: s, rate: { r1, label: rateEdited ? "เรทที่กรอกเอง" : rateLabel }, scopeText, defaultTitle, banks,
    printedAt: new Date().toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }),
    printedBy: user?.name ?? "", origin: typeof window !== "undefined" ? window.location.origin : "", company,
  }) : null), [rows, bills, s, r1, rateEdited, rateLabel, scopeText, defaultTitle, banks, user?.name, company]);
  const result = useMemo(() => build(), [build]);
  const html = result?.html ?? "";
  const pages = estimateListPages(result?.groupCounts ?? [0], s);
  const doPrint = useCallback(() => { const r = build(); if (r) printReportHtmlInNewWindow(r.html); }, [build]);

  // Ctrl/Cmd+P → หน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doPrint]);

  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;
  const noRateBills = bills.filter((b) => !b.thb && b.rate <= 0 && b.status !== "ยกเลิก").length;
  const goBack = () => { if (window.opener) window.close(); else router.push("/app/china-pay"); };

  const extra = (
    <>
      <Section title="พิมพ์อะไรบ้าง" hint="เฉพาะครั้งนี้">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setOnlyPicks(false); }} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label="ตัวกรองบิล">
          {ALL_FILTERS.map((f) => <option key={f} value={f}>{f} ({(rows ?? []).filter((r) => billInFilter(r, f)).length} บิล)</option>)}
        </select>
        <div className="mt-1.5">
          {picks
            ? <Check checked={onlyPicks} onChange={setOnlyPicks}>เฉพาะบิลที่ติ๊กไว้ ({picks.size})</Check>
            : <p className="text-[11px] text-slate-400">อยากพิมพ์บางบิล: ติ๊กบิลในหน้า “บิลจีนทั้งหมด” ก่อน แล้วกดพิมพ์</p>}
        </div>
      </Section>

      <Section title="ใบนี้โชว์อะไรบ้าง">
        <Check checked={o.rate} onChange={(rate) => setOpts({ rate })}>เรท / เงินบาท</Check>
        {o.rate && (
          <div className="mb-1 ml-6 mt-1">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0">เรทฐาน R1</span>
              <input type="number" inputMode="decimal" step="0.001" min={0} value={r1Text} placeholder="เช่น 5.08"
                onChange={(e) => { setR1Text(e.target.value); setRateEdited(true); }}
                className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-right text-sm" aria-label="เรทฐาน R1" />
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {rateLoaded && !rateLabel && !rateEdited ? "ยังไม่มีเรทในระบบ — กรอกเองเพื่อประมาณเงินบาท · " : rateEdited ? "กรอกเอง (ไม่บันทึกลงระบบ) · " : rateLabel ? `${rateLabel} · ` : ""}
              ใช้กับ {noRateBills} บิลที่ยังไม่มีเรท · ระบบคิดชั้น R1–R4 ให้เอง · บิลที่มีเรทแล้วใช้เรทของบิล
            </p>
          </div>
        )}
        <Check checked={o.fee} onChange={(fee) => setOpts({ fee })}>ค่าโอน</Check>
        {!o.fee && <p className="mb-1 ml-6 text-[11px] text-slate-400">ปิดอยู่ = ยอดทุกจุดไม่รวมค่าโอน</p>}
        <Check checked={o.bank} onChange={(bank) => setOpts({ bank })}>บัญชีธนาคารร้าน</Check>
      </Section>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={goBack} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับแอป
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon value="i:printer" className="mr-1.5" />{s.title.trim() || defaultTitle} · {result?.count ?? 0} บิล</span>
        <div className="flex-1" />
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
          ) : !rows ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">กำลังโหลดบิล…</div>
          ) : (
            <ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} />
          )}
        </div>
        {panelOpen && (
          <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[340px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
            <ListPrintPanel
              state={panelState}
              available={panelColumns}
              sorts={CB_PRINT_SORTS}
              groups={CB_PRINT_GROUPS}
              builtinPresets={presets}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={defaultTitle}
              canSaveTeam={can("admin.users")}
              signatureHint={CB_PRINT_SIGN.join(" / ")}
              extra={extra}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function ChinaBillsPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><ChinaBillsPrintView /></Suspense>;
}
