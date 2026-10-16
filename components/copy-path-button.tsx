"use client";

/**
 * CopyPathButton (ของกลาง) — ปุ่ม 📂 คัดลอก "path" = ที่อยู่โฟลเดอร์/ไฟล์ในเครื่อง เช่น Z:\Work In Process\…  หรือ G:\Shared drives\…
 * ใช้ตอนต้องอัปไฟล์ขึ้นเว็บอื่น (Shopee/Lazada/TikTok…) → วาง path ในช่องเลือกไฟล์ของ Windows แล้วไปถึงโฟลเดอร์ทันที
 *   - มี path เดียว  → กดแล้วคัดลอกทันที
 *   - มีหลายอัน    → เด้งรายการให้เลือก (บอกว่ามาจากไหน)
 *   - ยังไม่มี      → ส่ง onAdd มา = กดแล้วเด้งช่องให้วาง path · ไม่ส่ง = ปุ่มจาง + บอกเหตุผล
 * ใช้: <CopyPathButton paths={[{ path: "Z:\\Work In Process\\PIX27", label: "งานรูปภาพ" }]} onAdd={(p) => save(p)} />
 * ใช้ที่: การ์ดแคปชั่นต่อแพลตฟอร์มในคอนเทนต์ (app/tasks/content/content.tsx)
 */
import { useState } from "react";
import { Popover } from "@/components/popover";
import { copyText } from "@/components/copy-button";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";

export type PathItem = { path: string; label?: string | null };

/** ตัดช่องว่าง + เครื่องหมายคำพูดที่ติดมากับ "Copy as path" ของ Windows ("Z:\…") */
export function cleanPath(raw: string): string {
  return raw.trim().replace(/^"(.*)"$/, "$1").trim();
}
/** path ในเครื่อง/ไดรฟ์ที่แมปไว้ (X:\… หรือ \\server\…) — ไม่ใช่ลิงก์เว็บ */
export function isLocalPath(s: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith("\\\\");
}

type Notify = (type: "success" | "error", msg: string) => void;

export function CopyPathButton({ paths, onAdd, notify, emptyHint, className = "" }: {
  paths: PathItem[];
  /** มี = ตอนยังไม่มี path กดแล้วให้วาง path ใหม่ได้ (และมีปุ่ม ＋ ท้ายรายการ) */
  onAdd?: (path: string) => Promise<void>;
  /** ใช้ toast ของหน้าเอง (ไม่ส่ง = toast กลาง) */
  notify?: Notify;
  /** ข้อความตอนยังไม่มี path (โชว์เป็น tooltip) */
  emptyHint?: string;
  className?: string;
}) {
  const t = useT();
  const toast = useToast();
  const say: Notify = notify ?? ((type, msg) => (type === "success" ? toast.success(msg) : toast.error(msg)));
  const list = paths.filter((p) => (p.path ?? "").trim());
  const copy = async (p: string) => {
    const ok = await copyText(p);
    say(ok ? "success" : "error", ok ? t(`คัดลอก path แล้ว — ${p}`, `Path copied — ${p}`) : t("คัดลอกไม่สำเร็จ", "Copy failed"));
    return ok;
  };
  const base = `relative h-7 w-7 shrink-0 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-violet-700 ${className}`;

  if (list.length === 1) {
    // path เดียว: กดคัดลอกเลย (เพิ่ม path อื่นได้ที่ส่วนไฟล์ของหน้านั้น ๆ)
    return <button type="button" onClick={() => void copy(list[0].path)} title={`${t("คัดลอก path", "Copy path")}: ${list[0].path}${list[0].label ? `\n(${list[0].label})` : ""}`} className={base}>📂</button>;
  }
  if (list.length === 0 && !onAdd) {
    return <button type="button" disabled title={emptyHint ?? t("ยังไม่มี path", "No path yet")} className={`${base} opacity-40 cursor-not-allowed`}>📂</button>;
  }
  return (
    <Popover align="right" panelClassName="w-80 p-2"
      trigger={(toggle, open) => (
        <button type="button" onClick={toggle}
          title={list.length ? t(`คัดลอก path (${list.length} ที่) — กดเพื่อเลือก`, `Copy path (${list.length}) — click to choose`) : (emptyHint ?? t("ยังไม่มี path — กดเพื่อใส่", "No path yet — click to add"))}
          className={`${base} ${open ? "bg-violet-50 text-violet-700 border-violet-300" : ""} ${list.length ? "" : "border-dashed text-slate-400"}`}>
          📂{list.length > 1 && <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-violet-600 text-white text-[9px] leading-[14px] px-0.5">{list.length}</span>}
        </button>
      )}>
      {(close) => (
        <div className="space-y-1.5 text-xs">
          {list.length > 0 && (
            <>
              <p className="text-[11px] text-slate-400 px-1">{t("กดเพื่อคัดลอก path", "Click to copy a path")}</p>
              {list.map((p, i) => (
                <button key={`${p.path}-${i}`} type="button" onClick={async () => { if (await copy(p.path)) close(); }}
                  className="w-full text-left rounded-md border border-slate-100 hover:border-violet-200 hover:bg-violet-50 px-2 py-1.5">
                  {p.label && <span className="block text-[10px] text-slate-400 truncate">{p.label}</span>}
                  <span className="block font-mono text-[11px] text-slate-700 break-all">📂 {p.path}</span>
                </button>
              ))}
            </>
          )}
          {onAdd && <AddPathForm onAdd={onAdd} say={say} onDone={close} first={list.length === 0} />}
        </div>
      )}
    </Popover>
  );
}

/** ช่องวาง path ใหม่ (ใช้ในป๊อปของ CopyPathButton และส่วนไฟล์ของหน้าต่าง ๆ) */
export function AddPathForm({ onAdd, say, onDone, first = false }: { onAdd: (path: string) => Promise<void>; say?: Notify; onDone?: () => void; first?: boolean }) {
  const t = useT();
  const toast = useToast();
  const notify: Notify = say ?? ((type, msg) => (type === "success" ? toast.success(msg) : toast.error(msg)));
  const [open, setOpen] = useState(first);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const p = cleanPath(val); if (!p) return;
    setBusy(true);
    try { await onAdd(p); setVal(""); notify("success", t("เพิ่ม path แล้ว", "Path added")); onDone?.(); }
    catch (e) { notify("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="w-full text-left text-[11px] font-medium text-violet-700 hover:underline px-1">＋ {t("เพิ่ม path", "Add path")}</button>;
  return (
    <div className="space-y-1">
      {first && <p className="text-[11px] text-slate-500 px-1">{t("ยังไม่มี path — วางที่อยู่โฟลเดอร์/ไฟล์ที่จะใช้โพสต์", "No path yet — paste the folder/file location")}</p>}
      <div className="flex gap-1.5">
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          placeholder="Z:\Work In Process\…" className="flex-1 min-w-0 h-8 border border-slate-200 rounded-md px-2 text-xs font-mono" />
        <button type="button" onClick={() => void submit()} disabled={busy || !cleanPath(val)} className="h-8 px-2.5 text-xs font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700 disabled:opacity-50 shrink-0">{busy ? "…" : t("เพิ่ม", "Add")}</button>
      </div>
      <p className="text-[10px] text-slate-400 px-1">{t("เคล็ดลับ: ใน File Explorer กด Shift+คลิกขวาโฟลเดอร์ → Copy as path แล้ววางที่นี่", "Tip: in File Explorer, Shift+right-click a folder → Copy as path")}</p>
    </div>
  );
}
