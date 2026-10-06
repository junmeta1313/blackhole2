const tones={shot:[620,.035,'triangle'],hit:[220,.045,'triangle'],destroyed:[100,.14,'sawtooth'],missile:[180,.2,'sawtooth'],emp:[82,.45,'sine'],repair:[490,.18,'sine'],shieldHit:[250,.13,'sine'],hullHit:[70,.18,'triangle'],playerHit:[120,.15,'triangle'],waveClear:[660,.4,'sine'],bossWarning:[90,.6,'sawtooth'],bossDestroyed:[55,.7,'sawtooth'],bossPhase:[140,.35,'sine'],beam:[60,.35,'triangle'],gameOver:[140,.65,'triangle'],dash:[360,.09,'triangle']};
export class AudioManager {
  constructor(settings){this.settings=settings;this.context=null;this.nodes=new Set();this.lastShot=0;}
  activate(){try{if(!this.context)this.context=new (window.AudioContext||window.webkitAudioContext)();this.context.resume().catch(()=>{});}catch{/* Audio is optional. */}}
  play(type){
    const context=this.context,voice=tones[type];if(!voice||!context||context.state!=='running'||!this.settings.sound)return;
    const now=context.currentTime;if(type==='shot'&&now-this.lastShot<.11)return;if(type==='shot')this.lastShot=now;if(this.nodes.size>20)return;
    try{
      const [frequency,duration,wave]=voice,osc=context.createOscillator(),gain=context.createGain();
      osc.type=wave;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(Math.max(20,frequency*(type==='waveClear'?1.8:.35)),now+duration);
      gain.gain.setValueAtTime(Math.max(.0001,this.settings.volume*(type==='shot'?.045:.12)),now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      osc.connect(gain);gain.connect(context.destination);this.nodes.add(osc);osc.onended=()=>{this.nodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(now);osc.stop(now+duration);
    }catch{/* Device changes must not interrupt gameplay. */}
  }
  stop(){for(const node of this.nodes){try{node.stop();}catch{}}this.nodes.clear();}
  suspend(){this.stop();this.context?.suspend().catch(()=>{});}
  close(){this.stop();const context=this.context;this.context=null;context?.close().catch(()=>{});}
}
