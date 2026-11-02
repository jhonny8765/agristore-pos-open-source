export function publicBackend(env, practice=false) {
  const url=env.NEXT_PUBLIC_SUPABASE_URL;
  const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url&&!key&&practice) return {url:undefined,key:undefined};
  if(!url||!key) throw new Error("A Supabase URL and PUBLIC publishable/anon key are required. Use --practice only for an unconnected demonstration.");
  const parsed=new URL(url);
  const local=["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);
  if(parsed.origin!==url || parsed.username || parsed.password || (parsed.protocol!=="https:"&&!(local&&parsed.protocol==="http:"))) throw new Error("Use a plain HTTPS Supabase origin (HTTP is permitted only on loopback).");
  let anon=false;
  try { anon=JSON.parse(Buffer.from(key.split(".")[1],"base64url").toString()).role==="anon"; }catch{/* Modern public keys are not JWTs. */}
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)&&!anon) throw new Error("Only public publishable or anon keys can be included. Privileged credentials are forbidden.");
  return {url,key};
}
