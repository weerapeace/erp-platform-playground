"use client";
/**
 * Help Guides — คู่มือ "วิธีใช้งาน" ของกลาง (ตั้ง/แก้เองในเว็บ ไม่ต้องแก้โค้ด)
 *   <HelpButton guideKey="drive-link" /> — ปุ่ม "❓ วิธีใช้งาน" เล็ก ๆ วางตรงจุดที่เกี่ยวข้อง
 *   <HelpGuideModal guideKey=… onClose=… /> — ป๊อปอัปอ่านคู่มือ (แอดมินแก้ได้ในตัว)
 *   <HelpGuidesManager /> — หน้าเต็ม จัดการทุกคู่มือ (/master/help-guides)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ImageInput } from "@/components/image-input";
import { useAuth } from "@/components/auth";
import type { HelpGuide, HelpStep } from "@/app/api/help-guides/route";

type StepDraft = { title: string; body: string; image_r2_key: string; link_url: string };
const toDraft = (s: HelpStep): StepDraft => ({ title: s.title, body: s.body ?? "", image_r2_key: s.image_r2_key ?? "", link_url: s.link_url ?? "" });
const imgUrl = (k?: string | null) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);

// ── อ่านคู่มือ (read-only) ──
function GuideReader({ guide }: { guide: HelpGuide }) {
  if (!guide.steps.length) return <p className="text-[13px] text-slate-400 py-6 text-center">คู่มือนี้ยังไม่มีขั้นตอน</p>;
  return (
    <ol className="space-y-3">
      {guide.steps.map((s, i) => (
        <li key={s.id} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[12px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-slate-800">{s.title}</p>
            {s.body && <p className="text-[12px] text-slate-600 whitespace-pre-wrap mt-0.5">{s.body}</p>}
            {imgUrl(s.image_r2_key) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl(s.image_r2_key)!} alt="" className="mt-1.5 max-w-full rounded-lg border border-slate-200" />
            )}
            {s.link_url && <a href={s.link_url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-[12px] text-indigo-600 hover:underline">↗ เปิดลิงก์</a>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── แก้ขั้นตอน (แอดมิน) ──
function GuideEditor({ guide, onSaved, onCancel }: { guide: HelpGuide; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(guide.title);
  const [icon, setIcon] = useState(guide.icon ?? "");
  const [description, setDescription] = useState(guide.description ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(guide.steps.map(toDraft));
  const [busy, setBusy] = useState(false);

  const patchStep = (i: number, p: Partial<StepDraft>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) => setSteps((s) => { const j = i + dir; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/help-guides/${guide.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), icon: icon.trim(), description: description.trim(), steps }),
      });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกคู่มือแล้ว"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const inp = "w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg";
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="ไอคอน" className="w-14 h-9 px-2 text-center text-lg border border-slate-200 rounded-lg" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อคู่มือ" className={inp} />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="คำอธิบายสั้น ๆ (ไม่ใส่ก็ได้)" rows={2}
        className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-lg" />

      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <input value={s.title} onChange={(e) => patchStep(i, { title: e.target.value })} placeholder="หัวข้อขั้นตอน" className={`${inp} flex-1`} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 text-sm px-1" title="เลื่อนขึ้น">▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 text-sm px-1" title="เลื่อนลง">▼</button>
              <button type="button" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-sm px-1" title="ลบขั้นตอน">🗑</button>
            </div>
            <textarea value={s.body} onChange={(e) => patchStep(i, { body: e.target.value })} placeholder="รายละเอียด (พิมพ์อธิบายได้หลายบรรทัด)" rows={2}
              className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
              <div><p className="text-[10px] text-slate-400 mb-0.5">🖼 รูปประกอบ (ไม่ใส่ก็ได้)</p><ImageInput value={s.image_r2_key} onChange={(k) => patchStep(i, { image_r2_key: k ?? "" })} folder="help-guides" compact /></div>
              <div><p className="text-[10px] text-slate-400 mb-0.5">🔗 ลิงก์ (ไม่ใส่ก็ได้)</p><input value={s.link_url} onChange={(e) => patchStep(i, { link_url: e.target.value })} placeholder="https://…" className="w-full h-9 px-3 text-[12px] border border-slate-200 rounded-lg" /></div>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setSteps((s) => [...s, { title: "", body: "", image_r2_key: "", link_url: "" }])}
          className="w-full h-9 text-[12px] border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50">+ เพิ่มขั้นตอน</button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  );
}

// ── ป๊อปอัปคู่มือ (เปิดจากปุ่ม ❓) ──
export function HelpGuideModal({ guideKey, guideId, onClose }: { guideKey?: string; guideId?: string; onClose: () => void }) {
  const { can } = useAuth();
  const canEdit = can("assets.manage" as Parameters<typeof can>[0]);
  const [guide, setGuide] = useState<HelpGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await apiFetch(`/api/help-guides${guideKey ? `?key=${encodeURIComponent(guideKey)}` : ""}`)).json();
      const list = (j.data ?? []) as HelpGuide[];
      setGuide(guideId ? list.find((g) => g.id === guideId) ?? null : list[0] ?? null);
    } catch { setGuide(null); }
    finally { setLoading(false); }
  }, [guideKey, guideId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <ERPModal open onClose={onClose} size="lg"
      title={guide ? `${guide.icon ? `${guide.icon} ` : "📖 "}${guide.title}` : "📖 วิธีใช้งาน"}
      description={guide?.description ?? undefined}
      footer={
        <div className="flex items-center justify-between w-full">
          {canEdit && guide && !editing ? <button onClick={() => setEditing(true)} className="text-[12px] text-indigo-600 hover:underline">✏️ แก้คู่มือ</button> : <span />}
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
        </div>
      }>
      {loading ? <p className="text-[13px] text-slate-400 py-8 text-center">กำลังโหลด…</p>
        : !guide ? <p className="text-[13px] text-slate-400 py-8 text-center">ยังไม่มีคู่มือเรื่องนี้</p>
        : editing ? <GuideEditor guide={guide} onSaved={() => { setEditing(false); void load(); }} onCancel={() => setEditing(false)} />
        : <GuideReader guide={guide} />}
    </ERPModal>
  );
}

// ── ปุ่มเล็ก "❓ วิธีใช้งาน" (วางตรงจุดที่เกี่ยวข้อง) ──
export function HelpButton({ guideKey, label = "วิธีใช้งาน", className }: { guideKey: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={className ?? "inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"}>❓ {label}</button>
      {open && <HelpGuideModal guideKey={guideKey} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── หน้าเต็ม: จัดการทุกคู่มือ ──
export function HelpGuidesManager() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("assets.manage" as Parameters<typeof can>[0]);
  const [guides, setGuides] = useState<HelpGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setGuides(((await (await apiFetch("/api/help-guides")).json()).data ?? []) as HelpGuide[]); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const t = newTitle.trim(); if (!t) return;
    try {
      const res = await apiFetch("/api/help-guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "สร้างไม่สำเร็จ");
      setNewTitle(""); toast.success("สร้างคู่มือแล้ว"); await load(); setEditId(j.data.id as string);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
  };
  const doDelete = async () => {
    const id = delId; if (!id) return; setDelId(null);
    try { await apiFetch(`/api/help-guides/${id}`, { method: "DELETE" }); toast.success("ลบคู่มือแล้ว"); await load(); }
    catch { toast.error("ลบไม่สำเร็จ"); }
  };

  const editGuide = guides.find((g) => g.id === editId) ?? null;

  return (
    <div className="max-w-3xl mx-auto px-5 py-5">
      <h1 className="text-lg font-bold text-slate-800 mb-1">📖 วิธีใช้งาน</h1>
      <p className="text-[13px] text-slate-500 mb-4">คู่มือการใช้ระบบ — เพิ่ม/แก้ขั้นตอน + รูปประกอบเองได้</p>

      {canEdit && (
        <div className="flex gap-2 mb-4">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
            placeholder="+ ชื่อคู่มือใหม่ เช่น วิธีเพิ่มงานพิมพ์" className="flex-1 h-9 px-3 text-[13px] border border-slate-200 rounded-lg" />
          <button onClick={create} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">สร้างคู่มือ</button>
        </div>
      )}

      {loading ? <p className="text-[13px] text-slate-400 py-8 text-center">กำลังโหลด…</p>
        : guides.length === 0 ? <p className="text-[13px] text-slate-400 py-8 text-center">ยังไม่มีคู่มือ</p>
        : (
          <div className="space-y-2">
            {guides.map((g) => (
              <div key={g.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <span className="text-xl shrink-0">{g.icon || "📖"}</span>
                <button onClick={() => setOpenId(g.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-[14px] font-medium text-slate-800 truncate">{g.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{g.description || `${g.steps.length} ขั้นตอน`}</p>
                </button>
                {canEdit && <>
                  <button onClick={() => setEditId(g.id)} className="text-[12px] text-indigo-600 hover:underline shrink-0">✏️ แก้</button>
                  <button onClick={() => setDelId(g.id)} className="text-slate-400 hover:text-red-500 shrink-0 text-sm">🗑</button>
                </>}
              </div>
            ))}
          </div>
        )}

      {openId && <HelpGuideModal guideId={openId} onClose={() => setOpenId(null)} />}
      {editGuide && (
        <ERPModal open onClose={() => setEditId(null)} size="lg" title={`✏️ แก้คู่มือ: ${editGuide.title}`}>
          <GuideEditor guide={editGuide} onSaved={() => { setEditId(null); void load(); }} onCancel={() => setEditId(null)} />
        </ERPModal>
      )}
      {delId && <ConfirmDialog open title="ลบคู่มือนี้?" variant="danger" confirmText="ลบ" message="คู่มือจะถูกปิดใช้งาน" onConfirm={doDelete} onClose={() => setDelId(null)} />}
    </div>
  );
}
