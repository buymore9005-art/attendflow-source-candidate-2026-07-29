export type AdmsRoute = 'cdata' | 'getrequest' | 'devicecmd' | 'registry' | 'health' | 'unknown';

const ROUTES: ReadonlyArray<readonly [suffix: string, route: Exclude<AdmsRoute, 'unknown'>]> = [
  ['/iclock/getrequest', 'getrequest'],
  ['/iclock/devicecmd', 'devicecmd'],
  ['/iclock/registry', 'registry'],
  ['/iclock/cdata', 'cdata'],
  ['/health', 'health']
];

export function classifyAdmsPath(pathname: string): AdmsRoute {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  for (const [suffix, route] of ROUTES) {
    if (normalized.endsWith(suffix)) return route;
  }
  return 'unknown';
}
