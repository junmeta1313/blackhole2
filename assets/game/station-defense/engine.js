import { WORLD, STATES, BALANCE as B, ENEMIES, DIFFICULTY, UPGRADES, normalizeSettings } from './config.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const direction=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
export class Game {
  constructor(settings={},random=Math.random) { this.random=random;this.settings=normalizeSettings(settings);this.state=STATES.BOOT;this.reset(); }
  reset() {
    this.state=STATES.READY;this.previousState=null;this.timer=B.startup;this.elapsed=0;this.wave=0;this.score=0;this.kills=0;this.combo=0;this.comboTimer=0;this.flawless=true;this.nextId=1;
    this.player={x:WORLD.width/2,y:WORLD.height/2+165,hp:B.player.hp,maxHp:B.player.hp,radius:B.player.radius,angle:-Math.PI/2,invulnerable:0,dashTime:0,dashAngle:0};
    this.station={x:WORLD.width/2,y:WORLD.height/2,hp:B.station.hp,maxHp:B.station.hp,shield:B.station.shield,maxShield:B.station.shield,radius:B.station.radius,lastHit:0,repairTime:0,flash:0};
    this.stats={speed:B.player.speed,damage:B.player.damage,fireInterval:B.player.fireInterval,pierce:0,split:false,dashCooldown:B.player.dashCooldown,regeneration:B.station.regeneration,missileDamage:B.missile.damage,missileRadius:B.missile.radius,missileCount:B.missile.count,missileCooldown:B.missile.cooldown,empDamage:B.emp.damage,empRadius:B.emp.radius,empCooldown:B.emp.cooldown,repairAmount:B.repair.amount,repairCooldown:B.repair.cooldown};
    this.cooldowns={fire:0,dash:0,missile:0,emp:0,repair:0};this.levels={};this.choices=[];this.enemies=[];this.bullets=[];this.warnings=[];this.events=[];this.queue=[];this.spawnTimer=0;this.lastResult='';
  }
  emit(type,data={}) { if(this.events.length<B.limits.events)this.events.push({type,...data}); }
  drainEvents() { const events=this.events;this.events=[];return events; }
  pause() { if(![STATES.PAUSED,STATES.GAME_OVER,STATES.EXITING,STATES.MENU,STATES.BOOT].includes(this.state)){this.previousState=this.state;this.state=STATES.PAUSED;return true;}return false; }
  resume() { if(this.state===STATES.PAUSED){this.state=this.previousState;this.previousState=null;} }
  sectorPosition() {
    const sector=Math.floor(this.random()*4),margin=42;
    if(sector===0)return{x:margin+this.random()*(WORLD.width-margin*2),y:margin};
    if(sector===1)return{x:WORLD.width-margin,y:margin+this.random()*(WORLD.height-margin*2)};
    if(sector===2)return{x:margin+this.random()*(WORLD.width-margin*2),y:WORLD.height-margin};
    return{x:margin,y:margin+this.random()*(WORLD.height-margin*2)};
  }
  waveComposition() {
    let budget=(B.wave.initialBudget+Math.max(0,this.wave-1)*B.wave.growth)*DIFFICULTY[this.settings.difficulty].budget;
    const unlocked=Object.entries(ENEMIES).filter(([,e])=>e.unlock<=this.wave);
    const queue=[];
    while(budget>=1 && queue.length<60){
      const available=unlocked.filter(([,e])=>e.cost<=budget);
      if(!available.length)break;
      const [type,enemy]=available[Math.floor(this.random()*available.length)];queue.push(type);budget-=enemy.cost;
    }
    return queue;
  }
  startWave() {
    this.wave++;this.flawless=true;this.bullets=[];this.warnings=[];this.timer=0;
    this.player.hp=Math.min(this.player.maxHp,this.player.hp+B.wavePilotRecovery);
    if(this.wave%B.wave.bossEvery===0){this.state=STATES.BOSS_INTRO;this.timer=2.6;this.queue=[];this.emit('bossWarning');}
    else {this.state=STATES.PLAYING;this.queue=this.waveComposition();this.spawnTimer=.6;this.emit('wave',{wave:this.wave});}
  }
  spawn(type,pos=this.sectorPosition()) {
    if(this.enemies.length>=B.wave.maximumEnemies)return null;
    const boss=type==='boss',base=boss?B.boss:ENEMIES[type],d=DIFFICULTY[this.settings.difficulty];
    const hp=base.hp*d.hp*(boss?1+Math.max(0,this.wave/5-1)*B.boss.hpGrowth:1+Math.max(0,this.wave-1)*.045);
    const enemy={id:this.nextId++,type,...pos,hp,maxHp:hp,radius:base.radius,speed:base.speed*d.speed,angle:Math.PI/2,shield:base.shield||0,maxShield:base.shield||0,stun:0,slow:0,flash:0,age:0,cooldown:1.5+this.random(),chargeTimer:3,chargeTime:0,phase:1,phasePause:0,burstTimer:2,summonTimer:8,beamTimer:10,beamCharge:0,beamAngle:0};
    this.enemies.push(enemy);return enemy;
  }
  nearestEnemy(pos=this.player) { let closest=null,d=Infinity;for(const e of this.enemies){const next=distance(e,pos);if(e.hp>0 && next<d){closest=e;d=next;}}return closest; }
  projectile(data) { if(this.bullets.length<B.limits.bullets)this.bullets.push({id:this.nextId++,life:2.5,radius:6,hits:[],...data}); }
  fire() {
    if(this.cooldowns.fire>0)return;
    const p=this.player,target=this.nearestEnemy();let angle=p.angle;
    if(this.settings.aimAssist && target){const toward=direction(p,target),delta=Math.atan2(Math.sin(toward-angle),Math.cos(toward-angle));if(Math.abs(delta)<.45)angle+=delta*.85;}
    for(const offset of this.stats.split?[-.16,0,.16]:[0])this.projectile({x:p.x+Math.cos(angle)*30,y:p.y+Math.sin(angle)*30,angle:angle+offset,speed:B.player.shotSpeed,damage:this.stats.damage*(offset?.6:1),owner:'player',kind:'plasma',pierce:this.stats.pierce,life:1.9});
    this.cooldowns.fire=this.stats.fireInterval;this.emit('shot',{x:p.x,y:p.y});
  }
  skill(name) {
    if(this.state!==STATES.PLAYING || this.cooldowns[name]>0)return false;
    const p=this.player;
    if(name==='dash') {p.dashTime=B.player.dashDuration;p.dashAngle=p.angle;p.invulnerable=Math.max(p.invulnerable,B.player.dashDuration+.1);this.cooldowns.dash=this.stats.dashCooldown;this.emit('dash',{x:p.x,y:p.y,angle:p.angle});}
    else if(name==='missile') {
      const target=this.nearestEnemy();if(!target)return false;
      for(let n=0;n<this.stats.missileCount;n++)this.projectile({x:p.x+(n-(this.stats.missileCount-1)/2)*20,y:p.y,angle:p.angle,speed:B.missile.speed,damage:this.stats.missileDamage,owner:'player',kind:'missile',target:target.id,radius:10,blast:this.stats.missileRadius,life:5});
      this.cooldowns.missile=this.stats.missileCooldown;this.emit('missile',{x:p.x,y:p.y});
    } else if(name==='emp') {
      const center=this.station;
      for(const enemy of [...this.enemies])if(distance(enemy,center)<=this.stats.empRadius){this.damageEnemy(enemy,this.stats.empDamage,true);if(enemy.type==='boss')enemy.slow=B.emp.bossSlow;else enemy.stun=B.emp.stun;}
      this.bullets=this.bullets.filter(b=>b.owner!=='enemy'||distance(b,center)>this.stats.empRadius);
      this.cooldowns.emp=this.stats.empCooldown;this.emit('emp',{x:center.x,y:center.y,radius:this.stats.empRadius});
    } else if(name==='repair') {
      if(this.station.hp>=this.station.maxHp || this.station.repairTime>0)return false;
      this.station.repairTime=B.repair.duration;this.cooldowns.repair=this.stats.repairCooldown;this.emit('repair');
    } else return false;
    return true;
  }
  damageEnemy(enemy,amount,ignoreShield=false) {
    if(enemy.hp<=0)return;
    if(enemy.shield>0 && !ignoreShield){const absorbed=Math.min(enemy.shield,amount);enemy.shield-=absorbed;amount-=absorbed;}
    enemy.hp-=amount;enemy.flash=.1;this.emit('hit',{x:enemy.x,y:enemy.y});
    if(enemy.hp>0)return;
    this.kills++;this.combo=this.comboTimer>0?Math.min(8,this.combo+1):1;this.comboTimer=B.score.comboWindow;
    this.score+=Math.round((enemy.type==='boss'?B.score.boss:ENEMIES[enemy.type].score)*(1+(this.combo-1)*.08));
    this.emit(enemy.type==='boss'?'bossDestroyed':'destroyed',{x:enemy.x,y:enemy.y,radius:enemy.radius});
    if(enemy.type==='splitter')for(let n=0;n<3;n++){const drone=this.spawn('drone',{x:enemy.x+Math.cos(n*Math.PI*2/3)*25,y:enemy.y+Math.sin(n*Math.PI*2/3)*25});if(drone)drone.stun=.65;}
  }
  damageStation(amount) {
    const s=this.station;amount*=DIFFICULTY[this.settings.difficulty].damage;const shield=s.shield>0;
    const absorbed=Math.min(s.shield,amount);s.shield-=absorbed;s.hp=Math.max(0,s.hp-(amount-absorbed));s.lastHit=0;s.flash=.2;this.flawless=false;
    this.emit(shield?'shieldHit':'hullHit',{x:s.x,y:s.y,radius:s.radius});
  }
  damagePlayer(amount) {
    const p=this.player;if(p.invulnerable>0)return false;
    p.hp=Math.max(0,p.hp-amount*DIFFICULTY[this.settings.difficulty].damage);p.invulnerable=B.player.invulnerability;this.flawless=false;this.emit('playerHit',{x:p.x,y:p.y,radius:p.radius});return true;
  }
  enemyShot(enemy,angle,damage=ENEMIES.shooter.shotDamage) {this.projectile({x:enemy.x,y:enemy.y,angle,speed:ENEMIES.shooter.shotSpeed,damage,owner:'enemy',kind:'enemy',life:7,radius:8});}
  updateBoss(e,dt) {
    if(e.hp<=e.maxHp*.5 && e.phase===1){e.phase=2;e.phasePause=B.boss.phasePause;e.beamCharge=0;this.emit('bossPhase',{x:e.x,y:e.y,radius:200});}
    if(e.phasePause>0){e.phasePause-=dt;return;}
    const acceleration=e.phase===2?1.35:1;
    e.x=WORLD.width/2+Math.sin(e.age*.22)*420;e.y=190+Math.sin(e.age*.38)*45;e.angle=direction(e,this.station);
    e.burstTimer-=dt*acceleration;e.summonTimer-=dt*acceleration;e.beamTimer-=dt*acceleration;
    if(e.burstTimer<=0){const target=direction(e,this.player);for(let i=-3;i<=3;i++)this.enemyShot(e,target+i*.19,12);e.burstTimer=B.boss.burstInterval;this.emit('bossBurst',{x:e.x,y:e.y});}
    if(e.summonTimer<=0){for(let i=0;i<3;i++)this.warnings.push({type:i%2?'rusher':'scout',x:clamp(e.x+(i-1)*150,70,WORLD.width-70),y:e.y+100,time:B.wave.warning});e.summonTimer=B.boss.summonInterval;}
    if(e.beamCharge>0){e.beamCharge-=dt;if(e.beamCharge<=0){const s=this.station;this.damageStation(B.boss.beamDamage);const p=this.player,a={x:e.x,y:e.y},b={x:s.x,y:s.y},vx=b.x-a.x,vy=b.y-a.y,t=clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy),0,1);if(Math.hypot(p.x-a.x-t*vx,p.y-a.y-t*vy)<55)this.damagePlayer(32);this.emit('beam',{x:e.x,y:e.y,toX:s.x,toY:s.y});}}
    else if(e.beamTimer<=0){e.beamCharge=B.boss.beamWarning;e.beamAngle=direction(e,this.station);e.beamTimer=B.boss.beamInterval;this.emit('beamWarning');}
  }
  updateEnemy(e,dt) {
    e.age+=dt;e.flash=Math.max(0,e.flash-dt);e.slow=Math.max(0,e.slow-dt);
    if(e.stun>0){e.stun-=dt;return;}
    if(e.type==='boss'){this.updateBoss(e,dt);return;}
    const base=ENEMIES[e.type],s=this.station,p=this.player;let target=s,speed=e.speed*(e.slow>0?.4:1);
    if(e.type==='drone' && distance(e,p)<320)target=p;
    if(e.type==='shooter') {
      const dist=distance(e,s);e.cooldown-=dt;
      if(distance(e,p)<160){target={x:e.x+(e.x-p.x),y:e.y+(e.y-p.y)};}
      else if(dist<base.range){speed=0;if(e.cooldown<=0){this.enemyShot(e,direction(e,e.age%6<3?p:s));e.cooldown=base.fireInterval;}}
    }
    e.angle=direction(e,target);
    if(e.type==='rusher'){
      e.chargeTimer-=dt;
      if(e.chargeTime>0){e.chargeTime-=dt;speed=base.chargeSpeed;}
      else if(e.chargeTimer<=0){e.chargeTime=.75;e.chargeTimer=3;}
      else if(e.chargeTimer<.55)speed*=.22;
    }
    e.x+=Math.cos(e.angle)*speed*dt;e.y+=Math.sin(e.angle)*speed*dt;
    if(distance(e,s)<e.radius+s.radius){this.damageStation(base.contact);e.hp=0;this.emit('destroyed',{x:e.x,y:e.y,radius:e.radius});}
    else if(distance(e,p)<e.radius+p.radius && this.damagePlayer(base.contact*B.player.contactScale)) {
      const away=direction(p,e);
      e.x=clamp(e.x+Math.cos(away)*B.player.contactKnockback,e.radius,WORLD.width-e.radius);
      e.y=clamp(e.y+Math.sin(away)*B.player.contactKnockback,e.radius,WORLD.height-e.radius);
    }
  }
  updateBullets(dt) {
    for(const b of this.bullets){
      b.life-=dt;if(b.life<=0)continue;
      if(b.kind==='missile'){
        let target=this.enemies.find(e=>e.id===b.target && e.hp>0)||this.nearestEnemy(b);
        if(target){b.target=target.id;const aim=direction(b,target),diff=Math.atan2(Math.sin(aim-b.angle),Math.cos(aim-b.angle));b.angle+=clamp(diff,-5*dt,5*dt);}
      }
      b.x+=Math.cos(b.angle)*b.speed*dt;b.y+=Math.sin(b.angle)*b.speed*dt;
      if(b.owner==='player') {
        for(const e of this.enemies){if(e.hp<=0||b.hits.includes(e.id)||distance(b,e)>e.radius+b.radius)continue;
          if(b.kind==='missile'){for(const nearby of [...this.enemies])if(distance(nearby,b)<b.blast+nearby.radius)this.damageEnemy(nearby,b.damage);this.emit('explosion',{x:b.x,y:b.y,radius:b.blast});b.life=0;break;}
          this.damageEnemy(e,b.damage);b.hits.push(e.id);if(b.hits.length>b.pierce){b.life=0;break;}
        }
      } else if(distance(b,this.station)<b.radius+this.station.radius){this.damageStation(b.damage);b.life=0;}
      else if(distance(b,this.player)<b.radius+this.player.radius){this.damagePlayer(b.damage);b.life=0;}
      if(b.x<-60||b.x>WORLD.width+60||b.y<-60||b.y>WORLD.height+60)b.life=0;
    }
    this.bullets=this.bullets.filter(b=>b.life>0);
  }
  prepareUpgrades() {
    const available=UPGRADES.filter(u=>(this.levels[u.id]||0)<u.max);
    this.choices=[];
    // Include a defensive option, then vary remaining choices without duplicates.
    const defensive=available.filter(u=>['STATION','SURVIVAL','REPAIR'].includes(u.category));
    if(defensive.length)this.choices.push(defensive[Math.floor(this.random()*defensive.length)]);
    const remaining=available.filter(u=>!this.choices.includes(u));
    while(this.choices.length<3 && remaining.length)this.choices.push(remaining.splice(Math.floor(this.random()*remaining.length),1)[0]);
    if(this.choices.length){this.state=STATES.UPGRADE_SELECT;this.emit('upgrade');}
    else this.startWave();
  }
  selectUpgrade(index) {
    if(this.state!==STATES.UPGRADE_SELECT)return false;
    const choice=this.choices[index];if(!choice)return false;
    choice.apply(this);this.levels[choice.id]=(this.levels[choice.id]||0)+1;this.choices=[];this.startWave();return true;
  }
  endGame(reason) {if(this.state===STATES.GAME_OVER)return;this.state=STATES.GAME_OVER;this.lastResult=reason;this.emit('gameOver');}
  update(dt,input={}) {
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.05);
    if([STATES.PAUSED,STATES.GAME_OVER,STATES.UPGRADE_SELECT,STATES.EXITING].includes(this.state))return;
    if(this.state===STATES.READY){this.timer-=dt;if(this.timer<=0)this.startWave();return;}
    if(this.state===STATES.BOSS_INTRO){this.timer-=dt;if(this.timer<=0){this.spawn('boss',{x:WORLD.width/2,y:180});this.state=STATES.PLAYING;this.emit('wave',{wave:this.wave});}return;}
    if(this.state===STATES.WAVE_CLEAR){this.timer-=dt;if(this.timer<=0)this.prepareUpgrades();return;}
    if(this.state!==STATES.PLAYING)return;
    this.elapsed+=dt;this.comboTimer=Math.max(0,this.comboTimer-dt);const p=this.player,s=this.station;
    for(const name of Object.keys(this.cooldowns))this.cooldowns[name]=Math.max(0,this.cooldowns[name]-dt);
    p.invulnerable=Math.max(0,p.invulnerable-dt);p.dashTime=Math.max(0,p.dashTime-dt);s.lastHit+=dt;s.flash=Math.max(0,s.flash-dt);
    if(s.lastHit>B.station.regenerationDelay)s.shield=Math.min(s.maxShield,s.shield+this.stats.regeneration*dt);
    if(s.repairTime>0){const step=Math.min(dt,s.repairTime);s.repairTime-=step;s.hp=Math.min(s.maxHp,s.hp+this.stats.repairAmount/B.repair.duration*step);}
    let x=(input.right?1:0)-(input.left?1:0),y=(input.down?1:0)-(input.up?1:0),length=Math.hypot(x,y);
    if(length>0){x/=length;y/=length;p.angle=Math.atan2(y,x);}
    if(input.dash)this.skill('dash');if(input.missile)this.skill('missile');if(input.emp)this.skill('emp');if(input.repair)this.skill('repair');
    if(p.dashTime>0){x=Math.cos(p.dashAngle);y=Math.sin(p.dashAngle);length=1;}
    if(length>0){const speed=p.dashTime>0?B.player.dashSpeed:this.stats.speed;p.x=clamp(p.x+x*speed*dt,p.radius,WORLD.width-p.radius);p.y=clamp(p.y+y*speed*dt,p.radius,WORLD.height-p.radius);}
    if(input.fire||this.settings.autoFire)this.fire();
    this.spawnTimer-=dt;
    if(this.queue.length && this.spawnTimer<=0 && this.enemies.length+this.warnings.length<B.wave.maximumEnemies){const type=this.queue.shift();this.warnings.push({type,...this.sectorPosition(),time:B.wave.warning});this.spawnTimer=Math.max(B.wave.minimumInterval,B.wave.interval-this.wave*.055);}
    for(const marker of this.warnings){marker.time-=dt;if(marker.time<=0)this.spawn(marker.type,marker);}
    this.warnings=this.warnings.filter(m=>m.time>0);
    for(const e of [...this.enemies])if(e.hp>0)this.updateEnemy(e,dt);
    this.updateBullets(dt);this.enemies=this.enemies.filter(e=>e.hp>0);
    if(s.hp<=0){this.endGame('정거장 Hull이 붕괴했습니다.');return;}
    if(p.hp<=0){this.endGame('요격기가 파괴되었습니다.');return;}
    if(!this.queue.length&&!this.enemies.length&&!this.warnings.length){this.score+=B.score.clear*this.wave+Math.round(s.hp*.2)+(this.flawless?B.score.flawless:0);s.shield=Math.min(s.maxShield,s.shield+30);this.bullets=[];this.state=STATES.WAVE_CLEAR;this.timer=B.wave.rest;this.emit('waveClear',{wave:this.wave});}
  }
}
