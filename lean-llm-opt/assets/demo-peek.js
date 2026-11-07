const clamp = (value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const mix = (a,b,t)=>a+(b-a)*t;

/** Page scroll positions the same Demo link from its hero slot into the dock. */
export function createDemoPeek({hero,slot,launcher,isReduced=()=>false,collapse=()=>{}}){
  if(!hero||!slot||!launcher)return {update(){},refresh(){},dispose(){}};
  const link=launcher.querySelector('.demo-launcher-link');
  const framework=hero.querySelector('#paper-viewport');
  const slotBase={top:slot.style.top,height:slot.style.height};
  let dock=null,metricKey='',disposed=false,slotAligned=false;
  const styles=['--peek-left','--peek-top','--peek-width','--peek-height','--peek-source-height','--peek-open','--peek-progress','--peek-page-opacity'];
  function refresh(){metricKey='';}
  function restoreSlot(){for(const [name,value]of Object.entries(slotBase))slot.style[name]=value;slotAligned=false;}
  function alignSlot(){
    // The desktop triangle shares the framework's vertical bounds; its width
    // remains a CSS layout choice. Narrow layouts retain their separate row.
    if(innerWidth>=1280&&framework&&slot.offsetParent){
      const box=framework.getBoundingClientRect(),parent=slot.offsetParent.getBoundingClientRect();
      for(const [name,value]of Object.entries({top:box.top-parent.top,height:box.height})){
        const pixels=value+'px';if(slot.style[name]!==pixels)slot.style[name]=pixels;
      }
      slotAligned=true;
    }else if(slotAligned)restoreSlot();
  }
  function measureDock(){
    const peeking=launcher.classList.contains('is-peeking');
    launcher.classList.remove('is-peeking');
    const rect=launcher.getBoundingClientRect(),computed=getComputedStyle(launcher);
    dock={width:rect.width,height:rect.height,right:parseFloat(computed.right)||14,bottom:parseFloat(computed.bottom)||14};
    launcher.classList.toggle('is-peeking',peeking);
  }
  function update(){
    if(disposed)return;
    alignSlot();
    const slotBox=slot.getBoundingClientRect(),heroBox=hero.getBoundingClientRect();
    const slotY=slotBox.top+scrollY,heroY=heroBox.top+scrollY;
    // On narrow screens the preview must enter the viewport before it docks.
    const start=Math.max(heroY+32,slotY-innerHeight*.55);
    const end=start+clamp(innerHeight*.42,220,380);
    const raw=clamp((scrollY-start)/(end-start));
    const progress=isReduced()?(raw>=1?1:0):raw;
    const t=progress*progress*(3-2*progress);
    if(progress<1&&!launcher.classList.contains('is-collapsed'))collapse();
    const key=[innerWidth,innerHeight,document.documentElement.dataset.lang,launcher.classList.contains('over-architecture'),launcher.classList.contains('is-collapsed')].join(':');
    if(!dock||key!==metricKey){measureDock();metricKey=key;}
    launcher.dataset.peekProgress=progress.toFixed(5);
    launcher.dataset.peekState=progress===0?'preview':progress===1?'docked':'transition';
    launcher.dataset.peekStart=start.toFixed(2);launcher.dataset.peekEnd=end.toFixed(2);
    if(progress>=1){launcher.classList.remove('is-peeking');return;}
    launcher.classList.add('is-peeking');
    if(launcher.contains(document.activeElement)&&document.activeElement!==link)link.focus({preventScroll:true});
    const target={left:innerWidth-dock.right-dock.width,top:innerHeight-dock.bottom-dock.height};
    const values={
      '--peek-left':mix(slotBox.left,target.left,t)+'px',
      '--peek-top':mix(slotBox.top,target.top,t)+'px',
      '--peek-width':mix(slotBox.width,dock.width,t)+'px',
      '--peek-height':mix(slotBox.height,dock.height,t)+'px',
      '--peek-source-height':slotBox.height+'px',
      '--peek-open':1-t,'--peek-progress':t,'--peek-page-opacity':Math.max(0,1-t*1.32),
    };
    for(const [name,value]of Object.entries(values))launcher.style.setProperty(name,String(value));
  }
  update();
  return {update,refresh,dispose(){disposed=true;restoreSlot();launcher.classList.remove('is-peeking');for(const name of styles)launcher.style.removeProperty(name);for(const key of ['peekState','peekProgress','peekStart','peekEnd'])delete launcher.dataset[key];}};
}
