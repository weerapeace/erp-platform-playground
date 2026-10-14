"use client";

/**
 * 🕘 ประวัติเวอร์ชันที่เผยแพร่ — ของกลางของตัวจัดหน้าเว็บ (หน้าแรก + หน้าอื่น ใช้ตัวเดียวกัน)
 *
 * เปิดแล้วโหลดรายการจาก listUrl (API คืน { versions: WebVersion[] } — lib/website-versions)
 * "กู้คืนเป็นร่าง" → ยืนยันด้วย ConfirmDialog กลาง → POST restoreUrl (restoreBody) → onRestored(blocks)
 * กู้คืน = กลับมาเป็น "ร่าง" เท่านั้น เว็บจริงไม่เปลี่ยนจนกว่าจะกดเผยแพร่ · หน้าจอใส่ผ่าน apply() จึงกด ↶ ย้อนได้
 */
import { useEffect, useState } from "react";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { WebVersion } from "@/lib/website-versions";

export function VersionHistoryDrawer<B>({
  open,
  onClose,
  what,
  listUrl,
  restoreUrl,
  restoreBody,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  /** ชื่อสิ่งที่ดูประวัติ เช่น "หน้าแรก" · "หน้า เกี่ยวกับเรา" */
  what: string;
  listUrl: string;
  restoreUrl: string;
  restoreBody: (versionNo: number) => Record<string, unknown>;
  /** ได้ Section ของเวอร์ชันนั้นกลับมา (ฝั่งเซิร์ฟเวอร์บันทึกเป็นร่างแล้ว) */
  onRestored: (blocks: B[], versionNo: number) => void;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<WebVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<WebVersion | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setVersions(null);
    setError(null);
    apiFetch(listUrl)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError(j.error);
        else setVersions(j.versions ?? []);
      })
      .catch(() => alive && setError("โหลดประวัติไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [open, listUrl]);

  const restore = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      const r = await apiFetch(restoreUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(restoreBody(ask.versionNo)) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "กู้คืนไม่สำเร็จ");
        return;
      }
      onRestored(j.blocks as B[], ask.versionNo);
      toast.success(`ดึงเวอร์ชัน #${ask.versionNo} กลับมาเป็นร่างแล้ว — เว็บจริงยังไม่เปลี่ยน กด "เผยแพร่" เมื่อพร้อม (กด ↶ ย้อนได้)`);
      setAsk(null);
      onClose();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <Drawer open={open} onClose={onClose} title={`ประวัติ${what}ที่เผยแพร่`} description="บันทึกให้อัตโนมัติทุกครั้งที่กดเผยแพร่ · กู้คืน = ดึงกลับมาเป็นร่างก่อน (ยังไม่ขึ้นเว็บ)" size="md" storageKey="erp-web-versions-width">
        {error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : versions === null ? (
          <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : !versions.length ? (
          <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีประวัติ — จะบันทึกทุกครั้งที่กดเผยแพร่</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {versions.map((v, i) => (
              <li key={v.versionNo} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-10 shrink-0">#{v.versionNo}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      {v.blocks} Section
                      {i === 0 && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] border border-emerald-200">ออนไลน์อยู่ตอนนี้</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {when(v.createdAt)}
                      {v.actor && ` · ${v.actor}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setAsk(v)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                    กู้คืนเป็นร่าง
                  </button>
                </div>
                {v.labels.length > 0 && (
                  <div className="mt-1.5 ml-[52px] flex flex-wrap gap-1">
                    {v.labels.slice(0, 8).map((l, k) => (
                      <span key={k} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600">
                        {l}
                      </span>
                    ))}
                    {v.labels.length > 8 && <span className="text-[10px] text-slate-400">+{v.labels.length - 8}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
      <ConfirmDialog
        open={!!ask}
        onClose={() => !busy && setAsk(null)}
        onConfirm={() => void restore()}
        loading={busy}
        title={`ดึงเวอร์ชัน #${ask?.versionNo ?? ""} กลับมาเป็นร่าง?`}
        message={
          <>
            ร่างที่แก้ค้างอยู่ตอนนี้จะถูกแทนด้วยเวอร์ชันนี้ (กด ↶ ย้อนกลับได้)
            <br />
            เว็บจริงยังไม่เปลี่ยน จนกว่าจะกด &quot;เผยแพร่&quot;
          </>
        }
        confirmText="กู้คืนเป็นร่าง"
      />
    </>
  );
}
