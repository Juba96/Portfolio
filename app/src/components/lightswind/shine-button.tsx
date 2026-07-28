import { cn } from "@/lib/utils";

// Lightswind UI "Shine Button" (lightswind.com/components/shine-button),
// vendored per their copy-paste model and adapted: pill shape, dark brand
// gradient by default, native button props pass through, and the shine
// sweep runs as a slow continuous loop (keyframes in styles.css).

type ShineButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** CSS background-image; defaults to the dashboard's dark gradient. */
  gradient?: string;
};

export function ShineButton({
  className,
  children,
  gradient,
  disabled,
  style,
  ...props
}: ShineButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "relative overflow-hidden rounded-full font-semibold text-white",
        "active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
        className,
      )}
      style={{
        backgroundImage: gradient ?? "linear-gradient(325deg, #0b0b0c 0%, #3d3d42 55%, #0b0b0c 90%)",
        backgroundSize: "280% auto",
        transition: "background-position 0.8s ease, transform 0.15s ease, opacity 0.2s ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundPosition = "right top";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundPosition = "initial";
      }}
      {...props}
    >
      <span className="relative z-10 inline-flex w-full items-center justify-center gap-1.5">
        {children}
      </span>
      {!disabled && (
        <span
          aria-hidden
          className="ls-shine pointer-events-none absolute top-0 h-full w-1/3 skew-x-[-20deg] bg-white/25"
        />
      )}
    </button>
  );
}
