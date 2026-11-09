const clamp = (value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const mix = (a,b,t)=>a+(b-a)*t;
const ease = value=>{const t=clamp(value);return t*t*(3-2*t);};

/** One link travels from the hero page preview to the corner, without a layout swap. */
export function createDemoPeek({hero,slot,launcher,avoid,isReduced=()=>false,collapse=()=>{}}){
  if(!hero||!slot||!launcher)return {update(){},refresh(){},dispose(){}};
  const link=launcher.querySelector('.demo-launcher-link');
  const controls=launcher.querySelector('.demo-launcher-header');
  const framework=hero.querySelector('#paper-viewport');
  const slotBase={top:slot.style.top,height:slot.style.height};
  let dock=null,metricKey='',disposed=false,slotAligned=false,frame=0,lastTime=0,visualY=null;
  let hover=0,velocity=0,pointer=false,focused=false,visualLift=null;
  const styles=['--peek-left','--peek-top','--peek-width','--peek-height','--peek-source-height','--peek-open','--peek-progress','--peek-page-opacity','--peek-hover','--peek-image-scale','--peek-controls','--peek-dock-bottom','--peek-caption-left','--peek-caption-bottom','--peek-arrow-right','--peek-arrow-bottom'];
  function schedule(){if(!disposed&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  function wake(){if(!frame)lastTime=0;schedule();}
  function refresh(){metricKey='';wake();}
  function restoreSlot(){for(const [name,value]of Object.entries(slotBase))slot.style[name]=value;slotAligned=false;}
  function alignSlot(){
    if(innerWidth>=1280&&framework&&slot.offsetParent){
      const box=framework.getBoundingClientRect(),parent=slot.offsetParent.getBoundingClientRect();
      for(const [name,value]of Object.entries({top:box.top-parent.top,height:box.height})){
        const pixels=value+'px';if(slot.style[name]!==pixels)slot.style[name]=pixels;
      }
      slotAligned=true;
    }else if(slotAligned)restoreSlot();
  }
  function measureDock(){
    const peeking=launcher.classList.contains('is-peeking'),over=launcher.classList.contains('over-architecture'),state=launcher.dataset.peekState;
    launcher.classList.remove('is-peeking','over-architecture');delete launcher.dataset.peekState;
    const rect=launcher.getBoundingClientRect(),computed=getComputedStyle(launcher);
    const label=launcher.querySelector('#demo-launcher-link-label').getBoundingClientRect();
    const arrow=launcher.querySelector('.demo-peek-arrow').getBoundingClientRect();
    dock={width:rect.width,height:rect.height,right:parseFloat(computed.right)||14,bottom:parseFloat(computed.bottom)||14,
      captionLeft:label.left-rect.left,captionBottom:rect.bottom-label.bottom,
      arrowRight:rect.right-arrow.right,arrowBottom:rect.bottom-arrow.bottom};
    launcher.classList.add('over-architecture');dock.lift=(parseFloat(getComputedStyle(launcher).bottom)||dock.bottom)-dock.bottom;
    launcher.classList.toggle('over-architecture',over);launcher.classList.toggle('is-peeking',peeking);
    if(state!==undefined)launcher.dataset.peekState=state;
  }
  function draw(now){
    frame=0;if(disposed||document.hidden)return;
    const reduced=isReduced(),dt=lastTime?clamp((now-lastTime)/1000,.001,.1):1/60;lastTime=now;
    alignSlot();
    const slotBox=slot.getBoundingClientRect(),heroBox=hero.getBoundingClientRect();
    const slotY=slotBox.top+scrollY,heroY=heroBox.top+scrollY;
    const start=Math.max(heroY+32,slotY-innerHeight*.55);
    const end=start+clamp(innerHeight*.64,320,560);
    const targetY=Math.min(scrollY,end);
    // A brief catch-up also renders intermediate frames after a large wheel step.
    if(visualY===null||reduced)visualY=targetY;
    else visualY=mix(visualY,targetY,1-Math.exp(-dt/.065));
    if(Math.abs(targetY-visualY)<.08)visualY=targetY;
    const raw=clamp((visualY-start)/(end-start));
    const progress=reduced?(raw>=1?1:0):raw,t=ease(progress),open=1-t;
    if(progress<1&&!launcher.classList.contains('is-collapsed'))collapse();
    const key=[innerWidth,innerHeight,document.documentElement.dataset.lang,launcher.classList.contains('is-collapsed')].join(':');
    if(!dock||key!==metricKey){measureDock();metricKey=key;}
    const avoidBox=avoid?.getBoundingClientRect();
    const lift=avoidBox?dock.lift*ease((innerHeight-avoidBox.top)/180)*ease(avoidBox.bottom/180):0;
    if(visualLift===null||reduced)visualLift=lift;
    else visualLift=mix(visualLift,lift,1-Math.exp(-dt/.065));
    if(Math.abs(visualLift-lift)<.02)visualLift=lift;
    const hoverTarget=(pointer||focused)?1:0;
    if(reduced){hover=hoverTarget;velocity=0;}
    else {
      // Exact damped spring, so the small rebound survives slower WebGL frames.
      const error=hover-hoverTarget,frequency=Math.sqrt(220-11.5**2),decay=Math.exp(-11.5*dt);
      const cosine=Math.cos(frequency*dt),sine=Math.sin(frequency*dt);
      hover=hoverTarget+decay*(error*cosine+(velocity+11.5*error)/frequency*sine);
      velocity=decay*(velocity*cosine-(11.5*velocity+220*error)/frequency*sine);
      if(Math.abs(hoverTarget-hover)<.0005&&Math.abs(velocity)<.005){hover=hoverTarget;velocity=0;}
    }
    launcher.dataset.peekProgress=progress.toFixed(5);
    launcher.dataset.peekState=progress===0?'preview':progress===1?'docked':'transition';
    controls.inert=progress<1;controls.setAttribute('aria-hidden',String(progress<1));
    launcher.dataset.peekStart=start.toFixed(2);launcher.dataset.peekEnd=end.toFixed(2);
    // Keep the exact same layout after docking. Only a user-opened description
    // uses the larger, ordinary card, once the scroll animation has finished.
    const peeking=progress<1||launcher.classList.contains('is-collapsed');
    launcher.classList.toggle('is-peeking',peeking);
    if(progress<1&&launcher.contains(document.activeElement)&&document.activeElement!==link)link.focus({preventScroll:true});
    const target={left:innerWidth-dock.right-dock.width,top:innerHeight-dock.bottom-visualLift-dock.height};
    const values={
      '--peek-left':mix(slotBox.left,target.left,t)+'px',
      '--peek-top':mix(slotY-Math.min(visualY,start),target.top,t)+'px',
      '--peek-width':mix(slotBox.width,dock.width,t)+'px',
      '--peek-height':mix(slotBox.height,dock.height,t)+'px',
      '--peek-source-height':slotBox.height+'px',
      '--peek-open':open,'--peek-progress':t,'--peek-hover':Math.max(0,hover)*open,
      '--peek-image-scale':mix(1,dock.height/slotBox.height,t),
      '--peek-page-opacity':1-ease((t-.28)/.68),'--peek-controls':ease((t-.74)/.26),
      '--peek-dock-bottom':dock.bottom+visualLift+'px',
      '--peek-caption-left':mix(32,dock.captionLeft,t)+'px',
      '--peek-caption-bottom':mix(innerWidth<1280?18:28,dock.captionBottom,t)+'px',
      '--peek-arrow-right':mix(21,dock.arrowRight,t)+'px',
      '--peek-arrow-bottom':mix(innerWidth<1280?26:63,dock.arrowBottom,t)+'px',
    };
    for(const [name,value]of Object.entries(values))launcher.style.setProperty(name,String(value));
    if(visualY!==targetY||visualLift!==lift||hover!==hoverTarget||velocity!==0)schedule();
  }
  function onEnter(){pointer=true;wake();}
  function onLeave(){pointer=false;wake();}
  function onFocus(){focused=link.matches(':focus-visible');wake();}
  function onBlur(){focused=false;wake();}
  function onVisibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;lastTime=0;}else schedule();}
  link.addEventListener('pointerenter',onEnter);link.addEventListener('pointerleave',onLeave);
  link.addEventListener('focus',onFocus);link.addEventListener('blur',onBlur);
  document.addEventListener('visibilitychange',onVisibility);
  function update(){wake();}
  draw(performance.now());
  return {update,refresh,dispose(){disposed=true;cancelAnimationFrame(frame);restoreSlot();launcher.classList.remove('is-peeking');controls.inert=false;controls.removeAttribute('aria-hidden');for(const name of styles)launcher.style.removeProperty(name);for(const key of ['peekState','peekProgress','peekStart','peekEnd'])delete launcher.dataset[key];link.removeEventListener('pointerenter',onEnter);link.removeEventListener('pointerleave',onLeave);link.removeEventListener('focus',onFocus);link.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);}};
}
