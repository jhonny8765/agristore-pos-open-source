import {localPostgres} from './local-postgres.mjs';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve('supabase/tests/database'),output=[];let total=0,failures=0;
for(const test of (await readdir(folder)).filter(f=>f.endsWith('.test.sql')).sort()){
 let db;
 try{
  db=await localPostgres();
  const results=await db.exec(await readFile(path.join(folder,test),'utf8'));
  const lines=results.flatMap(r=>r.rows.flatMap(row=>Object.values(row))).filter(v=>typeof v==='string' && /^(?:not )?ok \d+|^#|^1\.\./.test(v));
  const failed=lines.filter(v=>v.startsWith('not ok')),count=lines.filter(v=>/^(?:not )?ok \d+/.test(v)).length;
  total+=count;failures+=failed.length+(count===0?1:0);output.push({test,count,failed,lines});
  console.log(`${test}: ${count} assertions, ${failed.length} failures`);for(const line of failed)console.error(line);
 }catch(e){failures++;output.push({test,error:e.message,context:e.where ?? e.cause?.where});console.error(test,e.message,e.where ?? e.cause?.where ?? '');}
 finally{if(db)await db.close();}
}
await mkdir('test-results',{recursive:true});
await writeFile('test-results/local-database-preflight.json',JSON.stringify({scope:'PGlite/PostgreSQL with minimal Auth schema and claims functions. Not Supabase Auth, PostgREST, concurrent sessions, or cloud backup certification.',total,failures,output},null,2));
console.log(`${total} assertions; ${failures} failures. Local preflight only; retain the complete Supabase CI gate.`);
process.exitCode=failures?1:0;
