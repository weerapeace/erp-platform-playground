/**
 * 📦 เขียนไฟล์ GLB (glTF 2.0 แบบไฟล์เดียว) จากรายการตาข่าย — สูตรบริสุทธิ์ ไม่พึ่งไลบรารี (Bag CAD รอบ G)
 *   ใช้ส่งโมเดลกระเป๋าไปเปิดในโปรแกรมอื่น (Blender · CLO · เว็บดูโมเดล · มือถือ) — หน่วยในไฟล์ = เมตร ตามมาตรฐาน glTF
 *   แต่ละตาข่าย = ตำแหน่งจุด (+ ทิศผิว + ลำดับสามเหลี่ยม) + สี 1 สี (RGBA 0–1) · ไม่มีลายผ้า/แสง
 *
 * ใช้ที่: components/pattern-3d (ปุ่ม GLB) · เทสต์ lib/__tests__/glb-export.test.ts
 */
export type GlbMesh = {
  name: string;
  /** x,y,z ต่อจุด (หน่วยตามที่ส่ง — ใส่ scale เพื่อแปลงเป็นเมตร) */ positions: Float32Array;
  normals?: Float32Array | null;
  indices?: Uint32Array | null;
  color: [number, number, number, number];
  doubleSided?: boolean;
};

const pad4 = (n: number) => (n + 3) & ~3;

/** รวมตาข่ายเป็นไฟล์ GLB · scale = คูณตำแหน่ง (ซม. → เมตร = 0.01) · ตาข่ายที่ไม่มีจุด = ข้าม */
export function buildGlb(meshes: GlbMesh[], opts: { scale?: number; generator?: string } = {}): ArrayBuffer {
  const scale = opts.scale ?? 1;
  const ok = meshes.filter((m) => m.positions.length >= 9 && m.positions.length % 3 === 0);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: Record<string, unknown>[] = [], accessors: Record<string, unknown>[] = [], gMeshes: Record<string, unknown>[] = [], materials: Record<string, unknown>[] = [], nodes: Record<string, unknown>[] = [];
  const push = (arr: Float32Array | Uint32Array, target: number): number => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), len = pad4(bytes.byteLength), out = new Uint8Array(len);
    out.set(bytes); chunks.push(out);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += len;
    return bufferViews.length - 1;
  };
  ok.forEach((m, k) => {
    const P = new Float32Array(m.positions.length);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) { const v = m.positions[i] * scale; P[i] = Number.isFinite(v) ? v : 0; const a = i % 3; if (P[i] < min[a]) min[a] = P[i]; if (P[i] > max[a]) max[a] = P[i]; }
    const n = P.length / 3;
    const attrs: Record<string, number> = {};
    accessors.push({ bufferView: push(P, 34962), componentType: 5126, count: n, type: "VEC3", min, max });
    attrs.POSITION = accessors.length - 1;
    if (m.normals && m.normals.length === m.positions.length) { accessors.push({ bufferView: push(Float32Array.from(m.normals), 34962), componentType: 5126, count: n, type: "VEC3" }); attrs.NORMAL = accessors.length - 1; }
    const prim: Record<string, unknown> = { attributes: attrs, material: k, mode: 4 };
    if (m.indices && m.indices.length >= 3) { accessors.push({ bufferView: push(Uint32Array.from(m.indices), 34963), componentType: 5125, count: m.indices.length, type: "SCALAR" }); prim.indices = accessors.length - 1; }
    const [r, g, b, a] = m.color.map((x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 1)));
    materials.push({ name: `${m.name || "mesh"}-mat`, pbrMetallicRoughness: { baseColorFactor: [r, g, b, a], metallicFactor: 0, roughnessFactor: 0.85 }, ...(a < 1 ? { alphaMode: "BLEND" } : {}), ...(m.doubleSided ? { doubleSided: true } : {}) });
    gMeshes.push({ name: m.name || `mesh${k}`, primitives: [prim] });
    nodes.push({ name: m.name || `mesh${k}`, mesh: k });
  });
  const json = {
    asset: { version: "2.0", generator: opts.generator ?? "ERP Pattern Studio" },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gMeshes, materials, accessors, bufferViews,
    ...(offset ? { buffers: [{ byteLength: offset }] } : {}),
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jl = pad4(jsonBytes.byteLength);
  if (jl !== jsonBytes.byteLength) { const p = new Uint8Array(jl).fill(0x20); p.set(jsonBytes); jsonBytes = p; }
  const total = 12 + 8 + jl + (offset ? 8 + offset : 0);
  const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(jsonBytes, 20);
  if (offset) {
    let at = 20 + jl;
    dv.setUint32(at, offset, true); dv.setUint32(at + 4, 0x004e4942, true); at += 8;
    for (const c of chunks) { u8.set(c, at); at += c.byteLength; }
  }
  return out;
}

/** อ่านส่วน JSON กลับจาก GLB (ใช้ตรวจ/เทสต์) — ไม่ใช่ GLB = null */
export function readGlbJson(buf: ArrayBuffer): Record<string, unknown> | null {
  if (buf.byteLength < 20) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(16, true) !== 0x4e4f534a) return null;
  const len = dv.getUint32(12, true);
  try { return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len))); } catch { return null; }
}
