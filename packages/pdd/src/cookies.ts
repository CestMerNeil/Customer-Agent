export interface BrowserCookie {
  name: string;
  value: string;
}

export type CookieJar = Record<string, string>;

export function cookieListToJar(cookies: BrowserCookie[]): CookieJar {
  return Object.fromEntries(cookies.map((cookie) => [cookie.name, cookie.value]));
}

export function parseCookieJar(cookies: string | CookieJar | undefined): CookieJar {
  if (!cookies) {
    return {};
  }
  if (typeof cookies !== "string") {
    return cookies;
  }
  try {
    const parsed = JSON.parse(cookies) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export function buildCookieHeader(cookies: string | CookieJar | undefined): string {
  return Object.entries(parseCookieJar(cookies))
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
