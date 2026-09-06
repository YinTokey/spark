const paths = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6',
  sparkle: 'm11 3 2.4 6.6L20 12l-6.6 2.4L11 21l-2.4-6.6L2 12l6.6-2.4L11 3Zm8-2 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z',
  note: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 5h6m-6 4h6m-6 4h4',
  video: 'M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm13 5 6-4v12l-6-4',
  bolt: 'm13 1-9 13h7l-1 9 10-14h-7l0-8Z',
  brain: 'M12 4c-3-5-7-1-6 2-5 0-5 7-2 8-3 4 2 8 5 6 0 3 3 3 3 0V4Zm0 0c3-5 7-1 6 2 5 0 5 7 2 8 3 4-2 8-5 6 0 3-3 3-3 0M6 6l2 3m-4 5 4-1m1 7-1-4m10-10-2 3m4 5-4-1m-1 7 1-4',
  walk: 'M14 3a1.5 1.5 0 1 0 0 .1M7 11l4-4 4 2 3 1m-7-3-1 8-4 7m4-7 5 3 2 4m-2-13-1 5',
  keyboard: 'M3 5h18v14H3V5Zm3 4h.1m3 0h.1m3 0h.1m3 0h.1m3 0h.1M6 12h.1m3 0h.1m3 0h.1m3 0h.1m3 0h.1M8 16h8',
  buzz: 'M7 5a11 11 0 0 0 0 14m-3-17a16 16 0 0 0 0 20M17 5a11 11 0 0 1 0 14m3-17a16 16 0 0 1 0 20',
  wave: 'M2 10v4m4-8v12m4-16v20m4-17v14m4-16v18m4-11v4',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
};
export type IconName = keyof typeof paths;
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
