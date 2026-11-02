"use client";

/**
 * 🧾 อัปเดตงานจากใบขาย (เจ้าของขอ 2026-10-31: "ขึ้นรายการขายที่ยังไม่ลิงก์ใบงาน ให้จับคู่ได้ และอัปเดตสถานะ")
 *   กลับทางกับ "อัปเดตเป็นชุด" — เริ่มจากบรรทัดใบขายที่ยังไม่ผูกใบสั่งผลิต · ระบบเสนอใบให้ (กติกาเดียวกัน lib/mo-sales-match)
 *   ติ๊ก → ผูก (POST /api/mo/sales-match เดิม ใบละครั้ง) → เปิดหน้า "อัปเดตเป็นชุด" ของใบเหล่านั้น เพื่อไปขั้นส่งออก
 *     (ขั้นส่งออก/คำขอหัวหน้า/ขั้นก่อนหน้า ใช้ของเดิมทั้งหมด — หน้านี้ไม่อัปเดตสถานะเอง)
 *   ข้อมูล = GET /api/mo/sales-unlinked (lib/mo-sales-unlinked) · ไม่มีสิทธิ์ผูกตรง (โหมดส่งคำขอ) = เปิดอัปเดตเป็นชุดอย่างเดียว ผูกตอนหัวหน้ายืนยัน
 *   2026-11-01: ตัวเลือกใบงานโชว์วันที่เปิดใบ + ใบที่ผูกใบขายอื่นแล้ว (ป้าย "ผูกแล้ว" · เลือกได้ = ถอดของเดิมก่อน)
 *     + แท็บ "ผูกแล้ว" → ผูกผิด · ย้าย (./sales-move.tsx)
 *   2026-11-02: ปุ่มพิมพ์ทั้ง 2 แท็บ → /print/sales-match (lib/mo-sales-print · ส่งทุกบรรทัด + ติ๊ก/ใบที่เลือกอยู่ ทาง localStorage) ไว้ตรวจบนกระดาษก่อนผูก
 *     + ติ๊กทั้งหมด / ไม่ติ๊กทั้งหมด (เฉพาะที่แสดงตามตัวกรอง)
 *   2026-11-02 (เจ้าของ "ต้องปรับสถานะตรงนี้ได้ กรองได้ ให้กฏเดียวกัน · จำนวนขาด/เกินทำยังไง"): แท็บ "ผูกแล้ว"
 *     + การ์ดกรองสถานะ (StatFilterCards ของกลาง · ป้ายเดียวกับ StageTag) + กรองยอด ครบพอดี/ใบงานเหลือ/ใบขายขาด + ช่องค้นหา (ทั้ง 2 แท็บ)
 *     + ติ๊ก → "อัปเดตเป็นชุด" / ปุ่ม "อัปเดต" รายแถว = ป๊อปอัปเดตงานตัวเดิมของบอร์ด (หน้านี้ไม่มีกติกาสถานะของตัวเอง)
 *     + บอกยอดรวมทุกใบขายของใบงาน (linkedNote) · ใบงานเหลือ / ใบขายขาด → เปิดหน้าต่าง "เลือกใบขาย" ของอัปเดตเป็นชุด (เติมใบขาย + ที่เหลือแยกใบ/ลด/เข้าคลัง)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { HoverImage } from "@/components/hover-image";
import { Icon } from "@/components/icon";
import { StatFilterCards, type StatTone } from "@/components/stat-filter-cards";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { bkkDate } from "@/lib/mo-sales-match";
import { defaultPick, fillCandOf, linkedNote, linkedQtyIs, MO_STAGE_LABEL, partnerNote, planLinks, salePartners, type LinkedLine, type LinkedQty, type MoStage, type UnlinkedKind, type UnlinkedLine, type UnlinkedStats } from "@/lib/mo-sales-unlinked";
import { SALES_PRINT_STORE, salesPrintRowsLinked, salesPrintRowsOpen, type SalesPrintKind, type SalesPrintPayload } from "@/lib/mo-sales-print";
import { MoPick, SalesMove, StageTag, thDate } from "./sales-move";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const FILTERS: { v: "all" | UnlinkedKind; label: string }[] = [
  { v: "all", label: "ทั้งหมด" }, { v: "exact", label: "ตรงจำนวน" }, { v: "part", label: "ต้องเลือก / ไม่ครบ" }, { v: "none", label: "ไม่มีใบงาน (ของจากสต๊อก?)" },
];
const KIND_TAG: Record<UnlinkedKind, { label: string; cls: string }> = {
  exact: { label: "ตรงจำนวน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  part: { label: "ต้องเลือก / ไม่ครบ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  none: { label: "ไม่มีใบงานเปิดอยู่", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};
const linkedText = (l: { so_number: string; qty: number }[]) => l.map((x) => `${x.so_number} (${fmt(x.qty)})`).join(", ");
// แท็บผูกแล้ว: การ์ดสถานะ (ลำดับตามขั้น · ชื่อเดียวกับป้าย StageTag) + กรองยอด
const STAGES: { k: MoStage; tone: StatTone }[] = [
  { k: "wait", tone: "warning" }, { k: "work", tone: "info" }, { k: "recv", tone: "info" }, { k: "ship", tone: "success" }, { k: "closed", tone: "neutral" },
];
const QTY_FILTERS: { v: "all" | LinkedQty; label: string }[] = [
  { v: "all", label: "ทั้งหมด" }, { v: "ok", label: "ครบพอดี" }, { v: "over", label: "ใบงานเหลือ" }, { v: "short", label: "ใบขายขาด" },
];
/** ค้นหา: ทุกคำต้องเจอ (เลขใบขาย / รหัส-ชื่อสินค้า / ลูกค้า / เลขใบงาน) — "ISG2569-08-009 CTL008" = บรรทัดเดียว */
const hitQ = (q: string, ...xs: (string | null | undefined)[]) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = xs.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};

/** จัดกลุ่มตามใบขาย (ใหม่ก่อน — รายการเรียงมาแล้ว) */
function byBill<T extends { so_number: string; date: string; customer: string | null }>(list: T[]) {
  const out: { no: string; date: string; customer: string | null; lines: T[] }[] = [];
  for (const r of list) {
    const b = out.find((x) => x.no === r.so_number) ?? (out.push({ no: r.so_number, date: r.date, customer: r.customer, lines: [] }), out[out.length - 1]);
    b.lines.push(r);
  }
  return out;
}

export function SalesUpdate({ open, onClose, canLink, onOpenBatch, onOpenSingle, refresh = 0 }: {
  open: boolean;
  onClose: () => void;
  /** ผูกตรงได้ (บันทึกเลย / หัวหน้า) — false = ส่งต่อไปหน้าอัปเดตเป็นชุดอย่างเดียว */
  canLink: boolean;
  /** เปิดหน้า "อัปเดตเป็นชุด" ของใบเหล่านี้ (ไปขั้นส่งออก) · pick = เปิดหน้าต่าง "เลือกใบขาย" ของใบนั้นให้เลย (ใบงานเหลือ / ใบขายขาด) */
  onOpenBatch: (moNos: string[], pick?: string) => void;
  /** ปุ่ม "อัปเดต" รายแถว = ป๊อปอัปเดตงานทีละใบตัวเดิมของบอร์ด (เปิดซ้อนบนหน้าต่างนี้) */
  onOpenSingle: (moNo: string) => void;
  /** ป๊อปทีละใบปิดแล้ว → เลขเปลี่ยน = โหลดรายการใหม่เงียบ ๆ (ตัวกรอง/ที่ติ๊กไว้ยังอยู่) */
  refresh?: number;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<UnlinkedLine[] | null>(null);
  const [linked, setLinked] = useState<LinkedLine[]>([]);
  const [stats, setStats] = useState<UnlinkedStats | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"open" | "linked">("open");
  const [filter, setFilter] = useState<"all" | UnlinkedKind>("all");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"all" | MoStage>("all");
  const [qk, setQk] = useState<"all" | LinkedQty>("all");
  const [pick, setPick] = useState<Map<string, string>>(new Map());   // บรรทัดใบขาย → ใบที่เลือก
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lsel, setLsel] = useState<Set<string>>(new Set());           // แท็บผูกแล้ว: link_id ที่ติ๊ก
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<LinkedLine | null>(null);

  /** quiet = โหลดใหม่หลังอัปเดตจากป๊อป — ไม่ล้างหน้าจอ · ใบที่เลือก/ติ๊กไว้ของบรรทัดเดิมยังอยู่ */
  const load = useCallback(async (quiet = false) => {
    setErr(""); if (!quiet) setRows(null);
    try {
      const r = await apiFetch("/api/mo/sales-unlinked");
      const j = await r.json();
      if (!r.ok || !j?.data) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      const list = j.data.rows as UnlinkedLine[], lk = (j.data.linked ?? []) as LinkedLine[];
      setRows(list); setLinked(lk); setStats(j.data.stats as UnlinkedStats);
      // ค่าเริ่ม: เลือกตามที่ระบบเสนอ (ใบแรก) ไม่งั้นใบว่างใบแรก · ติ๊กไว้เฉพาะที่ตรงจำนวน และไม่เคยถูกถอดผูก
      const ids = new Set(list.map((x) => x.id)), lids = new Set(lk.map((x) => x.link_id));
      setPick((prev) => new Map(list.flatMap((x) => {
        const keep = quiet ? prev.get(x.id) : undefined;
        const d = keep && x.cands.some((c) => c.mo_no === keep) ? keep : defaultPick(x);
        return d ? [[x.id, d] as [string, string]] : [];
      })));
      setSel((prev) => quiet ? new Set([...prev].filter((id) => ids.has(id))) : new Set(list.filter((x) => x.kind === "exact" && !x.unlinked?.length).map((x) => x.id)));
      setLsel((prev) => quiet ? new Set([...prev].filter((id) => lids.has(id))) : new Set());
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { if (open && refresh) void load(true); }, [refresh]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bills = useMemo(() => byBill((rows ?? []).filter((r) => (filter === "all" || r.kind === filter)
    && hitQ(q, r.so_number, r.sku, r.sku_name, r.customer, pick.get(r.id)))), [rows, filter, q, pick]);
  // แท็บผูกแล้ว: ค้นหา → (กรองยอด × กรองสถานะ) · ตัวเลขบนการ์ด/ปุ่ม = จำนวนที่จะเห็นถ้ากด
  const linkedQ = useMemo(() => linked.filter((r) => hitQ(q, r.so_number, r.sku, r.sku_name, r.customer, r.mo_no)), [linked, q]);
  const stageN = (k: "all" | MoStage) => linkedQ.filter((r) => (qk === "all" || linkedQtyIs(r, qk)) && (k === "all" || r.stage === k)).length;
  const qtyN = (k: "all" | LinkedQty) => linkedQ.filter((r) => (stage === "all" || r.stage === stage) && (k === "all" || linkedQtyIs(r, k))).length;
  const linkedShown = linkedQ.filter((r) => (stage === "all" || r.stage === stage) && (qk === "all" || linkedQtyIs(r, qk)));
  const linkedBills = byBill(linkedShown);
  // ติ๊กได้เฉพาะใบที่ยังไม่ปิด (ปิด/ยกเลิกแล้ว อัปเดตไม่ได้)
  const lTickable = linkedShown.filter((r) => r.stage !== "closed");
  const lShownTicked = lTickable.filter((r) => lsel.has(r.link_id)).length;
  const lChosenMos = [...new Set(linked.filter((r) => lsel.has(r.link_id) && r.stage !== "closed").map((r) => r.mo_no))];
  const lToggle = (id: string, on: boolean) => setLsel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const lTickAll = (on: boolean) => setLsel((s) => { const n = new Set(s); for (const r of on ? lTickable : linkedShown) { if (on) n.add(r.link_id); else n.delete(r.link_id); } return n; });
  /** เปิดหน้าอัปเดตเป็นชุด (+ หน้าต่างเลือกใบขายของใบนั้น) แล้วปิดหน้าต่างนี้ — เหมือนหลังผูก */
  const toBatch = (mos: string[], pickMo?: string) => { onOpenBatch(mos, pickMo); onClose(); };
  // ใบขายอื่นที่เลือกใบงานเดียวกันอยู่ → "รวมกับ ISG… (วันที่ · จำนวน) = ครบ N"
  const partners = useMemo(() => salePartners(rows ?? [], pick), [rows, pick]);

  const chosen = (rows ?? []).filter((r) => sel.has(r.id) && pick.get(r.id));
  const plan = planLinks(chosen, pick);
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  // ติ๊กทั้งหมด / ไม่ติ๊กทั้งหมด — เฉพาะบรรทัดที่แสดงตามตัวกรอง · ติ๊กได้เฉพาะบรรทัดที่มีใบงานเลือกอยู่
  const shown = bills.flatMap((b) => b.lines);
  const tickable = shown.filter((r) => { const m = pick.get(r.id); return !!m && r.cands.some((c) => c.mo_no === m); });
  const shownTicked = tickable.filter((r) => sel.has(r.id)).length;
  const tickAll = (on: boolean) => setSel((s) => { const n = new Set(s); for (const r of on ? tickable : shown) { if (on) n.add(r.id); else n.delete(r.id); } return n; });

  /** ผูกตามที่เลือก (ใบละครั้ง) → เปิดหน้าอัปเดตเป็นชุด (ถ้า next) · ใบที่ผูกใบขายอื่นอยู่ = ถามก่อน แล้วถอดของเดิมออก */
  const run = async (next: boolean) => {
    if (!plan.length) { toast.error("ยังไม่ได้เลือกบรรทัดที่มีใบงาน"); return; }
    if (!canLink) { onOpenBatch(plan.map((p) => p.mo_no)); onClose(); return; }
    const re = plan.filter((p) => p.relink?.length);
    if (re.length && !(await askConfirm({ title: `ถอดใบขายเดิมออกจาก ${re.length} ใบงาน?`, confirmText: "ถอดแล้วผูกใหม่",
      message: <div className="space-y-1 text-sm"><div>ใบงานเหล่านี้ผูกใบขายอื่นอยู่ — ใบขายเดิมจะกลับเป็น “ยังไม่ผูก” (สถานะใบงานไม่เปลี่ยน):</div>{re.map((p) => <div key={p.mo_no} className="text-slate-600"><b className="font-mono">{p.mo_no}</b> · {linkedText(p.relink ?? [])}</div>)}</div> }))) return;
    setBusy(true);
    const ok: string[] = [], fail: string[] = [];
    for (const p of plan) {
      try {
        if (p.relink?.length) {
          const d = await apiFetch(`/api/mo/sales-match?mo_no=${encodeURIComponent(p.mo_no)}`, { method: "DELETE" });
          if (!d.ok) throw new Error("ถอดใบขายเดิมไม่สำเร็จ");
        }
        const r = await apiFetch("/api/mo/sales-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mo_no: p.mo_no, parts: p.parts }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) throw new Error(j?.error || "ผูกไม่สำเร็จ");
        ok.push(p.mo_no);
      } catch (e) { fail.push(`${p.mo_no}: ${e instanceof Error ? e.message : "ผูกไม่สำเร็จ"}`); }
    }
    setBusy(false);
    if (fail.length) toast.error(`ผูกไม่ได้ ${fail.length} ใบ — ${fail.slice(0, 3).join(" · ")}`);
    if (ok.length) toast.success(`ผูกใบขายแล้ว ${ok.length} ใบงาน${next ? " — ต่อด้วยตั้งขั้นส่งออก" : ""}`);
    if (next && ok.length) { onOpenBatch(ok); onClose(); }
    else void load();
  };

  /** พิมพ์ / PDF — ส่งแถวตามที่ติ๊ก/เลือกอยู่ไปหน้าพิมพ์ (localStorage · ล้างของเก่าเกิน 1 วัน) */
  const openPrint = (kind: SalesPrintKind) => {
    const list = kind === "open" ? salesPrintRowsOpen(rows ?? [], pick, sel) : salesPrintRowsLinked(linked);
    if (!list.length) { toast.error(kind === "open" ? "ไม่มีบรรทัดใบขายให้พิมพ์" : "ยังไม่มีบรรทัดที่ผูกแล้ว"); return; }
    const k = Date.now().toString(36);
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(SALES_PRINT_STORE)) continue;
        let at = 0;
        try { at = Number((JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<SalesPrintPayload>).at) || 0; } catch { /* เสีย = ลบ */ }
        if (Date.now() - at > 864e5) localStorage.removeItem(key);
      }
      localStorage.setItem(SALES_PRINT_STORE + k, JSON.stringify({ kind, rows: list, at: Date.now() } satisfies SalesPrintPayload));
    } catch { toast.error("เปิดหน้าพิมพ์ไม่ได้ — เบราว์เซอร์นี้เก็บข้อมูลชั่วคราวไม่ได้"); return; }
    window.open(`/print/sales-match?k=${k}`, "_blank", "noopener");
  };

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50";
  const tabBtn = (on: boolean) => `h-9 rounded-lg border px-3 text-sm ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const billHead = (b: { no: string; date: string; customer: string | null }) => (
    <div className="flex flex-wrap items-baseline gap-2 bg-slate-50 px-3 py-2 text-sm">
      <b className="text-slate-800">{b.no}</b><span className="text-slate-500">{thDate(b.date)}{b.customer ? ` · ${b.customer}` : ""}</span>
    </div>
  );
  const product = (r: { sku: string; sku_name?: string | null; image_url?: string | null; qty: number }, extra?: string) => (
    <>
      <HoverImage url={r.image_url} size={44} alt={r.sku} fallback="—" />
      <div className="min-w-0">
        <div className="font-mono font-semibold text-slate-800">{r.sku}</div>
        {r.sku_name && <div className="truncate text-[12px] text-slate-500" title={r.sku_name}>{r.sku_name}</div>}
        <div className="text-[12px] text-slate-600">ขาย {fmt(r.qty)} ชิ้น{extra ?? ""}</div>
      </div>
    </>
  );
  return (
    <>
    <ERPModal open={open} onClose={() => { if (!busy && !moving) onClose(); }} size="xl" storageKey="wb-sales-update"
      title="อัปเดตงานจากใบขาย"
      description={tab === "open"
        ? "บรรทัดใบขายที่ยังไม่ได้ผูกใบงาน — ระบบเสนอใบงานให้ (ใบเก่าได้ก่อน · ตรงจำนวนก่อน) ติ๊กแล้วผูก จากนั้นตั้งขั้นส่งออกในหน้าอัปเดตเป็นชุด"
        : "บรรทัดใบขายที่ผูกใบงานแล้ว — ปรับสถานะใบงานด้วย “อัปเดต” (กติกาเดียวกับบอร์ด) · ผูกผิดกด “ผูกผิด · ย้าย” เพื่อย้ายไปใบที่ถูก และย้อนสถานะใบเดิม"}
      footer={tab === "open" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">เลือก {chosen.length} บรรทัด · {plan.length} ใบงาน</span>
          {!canLink && <span className="text-[12px] text-amber-700">โหมดส่งคำขอ — ผูกจริงตอนหัวหน้ายืนยัน</span>}
          <div className="flex-1" />
          <button type="button" disabled={!rows?.length} onClick={() => openPrint("open")} title="ทุกใบขาย — บอกว่าบรรทัดไหนติ๊ก (จะผูก) / ไม่ติ๊ก / ไม่มีใบงาน · เลือกพิมพ์เฉพาะที่ติ๊กได้ในหน้าพิมพ์"
            className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            <Icon value="i:printer" /> พิมพ์ / PDF
          </button>
          {canLink && <button type="button" disabled={busy || !plan.length} onClick={() => void run(false)} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>ผูกอย่างเดียว</button>}
          <button type="button" disabled={busy || !plan.length} onClick={() => void run(true)}
            className={`${btn} border-emerald-600 bg-emerald-600 font-medium text-white hover:bg-emerald-700`}>
            <Icon name="refresh" /> {busy ? "กำลังผูก…" : canLink ? "ผูก + ไปขั้นส่งออก" : "ไปอัปเดตเป็นชุด"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">ผูกแล้ว {fmt(linked.length)} บรรทัด · เลือก {fmt(lsel.size)} บรรทัด · {fmt(lChosenMos.length)} ใบงาน</span>
          <div className="flex-1" />
          <button type="button" disabled={!linked.length} onClick={() => openPrint("linked")} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            <Icon value="i:printer" /> พิมพ์ / PDF ที่ผูกแล้ว
          </button>
          <button type="button" disabled={!lChosenMos.length} onClick={() => toBatch(lChosenMos)}
            title="เปิดหน้า “อัปเดตเป็นชุด” ของใบงานที่ติ๊ก — เลือกขั้นได้ทุกขั้นเหมือนบนบอร์ด (ใบที่ผูกใบขายครบแล้ว มีปุ่มไปขั้นส่งออกทีเดียว)"
            className={`${btn} border-emerald-600 bg-emerald-600 font-medium text-white hover:bg-emerald-700`}>
            <Icon name="refresh" /> อัปเดตเป็นชุด{lChosenMos.length ? ` (${fmt(lChosenMos.length)} ใบงาน)` : ""}
          </button>
        </div>
      )}>
      {err ? <div className="py-10 text-center text-red-500">{err} <button type="button" onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>
        : !rows ? <div className="py-10 text-center text-slate-400">กำลังหาใบขายที่ยังไม่ผูกใบงาน…</div>
        : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setTab("open")} className={tabBtn(tab === "open")}>ยังไม่ผูก {fmt(rows.length)}</button>
              <button type="button" onClick={() => setTab("linked")} className={tabBtn(tab === "linked")}><Icon name="link" /> ผูกแล้ว {fmt(linked.length)}</button>
              <div className="flex-1" />
              <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขใบขาย / รหัสสินค้า / ใบงาน"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="ล้างคำค้น" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700"><Icon name="cancel" /></button>}
              </label>
            </div>
            {tab === "open" ? (
              <>
                {stats && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["บรรทัดขายยังไม่ผูกใบงาน", `${fmt(stats.lines)}`, `${fmt(stats.bills)} ใบขาย`],
                      ["ตรงจำนวน (ติ๊กไว้ให้แล้ว)", `${fmt(stats.exact)}`, "บรรทัด"],
                      ["ต้องเลือก / ไม่ครบ", `${fmt(stats.part)}`, "บรรทัด"],
                      ["ใบงานที่ยังขึ้น “รอจ่าย”", `${fmt(stats.mos_waiting)}`, "ทั้งที่ขายส่งไปแล้ว"],
                    ].map(([a, b, c]) => (
                      <div key={a} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[12px] text-slate-500">{a}</div><div className="text-xl font-semibold text-slate-800">{b}</div><div className="text-[11px] text-slate-400">{c}</div></div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-slate-500">แสดง</span>
                  {FILTERS.map((f) => (
                    <button key={f.v} type="button" onClick={() => setFilter(f.v)}
                      className={`h-8 rounded-lg border px-2.5 text-sm ${filter === f.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
                  ))}
                  <div className="flex-1" />
                  <span className="text-[12px] text-slate-500">ติ๊กอยู่ {fmt(shownTicked)}/{fmt(tickable.length)}</span>
                  <button type="button" disabled={!tickable.length || shownTicked === tickable.length} onClick={() => tickAll(true)}
                    title={filter === "all" ? "ติ๊กทุกบรรทัดที่มีใบงานให้ผูก" : "ติ๊กทุกบรรทัดที่แสดงในตัวกรองนี้"}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:checks" /> ติ๊กทั้งหมด
                  </button>
                  <button type="button" disabled={!shownTicked} onClick={() => tickAll(false)}
                    title={filter === "all" ? "เอาติ๊กออกทุกบรรทัด" : "เอาติ๊กออกทุกบรรทัดที่แสดงในตัวกรองนี้"}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:square" /> ไม่ติ๊กทั้งหมด
                  </button>
                </div>
                {!bills.length && <div className="py-8 text-center text-slate-400">ไม่มีรายการในตัวกรองนี้</div>}
                {bills.map((b) => (
                  <div key={b.no} className="overflow-hidden rounded-xl border border-slate-200">
                    {billHead(b)}
                    {b.lines.map((r) => {
                      const mo = pick.get(r.id) ?? null, c = r.cands.find((x) => x.mo_no === mo), s = r.suggest.find((x) => x.mo_no === mo);
                      const tag = KIND_TAG[r.kind];
                      return (
                        <div key={r.id} className="grid grid-cols-[22px_44px_minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-2.5 border-t border-slate-100 px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" disabled={!c} checked={sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`เลือก ${r.sku}`} />
                          {product(r, r.left < r.qty ? ` · เหลือผูก ${fmt(r.left)}` : "")}
                          <div className="min-w-0 space-y-1">
                            <span className={`inline-block rounded border px-1.5 text-[11px] ${tag.cls}`}>{tag.label}</span>
                            {r.unlinked?.length ? <div className="text-[12px] text-amber-700">เคยถอดผูกจาก {r.unlinked.map((u) => `${u.mo_no}${u.at ? ` (${thDate(bkkDate(u.at))})` : ""}`).join(", ")} — ไม่ได้ติ๊กให้ ถ้าขายจากสต๊อกไม่ต้องผูก</div> : null}
                            {c ? (
                              <>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <b className="font-mono text-slate-800">{c.mo_no}</b>
                                  <span className="text-[12px] text-slate-500">ผลิต {fmt(c.qty)} · เปิด {thDate(c.opened)}</span>
                                  <StageTag stage={c.stage} />
                                </div>
                                {c.linked && (c.room > 0
                                  // ใบยังว่าง = เติมใบขายนี้เพิ่มได้โดยไม่ถอดของเดิม (หน้าต่างเลือกใบขายของอัปเดตเป็นชุด)
                                  ? <div className="flex flex-wrap items-center gap-2 text-[12px] text-amber-700">
                                      <span>ใบนี้ผูก {linkedText(c.linked)} อยู่ · ยังว่าง {fmt(c.room)} ชิ้น</span>
                                      <button type="button" onClick={() => toBatch([c.mo_no], c.mo_no)} title="เปิดหน้าต่างเลือกใบขายของใบนี้ — ใบขายเดิมยังติ๊กอยู่ ติ๊กใบขายนี้เพิ่ม"
                                        className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 font-medium text-amber-900 hover:bg-amber-100">เติมใบขายนี้ (ไม่ถอดของเดิม)…</button>
                                    </div>
                                  : <div className="text-[12px] text-amber-700">ใบนี้ผูก {linkedText(c.linked)} อยู่ — ผูกแล้วใบขายนั้นจะกลับเป็น “ยังไม่ผูก”</div>)}
                                {(() => {
                                  const pn = partnerNote(partners, c, r.id, s?.qty ?? Math.min(r.left, c.qty), thDate);
                                  return pn && <div className={`text-[12px] ${pn.full ? "text-slate-500" : "text-amber-700"}`}>{pn.text}{pn.full ? "" : " — ที่เหลือเลือกได้ในหน้าอัปเดตเป็นชุด (ปุ่ม “เลือกใบขาย…”)"}</div>;
                                })()}
                              </>
                            ) : r.cands.length
                              ? <div className="text-[12px] text-slate-500">ใบงานของสินค้านี้ผูกใบขายอื่นหมดแล้ว — เลือกย้ายมาผูกใบขายนี้ได้</div>
                              : <div className="text-[12px] text-slate-500">ขายจากสต๊อก หรือใบงานปิดไปแล้ว — ไม่ต้องผูก</div>}
                            {r.cands.length > (c ? 1 : 0) && (
                              <MoPick cands={r.cands} value={mo} suggested={r.suggest.map((x) => x.mo_no)}
                                onChange={(v) => { setPick((p) => new Map(p).set(r.id, v)); toggle(r.id, true); }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <>
                <StatFilterCards value={stage} onChange={(k) => setStage(k as "all" | MoStage)} cards={[
                  { key: "all", label: "ทั้งหมด", value: stageN("all"), hint: `${fmt(new Set(linkedQ.map((r) => r.mo_no)).size)} ใบงาน` },
                  ...STAGES.map((s) => ({ key: s.k, label: MO_STAGE_LABEL[s.k], value: stageN(s.k), tone: s.tone,
                    hint: s.k === "wait" ? "ขายไปแล้ว แต่ยังไม่จ่ายงาน" : s.k === "ship" ? "ยังไม่ปิดใบ = ปิดได้" : undefined })),
                ]} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-slate-500">จำนวน</span>
                  {QTY_FILTERS.map((f) => (
                    <button key={f.v} type="button" onClick={() => setQk(f.v)}
                      title={f.v === "over" ? "ใบงานผลิตมากกว่าที่ผูกใบขายรวม" : f.v === "short" ? "ใบขายขายมากกว่าที่ผูกใบงานรวม" : undefined}
                      className={`h-8 rounded-lg border px-2.5 text-sm ${qk === f.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{f.label} {fmt(qtyN(f.v))}</button>
                  ))}
                  <div className="flex-1" />
                  <span className="text-[12px] text-slate-500">ติ๊กอยู่ {fmt(lShownTicked)}/{fmt(lTickable.length)}</span>
                  <button type="button" disabled={!lTickable.length || lShownTicked === lTickable.length} onClick={() => lTickAll(true)} title="ติ๊กทุกบรรทัดที่แสดงตามตัวกรอง (ยกเว้นใบที่ปิดแล้ว)"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:checks" /> ติ๊กทั้งหมด
                  </button>
                  <button type="button" disabled={!lShownTicked} onClick={() => lTickAll(false)} title="เอาติ๊กออกทุกบรรทัดที่แสดงตามตัวกรอง"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Icon value="i:square" /> ไม่ติ๊กทั้งหมด
                  </button>
                </div>
                {!linkedBills.length && <div className="py-8 text-center text-slate-400">{linked.length ? "ไม่มีรายการในตัวกรองนี้" : "ยังไม่มีบรรทัดใบขายที่ผูกใบงาน"}</div>}
                {linkedBills.map((b) => (
                  <div key={b.no} className="overflow-hidden rounded-xl border border-slate-200">
                    {billHead(b)}
                    {b.lines.map((r) => {
                      const note = linkedNote(r, thDate), closed = r.stage === "closed", fill = r.line_short > 0 ? fillCandOf(r) : null;
                      const small = "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px]";
                      return (
                        <div key={r.link_id} className="grid grid-cols-[22px_44px_minmax(0,1fr)_minmax(0,1.5fr)_auto] items-start gap-2.5 border-t border-slate-100 px-3 py-2 text-sm">
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" disabled={closed} checked={lsel.has(r.link_id)} onChange={(e) => lToggle(r.link_id, e.target.checked)}
                            title={closed ? "ใบงานปิดแล้ว — อัปเดตไม่ได้" : undefined} aria-label={`เลือก ${r.sku} · ${r.mo_no}`} />
                          {product(r, r.link_qty < r.qty ? ` · ผูก ${fmt(r.link_qty)}` : "")}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-[12px] text-slate-500">ผูกกับ</span><b className="font-mono text-slate-800">{r.mo_no}</b>
                              <span className="text-[12px] text-slate-500">ผลิต {fmt(r.mo_qty)} · เปิด {thDate(r.opened)}</span>
                              <StageTag stage={r.stage} />
                            </div>
                            {note && <div className={`text-[12px] ${note.full ? "text-slate-500" : "text-amber-700"}`}>{note.text}</div>}
                            {r.mo_left > 0 && !closed && (
                              <div className="flex flex-wrap items-center gap-2 text-[12px] text-amber-700">
                                <span>ใบงานเหลือ {fmt(r.mo_left)} ชิ้น (ยังไม่มีใบขาย)</span>
                                <button type="button" onClick={() => toBatch([r.mo_no], r.mo_no)} title="เปิดหน้าต่างเลือกใบขายของใบนี้ — เติมใบขาย หรือเลือกว่าที่เหลือ: เข้าคลังขาย / แยกเป็นใบใหม่รอผลิต / ไม่ทำแล้ว (ลดจำนวน)"
                                  className={`${small} border-amber-300 bg-amber-50 font-medium text-amber-900 hover:bg-amber-100`}>จัดการที่เหลือ…</button>
                              </div>
                            )}
                            {r.line_short > 0 && (
                              <div className="flex flex-wrap items-center gap-2 text-[12px] text-rose-700">
                                <span>ใบขายขาด {fmt(r.line_short)} ชิ้น — ขาย {fmt(r.qty)} แต่ผูกใบงานรวม {fmt(r.qty - r.line_short)}</span>
                                {fill
                                  ? <button type="button" onClick={() => toBatch([fill.mo_no], fill.mo_no)} title={`${fill.mo_no} ผลิต ${fmt(fill.qty)} ยังรับใบขายได้อีก ${fmt(fill.room)} ชิ้น — เปิดหน้าต่างเลือกใบขายของใบนั้น แล้วติ๊กใบขายนี้เพิ่ม`}
                                      className={`${small} border-rose-200 bg-white font-medium text-rose-700 hover:bg-rose-50`}>ผูกส่วนที่ขาดกับ {fill.mo_no} (ว่าง {fmt(fill.room)})…</button>
                                  : <span className="text-slate-500">ไม่มีใบงานอื่นที่ยังว่าง — ถ้าขายจากสต๊อกไม่ต้องทำอะไร</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-stretch gap-1">
                            {closed
                              ? <span className="text-[11px] text-slate-400">ใบงานปิดแล้ว</span>
                              : <button type="button" onClick={() => onOpenSingle(r.mo_no)} title="ป๊อปอัปเดตงานตัวเดิมของบอร์ด — เลือกสถานะจริงของใบนี้ (กติกาเดียวกัน)"
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 text-[12px] font-medium text-emerald-800 hover:bg-emerald-50"><Icon name="refresh" /> อัปเดต</button>}
                            {canLink
                              ? <button type="button" onClick={() => setMoving(r)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[12px] text-red-700 hover:bg-red-50"><Icon name="shuffle" /> ผูกผิด · ย้าย</button>
                              : <span className="text-[11px] text-slate-400">ย้ายได้เฉพาะหัวหน้า</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
    </ERPModal>
    {moving && <SalesMove row={moving} onClose={() => setMoving(null)}
      onDone={(mo) => { setMoving(null); if (mo) { onOpenBatch([mo]); onClose(); } else void load(); }} />}
    </>
  );
}
