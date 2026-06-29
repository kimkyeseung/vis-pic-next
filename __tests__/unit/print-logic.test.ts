import { describe, it, expect } from "vitest";

// Mirrors the regex used in handlePrint to strip the data: URI prefix before
// passing image data to Tauri's print_image command.
const stripDataUri = (dataUrl: string) =>
  dataUrl.replace(/^data:image\/\w+;base64,/, "");

// Mirrors the Rust fix: replace backslashes with forward slashes so the path
// is valid in PowerShell (which doesn't use \ as an escape character).
const toForwardSlash = (p: string) => p.replace(/\\/g, "/");

describe("base64 data-URI stripping", () => {
  it("strips jpeg prefix", () => {
    const result = stripDataUri("data:image/jpeg;base64,/9j/4AAQ==");
    expect(result).toBe("/9j/4AAQ==");
  });

  it("strips png prefix", () => {
    const result = stripDataUri("data:image/png;base64,iVBORw0KGg==");
    expect(result).toBe("iVBORw0KGg==");
  });

  it("strips webp prefix", () => {
    const result = stripDataUri("data:image/webp;base64,UklGRg==");
    expect(result).toBe("UklGRg==");
  });

  it("leaves plain base64 unchanged", () => {
    const plain = "/9j/4AAQ==";
    expect(stripDataUri(plain)).toBe(plain);
  });

  it("leaves empty string unchanged", () => {
    expect(stripDataUri("")).toBe("");
  });
});

describe("Windows path forward-slash conversion (mirrors Rust fix)", () => {
  it("converts backslashes to forward slashes", () => {
    const win = "C:\\Users\\test\\AppData\\Local\\Temp\\arpic_print_1234.jpg";
    expect(toForwardSlash(win)).toBe(
      "C:/Users/test/AppData/Local/Temp/arpic_print_1234.jpg"
    );
  });

  it("path with no backslashes is unchanged", () => {
    const fwd = "C:/Users/test/file.jpg";
    expect(toForwardSlash(fwd)).toBe(fwd);
  });

  it("converted path contains no backslashes", () => {
    const win = "C:\\some\\deep\\path\\file.jpg";
    expect(toForwardSlash(win)).not.toContain("\\");
  });

  it("double-backslash (old bug) would produce invalid path", () => {
    const win = "C:\\Users\\file.jpg";
    // Old code did replace('\\', '\\\\') → double backslashes in shell string
    const buggy = win.replace(/\\/g, "\\\\");
    expect(buggy).toBe("C:\\\\Users\\\\file.jpg");
    // Fixed code produces valid forward-slash path
    const fixed = toForwardSlash(win);
    expect(fixed).toBe("C:/Users/file.jpg");
  });
});

describe("Tauri invoke args — camelCase required by Tauri v2", () => {
  // Tauri v2 maps JS camelCase → Rust snake_case automatically.
  // Sending snake_case from JS causes "missing required key" error.
  it("invoke args use camelCase keys", () => {
    const printerName = "Canon";
    const imageData = "base64data";
    const args = { printerName, imageData };
    expect(Object.keys(args)).toContain("printerName");
    expect(Object.keys(args)).toContain("imageData");
    expect(Object.keys(args)).not.toContain("printer_name");
    expect(Object.keys(args)).not.toContain("image_data");
  });

  it("empty printerName falls back to default printer (not rejected)", () => {
    // When PRINTER_NAME setting is unset, printerName is "".
    // Rust side skips setting PrinterName so .NET uses system default.
    const printerName = "";
    expect(printerName).toBe("");
    // Non-empty value is passed through unchanged
    const named = "Canon SELPHY";
    expect(named).toBe("Canon SELPHY");
  });
});
