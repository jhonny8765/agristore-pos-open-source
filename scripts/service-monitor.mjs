import {setTimeout as pause} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

export function healthURL(value){
  let url;try{url=new URL(value);}catch{throw new Error('Set POS_MONITOR_URL to the stable HTTPS website origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))
    throw new Error('The monitor requires a plain HTTPS origin without credentials, paths or query parameters.');
  return new URL('/api/health',url).href;
}
export async function probeService(origin,{request=fetch,wait=(milliseconds)=>pause(milliseconds),attempts=3}={}){
  const url=healthURL(origin);
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await request(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{Accept:'application/json'}});
      if(response.status===200&&response.headers.get('content-type')?.includes('application/json')){
        const data=await response.json(),age=Date.now()-Date.parse(data.checkedAt);
        if(data.service==='agristore-pos'&&data.version===1&&data.status==='ok'&&typeof data.release==='string'&&data.release.length>0&&Number.isFinite(age)&&age>=-60_000&&age<=120_000)
          return {ok:true,attempts:attempt};
      }
    }catch{/* Public logs retain no raw response, URL, cookies or credentials. */}
    if(attempt<attempts)await wait(10_000);
  }
  return {ok:false,attempts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await probeService(process.env.POS_MONITOR_URL);
    console.log(result.ok?'Website and database availability check passed.':'Website/database availability could not be confirmed after three attempts. Follow the maintainer incident procedure.');
    if(!result.ok)process.exitCode=1;
  }catch{console.error('Monitor configuration is invalid. Set the stable HTTPS website origin; no credentials are required.');process.exitCode=1;}
}
