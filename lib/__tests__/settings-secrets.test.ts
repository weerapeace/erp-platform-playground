import { describe, it, expect } from "vitest";
import { maskSecretRows, keepSecretsOnWrite, hasSecretFields, SECRET_MASK } from "../settings-secrets";

// admin ปลอม: คืนแถวเดิมใน DB ตาม id (พอสำหรับ .from().select().eq().maybeSingle())
function fakeAdmin(row: Record<string, unknown> | null) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => chain } as unknown as Parameters<typeof keepSecretsOnWrite>[0];
}

describe("settings-secrets — โทเคน LINE ใน china_app_settings", () => {
  const TOKEN = "abcdefghijklmnopqrstuvwxyz1234";

  it("รู้ว่าตารางไหนมีความลับ", () => {
    expect(hasSecretFields("china_app_settings")).toBe(true);
    expect(hasSecretFields("skus_v2")).toBe(false);
  });

  it("ปิดโทเคนก่อนส่งหน้าเว็บ เหลือ 4 ตัวท้าย · คีย์อื่นไม่แตะ", () => {
    const rows = maskSecretRows("china_app_settings", [
      { id: "1", skey: "line_config", sval: { token: TOKEN, group_id: "G1" } },
      { id: "2", skey: "menu_roles", sval: { token: "not-a-secret-here" } },
    ]);
    expect((rows[0].sval as Record<string, unknown>).token).toBe(`${SECRET_MASK}1234`);
    expect((rows[0].sval as Record<string, unknown>).group_id).toBe("G1");
    expect((rows[1].sval as Record<string, unknown>).token).toBe("not-a-secret-here");
  });

  it("บันทึกค่าที่ปิดไว้กลับมา = คงโทเคนเดิม", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: `${SECRET_MASK}1234`, group_id: "G2" } });
    expect((out.sval as Record<string, unknown>).token).toBe(TOKEN);
    expect((out.sval as Record<string, unknown>).group_id).toBe("G2");
  });

  it("ไม่ส่งโทเคนมาเลย / ส่งค่าว่าง = คงโทเคนเดิม (กันลบทิ้งโดยไม่ตั้งใจ)", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const a = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { group_id: "G3" } });
    const b = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: "" } });
    expect((a.sval as Record<string, unknown>).token).toBe(TOKEN);
    expect((b.sval as Record<string, unknown>).token).toBe(TOKEN);
  });

  it("พิมพ์โทเคนใหม่ = ใช้ค่าใหม่", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: "NEW-TOKEN-9999" } });
    expect((out.sval as Record<string, unknown>).token).toBe("NEW-TOKEN-9999");
  });

  it("สร้างแถวใหม่พร้อมค่าที่ปิดไว้ → ไม่บันทึกค่า ••••", async () => {
    const out = await keepSecretsOnWrite(fakeAdmin(null), "china_app_settings", null, { skey: "line_config", sval: { token: `${SECRET_MASK}1234` } });
    expect("token" in (out.sval as Record<string, unknown>)).toBe(false);
  });
});

describe("settings-secrets — บอท LINE เสริม (bots.*.token / bots.*.channel_secret)", () => {
  const B_TOKEN = "bot-two-token-xyz-5678";
  const B_SEC = "0123456789abcdef0123456789abcdef";
  type R = Record<string, unknown>;
  const botOf = (sval: unknown, key: string) => ((sval as R).bots as R)[key] as R;

  it("ปิดโทเคน + รหัสลับของบอทเสริมทุกตัว · ชื่อ/กลุ่มไม่แตะ", () => {
    const [row] = maskSecretRows("china_app_settings", [
      { id: "1", skey: "line_config", sval: { token: "MAIN-TOKEN-1111", bots: { b1: { label: "บอทผลิต", token: B_TOKEN, channel_secret: B_SEC, group_id: "Gp" } } } },
    ]);
    const b1 = botOf(row.sval, "b1");
    expect(b1.token).toBe(`${SECRET_MASK}5678`);
    expect(b1.channel_secret).toBe(`${SECRET_MASK}cdef`);
    expect(b1.label).toBe("บอทผลิต");
    expect(b1.group_id).toBe("Gp");
    expect((row.sval as R).token).toBe(`${SECRET_MASK}1111`);
  });

  it("บันทึกค่าที่ปิดไว้กลับมา = คงความลับเดิมของบอทเสริม", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { bots: { b1: { label: "x", token: B_TOKEN, channel_secret: B_SEC } } } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", {
      sval: { bots: { b1: { label: "ชื่อใหม่", token: `${SECRET_MASK}5678`, channel_secret: `${SECRET_MASK}cdef` } } },
    });
    const b1 = botOf(out.sval, "b1");
    expect(b1.token).toBe(B_TOKEN);
    expect(b1.channel_secret).toBe(B_SEC);
    expect(b1.label).toBe("ชื่อใหม่");
  });

  it("ส่งก้อนที่ไม่มี bots มาเลย → ไม่สร้างบอทขึ้นมาเอง (ไม่โยน error)", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { bots: { b1: { token: B_TOKEN } } } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { group_id: "G" } });
    expect((out.sval as R).bots).toBeUndefined();
  });
});
