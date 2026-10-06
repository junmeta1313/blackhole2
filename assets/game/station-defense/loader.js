const names=['background','station','player','scout','rusher','tank','shooter','shield','boss'];
let cached=null;
export function loadAssets(onProgress=()=>{}) {
  if(cached){onProgress(100);return Promise.resolve(cached);}
  let completed=0;
  return Promise.all(names.map(name=>new Promise(resolve=>{
    const image=new Image();let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);onProgress(Math.round(++completed/names.length*100));resolve([name,value]);};
    const timeout=setTimeout(()=>finish(null),12000);
    image.onload=()=>image.decode().then(()=>finish(image),()=>finish(image));image.onerror=()=>finish(null);
    image.src=new URL(`./art/${name}.webp`,import.meta.url).href;
  }))).then(entries=>{cached=Object.fromEntries(entries);return cached;});
}
