"use client";

/** Reference 1 ชิ้นแบบย่อ — ใช้ร่วม: ภาพปะหน้าการ์ดรายการที่อยากได้ + ป๊อปหยิบจากคลัง Ref */
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { useCreativeOptions } from "@/app/tasks/use-options";
import type { RefProvider } from "@/lib/content-album-refs";
import { FileThumb } from "./album-bits";
import type { RefLike } from "./ref-board";

export function RefTile({ r, className = "" }: { r: RefLike; className?: string }) {
  const { platforms } = useCreativeOptions();
  if (r.kind === "image" && r.r2_key) return <FileThumb r2Key={r.r2_key} type="image" width={240} className={className} />;
  if (r.kind === "text") return <div className={`bg-slate-50 p-1.5 text-[11px] leading-snug text-slate-600 overflow-hidden ${className}`}><Icon name="note" className="text-slate-400 mr-0.5" />{r.body}</div>;
  const prov = (r.provider ?? "web") as RefProvider;
  return (
    <div className={`relative bg-slate-800 text-white grid place-items-center overflow-hidden ${className}`}>
      {r.thumb_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.thumb_url} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover opacity-75" />
      )}
      <span className="relative">{prov === "web" ? <Icon name="web" size={18} /> : <PlatformIcon code={prov} iconKey={platforms.find((p) => p.value === prov)?.icon_key} size={18} />}</span>
      <span className="absolute bottom-1 left-1 inline-flex items-center px-1 rounded bg-black/55 text-[10px]"><Icon name="play" size={10} /></span>
    </div>
  );
}
