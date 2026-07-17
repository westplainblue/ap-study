interface IconProps {
  size?: number;
}

function svgProps(size = 22) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconHome({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

export function IconPencil({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20z" />
      <path d="M13.5 7l3.5 3.5" />
    </svg>
  );
}

export function IconDoc({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

export function IconChart({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </svg>
  );
}

export function IconGear({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4L9.6 5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z" />
    </svg>
  );
}

export function IconRefresh({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function IconClock({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconCheck({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </svg>
  );
}

export function IconX({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconStar({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" />
    </svg>
  );
}

export function IconChevronRight({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconSparkle({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
      <path d="M18.5 16l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </svg>
  );
}

export function IconSend({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 11.5L20 4l-7.5 16-2-6.5z" />
      <path d="M10.5 13.5L20 4" />
    </svg>
  );
}
