# Tauri 멀티모니터 카메라 출력 앱 구현 가이드

## 개요

Tauri 2.0 (Windows)에서 다음 기능을 구현한다.

- **메인 창**: 카메라 미리보기 + 모니터/카메라 선택 UI
- **서브 창**: 사용자가 선택한 외부 모니터에 카메라 화면 전체 출력

모든 기능은 Tauri 2.0 공식 API 범위 안에서 구현 가능하며, 별도 네이티브 라이브러리가 필요 없다.

---

## 기술 스택

| 역할 | 기술 |
|---|---|
| 프레임워크 | Tauri 2.0 |
| 프론트엔드 | React + TypeScript |
| 카메라 접근 | Web API `navigator.mediaDevices.getUserMedia` |
| 모니터 감지 | Tauri `available_monitors()` (Rust) |
| 창 관리 | `WebviewWindowBuilder` + `set_position()` |

---

## 구현 흐름

```
[메인 창 - index.html]
  1. 연결된 모니터 목록 불러오기 (Tauri 커맨드 호출)
  2. 카메라 목록 불러오기 (enumerateDevices)
  3. 사용자가 출력 모니터 + 카메라 선택
  4. 미리보기 <video> 표시
  5. "출력 시작" 버튼 → Tauri 커맨드 호출

[Rust 백엔드 - main.rs]
  6. available_monitors()로 선택 모니터 좌표/해상도 획득
  7. 서브 창 생성 → set_position(모니터 좌표)
  8. 서브 창 전달: 선택된 카메라 deviceId

[서브 창 - camera.html]
  9. 동일 deviceId로 getUserMedia 재호출
  10. <video autoplay> 전체화면 렌더링
```

---

## Rust 백엔드 구현

### 모니터 목록 반환 커맨드

```rust
// src-tauri/src/main.rs

use tauri::{AppHandle, Manager};
use serde::Serialize;

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
fn get_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            index: i,
            name: format!("모니터 {} ({}x{})", i + 1, m.size().width, m.size().height),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
        })
        .collect()
}
```

### 서브 창 생성 커맨드

```rust
#[tauri::command]
async fn open_camera_window(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    device_id: String,
) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    // 기존 서브 창이 있으면 닫기
    if let Some(existing) = app.get_webview_window("camera-output") {
        existing.close().ok();
    }

    let url = format!("camera.html?deviceId={}", device_id);

    let window = WebviewWindowBuilder::new(
        &app,
        "camera-output",
        WebviewUrl::App(url.into()),
    )
    .title("Camera Output")
    .inner_size(width as f64, height as f64)
    .decorations(false)       // 타이틀바 제거
    .always_on_top(true)
    .resizable(false)
    .visible(false)            // 위치 잡기 전까지 숨김
    .build()
    .map_err(|e| e.to_string())?;

    // 타겟 모니터 좌표로 이동
    window
        .set_position(tauri::PhysicalPosition { x, y })
        .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;

    Ok(())
}
```

---

## 프론트엔드 구현

### 메인 창 (index.tsx)

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef } from "react";

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export default function App() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<MonitorInfo | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 모니터 목록
    invoke<MonitorInfo[]>("get_monitors").then(setMonitors);

    // 카메라 목록
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameras(videoDevices);
      if (videoDevices.length > 0) setSelectedCamera(videoDevices[0].deviceId);
    });
  }, []);

  // 카메라 미리보기
  useEffect(() => {
    if (!selectedCamera) return;
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: selectedCamera } })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
  }, [selectedCamera]);

  const handleStart = async () => {
    if (!selectedMonitor || !selectedCamera) return;
    await invoke("open_camera_window", {
      x: selectedMonitor.x,
      y: selectedMonitor.y,
      width: selectedMonitor.width,
      height: selectedMonitor.height,
      deviceId: selectedCamera,
    });
  };

  return (
    <div>
      <h2>출력 모니터 선택</h2>
      <select onChange={(e) => setSelectedMonitor(monitors[+e.target.value])}>
        <option value="">선택하세요</option>
        {monitors.map((m, i) => (
          <option key={i} value={i}>{m.name}</option>
        ))}
      </select>

      <h2>카메라 선택</h2>
      <select onChange={(e) => setSelectedCamera(e.target.value)}>
        {cameras.map((c, i) => (
          <option key={i} value={c.deviceId}>
            {c.label || `카메라 ${i + 1}`}
          </option>
        ))}
      </select>

      <h2>미리보기</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: 320 }} />

      <br />
      <button onClick={handleStart}>출력 시작</button>
    </div>
  );
}
```

### 서브 창 (camera.html)

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; }
    body { background: black; overflow: hidden; }
    video { width: 100vw; height: 100vh; object-fit: cover; }
  </style>
</head>
<body>
  <video id="v" autoplay playsinline></video>
  <script>
    const params = new URLSearchParams(location.search);
    const deviceId = params.get("deviceId");

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId } })
      .then((stream) => {
        document.getElementById("v").srcObject = stream;
      });
  </script>
</body>
</html>
```

---

## 주의사항

### DPI 스케일링

모니터마다 DPI가 다를 경우 좌표 계산에서 `PhysicalPosition` 기준으로 통일한다. `LogicalPosition`과 혼용하면 창이 엉뚱한 위치에 열릴 수 있다.

### 창 깜빡임 방지

```rust
.visible(false)  // 생성 시 숨김
// → set_position() 으로 좌표 이동
// → show() 호출
// → set_fullscreen(true)
```

이 순서를 지키지 않으면 창이 메인 모니터에 잠깐 나타났다가 이동하는 깜빡임이 발생한다.

### Windows 모니터 이름

`available_monitors()`에서 반환되는 `name()`은 `\\.\DISPLAY1` 형태의 내부 식별자다. UI에서는 인덱스 기반으로 가공해서 표시한다.

### 카메라 권한

WebView2가 첫 실행 시 카메라 권한 팝업을 띄운다. 한 번 허용하면 이후 재시작에도 유지된다. 서브 창에서 동일 `deviceId`로 `getUserMedia`를 재호출할 때 추가 권한 요청은 발생하지 않는다.

---

## tauri.conf.json 설정

```json
{
  "tauri": {
    "windows": [
      {
        "label": "main",
        "title": "Camera Control",
        "width": 800,
        "height": 600
      }
    ],
    "allowlist": {
      "all": false
    }
  }
}
```

서브 창(`camera-output`)은 런타임에 동적으로 생성하므로 conf에 등록하지 않아도 된다.
