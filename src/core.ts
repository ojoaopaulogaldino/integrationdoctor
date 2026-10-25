import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { parse } from 'yaml';

export type Obj = Record<string, any>;
export interface Finding { code: string; severity: 'warning' | 'info'; location: string; message: string }
export interface Report { title: string; version: string; operations: number; securitySchemes: string[]; findings: Finding[] }
const methods = new Set(['get','post','put','patch','delete','options','head','trace']);
export interface Operation { method: string; path: string; location: string; operation: Obj; pathItem: Obj }
export function operations(spec: Obj): Operation[] {
  const result: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {}) as [string, Obj][]) {
    if (!item || typeof item !== 'object' || item.$ref) continue;
    for (const [method, operation] of Object.entries(item) as [string, Obj][]) {
      if (methods.has(method) && operation && typeof operation === 'object') result.push({method,path,location:`${method.toUpperCase()} ${path}`,operation,pathItem:item});
    }
  }
  return result;
}
export async function loadSpec(file: string, root = process.cwd()): Promise<Obj> {
  const base = resolve(root), target = resolve(base, file), rel = relative(base, target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Spec must be inside the configured workspace');
  const canonicalBase = await realpath(base), canonicalTarget = await realpath(target);
  const canonicalRel = relative(canonicalBase, canonicalTarget);
  if (canonicalRel.startsWith('..') || isAbsolute(canonicalRel)) throw new Error('Spec must be inside the configured workspace');
  if ((await stat(canonicalTarget)).size > 5_000_000) throw new Error('Spec exceeds 5 MB limit');
  const text = await readFile(target, 'utf8');
  if (text.length > 5_000_000) throw new Error('Spec exceeds 5 MB limit');
  const spec = parse(text, { maxAliasCount: 50 });
  if (!spec || typeof spec !== 'object' || !/^3\.(0|1)\./.test(spec.openapi ?? '') || !spec.paths || typeof spec.paths !== 'object') throw new Error('Expected an OpenAPI 3.0 or 3.1 document with paths');
  return spec;
}
export function analyze(spec: Obj): Report {
  const findings: Finding[] = [], ids = new Set<string>(); let operations = 0;
  const add = (code: string, location: string, message: string, severity: Finding['severity'] = 'warning') => findings.push({code,severity,location,message});
  if (!spec.servers?.length) add('NO_SERVER', '/', 'No server URL declared; configure the base URL explicitly.');
  for (const [path, item] of Object.entries(spec.paths) as [string, Obj][]) {
    if (!item || typeof item !== 'object') continue;
    if (item.$ref) { add('PATH_REF', path, 'Referenced path item requires manual review.'); continue; }
    for (const [method, op] of Object.entries(item) as [string, Obj][]) {
      if (!methods.has(method) || !op || typeof op !== 'object') continue;
      operations++; const loc = `${method.toUpperCase()} ${path}`;
      if (!op.operationId) add('MISSING_OPERATION_ID',loc,'Add a stable operationId for SDK and tool naming.');
      else { if (ids.has(op.operationId)) add('DUPLICATE_OPERATION_ID',loc,`Duplicate operationId: ${op.operationId}`); ids.add(op.operationId); }
      const security = op.security ?? spec.security;
      if (!security?.length || security.some((s: Obj) => Object.keys(s).length === 0)) add('PUBLIC_OPERATION',loc,'Operation permits anonymous access; verify this is intentional.','info');
      if (!op.responses?.['429']) add('RATE_LIMIT_UNDOCUMENTED',loc,'No 429 response documented; confirm retry and rate-limit policy.');
      if (!Object.keys(op.responses ?? {}).some(s => /^[45]/.test(s) || s === 'default')) add('ERRORS_UNDOCUMENTED',loc,'No error responses documented.');
      const params = [...(item.parameters ?? []),...(op.parameters ?? [])];
      for (const placeholder of path.matchAll(/\{([^}]+)\}/g)) if (!params.some((p: Obj) => p.in === 'path' && p.name === placeholder[1] && p.required === true)) add('PATH_PARAMETER',loc,`Missing required declaration for ${placeholder[1]}.`);
      if (method === 'get' && !path.includes('{') && !params.some((p: Obj) => /cursor|page|offset|limit/i.test(p.name ?? ''))) add('PAGINATION_REVIEW',loc,'No common pagination parameter found; check whether collection results are bounded.','info');
      if (method === 'post' && !params.some((p: Obj) => /idempotency/i.test(p.name ?? ''))) add('IDEMPOTENCY_REVIEW',loc,'No idempotency header documented; do not automatically retry writes.','info');
    }
  }
  const refs = (value: any): void => { if (!value || typeof value !== 'object') return; if (typeof value.$ref === 'string' && !value.$ref.startsWith('#/')) add('EXTERNAL_REF','/','External references are disabled; bundle the document locally first.'); for (const child of Object.values(value)) refs(child); };
  refs(spec);
  return {title:spec.info?.title ?? 'Untitled API',version:spec.openapi,operations,securitySchemes:Object.keys(spec.components?.securitySchemes ?? {}),findings};
}
export function markdown(report: Report): string {
  return `# ${report.title}\n\nOpenAPI ${report.version} | ${report.operations} operations\n\nAuthentication: ${report.securitySchemes.join(', ') || 'not declared'}\n\n` + report.findings.map(f => `- **${f.severity.toUpperCase()} ${f.code}** (${f.location}): ${f.message}`).join('\n') + '\n';
}
