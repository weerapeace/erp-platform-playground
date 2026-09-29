"use client";

/**
 * EmbedModal (ของกลาง) — เปิดหน้าภายในเป็น popup ปรับขนาดได้ (ฝัง iframe ?embed=1)
 * "เอาลิ้งมาโผล่" ในหน้าต่าง ไม่หลุดออกจากหน้าเดิม · ใช้หน้าจริง ไม่เขียนใหม่
 * ใช้กับ: ปฏิทินหน้าผู้บริหาร, กดแจ้งเตือน ฯลฯ
 *
 * EmbedFrame (ของกลาง) — ฝังหน้าภายใน "ในเนื้อหน้า" (ไม่ใช่ popup) เช่น แดชบอร์ดแผนกใต้แท็บแผนก
 * มีข้อความ "กำลังโหลด" ระหว่างรอ · เปลี่ยน url = โหลดหน้าใหม่
 */
import { useEffect, useState } from "react";
import { ResizableModal } from "@/components/resizable-modal";

/** เติม embed=1 ให้ลิงก์ภายใน (รักษา query/hash เดิม) · ลิงก์ภายนอกคืนค่าเดิม */
export function embedUrl(u: string): string {
  if (!u || !u.startsWith("/")) return u;
  const [path, hash] = u.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}embed=1${hash ? "#" + hash : ""}`;
}

export function EmbedFrame({ url, title, height = "80vh", minHeight = 560, className = "" }: {
  /** height = null → ให้ className เป็นคนกำหนดความสูง (เช่น h-[calc(100dvh-88px)]) */
  url: string; title: string; height?: number | string | null; minHeight?: number; className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [url]);
  return (
    <div className={`relative bg-slate-50 ${className}`} style={{ height: height ?? undefined, minHeight }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400 pointer-events-none">
          <span className="animate-spin">⏳</span> กำลังโหลด {title}…
        </div>
      )}
      <iframe key={url} src={embedUrl(url)} title={title} onLoad={() => setLoaded(true)}
        className={`block w-full h-full border-0 transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

export function EmbedModal({ url, title, onClose, storageKey = "erp_embed_popup_size" }: {
  url: string; title: string; onClose: () => void; storageKey?: string;
}) {
  return (
    <ResizableModal onClose={onClose} storageKey={storageKey}
      title={<span className="text-base font-semibold text-slate-800 truncate">{title}</span>}
      headerActions={<a href={url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline mr-1 shrink-0">เปิดเต็มจอ ↗</a>}>
      <iframe src={embedUrl(url)} title={title} className="w-full h-full border-0 bg-slate-50" />
    </ResizableModal>
  );
}
