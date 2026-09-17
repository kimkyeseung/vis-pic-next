import { execSync } from "child_process";
import { cpSync, rmSync, existsSync, copyFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = join(ROOT, "src-tauri", "server");

/// node.exe가 실행할 진입점. 이 두 파일이 번들 루트에 없으면 앱은 시작되지 못한다.
const REQUIRED_AT_ROOT = ["server.js", "node.exe"];

/** server.js를 너비 우선으로 찾는다. node_modules/.next 아래는 보지 않는다. */
function findServerJs(dir, depth = 0) {
  if (depth > 4) return null;
  if (existsSync(join(dir, "server.js"))) return dir;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const found = findServerJs(join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/** server.js가 중첩되어 있으면 그 폴더의 내용을 번들 루트로 끌어올린다. */
function flattenStandalone(serverDir) {
  if (existsSync(join(serverDir, "server.js"))) return;

  const nested = findServerJs(serverDir);
  if (!nested) {
    throw new Error(
      `standalone 출력에서 server.js를 찾을 수 없습니다.\n` +
        `  확인: ${join(ROOT, ".next", "standalone")}\n` +
        `  next build가 standalone 출력을 만들지 못했을 수 있습니다.`
    );
  }

  // 자기 조상으로 직접 복사하면 무한 재귀가 되므로 임시 폴더를 경유한다.
  const staging = join(ROOT, "src-tauri", "_standalone_flatten");
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  cpSync(nested, staging, { recursive: true, dereference: true });
  rmSync(nested, { recursive: true, force: true });
  // force: true로 기존 node_modules 등과 병합한다.
  cpSync(staging, serverDir, { recursive: true, force: true, dereference: true });
  rmSync(staging, { recursive: true, force: true });

  console.log(`  Flattened nested standalone output: ${nested.slice(serverDir.length + 1)}/ → ./`);
}

// 0. 이전 추출 데이터 무효화 (재실행 시 새 server.zip 압축 해제 강제)
const localAppData = process.env.LOCALAPPDATA || join(dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = join(localAppData, "ar-pic", ".version");
if (existsSync(versionFile)) {
  rmSync(versionFile);
  console.log("[0] Cleared cached version → app will re-extract on next run");
}

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

// standalone 출력이 한 단계 이상 중첩된 경우 평탄화한다.
// Next는 상위 폴더에 lockfile이 있으면 워크스페이스 루트를 추론해 tracing root를
// 프로젝트 상위로 잡고, 그러면 standalone/<상대경로>/server.js 로 들어간다.
// node.exe는 아래 3단계에서 루트에 직접 복사되므로, 이 경우
// "node.exe는 있는데 server.js만 없는" 번들이 만들어져 런타임에
// MODULE_NOT_FOUND로 죽는다 — 증상이 서버 기동 실패로만 보여 원인 찾기가 어렵다.
flattenStandalone(SERVER_DIR);

cpSync(
  join(ROOT, ".next", "static"),
  join(SERVER_DIR, ".next", "static"),
  { recursive: true }
);

// prints: 로컬 폴백 코드가 mkdir으로 생성하므로 통째로 제외
// mediapipe: 앱 최초 실행 시 온라인에서 다운로드하므로 제외 (~48MB 절감)
// images: 런타임 이미지는 Supabase Storage에서 서빙하므로 제외 (~17MB 절감).
//         유일하게 로컬로 참조되는 로고는 public/static/viswave_logo.png 로 분리됨.
const EXCLUDED = [
  join("public", "static", "prints"),
  join("public", "static", "mediapipe"),
  join("public", "static", "images"),
];
cpSync(join(ROOT, "public"), join(SERVER_DIR, "public"), {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(ROOT.length + 1);
    return !EXCLUDED.some((dir) => rel === dir || rel.startsWith(dir + sep));
  },
});

// Remove build cache (unnecessary for production)
const cacheDir = join(SERVER_DIR, ".next", "cache");
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
}

// Prisma 정리: 임시 파일(.tmpXXXX)과 비Windows 플랫폼 바이너리 제거
// (빌드 후 남은 쓰레기 파일 — 각 19MB × 여러 개로 zip 크기를 급증시킴)
const prismaClientDir = join(SERVER_DIR, "node_modules", ".prisma", "client");
if (existsSync(prismaClientDir)) {
  for (const entry of readdirSync(prismaClientDir)) {
    const isTemp = /\.tmp\d+$/.test(entry);
    const isNonWindows = /\.(so|dylib)(\.\w+)?\.node$/.test(entry);
    if (isTemp || isNonWindows) {
      rmSync(join(prismaClientDir, entry));
    }
  }
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

// 압축 전 최종 점검. 여기서 걸러내지 못하면 앱이 설치된 PC에서
// "서버가 응답하지 않습니다"로만 보이고, 원인은 server-stderr.log를
// 열어봐야 알 수 있다.
for (const f of REQUIRED_AT_ROOT) {
  if (!existsSync(join(SERVER_DIR, f))) {
    throw new Error(`번들 루트에 ${f}가 없습니다: ${join(SERVER_DIR, f)}`);
  }
}

const zipPath = join(ROOT, "src-tauri", "server.zip");
if (existsSync(zipPath)) rmSync(zipPath);
// Write a temp PS1 to avoid shell quoting issues with long paths.
// Must include a UTF-8 BOM: Windows PowerShell 5.1 reads BOM-less .ps1 files using the
// system ANSI codepage, which mangles non-ASCII characters in ROOT (e.g. Korean usernames)
// and makes Compress-Archive resolve a garbled/nonexistent path (fails with a null Join-Path arg).
//
// $ErrorActionPreference와 명시적 exit 1이 반드시 필요하다: Compress-Archive의
// 오류는 대부분 non-terminating이라 그대로 두면 파일이 빠진 채로도 종료 코드가
// 0이고, execSync는 성공으로 판단한다. 압축 후 필수 항목을 다시 확인해
// "조용히 불완전한 아카이브"가 exe에 임베드되는 것을 막는다.
const required = REQUIRED_AT_ROOT.map((f) => `'${f}'`).join(", ");
const tmpPs1 = join(ROOT, "src-tauri", "_zip_tmp.ps1");
writeFileSync(
  tmpPs1,
  `﻿$ErrorActionPreference = 'Stop'
try {
    Compress-Archive -Path "${SERVER_DIR}\\*" -DestinationPath "${zipPath}" -Force
} catch {
    Write-Error $_
    exit 1
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("${zipPath}")
try {
    # Windows PowerShell 5.1의 Compress-Archive는 항목 이름에 역슬래시를 쓴다.
    $names = $zip.Entries | ForEach-Object { $_.FullName.Replace('\\', '/') }
    $count = $names.Count
    foreach ($f in @(${required})) {
        if ($names -notcontains $f) {
            Write-Error "server.zip에 $f 가 없습니다 (항목 $count개)"
            exit 1
        }
    }
    Write-Host "  Verified $count entries"
} finally {
    $zip.Dispose()
}
`
);
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, { stdio: "inherit" });
rmSync(tmpPs1);
console.log(`  Created server.zip`);

console.log("\nDone — server.zip embedded into binary at next cargo build.");
