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

fn server_mediapipe_dir() -> std::path::PathBuf {
    ar_pic_dir().join("server").join("public").join("static").join("mediapipe")
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
];

fn mediapipe_url(rel_path: &str) -> String {
    if rel_path.starts_with("wasm/") {
        let file = rel_path.strip_prefix("wasm/").unwrap_or(rel_path);
        format!("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{}/wasm/{}", MEDIAPIPE_VERSION, file)
    } else {
        // model
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

    copy_dir_all(&cache, &server_mediapipe_dir()).map_err(|e| e.to_string())
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
fn print_image(printer_name: String, image_data: String) -> Result<bool, String> {
    use std::io::Write;

    let bytes = base64_decode(&image_data)?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("arpic_print_{}.jpg", std::process::id()));
    let temp_path_str = temp_path.to_string_lossy().to_string();

    {
        let mut file = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let temp_path_forward = temp_path_str.replace('\\', "/");
    let result = print_file(&printer_name, &temp_path_forward);

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

fn print_file(printer_name: &str, file_path: &str) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        // Only set PrinterName when non-empty; empty string causes .NET to throw.
        let set_printer = if printer_name.is_empty() {
            String::new()
        } else {
            format!(r#"$pd.PrinterSettings.PrinterName = "{}""#, printer_name)
        };

        let script = format!(
            r#"
            Add-Type -AssemblyName System.Drawing
            $img = [System.Drawing.Image]::FromFile("{}")
            $pd = New-Object System.Drawing.Printing.PrintDocument
            {}
            if ($img.Width -gt $img.Height) {{
                $pd.DefaultPageSettings.Landscape = $true
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
            file_path,
            set_printer
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
        let output = Command::new("lp")
            .args(["-d", printer_name, file_path])
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
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_fullscreen(&window);
                        }
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
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};
            if let Err(e) = app
                .handle()
                .global_shortcut()
                .register(Shortcut::new(None, Code::F11))
            {
                eprintln!("F11 전역 단축키 등록 실패 (웹뷰 폴백 사용): {e}");
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
                    let node_exe = server_dir.join("node.exe");
                    let server_js = server_dir.join("server.js");

                    let log_base = dirs::data_local_dir()
                        .unwrap_or_else(|| std::path::PathBuf::from("."))
                        .join("ar-pic");
                    let stdout_log = std::fs::File::create(log_base.join("server-stdout.log")).ok();
                    let stderr_log = std::fs::File::create(log_base.join("server-stderr.log")).ok();

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

                    let mut cmd = std::process::Command::new(&node_exe);
                    cmd.arg(&server_js)
                        .env("PORT", "3001")
                        .env("HOSTNAME", "127.0.0.1")
                        .current_dir(&server_dir);
                    if let Some(f) = stdout_log { cmd.stdout(f); }
                    if let Some(f) = stderr_log { cmd.stderr(f); }
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    if let Ok(child) = cmd.spawn() {
                        if let Some(state) = app_handle.try_state::<NodeProcess>() {
                            *state.0.lock().unwrap() = Some(child);
                        }
                    }

                    // 포트가 열릴 때까지 폴링 (최대 60초)
                    for _ in 0..120 {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        if std::net::TcpStream::connect("127.0.0.1:3001").is_ok() {
                            break;
                        }
                    }
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        // 서버 준비 전 webview가 ERR_CONNECTION_REFUSED를 로드했을 수 있으므로 리로드
                        let _ = window.reload();
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
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
