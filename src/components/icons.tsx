import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 16, ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...rest,
});

export const IconPlane = (p: IconProps) => (
  <svg {...base(p)}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
);
export const IconTrain = (p: IconProps) => (
  <svg {...base(p)}><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4" /><circle cx="9" cy="14" r=".6" fill="currentColor" /><circle cx="15" cy="14" r=".6" fill="currentColor" /></svg>
);
export const IconCar = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 17h14v-5l-2-5H7l-2 5z" /><path d="M5 12h14" /><circle cx="8" cy="17" r="1.6" /><circle cx="16" cy="17" r="1.6" /></svg>
);
export const IconPin = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
);
export const IconLeaf = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19 13 11" /></svg>
);
export const IconAccess = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="4.5" r="1.6" /><path d="M10 8h4l-1 6h4l2 5" /><path d="M9.5 11.5a5 5 0 1 0 6 6.5" /></svg>
);
export const IconCheck = (p: IconProps) => <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IconX = (p: IconProps) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 4 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>
);
export const IconClock = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
);
export const IconTool = (p: IconProps) => (
  <svg {...base(p)}><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" /></svg>
);
export const IconShield = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconRetry = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>
);
export const IconSend = (p: IconProps) => <svg {...base(p)}><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4z" /></svg>;
export const IconArrow = (p: IconProps) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconPlay = (p: IconProps) => <svg {...base(p)}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></svg>;
