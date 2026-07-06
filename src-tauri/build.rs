fn main() {
  // 서버 번들 식별자: server.zip 내용 해시(FNV-1a).
  // 앱 버전(0.1.0)이 그대로여도 번들이 바뀌면 재추출되도록
  // prepare_server_dir의 버전 비교 키에 포함된다.
  // (버전만 비교하면 이전 빌드를 설치했던 PC에서 새 설치 후에도
  //  옛 server 디렉터리를 재사용해 구버전이 실행되는 버그가 있었다)
  println!("cargo:rerun-if-changed=server.zip");
  let build_id = match std::fs::read("server.zip") {
    Ok(bytes) => {
      let mut hash: u64 = 0xcbf29ce484222325;
      for b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
      }
      format!("{hash:016x}")
    }
    Err(_) => "dev".to_string(),
  };
  println!("cargo:rustc-env=SERVER_BUILD_ID={build_id}");

  tauri_build::build()
}
