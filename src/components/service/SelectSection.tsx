export function SelectSection({
  photos,
  requiredCount,
  selectedPhotos,
  setSelectedPhotos,
  onNext,
  onPrev,
}: {
  photos: string[];
  requiredCount: number;
  selectedPhotos: number[];
  setSelectedPhotos: (sel: number[]) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const togglePhoto = (index: number) => {
    setSelectedPhotos(
      selectedPhotos.includes(index)
        ? selectedPhotos.filter((i) => i !== index)
        : selectedPhotos.length < requiredCount
          ? [...selectedPhotos, index]
          : selectedPhotos
    );
  };

  const canProceed = selectedPhotos.length === requiredCount;

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-6 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        인화할 사진을 선택해 주세요
      </h2>
      <p className="text-gray-400 text-xl mb-16 animate-fadeInDown">
        {requiredCount}장을 선택해 주세요 ({selectedPhotos.length}/{requiredCount})
      </p>

      <div className="flex gap-8 mb-20 animate-fadeInUp">
        {photos.map((photo, i) => (
          <div
            key={i}
            className={`photo-thumbnail w-56 bg-black/30 flex items-center justify-center relative overflow-hidden ${selectedPhotos.includes(i) ? "selected" : ""}`}
            onClick={() => togglePhoto(i)}
          >
            {selectedPhotos.includes(i) && <span className="check-mark">&#10003;</span>}
            <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; 다시 촬영
        </button>
        <button
          className="service-button nav-button"
          onClick={onNext}
          style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          다음으로 &#9654;
        </button>
      </div>
    </section>
  );
}
