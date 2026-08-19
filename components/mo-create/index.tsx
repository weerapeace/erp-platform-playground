"use client";

/**
 * ของกลาง — "สร้างใบสั่งผลิต (MO) ใหม่" ป๊อปเดียวใช้ได้ทุกหน้า
 *
 *   <MoCreateModal open onClose={…} onCreated={(id, moNo) => …} />
 *
 * ใช้ที่: หน้าใบสั่งผลิต (/master/manufacturing-orders) · บอร์ดจ่ายงาน (/master/work-board)
 * ⚠️ มีตัวสร้าง MO ที่เดียวคือที่นี่ — ยิง POST /api/mo ตัวเดิม (เลขใบ/กางสูตร/audit ทำฝั่งเซิร์ฟเวอร์)
 *    ส่วน "แก้" ใบที่มีแล้ว ยังอยู่ที่หน้าใบสั่งผลิต (ฟอร์มใหญ่ที่มีวัตถุดิบ/ขอซื้อ/จ่ายงาน)
 * โหมด "เพิ่มหลายรายการ": กรอก/วางจาก Excel ได้ทีละหลายบรรทัด — ทุกบรรทัดใช้ค่าตั้งต้นจากฟอร์มด้านบน
 *    (วันที่สั่งงาน / กำหนดส่ง / สถานะ / หมายเหตุ) แล้วแก้รายบรรทัดทับได้
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · ComponentPicker · WorkInstructionPanel · lib/paste-table · /api/skus/lookup
 */
import { useCallback, useEffect, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ComponentPicker } from "@/components/material-picker";
import { parsePastedTable, parseNumberCell, parseDateCell, looksLikeHeaderRow } from "@/lib/paste-table";

// วิธีทำ/รูปสินค้า — โหลดตอนเลือกสินค้าแล้วเท่านั้น (หนัก ไม่ควรถ่วงหน้าที่เรียกใช้)
const WorkInstructionPanel = dynamicImport(
  () => import("@/components/work-instruction").then((m) => m.WorkInstructionPanel), { ssr: false });

type Version = { id: string; bom_code: string; version: string; is_default: boolean };
type SizeRow = { label: string; sort?: number };

const STATUS_OPTS: [string, string][] = [
  ["draft", "ร่าง"], ["confirmed", "ยืนยันแล้ว"], ["in_progress", "กำลังผลิต"],
];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
// วันนี้ตามเวลาเครื่อง (ไทย) — ห้ามใช้ toISOString() ตรง ๆ เพราะ UTC ร่นไป 1 วันช่วงเช้า
const todayLocal = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
// 1 บรรทัดในโหมดเพิ่มหลายรายการ
type MultiRow = { code: string; qty: string; due: string; note: string; name?: string | null; image?: string | null; bad?: boolean };
const emptyRow = (): MultiRow => ({ code: "", qty: "", due: "", note: "" });
const lblCls = "text-[11px] text-slate-500";
const inCls = "w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

export function MoCreateModal({ open, onClose, onCreated, defaultProductSku, defaultProductName, defaultProductImage }: {
  open: boolean;
  onClose: () => void;
  /** เรียกหลังสร้างสำเร็จ — หน้าที่เรียกใช้ควรรีเฟรชรายการของตัวเอง */
  onCreated?: (id: string, moNo: string) => void;
  defaultProductSku?: string | null;
  defaultProductName?: string | null;
  defaultProductImage?: string | null;
}) {
  const toast = useToast();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [due, setDue] = useState("");
  const [status, setStatus] = useState("draft");
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [verId, setVerId] = useState("");
  const [bomCode, setBomCode] = useState<string | null>(null);
  const [bomVersion, setBomVersion] = useState<string | null>(null);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [sizeQty, setSizeQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadingBom, setLoadingBom] = useState(false);
  const [orderDate, setOrderDate] = useState(todayLocal);       // วันที่สั่งงาน (ค่าเริ่มต้น = วันนี้)
  // โหมดเพิ่มหลายรายการ (วางจาก Excel ได้) — ค่าที่ไม่กรอกในบรรทัด จะใช้ค่าจากฟอร์มด้านบน
  const [multi, setMulti] = useState(false);
  const [rows, setRows] = useState<MultiRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [multiBusy, setMultiBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);   // กล่อง "วางจาก Excel"
  const [pasteText, setPasteText] = useState("");

  // เปิดใหม่ = ล้างฟอร์ม (เผื่อสร้างต่อหลายใบ)
  useEffect(() => {
    if (!open) return;
    setSku(defaultProductSku ?? ""); setName(defaultProductName ?? ""); setImage(defaultProductImage ?? null);
    setQty(1); setDue(""); setStatus("draft"); setNote("");
    setVersions([]); setVerId(""); setBomCode(null); setBomVersion(null); setSizes([]); setSizeQty({}); setErr(null);
    setOrderDate(todayLocal()); setMulti(false); setRows([emptyRow(), emptyRow(), emptyRow()]); setProgress(""); setPasteOpen(false); setPasteText("");
  }, [open, defaultProductSku, defaultProductName, defaultProductImage]);

  /** โหลดไซส์ของสูตร (ถ้าสูตรนั้นมีไซส์ → จำนวนรวมคิดจากผลบวกต่อไซส์) */
  const loadSizes = useCallback(async (bomId: string): Promise<SizeRow[]> => {
    try {
      const j = await apiFetch(`/api/bom/${bomId}`).then((r) => r.json());
      return ((j?.data?.sizes ?? []) as SizeRow[]);
    } catch { return []; }
  }, []);

  /** เลือกสินค้า → หาสูตรของสินค้านั้น แล้วเลือกสูตรหลักให้อัตโนมัติ */
  const pickProduct = async (code: string, label: string, img: string | null) => {
    setSku(code); setName(label); setImage(img);
    setVersions([]); setVerId(""); setBomCode(null); setBomVersion(null); setSizes([]); setSizeQty({});
    setLoadingBom(true);
    try {
      const j = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(code)}`).then((r) => r.json());
      const vers = (j.data ?? []) as Version[];
      setVersions(vers);
      const def = vers.find((v) => v.is_default) ?? vers[0];
      if (def) {
        setVerId(def.id); setBomCode(def.bom_code); setBomVersion(def.version);
        const sz = await loadSizes(def.id);
        setSizes(sz); setSizeQty({}); if (sz.length > 0) setQty(0);
      }
    } catch { setVersions([]); }
    finally { setLoadingBom(false); }
  };

  const selectVersion = async (vid: string) => {
    const v = versions.find((x) => x.id === vid); if (!v) return;
    setVerId(v.id); setBomCode(v.bom_code); setBomVersion(v.version);
    setLoadingBom(true);
    const sz = await loadSizes(v.id);
    setSizes(sz); setSizeQty({}); setQty(sz.length > 0 ? 0 : qty || 1);
    setLoadingBom(false);
  };

  const setOneSize = (label: string, val: number) => {
    const next = { ...sizeQty, [label]: Math.max(0, val || 0) };
    setSizeQty(next);
    setQty(sizes.reduce((a, s) => a + (next[s.label] || 0), 0));
  };

  const save = async () => {
    if (!sku) { setErr("กรุณาเลือกสินค้าที่จะผลิต"); return; }
    if (!(qty > 0)) { setErr(sizes.length > 0 ? "ใส่จำนวนอย่างน้อย 1 ไซส์" : "จำนวนต้องมากกว่า 0"); return; }
    setSaving(true); setErr(null);
    const payload: Record<string, unknown> = {
      product_sku: sku, product_name: name || null, qty,
      due_date: due || null, order_date: orderDate || null, bom_code: bomCode, bom_version: bomVersion,
      status, note: note || null,
    };
    // สูตรมีไซส์ → ส่งจำนวนต่อไซส์ (เซิร์ฟเวอร์คิดจำนวนรวม + แตกวัตถุดิบตามไซส์เอง)
    if (sizes.length > 0) payload.size_breakdown = sizes.map((s) => ({ label: s.label, qty: sizeQty[s.label] || 0 }));
    try {
      const res = await apiFetch("/api/mo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "สร้างไม่สำเร็จ");
      toast.success(`สร้างใบสั่งผลิตแล้ว: ${j.mo_no ?? ""}`);
      onCreated?.(String(j.id), String(j.mo_no ?? ""));
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ── โหมดเพิ่มหลายรายการ ──────────────────────────────────────────────
  /** ให้มี "บรรทัดว่างท้ายตาราง" เสมอ 1 บรรทัด — กรอกบรรทัดสุดท้ายแล้วเด้งบรรทัดใหม่ให้เอง ไม่ต้องกดเพิ่มเอง */
  const withTrailingBlank = (list: MultiRow[]) => {
    const last = list[list.length - 1];
    const blank = !!last && !last.code.trim() && !String(last.qty).trim() && !last.due && !last.note.trim();
    return blank ? list : [...list, emptyRow()];
  };
  const setRow = (i: number, patch: Partial<MultiRow>) =>
    setRows((prev) => withTrailingBlank(prev.map((r, k) => (k === i ? { ...r, ...patch } : r))));

  /** วางจาก Excel: คอลัมน์ = รหัสสินค้า | จำนวน | กำหนดส่ง | หมายเหตุ (2 คอลัมน์แรกก็พอ) */
  const applyPaste = async (text: string, startIdx = 0) => {
    if (!text.trim()) return;
    let grid = parsePastedTable(text);
    if (looksLikeHeaderRow(grid[0], /รหัส|sku|จำนวน|qty/i)) grid = grid.slice(1);
    setRows((prev) => {
      const next = [...prev];
      grid.forEach((cells, k) => {
        const i = startIdx + k;
        const row: MultiRow = {
          code: (cells[0] ?? "").trim(),
          qty: cells[1] != null && cells[1] !== "" ? String(parseNumberCell(cells[1])) : "",
          due: cells[2] ? parseDateCell(cells[2]) : "",
          note: (cells[3] ?? "").trim(),
        };
        if (i < next.length) next[i] = row; else next.push(row);
      });
      while (next.length < 3) next.push(emptyRow());
      return withTrailingBlank(next);
    });
    // ตรวจรหัส + ดึงชื่อ/รูปให้ทันที (จะได้เห็นว่าตัวไหนผิดตั้งแต่วางเสร็จ)
    setMultiBusy(true);
    setRows((prev) => { void checkCodes(prev).then((c) => { setRows(c); setMultiBusy(false); }); return prev; });
    setPasteOpen(false); setPasteText("");
    toast.success("วาง " + grid.length + " บรรทัดแล้ว");
  };

  /** ตรวจว่ารหัสสินค้ามีจริงไหม + เติมชื่อให้ดู (ของกลาง /api/skus/lookup) */
  const checkCodes = useCallback(async (list: MultiRow[]): Promise<MultiRow[]> => {
    const codes = [...new Set(list.map((r) => r.code.trim()).filter(Boolean))];
    if (!codes.length) return list;
    try {
      const j = await apiFetch("/api/skus/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes }) })
        .then((r) => r.json());
      const map = (j?.data ?? {}) as Record<string, { code: string; name: string; image_key?: string | null } | null>;
      return list.map((r) => {
        const key = r.code.trim(); if (!key) return { ...r, name: null, image: null, bad: false };
        const hit = map[key];
        return { ...r, code: hit?.code ?? key, name: hit?.name ?? null, image: hit?.image_key ?? null, bad: !hit };
      });
    } catch { return list; }
  }, []);

  const verifyRows = async () => {
    setMultiBusy(true);
    const checked = await checkCodes(rows);
    setRows(checked);
    setMultiBusy(false);
    const bad = checked.filter((r) => r.code.trim() && r.bad).length;
    if (bad > 0) toast.error("มีรหัสที่หาไม่เจอ " + bad + " บรรทัด"); else toast.success("รหัสถูกต้องทุกบรรทัด");
  };

  /** สร้างทีละใบ (เลขใบ/กางสูตร ทำฝั่งเซิร์ฟเวอร์เหมือนสร้างใบเดียว) */
  const saveMulti = async () => {
    setMultiBusy(true); setErr(null);
    const checked = await checkCodes(rows);
    setRows(checked);
    const use = checked.filter((r) => r.code.trim() && Number(r.qty) > 0 && !r.bad);
    const bad = checked.filter((r) => r.code.trim() && r.bad);
    if (bad.length) {
      setMultiBusy(false);
      setErr("มีรหัสที่หาไม่เจอ " + bad.length + " บรรทัด (" + bad.slice(0, 3).map((b) => b.code).join(", ") + (bad.length > 3 ? "…" : "") + ") — แก้ก่อนบันทึก");
      return;
    }
    if (!use.length) { setMultiBusy(false); setErr("ยังไม่มีบรรทัดที่กรอกครบ (ต้องมีรหัสสินค้า + จำนวน)"); return; }

    const bomCache = new Map<string, { code: string | null; version: string | null }>();
    let ok = 0; const fails: string[] = []; let lastId = ""; let lastNo = "";
    for (let i = 0; i < use.length; i++) {
      const r = use[i];
      setProgress("กำลังสร้าง " + (i + 1) + "/" + use.length + " · " + r.code);
      try {
        if (!bomCache.has(r.code)) {
          const jv = await apiFetch("/api/bom/versions?product_sku=" + encodeURIComponent(r.code)).then((x) => x.json());
          const vers = (jv.data ?? []) as Version[];
          const def = vers.find((v) => v.is_default) ?? vers[0];
          bomCache.set(r.code, { code: def?.bom_code ?? null, version: def?.version ?? null });
        }
        const b = bomCache.get(r.code) ?? { code: null, version: null };
        const res = await apiFetch("/api/mo", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_sku: r.code, product_name: r.name ?? null, qty: Number(r.qty) || 0,
            due_date: r.due || due || null, order_date: orderDate || null,
            bom_code: b.code, bom_version: b.version, status, note: r.note || note || null,
          }) });
        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || "สร้างไม่สำเร็จ");
        ok += 1; lastId = String(j.id); lastNo = String(j.mo_no ?? "");
      } catch (e) { fails.push(r.code + ": " + (e instanceof Error ? e.message : "ไม่สำเร็จ")); }
    }
    setMultiBusy(false); setProgress("");
    if (ok > 0) toast.success("สร้างใบสั่งผลิตแล้ว " + ok + " ใบ" + (fails.length ? " · ไม่สำเร็จ " + fails.length : ""));
    if (fails.length) { setErr("ไม่สำเร็จ " + fails.length + " บรรทัด — " + fails.slice(0, 3).join(" · ")); toast.error("มี " + fails.length + " บรรทัดที่สร้างไม่ได้"); }
    if (ok > 0) { onCreated?.(lastId, lastNo); if (!fails.length) onClose(); }
  };

  const filledRows = rows.filter((r) => r.code.trim() && Number(r.qty) > 0).length;

  return (
    <ERPModal open={open} onClose={() => !saving && !multiBusy && onClose()} size="lg" storageKey="mo-create" title="🏭 สร้างใบสั่งผลิตใหม่"
      footer={<>
        {multi && <span className="mr-auto text-[11px] text-slate-400">{progress || ("พร้อมสร้าง " + filledRows + " ใบ")}</span>}
        <button onClick={onClose} disabled={saving || multiBusy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        {multi ? (
          <>
            <button onClick={() => void verifyRows()} disabled={multiBusy} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">🔎 ตรวจรหัส</button>
            <button onClick={() => void saveMulti()} disabled={multiBusy || filledRows === 0}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {multiBusy ? "กำลังสร้าง…" : "สร้าง " + filledRows + " ใบ"}
            </button>
          </>
        ) : (
          <button onClick={() => void save()} disabled={saving || !sku}
            className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังสร้าง…" : "สร้างใบสั่งผลิต"}
          </button>
        )}
      </>}>
      <div className="space-y-2">
        {err && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">{multi ? "ค่าด้านล่างนี้เป็นค่าตั้งต้นของทุกบรรทัด (บรรทัดไหนกรอกเอง จะใช้ของบรรทัดนั้น)" : ""}</span>
          <button type="button" onClick={() => setMulti((v) => !v)}
            className={"h-8 px-3 text-xs font-medium rounded-lg border " + (multi ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600")}>
            {multi ? "← กลับไปสร้างใบเดียว" : "➕ เพิ่มหลายรายการ"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className={lblCls}>เลขที่ใบสั่งผลิต</span>
            <div className="h-8 mt-0.5 px-2 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-400">ออกอัตโนมัติ</div>
          </div>
          <label className="block">
            <span className={lblCls}>วันที่สั่งงาน</span>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inCls} />
          </label>
          <label className="block">
            <span className={lblCls}>กำหนดส่ง <span className="text-slate-400">(เตือนเมื่อใกล้ครบ)</span></span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inCls} />
          </label>
        </div>

        {multi ? (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500">
              <span>📋 รายการที่จะสร้าง</span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => setPasteOpen((v) => !v)} className="text-[11px] text-blue-600 hover:underline">📥 วางจาก Excel</button>
                <button type="button" onClick={() => setRows((p) => [...p, emptyRow(), emptyRow(), emptyRow()])} className="text-[11px] text-blue-600 hover:underline">+ เพิ่มบรรทัด</button>
              </span>
            </div>

            {pasteOpen && (
              <div className="px-3 py-2 bg-blue-50/50 border-t border-blue-100 space-y-1.5">
                <p className="text-[11px] text-slate-500">คัดลอกจาก Excel แล้ววางในช่องนี้ — คอลัมน์: <b>รหัสสินค้า · จำนวน · กำหนดส่ง · หมายเหตุ</b> (2 คอลัมน์แรกก็พอ)</p>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} autoFocus
                  onPaste={(e) => { const t = e.clipboardData.getData("text/plain"); if (t && /[\t\n,]/.test(t)) { e.preventDefault(); void applyPaste(t, 0); } }}
                  placeholder={"CTL107-01\t300\n WK42-01\t120"}
                  className="w-full px-2 py-1.5 text-sm border border-blue-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => void applyPaste(pasteText, 0)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ลงตาราง</button>
                  <button type="button" onClick={() => { setPasteOpen(false); setPasteText(""); }} className="h-8 px-3 text-xs border border-slate-200 rounded-lg text-slate-500">ปิด</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-[minmax(11rem,1.7fr)_5.5rem_9.5rem_minmax(6rem,1fr)_2rem] gap-1.5 px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] font-medium text-slate-500 items-center">
              <span>สินค้า</span>
              <span className="text-right">จำนวน</span>
              <span className="flex items-center gap-1">
                กำหนดส่ง
                <button type="button" title="ลงวันกำหนดส่งด้านบนให้ทุกบรรทัด"
                  onClick={() => { if (!due) { toast.error("ใส่กำหนดส่งด้านบนก่อน"); return; } setRows((p) => p.map((r) => ({ ...r, due }))); toast.success("ลงกำหนดส่งให้ทุกบรรทัดแล้ว"); }}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-blue-600 hover:bg-blue-50">⬇ ลงทั้งหมด</button>
              </span>
              <span>หมายเหตุ</span>
              <span />
            </div>

            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {rows.map((r, i) => (
                <div key={i} className={"grid grid-cols-[minmax(11rem,1.7fr)_5.5rem_9.5rem_minmax(6rem,1fr)_2rem] gap-1.5 px-3 py-1 items-center " + (r.bad ? "bg-rose-50/60" : "")}>
                  <span className="min-w-0">
                    <ComponentPicker sku={r.code} name={r.name ?? ""} imageKey={r.image ?? null} placeholder="— เลือกสินค้า —"
                      onPick={(c) => setRow(i, { code: c.code, name: c.name, image: c.image_key ?? null, bad: false })} />
                    {r.bad && <span className="block text-[10px] text-rose-600">ไม่พบรหัส {r.code}</span>}
                  </span>
                  <input type="number" min={0} step="any" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="0"
                    className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="date" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })} title="ไม่ใส่ = ใช้กำหนดส่งด้านบน"
                    className="h-8 px-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input value={r.note} onChange={(e) => setRow(i, { note: e.target.value })} placeholder="—"
                    className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : [emptyRow()]))}
                    className="w-7 h-7 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-xs">🗑</button>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
              กรอกครบ <b className="text-slate-700">{filledRows}</b> บรรทัด · สูตร (BOM) ระบบเลือกสูตรหลักของสินค้าให้อัตโนมัติ · ไม่ใส่กำหนดส่ง/หมายเหตุ = ใช้ค่าด้านบน
            </div>
          </div>
        ) : (<>
        <div>
          <span className={lblCls}>สินค้าที่ผลิต</span>
          <div className="mt-0.5">
            <ComponentPicker sku={sku} name={name} imageKey={image} placeholder="— เลือกสินค้าที่ผลิต —"
              onPick={(c) => void pickProduct(c.code, c.name, c.image_key ?? null)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className={lblCls}>จำนวนผลิต{sizes.length > 0 ? " (รวมไซส์)" : ""}</span>
            <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))}
              readOnly={sizes.length > 0} title={sizes.length > 0 ? "คิดจากผลบวกจำนวนต่อไซส์ด้านล่าง" : undefined}
              className={`${inCls} text-right ${sizes.length > 0 ? "bg-slate-50 text-slate-500" : ""}`} />
          </label>
          <div>
            <span className={lblCls}>สูตร (BOM)</span>
            <select value={verId} onChange={(e) => e.target.value && void selectVersion(e.target.value)} className={inCls}>
              {versions.length === 0 && <option value="">{sku ? "— ไม่มีสูตร —" : "— เลือกสินค้าก่อน —"}</option>}
              {versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.is_default ? " ★" : ""}</option>)}
            </select>
          </div>
          <label className="block">
            <span className={lblCls}>สถานะ</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inCls}>
              {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {sku && versions.length === 0 && !loadingBom && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            สินค้านี้ยังไม่มีสูตร — สร้างใบได้ แต่ระบบจะยังไม่รู้ว่าต้องเตรียม/ตัดอะไร (เสนอสูตรได้จากปุ่ม “⚠ ไม่มีสูตร” บนการ์ดในช้อปจ่ายงาน)
          </div>
        )}

        {/* จำนวนต่อไซส์ — เฉพาะสูตรที่มีไซส์ */}
        {sizes.length > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-600 mb-1.5">📏 จำนวนต่อไซส์ <span className="text-slate-400 font-normal">(สูตรนี้มีไซส์ — กรอกจำนวนที่จะผลิตแต่ละไซส์)</span></div>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <label key={s.label} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
                  <span className="text-xs font-medium text-slate-600 min-w-[2rem]">{s.label}</span>
                  <input type="number" min={0} step="any" value={sizeQty[s.label] ?? ""} onChange={(e) => setOneSize(s.label, Number(e.target.value))} placeholder="0"
                    className="w-16 h-7 px-1.5 text-sm text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
              ))}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">รวม <b className="text-slate-700">{fmt(qty)}</b> ชิ้น</div>
          </div>
        )}

        <label className="block">
          <span className={lblCls}>หมายเหตุ</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inCls} />
        </label>

        {/* วิธีทำ/สเปกจากสินค้าแม่ — ช่วยคนเปิดใบเช็กว่าเลือกถูกตัว */}
        {sku && <WorkInstructionPanel sku={sku} defaultOpen={false} />}
        </>
        )}
      </div>
    </ERPModal>
  );
}
