'use client';

/**
 * Animated package icon — box body stays still, two lid flaps open and close.
 * Mimics the Lucide Package icon style (24x24 viewBox, stroke-based).
 */
export default function AnimatedPackage({
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
      {/* Box body — static */}
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      {/* Center vertical line */}
      <path d="m12 22V12" />
      {/* Bottom connecting line */}
      <path d="M3.3 7 12 12l8.7-5" />

      {/* Left lid flap — animates open/close */}
      <line
        x1="7.5"
        y1="4.5"
        x2="12"
        y2="2"
        className={animate ? 'animate-[lidLeft_2s_ease-in-out_infinite]' : ''}
        style={{ transformOrigin: '12px 2px' }}
      />

      {/* Right lid flap — animates open/close (opposite phase) */}
      <line
        x1="16.5"
        y1="4.5"
        x2="12"
        y2="2"
        className={animate ? 'animate-[lidRight_2s_ease-in-out_infinite]' : ''}
        style={{ transformOrigin: '12px 2px' }}
      />
    </svg>
  );
}
