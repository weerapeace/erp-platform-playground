/**
 * lib/zip.ts — ตัวบีบ ZIP ของกลาง (ไม่มี dependency, ใช้ได้ทั้ง browser/Node)
 *
 * ใช้แบบ STORE (ไม่บีบอัดซ้ำ) — เหมาะกับรูปภาพที่ถูกบีบมาแล้ว (jpg/png/webp)
 * เร็ว ไฟล์ไม่เพี้ยน และไม่ต้องพึ่งไลบรารีนอก
 *
 * - buildZip(entries)            → Uint8Array ของไฟล์ .zip
 * - downloadImagesAsZip(...)     → โหลดรูปจาก url หลายไฟล์ → บีบ zip → สั่งดาวน์โหลด (ใช้ฝั่ง browser)
 */

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(buf: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (u: Uint8Array) => { chunks.push(u); offset += u.length; };

  const recs: { nameBytes: Uint8Array; size: number; crc: number; offset: number }[] = [];

  // ── local file header + data ของแต่ละไฟล์ ──
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    recs.push({ nameBytes, size: e.data.length, crc, offset });
    push(u32(0x04034b50));        // local file header signature
    push(u16(20));                // version needed
    push(u16(0x0800));            // flags: ชื่อไฟล์เป็น UTF-8 (รองรับไทย)
    push(u16(0));                 // compression: store (ไม่บีบ)
    push(u16(0)); push(u16(0));   // mod time / date
    push(u32(crc));
    push(u32(e.data.length));     // compressed size
    push(u32(e.data.length));     // uncompressed size
    push(u16(nameBytes.length));
    push(u16(0));                 // extra length
    push(nameBytes);
    push(e.data);
  }

  // ── central directory ──
  const cdStart = offset;
  for (const r of recs) {
    push(u32(0x02014b50));        // central dir signature
    push(u16(20));                // version made by
    push(u16(20));                // version needed
    push(u16(0x0800));            // flags (UTF-8)
    push(u16(0));                 // compression
    push(u16(0)); push(u16(0));   // mod time / date
    push(u32(r.crc));
    push(u32(r.size));            // compressed
    push(u32(r.size));            // uncompressed
    push(u16(r.nameBytes.length));
    push(u16(0));                 // extra
    push(u16(0));                 // comment
    push(u16(0));                 // disk number start
    push(u16(0));                 // internal attrs
    push(u32(0));                 // external attrs
    push(u32(r.offset));          // local header offset
    push(r.nameBytes);
  }
  const cdSize = offset - cdStart;

  // ── end of central directory ──
  push(u32(0x06054b50));
  push(u16(0)); push(u16(0));     // disk numbers
  push(u16(recs.length));
  push(u16(recs.length));
  push(u32(cdSize));
  push(u32(cdStart));
  push(u16(0));                   // comment length

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/**
 * โหลดรูปจาก url หลายไฟล์ → บีบเป็น zip → สั่งดาวน์โหลด (เรียกจากฝั่ง browser เท่านั้น)
 * คืนค่า: จำนวนไฟล์ที่ใส่ใน zip ได้สำเร็จ (0 = ไม่มีไฟล์โหลดได้)
 */
export async function downloadImagesAsZip(
  images: { url: string; name: string }[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i, images.length);
    try {
      const res = await fetch(images[i].url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      let name = images[i].name || `image_${i + 1}`;
      if (used.has(name)) {                                  // กันชื่อซ้ำใน zip
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)}_${i + 1}${name.slice(dot)}` : `${name}_${i + 1}`;
      }
      used.add(name);
      entries.push({ name, data: buf });
    } catch { /* ข้ามไฟล์ที่โหลดไม่ได้ */ }
  }
  onProgress?.(images.length, images.length);
  if (entries.length === 0) return 0;

  const zip = buildZip(entries);
  const blob = new Blob([zip as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return entries.length;
}
