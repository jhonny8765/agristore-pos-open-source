import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {readFileSync,writeFileSync,unlinkSync} from "node:fs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const port=process.env.AGRISTORE_PREVIEW_PORT??"3100";
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535) throw new Error("Invalid local preview port.");
const lock=resolve(root,".cloudflare-preview.lock");
try {
  const pid=Number(readFileSync(lock,"utf8"));
  if(!Number.isSafeInteger(pid)||pid<=0) throw new Error("Unrecognized preview lock; review it before continuing.");
  let active=true;try{process.kill(pid,0);}catch(error){if(error.code==="ESRCH")active=false;else throw error;}
  if(active) throw new Error("A Cloudflare preview is already running. Stop it first.");
  unlinkSync(lock);
}catch(error){if(error.code!=="ENOENT")throw error;}
writeFileSync(lock,String(process.pid),{flag:"wx"});
process.on("exit",()=>{if(readFileSync(lock,"utf8")===String(process.pid))unlinkSync(lock);});
// Start inside the generated output so Wrangler never loads the repository's
// Vercel/Supabase .env.local. Local emulation needs no account credentials.
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|CI)$/i.test(name)));
env.WRANGLER_SEND_METRICS="false";
const child=spawn(process.execPath,[resolve(root,"node_modules/wrangler/bin/wrangler.js"),"pages","dev","site","--ip","127.0.0.1","--port",port,"--compatibility-date","2026-11-02","--show-interactive-dev-session=false","--env-file",resolve(root,"scripts/cloudflare-preview.env")],{cwd:resolve(root,"cloudflare-output"),env,stdio:"inherit"});
child.on("error",error=>{console.error(error.message);process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>child.kill(signal));
