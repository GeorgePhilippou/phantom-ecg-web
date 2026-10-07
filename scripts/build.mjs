/* Copy only website assets and version their URLs to prevent stale module caches. */
import fs from 'node:fs';
const destination='_site', release=process.env.GITHUB_SHA||'local';
fs.mkdirSync(destination,{recursive:true});
for(const file of ['index.html','app.mjs','edf.mjs','worker.mjs','style.css']){
 let text=fs.readFileSync(file,'utf8');
 if(file.endsWith('.mjs')||file==='index.html')text=text.replace(/((?:app|edf|worker)\.mjs|style\.css)(?=["'])/g,`$1?v=${release}`);
 fs.writeFileSync(`${destination}/${file}`,text);
}
fs.cpSync('vendor',`${destination}/vendor`,{recursive:true});
fs.writeFileSync(`${destination}/.nojekyll`,'');
console.log('Static viewer prepared with versioned module and stylesheet URLs.');
