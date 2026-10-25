import openapiTS, { astToString } from 'openapi-typescript';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { analyze } from './core.js';
export async function generateTypes(spec: Record<string, any>): Promise<string> {
  if (analyze(spec).findings.some(f => f.code === 'EXTERNAL_REF')) throw new Error('External references are disabled; bundle locally first');
  return astToString(await openapiTS(spec as any));
}
export async function generateSdk(spec:Record<string,any>,outputDir:string):Promise<string[]>{
  const types=await generateTypes(spec);
  const client=`import createClient from 'openapi-fetch';\nimport type { paths } from './types.js';\n\nexport interface ClientOptions { baseUrl?: string; accessToken?: string; fetch?: typeof globalThis.fetch }\n\n/** A fully typed client generated from the source contract. */\nexport function createApiClient(options: ClientOptions = {}) {\n  return createClient<paths>({\n    baseUrl: options.baseUrl ?? ${JSON.stringify(spec.servers?.[0]?.url ?? '')},\n    headers: options.accessToken ? { authorization: \`Bearer \${options.accessToken}\` } : undefined,\n    fetch: options.fetch,\n  });\n}\n`;
  const index=`export { createApiClient } from './client.js';\nexport type { paths, components, operations } from './types.js';\n`;
  await mkdir(dirname(outputDir),{recursive:true});
  await mkdir(outputDir,{recursive:false});
  const files=[['types.ts',types],['client.ts',client],['index.ts',index]] as const;
  await Promise.all(files.map(([name,content])=>writeFile(join(outputDir,name),content,{flag:'wx'})));
  return files.map(([name])=>join(outputDir,name));
}
