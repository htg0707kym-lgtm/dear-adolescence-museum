import {prints, objects, figures, lettering, shore} from './collection.js';
import {canvasCue,dropDuration,galleryHologramCue} from './score.js';
import {projectorMesh} from './projector-mesh.js';

export const rooms = [
  {x:-2.75,z:4.85,yaw:.35,pitch:.060},
  {x:0,z:18.6,yaw:0,pitch:.055},
  {x:-.7,z:39.55,yaw:.14,pitch:-.035},
];
export const roomAt=z=>z<15?0:z<38?1:2;
export const galleryPeriod=64;
export const galleryLoopStart=16;
export const galleryLoopEnd=37.5;
export const galleryDepthPeriod=galleryLoopEnd-galleryLoopStart;
export const shorePeriod=24;
export const wrapGalleryX=x=>((x+galleryPeriod/2)%galleryPeriod+galleryPeriod)%galleryPeriod-galleryPeriod/2;
export const advanceGalleryDepth=(z,next,exitOpen)=>
  !exitOpen&&roomAt(z)===1&&next>=galleryLoopEnd?next-galleryDepthPeriod:next;
export const surfaces = [];
export const colliders = [];
export const exhibits = [];

const br = [.17,.15,.20];
const stone = [.52,.49,.47];
const brass = [.49,.35,.24];
const cream = [.82,.77,.68];
const shadow = [.25,.22,.25];
const uv = [0,0,1,1];
export const shoreThreshold=38;
export const shoreOpening={halfWidth:2.1,height:3.75};

function face(points, color, texture='solid', region=uv, kind=0, action=null){
  surfaces.push({points,color,texture,region,kind,action});
}

function box(x1,y1,z1,x2,y2,z2,color,{blocks=false,material=0,floor=material,action=null}={}){
  const [a,b,c,d]=[[x1,y2,z1],[x2,y2,z1],[x2,y1,z1],[x1,y1,z1]];
  const [e,f,g,h]=[[x1,y2,z2],[x2,y2,z2],[x2,y1,z2],[x1,y1,z2]];
  const shade=n=>color.map(v=>v*n);
  face([a,b,c,d],color,'solid',uv,material,action);
  face([f,e,h,g],shade(.88),'solid',uv,material,action);
  face([e,a,d,h],shade(.81),'solid',uv,material,action);
  face([b,f,g,c],shade(.78),'solid',uv,material,action);
  face([e,f,b,a],shade(1.06),'solid',uv,floor,action);
  face([d,c,g,h],shade(.79),'solid',uv,material,action);
  if(blocks)colliders.push({x1,x2,z1,z2});
}

function along(x,y,z,w,h,angle){
  const dx=Math.cos(angle)*w/2, dz=Math.sin(angle)*w/2;
  return [[x-dx,y+h/2,z-dz],[x+dx,y+h/2,z+dz],[x+dx,y-h/2,z+dz],[x-dx,y-h/2,z-dz]];
}

function picture(label,x,y,z,w,h,options={}){
  const {angle=0,mount=br,panel,texture='atlas',title,note,medium}=options;
  const hasAtlas=texture==='atlas'||texture==='objects';
  const data=(texture==='objects'?objects:prints)[label];
  if(hasAtlas&&!data)return;
  const [sx,sy,sw,sh]=data??[0,0,1,1];
  const texBounds=hasAtlas?
    [(sx+.65)/2048,(sy+.65)/2048,(sx+sw-.65)/2048,(sy+sh-.65)/2048]:uv;
  const depth=.048, xx=x+Math.sin(angle)*depth,zz=z-Math.cos(angle)*depth;
  face(along(x,y,z,w+.16,h+.16,angle),mount,'solid',uv,24);
  face(along(xx,y,zz,w,h,angle),[1,1,1],texture,texBounds,texture==='objects'&&z<15?10:0);
  if(panel)face(along(x,y-h/2-.17,z,w*.57,.06,angle),brass);
  if(title)exhibits.push({x:xx,y,z:zz,w,h,angle,title,note,medium});
}

function printRow(items,x,z,side,height=2.03){
  const angle=side*Math.PI/2;
  for(const [i,item] of items.entries()){
    const [label,title,medium,note]=item;
    const [,,w,h]=prints[label]??[0,0,1,1];
    const lim=1.57;
    picture(label,x,height,z+i*2.05,lim*Math.min(1,w/h),lim*Math.min(1,h/w),
      {angle,panel:true,title,medium,note,mount:cream});
  }
}

const zones=[
  {front:0,back:15,width:7,height:5.2,wall:[.69,.65,.59],floor:[.49,.44,.38],type:1},
  {front:15,back:38,width:galleryPeriod/2,height:17,wall:[.047,.053,.096],floor:[.035,.045,.072],type:2},
  {front:38,back:59,width:9,height:5.4,wall:[.30,.37,.43],floor:[.36,.30,.30],type:6},
];
for(const {front,back,width,height,wall,floor,type} of zones){
  if(type===2){
    box(-width,-.24,galleryLoopStart,width,0,galleryLoopEnd,floor,{floor:type});
    box(-width,-.24,front,width,0,galleryLoopStart,floor,{floor:type,action:{unique:true}});
    box(-width,-.24,galleryLoopEnd,width,0,back,floor,{floor:type,action:{afterGate:true}});
    continue;
  }
  if(type===6)continue;
  box(-width,-.24,front,width,0,back,floor,{floor:type});
  const material=18;
  box(-width-.18,-.18,front,-width, height,back,wall,{material});
  box(width,-.18,front,width+.18,height,back,wall,{material});
  if(type!==1)continue;
  box(-width-.1,height,front,width+.1,height+.2,back,wall,{material:19});
  for(const n of [-4.9,4.9]){
    box(n-.087,5.13,front+.55,n+.087,5.21,back-.55,[.19,.17,.17]);
    box(n-.039,5.115,front+.60,n+.039,5.13,back-.60,[.97,.83,.63],{material:26});
  }
}
box(-7,0,-.07,7,5.2,.03,stone,{material:18});
for(const z of [15,38]){
  const wall=z===38?[.070,.074,.115]:[.09,.105,.138];
  const wing=z===38?2.46:7.3;
  const action=z===38?{afterGate:true}:null;
  const height=z===38?4.22:9;
  box(-wing,0,z-.16,-2.1,height,z+.16,wall,{blocks:true,action});
  box(2.1,0,z-.16,wing,height,z+.16,wall,{blocks:true,action});
  box(-2.1,3.8,z-.16,2.1,height,z+.16,wall,{action});
  box(-2.1,3.75,z-.23,2.1,3.81,z+.23,[.43,.42,.60],{action});
}
// The passage stays in world space on both sides of the threshold.
const shorePassage={afterGate:true};
for(const x of [-2.1,2.1]){
  box(x-.11,0,37.1,x+.11,4.2,39.1,[.069,.082,.112],{action:shorePassage});
}
box(-2.21,3.75,37.1,2.21,4.2,39.1,[.081,.097,.133],{action:shorePassage});
box(-2.1,-.05,37.1,2.1,.009,39.1,[.115,.127,.143],{action:shorePassage});
// Opaque backing closes the view immediately. The leaves then meet in front of it.
face(along(0,9,14.62,190,18,0),[.020,.026,.046],'solid',uv,0,{entrySeal:0});
face(along(0,1.89,14.67,4.23,3.78,0),[.045,.065,.097],'solid',uv,0,{entrySeal:0});
box(-2.1,-.04,14.62,2.1,.012,15.28,[.073,.091,.117]);
for(const side of [-1,1]){
  const left=side<0?-2.12:0, right=side<0?0:2.12;
  const action={entrySeal:side};
  box(left,0,14.77,right,3.8,14.90,[.043,.056,.082],{action});
  const edge=side*.014;
  face(along(edge,1.90,14.901,.016,3.72,0),[.096,.134,.182],'solid',uv,0,action);
}
const sideEntrance={unique:true};
box(-32,0,15.40,-7.3,16,15.50,[.034,.039,.068],{action:sideEntrance});
box(7.3,0,15.40,32,16,15.50,[.034,.039,.068],{action:sideEntrance});
for(const side of [-1,1]){
  face(along(side*2.03,1.82,37.76,.075,3.59,0),[.7,.49,.33],'solid',uv,0,{exitLight:true});
}

// A dense wall of shallow cases frames the outsized heel.
box(-2,.03,9.5,4.65,4.55,9.92,[.34,.28,.26],{blocks:true,material:20});
box(-2.15,0,9.08,4.81,.016,10.14,shadow);
picture('heels-64',1.32,2.39,9.48,6.08,6.08*2/3,{
  texture:'heel',mount:cream,panel:true,title:'床のほうが覚えている',
  note:'帰ったのは私で、足音だけが遅れている。'});
picture('G03-refined-02-landscape',1.32,2.39,9.932,6.08,6.08*2/3,{angle:Math.PI,mount:shadow});
const collectionNames={
  heels:['踵に降る午後','階段は一段ぶん、暗い。'],
  ears:['耳より遠い','呼ばれたことだけが聞こえる。'],
  collar:['名前の跡','結び目には、呼ばれる前の名前がある。'],
  cuffs:['白い間隔','手を振ったあと、白だけが残る。'],
  satin:['ひだの裏側','体温のないほうが、よく光る。'],
};
for(const [i,[label,[,,pw,ph]]] of Object.entries(objects).entries()){
  const side=i<90?1:-1;
  const section=i%90, col=section%15, row=Math.floor(section/15);
  const angle=side*Math.PI/2, x=-side*6.68, y=.58+row*.72, z=1.12+col*.88;
  const [title,note]=collectionNames[label.split('-')[0]]??collectionNames.satin;
  if(row===0)box(x-.17,.15,z-.41,x+.17,4.58,z+.41,[.27,.22,.20],{blocks:true,material:20});
  picture(label,x+side*.20,y,z,Math.min(.60,.55*pw/ph),Math.min(.55,.60*ph/pw),{
    angle,texture:'objects',mount:cream,title,note});
}
printRow([['PV02A-1','夜の折り目','','暗くなってから折り目が増えた。'],
  ['PV02A-2','空の重さ','','離した場所には、重さだけがある。']],4.61,10.68,1,1.85);
const titlePlane=along(-3.94,2.40,.041,6.12,2.04,Math.PI);
const afterEnd={afterEnd:true};
face(titlePlane,[1,1,1],'title',uv,12,afterEnd);
// Keep the ceiling bracket vertical and aim the chassis toward the title wall.
function projectorPoint(x,y,z){
  const pitch=-.256, yaw=Math.PI+.098;
  const hinge=-.405, d=y-hinge;
  if(d<0){
    y=hinge+d*Math.cos(pitch)+z*Math.sin(pitch);
    z=z*Math.cos(pitch)-d*Math.sin(pitch);
  }
  return [-3.14+1.20*(x*Math.cos(yaw)+z*Math.sin(yaw)),
    5.199+1.20*y,8.39+1.20*(z*Math.cos(yaw)-x*Math.sin(yaw))];
}
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0)).buffer;
const positions=new Int16Array(decode(projectorMesh.positions));
const triangles=new Uint16Array(decode(projectorMesh.triangles));
const projectorPoints=[];
for(let i=0;i<positions.length;i+=3){
  projectorPoints.push(projectorPoint(positions[i]/1e4,positions[i+1]/1e4,positions[i+2]/1e4));
}
for(let i=0;i<triangles.length;i+=4){
  const points=[0,1,2].map(j=>projectorPoints[triangles[i+j]]);
  const [a,b,c]=points;
  const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...n);
  if(length===0)continue;
  const shade=.60+.36*Math.max(0,(n[0]*.46+n[1]*.76+n[2]*.45)/length);
  const material=triangles[i+3];
  face(points,projectorMesh.colors[material].map(value=>value*shade),'solid',uv,material===7?27:25);
}
const projector=projectorPoint(...projectorMesh.lens);
for(const k of [0,1,2,3]){
  face([titlePlane[k],titlePlane[(k+1)%4],projector,projector],
    [.49,.65,.84],'solid',uv,14,afterEnd);
}

function floating(data, texture, x,y,z, width,height, angle, kind, action=null){
  const [sx,sy,sw,sh]=data;
  face(along(x,y,z,width,height,angle),[1,1,1],texture,
    [(sx+.6)/2048,(sy+.6)/2048,(sx+sw-.6)/2048,(sy+sh-.6)/2048],kind,action);
}

const fragments=[
  ['TM-HP04-portrait1','触れたあと','触れる前から、跡だけが待っていた。',0],
  ['TM-SM04-landscape1','息の裏','吸い込んだほうが、先に出ていった。',1],
  ['G03-refined-02-landscape','縫い残し','手の届かないところで、まだ布が張っている。',2],
  ['R012_print_abstract','余白の厚み','見送ったもののほうが、こちらを覚えている。',3],
  ['G04-refined-06-landscape','重さの記憶','重さがなくなってからも、折り目は深くなる。',2],
  ['TM-SM01-portrait1','空気の向こう側','息を止めた場所を、煙だけが通る。',1],
  ['abstract-49','まぶたの外','閉じても、向こう側だけが明るい。',3],
  ['AE404-2L','まだほどけない','手を離すと、光だけが残った。',3],
  ['T03C','失くした輪郭','見つけるたび、すこし遠くなる。',3],
  ['T08C','紙より薄い','そこにあったことだけが残る。',3],
  ['T12C','誰もいない朝','窓に近づくほど、部屋は遠くなる。',3],
  ['PV02A-1','夜の縫い目','縫い合わされた二つの夜。',2],
  ['R015_everyday_film','借りた光','自分のものだったのは影だけ。',3],
];

const bodyArt=Object.values(figures);
const mediaCues=[];
let materialAnchors=0;

function floatingFragment(slot,x,y,z,size,angle,cue=null){
  const [label,title,note,material]=fragments[slot%fragments.length];
  const texture=prints[label]?'atlas':'coast';
  const data=(prints[label]??shore[label]);
  const [,,width,height]=data;
  const w=size*Math.min(1,width/height), h=size*Math.min(1,height/width);
  floating(data,texture,x,y,z,w,h,angle,28,{fragment:material,cue});
  exhibits.push({x,y,z,w,h,angle,title,note,cue});
}

function floatingMaterial(slot,fragment,x,y,z,size,angle,{echo,mirrored,materialFirst=false}={}){
  if(materialFirst&&materialAnchors++%5===0){
    floatingFragment(fragment,x,y,z,size,angle);
    return;
  }
  const cue={at:0};
  const order=(x*11.21+y*3.71+z*7.13);
  mediaCues.push({cue,priority:Math.sin(order)*.5+.5});
  floatingFragment(fragment,x,y,z,size,angle,cue);
  floating(bodyArt[slot],'hologram',x,y,z,size,size,angle,7,{slot,cue,echo,mirrored});
  exhibits.push({x,y,z,w:size,h:size,angle,cue,figure:true,
    title:'あとから来る輪郭',note:'透けているのは、内側にいたはずの時間。'});
}

// Three different projections, sampled directly from their source images.
const installations=[
  ['TM-SM04-landscape1',-6.9,1.8,26.3,.60,3.8,2.44,3,'息の裏','吸い込んだほうが、先に出ていった。'],
  ['R012_print_abstract',0,3.17,31.7,0,6.65,3.85,4,'同じ朝の反対側','昨日を裏返すと、まだ誰も来ていない。'],
  ['TM-HP04-portrait1',7.1,1.7,26.8,-.64,3.3,3.2,5,'指のないほう','触れる前から、跡だけが私を待っていた。'],
  ['R015_mixed_media_qwen',-5.9,4.05,29.4,.51,4.65,2.35,4,'いつかの左側','ここに来なかったほうの私が、あとから曲がる。'],
  ['abstract-49',5.9,4.16,29.85,-.54,4.62,2.40,4,'まぶたの外','閉じても、向こう側だけが明るい。'],
];
let collagePanel=0;
for(const [label,x,y,z,angle,w,h,kind,title,note] of installations){
  if(!prints[label])continue;
  const screen=x===0&&kind===4;
  if(screen)face(along(x,y,z,w,w*9/16,angle),[1,1,1],'reel',uv,17,{screen:true});
  else floating(prints[label],'atlas',x,y,z,w,h,angle,kind,kind===4?{panel:collagePanel++}:null);
  exhibits.push({x,y,z,w,h,angle,title,note,screen});
}
for(const i of bodyArt.keys()){
  const lane=Math.floor(i/12), block=Math.floor(i%12/2), side=i%2?1:-1;
  const x=side*(3.55+lane*2.40+(block%2)*.24);
  const y=1.49+((block+lane*2)%4)*.40+(lane===2?2.35+block*.69:lane===1&&block>2?1.62:0);
  const z=20.6+block*2.83+lane*.83+(side===1?.52:0);
  const angle=-side*(.30+(i%5)*.09);
  const h=2.62+(i%4)*.20;
  const materialFirst=(block+lane+i%2)%3!==0&&![4,14,27].includes(i);
  floatingMaterial(i,i===1?0:i,x,y,z,h*(materialFirst?1.10:1),angle,{materialFirst});
}
// Portraits hang in depth and height above the walking route.
for(const [i,[x,y,z,h,angle]] of [
  [-2.93,5.28,24.42,5.1,.22],[2.38,7.12,26.72,6.2,-.28],
  [.05,8.48,31.75,7.2,.03],[5.12,10.80,34.15,5.4,-.54],
  [-6.12,11.15,33.75,4.65,.62],
].entries()){
  const materialFirst=i===0||i===2;
  const slot=[8,5,10,4,1][i];
  floatingMaterial(slot,i===0?5:9,x,y,z,h*(materialFirst?1.06:1),angle,{materialFirst});
}
// Offset, opposing reflections make the echo readable as a volume when walking beside it.
for(const [i,side] of [-1,1].entries()){
  for(let layer=0;layer<5;layer++){
    const x=side*(3.4+layer*.92), y=2.62+layer*.65;
    const z=30.4+layer*.72+i*.9, span=4.35-layer*.56;
    const slot=i===0?9:1;
    const materialFirst=layer===4||(layer===3&&i===1);
    floatingMaterial(slot,2+layer+i,x,y,z,span,side*(.56+layer*.09),
      {echo:layer,mirrored:i===0,materialFirst});
  }
}
for(const [x,y,z,w,h,angle,label,panel] of [
  [-3.6,7.86,27.3,4.25,2.51,.48,'abstract-45',1],
  [3.26,9.65,29.6,4.9,2.71,-.38,'R015_mixed_media_qwen',2],
  [.02,12.24,35.2,6.35,3.04,.05,'abstract-49',0],
]){
  floating(prints[label],'atlas',x,y,z,w,h,angle,4,{panel});
}
for(const [i,z] of [21.5,25.8,30.6,35.6].entries()){
  const y=6.9+i*2.1, span=3.9+i*.95, tint=[.085,.17,.25];
  const line=.038;
  box(-span,y,z-line,span,y+line,z+line,tint,{material:29});
  box(-span,y-2.9,z-line,-span+line,y,z+line,tint,{material:29});
  box(span-line,y-2.9,z-line,span,y,z+line,tint,{material:29});
  for(const side of [-1,1]){
    const x=side*(span+.75), width=2.3+i*.25;
    face(along(x,y-2.1,z+.035,width,5.1,.27*side),[.71,.85,1.],'solid',uv,30);
  }
}
// The outer galleries tile laterally at the period boundary. Their figures and
// light rails are spaced away from the center corridor and the unique exits.
for(const side of [-1,1]){
  for(let aisle=0;aisle<4;aisle++){
    const x=side*(12.7+aisle*5.35);
    const tint=aisle%2?[.10,.16,.28]:[.14,.12,.24];
    box(x-.035,.014,16.05,x+.035,.035,37.60,tint,{material:29});
    for(let pair=0;pair<3;pair++){
      const z=19.65+pair*6.52+(.53*(aisle%2));
      const salt=side===1?11:0;
      const slot=(aisle*7+pair*11+salt)%36;
      const height=2.9+(pair%2)*2.3+(aisle%2)*1.4;
      const position=x+side*1.65, size=3.9+pair*.63, angle=side*(.28+aisle*.39);
      const materialFirst=pair===(aisle+Number(side===1))%3;
      floatingMaterial(slot,3+aisle+pair+salt,position,height,z,size,angle,{materialFirst});
      const phrase=aisle%2===0?'観測':'まだ、ここにいる';
      if(pair===1)floating(lettering[phrase],'hologram',x,5.9+(aisle%3)*1.3,z+.48,
        3.12,.8,side*.45,8);
    }
  }
}
mediaCues.sort((a,b)=>a.priority-b.priority)
  .forEach(({cue},rank)=>{cue.at=galleryHologramCue(rank,mediaCues.length);});
const titles=[
  ['まだ、ここにいる',-3.5,3.2,23.9,.38,3.6],['観測',6,4.9,24.5,-.38,3.6],
  ['思春期症候群',-.8,7.1,33.35,.14,5],
];
titles.forEach(([word,x,y,z,angle,w])=>{
  const data=lettering[word];
  floating(data,'hologram',x,y,z,w,w*data[3]/data[2],angle,8,word==='思春期症候群'?{reveal:182.19}:null);
});
[
  [-2.92,3.34,24.5,.22,2.8],[2.99,3.7,25.4,-.26,2.88],
  [-5.23,4.95,26.9,.35,3.2],[5.1,5.37,28.17,-.32,3.04],
  [-2.18,6.62,28.8,.16,2.85],[2.1,7.36,28.6,-.14,3.05],
  [-5.38,7.94,32.5,.33,3.40],[5.53,8.33,34.4,-.38,3.63],
  [-1.8,9.79,34.8,.15,3.25],[2.13,10.32,35.2,-.10,3.26],
  [.07,11.97,36.09,0,4.1],[3.1,2.15,23.5,-.32,2.58],
].forEach(([x,y,z,angle,w],dream)=>{
  const data=lettering['#夢見る'];
  floating(data,'hologram',x,y,z,w,w*data[3]/data[2],angle,8,{dream});
});
// Low light strips mark the way through the floaters.
for(const side of [-1,1])box(side*1.83-.012,.018,16.1,side*1.83+.012,.035,37.65,
  [.21,.35,.45],{material:29});

// WebGL uses the quad's UVs to draw the sky as a distant background.
face(along(0,0,0,2,2,0),[1,1,1],'solid',uv,9,{sky:true,unique:true,afterGate:true});
const halfShore=shorePeriod/2;
const coastTile={coastTile:true};
face([[-halfShore,0,120],[halfShore,0,120],[halfShore,0,38],[-halfShore,0,38]],
  [.24,.36,.52],'solid',uv,6,{...coastTile,terrain:true});
face([[-halfShore,0,38],[halfShore,0,38],[halfShore,1.3,30],[-halfShore,1.3,30]],
  [.27,.29,.38],'solid',uv,6,{...coastTile,coastOnly:true,terrain:true});
face([[-halfShore,1.3,30],[halfShore,1.3,30],[halfShore,1.3,-72],[-halfShore,1.3,-72]],
  [.27,.29,.38],'solid',uv,6,{...coastTile,coastOnly:true,terrain:true});

// Clip one rotated footprint against the edges of the other. The canvas heights
// are planar, so the vertices of this intersection contain the closest contact.
export function footprintIntersection(a,b){
  let polygon=a.map(([x,,z])=>[x,z]);
  for(let j=0;j<b.length&&polygon.length;j++){
    const [x,,z]=b[j], [u,,v]=b[(j+1)%b.length];
    const side=([px,pz])=>(u-x)*(pz-z)-(v-z)*(px-x);
    const next=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i], q=polygon[(i+1)%polygon.length];
      const d=side(p), e=side(q);
      if(d>=0)next.push(p);
      if((d<0)!==(e<0)){
        const t=d/(d-e);
        next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
      }
    }
    polygon=next;
  }
  return polygon;
}

const placedCanvases=[];
for(const [i,[,data]] of Object.entries(shore).entries()){
  const [sx,sy,sw,sh]=data;
  const cue=canvasCue(i);
  const position=i*19%54;
  const col=position%7, row=Math.floor(position/7);
  const x=(col-3)*1.72+Math.sin(i*12.37)*.72;
  const z=43.28+row*1.62+Math.cos(i*1.41)*.63;
  const longest=1.20+(i%5)*.19, w=longest*Math.min(1,sw/sh), d=longest*Math.min(1,sh/sw);
  const angle=Math.sin(i*5.13)*.66;
  const slope=.038+(i%3)*.018;
  function corners(inset,y){
    const dx=w/2-inset,dz=d/2-inset,c=Math.cos(angle),s=Math.sin(angle);
    return [[-dx,-dz],[dx,-dz],[dx,dz],[-dx,dz]].map(([u,v])=>
      [x+u*c-v*s,y+slope*(v+dz)/d,z+u*s+v*c]);
  }
  const footprint=corners(0,0);
  const rise=(px,pz)=>slope*((pz-z)*Math.cos(angle)-(px-x)*Math.sin(angle)+d/2)/d;
  let level=.054;
  for(const item of placedCanvases){
    for(const [px,pz] of footprintIntersection(footprint,item.footprint))
      level=Math.max(level,item.top(px,pz)+.053-rise(px,pz));
  }
  const radius=Math.hypot(w,d,slope+.052)/2;
  const nearFlight=placedCanvases.filter(item=>Math.hypot(x-item.x,z-item.z)<radius+item.radius);
  const start=cue<0?-1:Math.max(cue,...nearFlight.map(item=>item.landed+.08));
  placedCanvases.push({x,z,radius,footprint,top:(px,pz)=>level+rise(px,pz)+.004,
    landed:start<0?-1:start+dropDuration});
  const action=start<0?coastTile:{coastTile:true,drop:{at:start,pivot:[x,level,z],angle,
    mount:[x,7.6+(i%4)*1.12,z]}};
  const rim=corners(0,level), under=corners(0,level-.052);
  face(corners(-.14,0).map(([x,,z])=>[x,.008,z]),[.105,.079,.071],'solid',uv,22,action);
  face(rim,[.91,.86,.75],'solid',uv,24,action);
  face([...under].reverse(),[.58,.46,.33],'solid',uv,20,action);
  for(let j=0;j<4;j++)face([rim[j],rim[(j+1)%4],under[(j+1)%4],under[j]],
    [.75,.65,.50],'solid',uv,24,action);
  face(corners(.021,level+.004),[1,1,1],'coast',
    [(sx+.65)/2048,(sy+.65)/2048,(sx+sw-.65)/2048,(sy+sh-.65)/2048],21,action);
}
exhibits.push({x:.45,y:.1,z:45.1,w:6,h:1,angle:0,title:'水に入る手前',
  note:'終わった日から、潮だけが帰ってくる。'});

export function canWalk(x,z,exitOpen=false,entrySealed=false){
  const r=.27;
  const room=roomAt(z);
  if(entrySealed&&room===0)return false;
  const {width}=zones[room];
  if(room===1&&z<15.72&&Math.abs(x)>=1.83)return false;
  if(z>37.53&&z<39.1&&(!exitOpen||Math.abs(x)>=1.83))return false;
  return (room!==0||Math.abs(x)<width-r)&&z>.18+r&&z<58.7-r&&
    !colliders.some(b=>x>b.x1-r&&x<b.x2+r&&z>b.z1-r&&z<b.z2+r);
}
