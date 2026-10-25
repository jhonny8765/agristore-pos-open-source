// Supplementary local preflight only. Auth schema/claims are test doubles, not GoTrue or PostgREST.
import {PGlite} from '@electric-sql/pglite';
import {pgtap} from '@electric-sql/pglite-pgtap';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
export async function localPostgres(){
 const db=await PGlite.create({extensions:{pgtap}});
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create schema auth;create schema extensions;
   create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
   grant usage on schema auth,extensions to anon,authenticated,service_role;`);
  const folder=path.resolve('supabase/migrations');
  for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort()){
   try{await db.exec(await readFile(path.join(folder,file),'utf8'));}
   catch(e){throw new Error(`Migration ${file}: ${e.message}`,{cause:e});}
  }
  return db;
 }catch(e){await db.close();throw e;}
}
