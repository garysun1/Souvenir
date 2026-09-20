export function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function isPublicSupabaseKey(key: string, url?: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (
    !url ||
    !isLocalSupabaseUrl(url) ||
    key.length > 4096 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
  )
    return false;
  try {
    const decode = (segment: string): unknown =>
      JSON.parse(
        atob(
          segment
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(segment.length / 4) * 4, "="),
        ),
      );
    const segments = key.split(".");
    const header = decode(segments[0]);
    const payload = decode(segments[1]);
    return (
      typeof header === "object" &&
      header !== null &&
      "alg" in header &&
      header.alg === "HS256" &&
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "anon"
    );
  } catch {
    return false;
  }
}
