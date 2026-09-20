const fallback = "/collection";

export function safeRedirect(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/u.test(value) ||
    /%2f|%5c|%0[0-9a-f]|%1[0-9a-f]/i.test(value)
  ) {
    return fallback;
  }
  const url = new URL(value, "https://souvenir.invalid");
  if (
    url.origin !== "https://souvenir.invalid" ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/login"
  ) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
