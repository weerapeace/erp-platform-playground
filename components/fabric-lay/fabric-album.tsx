"use client";
/**
 * ✂️ อัลบั้มผ้าชิ้น — การ์ดรูปผ้า กรองตามประเภท (ตั้งเพิ่ม/แก้ชื่อได้ในช่องประเภท) + ขนาดจริง (เล็ก/กลาง/ใหญ่) + ค้นชื่อ
 *   onPick = โหมดเลือกผ้า (ตอนสร้างแผนวาง) · ปกติ = เพิ่ม/แก้/ลบ (ถังขยะ) · บอก "เหลือ x%" เมื่อมีแผนที่กดตัดแล้ว
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { FABRIC_SIZES, fabricLeftPct, fabricSize, type FabricSize } from "@/lib/fabric-lay";
import { FabricModal } from "./fabric-modal";
import { NewPlanModal } from "./plan-list";
import { API, api, imgUrl, sizeText, thaiDate, type Fabric, type FabricRow } from "./shared";

export function FabricAlbum({ onPick }: { onPick?: (f: FabricRow) => void }) {
  const toast = useToast();
  const router = useRouter();
  const canEdit = usePermission("fabric_lay.edit");
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<FabricRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("");
  const [size, setSize] = useState<FabricSize | "">("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Fabric | null | "new">(null);
  const [planFor, setPlanFor] = useState<FabricRow | null>(null);
  const [hardDel, setHardDel] = useState<FabricRow | null>(null);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api<FabricRow[]>(`${API}/fabrics${trash ? "?trash=1" : ""}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [trash]);
  useEffect(() => { void load(); }, [load]);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) { const k = r.kind || "ไม่ระบุประเภท"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (!kind || (r.kind || "ไม่ระบุประเภท") === kind)
    && (!size || fabricSize(r.width_cm, r.height_cm) === size)
    && (!q || `${r.code} ${r.name} ${r.kind ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [rows, kind, size, q]);

  const openEdit = async (r: FabricRow) => {
    try { setEdit(await api<Fabric>(`${API}/fabrics/${r.id}`)); } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไม่สำเร็จ"); }
  };
  const archive = async (r: FabricRow) => {
    try {
      await api(`${API}/fabrics/${r.id}`, { method: "DELETE" });
      setRows((c) => c?.filter((x) => x.id !== r.id) ?? c);
      toast.undo(`ย้าย ${r.code} เข้าถังขยะแล้ว`, async () => {
        try { await api(`${API}/fabrics/${r.id}`, { method: "PATCH", json: { is_active: true } }); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async (r: FabricRow) => {
    try { await api(`${API}/fabrics/${r.id}`, { method: "PATCH", json: { is_active: true } }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`กู้คืน ${r.code} แล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const destroy = async () => {
    const r = hardDel; if (!r) return;
    try { await api(`${API}/fabrics/${r.id}?hard=1`, { method: "DELETE" }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`ลบ ${r.code} ถาวรแล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    setHardDel(null);
  };

  const chip = (on: boolean) => `h-7 shrink-0 rounded-full border px-2.5 text-xs ${on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ / รหัสผ้า" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm sm:w-64" />
        <span className="flex-1" />
        {!onPick && <button type="button" onClick={() => setTrash((t) => !t)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Icon name="trash" /> {trash ? "กลับไปอัลบั้ม" : "ถังขยะ"}</button>}
        {canEdit && !trash && <button type="button" onClick={() => setEdit("new")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="add" /> เพิ่มผ้า</button>}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <span className="shrink-0 self-center text-xs text-slate-500">ประเภท:</span>
        <button type="button" className={chip(!kind)} onClick={() => setKind("")}>ทั้งหมด ({rows?.length ?? 0})</button>
        {kinds.map(([k, n]) => <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(kind === k ? "" : k)}>{k} ({n})</button>)}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <span className="shrink-0 self-center text-xs text-slate-500">ขนาด:</span>
        <button type="button" className={chip(!size)} onClick={() => setSize("")}>ทุกขนาด</button>
        {FABRIC_SIZES.map((s) => <button key={s.key} type="button" className={chip(size === s.key)} onClick={() => setSize(size === s.key ? "" : s.key)}>{s.th}</button>)}
      </div>
      {trash && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">ถังขยะ — ผ้าที่ลบไว้ กู้คืนได้ · ลบถาวรได้เมื่อไม่มีแผนวางของผ้านี้แล้ว</div>}

      {err ? <ErrorState title={err} onRetry={() => void load()} />
        : rows === null ? <LoadingState />
        : !shown.length ? <EmptyState title={trash ? "ถังขยะว่าง" : rows.length ? "ไม่พบผ้าที่ตรงตัวกรอง" : "ยังไม่มีผ้าในอัลบั้ม"} hint={!trash && !rows.length && canEdit ? "กด \"เพิ่มผ้า\" ถ่ายรูปผ้าจากด้านบน แล้วใส่ขนาดจริง" : undefined} />
        : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((r) => {
              const left = fabricLeftPct(r.width_cm, r.height_cm, r.used_area_cm2);
              const ready = !!(r.image_key && r.width_cm && r.height_cm);
              return (
                <div key={r.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
                  <button type="button" onClick={() => (onPick ? onPick(r) : trash ? undefined : void openEdit(r))} className="block w-full">
                    <div className="aspect-[4/3] bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.image_key ? <img src={imgUrl(r.image_key, 480) ?? ""} alt="" loading="lazy" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-slate-300"><Icon value="i:photo" size={32} /></div>}
                    </div>
                  </button>
                  <div className="space-y-0.5 p-2">
                    <div className="truncate font-medium text-slate-900">{r.name}</div>
                    <div className="truncate text-xs text-slate-500">{r.code} · {r.kind || "ไม่ระบุประเภท"}</div>
                    <div className="text-xs text-slate-600">{sizeText(r.width_cm, r.height_cm)}</div>
                    <div className={`text-xs ${!ready ? "text-amber-700" : left != null && left < 100 ? "text-indigo-700" : "text-emerald-700"}`}>
                      {!ready ? "ยังไม่ตั้งสเกล" : left != null && left < 100 ? `ตัดไปแล้ว · เหลือ ~${left}%` : "ผ้าเต็มผืน"}
                    </div>
                    {trash && <div className="text-[11px] text-slate-400">ลบเมื่อ {thaiDate(r.deleted_at)}</div>}
                    {!onPick && canEdit && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {trash ? <>
                          <button type="button" onClick={() => void restore(r)} className="h-7 rounded-md border border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50">กู้คืน</button>
                          <button type="button" onClick={() => setHardDel(r)} className="h-7 rounded-md px-2 text-xs text-red-600 hover:bg-red-50">ลบถาวร</button>
                        </> : <>
                          <button type="button" disabled={!ready} onClick={() => setPlanFor(r)} className="h-7 rounded-md bg-indigo-50 px-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">วางแบบบนผ้านี้</button>
                          <button type="button" onClick={() => void openEdit(r)} className="h-7 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100">แก้</button>
                          <button type="button" onClick={() => void archive(r)} className="h-7 rounded-md px-2 text-xs text-red-600 hover:bg-red-50">ลบ</button>
                        </>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <FabricModal open={edit !== null} fabric={edit === "new" ? null : edit} onClose={() => setEdit(null)}
        onSaved={(f) => { setEdit(null); setRows((c) => { if (!c) return c; const i = c.findIndex((x) => x.id === f.id); return i >= 0 ? c.map((x) => (x.id === f.id ? f : x)) : [f, ...c]; }); }} />
      <NewPlanModal open={!!planFor} fabric={planFor} onClose={() => setPlanFor(null)} onCreated={(id) => router.push(`/master/fabric-lay/plans/${id}`)} />
      <ConfirmDialog open={!!hardDel} onClose={() => setHardDel(null)} onConfirm={() => void destroy()} variant="danger"
        title="ลบผ้านี้ถาวร?" message={<>ลบ <b>{hardDel?.code} {hardDel?.name}</b> ถาวร กู้คืนไม่ได้ — พิมพ์รหัสผ้าเพื่อยืนยัน</>} confirmText="ลบถาวร" requireTyped={hardDel?.code} />
    </div>
  );
}
