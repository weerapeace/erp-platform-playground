"use client";

// ============================================================
// AlbumCover — ปกอัลบั้ม (รูปรวมบนการ์ดอัลบั้ม/แฟ้ม) · ของกลาง
//
// แบบปรับตามจำนวนรูป (เจ้าของเลือกแบบ C 2026-11-14) — ทรงเดียวกับการ์ดอัลบั้ม Contents ไม่มีช่องว่าง:
//   1 รูป = เต็มปก · 2 = ซ้าย-ขวา · 3 = ใหญ่ 1 + เล็ก 2 · 4+ = ใหญ่ 1 + เล็ก 3 (ช่องสุดท้าย "+N") · ไม่มีรูป = ไอคอนรูปจาง
// รูปจาก R2 ผ่าน /api/r2-image (ย่อตามช่อง withImageWidth) · ตรรกะแบบปก: lib/album-cover (เทสต์)
//
// ใช้:      <AlbumCover keys={["r2/key1", "r2/key2"]} total={12} />   (keys = รูปที่จะโชว์ เรียงตามที่อยากให้เห็น · total = รูปทั้งอัลบั้ม)
// ใช้เมื่อ:  การ์ดอัลบั้ม/แฟ้มรูปที่อยากเห็นรูปข้างในก่อนกดเปิด (เช่น หน้า SAMPLE Images)
// ห้ามใช้:  แกลเลอรีรูปเต็มในอัลบั้ม → กริดรูป/ImageManager · รูปเดี่ยว → <img>/HoverImage
// doc: docs/album-cover.md
// ============================================================

import { Icon } from "@/components/icon";
import { withImageWidth } from "@/lib/r2-image";
import { albumCoverLayout } from "@/lib/album-cover";

function Tile({ r2Key, w, className = "", more = 0 }: { r2Key: string | undefined; w: number; className?: string; more?: number }) {
  const src = r2Key ? withImageWidth(`/api/r2-image?key=${encodeURIComponent(r2Key)}`, w) : null;
  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-slate-300"><Icon value="i:photo" /></div>}
      {more > 0 && <div className="absolute inset-0 grid place-items-center bg-black/45 text-[15px] font-semibold text-white">+{more}</div>}
    </div>
  );
}

export function AlbumCover({ keys, total, className = "" }: {
  /** r2_key ของรูปที่จะโชว์บนปก (ใช้แค่ 4 ตัวแรก) */
  keys: readonly string[];
  /** จำนวนรูปทั้งอัลบั้ม (ไว้คิดแบบปก + ป้าย +N) · ไม่ส่ง = เท่ากับจำนวน keys */
  total?: number;
  /** กรอบนอก (ค่าเริ่ม aspect 4:3) */
  className?: string;
}) {
  const layout = albumCoverLayout(total ?? keys.length);
  const box = `grid aspect-[4/3] gap-0.5 bg-slate-100 ${className}`;
  if (layout.kind === "empty") return <div className={`${box} place-items-center text-2xl text-slate-300`}><Icon value="i:photo" /></div>;
  if (layout.kind === "one") return <div className={box}><Tile r2Key={keys[0]} w={640} /></div>;
  if (layout.kind === "two") return <div className={`${box} grid-cols-2`}><Tile r2Key={keys[0]} w={360} /><Tile r2Key={keys[1]} w={360} /></div>;
  const small = layout.small;
  return (
    <div className={`${box} grid-cols-[2fr_1fr]`} style={{ gridTemplateRows: `repeat(${small}, minmax(0, 1fr))` }}>
      <Tile r2Key={keys[0]} w={520} className={small === 3 ? "row-span-3" : "row-span-2"} />
      {Array.from({ length: small }, (_, i) => (
        <Tile key={i} r2Key={keys[i + 1]} w={220} more={i === small - 1 ? layout.more : 0} />
      ))}
    </div>
  );
}
