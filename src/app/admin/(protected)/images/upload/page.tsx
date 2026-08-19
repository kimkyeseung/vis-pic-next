"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface DeviceOption {
  deviceId: string;
  name: string;
}

function ImageUploadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  // 이미지 관리에서 넘어온 현재 탭 타입(?type=)을 기본 선택으로 사용한다.
  // (프레임 탭에서 업로드했는데 배경으로 저장되던 문제 방지)
  const [imageType, setImageType] = useState(() => {
    const t = searchParams.get("type");
    return t === "2" || t === "3" ? t : "1";
  });
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/devices/");
        if (!res.ok) return;
        const data = await res.json();
        setDevices(data.devices || []);
      } catch {
        // 목록 로드 실패 시 전체 적용만 가능
      }
    })();
  }, []);

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((d) => d !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setName(selectedFile.name.replace(/\.[^/.]+$/, ""));

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("파일을 선택해주세요.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const ext = file.name.split(".").pop() || "";

      // Step 1: 서버에서 presigned URL 요청
      const presignRes = await fetch("/api/admin/images/presign/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext, name }),
      });
      const presignData = await presignRes.json();

      if (!presignRes.ok) {
        setError(presignData.error || "업로드 준비에 실패했습니다.");
        return;
      }

      if (presignData.mode === "local") {
        // Supabase 미설정: 기존 방식으로 fallback
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name);
        formData.append("imageType", imageType);
        formData.append("deviceIds", JSON.stringify(selectedDeviceIds));

        const res = await fetch("/api/admin/images/upload/", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "업로드에 실패했습니다."); return; }
      } else {
        // Step 2: 브라우저에서 Supabase로 직접 업로드 (Vercel 무경유)
        const uploadRes = await fetch(presignData.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) {
          setError("파일 업로드에 실패했습니다.");
          return;
        }

        // Step 3: DB에 메타데이터 등록
        const regRes = await fetch("/api/admin/images/register/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: presignData.filename,
            name,
            imageType,
            deviceIds: selectedDeviceIds,
          }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) { setError(regData.error || "등록에 실패했습니다."); return; }
      }

      // 업로드한 타입 탭으로 되돌아간다(스티커 업로드 후 배경 탭으로 리셋되던 문제 방지).
      router.push(`/admin/images?type=${imageType}`);
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/images"
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          ← 뒤로
        </Link>
        <h2 className="text-2xl font-bold text-white">이미지 업로드</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 bg-gray-800 rounded-xl space-y-6"
      >
        <div>
          <label className="block text-gray-300 mb-2">
            파일 선택 <span className="text-red-400">*</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition-colors"
          >
            {preview ? (
              <div className="space-y-4">
                {file?.type.startsWith("video/") ? (
                  <video
                    src={preview}
                    className="max-h-48 mx-auto rounded-lg"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-h-48 mx-auto rounded-lg"
                  />
                )}
                <p className="text-gray-400">{file?.name}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">📁</div>
                <p className="text-gray-400">
                  클릭하여 파일을 선택하세요
                </p>
                <p className="text-sm text-gray-500">
                  PNG, JPG, GIF, MP4 지원
                </p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            // 프레임·스티커는 PNG/JPG만 허용
            accept={imageType === "2" || imageType === "3" ? "image/png,image/jpeg" : "image/*,video/mp4"}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div>
          <label className="block text-gray-300 mb-2">
            이름 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="이미지 이름"
            required
          />
        </div>

        <div>
          <label className="block text-gray-300 mb-2">이미지 타입</label>
          <select
            value={imageType}
            onChange={(e) => setImageType(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="1">배경 (Background)</option>
            <option value="2">프레임 (Frame)</option>
            <option value="3">스티커 (Sticker)</option>
          </select>
          {(imageType === "2" || imageType === "3") && (
            <p className="mt-1 text-sm text-yellow-400">
              PNG·JPG만 업로드 가능 (투명 배경은 PNG 권장)
            </p>
          )}
        </div>

        <div>
          <label className="block text-gray-300 mb-2">
            적용 장치 (선택)
          </label>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-500">
              등록된 장치가 없어 모든 장치에 적용됩니다.
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border border-gray-600 bg-gray-700 p-3">
              {devices.map((d) => (
                <label
                  key={d.deviceId}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={selectedDeviceIds.includes(d.deviceId)}
                    onChange={() => toggleDevice(d.deviceId)}
                    className="h-4 w-4 accent-blue-500"
                  />
                  <span className="text-white">
                    {d.name}
                    <span className="ml-2 text-xs text-gray-400">
                      {d.deviceId}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {selectedDeviceIds.length === 0
              ? "선택하지 않으면 모든 장치에 적용됩니다."
              : `${selectedDeviceIds.length}개 장치에만 적용됩니다.`}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || !file}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {loading ? "업로드 중..." : "업로드"}
          </button>
          <Link
            href="/admin/images"
            className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-500 transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function ImageUploadPage() {
  return (
    <Suspense fallback={null}>
      <ImageUploadForm />
    </Suspense>
  );
}
