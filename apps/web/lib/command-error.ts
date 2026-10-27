export function commandError(error:{message:string;code?:string},status?:number){
 const expired=status===401||["PGRST301","PGRST302","PGRST303"].includes(error.code??"");
 const message=expired?"Your online sign-in needs renewal. Preserve this basket and every saved record. Reconnect and sign in as the original employee before retrying the original request in Sync center. Signing out clears an unfinished basket, so record its items first. Never re-enter a completed sale or clear browser data.":error.code==="42501"?`${error.message} Your account or role could not authorize this action. Ask the owner to check access; keep the original request and saved sales for recovery. Do not create another request to bypass the refusal.`:error.message;
 return Object.assign(new Error(message),{code:error.code,status,authenticationRequired:expired});
}
