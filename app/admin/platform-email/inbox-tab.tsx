"use client";

// 📬 แท็บ "เมลที่อ่านแล้ว" — ทุกเมลที่สคริปต์ส่งเข้ามา + ระบบทำอะไรกับมัน (ใช้เป็นประวัติ/ตรวจย้อนหลัง)
// ติ๊กหลายฉบับ → 🔄 อ่านใหม่ (หลังเพิ่มร้านในตั้งค่า/ปรับกฎ) · ✓ ปิดเรื่อง (คนตรวจแล้ว ไม่ต้องทำอะไร)
// ของกลาง: MiniTable · ERPInput · toast · ConfirmDialog

import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ERPInput } from "@/components/form";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, KIND_LABEL, PLATFORM_LABEL, STATUS_META, type InboxRow } from "./types";

const FILTERS: { v: string; label: string }[] = [
  { v: "", label: "ทั้งหมด" },
  { v: "attention", label: STATUS_META.attention.label },
  { v: "unreadable", label: STATUS_META.unreadable.label },
  { v: "done", label: STATUS_META.done.label },
  { v: "ignored", label: STATUS_META.ignored.label },
];

export function InboxTab({ initialStatus, onChanged }: { initialStatus: string; onChanged: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (query) p.set("q", query);
      const res = await apiFetch(`/api/platform-email/inbox?${p}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.rows as InboxRow[]); setSelected(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [status, query]);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: "reprocess" | "resolve") => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action, ids: [...selected] }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "ทำไม่สำเร็จ");
      if (action === "reprocess") {
        const r = (j.results ?? []) as { status: string }[];
        const done = r.filter((x) => x.status === "done").length;
        toast.success(`อ่านใหม่ ${r.length} ฉบับ — สำเร็จ ${done} ฉบับ${r.length - done ? ` · ยังต้องดู ${r.length - done} ฉบับ` : ""}`);
      } else toast.success(`ปิดเรื่อง ${selected.size} ฉบับแล้ว`);
      setConfirmResolve(false);
      await load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const columns: MiniColumn<InboxRow>[] = [
    { key: "received_at", header: "เวลาเมล", width: "8.5rem", sortValue: (r) => r.received_at ?? "",
      cell: (r) => <span className="text-xs tabular-nums text-slate-600">{fmtDateTime(r.received_at)}</span> },
    { key: "kind", header: "ประเภท", width: "9rem", sortValue: (r) => r.kind ?? "",
      cell: (r) => (
        <div className="text-xs leading-tight">
          <div className="font-medium text-slate-700">{r.platform_code ? PLATFORM_LABEL[r.platform_code] ?? r.platform_code : "—"}</div>
          <div className="text-slate-500">{KIND_LABEL[r.kind ?? ""] ?? r.kind ?? "—"}</div>
        </div>
      ) },
    { key: "order", header: "เลขออเดอร์", width: "9.5rem", sortValue: (r) => r.external_order_id ?? r.ref_no ?? "",
      cell: (r) => r.external_order_id
        ? <code className="font-mono text-[11px] text-slate-700">{r.external_order_id}</code>
        : r.ref_no ? <span className="text-[11px] text-slate-500">คำขอ <code className="font-mono">{r.ref_no}</code></span> : <span className="text-slate-300">—</span> },
    { key: "note", header: "ระบบทำอะไร", width: "1fr",
      cell: (r) => (
        <div className="text-xs leading-snug">
          <div className="text-slate-700">{r.note ?? "—"}</div>
          <div className="mt-0.5 truncate text-slate-400" title={`${r.subject ?? ""} · ${r.from_addr ?? ""}`}>{r.subject ?? "(ไม่มีหัวเรื่อง)"}{r.shop_name ? ` · ร้าน ${r.shop_name}` : ""}</div>
        </div>
      ) },
    { key: "status", header: "สถานะ", width: "6.5rem", sortValue: (r) => r.status,
      cell: (r) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].cls}`} title={STATUS_META[r.status].hint}>{STATUS_META[r.status].label}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setStatus(f.v)} className={`px-3 ${status === f.v ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>
          ))}
        </div>
        <div className="w-64"><ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขออเดอร์ / หัวเรื่อง / ผลที่ทำ" /></div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <span className="font-medium text-slate-700">เลือก {selected.size} ฉบับ</span>
          <button disabled={busy} onClick={() => void act("reprocess")} className="h-8 rounded-lg bg-slate-900 px-3 text-white hover:bg-slate-800 disabled:opacity-50">{busy ? "กำลังทำ..." : "🔄 อ่านใหม่"}</button>
          <button disabled={busy} onClick={() => setConfirmResolve(true)} className="h-8 rounded-lg border border-slate-200 px-3 hover:bg-slate-50 disabled:opacity-50">✓ ปิดเรื่อง</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:underline">ยกเลิกที่เลือก</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : (
        <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} hideSearch countUnit="ฉบับ"
          selectable selected={selected} onSelectedChange={setSelected}
          emptyText={status || query ? "ไม่พบเมลตามที่กรอง ลองเปลี่ยนตัวกรองหรือคำค้นหา" : "ยังไม่มีเมลเข้ามา — ติดตั้งสคริปต์ในแท็บ ตั้งค่า + ติดตั้ง แล้วรอสักครู่"}
          maxHeightClass="max-h-[calc(100vh-280px)]"
          footnote="แสดงล่าสุด 300 ฉบับ · 🔄 อ่านใหม่ = ให้ระบบอ่านเมลที่เก็บไว้อีกรอบด้วยกฎล่าสุด (ออเดอร์ที่สร้างแล้วจะไม่ซ้ำ)" />
      )}

      <ConfirmDialog open={confirmResolve} onClose={() => setConfirmResolve(false)} onConfirm={() => void act("resolve")} loading={busy}
        title={`ปิดเรื่อง ${selected.size} ฉบับ?`} confirmText="ปิดเรื่อง"
        message="เมลที่เลือกจะย้ายไปกลุ่ม “ข้าม” (ระบบไม่สร้าง/แก้ออเดอร์อะไรเพิ่ม) — ใช้เมื่อคนตรวจแล้วว่าไม่ต้องทำอะไร · กลับมากด “อ่านใหม่” ได้ภายหลัง" />
    </div>
  );
}
