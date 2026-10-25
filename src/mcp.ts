import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyze, loadSpec } from './core.js';
import { diffContracts } from './diff.js';
import { planIntegration } from './plan.js';
export async function serve(workspace: string) {
  const server = new McpServer({name:'integration-doctor',version:'0.2.0'});
  server.registerTool('analyze_openapi', {description:'Read a local OpenAPI contract inside the configured workspace and report integration risks. Does not call the API.',inputSchema:{file:z.string()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}, async ({file}) => {
    try { const report = analyze(await loadSpec(file,workspace)); return {content:[{type:'text',text:JSON.stringify(report,null,2)}]}; }
    catch(error) { return {isError:true,content:[{type:'text',text:(error as Error).message}]}; }
  });
  server.registerTool('plan_integration',{description:'Derive auth, sync, action, and webhook candidates from a local OpenAPI contract. Heuristics are explicitly returned for developer review.',inputSchema:{file:z.string()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async({file})=>{
    try{return {content:[{type:'text',text:JSON.stringify(planIntegration(await loadSpec(file,workspace)),null,2)}]};}catch(error){return {isError:true,content:[{type:'text',text:(error as Error).message}]};}
  });
  server.registerTool('diff_openapi',{description:'Compare two local OpenAPI contracts and flag likely breaking integration changes.',inputSchema:{before:z.string(),after:z.string()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async({before,after})=>{
    try{return {content:[{type:'text',text:JSON.stringify(diffContracts(await loadSpec(before,workspace),await loadSpec(after,workspace)),null,2)}]};}catch(error){return {isError:true,content:[{type:'text',text:(error as Error).message}]};}
  });
  await server.connect(new StdioServerTransport());
}
