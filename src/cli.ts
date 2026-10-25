#!/usr/bin/env node
import { resolve } from 'node:path';
import { analyze, loadSpec, markdown } from './core.js';
import { diffContracts, diffMarkdown } from './diff.js';
import { generateSdk } from './generate.js';
import { planIntegration } from './plan.js';

async function main() {
  const [command, file, ...flags] = process.argv.slice(2);
  if (command === 'mcp') { const { serve } = await import('./mcp.js'); await serve(resolve(file ?? '.')); return; }
  if (!['analyze','inspect','diff','generate'].includes(command) || !file) {
    console.log('Integration Doctor\n\n  integration-doctor inspect <spec.yaml> [--json]\n  integration-doctor analyze <spec.yaml> [--json] [--strict]\n  integration-doctor diff <before.yaml> <after.yaml> [--json] [--strict]\n  integration-doctor generate <spec.yaml> <output-directory>\n  integration-doctor mcp [workspace]\n\nContract inspection never calls the target API. Runtime requests are opt-in through the library.');
    if (command && command !== '--help') process.exitCode = 1; return;
  }
  const spec = await loadSpec(file);
  if (command === 'analyze') { const report = analyze(spec); console.log(flags.includes('--json') ? JSON.stringify(report,null,2) : markdown(report)); if (flags.includes('--strict') && report.findings.some(f=>f.severity==='warning')) process.exitCode=2; }
  else if (command === 'inspect') { const result={report:analyze(spec),plan:planIntegration(spec)}; console.log(flags.includes('--json')?JSON.stringify(result,null,2):`${markdown(result.report)}\n## Integration plan\n\n${JSON.stringify(result.plan,null,2)}`); }
  else if (command === 'diff') { const after=flags.find(flag=>!flag.startsWith('--')); if(!after)throw new Error('Provide the new contract path'); const report=diffContracts(spec,await loadSpec(after)); console.log(flags.includes('--json')?JSON.stringify(report,null,2):diffMarkdown(report)); if(flags.includes('--strict')&&report.breaking)process.exitCode=2; }
  else { const output=flags.find(flag=>!flag.startsWith('--')); if(!output)throw new Error('Provide an output directory'); const files=await generateSdk(spec,output); console.log(`Generated typed SDK:\n${files.map(value=>`  ${value}`).join('\n')}\nExisting directories are never overwritten.`); }
}
main().catch(error => { console.error(`Integration Doctor: ${error.message}`); process.exitCode=1; });
