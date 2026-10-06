const controls={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Space:'fire',ShiftLeft:'dash',ShiftRight:'dash',Digit1:'missile',Digit2:'emp',Digit3:'repair',Numpad1:'missile',Numpad2:'emp',Numpad3:'repair'};
export class InputManager {
  constructor(onCommand,isActive) {
    this.keys=new Set();this.pending=new Set();this.onCommand=onCommand;this.isActive=isActive;
    this.down=event=>{
      if(!this.isActive())return;
      if(event.code==='Escape'){event.preventDefault();if(!event.repeat)this.onCommand('pause',event.code);return;}
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName))return;
      if(/^(Digit|Numpad)[123]$/.test(event.code)&&this.onCommand('upgrade',Number(event.code.at(-1))-1)){event.preventDefault();return;}
      if(event.code==='KeyP'){event.preventDefault();if(!event.repeat)this.onCommand('pause',event.code);return;}
      if(event.target?.tagName==='BUTTON')return;
      if(controls[event.code]){event.preventDefault();this.keys.add(event.code);if(!event.repeat && ['fire','dash','missile','emp','repair'].includes(controls[event.code]))this.pending.add(controls[event.code]);}
    };
    this.up=event=>{this.keys.delete(event.code);};
    window.addEventListener('keydown',this.down);window.addEventListener('keyup',this.up);
  }
  snapshot(){const input={};for(const key of this.keys)input[controls[key]]=true;for(const action of this.pending)input[action]=true;this.pending.clear();return input;}
  clear(){this.keys.clear();this.pending.clear();}
  destroy(){this.clear();window.removeEventListener('keydown',this.down);window.removeEventListener('keyup',this.up);}
}
export function isTouchOnly(device=navigator,media=query=>matchMedia(query).matches) {
  const ua=device.userAgent||'',phone=/Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua),mobile=/Android|iPad/i.test(ua);
  const touch=device.maxTouchPoints>0,coarse=media('(pointer: coarse)'),fine=media('(any-pointer: fine)')||media('(pointer: fine)');
  return phone||(!fine&&(mobile||(touch&&coarse)));
}
