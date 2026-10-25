import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, loadSpec } from '../src/core.js';
import { generateTypes } from '../src/generate.js';
test('reports write retry risks and counts operations', async()=>{ const report=analyze(await loadSpec('examples/contacts.yaml')); assert.equal(report.operations,2); assert.deepEqual(report.securitySchemes,['bearerAuth']); assert.ok(report.findings.some(f=>f.code==='IDEMPOTENCY_REVIEW')); assert.ok(!report.findings.some(f=>f.location==='GET /contacts')); });
test('rejects workspace traversal',async()=>{await assert.rejects(loadSpec('../outside.yaml'),/workspace/);});
test('detects anonymous override, duplicate ids and missing path params',()=>{const report=analyze({openapi:'3.1.0',security:[{bearer:[]}],paths:{'/a/{id}':{get:{operationId:'same',security:[],responses:{}}},'/b':{get:{operationId:'same',responses:{}}}}}); for(const code of ['PUBLIC_OPERATION','DUPLICATE_OPERATION_ID','PATH_PARAMETER']) assert.ok(report.findings.some(f=>f.code===code));});
test('generates real TypeScript response types',async()=>{const output=await generateTypes(await loadSpec('examples/contacts.yaml')); assert.match(output,/listContacts/); assert.match(output,/Contact:/);});
test('refuses external refs during generation',async()=>{await assert.rejects(generateTypes({paths:{},components:{schemas:{X:{$ref:'https://example.com/x'}}}}),/External/);});
