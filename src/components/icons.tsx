import type { ReactNode } from "react";

/**
 * A small set of hand-drawn line icons. Inline SVG keeps the bundle free of an
 * icon library, and every icon inherits its colour and size from the parent.
 * All are decorative (aria-hidden): the button or heading next to them carries
 * the meaning.
 */
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h1.5l1.2-1.6A2 2 0 0 1 10.3 3h3.4a2 2 0 0 1 1.6.8L16.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Svg>
);

export const CameraOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h1.5M10.3 3h3.4a2 2 0 0 1 1.6.8L16.5 6H18a2 2 0 0 1 2 2v7M20 19H6a2 2 0 0 1-2-2V8" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const FaceScanIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 10v1M15 10v1M9.5 15c.7.7 1.6 1 2.5 1s1.8-.3 2.5-1" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const SearchOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.4-4.4M8.8 8.8l4.4 4.4M13.2 8.8l-4.4 4.4" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16 13.6A4.6 4.6 0 0 1 21 18" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l9 15.5H3z" />
    <path d="M12 10v4M12 17v.2" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 4" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 3L5 13.5h6L10.5 21 19 10h-6z" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3z" />
  </Svg>
);
