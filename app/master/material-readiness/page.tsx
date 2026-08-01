"use client";

/**
 * ความพร้อมวัตถุดิบ (/master/material-readiness) — เฟส 1 ของโมดูล "พนักงานเตรียมของ"
 *  • การ์ดใบสั่งผลิต + % ความพร้อม + ป้าย "ติดของหลัก" (critical ยังไม่ครบ = ผลิตไม่ได้)
 *  • อันดับวัตถุดิบที่ขาด (รวมทุกใบ) → รู้ว่าควรซื้อ/หามาก่อนตัวไหน + ใส่ตะกร้าขอซื้อได้
 *  • กดการ์ด → ป๊อปรายการวัตถุดิบของใบนั้น (พร้อม/ยังไม่พร้อม/ต้องซื้อ)
 * อ่านอย่างเดียว — ไม่แก้ข้อมูล ไม่กระทบวิธีทำงานเดิม (ติ๊กเตรียม/ตัด ยังทำที่บอร์ดจ่ายงานเหมือนเดิม)
 * ของกลาง: HoverImage · ERPModal · useToast · apiFetch · addToPrCart · useViewPref
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { addToPrCart } from "@/lib/pr-cart";
import { useViewPref } from "@/lib/use-view-pref";
import { usePermission } from "@/components/auth";
import type { ReadinessMo, ReadinessLine, MissingRow, Criticality } from "@/app/api/mo/material-readiness/route";
import type { MaterialGroup } from "@/app/api/bom/material-groups/route";

type Resp = {
  summary: { total: number; ready: number; preparing: number; waiting: number; blocked: number; no_bom: number; missing_items: number; missing_ordered: number };
  mos: ReadinessMo[];
  missing: MissingRow[];
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const daysUntil = (due: string | null) => {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - t.getTime()) / 86400000);
};
const dueText = (due: string | null) => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const dueCls = (due: string | null) => { const d = daysUntil(due); if (d == null) return "text-slate-400"; if (d < 0) return "text-rose-600 font-semibold"; if (d < 3) return "text-amber-600 font-semibold"; return "text-slate-500"; };

const CRIT_LABEL: Record<Criticality, string> = { critical: "ของหลัก", required: "ต้องมี", consumable: "สิ้นเปลือง" };
const CRIT_CLS: Record<Criticality, string> = {
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  required: "bg-slate-50 text-slate-600 border-slate-200",
  consumable: "bg-slate-50 text-slate-400 border-slate-200",
};

const barColor = (pct: number, blocked: boolean) =>
  blocked ? "bg-rose-500" : pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-slate-300";

const STATE_LABEL: Record<ReadinessMo["state"], string> = { ready: "พร้อมผลิต", preparing: "กำลังเตรียม", waiting: "รอของ", no_bom: "ไม่มีสูตร" };

function Bar({ pct, blocked }: { pct: number; blocked: boolean }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor(pct, blocked)}`} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

// ป๊อปตั้ง "ระดับความสำคัญ" ต่อหมวดวัตถุดิบ — มีผลกับ % ความพร้อม + ป้าย ⛔ ติดของหลัก ทั้งระบบ
function CriticalitySettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [rows, setRows] = useState<MaterialGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/bom/material-groups").then((r) => r.json())
      .then((j) => setRows((j?.data ?? []) as MaterialGroup[])).catch(() => setRows([]));
  }, []);

  const set = async (g: MaterialGroup, v: Criticality) => {
    if (g.criticality === v) return;
    setBusy(g.id);
    try {
      const res = await apiFetch("/api/bom/material-groups", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, criticality: v }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setRows((p) => (p ?? []).map((x) => (x.id === g.id ? { ...x, criticality: v } : x)));
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const OPTS: { v: Criticality; label: string; hint: string }[] = [
    { v: "critical", label: "ของหลัก", hint: "ขาดแล้วผลิตไม่ได้ → ใบงานขึ้น ⛔ ติดของหลัก" },
    { v: "required", label: "ต้องมี", hint: "นับใน % ความพร้อม แต่ไม่บล็อกการผลิต" },
    { v: "consumable", label: "สิ้นเปลือง", hint: "ไม่ถูกนับใน % เลย (ด้าย กาว น้ำยา)" },
  ];

  return (
    <ERPModal open onClose={onClose} size="lg" title="⚙ ระดับความสำคัญของหมวดวัตถุดิบ"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
      <div className="space-y-2">
        <p className="text-[12px] text-slate-500">
          กดเลือกได้เลย <b>บันทึกทันที</b> · มีผลกับทุกใบสั่งผลิตพร้อมกัน
          <br />ของหลัก = ขาดแล้วผลิตไม่ได้ · ต้องมี = นับใน % · สิ้นเปลือง = ไม่นับใน % เลย
        </p>
        {rows === null ? <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลด…</div> : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {rows.map((g) => (
              <div key={g.id} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{g.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{g.code}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {OPTS.map((o) => {
                    const on = g.criticality === o.v;
                    return (
                      <button key={o.v} title={o.hint} disabled={!canEdit || busy === g.id}
                        onClick={() => void set(g, o.v)}
                        className={`h-7 px-2.5 text-[11px] rounded border disabled:opacity-50 ${on
                          ? o.v === "critical" ? "border-rose-400 bg-rose-50 text-rose-700"
                            : o.v === "consumable" ? "border-slate-300 bg-slate-100 text-slate-500"
                            : "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{o.label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {!canEdit && <p className="text-[11px] text-rose-600">คุณไม่มีสิทธิ์แก้ (ต้องมีสิทธิ์แก้ข้อมูลสินค้า) — ดูได้อย่างเดียว</p>}
      </div>
    </ERPModal>
  );
}

export default function MaterialReadinessPage() {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "preparing" | "waiting" | "blocked">("all");
  const [sortKey, setSortKey] = useState<"due" | "pct_asc" | "pct_desc" | "mo">("due");
  const [detail, setDetail] = useState<ReadinessMo | null>(null);
  const { view, setView, defaultView, saveDefault } = useViewPref("material_readiness_view", ["cards", "table"] as const, "cards");

  const load = () => {
    apiFetch("/api/mo/material-readiness").then((r) => r.json())
      .then((j) => { if (j?.error) throw new Error(j.error); setData(j as Resp); })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = data.mos.filter((m) =>
      (filter === "all" ? true : filter === "blocked" ? m.blocked : m.state === filter) &&
      (q === "" || `${m.mo_no} ${m.product_sku ?? ""} ${m.product_name ?? ""}`.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      if (sortKey === "due") return (daysUntil(a.due_date) ?? 99999) - (daysUntil(b.due_date) ?? 99999);
      if (sortKey === "pct_asc") return a.pct - b.pct;
      if (sortKey === "pct_desc") return b.pct - a.pct;
      return a.mo_no.localeCompare(b.mo_no);
    });
  }, [data, search, filter, sortKey]);

  const missingShown = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q === "" ? data.missing : data.missing.filter((r) => `${r.component_sku ?? ""} ${r.component_name ?? ""}`.toLowerCase().includes(q));
  }, [data, search]);

  const addMissingToCart = (r: MissingRow) => {
    const n = addToPrCart([{
      label: r.component_name || r.component_sku || "-", qty: Math.max(1, Math.ceil(r.total_missing)), uom: r.uom || "ชิ้น",
      seller: "", price: 0, currency: "THB", image: null, variationId: null, skuRef: r.component_sku, skuId: null,
      note: `ขาดจาก ${r.mo_count} ใบสั่งผลิต`, reason: "วัตถุดิบไม่พอตามใบสั่งผลิต", sourceMoNo: r.mo_nos[0] ?? null,
    }]);
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว (${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };

  const selCls = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const cards: { key: typeof filter; label: string; value: number; cls: string }[] = data ? [
    { key: "all", label: "ใบสั่งผลิตทั้งหมด", value: data.summary.total, cls: "border-slate-200" },
    { key: "ready", label: "พร้อมผลิต", value: data.summary.ready, cls: "border-emerald-200 bg-emerald-50/50" },
    { key: "preparing", label: "กำลังเตรียม", value: data.summary.preparing, cls: "border-amber-200 bg-amber-50/50" },
    { key: "waiting", label: "รอของ", value: data.summary.waiting, cls: "border-slate-200 bg-slate-50" },
    { key: "blocked", label: "ติดของหลัก", value: data.summary.blocked, cls: "border-rose-200 bg-rose-50/50" },
  ] : [];

  return (
    <div className="p-4 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📦 ความพร้อมวัตถุดิบ</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ดูว่าใบไหนเดินได้ ใบไหนติด ติดเพราะอะไร · นับจากช่อง “เตรียมแล้ว/จำนวนที่มี” ที่ติ๊กในบอร์ดจ่ายงาน — หน้านี้<b>อ่านอย่างเดียว ไม่แก้ข้อมูล</b>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setSettingsOpen(true)} title="ตั้งว่าหมวดไหนเป็นของหลัก / ต้องมี / สิ้นเปลือง"
            className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">⚙ ระดับความสำคัญ</button>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setView("cards")} className={`h-9 px-3 text-sm ${view === "cards" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🖼 การ์ด</button>
            <button onClick={() => setView("table")} className={`h-9 px-3 text-sm border-l border-slate-200 ${view === "table" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>▤ ตาราง</button>
          </div>
          <button onClick={() => void saveDefault(view)} title="ตั้งมุมมองนี้เป็นค่าเริ่มต้นของฉัน"
            className={`h-9 px-2.5 text-sm rounded-lg border ${defaultView === view ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}>{defaultView === view ? "⭐" : "☆"}</button>
        </div>
      </div>

      {/* การ์ดสรุป — กดเพื่อกรอง */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        {cards.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`text-left rounded-xl border p-3 transition ${c.cls} ${filter === c.key ? "ring-2 ring-indigo-300" : "hover:shadow-sm"}`}>
            <div className="text-[11px] text-slate-500">{c.label}</div>
            <div className="text-2xl font-bold text-slate-800 leading-tight">{c.value}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ใบสั่งผลิต / สินค้า / วัตถุดิบ"
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px] flex-1" />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className={selCls}>
          <option value="due">↕ ใกล้ครบกำหนด</option>
          <option value="pct_asc">↕ พร้อมน้อย → มาก</option>
          <option value="pct_desc">↕ พร้อมมาก → น้อย</option>
          <option value="mo">↕ เลขใบสั่งผลิต</option>
        </select>
        {filter !== "all" && <button onClick={() => setFilter("all")} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">ล้างตัวกรอง</button>}
      </div>

      {err ? <div className="py-20 text-center text-rose-500">⚠ {err}</div>
        : !data ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
        : (
          <div className="flex flex-col xl:flex-row gap-3">
            {/* ซ้าย: ใบสั่งผลิต */}
            <div className="flex-1 min-w-0">
              {shown.length === 0 ? (
                <div className="py-20 text-center text-slate-300 text-sm">ไม่พบใบสั่งผลิตที่ตรงกับตัวกรอง</div>
              ) : view === "cards" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
                  {shown.map((m) => (
                    <button key={m.id} onClick={() => setDetail(m)}
                      className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm transition">
                      <div className="flex gap-2.5">
                        <HoverImage url={m.image} size={56} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-800 truncate">{m.product_sku ?? "—"}</span>
                            {m.blocked && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 whitespace-nowrap">⛔ ติดของหลัก</span>}
                            {!m.blocked && m.state === "ready" && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">พร้อมผลิต ✓</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{m.product_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{m.mo_no} · {fmt(m.qty)} ชิ้น</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-lg font-bold leading-none ${m.blocked ? "text-rose-600" : m.pct === 100 ? "text-emerald-600" : "text-slate-700"}`}>{m.pct}%</div>
                          <div className={`text-[10px] mt-0.5 ${dueCls(m.due_date)}`}>📅 {dueText(m.due_date)}</div>
                        </div>
                      </div>
                      <div className="mt-2"><Bar pct={m.pct} blocked={m.blocked} /></div>
                      <div className="flex items-center justify-between mt-1.5 text-[11px]">
                        <span className="text-slate-500">วัตถุดิบ <b className="text-slate-700">{m.ready}/{m.total}</b>{m.missing_count > 0 && <span className="text-rose-600"> · ขาด {m.missing_count}</span>}</span>
                        <span className="text-slate-400">{m.critical_total > 0 ? `ของหลัก ${m.critical_ready}/${m.critical_total}` : STATE_LABEL[m.state]}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] text-slate-500">
                      <tr>
                        <th className="text-left px-2 py-2 font-medium">ใบสั่งผลิต</th>
                        <th className="text-left px-2 py-2 font-medium">สินค้า</th>
                        <th className="px-2 py-2 font-medium w-40">ความพร้อม</th>
                        <th className="px-2 py-2 font-medium">ของหลัก</th>
                        <th className="px-2 py-2 font-medium">ขาด</th>
                        <th className="px-2 py-2 font-medium">ครบกำหนด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shown.map((m) => (
                        <tr key={m.id} onClick={() => setDetail(m)} className="cursor-pointer hover:bg-slate-50">
                          <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{m.mo_no}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <HoverImage url={m.image} size={26} />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-800 truncate">{m.product_sku}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[220px]">{m.product_name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <Bar pct={m.pct} blocked={m.blocked} />
                              <span className="text-[11px] tabular-nums text-slate-600 w-9 text-right">{m.pct}%</span>
                            </div>
                            <div className="text-[10px] text-slate-400">{m.ready}/{m.total} รายการ</div>
                          </td>
                          <td className="px-2 py-1.5 text-center text-[11px]">
                            {m.critical_total === 0 ? <span className="text-slate-300">—</span>
                              : m.blocked ? <span className="text-rose-600 font-semibold">{m.critical_ready}/{m.critical_total} ⛔</span>
                              : <span className="text-emerald-600">ครบ ✓</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center text-[11px] tabular-nums">{m.missing_count > 0 ? <span className="text-rose-600 font-semibold">{m.missing_count}</span> : <span className="text-slate-300">—</span>}</td>
                          <td className={`px-2 py-1.5 text-center text-[11px] whitespace-nowrap ${dueCls(m.due_date)}`}>{dueText(m.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ขวา: อันดับของที่ขาด */}
            <div className="xl:w-96 shrink-0">
              <div className="xl:sticky xl:top-2 border border-slate-200 rounded-xl bg-white">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-sm font-bold text-slate-700">🔥 วัตถุดิบที่ขาด (เรียงตามจำนวนใบงานที่รอ)</div>
                  <div className="text-[10px] text-slate-400">
                    ตัวบนสุด = ปลดล็อกใบงานได้มากที่สุดถ้าหามาได้
                    {data.summary.missing_ordered > 0 && <> · <span className="text-emerald-600">🚚 {data.summary.missing_ordered} รายการสั่งซื้อไปแล้ว รอเข้า</span></>}
                  </div>
                </div>
                <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-2 space-y-1.5">
                  {missingShown.length === 0 ? (
                    <div className="text-center text-[11px] text-slate-300 py-8">ไม่มีของขาด 🎉</div>
                  ) : missingShown.slice(0, 100).map((r) => (
                    <div key={r.component_sku ?? r.component_name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-100">
                      <HoverImage url={r.image} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-800 truncate">{r.component_name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[9px] px-1 py-0.5 rounded border ${CRIT_CLS[r.criticality]}`}>{CRIT_LABEL[r.criticality]}</span>
                          <span className="text-[10px] text-slate-400 font-mono truncate">{r.component_sku}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-bold text-rose-600 tabular-nums">{r.mo_count} ใบ</div>
                        <div className="text-[10px] text-slate-400 tabular-nums">ขาด {fmt(r.total_missing)} {r.uom}</div>
                        {r.incoming && r.incoming.qty > 0 && (
                          <div className="text-[10px] text-emerald-600 tabular-nums whitespace-nowrap"
                            title={`สั่งไปแล้วในใบ ${r.incoming.po_nos.join(", ")}`}>
                            🚚 มา {fmt(r.incoming.qty)}{r.incoming.expected ? ` · ${dueText(r.incoming.expected)}` : ""}
                          </div>
                        )}
                      </div>
                      <button onClick={() => addMissingToCart(r)}
                        title={r.incoming && r.incoming.qty > 0 ? `⚠️ สั่งไปแล้ว ${fmt(r.incoming.qty)} ${r.uom ?? ""} (${r.incoming.po_nos.join(", ")}) — กดถ้าจะสั่งเพิ่มอีก` : "ใส่ตะกร้าขอซื้อ"}
                        className={`shrink-0 h-7 px-2 text-[11px] border rounded ${r.incoming && r.incoming.qty > 0
                          ? "border-slate-200 text-slate-400 hover:bg-slate-50" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}>🛒</button>
                    </div>
                  ))}
                  {missingShown.length > 100 && <div className="text-center text-[10px] text-slate-400 py-1">แสดง 100 อันดับแรก จากทั้งหมด {missingShown.length}</div>}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ป๊อป: วัตถุดิบของใบนั้น */}
      <ERPModal open={!!detail} onClose={() => setDetail(null)} size="xl" storageKey="material-readiness-detail"
        title={detail ? `${detail.product_sku ?? ""} · ${detail.mo_no}` : ""}>
        {detail && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">ความพร้อม</span>
              <div className="flex-1"><Bar pct={detail.pct} blocked={detail.blocked} /></div>
              <b className={detail.blocked ? "text-rose-600" : "text-slate-700"}>{detail.pct}%</b>
              {detail.blocked && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">⛔ ของหลักยังไม่ครบ</span>}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">วัตถุดิบ</th>
                    <th className="px-2 py-1.5 font-medium">ระดับ</th>
                    <th className="px-2 py-1.5 font-medium text-right">ต้องใช้</th>
                    <th className="px-2 py-1.5 font-medium text-right">มีอยู่</th>
                    <th className="px-2 py-1.5 font-medium text-right">ต้องซื้อ</th>
                    <th className="px-2 py-1.5 font-medium text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l: ReadinessLine, i: number) => (
                    <tr key={`${l.summary_id ?? i}`} className={l.is_ready ? "" : "bg-rose-50/30"}>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <HoverImage url={l.image} size={26} />
                          <div className="min-w-0">
                            <div className="text-xs text-slate-800 truncate max-w-[280px]">{l.component_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">{l.component_sku}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center"><span className={`text-[9px] px-1 py-0.5 rounded border ${CRIT_CLS[l.criticality]}`}>{CRIT_LABEL[l.criticality]}</span></td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-xs">{fmt(l.required)} <span className="text-slate-400">{l.uom}</span></td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-xs">{l.on_hand > 0 ? fmt(l.on_hand) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-xs">{l.to_purchase > 0 ? <span className="text-amber-600">{fmt(l.to_purchase)}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-center">
                        {l.is_ready ? <span className="text-[10px] text-emerald-600">พร้อม ✓</span> : <span className="text-[10px] text-rose-600">ยังไม่พร้อม</span>}
                      </td>
                    </tr>
                  ))}
                  {detail.lines.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-[12px] text-slate-400">ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM)</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              “พร้อม” = ติ๊กเตรียมแล้วในบอร์ดจ่ายงาน หรือ จำนวนที่มี ≥ ที่ต้องใช้ · ของ<b>สิ้นเปลือง</b>ไม่นับใน % ·
              แก้ค่าเหล่านี้ได้ที่ <b>บอร์ดจ่ายงาน → เช็กลิสต์</b> หรือหน้าใบสั่งผลิต
            </p>
          </div>
        )}
      </ERPModal>

      {settingsOpen && <CriticalitySettings onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </div>
  );
}
