import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
  quick?: boolean;   // true = non-first launch, shorter animation
}

export function SplashScreen({ onDone, quick = false }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (quick) {
      // Quick mode: everything fades in together → brief hold → fade out
      // total ≈ 1.15s
      const t0 = setTimeout(() => setPhase(2),  30);  // instant show (both icon + text)
      const t1 = setTimeout(() => setPhase(3), 780);  // start fade out
      const t2 = setTimeout(() => onDone(),   1180);  // done
      return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
    } else {
      // Full mode: text slides in first, then icon appears
      // total ≈ 2.5s
      const t0 = setTimeout(() => setPhase(1),   80);  // text slides in
      const t1 = setTimeout(() => setPhase(2),  750);  // icon appears
      const t2 = setTimeout(() => setPhase(3), 2000);  // fade out
      const t3 = setTimeout(() => onDone(),    2500);  // done
      return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-teal-500"
      style={{
        opacity:    phase === 3 ? 0 : 1,
        transition: phase === 3 ? "opacity 0.4s ease" : "none",
      }}
    >
      <div className="flex items-center gap-5">
        {/* App icon */}
        <div
          style={{
            opacity:   phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateX(0) scale(1)" : "translateX(-24px) scale(0.85)",
            transition: quick
              ? "opacity 0.25s ease, transform 0.25s ease"
              : "opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          <img
            src="/icon.png"
            alt="Bynálix"
            width={80}
            height={80}
            style={{ borderRadius: "22%", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
            draggable={false}
          />
        </div>

        {/* "Bynálix" text */}
        <div
          style={{
            transform: phase >= (quick ? 2 : 1) ? "translateX(0)" : "translateX(120px)",
            opacity:   phase >= (quick ? 2 : 1) ? 1 : 0,
            transition: quick
              ? "transform 0.25s ease, opacity 0.25s ease"
              : "transform 0.55s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease",
          }}
        >
          <span
            className="font-black tracking-tight text-white select-none"
            style={{ fontSize: "clamp(52px, 10vw, 88px)", lineHeight: 1 }}
          >
            Bynálix
          </span>
        </div>
      </div>
    </div>
  );
}
