import { execSync } from "child_process";
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = join(ROOT, "src-tauri", "server");

// 1. Next.js build (prisma generate included in npm run build)
console.log("[1/6] Building Next.js...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

// 2. Server bundle
console.log("[2/6] Preparing server bundle...");
if (existsSync(SERVER_DIR)) {
  rmSync(SERVER_DIR, { recursive: true, force: true });
}

cpSync(join(ROOT, ".next", "standalone"), SERVER_DIR, {
  recursive: true,
  dereference: true,
});

cpSync(
  join(ROOT, ".next", "static"),
  join(SERVER_DIR, ".next", "static"),
  { recursive: true }
);

cpSync(join(ROOT, "public"), join(SERVER_DIR, "public"), { recursive: true });

// Remove build cache (unnecessary for production)
const cacheDir = join(SERVER_DIR, ".next", "cache");
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
}

// 3. Node.js runtime
console.log("[3/6] Copying Node.js runtime...");
const nodeExeDest = join(SERVER_DIR, "node.exe");
copyFileSync(process.execPath, nodeExeDest);
console.log(`  Copied ${process.execPath} (${process.version})`);

// 4. Sharp native DLLs (file tracer only copies the .node file, not the companion DLLs)
console.log("[4/6] Copying sharp native DLLs...");
const sharpPkg = `@img/sharp-${process.platform}-${process.arch}`;
const sharpLibSrc = join(ROOT, "node_modules", "@img", `sharp-${process.platform}-${process.arch}`, "lib");
const sharpLibDest = join(SERVER_DIR, "node_modules", "@img", `sharp-${process.platform}-${process.arch}`, "lib");
if (existsSync(sharpLibSrc)) {
  cpSync(sharpLibSrc, sharpLibDest, { recursive: true });
  console.log(`  Copied ${sharpPkg}/lib`);
} else {
  console.warn(`  Warning: ${sharpPkg}/lib not found, skipping`);
}

// 5. Environment files
console.log("[5/6] Copying environment files...");
for (const f of [".env", ".env.local", ".env.production"]) {
  const src = join(ROOT, f);
  if (existsSync(src)) {
    copyFileSync(src, join(SERVER_DIR, f));
    console.log(`  Copied ${f}`);
  }
}

// 6. Zip server bundle into single archive for embedding
console.log("[6/6] Zipping server bundle...");
const zipPath = join(ROOT, "src-tauri", "server.zip");
if (existsSync(zipPath)) rmSync(zipPath);
// Write a temp PS1 to avoid shell quoting issues with long paths
const tmpPs1 = join(ROOT, "src-tauri", "_zip_tmp.ps1");
writeFileSync(tmpPs1, `Compress-Archive -Path "${SERVER_DIR}\\*" -DestinationPath "${zipPath}" -Force\n`);
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, { stdio: "inherit" });
rmSync(tmpPs1);
console.log(`  Created server.zip`);

console.log("\nDone — server.zip embedded into binary at next cargo build.");
