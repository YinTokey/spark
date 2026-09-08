export const captureNavigationItems = ["Capture", "Phone"] as const;

export function isPhoneTab(tab: string) {
  return tab === "Phone";
}
