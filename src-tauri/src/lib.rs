use std::process::Command;
use tauri::Manager;
use serde::Serialize;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    let current_version = env!("CARGO_PKG_VERSION");

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
            $pd.add_PrintPage({{
                param($sender, $e)
                $e.Graphics.DrawImage($img, $e.MarginBounds)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_image,
            get_cameras,
            save_settings,
            load_settings,
            get_monitors,
            open_camera_window,
            close_camera_window
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    // 최초 실행(또는 버전 변경) 시 embedded zip을 LOCALAPPDATA에 압축 해제
                    let server_dir = prepare_server_dir();
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
                        .current_dir(&server_dir);
                    if let Some(f) = stdout_log { cmd.stdout(f); }
                    if let Some(f) = stderr_log { cmd.stderr(f); }
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    let _ = cmd.spawn();

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

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
