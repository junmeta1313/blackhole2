export const WORLD = { width: 1920, height: 1080 };
export const STATES = Object.freeze(Object.fromEntries(['BOOT','MENU','LOADING','READY','PLAYING','WAVE_CLEAR','UPGRADE_SELECT','BOSS_INTRO','PAUSED','GAME_OVER','EXITING'].map(s=>[s,s])));
export const THEME = { friendly:'#ba85ee', white:'#eff0ff', enemy:'#ed7e89', amber:'#e6b377', shield:'#928bff', void:'#07060e' };
export const BALANCE = {
  player: { hp:100, radius:25, speed:390, damage:10, fireInterval:.2, shotSpeed:1120, dashCooldown:2, dashDuration:.15, dashSpeed:1450, invulnerability:.85, contactScale:.25, contactKnockback:70 },
  station: { hp:500, radius:80, shield:160, regeneration:8, regenerationDelay:6 },
  missile: { cooldown:8, damage:95, radius:105, speed:760, count:1 },
  emp: { cooldown:15, damage:35, radius:480, stun:2.2, bossSlow:1.2 },
  repair: { cooldown:25, amount:80, duration:5, drones:3 },
  wave: { initialBudget:8, growth:3.2, interval:2.3, minimumInterval:.55, warning:.7, rest:2.8, bossEvery:5, maximumEnemies:64 },
  boss: { hp:880, hpGrowth:.26, speed:66, radius:102, burstInterval:2.5, summonInterval:9, beamInterval:12, beamWarning:1.5, beamDamage:38, phasePause:1.2 },
  limits: { bullets:400, particles:450, events:160 },
  score: { clear:120, boss:1800, comboWindow:3, flawless:150 },
  wavePilotRecovery:25,
  startup:2.4
};
export const ENEMIES = {
  scout:{unlock:1,cost:1,hp:28,speed:76,radius:23,contact:12,score:30},
  rusher:{unlock:2,cost:1.5,hp:25,speed:99,radius:22,contact:18,score:45,chargeSpeed:265},
  tank:{unlock:3,cost:3,hp:150,speed:45,radius:39,contact:38,score:90},
  shooter:{unlock:4,cost:2,hp:55,speed:65,radius:26,contact:15,score:70,range:420,fireInterval:3,shotSpeed:290,shotDamage:9},
  splitter:{unlock:6,cost:3,hp:90,speed:69,radius:31,contact:25,score:95},
  shield:{unlock:7,cost:4,hp:85,shield:95,speed:57,radius:34,contact:25,score:130},
  drone:{unlock:Infinity,cost:0,hp:15,speed:140,radius:15,contact:7,score:15}
};
export const DIFFICULTY = { cadet:{label:'탐사 대원 · 쉬움',hp:.8,speed:.85,damage:.5,budget:.85}, pilot:{label:'정거장 조종사 · 보통',hp:1,speed:1,damage:1,budget:1}, veteran:{label:'공허의 수호자 · 어려움',hp:1.2,speed:1.12,damage:1.2,budget:1.2} };
export const DEFAULT_SETTINGS = {difficulty:'pilot',autoFire:false,aimAssist:true,sound:true,volume:.35,screenShake:true,effects:'high',tutorial:true};
export const STORAGE = 'eventHorizonStationDefense.';
export function normalizeSettings(value={}) {
  if (!value || typeof value !== 'object') value = {};
  return {...DEFAULT_SETTINGS,difficulty:Object.hasOwn(DIFFICULTY,value.difficulty)?value.difficulty:DEFAULT_SETTINGS.difficulty,
    ...Object.fromEntries(['autoFire','aimAssist','sound','screenShake','tutorial'].map(k=>[k,typeof value[k]==='boolean'?value[k]:DEFAULT_SETTINGS[k]])),
    volume:Number.isFinite(value.volume)?Math.max(0,Math.min(1,value.volume)):DEFAULT_SETTINGS.volume,effects:['high','low'].includes(value.effects)?value.effects:'high'};
}
export const UPGRADES = [
  {id:'power',category:'WEAPON',name:'고밀도 플라즈마',description:'기본 탄환 공격력 +25%',max:5,apply:g=>g.stats.damage*=1.25},
  {id:'rapid',category:'WEAPON',name:'펄스 가속기',description:'발사 간격 −15%',max:4,apply:g=>g.stats.fireInterval*=.85},
  {id:'pierce',category:'WEAPON',name:'관통 코어',description:'탄환이 적을 1기 더 관통',max:2,apply:g=>g.stats.pierce++},
  {id:'split',category:'RARE · WEAPON',name:'삼중 플라즈마',description:'옆 방향으로 약한 탄환 2발 추가',max:1,apply:g=>g.stats.split=true},
  {id:'mobility',category:'MOBILITY',name:'벡터 추진기',description:'이동속도 +12% · 대시 쿨타임 −15%',max:3,apply:g=>{g.stats.speed*=1.12;g.stats.dashCooldown*=.85;}},
  {id:'hull',category:'STATION',name:'복합 장갑',description:'정거장 최대 Hull +100 · 즉시 100 수리',max:4,apply:g=>{g.station.maxHp+=100;g.station.hp=Math.min(g.station.maxHp,g.station.hp+100);}},
  {id:'shield',category:'STATION',name:'위상 보호막',description:'보호막 최대치 +60 · 재생속도 +25%',max:4,apply:g=>{g.station.maxShield+=60;g.station.shield=g.station.maxShield;g.stats.regeneration*=1.25;}},
  {id:'pilot',category:'SURVIVAL',name:'조종석 재구성',description:'플레이어 최대 HP +25 · HP 40 회복',max:4,apply:g=>{g.player.maxHp+=25;g.player.hp=Math.min(g.player.maxHp,g.player.hp+40);}},
  {id:'missile',category:'MISSILE',name:'고폭 유도탄',description:'미사일 피해 +30% · 폭발 반경 +20%',max:4,apply:g=>{g.stats.missileDamage*=1.3;g.stats.missileRadius*=1.2;}},
  {id:'salvo',category:'RARE · MISSILE',name:'이중 발사대',description:'스킬당 유도 미사일 1발 추가',max:2,apply:g=>g.stats.missileCount++},
  {id:'emp',category:'EMP',name:'공명 증폭',description:'EMP 반경 +15% · 피해 +25%',max:3,apply:g=>{g.stats.empRadius*=1.15;g.stats.empDamage*=1.25;}},
  {id:'repair',category:'REPAIR',name:'수리 나노봇',description:'드론 수리량 +40 · 쿨타임 −10%',max:4,apply:g=>{g.stats.repairAmount+=40;g.stats.repairCooldown*=.9;}},
  {id:'cooling',category:'SYSTEM',name:'극저온 순환',description:'미사일·EMP 쿨타임 −12%',max:4,apply:g=>{g.stats.missileCooldown*=.88;g.stats.empCooldown*=.88;}}
];
