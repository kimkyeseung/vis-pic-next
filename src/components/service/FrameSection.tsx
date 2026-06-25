import { FRAME_INFO } from "@/constants/frames";

export function FrameSection({
  captureModes,
  selectedFrame,
  onSelect,
  onNext,
  onPrev,
}: {
  captureModes: string[];
  selectedFrame: string | null;
  onSelect: (frame: string) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const frames = captureModes
    .map((mode) => ({ id: mode, ...FRAME_INFO[mode] }))
    .filter((f) => f.label);

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        프레임을 선택해 주세요
      </h2>

      <div className="flex gap-10 mb-20 animate-fadeInUp">
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option w-64 text-center ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className={`${frame.orientation === "landscape" ? "w-44 h-32" : "w-32 h-44"} mx-auto mb-5 bg-black/30 rounded-xl flex items-center justify-center`}>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${frame.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${frame.rows}, 1fr)`,
                }}
              >
                {Array.from({ length: frame.count }).map((_, i) => (
                  <div key={i} className="w-10 h-8 bg-white/40 rounded" />
                ))}
              </div>
            </div>
            <span className="text-2xl font-bold text-white">{frame.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; 이전으로
        </button>
        <button
          className={`service-button nav-button ${!selectedFrame ? "disabled" : ""}`}
          onClick={onNext}
          style={!selectedFrame ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          다음으로 &#9654;
        </button>
      </div>
    </section>
  );
}
