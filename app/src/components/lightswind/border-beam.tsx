import { motion } from "motion/react";

import { cn } from "@/lib/utils";

// Lightswind UI "Border Beam" (lightswind.com/components/border-beam),
// vendored per their copy-paste model and adapted to this codebase:
// motion/react instead of framer-motion, local cn, trimmed props.
// A luminous beam that travels around the parent's border — the parent
// needs `relative` and a border radius (the beam inherits it).

export function BorderBeam({
  size = 56,
  duration = 6,
  delay = 0,
  colorFrom = "#f59e0b",
  colorTo = "#ef4444",
  thickness = 1.5,
  opacity = 0.9,
  className,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  thickness?: number;
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      style={{ borderWidth: thickness }}
    >
      <motion.div
        className={cn(
          "absolute aspect-square bg-gradient-to-l from-[var(--beam-from)] via-[var(--beam-to)] to-transparent",
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--beam-from": colorFrom,
            "--beam-to": colorTo,
            opacity,
          } as React.CSSProperties
        }
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay }}
      />
    </div>
  );
}
