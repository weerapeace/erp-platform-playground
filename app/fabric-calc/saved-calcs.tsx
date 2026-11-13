"use client";

/**
 * แถบ "บันทึกผล" ของหน้าคิดผ้าก่อนซื้อ (เฟส 2) — ตั้งชื่อ · บันทึก/บันทึกทับ/บันทึกเป็นชุดใหม่ · เปิดที่บันทึกไว้ · คัดลอกลิงก์แชร์ (/fabric-calc?calc=<id>) · ลบ (ยืนยันก่อน)
 * ข้อมูล: /api/fabric-buy-calcs (ตาราง fabric_buy_calcs) · ของกลาง: ERPModal · ConfirmDialog · MiniTable · useToast
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import type { FabricBuyCalcRow } from "@/app/api/fabric-buy-calcs/route";
import { fmt, textCls } from "./buy-ui";

export type SavePack = { mode: "single" | "family"; payload: Record<string, unknown>; summary: FabricBuyCalcRow["summary"]; suggestName: string };

const when = (s: string) => new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const summaryTxt = (r: FabricBuyCalcRow) => {
  const s = r.summary ?? {};
  if (r.mode === "family") return `${fmt(s.fabrics ?? 0, 0)} ผ้า · ${fmt(s.qty ?? 0, 0)} ใบ${s.cost_buy ? ` · งบ ฿${fmt(s.cost_buy, 0)}` : ""}`;
  return `${s.need != null ? `ใช้ ${fmt(s.need)} ${s.unit ?? ""}` : "-"}${s.to_buy ? ` · ซื้อเพิ่ม ${fmt(s.to_buy)}` : ""}${s.cost_buy ? ` · ฿${fmt(s.cost_buy, 0)}` : ""}`;
};

export function SavedCalcsBar({ pack, onLoad }: { pack: () => SavePack; onLoad: (row: FabricBuyCalcRow) => void }) {
  const toast = useToast();
  const [cur, setCur] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState<FabricBuyCalcRow[] | null>(null);
  const [listErr, setListErr] = useState("");
  const [del, setDel] = useState<FabricBuyCalcRow | null>(null);

  const openRow = async (id: string, quiet = false) => {
    try {
      const j = await apiFetch(`/api/fabric-buy-calcs?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json());
      if (j.error || !j.data) { toast.error(j.error ?? "เปิดไม่สำเร็จ"); return; }
      const row = j.data as FabricBuyCalcRow;
      onLoad(row);
      setCur({ id: row.id, name: row.name }); setName(row.name); setListOpen(false);
      if (!quiet) toast.success(`เปิด “${row.name}” แล้ว`);
    } catch { toast.error("เปิดไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  };

  // ลิงก์แชร์ /fabric-calc?calc=<id> → เปิดให้อัตโนมัติ
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("calc");
    if (id) void openRow(id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadList = async () => {
    setList(null); setListErr("");
    try {
      const j = await apiFetch("/api/fabric-buy-calcs", { cache: "no-store" }).then((r) => r.json());
      if (j.error) setListErr(j.error); else setList(j.data ?? []);
    } catch { setListErr("โหลดรายการไม่สำเร็จ"); }
  };

  const save = async (asNew: boolean) => {
    const p = pack();
    const nm = name.trim() || p.suggestName;
    if (!nm) { toast.error("ตั้งชื่อก่อนบันทึก"); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: nm, mode: p.mode, payload: p.payload, summary: p.summary });
      const res = cur && !asNew
        ? await apiFetch(`/api/fabric-buy-calcs?id=${encodeURIComponent(cur.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await apiFetch("/api/fabric-buy-calcs", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await res.json();
      if (!res.ok || j.error) { toast.error(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      setCur({ id: j.data.id, name: j.data.name }); setName(j.data.name);
      toast.success(cur && !asNew ? "บันทึกทับแล้ว" : "บันทึกแล้ว — คัดลอกลิงก์ส่งให้คนอื่นเปิดดูได้");
    } catch { toast.error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };

  const copyLink = async () => {
    if (!cur) return;
    const url = `${window.location.origin}/fabric-calc?calc=${cur.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์แล้ว"); }
    catch { toast.error(`คัดลอกไม่ได้ — ลิงก์: ${url}`); }
  };

  const doDelete = async () => {
    if (!del) return;
    try {
      const j = await apiFetch(`/api/fabric-buy-calcs?id=${encodeURIComponent(del.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success(`ลบ “${del.name}” แล้ว`);
      if (cur?.id === del.id) setCur(null);
      setList((l) => (l ?? []).filter((x) => x.id !== del.id));
    } catch { toast.error("ลบไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setDel(null); }
  };

  const cols: MiniColumn<FabricBuyCalcRow>[] = [
    { key: "n", header: "ชื่อ", width: "2fr", sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-slate-700">{r.name}</span> },
    { key: "m", header: "แบบ", width: "0.9fr", cell: (r) => <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.mode === "family" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{r.mode === "family" ? "ทั้งตระกูล" : "ผ้าเดียว"}</span> },
    { key: "s", header: "สรุป", width: "2fr", cell: (r) => <span className="text-[12px] text-slate-500">{summaryTxt(r)}</span> },
    { key: "by", header: "โดย", width: "1fr", cell: (r) => <span className="text-[12px] text-slate-500">{r.updated_by_name ?? r.created_by_name ?? "-"}</span> },
    { key: "u", header: "แก้ล่าสุด", width: "1fr", sortValue: (r) => r.updated_at, cell: (r) => <span className="text-[12px] text-slate-500">{when(r.updated_at)}</span> },
    { key: "x", header: "", width: "3rem", align: "right", cell: (r) => <button type="button" title="ลบ" onClick={(e) => { e.stopPropagation(); setDel(r); }} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="delete" /></button> },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 py-2 shadow-sm">
      <Icon name="save" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ตั้งชื่อการคำนวณ เช่น TOTE-01 ล็อต ธ.ค." className={`${textCls} !h-8 max-w-xs flex-1`} />
      <button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : cur ? "บันทึกทับ" : "บันทึก"}</button>
      {cur && <button type="button" disabled={saving} onClick={() => void save(true)} className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] text-slate-600 hover:bg-slate-50">บันทึกเป็นชุดใหม่</button>}
      {cur && <button type="button" onClick={() => void copyLink()} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[12px] text-slate-600 hover:bg-slate-50"><Icon name="link" /> คัดลอกลิงก์</button>}
      <button type="button" onClick={() => { setListOpen(true); void loadList(); }} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50"><Icon name="folder-open" /> เปิดที่บันทึกไว้</button>
      {cur && <span className="w-full text-[11.5px] text-slate-400">กำลังแก้ “{cur.name}” — กดบันทึกทับเพื่ออัปเดต</span>}

      <ERPModal open={listOpen} onClose={() => setListOpen(false)} title="การคำนวณที่บันทึกไว้" size="lg">
        <MiniTable rows={list ?? []} columns={cols} rowKey={(r) => r.id} searchText={(r) => `${r.name} ${r.created_by_name ?? ""}`} searchPlaceholder="ค้นชื่อ / คนบันทึก" countUnit="ชุด"
          onRowClick={(r) => void openRow(r.id)}
          emptyText={listErr ? <span className="text-rose-600">{listErr} <button type="button" onClick={() => void loadList()} className="underline">ลองใหม่</button></span> : list === null ? "กำลังโหลด…" : "ยังไม่มีการคำนวณที่บันทึกไว้ — คำนวณแล้วตั้งชื่อ กดบันทึก"} />
      </ERPModal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void doDelete()} variant="danger" confirmText="ลบ"
        title="ลบการคำนวณนี้?" message={del ? `“${del.name}” จะหายจากรายการ (ลิงก์ที่แชร์ไว้จะเปิดไม่ได้)` : ""} />
    </div>
  );
}
