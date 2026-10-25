// Local component harness only. Replaces transport, not the production count component or SQL rules.
export async function command<T=Record<string,unknown>>(action:string,data:Record<string,unknown>):Promise<T>{
 const response=await fetch('/__test/command',{method:'POST',headers:{'Content-Type':'application/json','X-Count-Test-Actor':location.pathname.split('/')[1]},body:JSON.stringify({action,data})});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.message),{code:result.code});
 return result;
}
