import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Phase 1.4 UI permission gates", () => {
  test("Create Module page uses schema create permission, not product create", () => {
    const source = read("app/admin/create-table/page.tsx");

    expect(source).toContain('usePermission("admin.schema.create_table")');
    expect(source).not.toContain('usePermission("products.create")');
  });

  test("Field Registry editor uses field registry edit permission", () => {
    const source = read("app/admin/field-registry/page.tsx");

    expect(source).toContain('usePermission("admin.field_registry.edit")');
  });

  test("Form Builder uses module layout edit permission", () => {
    const source = read("app/admin/form-builder/page.tsx");

    expect(source).toContain('usePermission("admin.module_layout.edit")');
  });

  test("Payroll calculation UI requires payroll.calculate before enqueueing jobs", () => {
    const source = read("app/payroll/calc-run/page.tsx");

    expect(source).toContain('usePermission("payroll.calculate")');
    expect(source).toContain("!canCalculate");
  });

  test("UI mock permissions do not grant the legacy broad field registry key", () => {
    const source = read("components/auth/index.tsx");

    expect(source).not.toContain('"admin.field_registry"');
  });
});
