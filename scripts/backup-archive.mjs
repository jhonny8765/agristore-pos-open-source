import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat,link,unlink,readFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const magic=Buffer.from('AGRIBK01'),headerSize=20,tagSize=16;
export async function backupHash(file){
 const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');
}
/** Streaming AES-256-GCM archive. Publish only after authentication/fsync;
 * never replace an existing backup or leave failed plaintext at its target. */
export async function protectBackup(input,output,key,decrypt=false){
 if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('A separate 32-byte backup key is required.');
 const source=path.resolve(input),target=path.resolve(output);
 if(source===target)throw new Error('Choose a separate output file.');
 const sourceStat=await stat(source);if(!sourceStat.isFile()||sourceStat.size===0)throw new Error('The backup source must be a nonempty file.');
 let transform,start=0,end,header;
 if(decrypt){
  if(sourceStat.size<=headerSize+tagSize)throw new Error('The encrypted backup is incomplete.');
  const file=await open(source,'r');
  try{
   header=Buffer.alloc(headerSize);await file.read(header,0,headerSize,0);
   if(!header.subarray(0,8).equals(magic))throw new Error('Unknown encrypted backup format.');
   const tag=Buffer.alloc(tagSize);await file.read(tag,0,tagSize,sourceStat.size-tagSize);
   transform=createDecipheriv('aes-256-gcm',key,header.subarray(8));transform.setAAD(header);transform.setAuthTag(tag);
   start=headerSize;end=sourceStat.size-tagSize-1;
  }finally{await file.close();}
 }else{
  header=Buffer.concat([magic,randomBytes(12)]);transform=createCipheriv('aes-256-gcm',key,header.subarray(8));transform.setAAD(header);
 }
 const temporary=target+'.partial-'+randomUUID();let handle;
 try{
  handle=await open(temporary,'wx',0o600);
  if(!decrypt)await handle.write(header,0,headerSize,0);
  await pipeline(createReadStream(source,{start,...(end===undefined?{}:{end})}),transform,
   createWriteStream(temporary,{fd:handle.fd,autoClose:false,start:decrypt?0:headerSize}));
  if(!decrypt)await handle.write(transform.getAuthTag(),0,tagSize,headerSize+sourceStat.size);
  await handle.sync();await handle.close();handle=undefined;
  // A same-directory hard link publishes atomically and fails if target exists.
  // Unsupported filesystems fail safely rather than replacing an old backup.
  await link(temporary,target);
  return {sha256:await backupHash(target),bytes:(await stat(target)).size};
 }finally{
  if(handle)await handle.close().catch(()=>{});
  await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,input,output]=process.argv.slice(2);
 try{
  if(!['encrypt','decrypt'].includes(mode)||!input||!output||!process.env.POS_BACKUP_KEY_FILE)throw new Error('Missing backup arguments.');
  const key=await readFile(process.env.POS_BACKUP_KEY_FILE);
  const result=await protectBackup(input,output,key,mode==='decrypt');
  console.log(JSON.stringify({status:'complete',sha256:result.sha256,bytes:result.bytes}));
 }catch{console.error('Backup protection failed. Preserve the original source and key. Verify a separate 32-byte key, source, unused output path, available space and a filesystem supporting hard links. No backup or restore success is claimed.');process.exitCode=1;}
}
