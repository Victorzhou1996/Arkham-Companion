export function arkhamHorrorBasePath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base.endsWith("/build") ? base.slice(0, -"/build".length) : "";
}

export function arkhamHorrorPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${arkhamHorrorBasePath()}${normalized}`;
}

export function arkhamHorrorHashPath(path = "") {
  const normalized = path.replace(/^\/+/, "");
  return `${arkhamHorrorBasePath()}/#/${normalized}`;
}

export function appPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
