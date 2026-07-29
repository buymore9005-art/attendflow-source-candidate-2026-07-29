export type Permission = string;

export class EffectivePermissionSet extends Set<Permission> {
  readonly denials: ReadonlySet<Permission>;

  constructor(grants: Iterable<Permission>, denials: Iterable<Permission> = []) {
    super(grants);
    this.denials = new Set(denials);
  }
}

export function mergePermissions(
  rolePermissions: readonly Permission[],
  grants: readonly Permission[] = [],
  denials: readonly Permission[] = []
): EffectivePermissionSet {
  const merged = new EffectivePermissionSet([...rolePermissions, ...grants], denials);
  for (const denied of denials) merged.delete(denied);
  return merged;
}

export function can(permissions: ReadonlySet<Permission>, requested: Permission): boolean {
  const separator = requested.indexOf('.');
  const moduleWildcard = separator < 0 ? null : `${requested.slice(0, separator)}.*`;
  const denials = permissions instanceof EffectivePermissionSet ? permissions.denials : new Set<Permission>();
  if (denials.has('*') || denials.has(requested) || (moduleWildcard !== null && denials.has(moduleWildcard))) return false;
  if (permissions.has('*') || permissions.has(requested)) return true;
  return moduleWildcard !== null && permissions.has(moduleWildcard);
}
