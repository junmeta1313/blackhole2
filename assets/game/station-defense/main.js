import { Game } from './engine.js';
import { STATES, BALANCE as B, STORAGE, normalizeSettings } from './config.js';
import { InputManager, isTouchOnly } from './input.js';
import { loadAssets } from './loader.js';
import { Renderer } from './renderer.js';
import { AudioManager } from './audio.js';
const el=id=>document.getElementById(id),shell=el('sd-shell'),dialog=el('sd-settings'),form=el('sd-settings-form');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(STORAGE+key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(STORAGE+key,JSON.stringify(value));}catch{/* Storage may be unavailable. */}};
let settings=normalizeSettings(read('settings',{})),game=null,renderer=null,input=null,audio=null,active=false,frame=0,generation=0,lastTime=0,accumulator=0,hudTime=0,displayState='',bodyOverflow='',hadFullscreen=false,bannerUntil=0,pendingPause=false,hintSeen=read('tutorialSeen',false);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced)settings.screenShake=false;
function refreshBest(){el('sd-best-score').textContent=Number(read('bestScore',0)).toLocaleString('ko-KR');el('sd-best-wave').textContent=read('bestWave',0);}
function saveBest(){if(!game)return;write('bestScore',Math.max(Number(read('bestScore',0))||0,game.score));write('bestWave',Math.max(Number(read('bestWave',0))||0,game.wave));refreshBest();}
function button(text,action,primary=false){const node=document.createElement('button');node.type='button';node.className='sd-button'+(primary?' sd-primary':'');node.textContent=text;node.onclick=action;return node;}
function panel(kicker,title,description){const container=el('sd-panel');container.replaceChildren();const label=document.createElement('div');label.className='sd-kicker';label.textContent=kicker;const heading=document.createElement('h2');heading.textContent=title;const copy=document.createElement('p');copy.textContent=description;container.append(label,heading,copy);return container;}
function actions(container,items){const row=document.createElement('div');row.className='sd-actions';row.append(...items);container.append(row);}
function requestFullscreen(){
  if(!shell.requestFullscreen || document.fullscreenElement===shell)return Promise.resolve();
  try{return shell.requestFullscreen({navigationUI:'hide'}).catch(()=>{/* Fixed viewport is already active. */});}catch{return Promise.resolve();}
}
function resume(){if(!active||!game||dialog.open)return;audio?.activate();requestFullscreen();input?.clear();game.resume();displayState='';lastTime=0;accumulator=0;el('sd-canvas')?.focus({preventScroll:true});}
function pause(){if(!active)return;if(!game){pendingPause=true;return;}if(game.pause()){input?.clear();audio?.suspend();displayState='';syncState();}}
function syncState(){
  if(!game||game.state===displayState)return;displayState=game.state;input?.clear();const overlay=el('sd-overlay');overlay.hidden=true;el('sd-pause').disabled=game.state===STATES.GAME_OVER;
  if(game.state===STATES.PAUSED){overlay.hidden=false;const box=panel('DEFENSE SYSTEM · PAUSED','PAUSED','전투가 일시정지되었습니다. 준비되면 직접 계속하기를 눌러주세요.');actions(box,[button('전체화면으로 계속하기',resume,true),button('게임 설정',openSettings),button('게임 종료',exit)]);box.querySelector('button')?.focus({preventScroll:true});}
  else if(game.state===STATES.UPGRADE_SELECT){overlay.hidden=false;const box=panel(`WAVE ${game.wave} CLEAR · UPGRADE`,'다음 방어를 준비하세요','클릭 또는 숫자 1 · 2 · 3으로 하나를 선택하세요. 전투 시간은 흐르지 않습니다.');const cards=document.createElement('div');cards.className='sd-upgrades';game.choices.forEach((choice,index)=>{const card=document.createElement('button');card.type='button';card.className='sd-upgrade';const category=document.createElement('small'),title=document.createElement('strong'),copy=document.createElement('span');category.textContent=`[${index+1}] ${choice.category} · Lv.${(game.levels[choice.id]||0)+1}/${choice.max}`;title.textContent=choice.name;copy.textContent=choice.description;card.append(category,title,copy);card.onclick=()=>choose(index);cards.append(card);});box.append(cards);cards.querySelector('button')?.focus({preventScroll:true});}
  else if(game.state===STATES.GAME_OVER){saveBest();overlay.hidden=false;const box=panel('EVENT HORIZON · DEFENSE TERMINATED',game.station.hp<=0?'STATION LOST':'PILOT LOST',game.lastResult);const results=document.createElement('div');results.className='sd-results';for(const [label,value] of [['SCORE',game.score.toLocaleString('ko-KR')],['WAVE',game.wave],['KILLS',game.kills],['SURVIVAL TIME',`${Math.floor(game.elapsed/60)}:${String(Math.floor(game.elapsed%60)).padStart(2,'0')}`],['BEST SCORE',Number(read('bestScore',0)).toLocaleString('ko-KR')],['BEST WAVE',read('bestWave',0)]]){const cell=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong');name.textContent=label;amount.textContent=value;cell.append(name,amount);results.append(cell);}box.append(results);actions(box,[button('다시 시작',retry,true),button('게임 종료',exit)]);box.querySelector('button')?.focus({preventScroll:true});}
  if(game.state===STATES.READY)banner('DEFENSE ONLINE','정거장 활성화 · 요격기 출격',3000);
  if(game.state===STATES.BOSS_INTRO)banner('WARNING','MASSIVE SIGNAL DETECTED · VOID DREADNOUGHT',2700);
  if(game.state===STATES.WAVE_CLEAR)banner(`WAVE ${game.wave} CLEAR`,`STATION INTEGRITY ${Math.round(game.station.hp/game.station.maxHp*100)}% · 다음 무장을 선택하세요`,2800);
}
function choose(index){if(game?.selectUpgrade(index)){audio?.activate();input?.clear();el('sd-canvas')?.focus({preventScroll:true});displayState='';syncState();}}
function banner(title,subtitle,duration){const node=el('sd-banner');node.replaceChildren();node.append(document.createTextNode(title));const sub=document.createElement('small');sub.textContent=subtitle;node.append(sub);node.hidden=false;bannerUntil=performance.now()+duration;}
function syncHud(){
  const g=game,p=g.player,s=g.station;el('sd-score').textContent=String(g.score).padStart(5,'0');el('sd-wave').textContent=String(Math.max(1,g.wave)).padStart(2,'0');el('sd-kills').textContent=String(g.kills).padStart(2,'0');
  for(const [name,value,max] of [['player',p.hp,p.maxHp],['shield',s.shield,s.maxShield],['hull',s.hp,s.maxHp]]){el(`sd-${name}-value`).textContent=`${Math.ceil(value)} / ${max}`;el(`sd-${name}-bar`).style.width=`${Math.max(0,value/max*100)}%`;}
  const boss=g.enemies.find(e=>e.type==='boss');el('sd-boss').hidden=!boss;if(boss){el('sd-boss-bar').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;el('sd-boss-value').textContent=`${Math.ceil(boss.hp/boss.maxHp*100)}% · PHASE ${boss.phase}`;}
  for(const name of ['missile','emp','repair']){const node=el(`sd-${name}`),remaining=g.cooldowns[name],maximum=g.stats[`${name}Cooldown`];let status=remaining>0?`${remaining.toFixed(1)}s`:'READY';const unavailable=name==='repair'&&s.hp>=s.maxHp;if(unavailable)status='HULL FULL';node.style.setProperty('--cooldown',`${remaining/maximum*100}%`);node.querySelector('small').textContent=status;node.classList.toggle('ready',remaining<=0&&!unavailable);node.disabled=g.state!==STATES.PLAYING||remaining>0||unavailable;}
  el('sd-dash-value').textContent=g.cooldowns.dash>0?`${g.cooldowns.dash.toFixed(1)}s`:'READY';el('sd-dash-bar').style.width=`${(1-g.cooldowns.dash/g.stats.dashCooldown)*100}%`;
  el('sd-sound').textContent=settings.sound?'SOUND ON':'SOUND OFF';
  if(settings.tutorial&&!hintSeen&&g.state===STATES.PLAYING){const seconds=g.elapsed;el('sd-hint').textContent=seconds<5?'↑ ↓ ← → · 이동한 방향으로 조준':seconds<10?'SPACE · 플라즈마 연속 사격':seconds<15?'SHIFT · 짧은 무적 대시':seconds<22?'1 미사일 · 2 EMP · 3 정거장 수리':'웨이브 종료 후 숫자키로 업그레이드를 선택하세요';if(seconds>28){hintSeen=true;write('tutorialSeen',true);el('sd-hint').textContent='';}}
  else el('sd-hint').textContent='';
}
function loop(now){
  if(!active||!game)return;
  const dt=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;accumulator+=dt;
  const controls=input.snapshot();let steps=0;
  while(accumulator>=1/60&&steps++<6){game.update(1/60,controls);accumulator-=1/60;}
  for(const event of game.drainEvents()){renderer.event(event);audio.play(event.type);if(event.type==='wave')banner(`WAVE ${event.wave}`,'공허의 함대를 저지하십시오.',1700);}
  renderer.effects(game.state===STATES.PAUSED?0:dt);renderer.render(game);syncState();hudTime+=dt;if(hudTime>.1){syncHud();hudTime=0;}
  if(now>bannerUntil)el('sd-banner').hidden=true;
  frame=requestAnimationFrame(loop);
}
async function start(){
  if(active)return;
  if(isTouchOnly()){el('sd-pc-only').showModal();return;}
  active=true;const ticket=++generation;hadFullscreen=false;pendingPause=false;shell.hidden=false;bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';el('sd-hud').hidden=true;el('sd-overlay').hidden=false;el('sd-pause').disabled=true;el('sd-settings-live').disabled=true;
  requestFullscreen();audio=new AudioManager(settings);audio.activate();
  const loading=panel('INITIALIZING DEFENSE SYSTEM','LOADING','전투 에셋을 준비하고 있습니다.');const progress=document.createElement('p');progress.id='sd-loading-progress';progress.textContent='0%';loading.append(progress);
  const images=await loadAssets(percent=>{if(ticket===generation)progress.textContent=`${percent}%`;});
  if(!active||ticket!==generation)return;
  const canvas=document.createElement('canvas');canvas.id='sd-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','정거장 방어 전투 화면. 방향키로 이동하고 Space로 발사하세요.');el('sd-canvas-wrap').replaceChildren(canvas);
  game=new Game(settings);renderer=new Renderer(canvas,images,settings);
  input=new InputManager((command,index)=>{if(command==='upgrade'&&game.state===STATES.UPGRADE_SELECT){choose(index);return true;}if(command==='pause'){if(dialog.open)dialog.close();else if(game.state===STATES.PAUSED){if(index==='KeyP')resume();}else pause();}return false;},()=>active);
  el('sd-hud').hidden=false;el('sd-settings-live').disabled=false;displayState='';lastTime=0;accumulator=0;hudTime=1;bannerUntil=0;syncState();syncHud();canvas.focus({preventScroll:true});frame=requestAnimationFrame(loop);
  if(document.hidden||pendingPause)pause();
}
function retry(){if(!active||!game)return;saveBest();game=new Game(settings);renderer.particles=[];renderer.rings=[];renderer.ghosts=[];renderer.beams=[];renderer.shake=0;input.clear();audio.activate();displayState='';lastTime=0;accumulator=0;syncState();syncHud();requestFullscreen();el('sd-canvas').focus({preventScroll:true});}
function exit(){
  if(!active)return;active=false;generation++;saveBest();if(game)game.state=STATES.EXITING;cancelAnimationFrame(frame);frame=0;input?.destroy();input=null;audio?.close();audio=null;renderer=null;game=null;dialog.close();el('sd-canvas-wrap').replaceChildren();el('sd-hud').hidden=true;el('sd-banner').hidden=true;el('sd-hint').textContent='';shell.hidden=true;document.body.style.overflow=bodyOverflow;hadFullscreen=false;
  if(document.fullscreenElement===shell)document.exitFullscreen().catch(()=>{});el('sd-start').focus({preventScroll:true});
}
function openSettings(){
  if(active)pause();else document.body.append(dialog);
  if(active&&dialog.parentElement!==shell)shell.append(dialog);
  for(const name of ['difficulty','autoFire','aimAssist','sound','volume','screenShake','effects','tutorial']){const node=form.elements.namedItem(name);if(node.type==='checkbox')node.checked=settings[name];else node.value=name==='volume'?Math.round(settings.volume*100):settings[name];}
  form.elements.difficulty.disabled=active;el('sd-settings-help').textContent=active?' 난이도는 다음 게임에서 변경할 수 있습니다. 나머지 설정은 저장 즉시 적용됩니다. 저장 후 계속하기를 눌러주세요.':'설정은 이 브라우저에 저장됩니다. 조준 보조는 마지막 이동 방향 근처의 적에만 작동합니다.';
  dialog.showModal();
}
form.addEventListener('submit',event=>{event.preventDefault();const value={};for(const name of ['difficulty','autoFire','aimAssist','sound','volume','screenShake','effects','tutorial']){const node=form.elements.namedItem(name);value[name]=node.type==='checkbox'?node.checked:name==='volume'?Number(node.value)/100:node.value;}settings=normalizeSettings(value);if(reduced)settings.screenShake=false;write('settings',settings);if(game)game.settings=settings;if(renderer)renderer.settings=settings;if(audio){audio.settings=settings;if(!settings.sound)audio.stop();}dialog.close();if(game)syncHud();});
el('sd-settings-cancel').onclick=()=>dialog.close();el('sd-start').onclick=start;el('sd-settings-open').onclick=openSettings;el('sd-settings-live').onclick=openSettings;el('sd-exit').onclick=exit;el('sd-pause').onclick=pause;
el('sd-sound').onclick=()=>{settings.sound=!settings.sound;write('settings',settings);if(audio){audio.settings=settings;if(!settings.sound)audio.stop();}if(game)syncHud();};
for(const name of ['missile','emp','repair'])el(`sd-${name}`).onclick=()=>{game?.skill(name);el('sd-canvas')?.focus({preventScroll:true});};
window.addEventListener('resize',()=>renderer?.resize());
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('fullscreenchange',()=>{if(!active)return;if(document.fullscreenElement===shell)hadFullscreen=true;else if(hadFullscreen){hadFullscreen=false;pause();}renderer?.resize();});
window.addEventListener('pagehide',exit);
refreshBest();
