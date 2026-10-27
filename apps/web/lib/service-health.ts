export async function serviceHealth(url:string|undefined,key:string|undefined,release:string,request:typeof fetch=fetch){
  let available=false;
  if(url&&key){
    try{
      const response=await request(`${url.replace(/\/$/,"")}/rest/v1/rpc/agri_service_health`,{
        method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:"{}",
        cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5_000),
      });
      available=response.ok&&(await response.json())===true;
    }catch{/* Do not expose database URLs, keys, response bodies or raw errors. */}
  }
  return Response.json({service:"agristore-pos",version:1,status:available?"ok":"unavailable",release,checkedAt:new Date().toISOString()},
    {status:available?200:503,headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex"}});
}
