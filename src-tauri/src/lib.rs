use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use serde::Serialize;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct NodeProcess(Mutex<Option<std::process::Child>>);

// ── mediapipe 헬퍼 ─────────────────────────────────────────────────────────

fn ar_pic_dir() -> std::path::PathBuf {
    dirs::data_local_dir()
        .expect("LOCALAPPDATA를 찾을 수 없습니다")
        .join("ar-pic")
}

fn mediapipe_cache_dir() -> std::path::PathBuf {
    ar_pic_dir().join("mediapipe")
}

fn app_server_dir() -> std::path::PathBuf {
    ar_pic_dir().join("server")
}

fn server_mediapipe_dir() -> std::path::PathBuf {
    app_server_dir().join("public").join("static").join("mediapipe")
}

/// node.exe/server.js를 지정한 서버 디렉터리에서 구동한다.
/// setup()의 최초 기동과 download_mediapipe()의 재시작이 동일한 절차를 공유한다.
fn spawn_node_server(server_dir: &std::path::Path) -> std::io::Result<std::process::Child> {
    let node_exe = server_dir.join("node.exe");
    let server_js = server_dir.join("server.js");

    let log_base = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ar-pic");
    let stdout_log = std::fs::File::create(log_base.join("server-stdout.log")).ok();
    let stderr_log = std::fs::File::create(log_base.join("server-stderr.log")).ok();

    let mut cmd = std::process::Command::new(&node_exe);
    cmd.arg(&server_js)
        .env("PORT", "3001")
        .env("HOSTNAME", "127.0.0.1")
        .current_dir(server_dir);
    if let Some(f) = stdout_log { cmd.stdout(f); }
    if let Some(f) = stderr_log { cmd.stderr(f); }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.spawn()
}

/// 3001 포트가 응답할 때까지 폴링. 성공 시 true.
fn wait_for_server_port(max_iters: u32) -> bool {
    for _ in 0..max_iters {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if std::net::TcpStream::connect("127.0.0.1:3001").is_ok() {
            return true;
        }
    }
    false
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

const MEDIAPIPE_VERSION: &str = "0.10.35";

const MEDIAPIPE_FILES: &[(&str, &str)] = &[
    ("wasm/vision_wasm_internal.js",          "wasm/vision_wasm_internal.js"),
    ("wasm/vision_wasm_internal.wasm",        "wasm/vision_wasm_internal.wasm"),
    ("wasm/vision_wasm_module_internal.js",   "wasm/vision_wasm_module_internal.js"),
    ("wasm/vision_wasm_module_internal.wasm", "wasm/vision_wasm_module_internal.wasm"),
    ("wasm/vision_wasm_nosimd_internal.js",   "wasm/vision_wasm_nosimd_internal.js"),
    ("wasm/vision_wasm_nosimd_internal.wasm", "wasm/vision_wasm_nosimd_internal.wasm"),
    ("model/selfie_multiclass_256x256.tflite", ""),  // 두 번째 필드는 미사용 (아래에서 URL 직접 구성)
    ("model/gesture_recognizer.task", ""),           // 손바닥(Open_Palm) 제스처 촬영용
];

fn mediapipe_url(rel_path: &str) -> String {
    if rel_path.starts_with("wasm/") {
        let file = rel_path.strip_prefix("wasm/").unwrap_or(rel_path);
        format!("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{}/wasm/{}", MEDIAPIPE_VERSION, file)
    } else if rel_path.ends_with("gesture_recognizer.task") {
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task".to_string()
    } else {
        // selfie 세그멘테이션 모델
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite".to_string()
    }
}

/// 다운로드 중단 시 완성본처럼 보이는 파일이 남지 않도록 사용하는 임시 경로.
/// 확장자를 교체하지 않고 뒤에 붙여 `a.js`/`a.wasm`가 충돌하지 않게 한다.
fn download_tmp_path(dest: &std::path::Path) -> std::path::PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".download");
    dest.with_file_name(name)
}

fn download_file(url: &str, dest: &std::path::Path) -> Result<(), String> {
    if dest.exists() { return Ok(()); }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        // 임시 파일로 받은 뒤 rename: 중단된 다운로드가 dest에 부분 파일로 남아
        // 다음 실행에서 "이미 존재"로 스킵되는 것을 방지한다.
        let tmp = download_tmp_path(dest);
        let script = format!(
            "(New-Object System.Net.WebClient).DownloadFile('{}', '{}')",
            url,
            tmp.to_string_lossy().replace('\'', "''")
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("{url} 다운로드 실패"));
        }
        std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("Windows 전용 기능입니다".to_string())
    }
}

/// dir 아래에 mediapipe 필수 파일(wasm + 모델)이 모두 존재하는지 확인.
/// 일부만 있으면(다운로드 중단 등) 미설치로 간주해 다운로드 UI가 다시 뜨게 한다.
fn mediapipe_files_complete(dir: &std::path::Path) -> bool {
    MEDIAPIPE_FILES.iter().all(|(rel, _)| dir.join(rel).exists())
}

/// mediapipe 파일이 서버 디렉터리에 설치되어 있는지 확인
#[tauri::command]
fn mediapipe_is_installed() -> bool {
    if cfg!(debug_assertions) {
        return true; // dev 모드: Next.js dev server가 public/에서 직접 서빙
    }
    mediapipe_files_complete(&server_mediapipe_dir())
}

/// mediapipe를 CDN에서 다운로드 후 서버 디렉터리에 설치
/// 진행 상황을 "mediapipe-progress" 이벤트로 전송 { done: n, total: N }
#[tauri::command]
fn download_mediapipe(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;
    let cache = mediapipe_cache_dir();
    let rel_paths: Vec<&str> = MEDIAPIPE_FILES.iter().map(|(p, _)| *p).collect();
    let total = rel_paths.len();

    for (i, rel_path) in rel_paths.iter().enumerate() {
        let url = mediapipe_url(rel_path);
        download_file(&url, &cache.join(rel_path))?;
        let _ = app.emit("mediapipe-progress", serde_json::json!({ "done": i + 1, "total": total }));
    }

    copy_dir_all(&cache, &server_mediapipe_dir()).map_err(|e| e.to_string())?;

    // Next.js는 서버 기동 시점의 public/ 디렉터리 스냅샷을 메모리에 캐시해두고
    // 이후 요청을 그 목록으로만 판별한다. 방금 디스크에 추가한 mediapipe 파일은
    // 이미 떠 있는 서버 프로세스가 인식하지 못해 계속 404를 반환하므로
    // (재시작 없이는 앱을 껐다 켜기 전까지 "AI 배경제거 모델" 점검이 영구히
    //  노란 경고로 남는 버그의 원인이었다) 서버를 재시작해 새로 스캔하게 한다.
    if let Some(state) = app.try_state::<NodeProcess>() {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let child = spawn_node_server(&app_server_dir()).map_err(|e| format!("서버 재시작 실패: {e}"))?;
        *guard = Some(child);
        drop(guard);
        if !wait_for_server_port(40) {
            return Err("서버 재시작 후 응답 없음".to_string());
        }
    }

    Ok(())
}

// server.zip is created by prepare-tauri.mjs and embedded at compile time.
// In debug builds this file may not exist, so the static is only declared for release.
#[cfg(not(debug_assertions))]
static SERVER_ARCHIVE: &[u8] = include_bytes!("../server.zip");

/// Extracts the embedded server archive to %LOCALAPPDATA%\ar-pic\server on first run
/// (or when the app version changes). Returns the path to the extracted server directory.
#[cfg(not(debug_assertions))]
fn prepare_server_dir() -> std::path::PathBuf {
    let base = dirs::data_local_dir()
        .expect("LOCALAPPDATA를 찾을 수 없습니다")
        .join("ar-pic");
    let server_dir = base.join("server");
    let version_file = base.join(".version");
    // 앱 버전 + server.zip 내용 해시(build.rs에서 계산) — 같은 앱 버전이라도
    // 번들이 바뀌면 재추출된다. 버전만 비교하던 시절에는 이전 빌드를 설치했던
    // PC에서 새로 설치해도 옛 server 디렉터리가 재사용되는 버그가 있었다.
    let current_version = concat!(env!("CARGO_PKG_VERSION"), "-", env!("SERVER_BUILD_ID"));

    let up_to_date = version_file.exists()
        && std::fs::read_to_string(&version_file)
            .unwrap_or_default()
            .trim()
            == current_version;

    if !up_to_date {
        if server_dir.exists() {
            std::fs::remove_dir_all(&server_dir).ok();
        }
        std::fs::create_dir_all(&server_dir).expect("server 디렉터리 생성 실패");

        let cursor = std::io::Cursor::new(SERVER_ARCHIVE);
        let mut archive = zip::ZipArchive::new(cursor).expect("서버 아카이브 열기 실패");
        archive.extract(&server_dir).expect("서버 파일 압축 해제 실패");

        std::fs::write(&version_file, current_version).ok();
    }

    // 캐시된 mediapipe가 있으면 서버 디렉터리에 복사 (오프라인 재실행 지원)
    // 대상이 불완전하면(과거 부분 다운로드 등) 캐시에서 다시 채운다.
    let mp_cache = mediapipe_cache_dir();
    if mp_cache.exists() {
        let mp_dest = server_dir.join("public").join("static").join("mediapipe");
        if !mediapipe_files_complete(&mp_dest) {
            let _ = copy_dir_all(&mp_cache, &mp_dest);
        }
    }

    server_dir
}

#[derive(Serialize)]
struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

#[tauri::command]
fn get_monitors(app: tauri::AppHandle) -> Vec<MonitorInfo> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            index: i,
            name: m.name().map_or("모니터", |v| v).to_string(),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
        })
        .collect()
}

#[tauri::command]
async fn open_camera_window(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    if let Some(existing) = app.get_webview_window("camera-output") {
        existing.close().ok();
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "camera-output",
        WebviewUrl::App("/output".into()),
    )
    .title("Camera Output")
    .inner_size(width as f64, height as f64)
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    window
        .set_position(tauri::PhysicalPosition { x, y })
        .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn close_camera_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("camera-output") {
        window.close().ok();
    }
}

#[tauri::command]
fn get_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = stdout
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(printers)
        } else {
            Err("Failed to get printers".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec!["Default Printer".to_string()])
    }
}

#[tauri::command]
fn print_image(
    printer_name: String,
    image_data: String,
    copies: Option<u32>,
    paper_width_mm: Option<f64>,
    paper_height_mm: Option<f64>,
) -> Result<bool, String> {
    use std::io::Write;

    // 결제 화면에서 고른 인쇄 매수 (미지정 시 1장)
    let copies = copies.unwrap_or(1).clamp(1, 99);

    // 인화 설정(PICTURE_WIDTH/HEIGHT)의 용지 크기. 미지정이면 프린터 기본 용지를 쓴다.
    let paper_mm = match (paper_width_mm, paper_height_mm) {
        (Some(w), Some(h)) if w > 0.0 && h > 0.0 => Some((w, h)),
        _ => None,
    };

    let bytes = base64_decode(&image_data)?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("arpic_print_{}.jpg", std::process::id()));
    let temp_path_str = temp_path.to_string_lossy().to_string();

    {
        let mut file = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let temp_path_forward = temp_path_str.replace('\\', "/");
    let result = print_file(&printer_name, &temp_path_forward, copies, paper_mm);

    let _ = std::fs::remove_file(&temp_path);

    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let cleaned: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut buf: Vec<u8> = Vec::new();
    let mut bits: u32 = 0;
    let mut count = 0;
    for c in cleaned.bytes() {
        if c == b'=' { break; }
        let val = table.iter().position(|&b| b == c)
            .ok_or_else(|| format!("Invalid base64 char: {}", c as char))? as u32;
        bits = (bits << 6) | val;
        count += 1;
        if count == 4 {
            buf.push((bits >> 16) as u8);
            buf.push((bits >> 8) as u8);
            buf.push(bits as u8);
            bits = 0;
            count = 0;
        }
    }
    match count {
        2 => { bits <<= 12; buf.push((bits >> 16) as u8); }
        3 => { bits <<= 6; buf.push((bits >> 16) as u8); buf.push((bits >> 8) as u8); }
        _ => {}
    }
    Ok(buf)
}

fn print_file(
    printer_name: &str,
    file_path: &str,
    copies: u32,
    paper_mm: Option<(f64, f64)>,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        // Only set PrinterName when non-empty; empty string causes .NET to throw.
        let set_printer = if printer_name.is_empty() {
            String::new()
        } else {
            format!(r#"$pd.PrinterSettings.PrinterName = "{}""#, printer_name)
        };

        // 인화 설정의 용지 크기를 실제 인쇄 작업에 반영한다. 지정하지 않으면 .NET은
        // 프린터 드라이버 기본 용지(보통 A4)로 출력하므로, 웹(window.print + @page)에서
        // 맞던 102x152mm 같은 설정이 exe에서는 무시되는 문제가 있었다.
        // System.Drawing.Printing의 단위는 1/100 inch.
        let set_paper = match paper_mm {
            Some((w_mm, h_mm)) => {
                let w = (w_mm / 25.4 * 100.0).round() as i32;
                let h = (h_mm / 25.4 * 100.0).round() as i32;
                format!(
                    r#"
            $reqShort = [Math]::Min({w}, {h})
            $reqLong  = [Math]::Max({w}, {h})
            # 드라이버가 제공하는 용지 목록에서 가장 가까운 규격을 고른다(포토 프린터의
            # "4x6" 항목 등). 일치하는 것이 없을 때만 Custom 용지로 대체한다.
            $best = $null
            $bestDiff = [int]::MaxValue
            foreach ($cand in $pd.PrinterSettings.PaperSizes) {{
                $candShort = [Math]::Min($cand.Width, $cand.Height)
                $candLong  = [Math]::Max($cand.Width, $cand.Height)
                $diff = [Math]::Abs($candShort - $reqShort) + [Math]::Abs($candLong - $reqLong)
                if ($diff -lt $bestDiff) {{ $bestDiff = $diff; $best = $cand }}
            }}
            # 허용 오차 0.2 inch(약 5mm) 이내일 때만 드라이버 규격을 사용
            if ($best -ne $null -and $bestDiff -le 40) {{
                $pd.DefaultPageSettings.PaperSize = $best
            }} else {{
                $custom = New-Object System.Drawing.Printing.PaperSize("Custom", {w}, {h})
                # RawKind = 256(DMPAPER_USER) 이어야 드라이버가 사용자 정의 크기로 받아들인다
                $custom.RawKind = 256
                $pd.DefaultPageSettings.PaperSize = $custom
            }}
"#,
                    w = w,
                    h = h
                )
            }
            None => String::new(),
        };

        let script = format!(
            r#"
            Add-Type -AssemblyName System.Drawing
            $img = [System.Drawing.Image]::FromFile("{file_path}")
            $pd = New-Object System.Drawing.Printing.PrintDocument
            # 기본 PrintController(PrintControllerWithStatusDialog)는 인쇄 중
            # "페이지 인쇄 중..." 상태 대화상자를 포그라운드로 띄운다. 키오스크에서는
            # 이 창이 우측 하단에 보이고, 포그라운드를 뺏겨 풀스크린 창이 흐트러지면서
            # 화면 위아래로 바탕화면이 드러난다. StandardPrintController로 무음 인쇄한다.
            $pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController
            {set_printer}
            $pd.PrinterSettings.Copies = {copies}
            {set_paper}
            # 웹 경로의 `@page {{ margin: 0 }}`과 동일하게 여백 없이 용지 전체에 출력한다.
            # (기본 여백은 상하좌우 1 inch라 4x6 인화지에서는 사진이 크게 줄어든다)
            $pd.OriginAtMargins = $true
            $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
            # 방향은 드라이버 기본값에 맡기지 않고 항상 용지 본래 방향(Landscape=false)으로 고정한다.
            # 프린터 기본 설정이 가로면 PageSettings.Bounds만 뒤집히고 PaperSize.Width/Height는
            # 그대로여서, 회전 판정과 실제 그리기 영역이 어긋나 90° 틀어진 채 인쇄된다.
            $pd.DefaultPageSettings.Landscape = $false
            # 회전 판정도 PaperSize가 아니라 실제 페이지 영역(Bounds)을 기준으로 한다 —
            # 아래 PrintPage에서 쓰는 MarginBounds와 같은 기준이어야 어긋나지 않는다.
            $pageBounds = $pd.DefaultPageSettings.Bounds
            $paperIsLandscape = $pageBounds.Width -gt $pageBounds.Height
            $imgIsLandscape = $img.Width -gt $img.Height
            if ($imgIsLandscape -ne $paperIsLandscape) {{
                $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
            }}
            $pd.add_PrintPage({{
                param($sender, $e)
                $bounds = $e.MarginBounds
                $imgRatio = $img.Width / $img.Height
                $boundsRatio = $bounds.Width / $bounds.Height
                if ($imgRatio -gt $boundsRatio) {{
                    $drawH = [int]($bounds.Width / $imgRatio)
                    $drawY = $bounds.Y + [int](($bounds.Height - $drawH) / 2)
                    $rect = New-Object System.Drawing.Rectangle($bounds.X, $drawY, $bounds.Width, $drawH)
                }} else {{
                    $drawW = [int]($bounds.Height * $imgRatio)
                    $drawX = $bounds.X + [int](($bounds.Width - $drawW) / 2)
                    $rect = New-Object System.Drawing.Rectangle($drawX, $bounds.Y, $drawW, $bounds.Height)
                }}
                $e.Graphics.DrawImage($img, $rect)
            }})
            $pd.Print()
            $img.Dispose()
            "#,
            file_path = file_path,
            set_printer = set_printer,
            copies = copies,
            set_paper = set_paper,
        );

        let output = Command::new("powershell")
            .args(["-Command", &script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            Ok(true)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Print failed: {}", stderr))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut args: Vec<String> = vec![
            "-d".into(),
            printer_name.into(),
            "-n".into(),
            copies.to_string(),
        ];
        if let Some((w_mm, h_mm)) = paper_mm {
            // CUPS 사용자 정의 용지 (mm 단위) + 여백 없이 용지 전체 사용
            args.push("-o".into());
            args.push(format!("media=Custom.{:.0}x{:.0}mm", w_mm, h_mm));
            args.push("-o".into());
            args.push("fit-to-page".into());
        }
        args.push(file_path.into());

        let output = Command::new("lp")
            .args(&args)
            .output()
            .map_err(|e| e.to_string())?;

        Ok(output.status.success())
    }
}

#[tauri::command]
fn get_cameras() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-Command",
                "Get-PnpDevice -Class Camera -Status OK | Select-Object -ExpandProperty FriendlyName",
            ])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let cameras: Vec<String> = stdout
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(cameras)
        } else {
            Ok(vec![])
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec!["Default Camera".to_string()])
    }
}

#[tauri::command]
fn save_settings(settings: std::collections::HashMap<String, String>) -> Result<bool, String> {
    let app_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("ar-pic");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let settings_path = app_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path, json).map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
fn load_settings() -> Result<std::collections::HashMap<String, String>, String> {
    let app_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("ar-pic");

    let settings_path = app_dir.join("settings.json");

    if settings_path.exists() {
        let json = std::fs::read_to_string(settings_path).map_err(|e| e.to_string())?;
        let settings: std::collections::HashMap<String, String> =
            serde_json::from_str(&json).map_err(|e| e.to_string())?;
        Ok(settings)
    } else {
        Ok(std::collections::HashMap::new())
    }
}

/// 창 파괴 시 Node 서버를 종료할지 판단한다.
/// 메인 창이 닫힐 때(앱 종료)만 true. 서브 모니터 창(camera-output) 등
/// 보조 창이 닫히거나 재생성될 때 서버가 죽으면 앱 전체가 먹통이 된다.
fn should_shutdown_server_on_destroy(window_label: &str) -> bool {
    window_label == "main"
}

/// 메인 창 종료 요청(Alt+F4 등) 시, 서브 모니터 창(camera-output)도 함께 닫을지 판단한다.
/// 메인 창이면 true → 종료를 막지 않고 서브 창까지 닫아 앱이 한 번에 깔끔히 종료된다.
/// (서브 창을 안 닫으면 그 창만 남아 앱이 종료되지 않는 좀비 상태가 된다.)
fn should_close_subwindows_with(window_label: &str) -> bool {
    window_label == "main"
}

/// F11 전체화면 ↔ 창 모드 토글.
/// 창은 borderless 1920x1080 전체화면으로 시작하므로, 전체화면만 해제하면
/// 여전히 모니터 전체를 덮어 아무 변화가 없어 보인다. 창 모드로 나올 때는
/// 테두리를 복원하고 크기를 줄여 중앙에 배치해 토글이 눈에 보이게 한다.
fn toggle_fullscreen(window: &tauri::WebviewWindow) {
    let is_fs = window.is_fullscreen().unwrap_or(false);
    if is_fs {
        let _ = window.set_fullscreen(false);
        let _ = window.set_decorations(true);
        let _ = window.set_size(tauri::LogicalSize::new(1280.0, 800.0));
        let _ = window.center();
    } else {
        let _ = window.set_decorations(false);
        let _ = window.set_fullscreen(true);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, ShortcutState};
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    match shortcut.key {
                        // F11 → 메인 창 전체화면 토글
                        Code::F11 => {
                            if let Some(window) = app.get_webview_window("main") {
                                toggle_fullscreen(&window);
                            }
                        }
                        // Ctrl+Alt+F4 → 서브 모니터 창(camera-output) 강제 종료.
                        // 서브 창이 always_on_top·전체화면으로 메인 모니터를 덮어 Alt+Tab조차
                        // 안 먹는 상황의 탈출구다(전역 단축키라 어떤 창이 위에 있든 발동).
                        // 등록한 조합이 Ctrl+Alt+F4뿐이라 이 핸들러엔 그 조합만 들어온다.
                        Code::F4 => {
                            if let Some(cam) = app.get_webview_window("camera-output") {
                                let _ = cam.close();
                            }
                            // 가려져 있던 메인 창을 다시 앞으로 가져와 조작권을 회복한다.
                            if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_image,
            get_cameras,
            save_settings,
            load_settings,
            get_monitors,
            open_camera_window,
            close_camera_window,
            mediapipe_is_installed,
            download_mediapipe
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // F11 → 전체화면 토글 (OS 레벨, WebView2 키 소비 우회)
            // 등록 실패(다른 앱이 F11 선점 등) 시 앱을 죽이지 않고
            // 웹뷰 keydown 리스너(FullscreenToggle.tsx)가 폴백으로 동작한다.
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
            if let Err(e) = app
                .handle()
                .global_shortcut()
                .register(Shortcut::new(None, Code::F11))
            {
                eprintln!("F11 전역 단축키 등록 실패 (웹뷰 폴백 사용): {e}");
            }

            // Ctrl+Alt+F4 → 서브 모니터 창 강제 종료(메인이 가려져 조작 불가일 때의 탈출구).
            // 위 with_handler가 shortcut.key로 F11과 구분해 처리한다.
            if let Err(e) = app
                .handle()
                .global_shortcut()
                .register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::F4))
            {
                eprintln!("Ctrl+Alt+F4 전역 단축키 등록 실패: {e}");
            }

            // WebView2는 PermissionRequested 핸들러가 없으면 기본으로 카메라를 거부한다.
            // 창이 숨겨진 상태에서 권한 프롬프트가 발생하면 자동 거부되어 NotFoundError가 발생하므로
            // 핸들러를 등록해 localhost 카메라 요청을 자동 허용한다.
            #[cfg(windows)]
            {
                use webview2_com::{
                    Microsoft::Web::WebView2::Win32::{
                        COREWEBVIEW2_PERMISSION_KIND,
                        COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    },
                    PermissionRequestedEventHandler,
                };
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|wv| {
                        unsafe {
                            if let Ok(wv2) = wv.controller().CoreWebView2() {
                                let mut token = std::mem::zeroed();
                                let _ = wv2.add_PermissionRequested(
                                    &PermissionRequestedEventHandler::create(Box::new(
                                        |_sender, args| {
                                            if let Some(args) = args {
                                                let mut kind = std::mem::zeroed::<COREWEBVIEW2_PERMISSION_KIND>();
                                                args.PermissionKind(&mut kind)?;
                                                if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
                                                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                                }
                                            }
                                            Ok(())
                                        },
                                    )),
                                    &mut token,
                                );
                            }
                        }
                    });
                }
            }

            // 프로덕션 빌드에서만 임베디드 Next.js 서버 시작
            #[cfg(not(debug_assertions))]
            {
                app.manage(NodeProcess(Mutex::new(None)));
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    let server_dir = prepare_server_dir();

                    // 이전 인스턴스가 3001 포트를 점유하고 있으면 종료
                    #[cfg(target_os = "windows")]
                    {
                        let _ = Command::new("powershell")
                            .args(["-NoProfile", "-NonInteractive", "-Command",
                                "$p=(Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}"])
                            .creation_flags(0x08000000)
                            .status();
                        std::thread::sleep(std::time::Duration::from_millis(300));
                    }

                    if let Ok(child) = spawn_node_server(&server_dir) {
                        if let Some(state) = app_handle.try_state::<NodeProcess>() {
                            *state.0.lock().unwrap() = Some(child);
                        }
                    }

                    // 포트가 열릴 때까지 폴링 (최대 60초)
                    wait_for_server_port(120);
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        // 서버 준비 전 초기 내비게이션이 ERR_CONNECTION_REFUSED로 실패했을 수 있는데,
                        // reload()는 실패한(문서 없는) 상태를 복구하지 못해 흰 화면이 남는다.
                        // 준비된 서버 URL로 명시적으로 새 내비게이션을 수행한다(reload는 폴백).
                        match "http://127.0.0.1:3001/".parse() {
                            Ok(url) => { let _ = window.navigate(url); }
                            Err(_) => { let _ = window.reload(); }
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // 메인 창 종료 요청(Alt+F4·닫기). 종료를 막지 않고, 서브 모니터 창(camera-output)이
            // 떠 있으면 함께 닫는다 → Alt+F4 한 번에 두 창이 모두 닫히고 앱이 깔끔히 종료된다.
            // (서브 창을 안 닫으면 그 창만 남아 앱이 종료되지 않는 좀비 상태가 된다.)
            tauri::WindowEvent::CloseRequested { .. } => {
                if should_close_subwindows_with(window.label()) {
                    if let Some(cam) = window.get_webview_window("camera-output") {
                        let _ = cam.close();
                    }
                }
            }
            tauri::WindowEvent::Destroyed => {
                if !should_shutdown_server_on_destroy(window.label()) {
                    return;
                }
                #[cfg(not(debug_assertions))]
                if let Some(state) = window.try_state::<NodeProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── mediapipe 설치 완전성 검사 ────────────────────────────────────
    // 회귀 방지: 과거에는 wasm 파일 하나만 검사해서, 모델(.tflite) 다운로드가
    // 중단된 부분 설치 상태를 "설치됨"으로 오판해 다운로드 UI가 다시 뜨지 않았다.

    #[test]
    fn empty_dir_is_not_complete() {
        let dir = std::env::temp_dir().join("arpic_mp_test_empty");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(!mediapipe_files_complete(&dir));
    }

    #[test]
    fn wasm_only_partial_install_is_not_complete() {
        // 모델 파일 없이 wasm만 있는 상태 = 과거 버그 시나리오
        let dir = std::env::temp_dir().join("arpic_mp_test_partial");
        let _ = std::fs::remove_dir_all(&dir);
        for (rel, _) in MEDIAPIPE_FILES.iter().filter(|(r, _)| r.starts_with("wasm/")) {
            let p = dir.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, b"x").unwrap();
        }
        assert!(!mediapipe_files_complete(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn all_files_present_is_complete() {
        let dir = std::env::temp_dir().join("arpic_mp_test_full");
        let _ = std::fs::remove_dir_all(&dir);
        for (rel, _) in MEDIAPIPE_FILES {
            let p = dir.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, b"x").unwrap();
        }
        assert!(mediapipe_files_complete(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_tmp_path_appends_suffix_without_replacing_extension() {
        let js = download_tmp_path(std::path::Path::new("wasm/vision_wasm_internal.js"));
        let wasm = download_tmp_path(std::path::Path::new("wasm/vision_wasm_internal.wasm"));
        assert!(js.to_string_lossy().ends_with("vision_wasm_internal.js.download"));
        assert!(wasm.to_string_lossy().ends_with("vision_wasm_internal.wasm.download"));
        // 확장자만 다른 두 파일의 임시 경로가 충돌하지 않아야 한다
        assert_ne!(js, wasm);
    }

    // ── Node 서버 종료 판단 (창 파괴 이벤트) ──────────────────────────
    // 회귀 방지: 과거에는 어떤 창이든 Destroyed 시 서버를 죽여서,
    // 서브 모니터를 껐다 켜면 앱 전체가 먹통이 되는 버그가 있었다.

    #[test]
    fn main_window_destroy_shuts_down_server() {
        assert!(should_shutdown_server_on_destroy("main"));
    }

    #[test]
    fn camera_output_destroy_keeps_server_alive() {
        // close_camera_window 및 open_camera_window의 기존 창 재생성 시 발생
        assert!(!should_shutdown_server_on_destroy("camera-output"));
    }

    #[test]
    fn unknown_window_destroy_keeps_server_alive() {
        assert!(!should_shutdown_server_on_destroy("some-future-window"));
        assert!(!should_shutdown_server_on_destroy(""));
    }

    // ── 메인 창 종료 시 서브 모니터 창도 함께 닫기(Alt+F4 한 번에 전체 종료) ──────
    // 메인 창이 닫힐 때만 camera-output을 같이 닫아, 서브 창만 남는 좀비 상태를 막는다.

    #[test]
    fn main_close_also_closes_subwindows() {
        assert!(should_close_subwindows_with("main"));
    }

    #[test]
    fn subwindow_close_does_not_close_others() {
        // camera-output 자체가 닫힐 땐 다른 창을 건드리지 않는다.
        assert!(!should_close_subwindows_with("camera-output"));
        assert!(!should_close_subwindows_with("some-future-window"));
        assert!(!should_close_subwindows_with(""));
    }

    #[test]
    fn base64_decode_hello() {
        let decoded = base64_decode("SGVsbG8=").unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn base64_decode_empty() {
        let decoded = base64_decode("").unwrap();
        assert!(decoded.is_empty());
    }

    #[test]
    fn base64_decode_ignores_whitespace() {
        // Base64 chunks with embedded newlines (as received from JS canvas.toDataURL)
        let encoded = "SGVs\nbG8=";
        let decoded = base64_decode(encoded).unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn base64_decode_invalid_char_returns_err() {
        let result = base64_decode("SGVsbG8!"); // '!' is not valid base64
        assert!(result.is_err());
    }

    #[test]
    fn path_forward_slash_has_no_backslash() {
        let win_path = r"C:\Users\test\AppData\Local\Temp\arpic_print_1234.jpg";
        let converted = win_path.replace('\\', "/");
        assert!(!converted.contains('\\'));
        assert_eq!(converted, "C:/Users/test/AppData/Local/Temp/arpic_print_1234.jpg");
    }

    #[test]
    fn old_double_escape_produces_invalid_path() {
        // This documents the previous bug: replacing \ with \\ created C:\\Users\\...
        // which PowerShell passes as a literal double-backslash path to .NET — invalid.
        let win_path = r"C:\Users\file.jpg";
        let buggy = win_path.replace('\\', "\\\\");
        assert!(buggy.contains("\\\\"), "old code produced double backslashes");
        // Fixed path has neither double backslashes nor any backslash
        let fixed = win_path.replace('\\', "/");
        assert!(!fixed.contains('\\'));
    }
}
