function literalSet(source, pattern, group = 1) {
  return new Set([...source.matchAll(pattern)].map((match) => match[group]).filter(Boolean));
}

/**
 * Extract the literal backend objects defined by the canonical Supabase SQL.
 * This is intentionally a contract check, not a replacement for executing SQL
 * against PostgreSQL/Supabase.
 *
 * @param {string} sql
 */
export function collectSqlContract(sql) {
  const tables = literalSet(sql, /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi);
  const views = literalSet(sql, /\bcreate\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi);
  const functions = literalSet(sql, /\bcreate\s+or\s+replace\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi);
  const buckets = new Set();

  for (const valuesClause of sql.matchAll(/insert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*([\s\S]*?)(?:\bon\s+conflict\b|;)/gi)) {
    for (const row of valuesClause[1].matchAll(/\(\s*'([^']+)'\s*,/g)) buckets.add(row[1]);
  }

  return { tables, views, functions, buckets };
}

/**
 * Extract only literal Supabase relation/RPC/Storage/Function references. Calls
 * built dynamically are deliberately excluded and must be reviewed separately.
 *
 * @param {string} source
 */
export function collectSupabaseReferences(source) {
  const buckets = literalSet(source, /\.storage\s*\.\s*from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_-]*)['"]\s*\)/g);
  const relations = new Set();
  for (const match of source.matchAll(/\.from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g)) {
    const prefix = source.slice(Math.max(0, match.index - 40), match.index);
    if (/\.storage\s*$/.test(prefix)) continue;
    relations.add(match[1]);
  }
  const rpcs = literalSet(source, /\.rpc\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g);
  const edgeFunctions = literalSet(source, /\.functions\s*\.\s*invoke\(\s*['"]([a-zA-Z0-9_-]+)['"]/g);
  return { relations, rpcs, buckets, edgeFunctions };
}

function addRoles(target, functionName, roleList) {
  const roles = target.get(functionName) ?? new Set();
  for (const rawRole of roleList.split(',')) {
    const role = rawRole.trim().replace(/^"|"$/g, '').toLowerCase();
    if (role) roles.add(role);
  }
  target.set(functionName, roles);
}

/**
 * Collect function-level API privilege declarations from canonical SQL.
 * Function names are sufficient for this repository because overloaded public
 * functions are intentionally forbidden by the schema contract.
 *
 * @param {string} sql
 */
export function collectFunctionPrivileges(sql) {
  const securityDefiners = new Set();
  const revokedFrom = new Map();
  const grantedTo = new Map();

  const functionDefinition = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*returns[\s\S]*?\bas\s+\$\$[\s\S]*?\$\$;/gi;
  for (const match of sql.matchAll(functionDefinition)) {
    if (/\bsecurity\s+definer\b/i.test(match[0])) securityDefiners.add(match[1]);
  }

  const revokePattern = /revoke\s+(?:all|execute)\s+on\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^;]*?\)\s+from\s+([^;]+);/gi;
  for (const match of sql.matchAll(revokePattern)) addRoles(revokedFrom, match[1], match[2]);

  const grantPattern = /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^;]*?\)\s+to\s+([^;]+);/gi;
  for (const match of sql.matchAll(grantPattern)) addRoles(grantedTo, match[1], match[2]);

  return { securityDefiners, revokedFrom, grantedTo };
}
