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

// ── 스플래시(시작 화면) ─────────────────────────────────────────────────────
// 첫 실행은 server.zip 압축 해제(약 240MB·1,800여 개 파일 + 백신 실시간 검사)와
// Node 서버 기동 때문에 수 분이 걸릴 수 있다. 예전에는 그동안 창이 아예 뜨지 않아
// 사용자에게는 "더블클릭했는데 아무 일도 안 일어남"으로 보였다.
// 준비가 끝날 때까지 별도의 스플래시 창을 띄워 현재 단계와 진행률을 보여준다.

#[cfg_attr(debug_assertions, allow(dead_code))]
const SPLASH_LABEL: &str = "splash";
#[cfg_attr(debug_assertions, allow(dead_code))]
const SPLASH_HTML: &str = include_str!("../splash.html");

/// 스플래시 HTML을 앱 데이터 폴더에 쓰고 file:// URL을 돌려준다.
/// (frontendDist가 http://127.0.0.1:3001 이라 Next 서버가 뜨기 전에는
///  앱 내부 경로로 어떤 화면도 띄울 수 없다 — 로컬 파일이 유일한 수단이다.)
#[cfg_attr(debug_assertions, allow(dead_code))]
fn write_splash_file() -> Option<tauri::Url> {
    let dir = ar_pic_dir();
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join("splash.html");
    std::fs::write(&path, SPLASH_HTML).ok()?;
    // 한글 사용자명 등 비ASCII 경로도 안전하게 인코딩된다.
    tauri::Url::from_file_path(&path).ok()
}

/// 스플래시 창에 상태를 전달하는 핸들.
/// IPC(invoke/emit)가 아니라 eval을 쓴다 — file:// 문서에는 IPC 권한이 없지만
/// 호스트→웹뷰 스크립트 주입은 권한 설정 없이 항상 동작한다.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Clone)]
struct Splash(Option<tauri::WebviewWindow>);

#[cfg_attr(debug_assertions, allow(dead_code))]
impl Splash {
    fn call(&self, js: String) {
        if let Some(w) = &self.0 {
            let _ = w.eval(js);
        }
    }

    /// 진행률을 알 수 없는 단계. 막대가 흐르며 "살아 있음"을 보여준다.
    fn stage(&self, text: &str) {
        self.call(format!(
            "window.__arpic && window.__arpic.stage({})",
            json_str(text)
        ));
    }

    fn stage_with_progress(&self, text: &str, pct: u8) {
        self.call(format!(
            "window.__arpic && window.__arpic.stage({}, {})",
            json_str(text),
            pct
        ));
    }

    fn progress(&self, pct: u8) {
        self.call(format!("window.__arpic && window.__arpic.progress({pct})"));
    }

    fn error(&self, message: &str, hint: &str) {
        self.call(format!(
            "window.__arpic && window.__arpic.error({}, {})",
            json_str(message),
            json_str(hint)
        ));
    }

    fn close(&self) {
        if let Some(w) = &self.0 {
            let _ = w.close();
        }
    }
}

/// eval에 문자열을 넣기 위한 JSON 리터럴 변환(따옴표·개행 이스케이프).
#[cfg_attr(debug_assertions, allow(dead_code))]
fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
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
    wait_for_server_port_with(max_iters, |_| {})
}

/// 위와 같되 매 폴링마다 경과 초를 콜백으로 알린다(스플래시의 "n초" 표시용).
fn wait_for_server_port_with<F: FnMut(u32)>(max_iters: u32, mut on_tick: F) -> bool {
    for i in 0..max_iters {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if std::net::TcpStream::connect("127.0.0.1:3001").is_ok() {
            return true;
        }
        on_tick((i + 1) / 2);
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
#[tauri::command(async)]
fn mediapipe_is_installed() -> bool {
    if cfg!(debug_assertions) {
        return true; // dev 모드: Next.js dev server가 public/에서 직접 서빙
    }
    mediapipe_files_complete(&server_mediapipe_dir())
}

/// mediapipe를 CDN에서 다운로드 후 서버 디렉터리에 설치
/// 진행 상황을 "mediapipe-progress" 이벤트로 전송 { done: n, total: N }
#[tauri::command(async)]
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

/// node.exe가 실행할 진입점. 둘 중 하나라도 없으면 서버는 뜰 수 없다.
/// (prepare-tauri.mjs도 압축 전후로 같은 목록을 검사한다)
#[cfg_attr(debug_assertions, allow(dead_code))]
const REQUIRED_SERVER_FILES: &[&str] = &["server.js", "node.exe"];

/// 번들 루트에 필수 파일이 모두 있는지 확인하고, 없으면 무엇이 없는지 알려준다.
///
/// 회귀 방지: standalone 출력이 중첩되면 server.js만 빠진 번들이 만들어지는데,
/// 예전에는 이걸 못 걸러 node.exe가 MODULE_NOT_FOUND로 즉시 죽고 앱은
/// 90초를 기다린 끝에 "서버가 응답하지 않습니다"라는 엉뚱한 메시지를 띄웠다.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn missing_server_files(server_dir: &std::path::Path) -> Vec<&'static str> {
    REQUIRED_SERVER_FILES
        .iter()
        .copied()
        .filter(|f| !server_dir.join(f).exists())
        .collect()
}

/// 임베드된 server.zip을 진행률을 보고하며 푼다.
/// zip 크레이트의 `extract()`는 통째로 돌기 때문에 진행 상황을 알 수 없어,
/// 항목별로 직접 풀면서 "푼 바이트 / 전체 바이트" 비율을 콜백으로 넘긴다.
/// (파일 개수 기준으로는 node.exe 하나가 전체의 절반이라 진행률이 심하게 튄다)
#[cfg(not(debug_assertions))]
fn extract_server_archive<F: FnMut(u8)>(
    server_dir: &std::path::Path,
    mut on_progress: F,
) -> zip::result::ZipResult<()> {
    use std::io::Cursor;

    let mut archive = zip::ZipArchive::new(Cursor::new(SERVER_ARCHIVE))?;
    let count = archive.len();

    // 1차 패스: 전체 해제 크기. 메모리상의 아카이브라 로컬 헤더만 읽고 지나간다.
    let mut total: u64 = 0;
    for i in 0..count {
        total += archive.by_index_raw(i)?.size();
    }
    let total = total.max(1);

    let mut written: u64 = 0;
    let mut last_pct: u8 = u8::MAX;

    for i in 0..count {
        let mut entry = archive.by_index(i)?;
        // enclosed_name()은 `..` 등 상위 경로 탈출을 걸러낸다.
        // 걸러진 항목을 조용히 건너뛰면 파일이 빠진 채로 "정상 해제"가 되어,
        // 한참 뒤 서버 기동 실패로만 드러난다. 그냥 실패시킨다.
        let Some(rel) = entry.enclosed_name() else {
            return Err(zip::result::ZipError::InvalidArchive(
                "아카이브에 허용되지 않는 경로가 있습니다".into(),
            ));
        };
        let out = server_dir.join(rel);

        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut dst = std::fs::File::create(&out)?;
            std::io::copy(&mut entry, &mut dst)?;
            written += entry.size();
        }

        // eval은 메인 스레드로 디스패치되므로 1,800여 번 부르면 이벤트 루프가 막힌다.
        // 정수 퍼센트가 바뀔 때만(최대 101회) 보고한다.
        let pct = ((written * 100) / total).min(100) as u8;
        if pct != last_pct {
            last_pct = pct;
            on_progress(pct);
        }
    }

    Ok(())
}

/// Extracts the embedded server archive to %LOCALAPPDATA%\ar-pic\server on first run
/// (or when the app version changes). Returns the path to the extracted server directory.
#[cfg(not(debug_assertions))]
fn prepare_server_dir(splash: &Splash) -> Result<std::path::PathBuf, String> {
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
        splash.stage_with_progress("앱 파일 준비 중", 0);
        if server_dir.exists() {
            splash.stage("이전 버전 정리 중");
            std::fs::remove_dir_all(&server_dir).ok();
        }
        std::fs::create_dir_all(&server_dir).map_err(|e| format!("server 디렉터리 생성 실패: {e}"))?;

        splash.stage_with_progress("앱 파일 준비 중", 0);
        extract_server_archive(&server_dir, |pct| splash.progress(pct))
            .map_err(|e| format!("서버 파일 압축 해제 실패: {e}"))?;

        // 버전 파일은 "이 번들은 정상 설치됨" 표식이다. 필수 파일이 빠졌다면
        // 기록하지 않아야 다음 실행에서 다시 풀어볼 기회가 생긴다.
        let missing = missing_server_files(&server_dir);
        if !missing.is_empty() {
            return Err(format!(
                "서버 파일이 불완전합니다 (없음: {}). 앱을 다시 설치해 주세요.",
                missing.join(", ")
            ));
        }

        if let Err(e) = std::fs::write(&version_file, current_version) {
            // 실패해도 이번 실행은 진행하되, 다음 실행에서 또 몇 분을 쓰게 되므로
            // 로그에는 남긴다(매 실행이 느린 증상의 원인이 된다).
            eprintln!("버전 파일 기록 실패 — 다음 실행에서 다시 압축을 해제합니다: {e}");
        }
    }

    // 압축 해제를 건너뛴 경우(버전 일치)에도 확인한다 — 백신 격리나 수동 삭제로
    // 파일이 사라졌는데 .version만 남아 있으면 영영 다시 풀리지 않는다.
    let missing = missing_server_files(&server_dir);
    if !missing.is_empty() {
        let _ = std::fs::remove_file(&version_file);
        return Err(format!(
            "서버 파일이 사라졌습니다 (없음: {}). 앱을 다시 시작하면 복구를 시도합니다.",
            missing.join(", ")
        ));
    }

    // 캐시된 mediapipe가 있으면 서버 디렉터리에 복사 (오프라인 재실행 지원)
    // 대상이 불완전하면(과거 부분 다운로드 등) 캐시에서 다시 채운다.
    let mp_cache = mediapipe_cache_dir();
    if mp_cache.exists() {
        let mp_dest = server_dir.join("public").join("static").join("mediapipe");
        if !mediapipe_files_complete(&mp_dest) {
            splash.stage("AI 모델 복원 중");
            let _ = copy_dir_all(&mp_cache, &mp_dest);
        }
    }

    Ok(server_dir)
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

#[tauri::command(async)]
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

#[tauri::command(async)]
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

/// 용지 종류를 "사진 용지(광택)"으로 지정하는 PowerShell 조각.
///
/// System.Drawing.Printing에는 용지 종류 API가 없다(PaperSize는 크기일 뿐이다).
/// 용지 종류는 DEVMODE의 dmMediaType에만 있고, 이 값이 지정되지 않으면 드라이버
/// 기본값인 "일반 용지"로 인쇄되어 포토 프린터에서 화질이 눈에 띄게 떨어진다.
///
/// 번호를 하드코딩하지 않고 DeviceCapabilities로 드라이버가 제공하는 목록을 받아
/// 이름으로 고른다 — 포토 프린터 대부분은 표준값(DMMEDIA_GLOSSY=3) 대신 256 이상의
/// 자체 번호를 쓰기 때문에, 하드코딩하면 프린터를 바꾸는 순간 조용히 틀어진다.
///
/// 전부 best-effort다. 실패해도 인쇄 자체는 드라이버 기본 용지로 진행된다 —
/// 키오스크에서 화질 설정 때문에 인쇄가 아예 안 되는 쪽이 더 나쁘다.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const SET_MEDIA_TYPE_PS: &str = r#"
            try {
                Add-Type @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct ARPIC_DEVMODE {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
  public ushort dmSpecVersion; public ushort dmDriverVersion; public ushort dmSize; public ushort dmDriverExtra;
  public uint dmFields;
  public short dmOrientation; public short dmPaperSize; public short dmPaperLength; public short dmPaperWidth;
  public short dmScale; public short dmCopies; public short dmDefaultSource; public short dmPrintQuality;
  public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
  public ushort dmLogPixels; public uint dmBitsPerPel; public uint dmPelsWidth; public uint dmPelsHeight;
  public uint dmDisplayFlags; public uint dmDisplayFrequency; public uint dmICMMethod; public uint dmICMIntent;
  public uint dmMediaType; public uint dmDitherType; public uint dmReserved1; public uint dmReserved2;
  public uint dmPanningWidth; public uint dmPanningHeight;
}
public class ArPicPrint {
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
  public static extern int DeviceCapabilities(string device, string port, short cap, IntPtr output, IntPtr devmode);
  [DllImport("kernel32.dll")] public static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] public static extern bool GlobalUnlock(IntPtr h);
  [DllImport("kernel32.dll")] public static extern IntPtr GlobalFree(IntPtr h);
}
"@ -ErrorAction SilentlyContinue

                # wingdi.h 값. 두 상수를 바꿔 쓰면 이름 목록(항목당 128바이트)이
                # DWORD 버퍼(항목당 4바이트)에 쓰여 힙이 깨지고 프로세스가 즉사한다
                # (STATUS_HEAP_CORRUPTION 0xC0000374). 실제로 그렇게 인쇄가 멎었다.
                $DC_MEDIATYPENAMES = 34   # 항목당 64 WCHAR = 128바이트 문자열 버퍼
                $DC_MEDIATYPES     = 35   # 항목당 DWORD = 4바이트
                $DM_MEDIATYPE = 0x10000000
                $DMMEDIA_GLOSSY = 3

                $mediaId = $null
                $prn = $pd.PrinterSettings.PrinterName
                if ([string]::IsNullOrEmpty($prn)) { throw "printer name is empty" }

                # 두 목록의 개수를 각각 따로 받는다. 하나의 개수로 두 버퍼를 재면
                # 드라이버가 다르게 보고할 때 다시 같은 종류의 오버플로가 난다.
                $nTypes = [ArPicPrint]::DeviceCapabilities($prn, $null, $DC_MEDIATYPES, [IntPtr]::Zero, [IntPtr]::Zero)
                $nNames = [ArPicPrint]::DeviceCapabilities($prn, $null, $DC_MEDIATYPENAMES, [IntPtr]::Zero, [IntPtr]::Zero)
                # -1은 실패, 0은 미지원. 비정상적으로 큰 값도 방어한다.
                if ($nTypes -gt 0 -and $nNames -gt 0 -and $nTypes -le 512 -and $nNames -le 512) {
                    $idBuf   = [Runtime.InteropServices.Marshal]::AllocHGlobal(4 * $nTypes)
                    $nameBuf = [Runtime.InteropServices.Marshal]::AllocHGlobal(128 * $nNames)
                    try {
                        [void][ArPicPrint]::DeviceCapabilities($prn, $null, $DC_MEDIATYPES, $idBuf, [IntPtr]::Zero)
                        [void][ArPicPrint]::DeviceCapabilities($prn, $null, $DC_MEDIATYPENAMES, $nameBuf, [IntPtr]::Zero)
                        $ids = New-Object int[] $nTypes
                        [Runtime.InteropServices.Marshal]::Copy($idBuf, $ids, 0, $nTypes)

                        # 두 목록은 같은 순서로 대응한다. 개수가 어긋나면 작은 쪽까지만 본다.
                        $count = [Math]::Min($nTypes, $nNames)

                        # 광택(2점) > 사진(1점). 같은 점수면 먼저 나온 항목을 쓴다.
                        $bestScore = 0
                        $mediaName = $null
                        $allNames = @()
                        for ($i = 0; $i -lt $count; $i++) {
                            # 이름은 "64자를 다 채우면 널 종료가 없다". 길이를 주지 않으면
                            # 다음 항목까지 읽어버리므로 64자를 읽고 첫 널에서 자른다.
                            $raw = [Runtime.InteropServices.Marshal]::PtrToStringUni([IntPtr]::Add($nameBuf, $i * 128), 64)
                            $nm = $raw.Split([char]0)[0]
                            $allNames += "$($ids[$i])=$nm"
                            $score = 0
                            if ($nm -match '광택|[Gg]loss') { $score = 2 }
                            elseif ($nm -match '사진|인화|[Pp]hoto') { $score = 1 }
                            if ($score -gt $bestScore) { $bestScore = $score; $mediaId = $ids[$i]; $mediaName = $nm }
                        }
                        # 이름이 안 잡히면 표준 광택값이 목록에 있을 때만 쓴다.
                        if ($mediaId -eq $null -and ($ids -contains $DMMEDIA_GLOSSY)) {
                            $mediaId = $DMMEDIA_GLOSSY
                            $mediaName = 'DMMEDIA_GLOSSY'
                        }
                        # 드라이버가 제공하는 전체 목록을 로그에 남긴다. 원하는 용지가 안 잡힐 때
                        # 실제 이름을 알아야 매칭 규칙을 고칠 수 있다.
                        Write-Host "media types: $($allNames -join ' | ')"
                        Write-Host "media selected: $mediaName ($mediaId)"
                    } finally {
                        [Runtime.InteropServices.Marshal]::FreeHGlobal($idBuf)
                        [Runtime.InteropServices.Marshal]::FreeHGlobal($nameBuf)
                    }
                }

                if ($mediaId -ne $null) {
                    $hDev = $pd.PrinterSettings.GetHdevmode($pd.DefaultPageSettings)
                    $ptr = [ArPicPrint]::GlobalLock($hDev)
                    $dm = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][ARPIC_DEVMODE])
                    # 드라이버의 DEVMODE가 우리 구조체보다 작으면 뒤쪽 드라이버 전용
                    # 영역을 덮어쓰게 되므로 건드리지 않는다.
                    if ($dm.dmSize -ge [Runtime.InteropServices.Marshal]::SizeOf([Type][ARPIC_DEVMODE])) {
                        $dm.dmMediaType = [uint32]$mediaId
                        $dm.dmFields = [uint32]($dm.dmFields -bor $DM_MEDIATYPE)
                        # fDeleteOld=$false: 구조체 뒤에 붙은 드라이버 전용 데이터를 보존한다.
                        [Runtime.InteropServices.Marshal]::StructureToPtr($dm, $ptr, $false)
                        [void][ArPicPrint]::GlobalUnlock($hDev)
                        $pd.PrinterSettings.SetHdevmode($hDev)
                        $pd.DefaultPageSettings.SetHdevmode($hDev)
                    } else {
                        [void][ArPicPrint]::GlobalUnlock($hDev)
                    }
                    [void][ArPicPrint]::GlobalFree($hDev)
                }
            } catch {
                # 용지 종류 지정 실패는 인쇄를 막지 않는다. 다만 왜 실패했는지는 로그에 남긴다 —
                # 조용히 넘어가면 "왜 아직도 일반 용지로 나오지"를 추적할 수 없다.
                Write-Host "media type skipped: $($_.Exception.Message)"
            }
"#;

/// 인쇄용 PowerShell 스크립트를 만든다.
///
/// Windows 전용 분기 밖에 둔다 — 안에 두면 다른 OS에서는 컴파일조차 되지 않아
/// format! 자리표시자 오타 같은 실수가 Windows 빌드에서야 드러난다.
/// 덕분에 생성 결과를 단위 테스트로 검증할 수도 있다.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn build_print_script(
    printer_name: &str,
    file_path: &str,
    copies: u32,
    paper_mm: Option<(f64, f64)>,
) -> String {
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
            # 스크립트 전역을 'Stop'으로 두지 않는다. 준비 단계(용지 크기·방향 지정 등)에서
            # 드라이버에 따라 비치명적 오류가 나는데, 예전에는 그게 무시되고도 인쇄는 정상이었다.
            # 전역 Stop으로 바꿨더니 그 오류들이 인쇄 전체를 중단시켰다(= "Print failed:" 뒤가 빈 화면).
            # 대신 실제 인쇄 호출만 아래에서 try/catch로 엄격하게 본다.
            $ErrorActionPreference = 'Continue'
            Add-Type -AssemblyName System.Drawing
            $img = [System.Drawing.Image]::FromFile("{file_path}")
            $pd = New-Object System.Drawing.Printing.PrintDocument
            # 기본 PrintController(PrintControllerWithStatusDialog)는 인쇄 중
            # "페이지 인쇄 중..." 상태 대화상자를 포그라운드로 띄운다. 키오스크에서는
            # 이 창이 우측 하단에 보이고, 포그라운드를 뺏겨 풀스크린 창이 흐트러지면서
            # 화면 위아래로 바탕화면이 드러난다. StandardPrintController로 무음 인쇄한다.
            $pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController
            {set_printer}
            # 용지 종류(사진 용지/광택)를 먼저 잡는다. SetHdevmode가 PrinterSettings/
            # DefaultPageSettings를 DEVMODE 값으로 되돌리므로, 매수·용지 크기·방향 같은
            # .NET 쪽 설정은 모두 이 뒤에 적용해야 덮어써지지 않는다.
            {set_media_type}
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
            # 실제 인쇄만 엄격하게 본다. 여기서 던지면 진짜 실패이므로 메시지를 남기고 1로 종료한다.
            # (준비 단계의 비치명적 경고 때문에 인쇄가 막히는 일은 없어야 한다)
            try {{
                $pd.Print()
                Write-Host "print: submitted to '$($pd.PrinterSettings.PrinterName)'"
            }} catch {{
                [Console]::Error.WriteLine("print failed: " + $_.Exception.ToString())
                $img.Dispose()
                exit 1
            }}
            $img.Dispose()
            "#,
            file_path = file_path,
            set_printer = set_printer,
            set_media_type = SET_MEDIA_TYPE_PS,
            copies = copies,
            set_paper = set_paper,
        );

        script
    }
}

fn print_file(
    printer_name: &str,
    file_path: &str,
    copies: u32,
    paper_mm: Option<(f64, f64)>,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let script = build_print_script(printer_name, file_path, copies, paper_mm);

        // 스크립트를 임시 .ps1로 쓰고 -File로 실행한다.
        // -Command로 넘기면 (1) 인용부호가 많은 C#/here-string이 셸 이스케이프를
        // 거치며 깨질 수 있고, (2) 더 중요하게는 한글이 살아남지 못한다.
        // 용지 종류를 이름('광택')으로 고르므로 인코딩이 깨지면 매칭이 조용히 실패한다.
        //
        // UTF-8 BOM 필수: Windows PowerShell 5.1은 BOM 없는 .ps1을 시스템 ANSI
        // 코드페이지로 읽어 한글을 깨뜨린다. (prepare-tauri.mjs의 압축 스크립트에서
        // 같은 이유로 BOM을 붙인다)
        let ps1_path = std::env::temp_dir().join(format!("arpic_print_{}.ps1", std::process::id()));
        let mut bytes = Vec::with_capacity(script.len() + 3);
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        bytes.extend_from_slice(script.as_bytes());
        std::fs::write(&ps1_path, &bytes).map_err(|e| e.to_string())?;

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                &ps1_path.to_string_lossy(),
            ])
            .creation_flags(0x08000000)
            .output();

        let output = output.map_err(|e| e.to_string())?;

        // 인쇄 로그. 예전에는 stdout/stderr를 그냥 버려서, 실패해도 화면에
        // "Print failed:" 뒤가 빈 문자열로만 남고 단서가 아무데도 없었다.
        // 드라이버가 제공하는 용지 종류 목록도 여기 찍히므로 매칭 확인에 쓸 수 있다.
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let code = output.status.code();
        let log = format!(
            "exit: {code:?}\nprinter: {printer_name}\ncopies: {copies}\npaper_mm: {paper_mm:?}\n\
             --- stdout ---\n{stdout}\n--- stderr ---\n{stderr}\n"
        );
        let _ = std::fs::write(ar_pic_dir().join("print.log"), &log);

        if output.status.success() {
            let _ = std::fs::remove_file(&ps1_path);
            Ok(true)
        } else {
            // 실패 시 .ps1을 남긴다 — 그대로 다시 실행해 보며 원인을 좁힐 수 있다.
            let detail = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                // 둘 다 비어 있던 것이 지금까지 원인 파악을 막던 상황이다.
                format!(
                    "PowerShell이 코드 {code:?}로 종료했고 출력이 없습니다. 스크립트: {}",
                    ps1_path.display()
                )
            };
            Err(format!("Print failed: {detail}"))
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

#[tauri::command(async)]
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

/// Node 서버를 종료하고 실제로 죽을 때까지 기다린다.
///
/// Windows의 kill()은 TerminateProcess를 "요청"만 하고 즉시 반환한다.
/// wait() 없이 앱 프로세스가 먼저 사라지면 node.exe가 3001 포트를 쥔 채
/// 고아로 남아, 다음 실행이 포트 정리에 시간을 쓰거나 아예 막힌다.
///
/// Mutex에서 child를 꺼내가므로 여러 번 불러도 안전하다(멱등) —
/// 창 파괴와 앱 종료 양쪽에서 부르기 때문에 이 성질이 필요하다.
#[cfg(not(debug_assertions))]
fn shutdown_node_server(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<NodeProcess>() else {
        return;
    };
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
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

            // dev 모드에서는 Next dev 서버(devUrl)가 바로 화면을 채우므로
            // 준비 절차 없이 창을 띄운다. (config의 visible:false를 여기서 해제)
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // 프로덕션 빌드에서만 임베디드 Next.js 서버 시작
            #[cfg(not(debug_assertions))]
            {
                app.manage(NodeProcess(Mutex::new(None)));

                // 준비가 끝날 때까지 사용자가 볼 화면. 메인 창은 서버가 없으면
                // ERR_CONNECTION_REFUSED 오류 페이지를 그리므로, 처음부터
                // splash.html을 가리키는 별도 창을 만들어 그것만 보여준다.
                let splash = {
                    use tauri::webview::WebviewWindowBuilder;
                    use tauri::WebviewUrl;

                    let window = write_splash_file().and_then(|url| {
                        WebviewWindowBuilder::new(app, SPLASH_LABEL, WebviewUrl::External(url))
                            .title("AR-pic")
                            .inner_size(1920.0, 1080.0)
                            .decorations(false)
                            .fullscreen(true)
                            .always_on_top(true)
                            .build()
                            .ok()
                    });
                    if window.is_none() {
                        eprintln!("스플래시 창 생성 실패 — 준비 화면 없이 진행합니다");
                    }
                    Splash(window)
                };

                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    let server_dir = match prepare_server_dir(&splash) {
                        Ok(dir) => dir,
                        Err(e) => {
                            splash.error(
                                &format!("앱 파일을 준비하지 못했습니다.\n{e}"),
                                "앱을 다시 시작해도 같은 문제가 반복되면 재설치가 필요합니다.",
                            );
                            return;
                        }
                    };

                    // 이전 인스턴스가 3001 포트를 점유하고 있으면 종료
                    #[cfg(target_os = "windows")]
                    {
                        splash.stage("이전 실행 정리 중");
                        let _ = Command::new("powershell")
                            .args(["-NoProfile", "-NonInteractive", "-Command",
                                "$p=(Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}"])
                            .creation_flags(0x08000000)
                            .status();
                        std::thread::sleep(std::time::Duration::from_millis(300));
                    }

                    splash.stage("서버 시작 중");
                    match spawn_node_server(&server_dir) {
                        Ok(child) => {
                            if let Some(state) = app_handle.try_state::<NodeProcess>() {
                                *state.0.lock().unwrap() = Some(child);
                            }
                        }
                        Err(e) => {
                            // 예전에는 이 실패를 조용히 무시해, 60초 뒤 흰 화면만 남았다.
                            splash.error(
                                &format!("서버를 시작하지 못했습니다.\n{e}"),
                                "앱을 다시 시작해 주세요.",
                            );
                            return;
                        }
                    }

                    // 포트가 열릴 때까지 폴링 (최대 90초).
                    // 백신 검사가 걸린 첫 실행에서는 Node 기동만으로 1분을 넘기기도 한다.
                    let ready = wait_for_server_port_with(180, |secs| {
                        splash.stage(&format!("서버 시작 중 ({secs}초)"));
                    });

                    if !ready {
                        let log = ar_pic_dir().join("server-stderr.log");
                        splash.error(
                            "서버가 응답하지 않습니다.",
                            &format!("로그: {}", log.display()),
                        );
                        return;
                    }

                    if let Some(window) = app_handle.get_webview_window("main") {
                        // 서버 준비 전 초기 내비게이션이 ERR_CONNECTION_REFUSED로 실패했을 수 있는데,
                        // reload()는 실패한(문서 없는) 상태를 복구하지 못해 흰 화면이 남는다.
                        // 준비된 서버 URL로 명시적으로 새 내비게이션을 수행한다(reload는 폴백).
                        match "http://127.0.0.1:3001/".parse() {
                            Ok(url) => { let _ = window.navigate(url); }
                            Err(_) => { let _ = window.reload(); }
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    // 메인 창을 먼저 띄운 뒤 닫는다 — 순서가 반대면 그 사이에 바탕화면이 드러난다.
                    splash.close();
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
                // 준비가 끝나기 전(메인 창이 아직 안 보일 때) 스플래시를 Alt+F4로 닫으면
                // 보이는 창이 하나도 없는 채 프로세스만 남는다 → 그 경우는 앱을 종료한다.
                // 준비 완료 후 우리가 닫을 때는 메인 창이 이미 보이므로 해당되지 않는다.
                #[cfg(not(debug_assertions))]
                if window.label() == SPLASH_LABEL {
                    let main_visible = window
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);
                    if !main_visible {
                        window.app_handle().exit(0);
                    }
                    return;
                }

                if !should_shutdown_server_on_destroy(window.label()) {
                    return;
                }
                #[cfg(not(debug_assertions))]
                shutdown_node_server(window.app_handle());
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // 종료 경로 안전망. 위 Destroyed 훅은 메인 창이 파괴될 때만 도는데,
            // app.exit()(스플래시 단계 Alt+F4)이나 마지막 창이 닫혀 끝나는 경로 등
            // 그걸 거치지 않는 종료가 있다. 그런 경우 node.exe가 3001 포트를 쥔 채
            // 고아로 남아 다음 실행을 방해한다.
            // shutdown_node_server는 멱등이라 Destroyed에서 이미 정리됐으면 아무 일도 안 한다.
            #[cfg(not(debug_assertions))]
            if let tauri::RunEvent::ExitRequested { .. } = _event {
                shutdown_node_server(_app_handle);
            }
        });
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

    // ── 스플래시 eval 문자열 ─────────────────────────────────────────────
    // 스플래시에 띄우는 오류 메시지에는 Windows 경로(역슬래시)와 OS 오류 문구가
    // 그대로 들어간다. 이스케이프가 없으면 eval하는 JS 리터럴이 깨져 화면이
    // 빈 채로 멈춘다 — 정작 문제를 알려야 할 순간에 아무것도 못 보여주게 된다.

    // ── 인쇄 스크립트 생성 ──────────────────────────────────────────────
    // 용지 종류(사진 용지/광택)를 지정하지 않으면 드라이버 기본값인 "일반 용지"로
    // 인쇄되어 포토 프린터에서 화질이 눈에 띄게 떨어진다.

    // 회귀 방지: DC_MEDIATYPENAMES(34)와 DC_MEDIATYPES(35)를 바꿔 쓰면, 항목당 128바이트인
    // 이름 목록을 항목당 4바이트인 DWORD 버퍼에 쓰게 되어 힙이 깨지고 PowerShell이
    // STATUS_HEAP_CORRUPTION(0xC0000374)으로 즉사한다. 실제로 그렇게 인쇄가 완전히 멎었고,
    // 프로세스가 죽어 stdout/stderr가 비어 원인 추적도 막혔다.
    #[test]
    fn device_capabilities_constants_are_not_swapped() {
        let s = build_print_script("EPSON L18050 Series", "C:/x.jpg", 1, None);
        assert!(
            s.contains("$DC_MEDIATYPENAMES = 34"),
            "DC_MEDIATYPENAMES는 34여야 한다(wingdi.h)"
        );
        assert!(
            s.contains("$DC_MEDIATYPES     = 35"),
            "DC_MEDIATYPES는 35여야 한다(wingdi.h)"
        );
        // 이름 버퍼는 항목당 128바이트(64 WCHAR), 값 버퍼는 항목당 4바이트여야 한다.
        assert!(s.contains("AllocHGlobal(128 * $nNames)"));
        assert!(s.contains("AllocHGlobal(4 * $nTypes)"));
    }

    // 이름은 64자를 다 채우면 널 종료가 없다 → 길이를 주지 않으면 다음 항목까지 읽는다.
    #[test]
    fn media_type_names_are_read_with_fixed_length() {
        let s = build_print_script("EPSON L18050 Series", "C:/x.jpg", 1, None);
        assert!(s.contains("PtrToStringUni([IntPtr]::Add($nameBuf, $i * 128), 64)"));
        assert!(s.contains("Split([char]0)[0]"));
    }

    #[test]
    fn print_script_requests_photo_glossy_media() {
        let s = build_print_script("Canon SELPHY", "C:/x.jpg", 1, None);
        // dmMediaType에 값을 넣고 DM_MEDIATYPE 비트를 세워야 드라이버가 인식한다.
        assert!(s.contains("dmMediaType"));
        assert!(s.contains("DM_MEDIATYPE"));
        // 번호는 드라이버마다 다르므로 이름으로 고른다.
        assert!(s.contains("광택") && s.contains("[Gg]loss"));
    }

    // 회귀 방지: SetHdevmode는 PrinterSettings/DefaultPageSettings를 DEVMODE 값으로
    // 되돌린다. 매수·용지 크기를 그보다 먼저 설정하면 조용히 덮어써진다.
    #[test]
    fn media_type_is_applied_before_dotnet_side_settings() {
        let s = build_print_script("Canon SELPHY", "C:/x.jpg", 3, Some((102.0, 152.0)));
        let set_hdevmode = s.find("SetHdevmode").expect("SetHdevmode 호출이 없다");
        let copies = s
            .find("$pd.PrinterSettings.Copies")
            .expect("Copies 설정이 없다");
        let paper = s
            .find("$pd.DefaultPageSettings.PaperSize")
            .expect("PaperSize 설정이 없다");
        assert!(set_hdevmode < copies, "매수가 DEVMODE 적용보다 먼저다");
        assert!(set_hdevmode < paper, "용지 크기가 DEVMODE 적용보다 먼저다");
    }

    #[test]
    fn paper_size_is_converted_to_hundredths_of_inch() {
        // 4x6인치 인화지(102x152mm) → 402 x 598 (1/100 inch)
        let s = build_print_script("", "C:/x.jpg", 1, Some((102.0, 152.0)));
        assert!(s.contains(r#"PaperSize("Custom", 402, 598)"#), "{s}");
    }

    #[test]
    fn empty_printer_name_is_not_assigned() {
        // 빈 문자열을 PrinterName에 넣으면 .NET이 예외를 던진다 → 기본 프린터를 쓴다.
        let s = build_print_script("", "C:/x.jpg", 1, None);
        assert!(!s.contains("PrinterSettings.PrinterName ="));
    }

    // 회귀 방지: 전역 'Stop'으로 두면 준비 단계(용지 크기 지정 등)의 비치명적 오류가
    // 인쇄 전체를 중단시킨다. 실제로 그렇게 해서 프린트가 아예 안 되는 상태가 됐었다.
    // 엄격한 검사는 $pd.Print() 호출에만 건다.
    #[test]
    fn setup_warnings_do_not_abort_printing() {
        let s = build_print_script("", "C:/x.jpg", 1, Some((102.0, 152.0)));
        assert!(s.contains("$ErrorActionPreference = 'Continue'"));
        assert!(!s.contains("$ErrorActionPreference = 'Stop'"));
    }

    #[test]
    fn print_call_itself_reports_failure() {
        let s = build_print_script("", "C:/x.jpg", 1, None);
        let print_at = s.find("$pd.Print()").expect("Print 호출이 없다");
        // Print 호출은 try 안에 있어야 하고, 실패 시 메시지를 남기고 1로 종료해야 한다.
        assert!(s[..print_at].contains("try {"));
        assert!(s.contains("[Console]::Error.WriteLine"));
        assert!(s.contains("exit 1"));
    }

    // ── 번들 완전성 검사 ────────────────────────────────────────────────
    // 회귀 방지: standalone 출력이 중첩되면 node.exe는 루트에 있는데 server.js만
    // 빠진 번들이 만들어진다. 그 상태로 node를 띄우면 MODULE_NOT_FOUND로 즉시
    // 죽고, 앱은 90초를 기다린 끝에 "서버가 응답하지 않습니다"라고만 표시했다.

    #[test]
    fn missing_server_js_is_reported() {
        let dir = std::env::temp_dir().join("arpic_bundle_no_serverjs");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("node.exe"), b"x").unwrap();
        assert_eq!(missing_server_files(&dir), vec!["server.js"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_bundle_reports_every_required_file() {
        let dir = std::env::temp_dir().join("arpic_bundle_empty");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(missing_server_files(&dir), REQUIRED_SERVER_FILES.to_vec());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn complete_bundle_reports_nothing_missing() {
        let dir = std::env::temp_dir().join("arpic_bundle_ok");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for f in REQUIRED_SERVER_FILES {
            std::fs::write(dir.join(f), b"x").unwrap();
        }
        assert!(missing_server_files(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn json_str_escapes_windows_path_backslashes() {
        let s = json_str(r"C:\Users\test\AppData\Local\ar-pic\server-stderr.log");
        assert!(s.starts_with('"') && s.ends_with('"'));
        assert!(s.contains(r"\\Users\\test"));
    }

    #[test]
    fn json_str_escapes_quotes_and_newlines() {
        let s = json_str("서버 시작 실패\n\"node.exe\" 없음");
        assert!(!s.contains('\n'), "개행이 그대로 남으면 JS 리터럴이 깨진다");
        assert!(s.contains("\\n") && s.contains("\\\"node.exe\\\""));
    }

    #[test]
    fn json_str_keeps_hangul_as_is() {
        // serde_json은 한글을 이스케이프하지 않는다 — 스플래시에 그대로 보여야 한다.
        assert_eq!(json_str("앱 파일 준비 중"), "\"앱 파일 준비 중\"");
    }

    // 스플래시 창은 "main"이 아니므로, 닫혀도 서버를 죽이지 않아야 한다
    // (준비 완료 후 우리가 닫는 것이 정상 흐름이다).
    #[test]
    fn splash_destroy_keeps_server_alive() {
        assert!(!should_shutdown_server_on_destroy(SPLASH_LABEL));
        assert!(!should_close_subwindows_with(SPLASH_LABEL));
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

