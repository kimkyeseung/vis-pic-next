export function StartSection({ onNext }: { onNext: () => void }) {
  return (
    <section className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative z-10" onClick={onNext}>
      <div className="main-container flex flex-col items-center">
        <div className="logo-section text-center mb-24 animate-fadeInDown">
          <h1 className="text-7xl font-extrabold mb-5 tracking-widest text-white" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
            AR-pic
          </h1>
        </div>
        <button
          className="service-button touch-button animate-pulse-button"
          style={{ animationDelay: "0.5s" }}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        >
          <span className="animate-touchBounce inline-block mr-5 text-3xl">&#128070;</span>
          화면을 터치해주세요
        </button>
        <img src="/static/images/viswave_logo.png" className="mt-24 opacity-80" style={{ width: "200px" }} alt="Viswave" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <div className="absolute bottom-16 text-center text-gray-500 animate-fadeInUp" style={{ animationDelay: "1s" }}>
        <p className="mb-2">화면 아무 곳이나 터치하여 시작하세요</p>
        <p className="animate-blink">● 대기중 ●</p>
      </div>
    </section>
  );
}
