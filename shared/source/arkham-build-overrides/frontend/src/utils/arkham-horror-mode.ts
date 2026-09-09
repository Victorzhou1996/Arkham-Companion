export function isArkhamHorrorMode() {
  const host = typeof window === "undefined" ? "" : window.location.host;
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;

  return (
    import.meta.env.VITE_ARKHAM_HORROR_MODE === "true" ||
    !!import.meta.env.VITE_ARKHAM_HORROR_API_URL ||
    import.meta.env.BASE_URL.startsWith("/build") ||
    pathname.startsWith("/build") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    host.startsWith("[::1]:")
  );
}
