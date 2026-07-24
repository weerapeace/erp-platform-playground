"use client";

/**
 * EmbedModal (ของกลาง) — เปิดหน้าภายในเป็น popup ปรับขนาดได้ (ฝัง iframe ?embed=1)
 * "เอาลิ้งมาโผล่" ในหน้าต่าง ไม่หลุดออกจากหน้าเดิม · ใช้หน้าจริง ไม่เขียนใหม่
 * ใช้กับ: ปฏิทินหน้าผู้บริหาร, กดแจ้งเตือน ฯลฯ
 */
import { ResizableModal } from "@/components/resizable-modal";

/** เติม embed=1 ให้ลิงก์ภายใน (รักษา query/hash เดิม) · ลิงก์ภายนอกคืนค่าเดิม */
export function embedUrl(u: string): string {
  if (!u || !u.startsWith("/")) return u;
  const [path, hash] = u.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}embed=1${hash ? "#" + hash : ""}`;
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
