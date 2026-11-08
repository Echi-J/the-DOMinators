import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'dist');
await fs.rm(dist,{recursive:true,force:true});
await fs.cp(path.join(root,'Website'),dist,{recursive:true});
console.log('Built static website in dist/');
