import {cp,mkdir,mkdtemp,readdir,readFile,writeFile,rm,realpath,stat} from "node:fs/promises";
import {resolve,relative,join,basename,dirname,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {build} from "esbuild";
import {zipSync} from "fflate";
import {publicBackend} from "./cloudflare-config.mjs";

const root=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const backend=publicBackend(process.env,process.argv.includes("--practice"));
const release=`cf-${Date.now().toString(36)}`;
const marker="agristore-cloudflare-build-v1\n";
const output=join(root,"cloudflare-output");
async function safeRemove(path,prefix) {
  const actual=await realpath(path);
  if(dirname(actual)!==root||!basename(actual).startsWith(prefix)||(await readFile(join(actual,".generated-by-agristore"),"utf8"))!==marker) throw new Error("Refusing to remove an unrecognized build directory.");
  await rm(actual,{recursive:true});
}
async function files(path) {
  const result=[];
  for(const entry of await readdir(path,{withFileTypes:true})) {
    if(entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in deployment assets.");
    const full=join(path,entry.name);
    if(entry.isDirectory()) result.push(...await files(full)); else result.push(full);
  }
  return result;
}
const app=join(root,"apps/web");
const routes=(await files(join(app,"app"))).filter(path=>/[/\\]route\.[cm]?[jt]sx?$/.test(path)).map(path=>relative(app,path).split(sep).join("/"));
if(routes.length!==1||routes[0]!=="app/api/health/route.ts") throw new Error("Review server routes before exporting: only the known health route may be replaced.");
const temporary=await mkdtemp(join(root,".cloudflare-build-"));
await writeFile(join(temporary,".generated-by-agristore"),marker);
try {
  const project=join(temporary,"web");
  await mkdir(project);
  for(const name of ["app","components","lib","scripts","public","next.config.ts","package.json","tsconfig.json","postcss.config.mjs","next-env.d.ts","types.d.ts"]) {
    await cp(join(app,name),join(project,name),{recursive:true,filter:source=>{
      const rel=relative(app,source).split(sep).join("/");
      return rel!=="app/api/health/route.ts"&&!/^public\/(sw\.js(?:\.map)?|workbox-.*|offline\.html)$/.test(rel);
    }});
  }
  // Bundle the configuration's local TypeScript imports explicitly. Next's
  // CommonJS config loader cannot resolve them reliably in an isolated Windows copy.
  await build({entryPoints:[join(project,"next.config.ts")],outfile:join(project,"next.config.mjs"),bundle:true,format:"esm",platform:"node",packages:"external",external:["./scripts/build-sw.mjs"]});
  await rm(join(project,"next.config.ts"));
  const env={...process.env,AGRISTORE_CLOUDFLARE_BUILD:"1",NEXT_PUBLIC_APP_RELEASE:release};
  await new Promise((done,fail)=>{
    const child=spawn(process.execPath,[join(root,"node_modules/next/dist/bin/next"),"build",project,"--webpack"],{cwd:root,env,stdio:"inherit"});
    child.on("error",fail);child.on("exit",code=>code===0?done():fail(new Error(`Static build failed (${code}).`)));
  });
  const site=join(temporary,"site");
  await cp(join(project,"out"),site,{recursive:true});
  const defines={PUBLIC_API_URL:JSON.stringify(backend.url)??"undefined",PUBLIC_API_KEY:JSON.stringify(backend.key)??"undefined",APP_RELEASE:JSON.stringify(release)};
  await build({entryPoints:[join(app,"lib/cloudflare-worker.ts")],outfile:join(site,"_worker.js"),bundle:true,format:"esm",platform:"browser",target:"es2022",define:defines,minify:true});
  await build({entryPoints:[join(app,"lib/cloudflare-host.ts")],outfile:join(temporary,"host.mjs"),bundle:true,format:"esm",platform:"node"});
  const {pagesHeaders}=await import(pathToFileURL(join(temporary,"host.mjs")).href);
  await writeFile(join(site,"_headers"),pagesHeaders(backend.url));
  await writeFile(join(site,"_routes.json"),JSON.stringify({version:1,include:["/api/health"],exclude:[]}));
  const assets={};
  for(const file of await files(site)) {
    const rel=relative(site,file).split(sep).join("/");
    if(/(^|\/)(\.env[^/]*|node_modules|\.git)(\/|$)|\.map$|\.(ts|tsx)$/.test(rel)) throw new Error(`Forbidden deployment asset: ${rel}`);
    if((await stat(file)).size>25*1024*1024) throw new Error("Pages asset exceeds the Free plan limit.");
    assets[rel]=new Uint8Array(await readFile(file));
  }
  if(Object.keys(assets).length>1000) throw new Error("Artifact exceeds the conservative dashboard upload limit; review before deployment.");
  for(const required of ["index.html","404.html","sw.js","manifest.webmanifest","_worker.js","_headers","_routes.json"]) if(!assets[required]) throw new Error(`Missing deployment asset: ${required}`);
  const zip=zipSync(assets,{level:6});
  const report={release,configured:!!backend.url,createdAt:new Date().toISOString(),fileCount:Object.keys(assets).length,zipBytes:zip.length,sha256:createHash("sha256").update(zip).digest("hex"),health:"/api/health",physicalEndurancePassed:false};
  try { await stat(output); await safeRemove(output,"cloudflare-output"); } catch(error) {if(error.code!=="ENOENT") throw error;}
  await mkdir(output);await writeFile(join(output,".generated-by-agristore"),marker);
  await cp(site,join(output,"site"),{recursive:true});
  await writeFile(join(output,"agristore-pos-cloudflare.zip"),zip);
  await writeFile(join(output,"build-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
} finally { await safeRemove(temporary,".cloudflare-build-"); }
