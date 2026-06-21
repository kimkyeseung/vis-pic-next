import { execSync } from "child_process";
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = join(ROOT, "src-tauri", "server");

// 1. Prisma client
console.log("[1/5] Generating Prisma client...");
execSync("npx prisma generate", { cwd: ROOT, stdio: "inherit" });

// 2. Next.js build
console.log("[2/5] Building Next.js...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

// 3. Server bundle
console.log("[3/5] Preparing server bundle...");
if (existsSync(SERVER_DIR)) {
  rmSync(SERVER_DIR, { recursive: true, force: true });
}

cpSync(join(ROOT, ".next", "standalone"), SERVER_DIR, { recursive: true });

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

// 4. Node.js runtime
console.log("[4/5] Copying Node.js runtime...");
const nodeExeDest = join(SERVER_DIR, "node.exe");
copyFileSync(process.execPath, nodeExeDest);
console.log(`  Copied ${process.execPath} (${process.version})`);

// 5. Environment files
console.log("[5/5] Copying environment files...");
for (const f of [".env", ".env.local", ".env.production"]) {
  const src = join(ROOT, f);
  if (existsSync(src)) {
    copyFileSync(src, join(SERVER_DIR, f));
    console.log(`  Copied ${f}`);
  }
}

console.log("\nServer bundle ready at src-tauri/server/");
