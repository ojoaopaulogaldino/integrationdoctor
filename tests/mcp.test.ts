import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('MCP lists and calls the shared analyzer over stdio',async()=>{
  const client = new Client({name:'integration-doctor-test',version:'1.0.0'});
  const transport = new StdioClientTransport({command:process.execPath,args:[resolve('dist/cli.js'),'mcp',process.cwd()]});
  try {
    await client.connect(transport);
    const tools=await client.listTools(); assert.deepEqual(tools.tools.map(tool=>tool.name),['analyze_openapi','plan_integration','diff_openapi']);
    const result=await client.callTool({name:'analyze_openapi',arguments:{file:'examples/contacts.yaml'}});
    assert.equal(result.isError,undefined);
    assert.match(JSON.stringify(result.content),/Example Contacts API/);
    const denied=await client.callTool({name:'analyze_openapi',arguments:{file:'../outside.yaml'}});
    assert.equal(denied.isError,true);
    const diff=await client.callTool({name:'diff_openapi',arguments:{before:'examples/contacts.yaml',after:'examples/contacts-v2-breaking.yaml'}});
    assert.match(JSON.stringify(diff.content),/REQUIRED_PARAMETER_ADDED/);
  } finally { await client.close(); }
});
