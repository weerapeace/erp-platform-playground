import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Phase 1 upload permission gates", () => {
  test("shared upload permission helper uses the granular files.upload key", () => {
    const source = read("components/upload-permission/index.tsx");

    expect(source).toContain('FILE_UPLOAD_PERMISSION = "files.upload"');
    expect(source).toContain("usePermission(FILE_UPLOAD_PERMISSION)");
  });

  test.each([
    "components/image-input/index.tsx",
    "components/file-input/index.tsx",
    "components/file-multi-input/index.tsx",
  ])("%s blocks upload UI through the shared upload permission helper", (file) => {
    const source = read(file);

    expect(source).toContain("useFileUploadAccess");
    expect(source).toContain("uploadDisabled");
    expect(source).toContain("uploadDeniedMessage");
  });

  test.each([
    "components/profile-editor.tsx",
    "app/admin/users/page.tsx",
    "components/master-crud/studio-panel.tsx",
    "app/tasks/canvas-board.tsx",
  ])("%s blocks direct upload callers through the shared upload permission helper", (file) => {
    const source = read(file);

    expect(source).toContain("useFileUploadAccess");
    expect(source).toContain("uploadDisabled");
    expect(source).toContain("uploadDeniedMessage");
  });
});
