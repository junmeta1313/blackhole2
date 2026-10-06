import { WORLD, BALANCE as B, THEME as T } from './config.js';
const TAU=Math.PI*2;
export class Renderer {
  constructor(canvas,images,settings){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.images=images;this.settings=settings;this.particles=[];this.rings=[];this.ghosts=[];this.beams=[];this.shake=0;this.time=0;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stars=Array.from({length:100},(_,i)=>({x:(i*619.31)%WORLD.width,y:(i*391.77)%WORLD.height,size:.5+i%3*.35,depth:1+i%3}));this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.scale=Math.min(this.canvas.width/WORLD.width,this.canvas.height/WORLD.height);this.offsetX=(this.canvas.width-WORLD.width*this.scale)/2;this.offsetY=(this.canvas.height-WORLD.height*this.scale)/2;this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';}
  sprite(name,x,y,width,height=width,angle=0,alpha=1){const image=this.images[name],c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=alpha;
    if(image){const aspect=image.width/image.height;if(aspect>width/height){height=width/aspect;}else width=height*aspect;c.drawImage(image,-width/2,-height/2,width,height);}
    else {c.strokeStyle=name==='player'?T.friendly:T.enemy;c.fillStyle='#24212f';c.lineWidth=3;c.beginPath();c.moveTo(0,-height/2);c.lineTo(width/2,height/3);c.lineTo(0,height/6);c.lineTo(-width/2,height/3);c.closePath();c.fill();c.stroke();}
    c.restore();
  }
  ring(x,y,radius,color,width=2,alpha=1){const c=this.ctx;c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,radius,0,TAU);c.stroke();c.restore();}
  event(event){const {type,x=960,y=540,radius=40}=event;
    if(type==='dash'){this.ghosts.push({x,y,angle:event.angle,life:.3});return;}
    if(type==='beam'){this.beams.push({...event,life:.35});return;}
    if(['emp','shieldHit','bossPhase','bossDestroyed'].includes(type))this.rings.push({x,y,radius:type==='emp'?radius:radius*2,life:type==='emp'?1:.6,total:type==='emp'?1:.6,color:type==='shieldHit'?T.shield:T.friendly});
    if(['hit','destroyed','bossDestroyed','explosion','hullHit','playerHit'].includes(type)){
      const count=type==='hit'?4:type==='bossDestroyed'?90:22,low=this.settings.effects==='low';
      for(let i=0;i<(low?count/3:count)&&this.particles.length<B.limits.particles;i++){const angle=Math.random()*TAU,speed=(60+Math.random()*180)*(type==='bossDestroyed'?2:1);this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.25+Math.random()*.55,total:.8,size:1+Math.random()*3,color:i%3===0?T.white:type==='playerHit'?T.enemy:T.friendly,debris:i%4===0});}
      this.rings.push({x,y,radius:Math.min(radius,160),life:.32,total:.32,color:T.white});
    }
    if(['bossWarning','bossDestroyed','hullHit','explosion'].includes(type)&&this.settings.screenShake&&!this.reduced)this.shake=type==='bossDestroyed'?12:type==='hullHit'?7:4;
    if(this.rings.length>24)this.rings.shift();if(this.ghosts.length>20)this.ghosts.shift();
  }
  effects(dt){this.time+=dt;this.shake=Math.max(0,this.shake-dt*24);
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
    this.particles=this.particles.filter(p=>p.life>0);
    for(const group of [this.rings,this.ghosts,this.beams])for(const effect of group)effect.life-=dt;
    this.rings=this.rings.filter(e=>e.life>0);this.ghosts=this.ghosts.filter(e=>e.life>0);this.beams=this.beams.filter(e=>e.life>0);
  }
  render(g){const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.fillStyle='#030309';c.fillRect(0,0,this.canvas.width,this.canvas.height);c.save();c.translate(this.offsetX,this.offsetY);c.scale(this.scale,this.scale);c.beginPath();c.rect(0,0,WORLD.width,WORLD.height);c.clip();
    if(this.shake)c.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);
    const background=this.images.background;if(background)c.drawImage(background,0,0,WORLD.width,WORLD.height);else{c.fillStyle=T.void;c.fillRect(0,0,WORLD.width,WORLD.height);}
    c.fillStyle='#d9d2f2';for(const star of this.stars){c.globalAlpha=.16+star.depth*.08;const drift=this.reduced?0:this.time*star.depth*1.6;c.fillRect((star.x+drift)%WORLD.width,star.y,star.size,star.size);}c.globalAlpha=1;
    const s=g.station,p=g.player;
    this.sprite('station',s.x,s.y,180,180,this.reduced?0:this.time*.035);
    c.save();c.translate(s.x,s.y);c.rotate(-this.time*.12);c.strokeStyle='#e6d9ff';c.globalAlpha=.25;c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,69,i*TAU/3,i*TAU/3+.5);c.stroke();}c.restore();
    const shieldRatio=s.shield/s.maxShield;this.ring(s.x,s.y,99,T.shield,2,.15+shieldRatio*.45);if(shieldRatio>0){c.save();c.strokeStyle=T.friendly;c.lineWidth=3;c.globalAlpha=.65;c.beginPath();c.arc(s.x,s.y,99,-Math.PI/2,-Math.PI/2+TAU*shieldRatio);c.stroke();c.restore();}
    if(s.flash>0)this.ring(s.x,s.y,106,T.enemy,3,s.flash*3);
    if(s.repairTime>0){for(let i=0;i<B.repair.drones;i++){const a=this.time*1.9+i*TAU/B.repair.drones,dx=s.x+Math.cos(a)*135,dy=s.y+Math.sin(a)*135;c.strokeStyle=T.friendly;c.lineWidth=1;c.globalAlpha=.45;c.beginPath();c.moveTo(dx,dy);c.lineTo(s.x+Math.cos(a)*60,s.y+Math.sin(a)*60);c.stroke();c.globalAlpha=1;this.drone(dx,dy,a);}}
    for(const w of g.warnings){const fraction=1-w.time/B.wave.warning,r=35+fraction*25;this.ring(w.x,w.y,r,T.enemy,2,.4+fraction*.4);c.fillStyle=T.enemy;c.font='16px monospace';c.textAlign='center';c.fillText('!',w.x,w.y+5);}
    for(const e of g.enemies){
      if(e.type==='rusher'&&e.chargeTimer<.55&&e.chargeTime<=0){c.save();c.strokeStyle=T.enemy;c.globalAlpha=.45;c.setLineDash([7,9]);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(e.angle)*180,e.y+Math.sin(e.angle)*180);c.stroke();c.restore();}
      if(e.type==='boss'&&e.beamCharge>0){c.save();c.strokeStyle=T.enemy;c.lineWidth=15*(1-e.beamCharge/B.boss.beamWarning)+2;c.globalAlpha=this.reduced?.4:.28+Math.sin(this.time*14)*.13;c.setLineDash([18,12]);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(s.x,s.y);c.stroke();c.restore();}
      const sprite=e.type==='splitter'?'shield':e.type==='drone'?'scout':e.type;const size=e.type==='boss'?320:e.radius*2.7;
      if(e.type==='splitter'){
        for(let i=0;i<3;i++){const a=e.angle+i*TAU/3;this.sprite('scout',e.x+Math.cos(a)*18,e.y+Math.sin(a)*18,43,43,a+Math.PI/2,e.stun>0?.6:1);}
      } else {
        c.save();if(e.type==='shield'&&e.shield<=0){c.beginPath();c.arc(e.x,e.y,e.radius*1.05,0,TAU);c.clip();}
        this.sprite(sprite,e.x,e.y,size,size,e.angle+Math.PI/2,e.stun>0?.6:1);c.restore();
      }
      if(e.type==='splitter'){this.ring(e.x,e.y,e.radius+6,T.amber,2,.6);for(let i=0;i<3;i++){const a=i*TAU/3;c.fillStyle=T.amber;c.fillRect(e.x+Math.cos(a)*(e.radius+8)-2,e.y+Math.sin(a)*(e.radius+8)-2,4,4);}}
      if(e.shield>0)this.ring(e.x,e.y,e.radius+12,T.enemy,2,.45+.35*e.shield/e.maxShield);
      if(e.stun>0)this.ring(e.x,e.y,e.radius+5,T.shield,2,.5);
      if(e.phase===2){this.ring(e.x,e.y,22,T.enemy,2,.8);}
      if(e.hp<e.maxHp&&e.type!=='boss'){c.fillStyle='#25202d';c.fillRect(e.x-23,e.y-e.radius-17,46,3);c.fillStyle=T.enemy;c.fillRect(e.x-23,e.y-e.radius-17,46*e.hp/e.maxHp,3);}
      if(e.flash>0)this.ring(e.x,e.y,e.radius,T.white,2,e.flash*7);
    }
    for(const ghost of this.ghosts)this.sprite('player',ghost.x,ghost.y,80,80,ghost.angle+Math.PI/2,ghost.life*.9);
    if(p.dashTime>0&&this.settings.effects!=='low'&&this.ghosts.length<20)this.ghosts.push({x:p.x,y:p.y,angle:p.angle,life:.16});
    const engine=18+Math.sin(this.time*30)*4;c.save();c.translate(p.x,p.y);c.rotate(p.angle+Math.PI/2);c.strokeStyle=T.friendly;c.lineWidth=p.dashTime>0?7:3;c.globalAlpha=.65;c.beginPath();c.moveTo(-12,26);c.lineTo(-12,26+engine*(p.dashTime>0?2:1));c.moveTo(12,26);c.lineTo(12,26+engine);c.stroke();c.restore();
    this.sprite('player',p.x,p.y,83,83,p.angle+Math.PI/2,p.invulnerable>0?.7:1);
    if(p.invulnerable>0)this.ring(p.x,p.y,39,T.white,1,.5);
    for(const b of g.bullets){c.save();c.translate(b.x,b.y);c.rotate(b.angle);const missile=b.kind==='missile';c.strokeStyle=b.owner==='enemy'?T.enemy:T.friendly;c.lineWidth=missile?4:3;c.globalAlpha=.35;c.beginPath();c.moveTo(-28,0);c.lineTo(0,0);c.stroke();c.globalAlpha=1;c.strokeStyle=b.owner==='enemy'?T.enemy:T.white;c.lineWidth=missile?5:3;c.beginPath();c.moveTo(-8,0);c.lineTo(8,0);c.stroke();c.restore();}
    c.save();c.globalCompositeOperation='lighter';
    for(const r of this.rings){const age=1-r.life/r.total;this.ring(r.x,r.y,Math.max(1,r.radius*age),r.color,r.radius>200?4:2,(1-age)*.65);if(r.radius>200){this.ring(r.x,r.y,Math.max(1,r.radius*age-18),r.color,1,(1-age)*.4);for(let i=0;i<16;i++){const a=i*TAU/16;this.ring(r.x+Math.cos(a)*r.radius*age,r.y+Math.sin(a)*r.radius*age,3,r.color,2,1-age);}}}
    for(const beam of this.beams){c.strokeStyle=T.enemy;c.lineWidth=18;c.globalAlpha=beam.life*1.5;c.beginPath();c.moveTo(beam.x,beam.y);c.lineTo(beam.toX,beam.toY);c.stroke();c.strokeStyle=T.white;c.lineWidth=4;c.stroke();}
    for(const particle of this.particles){c.fillStyle=particle.color;c.globalAlpha=Math.min(1,particle.life/particle.total);if(particle.debris){c.save();c.translate(particle.x,particle.y);c.rotate(particle.life*8);c.fillRect(-particle.size,0,particle.size*3,2);c.restore();}else c.fillRect(particle.x,particle.y,particle.size,particle.size);}
    c.restore();c.restore();
  }
  drone(x,y,angle){const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=T.friendly;c.fillStyle=T.white;c.lineWidth=2;for(let i=0;i<3;i++){const a=i*TAU/3;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*13,Math.sin(a)*13);c.stroke();}c.fillRect(-3,-3,6,6);c.restore();}
}
