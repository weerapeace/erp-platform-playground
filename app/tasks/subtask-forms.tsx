"use client";
// ฟอร์มงานย่อย: เพิ่มงานย่อย · แก้งานย่อย · ป๊อปขอแก้ (ใช้ทั้งงานย่อยและคิวรอตรวจ) — แยกจาก subtask-manager.tsx (Y1)
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ERPInput, ERPTextarea } from "@/components/form";
import { ERPModal } from "@/components/modal";
import { UserPicker } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { TeamFill } from "./team-picker";
import type { UserPickerValue } from "@/components/pickers";
import { AssigneeAvatar } from "./assignee-avatar";
import { updateSubtask, deleteSubtask, listSubtaskTypes, subtaskTypeHint, POST_TYPES, postTypeLabel, listContentTemplates, type CreativeSubtask, type SubtaskType, type SubtaskAssignee, type ContentItem } from "./data";
import { askConfirm } from "@/components/modal/ask-dialog";
import type { PushToast } from "@/components/toast";
import { ContentTemplateModal } from "./subtask-content-modals";

// ฟอร์มเพิ่มงานย่อย — เลือก "ชนิดงานย่อย" ก่อน (งานรูปภาพ/เขียนคำอธิบาย/ฯลฯ) → เพิ่ม 1 งานย่อยของชนิดนั้น (ค่าตั้งครบ) · หรือ "เพิ่มเอง" (ชื่อ+ผู้รับผิดชอบ)
export function AddSubtaskForm({ onAdd, onAddType, pushToast }: {
  onAdd: (body: { title: string; title_en?: string | null; description?: string | null; assignee_ids?: string[] }) => Promise<void>;
  onAddType?: (ty: SubtaskType, opts?: { post_type?: string; assignee_ids?: string[]; content_template_id?: string }) => Promise<void>;
  pushToast: PushToast;
}) {
  const t = useT();
  const [mode, setMode] = useState<"closed" | "choose" | "typeForm" | "custom">("closed");
  const [types, setTypes] = useState<SubtaskType[]>([]);
  const [tyLoading, setTyLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [selType, setSelType] = useState<SubtaskType | null>(null);   // ชนิดที่เลือก (มินิฟอร์ม content)
  const [postType, setPostType] = useState("");
  const [typeAssignees, setTypeAssignees] = useState<{ id: string; label: string }[]>([]);
  const [adding2, setAdding2] = useState<UserPickerValue | null>(null);
  const [contentTpls, setContentTpls] = useState<ContentItem[]>([]);   // แม่แบบคอนเทนต์ (ให้เลือกตอนเพิ่มงานย่อยชนิด content)
  const [tplId, setTplId] = useState("");
  const [ctLoading, setCtLoading] = useState(false);
  const [tplModalOpen, setTplModalOpen] = useState(false);   // ป๊อปสร้างแม่แบบคอนเทนต์
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [busy, setBusy] = useState(false);

  // โหลดชนิดงานย่อย (เฉพาะที่เปิดใช้งาน) ครั้งแรกที่เปิดตัวเลือก
  useEffect(() => {
    if (mode !== "choose" || types.length || tyLoading) return;
    setTyLoading(true);
    listSubtaskTypes().then(setTypes).catch((e) => pushToast("error", (e as Error).message)).finally(() => setTyLoading(false));
  }, [mode, types.length, tyLoading, pushToast]);
  // โหลดแม่แบบคอนเทนต์เมื่อเปิดมินิฟอร์ม content
  useEffect(() => {
    if (mode !== "typeForm" || contentTpls.length || ctLoading) return;
    setCtLoading(true);
    listContentTemplates().then(setContentTpls).catch(() => {}).finally(() => setCtLoading(false));
  }, [mode, contentTpls.length, ctLoading]);

  const applyType = async (ty: SubtaskType, opts?: { post_type?: string; assignee_ids?: string[]; content_template_id?: string }) => {
    if (!onAddType) return;
    setApplyingKey(ty.key);
    try { await onAddType(ty, opts); setMode("closed"); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setApplyingKey(null); }
  };
  // content = ต้องเลือกประเภทคอนเทนต์ + ผู้รับผิดชอบก่อน → เปิดมินิฟอร์ม · ชนิดอื่น = เพิ่มทันที
  const pickType = (ty: SubtaskType) => {
    if (ty.key === "content") { setSelType(ty); setPostType(""); setTypeAssignees([]); setTplId(""); setMode("typeForm"); }
    else void applyType(ty);
  };
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await onAdd({ title: title.trim(), title_en: titleEn.trim() || null, description: desc.trim() || null, assignee_ids: assignees.map((a) => a.id) }); setTitle(""); setTitleEn(""); setDesc(""); setAssignees([]); setMode("closed"); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };

  if (mode === "closed") return <button onClick={() => setMode("choose")} className="mt-2 text-sm text-violet-700 hover:underline">＋ {t("เพิ่มงานย่อย", "Add Subtask")}</button>;

  if (mode === "choose") return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{t("เลือกชนิดงานย่อย", "Choose a subtask type")}</p>
        <button onClick={() => setMode("closed")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>
      {tyLoading ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
        : types.length === 0 ? <p className="text-xs text-slate-400 italic">{t("ยังไม่มีชนิดงานย่อย — เพิ่มเองด้านล่างได้", "No subtask types — add manually below")}</p>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {types.map((ty) => (
              <button key={ty.key} type="button" disabled={!!applyingKey} onClick={() => pickType(ty)}
                className="flex items-start gap-2 text-left border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-white disabled:opacity-50">
                <span className="text-base leading-none mt-0.5 shrink-0">{ty.icon || "🧩"}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-700">{applyingKey === ty.key ? t("กำลังเพิ่ม...", "Adding...") : ty.label_th}</span>
                  <span className="block text-[11px] text-slate-400 leading-snug">{subtaskTypeHint(ty)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      <div className="border-t border-violet-100 pt-2">
        <button onClick={() => setMode("custom")} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มเอง (กำหนดชื่อ/ผู้รับผิดชอบ)", "Add manually (name/assignees)")}</button>
      </div>
    </div>
  );

  // มินิฟอร์มสำหรับชนิด "คอนเทนต์" — เลือกประเภทคอนเทนต์ + ผู้รับผิดชอบ ก่อนเพิ่ม
  if (mode === "typeForm" && selType) return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <div className="flex items-center justify-between">
        <button onClick={() => setMode("choose")} className="text-xs text-slate-500 hover:text-violet-700">← {t("เลือกชนิด", "Choose type")}</button>
        <button onClick={() => setMode("closed")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>
      <p className="text-sm font-medium text-slate-700">{selType.icon || "🧩"} {selType.label_th}</p>
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] text-slate-400">{t("แม่แบบคอนเทนต์ (ถ้ามี)", "Content template (optional)")}</p>
          <button type="button" onClick={() => setTplModalOpen(true)} className="text-[11px] text-violet-600 hover:underline">⚙️ {t("จัดการแม่แบบ", "Manage")}</button>
        </div>
        <select value={tplId} onChange={(e) => {
          const id = e.target.value; setTplId(id);
          const tpl = contentTpls.find((c) => c.id === id);   // เลือกแม่แบบ → เติมประเภท + ผู้รับผิดชอบให้ (แก้ทับเองได้)
          if (tpl) { setPostType(tpl.post_type || ""); setTypeAssignees((tpl.assignees ?? []).map((a) => ({ id: a.id, label: a.name }))); }
        }} className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm bg-white">
          <option value="">{ctLoading ? t("กำลังโหลด...", "Loading...") : t("— ไม่ใช้แม่แบบ —", "— none —")}</option>
          {contentTpls.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <p className="text-[11px] text-slate-400 mb-1 mt-2">{t("ประเภทคอนเทนต์", "Content type")}</p>
        <select value={postType} onChange={(e) => setPostType(e.target.value)} className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm bg-white">
          <option value="">{t("— เลือกประเภท —", "— select —")}</option>
          {POST_TYPES.map((p) => <option key={p.value} value={p.value}>{postTypeLabel(p.value)}</option>)}
        </select>
      </div>
      <div>
        <p className="text-[11px] text-slate-400 mb-1">{t("มอบหมายให้ (เลือกได้หลายคน)", "Assign to (multiple)")}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {typeAssignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setTypeAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><UserPicker value={adding2} onChange={(v) => { if (v && !typeAssignees.some((a) => a.id === v.id)) setTypeAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding2(null); }} disableCreate /></div>
          <TeamFill onPick={(members) => setTypeAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name })); return fresh.length ? [...xs, ...fresh] : xs; })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setMode("choose")} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={() => void applyType(selType, { post_type: postType || undefined, assignee_ids: typeAssignees.map((a) => a.id), content_template_id: tplId || undefined })} disabled={applyingKey === selType.key} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{applyingKey === selType.key ? "..." : t("เพิ่ม", "Add")}</button>
      </div>
      {tplModalOpen && <ContentTemplateModal pushToast={pushToast} onClose={() => setTplModalOpen(false)} onChanged={() => { listContentTemplates().then(setContentTpls).catch(() => {}); }} onPick={(id) => setTplId(id)} />}
    </div>
  );

  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <div className="flex items-center justify-between">
        <button onClick={() => setMode("choose")} className="text-xs text-slate-500 hover:text-violet-700">← {t("เลือกชนิด", "Choose type")}</button>
        <button onClick={() => setMode("closed")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>
      <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย (ไทย)", "Subtask title (Thai)")} />
      <ERPInput value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t("ชื่ออังกฤษ (ไม่บังคับ — โชว์ตอนสลับภาษา EN)", "English title (optional — shown in EN mode)")} />
      <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder={t("รายละเอียด (ไม่บังคับ)", "Description (optional)")} />
      <div>
        <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ (เลือกได้หลายคน)", "Assignees (multiple allowed)")}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate /></div>
          <TeamFill onPick={(members) => setAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name })); return fresh.length ? [...xs, ...fresh] : xs; })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setMode("closed")} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={submit} disabled={busy} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("เพิ่ม", "Add")}</button>
      </div>
    </div>
  );
}

// ป๊อปอัป "ขอแก้" — เลือกรูปที่ต้องแก้ (หลายรูป + เหตุผลต่อรูป) + ช่องที่ต้องแก้ + เหตุผลรวม · portal
// ของกลาง: ใช้ทั้งการ์ดงานย่อย, ป๊อปส่งงาน และหน้าคิวตรวจงาน (review-queue-view)
export function ReviseModal({ fields, images, busy, onCancel, onConfirm }: {
  fields?: { key: string; label: string }[];
  /** รูปที่ช่างส่งมา — ติ๊กเลือกได้หลายรูปว่ารูปไหนต้องแก้ */
  images?: { id: string; r2_key: string; file_name?: string | null }[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (comment: string, reviseImages?: { r2_key: string; file_name?: string | null; index: number; reason: string }[]) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [imgSel, setImgSel] = useState<Set<string>>(new Set());          // r2_key ของรูปที่ต้องแก้
  const [imgReason, setImgReason] = useState<Record<string, string>>({}); // เหตุผลต่อรูป
  const toggle = (k: string) => setChecked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleImg = (k: string) => setImgSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const picked = (fields ?? []).filter((f) => checked.has(f.key));
  const imgs = images ?? [];
  const pickedImgs = imgs.map((a, i) => ({ ...a, index: i + 1 })).filter((a) => imgSel.has(a.r2_key));

  const submit = () => {
    const parts: string[] = [];
    if (pickedImgs.length) {
      parts.push(`${t("รูปที่ต้องแก้", "Images to fix")}: ${pickedImgs.map((a) => {
        const r = (imgReason[a.r2_key] ?? "").trim();
        return `#${a.index}${r ? ` (${r})` : ""}`;
      }).join(", ")}`);
    }
    if (picked.length) parts.push(`${t("ต้องแก้", "Fix")}: ${picked.map((f) => f.label).join(", ")}`);
    if (reason.trim()) parts.push(reason.trim());
    onConfirm(
      parts.join("\n"),
      pickedImgs.length
        ? pickedImgs.map((a) => ({ r2_key: a.r2_key, file_name: a.file_name ?? null, index: a.index, reason: (imgReason[a.r2_key] ?? "").trim() }))
        : undefined,
    );
  };
  const node = (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-800">↩︎ {t("ขอแก้งานย่อย", "Request revision")}</p>

        {/* เลือกรูปที่ต้องแก้ — ติ๊กได้หลายรูป · เลือกแล้วพิมพ์เหตุผลเฉพาะรูปนั้นได้ */}
        {imgs.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">
              {t("กดเลือกรูปที่ต้องแก้ (เลือกได้หลายรูป)", "Tap the images that need fixing (multi-select)")}
              {imgSel.size > 0 && <span className="ml-1 text-orange-600 font-medium">— {t("เลือกแล้ว", "selected")} {imgSel.size}/{imgs.length}</span>}
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-slate-100 rounded-lg p-2">
              {imgs.map((a, i) => {
                const on = imgSel.has(a.r2_key);
                return (
                  <button key={a.id} type="button" onClick={() => toggleImg(a.r2_key)}
                    title={a.file_name ?? `#${i + 1}`}
                    className={`relative h-14 w-14 rounded overflow-hidden border-2 transition ${on ? "border-orange-500 ring-2 ring-orange-200" : "border-slate-200 hover:border-orange-300"}`}>
                    <img src={`/api/r2-image?key=${encodeURIComponent(a.r2_key)}&w=120`} alt="" className="h-full w-full object-cover" />
                    <span className={`absolute top-0 left-0 px-1 text-[9px] font-semibold ${on ? "bg-orange-500 text-white" : "bg-black/45 text-white"}`}>{i + 1}</span>
                    {on && <span className="absolute bottom-0 right-0 h-4 w-4 bg-orange-500 text-white text-[10px] leading-4 text-center">✓</span>}
                  </button>
                );
              })}
            </div>
            {pickedImgs.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-slate-500">{t("เหตุผลต่อรูป (ไม่ใส่ก็ได้)", "Reason per image (optional)")}</p>
                {pickedImgs.map((a) => (
                  <div key={a.r2_key} className="flex items-center gap-2">
                    <img src={`/api/r2-image?key=${encodeURIComponent(a.r2_key)}&w=80`} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0" />
                    <span className="text-[11px] text-slate-400 w-6 shrink-0">#{a.index}</span>
                    <input value={imgReason[a.r2_key] ?? ""} onChange={(e) => setImgReason((p) => ({ ...p, [a.r2_key]: e.target.value }))}
                      placeholder={t("เช่น เบลอ / สีเพี้ยน / ตัดขอบไม่สวย", "e.g. blurry / wrong color / bad crop")}
                      className="flex-1 h-8 text-[13px] border border-slate-200 rounded-lg px-2 focus:ring-1 focus:ring-orange-300 outline-none" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {fields && fields.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">{t("เลือกช่องที่ต้องแก้ (ถ้ามี)", "Pick fields to fix (optional)")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-auto border border-slate-100 rounded-lg p-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={checked.has(f.key)} onChange={() => toggle(f.key)} className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500 mb-1">{t("เหตุผล/รายละเอียดที่ต้องแก้", "Reason / details")}</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder={t("เช่น รูปเบลอ, คำอธิบายยังไม่ครบ...", "e.g. blurry image, incomplete description...")} className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-orange-300 outline-none resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={submit} disabled={busy || (!reason.trim() && picked.length === 0 && pickedImgs.length === 0)} className="h-9 px-4 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">↩︎ {t("ส่งขอแก้", "Send")}</button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

// ป๊อปอัปแก้ไขงานย่อย — ชื่อ/รายละเอียด/ผู้รับผิดชอบ/ต้องเสร็จก่อน + ลบ
// แยกจากการ์ดให้การ์ดเป็น readonly · ผู้รับผิดชอบ + ต้องเสร็จก่อน + ลบ = เฉพาะหัวหน้า/ผู้สร้างงาน
export function EditSubtaskModal({ sub, taskId, reload, pushToast, canManageAssignees, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: PushToast; canManageAssignees: boolean; onClose: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(sub.title);
  const [titleEn, setTitleEn] = useState(sub.title_en ?? "");
  const [desc, setDesc] = useState(sub.description ?? "");
  const [assignees, setAssignees] = useState<SubtaskAssignee[]>(sub.assignees);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [required, setRequired] = useState(sub.required_before_next);
  const [busy, setBusy] = useState(false);
  const idsKey = (xs: SubtaskAssignee[]) => xs.map((a) => a.id).join(",");
  const dirty = title.trim() !== sub.title || (titleEn.trim() || "") !== (sub.title_en || "") || (desc.trim() || "") !== (sub.description || "") || required !== sub.required_before_next || idsKey(assignees) !== idsKey(sub.assignees);

  const save = async () => {
    if (!title.trim()) { pushToast("error", t("ใส่ชื่องานย่อยก่อน", "Title is required")); return; }
    setBusy(true);
    try {
      const p: Record<string, unknown> = { title: title.trim(), title_en: titleEn.trim() || null, description: desc.trim() || null, required_before_next: required };
      if (canManageAssignees) p.assignee_ids = assignees.map((a) => a.id);
      await updateSubtask(taskId, sub.id, p);
      await reload();
      pushToast("success", t("บันทึกแล้ว", "Saved"));
      onClose();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!(await askConfirm({ title: t(`ลบงานย่อย "${sub.title}" ?`, `Delete subtask "${sub.title}"?`), variant: "danger" }))) return;
    setBusy(true);
    try { await deleteSubtask(taskId, sub.id); await reload(); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={t("แก้ไขงานย่อย", "Edit subtask")} hasUnsavedChanges={dirty}
      footer={
        <div className="flex items-center justify-between gap-2">
          {canManageAssignees ? <button onClick={del} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-50">{t("ลบงานย่อย", "Delete subtask")}</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={save} disabled={busy || !dirty} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{t("บันทึก", "Save")}</button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่องานย่อย (ไทย)", "Title (Thai)")}</p>
          <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย", "Subtask title")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่ออังกฤษ (โชว์ตอนสลับภาษา EN)", "English title (shown in EN mode)")}</p>
          <ERPInput value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t("เช่น Photo Editing", "e.g. Photo Editing")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("รายละเอียด", "Description")}</p>
          <ERPTextarea value={desc} rows={3} onChange={(e) => setDesc(e.target.value)} placeholder={t("รายละเอียดงานย่อย (ไม่บังคับ)", "Subtask description (optional)")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ", "Assignee")}{canManageAssignees ? ` (${t("เลือกได้หลายคน", "multiple allowed")})` : ""}</p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs rounded-full pl-0.5 pr-1.5 py-0.5" style={{ background: (a.color || "#8b5cf6") + "1f" }}><AssigneeAvatar a={a} size={18} /><span className="text-slate-700">{a.label}</span>{canManageAssignees && <button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button>}</span>)}
            {assignees.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
          </div>
          {canManageAssignees
            ? <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name, color: null, avatar_url: null }]); setAdding(null); }} disableCreate /></div>
                <TeamFill onPick={(members) => setAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name, color: null, avatar_url: null })); return fresh.length ? [...xs, ...fresh] : xs; })} />
              </div>
            : <p className="text-[11px] text-slate-400 italic">{t("เฉพาะหัวหน้า/ผู้สร้างงานเปลี่ยนผู้รับผิดชอบได้", "Only managers or task creators can change assignees")}</p>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" disabled={!canManageAssignees} checked={required} onChange={(e) => setRequired(e.target.checked)} />{t("ต้องเสร็จก่อนขั้นถัดไป", "Must complete before next step")}</label>
      </div>
    </ERPModal>
  );
}
