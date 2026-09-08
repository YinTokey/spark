type IconName = "bulb" | "script" | "plus" | "back" | "close" | "video" | "reset" | "arrow" | "check" | "play" | "pause";
const paths: Record<IconName, string> = {
  bulb: "M9 18h6M10 21h4M9 15c0-2-3-3-3-7a6 6 0 0 1 12 0c0 4-3 5-3 7v1H9v-1ZM12 1v1M3 4l1 1M21 4l-1 1",
  script: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6",
  plus: "M12 5v14M5 12h14", back: "m14 5-7 7 7 7", close: "m6 6 12 12M6 18 18 6",
  video: "M3 6h12v12H3V6Zm12 4 6-3v10l-6-3", reset: "M3 10a9 9 0 1 1 1 7M3 4v6h6",
  arrow: "M5 12h14m-6-6 6 6-6 6", check: "m5 12 4 4L19 6",
  play: "m8 5 11 7-11 7V5z", pause: "M9 5v14M15 5v14",
};
export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
