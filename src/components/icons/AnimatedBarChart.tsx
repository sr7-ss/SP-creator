'use client';

/**
 * Animated bar chart icon — axis stays still, 3 bars bounce independently.
 * Drop-in replacement for Lucide BarChart3 when animated.
 */
export default function AnimatedBarChart({
  className = '',
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Axis lines — static */}
      <path d="M3 3v18h18" />

      {/* Bar 1 (left, shortest) — bounces up */}
      <rect
        x="7"
        width="3"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        style={{
          transformOrigin: '8.5px 21px',
        }}
        className={animate ? 'animate-[bar1_1.4s_ease-in-out_infinite]' : ''}
        y="14"
        height="7"
      />

      {/* Bar 2 (middle, tallest) — bounces down then up */}
      <rect
        x="12"
        width="3"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        style={{
          transformOrigin: '13.5px 21px',
        }}
        className={animate ? 'animate-[bar2_1.4s_ease-in-out_infinite_0.2s]' : ''}
        y="8"
        height="13"
      />

      {/* Bar 3 (right, medium) — opposite rhythm */}
      <rect
        x="17"
        width="3"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        style={{
          transformOrigin: '18.5px 21px',
        }}
        className={animate ? 'animate-[bar3_1.4s_ease-in-out_infinite_0.4s]' : ''}
        y="11"
        height="10"
      />
    </svg>
  );
}
