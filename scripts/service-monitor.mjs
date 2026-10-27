import {setTimeout as pause} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

export function healthURL(value){
  let url;try{url=new URL(value);}catch{throw new Error('Set POS_MONITOR_URL to the stable HTTPS website origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))
    throw new Error('The monitor requires a plain HTTPS origin without credentials, paths or query parameters.');
  return new URL('/api/health',url).href;
}
export async function probeService(origin,{request=fetch,wait=(milliseconds)=>pause(milliseconds),attempts=3,mode='website',publishableKey=''}={}){
  let url=healthURL(origin),init={headers:{Accept:'application/json'}};
  if(mode==='database'){
    if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))throw new Error('Database monitoring requires a public publishable key, never a privileged key.');
    url=new URL('/rest/v1/rpc/agri_service_health',origin).href;
    init={method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json',Accept:'application/json'},body:'{}'};
  }else if(mode!=='website')throw new Error('Choose website or database monitoring.');
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await request(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
      if(response.status===200&&response.headers.get('content-type')?.includes('application/json')){
        const data=await response.json();
        if(mode==='database'&&data===true)return {ok:true,attempts:attempt};
        const age=Date.now()-Date.parse(data?.checkedAt);
        if(mode==='website'&&data?.service==='agristore-pos'&&data.version===1&&data.status==='ok'&&typeof data.release==='string'&&data.release.length>0&&Number.isFinite(age)&&age>=-60_000&&age<=120_000)
          return {ok:true,attempts:attempt};
      }
    }catch{/* Public logs retain no raw response, URL, cookies or credentials. */}
    if(attempt<attempts)await wait(10_000);
  }
  return {ok:false,attempts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const mode=process.env.POS_MONITOR_MODE||'website';
    const result=await probeService(process.env.POS_MONITOR_URL,{mode,publishableKey:process.env.POS_MONITOR_PUBLISHABLE_KEY??''});
    const subject=mode==='database'?'Database availability (website not checked)':'Website and database availability';
    console.log(result.ok?`${subject} check passed.`:`${subject} could not be confirmed after three attempts. Follow the maintainer incident procedure.`);
    if(!result.ok)process.exitCode=1;
  }catch{console.error('Monitor configuration is invalid. Set the mode and stable HTTPS origin; database mode also needs its public publishable key. Privileged credentials are never required.');process.exitCode=1;}
}
