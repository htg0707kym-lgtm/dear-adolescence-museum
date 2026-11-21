import {rooms, roomAt, surfaces, exhibits, canWalk, galleryPeriod, galleryDepthPeriod,
  shorePeriod,shoreThreshold,shoreOpening,wrapGalleryX,advanceGalleryDepth} from './world.js';
import {screenCrops} from './screen.js';
import {figures,lettering,prints} from './collection.js';
import {collageScore,dreamAccentAt,dreamsAt,hologramScore,mirrorStrength,projectionScore,
  galleryDepartureTime,galleryPresence,galleryHologramBlend,installationScore,
  scoreLength,soundtrackScoreTime,dropDuration,exitCue,exitFade} from './score.js';

const byId=id=>document.getElementById(id);
const canvas=byId('view'), music=byId('music'), sound=byId('sound');
const entry=byId('entry'), stick=byId('stick'), plaque=byId('plaque');
const captions=byId('captions');
const reel=byId('reel'), dreamOverlay=byId('dream-accent');
const roomButtons=[...byId('rooms').querySelectorAll('button')];
const wordmark=document.querySelector('.wordmark');
const entranceDuration=1.20;
const camera={...rooms[0]};
const eye=1.66;
const keys=new Set();
const move={x:0,z:0};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const gl=canvas.getContext('webgl',{antialias:true,alpha:false});
let inside=false, animation=0, showCaptions=false;
let exitOpen=false, entrySealed=false, entranceReleased=false, galleryTurn=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const atlasRegion=([x,y,w,h])=>[
  (x+.65)/2048,(y+.65)/2048,(x+w-.65)/2048,(y+h-.65)/2048,
];
const figureRegions=Object.values(figures).map(atlasRegion);
const projectedPrints=['abstract-45','TM-SM04-landscape1','TM-HP04-portrait1','R015_mixed_media_qwen','R012_print_abstract']
  .map(name=>atlasRegion(prints[name]));
let shownAccent=0;

function showDreamAccent(count){
  if(count===shownAccent)return;
  shownAccent=count;
  dreamOverlay.hidden=!count;
  dreamOverlay.dataset.multiple=String(count>1);
  if(!count)return;
  dreamOverlay.replaceChildren(...Array.from({length:count},()=>{
    const word=document.createElement('span');
    word.textContent='#夢見る';
    return word;
  }));
}

function soundState(){
  const playing=!music.paused&&!music.muted;
  sound.textContent=playing?'消音':music.paused?'音を再生':'音を出す';
  sound.setAttribute('aria-pressed',String(playing));
}
function playMusic(){
  if(music.ended)music.currentTime=0;
  music.play().catch(soundState);
}
music.addEventListener('play',soundState);
music.addEventListener('pause',soundState);
music.addEventListener('ended',soundState);
music.addEventListener('volumechange',soundState);
sound.addEventListener('click',()=>{
  if(music.paused){
    music.muted=false;
    playMusic();
  }else music.muted=!music.muted;
});
captions.addEventListener('click',()=>{
  showCaptions=!showCaptions;
  captions.setAttribute('aria-pressed',String(showCaptions));
  previous=null;
  if(!showCaptions)plaque.hidden=true;
});

function enter(withMusic){
  if(inside)return;
  music.muted=!withMusic;
  playMusic();
  inside=true;
  entry.hidden=true;
  if(!gl||!animation)return;
  byId('controls').hidden=false;
  byId('rooms').hidden=false;
  byId('aim').hidden=false;
  captions.hidden=false;
  canvas.focus({preventScroll:true});
}
byId('enter').addEventListener('click',()=>enter(true));
byId('quiet').addEventListener('click',()=>enter(false));

function buildRenderer(){
  const program=gl.createProgram();
  const vertex=`
    attribute vec3 position;
    attribute vec3 color;
    attribute vec2 local;
    attribute vec4 region;
    attribute float kind;
    attribute vec4 origin;
    attribute vec4 mount;
    uniform vec3 camera;
    uniform vec4 rotation;
    uniform vec2 scale;
    uniform float coastClock;
    uniform float entrySlide;
    uniform vec2 galleryOffset;
    uniform float still;
    varying vec3 world;
    varying vec3 tint;
    varying vec2 coord;
    varying vec4 crop;
    varying float surfaceKind;
    varying float dist;
    varying float contact;
    void main(){
      if(kind>8.5&&kind<9.5){
        coord=local;
        surfaceKind=kind;
        gl_Position=vec4(local.x*2.-1.,1.-local.y*2.,.9999,1.);
        return;
      }
      vec3 placed=position;
      placed.x+=entrySlide;
      contact=1.;
      if(origin.w>=0.){
        float age=coastClock-origin.w;
        if(age<0.){
          gl_Position=vec4(2.,2.,2.,1.);
          return;
        }
        float p=clamp(age/${dropDuration.toFixed(2)},0.,1.);
        if(still>.5)p=step(0.,age);
        if(kind>21.5&&kind<22.5){
          contact=smoothstep(.76,1.,p);
        }else if(p<1.){
          float relYaw=mount.w;
          vec3 v=position-origin.xyz;
          vec2 axis=vec2(cos(relYaw),sin(relYaw));
          vec2 uv=vec2(dot(v.xz,axis),dot(v.xz,vec2(-axis.y,axis.x)));
          float flight=1.-smoothstep(.22,.70,p);
          float tilt=flight*.72;
          float turn=relYaw+sign(origin.x)*flight*1.34;
          float vertical=v.y*cos(tilt)-uv.y*sin(tilt);
          float z=v.y*sin(tilt)+uv.y*cos(tilt);
          vec3 rotated=vec3(uv.x*cos(turn)-z*sin(turn),vertical,uv.x*sin(turn)+z*cos(turn));
          vec3 center=mix(mount.xyz,origin.xyz,vec3(p,p*p,p));
          placed=center+rotated;
        }
      }
      placed.xz+=galleryOffset;
      vec3 delta=placed-camera;
      float side=rotation.x*delta.x-rotation.y*delta.z;
      float fwd=rotation.y*delta.x+rotation.x*delta.z;
      float vertical=rotation.z*delta.y-rotation.w*fwd;
      float depth=rotation.w*delta.y+rotation.z*fwd;
      gl_Position=vec4(side*scale.x,vertical*scale.y,1.0010*depth-.102,depth);
      world=placed-vec3(galleryOffset.x,0.,galleryOffset.y);tint=color;coord=local;crop=region;surfaceKind=kind;dist=depth;
    }`;
  const fragment=`
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D plate;
    uniform sampler2D film;
    uniform sampler2D glassMatte;
    uniform sampler2D art;
    uniform sampler2D projectionAtlas;
    uniform sampler2D materials;
    uniform sampler2D shoreSky;
    uniform vec3 camera;
    uniform vec4 rotation;
    uniform vec2 scale;
    uniform vec2 galleryOffset;
    uniform float portalView;
    uniform float shoreBank;
    uniform vec4 filmCrop[4];
    uniform vec4 holoCrop;
    uniform vec4 artCrop;
    uniform vec4 dreamCrop;
    uniform float layout;
    uniform float seed;
    uniform float painted;
    uniform float time;
    uniform float score;
    uniform float projectionMode;
    uniform float strength;
    uniform float flipped;
    uniform float erosion;
    uniform float dreamPresence;
    uniform float projectorOn;
    uniform float installationMode;
    uniform float installationClock;
    uniform float lightPulse;
    uniform float fragmentMaterial;
    uniform float exhibitPresence;
    uniform vec3 galleryLight;
    varying vec3 world;
    varying vec3 tint;
    varying vec2 coord;
    varying vec4 crop;
    varying float surfaceKind;
    varying float dist;
    varying float contact;
    vec4 specimen(vec2 p){
      return texture2D(plate,mix(crop.xy,crop.zw,clamp(p,.002,.998)));
    }
    float ribbon(float x,float center,float width){
      return 1.-smoothstep(width,width+.024,abs(x-center));
    }
    float noise(vec2 p){
      return fract(sin(dot(p,vec2(17.021,47.337)))*1628.257);
    }
    float grain(vec2 p, vec2 tile){
      vec2 samplePoint=(tile+.015625+fract(p)*.96875)*vec2(.25,.5);
      return texture2D(materials,samplePoint).r-.5;
    }
    float detailFade(float nearDistance,float farDistance){
      return 1.-smoothstep(nearDistance,farDistance,dist);
    }
    vec3 ceilingBounce(){
      float strip=exp(-pow((abs(world.x)-4.90)*.74,2.));
      return vec3(.25,.17,.10)*strip*smoothstep(0.,1.8,world.z);
    }
    bool hitsShoreOpening(vec3 ray){
      float depth=${shoreThreshold.toFixed(2)}-camera.z;
      if(abs(depth)<.001){
        bool towardOpening=depth>0.?ray.z>0.:ray.z<0.;
        return towardOpening&&abs(camera.x)<${shoreOpening.halfWidth.toFixed(2)};
      }
      if(abs(ray.z)<.0001)return false;
      float t=depth/ray.z;
      vec2 point=camera.xy+t*ray.xy;
      return t>0.&&abs(point.x)<${shoreOpening.halfWidth.toFixed(2)}&&
        point.y>=0.&&point.y<=${shoreOpening.height.toFixed(2)};
    }
    vec3 skyRay(){
      vec2 view=(vec2(coord.x,1.-coord.y)*2.-1.)/scale;
      float forward=rotation.z-rotation.w*view.y;
      float up=rotation.w+rotation.z*view.y;
      return normalize(vec3(rotation.x*view.x+rotation.y*forward,up,rotation.x*forward-rotation.y*view.x));
    }
    vec3 screenArt(vec2 p,float frameAspect){
      vec2 span=artCrop.zw-artCrop.xy;
      float imageAspect=span.x/span.y;
      vec2 scale=vec2(max(1.,frameAspect/imageAspect),max(1.,imageAspect/frameAspect));
      vec2 q=(p-.5)*scale+.5;
      vec2 edge=min(q,1.-q);
      float inside=smoothstep(-.015,.020,min(edge.x,edge.y));
      vec3 image=texture2D(projectionAtlas,mix(artCrop.xy,artCrop.zw,clamp(q,0.,1.))).rgb;
      return mix(galleryLight*.055,image,inside);
    }
    vec3 centralProjection(vec4 frame){
      vec2 p=coord;
      if(installationMode<.5)return frame.rgb;
      if(installationMode<1.5){
        float column=min(3.,floor(p.x*4.));
        vec4 bounds=column<.5?filmCrop[0]:column<1.5?filmCrop[1]:column<2.5?filmCrop[2]:filmCrop[3];
        vec2 span=bounds.zw-bounds.xy;
        vec2 cell=vec2(fract(p.x*4.),p.y);
        float aspect=span.x/span.y;
        vec2 slice=(cell-.5)*vec2(.72*(16./36.)/aspect,.81)+.5;
        vec2 side=min(slice,1.-slice);
        vec4 figure=texture2D(projectionAtlas,mix(bounds.xy,bounds.zw,clamp(slice,0.,1.)));
        figure.a*=smoothstep(0.,.025,min(side.x,side.y));
        vec3 ground=screenArt(p,16./9.);
        float joint=smoothstep(.0,.018,.5-abs(fract(p.x*4.)-.5));
        return (ground*.27+figure.rgb*figure.a*.94)*joint;
      }
      if(installationMode<2.5){
        vec2 q=vec2(.11+abs(p.x-.5)*1.55,p.y);
        vec3 inside=specimen(q).rgb;
        vec3 outside=specimen(vec2(1.-q.x*.78,.50+(q.y-.50)*.79)).rgb;
        float edge=smoothstep(.25,.50,abs(p.x-.50));
        return mix(inside,outside*vec3(1.,.72,.62),edge*.92)*(.9-edge*.18);
      }
      if(installationMode<3.5){
        vec2 palm=vec2((p.x-.5)*2.35+.5,p.y+.01);
        vec3 trace=screenArt(p,16./9.);
        float density=dot(trace,vec3(.23,.62,.15));
        float breath=.5+.5*sin(installationClock*.62);
        float veil=exp(-abs(p.y-.47+.1*sin(p.x*4.+installationClock*.51))*4.);
        float glass=1.-smoothstep(.34,.52,abs(palm.x-.5));
        return (trace*(.42+breath*.23)+galleryLight*(.09+veil*.24)*density)*glass+
          galleryLight*.12*veil*(1.-glass);
      }
      if(installationMode>5.5){
        vec2 q=p;
        float edge=1.;
        if(installationMode<6.5){
          // Staggered horizontal exposures, each on a different plate.
          float strip=min(4.,floor(p.y*5.));
          q.x=fract(p.x+strip*.14+installationClock*.033);
          vec3 copy=screenArt(q,16./9.);
          return mix(copy,specimen(q).rgb,mod(strip,2.)*.76)*(.74+.26*fract(p.y*5.));
        }else if(installationMode<7.5){
          // The center seam acts like the opening between two film leaves.
          float fold=.5+.31*sin(installationClock*.55);
          q.x=fract(abs(p.x-fold)*1.56+.10);
          edge=.75+.25*smoothstep(.0,.06,abs(p.x-fold));
        }else if(installationMode<8.5){
          vec2 cell=fract(p*vec2(3.,2.));
          float band=mod(floor(p.x*3.)+floor(p.y*2.),2.);
          q=mix(cell,1.-cell,band);
          edge=smoothstep(.0,.030,min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y)));
        }else if(installationMode<9.5){
          float wave=.035*sin(p.y*8.+installationClock*.74);
          q.x+=wave;
          q.y=.5+(p.y-.5)*(.85+.15*cos(p.x*6.));
          edge=.56+.44*exp(-pow((p.x-.5)*2.,2.));
        }else if(installationMode<10.5){
          float aperture=.36+.16*sin(installationClock*.42);
          edge=smoothstep(aperture,aperture+.18,abs(p.x-.5)*1.8);
          vec3 plateColor=screenArt(p,16./9.);
          return mix(plateColor,specimen(vec2(1.-p.x,p.y)).rgb,edge*.92);
        }else if(installationMode<11.5){
          float blind=fract(p.y*9.);
          q.x=p.x+.065*sin(floor(p.y*9.)+installationClock*.5);
          edge=.6+.40*smoothstep(.01,.12,blind);
        }else{
          q=.5+(p-.5)*(1.06+.10*sin(installationClock*.24));
          edge=.64+.36*max(0.,1.-length((p-.5)*1.8));
        }
        vec3 image=screenArt(q,installationMode>7.5&&installationMode<8.5?32./27.:16./9.);
        return image*edge*(.77+galleryLight*.37);
      }
      vec2 divided=vec2(p.x+.023*sin(p.y*6.+installationClock*.25),p.y);
      vec3 abstract=screenArt(divided,16./9.);
      float paper=smoothstep(.0,.15,p.x)*(1.-smoothstep(.85,1.,p.x));
      if(installationMode<4.5)return abstract*(.71+.29*paper);
      float loss=clamp((score-(${exitCue.toFixed(4)}-11.))/11.,0.,1.);
      float threshold=.52+sin(p.x*9.+p.y*5.)*.24+sin(p.x*17.-p.y*9.)*.16;
      float remaining=1.-smoothstep(threshold-.12,threshold+.12,loss);
      return abstract*remaining*(.78-loss*.50)+galleryLight*.10*paper*(1.-loss);
    }
    void main(){
      if(surfaceKind>8.5&&surfaceKind<9.5){
        vec3 ray=skyRay();
        bool doorway=hitsShoreOpening(ray);
        if(portalView<1.5&&!doorway)discard;
        if(portalView>1.5&&doorway){
          gl_FragColor=vec4(.039,.049,.082,1.);
          return;
        }
        float horizon=1.-smoothstep(-.012,.55,ray.y);
        float azimuth=abs(atan(ray.x,ray.z))/3.141593;
        vec3 sky=texture2D(shoreSky,vec2(.055+.89*azimuth,horizon)).rgb;
        sky=mix(sky,vec3(.49,.55,.61),.28*smoothstep(.85,1.,horizon));
        gl_FragColor=vec4(sky,1.);
        return;
      }
      vec3 point=world+vec3(galleryOffset.x,0.,galleryOffset.y);
      if(portalView>.5&&!hitsShoreOpening(point-camera))discard;
      if(shoreBank>.5&&(hitsShoreOpening(point-camera)||(abs(point.x)<2.14&&point.z>34.)))discard;
      vec3 rgb=tint;
      float alpha=1.;
      if(painted>.5){
        vec4 frame=specimen(coord);
        rgb=frame.rgb*.96;
        if(surfaceKind>2.5&&surfaceKind<3.5){
          vec2 p=coord;
          p.x+=sin(p.y*9.+time*.68)*.065;
          p.y+=cos(p.x*7.-time*.42)*.044;
          vec3 breath=specimen(p).rgb;
          float density=max(breath.r,max(breath.g,breath.b));
          rgb=breath*vec3(.53,.77,1.0)+vec3(.18,.15,.27)*density;
          alpha=smoothstep(.045,.74,density)*.88;
        }else if(surfaceKind>3.5&&surfaceKind<4.5){
          vec2 grid=vec2(2.,2.);
          if(layout>.5&&layout<1.5)grid=vec2(4.,1.);
          if(layout>1.5&&layout<2.5)grid=vec2(1.,4.);
          if(layout>2.5&&layout<3.5)grid=vec2(3.,2.);
          if(layout>3.5&&layout<4.5)grid=vec2(2.,3.);
          if(layout>4.5)grid=vec2(7.,4.);
          vec2 tile=floor(coord*grid);
          vec2 detail=fract(coord*grid);
          float index=mod(tile.x+tile.y*grid.x,4.);
          vec4 bounds=index<.5?filmCrop[0]:(index<1.5?filmCrop[1]:(index<2.5?filmCrop[2]:filmCrop[3]));
          if(layout>4.5&&fract((tile.x*2.+tile.y*3.+seed)*.173)>.46)bounds=filmCrop[0];
          vec2 p=(coord-.5)*vec2(.92,.88)+.5+vec2(sin(seed*.31+index)*.067,cos(seed*.39+index)*.044);
          vec4 person=texture2D(film,mix(bounds.xy,bounds.zw,clamp(p,0.,1.)));
          vec3 under=specimen(coord+vec2(.055*sin(score*.21),0.)).rgb;
          float line=1.-smoothstep(.005,.014,min(detail.x,detail.y));
          rgb=mix(under*.55,person.rgb*vec3(.83,.99,1.16),person.a*.94);
          rgb+=vec3(.23,.36,.39)*line*.42;
          alpha=.92*strength;
        }else if(surfaceKind>4.5&&surfaceKind<5.5){
          float gate=ribbon(coord.y,.50+.42*sin(time*.48),.09);
          float luminance=dot(frame.rgb,vec3(.22,.71,.07));
          rgb=mix(vec3(.24,.40,.67),frame.rgb,.53)*(luminance*.67+gate*.80);
          float rim=smoothstep(.0,.20,min(min(coord.x,1.-coord.x),min(coord.y,1.-coord.y)));
          alpha=(.13+gate*.73)*smoothstep(.08,.51,luminance)*rim;
        }else if(surfaceKind>6.5&&surfaceKind<8.5){
          float pane=0.;
          if(surfaceKind<7.5){
            vec2 extent=holoCrop.zw-holoCrop.xy;
            vec2 pos=(coord-.5)/min(vec2(1.),vec2(extent.x/extent.y,extent.y/extent.x))+.5;
            if(any(lessThan(pos,vec2(0.)))||any(greaterThan(pos,vec2(1.))))discard;
            if(flipped>.5)pos.x=1.-pos.x;
            vec2 volumeUV=mix(holoCrop.xy,holoCrop.zw,pos);
            frame=texture2D(plate,volumeUV);
            pane=texture2D(glassMatte,volumeUV).r;
            vec2 p=pos-.5;
            p.x=sin(p.x*2.53)*.48;
            p.y+=.10*p.x*p.x+.026*sin(p.x*11.+time*.72);
            if(projectionMode<.5){
              p+=vec2(.05*sin(p.y*12.+time*.92),.055*cos(p.x*9.+time*.65));
            }else if(projectionMode<1.5){
              p.y+=.16*sin(time*.43+p.x*4.);
              p.x+=.06*sin(time*.64+p.y*7.);
            }else if(projectionMode<2.5){
              p.x+=.08*sin(time*.42);
            }else if(projectionMode<3.5){
              p.x+=sin(time*.63+world.z*.32)*.09;
              p.y+=.13*p.x+sin(p.x*19.)*.012;
            }else{
              p=(p*vec2(.90,.74))+.03*cos(time*.96+p.y*8.);
            }
            vec2 uv=clamp(p+.5,.002,.998);
            vec3 inside=texture2D(art,mix(artCrop.xy,artCrop.zw,uv)).rgb;
            vec3 edge=texture2D(art,mix(artCrop.xy,artCrop.zw,clamp(uv+vec2(.017,0.),.002,.998))).rgb;
            float rim=pow(abs(p.x)*2.,2.);
            inside=mix(inside,edge,.26*rim);
            float value=dot(frame.rgb,vec3(.21,.72,.07));
            float space=1.-smoothstep(.69,.97,value);
            vec3 tintGlass=vec3(.90,1.04,1.19);
            if(projectionMode>1.5&&projectionMode<2.5)tintGlass=vec3(1.22,.88,1.10);
            if(projectionMode>2.5&&projectionMode<3.5)tintGlass=vec3(1.17,1.04,.91);
            vec3 imprint=inside*tintGlass+vec3(.09,.10,.14);
            float reveal=projectionMode>1.5&&projectionMode<2.5?
              .45+.55*ribbon(pos.y,.48+.32*sin(time*.49),.15):1.;
            float loss=noise(floor(pos*vec2(105.,78.))+floor(time*9.));
            float survive=1.-smoothstep(loss*.82,loss*.82+.18,erosion);
            vec2 typePos=clamp(vec2(uv.x,(uv.y-.40)*4.+.5),.001,.999);
            float ink=texture2D(film,mix(dreamCrop.xy,dreamCrop.zw,typePos)).a;
            imprint=mix(imprint,vec3(.86,.95,1.),ink*dreamPresence*.84);
            frame.rgb=mix(frame.rgb,imprint,pane*reveal*survive*(.39+space*.53));
          }
          float scan=.87+.13*cos(coord.y*116.-time*3.6);
          float glide=ribbon(coord.y,.49+.49*sin(time*.40+world.z*.21),.017);
          rgb=surfaceKind>7.5?frame.rgb:
            frame.rgb*vec3(.72,.91,1.19)+vec3(.12,.23,.33)*(glide+.44);
          alpha=(frame.a*scan*(surfaceKind>7.5?.70:.58+pane*.28)+frame.a*glide*.15)*strength;
        }else if(surfaceKind>9.5&&surfaceKind<10.5){
          float route=7.3+5.25*sin(score*.101+sign(world.x)*1.45);
          float light=exp(-abs(world.z-route)*.63);
          float intensity=(.2+.8*smoothstep(10.7,25.4,score))*(1.-.45*smoothstep(193.,213.,score));
          rgb*=.85+light*.28*intensity;
        }else if(surfaceKind>11.5&&surfaceKind<12.5){
          vec2 shift=vec2(.0016*sin(time*1.8),.001*cos(time*1.4));
          vec2 p=coord+shift;
          float ink=specimen(p).a;
          float fringe=max(specimen(p+vec2(.0028,0.)).a,specimen(p-vec2(.0028,0.)).a);
          vec2 dist=abs(coord-.5)*2.;
          float spill=1.-smoothstep(.69,1.,max(dist.x,dist.y));
          float hot=1.-.32*length((coord-.5)*1.22);
          float grain=.91+.09*noise(floor(coord*vec2(530.,250.))+floor(time*16.));
          float flicker=.95+.03*sin(time*19.)+.02*sin(time*31.);
          rgb=mix(vec3(.53,.66,.85),vec3(.90,.94,1.),ink);
          alpha=(.18*spill+.13*fringe+.69*ink)*hot*grain*flicker;
        }else if(surfaceKind>27.5){
          vec3 specimenColor=frame.rgb;
          if(fragmentMaterial>.5&&fragmentMaterial<1.5){
            vec2 offset=vec2(.049*sin(coord.y*5.+installationClock*.39),
              .032*cos(coord.x*6.-installationClock*.31));
            specimenColor=specimen(coord+offset).rgb;
          }
          float luminance=dot(specimenColor,vec3(.24,.65,.11));
          vec2 border=min(coord,1.-coord);
          float veil=smoothstep(.0,.14,min(border.x,border.y));
          float density=fragmentMaterial<.5?smoothstep(.09,.49,luminance):
            fragmentMaterial<1.5?smoothstep(.06,.63,luminance):
            fragmentMaterial<2.5?smoothstep(.04,.36,luminance):.43+luminance*.46;
          rgb=mix(specimenColor,vec3(luminance)*(.48+galleryLight*.86),.29);
          alpha=veil*density*(.68+.11*sin(installationClock*.37+world.z));
        }else if(surfaceKind>16.5){
          rgb=surfaceKind<17.5?centralProjection(frame):frame.rgb;
          alpha=strength;
          if(surfaceKind>20.5){
            float weave=grain(coord*vec2(5.,7.),vec2(0.,1.));
            rgb=frame.rgb*(.94+weave*.27*detailFade(2.8,12.));
          }
        }
      }else{
        float beacon=.88+.18*cos(world.z*.25+world.x*.11);
        float height=smoothstep(.0,3.4,world.y);
        rgb*=beacon*(.89+.15*height);
        if(surfaceKind>.5&&surfaceKind<1.5){
          float stone=grain(world.xz*.41,vec2(2.,0.));
          float pores=grain(world.xz*2.08,vec2(2.,0.));
          float reflection=exp(-abs(abs(world.x)-4.7)*.75)*.16;
          rgb=tint*(.83+stone*.40+pores*.19*detailFade(5.,20.));
          rgb+=vec3(.96,.76,.53)*reflection;
        }else if(surfaceKind>1.5&&surfaceKind<2.5){
          float bars=exp(-abs(abs(world.x)-1.83)*3.7);
          vec2 tile=world.xz*vec2(.25,9./21.5);
          float banks=.5+.5*cos((world.z-16.)*6.28318/21.5-installationClock*.36);
          float pools=exp(-abs(abs(world.x)-5.9)*.49)*banks;
          rgb=tint*(.88+.37*grain(tile,vec2(2.,0.)))+galleryLight*(.12*bars+.14*pools);
        }else if(surfaceKind>5.5&&surfaceKind<6.5){
          vec2 ground=world.xz;
          float broad=grain(ground*vec2(3./${shorePeriod.toFixed(1)},.14),vec2(1.,1.));
          float grains=grain(ground*vec2(17./${shorePeriod.toFixed(1)},.71),vec2(1.,1.))*detailFade(7.,29.);
          float shorePhase=world.x*6.283185/${shorePeriod.toFixed(1)};
          float shoreline=50.8+.71*sin(shorePhase)+.25*cos(shorePhase*3.)+.39*sin(time*.64);
          float tide=world.z-shoreline+grains*.28;
          float water=smoothstep(-.19,.42,tide);
          vec3 dry=vec3(.57,.47,.375)*(1.+broad*.44+grains*.56);
          vec3 wet=vec3(.31,.27,.26)*(1.+broad*.29+grains*.24);
          vec3 sand=mix(dry,wet,smoothstep(-3.05,.02,tide));
          float swell=sin(shorePhase*4.+ground.y*2.1+broad*4.-time*1.22);
          float ripple=sin(-shorePhase*9.+ground.y*4.8+grains*3.6-time*1.8);
          float crossWave=sin(shorePhase*22.+ground.y*7.9+broad*6.+time*1.15);
          float sheen=smoothstep(.75,2.2,swell*.80+ripple*.72+crossWave*.48)*.12;
          vec3 sea=mix(vec3(.26,.35,.36),vec3(.19,.32,.44),smoothstep(.4,17.,tide));
          sea+=vec3(.68,.81,.87)*(sheen+grains*.08)*detailFade(11.,44.);
          sea=mix(sea,vec3(.40,.48,.56),smoothstep(15.,70.,tide));
          float foam=ribbon(tide+.19*grains,.28,.15)*smoothstep(-.18,.16,broad+grains*.7);
          rgb=mix(sand,sea,water)+vec3(.67,.75,.71)*foam*.37;
        }else if(surfaceKind>17.5){
          if(surfaceKind<18.5){
            vec2 masonry=vec2(world.x+world.z,world.y);
            float plaster=grain(masonry*.43,vec2(0.,0.));
            rgb=tint*(.85+plaster*.26)+ceilingBounce()*.45;
          }else if(surfaceKind<19.5){
            float ceiling=grain(world.xz*.61,vec2(1.,0.));
            rgb=tint*(.79+ceiling*.24)+ceilingBounce();
          }else if(surfaceKind<20.5){
            rgb=tint*(.86+grain(coord*vec2(2.,.74),vec2(3.,0.))*.52);
          }else if(surfaceKind<22.5){
            vec2 edge=abs(coord-.5)*2.;
            rgb=tint;
            alpha=(1.-smoothstep(.62,1.,max(edge.x,edge.y)))*.42*contact;
          }else if(surfaceKind<23.5){
            float wall=grain(vec2(world.x+world.z,world.y)*.41,vec2(2.,0.));
            rgb=tint*(.94+wall*.46)+vec3(.15,.09,.04)*exp(-world.y*.63);
          }else if(surfaceKind<24.5){
            float linen=grain(coord*vec2(2.5,3.),vec2(0.,1.));
            rgb=tint*(.96+linen*.35*detailFade(3.,15.));
          }else if(surfaceKind<25.5){
            rgb=tint*.91+ceilingBounce()*.22;
          }else if(surfaceKind<26.5){
            rgb=tint;
          }else if(surfaceKind<27.5){
            rgb=mix(tint,vec3(.65,.79,.95),projectorOn*.74);
          }else if(surfaceKind<29.5){
            float relay=.52+.48*cos((world.z-16.)*6.28318/21.5-installationClock*.36);
            rgb=tint*.35+galleryLight*(.30+relay*.60)+vec3(.46,.51,.56)*lightPulse;
          }else{
            float core=1.-smoothstep(.02,.48,abs(coord.x-.5));
            float lengthFalloff=sin(coord.y*3.14159);
            float sweep=.5+.5*sin(installationClock*.8+world.z*.11);
            rgb=galleryLight+vec3(.51,.59,.65)*lightPulse;
            alpha=core*lengthFalloff*(.045+.14*sweep+.13*lightPulse);
          }
        }else if(surfaceKind>13.5){
          rgb=tint;
          alpha=(.024+.020*noise(floor(world.xz*27.)+floor(time*7.)))*(1.-coord.y*.72);
        }
      }
      if(painted>.5&&(surfaceKind<8.5||surfaceKind>27.5)&&world.z>15.8&&world.z<38.){
        float sweep=.5+.5*sin(installationClock*.52+world.x*.31-world.y*.55);
        rgb=rgb*(.87+galleryLight*(.17+.25*sweep))+vec3(.19,.22,.28)*lightPulse*sweep;
      }
      alpha*=exhibitPresence;
      if(alpha<.012)discard;
      vec3 air=world.z<15.?vec3(.15,.115,.12):(world.z<38.?vec3(.039,.049,.082):vec3(.43,.44,.54));
      bool clearDistance=surfaceKind>8.5||(surfaceKind>5.5&&surfaceKind<6.5);
      float fog=clearDistance?0.:smoothstep(9.,42.,dist)*.42;
      gl_FragColor=vec4(mix(rgb,air,fog),alpha);
    }`;
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const groups=new Map();
  for(const quad of surfaces){
    const transparent=quad.kind>=3&&quad.kind<=5||[7,8,12,14,17,22,28,30].includes(quad.kind);
    const seal=quad.action?.entrySeal;
    const coastTile=Boolean(quad.action?.coastTile), coastOnly=Boolean(quad.action?.coastOnly);
    const repeat=!coastTile&&!coastOnly&&!quad.action?.unique&&!quad.action?.afterGate&&!quad.action?.exitLight&&
      quad.points.every(p=>p[2]>=15.95&&p[2]<=38);
    const shore=quad.points.every(p=>p[2]>=38);
    const afterGate=Boolean(coastTile||quad.action?.afterGate||shore);
    const projector=quad.kind===25||quad.kind===27;
    const foyer=!quad.action?.sky&&seal===undefined&&quad.points.every(p=>p[2]<14.62);
    const withdrawing=transparent&&repeat&&!quad.action?.screen;
    const key=projector?'projector':quad.kind===22?'shore-shadows':
      seal!==undefined?'entry-seal:'+seal:
      transparent||quad.action?.exitLight?quad:
      [quad.texture,repeat,afterGate,foyer,coastTile,coastOnly,quad.action?.sky,quad.action?.terrain].join(':');
    if(!groups.has(key))groups.set(key,{name:quad.texture,transparent,repeat,afterGate,points:quad.points,
      action:quad.kind===22?null:quad.action,vertices:[],groundShadow:quad.kind===22,foyer,
      withdrawing,coastTile,coastOnly});
    const {vertices}=groups.get(key);
    const corners=[[0,0],[1,0],[1,1],[0,1]];
    const drop=quad.action?.drop;
    const origin=drop?[...drop.pivot,drop.at]:[0,0,0,-1];
    const mount=drop?[...drop.mount,drop.angle]:[0,0,0,0];
    const indices=quad.points.length===3?[0,1,2]:[0,1,2,0,2,3];
    for(const i of indices)vertices.push(...quad.points[i],...quad.color,...corners[i],...quad.region,quad.kind,...origin,...mount);
  }
  const data=new Float32Array(Array.from(groups.values()).reduce((sum,group)=>sum+group.vertices.length,0)), ranges=[];
  let offset=0;
  for(const group of groups.values()){
    const {name,transparent,repeat,afterGate,points,action,vertices,groundShadow,foyer,
      withdrawing,coastTile,coastOnly}=group;
    const x=(points[0][0]+points[2][0])/2, z=(points[0][2]+points[2][2])/2;
    const y=(points[0][1]+points[2][1])/2;
    ranges.push({name,transparent,repeat,afterGate,x,z,action,groundShadow,foyer,coastTile,coastOnly,
      retirement:withdrawing?galleryDepartureTime(x,y,z):null,start:offset/21,count:vertices.length/21});
    data.set(vertices,offset);
    offset+=vertices.length;
  }
  const buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  for(const [name,size,offset] of [['position',3,0],['color',3,3],['local',2,6],['region',4,8],['kind',1,12],['origin',4,13],['mount',4,17]]){
    const location=gl.getAttribLocation(program,name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,size,gl.FLOAT,false,84,offset*4);
  }
  const uniformNames=['camera','rotation','scale','painted','plate','film','glassMatte','art','materials','shoreSky',
    'projectionAtlas','filmCrop[0]',
    'holoCrop','artCrop','dreamCrop','layout','seed','time','score','still','projectionMode','strength',
    'flipped','erosion','dreamPresence','projectorOn','coastClock','galleryOffset',
    'installationClock','installationMode','fragmentMaterial','galleryLight','lightPulse','entrySlide','exhibitPresence',
    'portalView','shoreBank'];
  const uniforms=Object.fromEntries(uniformNames.map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1i(uniforms.plate,0);
  gl.uniform1i(uniforms.film,1);
  gl.uniform1i(uniforms.glassMatte,2);
  gl.uniform1i(uniforms.art,3);
  gl.uniform1i(uniforms.materials,4);
  gl.uniform1i(uniforms.shoreSky,5);
  gl.uniform1i(uniforms.projectionAtlas,6);
  gl.uniform4fv(uniforms.dreamCrop,atlasRegion(lettering['#夢見る']));
  gl.enable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const white=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,white);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));

  const textures={};
  const textureReady=new Set();
  const urls={atlas:'./collection.jpg',heel:'./heel.jpg',objects:'./objects.jpg',
    coast:'./coast.jpg',hologram:'./hologram.webp',glass:'./glass.png',title:'./title.png',
    reel:'./mv-installation.webp',materials:'./materials.webp',sky:'./shore-sky.webp',screen:'./screen.webp'};
  function loadTexture(key){
    if(textures[key])return;
    const tex=gl.createTexture();
    textures[key]=tex;
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const initial=key==='materials'?[128,128,128,255]:key==='sky'?[97,111,137,255]:[45,40,48,255];
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(initial));
    const image=new Image();
    image.onload=()=>{
      gl.bindTexture(gl.TEXTURE_2D,tex);
      const format=key==='glass'?gl.LUMINANCE:gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D,0,format,format,gl.UNSIGNED_BYTE,image);
      if(key==='atlas'||key==='objects'||key==='coast'||key==='screen'){
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      }
      textureReady.add(key);
    };
    image.onerror=()=>textureReady.add(key);
    image.src=urls[key];
  }

  const skyRange=ranges.find(range=>range.action?.sky);
  const opaque=ranges.filter(range=>!range.transparent&&range!==skyRange);
  const translucent=ranges.filter(range=>range.transparent&&!range.groundShadow);
  const groundShadows=ranges.find(range=>range.groundShadow);
  const skies=[[.14,.116,.13],[.039,.049,.082],[.16,.28,.48]];
  const loadedByRoom=[['heel','objects','atlas','title','materials'],
    ['atlas','hologram','glass','reel','screen'],['coast','sky']];
  const preload=room=>loadedByRoom[room].forEach(loadTexture);
  function prepareReel(){
    if(reel.getAttribute('src'))return;
    reel.preload='metadata';
    reel.src='./mv-installation.mp4';
  }
  function playReel(){
    prepareReel();
    reel.play().catch(()=>{});
  }
  roomButtons[1].addEventListener('click',()=>{if(!exitOpen)playReel();});
  preload(0);
  for(const id of ['enter','quiet'])byId(id).addEventListener('click',()=>preload(2),{once:true});
  for(const [i,button] of roomButtons.entries()){
    button.addEventListener('pointerenter',()=>preload(i),{once:true});
    button.addEventListener('focus',()=>preload(i),{once:true});
  }
  const filmBuffer=new Float32Array(16);
  const centralArt=[
    'R012_print_abstract','TM-HP04-portrait1','abstract-49','R015_mixed_media_qwen','AE404-2L',
    'G03-refined-02-landscape','TM-SM04-landscape1','abstract-45','R015_everyday_film',
  ].map(label=>atlasRegion(screenCrops[label]));
  const centralFigures=['img0152','img0082','img0163','img0110'].map(label=>atlasRegion(screenCrops[label]));
  let score=0, dreams=0, finished=false, gateAmount=0, gateStart=null, coastStart=null;
  let reelPlaying=false, reelFrame=-1;
  let galleryStarted=null, installation=installationScore(0,0);
  const baseTile=[[0,0]];
  const coastTiles=Array.from({length:13},(_,i)=>(i-6)*shorePeriod);
  const horizontalTiles=[[-galleryPeriod,0],[0,0],[galleryPeriod,0]];
  const loopTiles=[-galleryDepthPeriod,0,galleryDepthPeriod].flatMap(z=>horizontalTiles.map(([x])=>[x,z]));
  let sealSlide=0, reopensAt=null, galleryElapsed=0;
  const draw=({name,start,count,action,afterGate,foyer,retirement,coastOnly},offsetX,offsetZ,portalView=0,mediaOpacity=1)=>{
    if(!textures[name]&&name!=='solid')return;
    const seal=action?.entrySeal;
    if(seal!==undefined){
      if(!entrySealed||(seal===0&&reopensAt!==null))return;
    }else if(foyer&&entrySealed&&reopensAt===null)return;
    if(action?.reveal>score||action?.afterEnd&&!(finished||entranceReleased)||action?.dream>=dreams)return;
    if((afterGate||action?.exitLight)&&!exitOpen||action?.screen&&gateAmount>=1)return;
    const presence=mediaOpacity*(retirement===null?1:galleryPresence(score,retirement,!reducedMotion.matches));
    if(presence<.015)return;
    gl.uniform1f(uniforms.entrySlide,seal===undefined?0:seal*sealSlide);
    gl.uniform1f(uniforms.exhibitPresence,presence);
    gl.uniform1f(uniforms.strength,1);
    gl.uniform2f(uniforms.galleryOffset,offsetX,offsetZ);
    gl.uniform1f(uniforms.portalView,Number(portalView));
    gl.uniform1f(uniforms.shoreBank,Number(coastOnly&&action?.terrain));
    if(action?.slot!==undefined){
      gl.uniform4fv(uniforms.holoCrop,figureRegions[hologramScore(score,action.slot)]);
      const {phase,fade}=projectionScore(score,action.slot);
      gl.uniform4fv(uniforms.artCrop,projectedPrints[phase]);
      gl.uniform1f(uniforms.projectionMode,phase);
      gl.uniform1f(uniforms.erosion,fade);
      gl.uniform1f(uniforms.flipped,Number(!!action.mirrored));
      if(action.echo!==undefined){
        gl.uniform1f(uniforms.strength,mirrorStrength(score)*Math.pow(.78,action.echo));
      }
    }
    if(action?.panel!==undefined){
      const shot=collageScore(score,action.panel);
      for(const [i,figure] of shot.figures.entries())filmBuffer.set(figureRegions[figure],i*4);
      gl.uniform4fv(uniforms['filmCrop[0]'],filmBuffer);
      gl.uniform1f(uniforms.layout,shot.layout);
      gl.uniform1f(uniforms.seed,shot.seed);
    }
    if(action?.fragment!==undefined)gl.uniform1f(uniforms.fragmentMaterial,action.fragment);
    if(action?.screen){
      const pass=galleryTurn+Math.round(offsetZ/galleryDepthPeriod);
      const pattern=offsetZ===0?installation:installationScore(galleryElapsed,score,pass);
      const {cycle,intensity}=pattern;
      const mode=textureReady.has('screen')?pattern.mode:0;
      const art=mode===3?1:mode===5?2:[3,4,2,0,5,6,7,8][((cycle+mode+pass)%8+8)%8];
      gl.uniform1f(uniforms.installationMode,mode);
      gl.uniform4fv(uniforms.artCrop,centralArt[art]);
      if(mode===1){
        for(let i=0;i<centralFigures.length;i++)
          filmBuffer.set(centralFigures[((i+cycle+pass)%4+4)%4],i*4);
        gl.uniform4fv(uniforms['filmCrop[0]'],filmBuffer);
      }
      gl.uniform1f(uniforms.strength,(1-gateAmount)*(reducedMotion.matches?1:intensity));
    }
    gl.uniform1f(uniforms.painted,Number(name!=='solid'));
    gl.bindTexture(gl.TEXTURE_2D,textures[name]??white);
    gl.drawArrays(gl.TRIANGLES,start,count);
  };
  return (room,time,wallClock)=>{
    finished=music.ended;
    score=finished?scoreLength:soundtrackScoreTime(music.currentTime);
    if(room===1&&galleryStarted===null)galleryStarted=wallClock;
    galleryElapsed=galleryStarted===null?0:Math.max(0,wallClock-galleryStarted);
    const noMotion=reducedMotion.matches;
    if(finished&&!entranceReleased){
      if(!entrySealed||noMotion)reopenEntrance();
      else if(reopensAt===null&&textureReady.has('title'))reopensAt=wallClock;
      else if(reopensAt!==null&&wallClock-reopensAt>=entranceDuration)reopenEntrance();
    }
    const elapsed=reopensAt===null?galleryElapsed:wallClock-reopensAt;
    const slide=clamp(elapsed/entranceDuration,0,1);
    const eased=slide*slide*(3-2*slide);
    sealSlide=noMotion?0:2.23*(reopensAt===null?1-eased:eased);
    installation=installationScore(galleryElapsed,score,galleryTurn);
    dreams=dreamsAt(score);
    showDreamAccent(inside?dreamAccentAt(score):0);
    preload(room);
    if(camera.z>10.5&&camera.z<20.5)preload(room===0?1:0);
    if(room===1)preload(2);
    if(score>=exitCue&&textureReady.has('coast')&&textureReady.has('sky')&&gateStart===null)gateStart=wallClock;
    if(gateStart!==null){
      gateAmount=reducedMotion.matches?1:clamp((wallClock-gateStart)/exitFade,0,1);
      exitOpen=gateAmount>=1;
      roomButtons[2].disabled=!exitOpen;
    }
    if(exitOpen&&room===2&&coastStart===null)coastStart=wallClock;
    const dpr=Math.min(window.devicePixelRatio||1,1.7);
    const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h)gl.viewport(0,0,canvas.width=w,canvas.height=h);
    gl.clearColor(...skies[room],1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(uniforms.camera,camera.x,eye,camera.z);
    const {yaw,pitch}=camera;
    gl.uniform4f(uniforms.rotation,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));
    const aspect=w/h, fov=aspect<1?1.23:1.02;
    const horizontal=Math.min(1.92,1/(Math.tan(fov/2)*aspect));
    gl.uniform2f(uniforms.scale,horizontal,horizontal*aspect);
    gl.uniform1f(uniforms.time,reducedMotion.matches?2:time);
    gl.uniform1f(uniforms.score,score);
    gl.uniform1f(uniforms.installationClock,reducedMotion.matches?0:galleryElapsed%600);
    gl.uniform3fv(uniforms.galleryLight,installation.lighting);
    gl.uniform1f(uniforms.lightPulse,noMotion?0:installation.whitePulse);
    gl.uniform1f(uniforms.coastClock,coastStart===null?-1:wallClock-coastStart);
    gl.uniform1f(uniforms.still,Number(reducedMotion.matches));
    gl.uniform1f(uniforms.dreamPresence,dreams?1:0);
    gl.uniform1f(uniforms.projectorOn,Number(finished||entranceReleased));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,textures.hologram??white);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,textures.glass??white);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D,textures.atlas??white);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D,textures.materials??white);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D,textures.sky??white);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D,textures.screen??white);
    gl.activeTexture(gl.TEXTURE0);
    if(!exitOpen&&room===0&&camera.z>=11)prepareReel();
    const visibleReel=visibleTile=>{
      const mode=installationScore(galleryElapsed,score,galleryTurn+visibleTile).mode;
      return [0,2,6,10].includes(mode);
    };
    const needsReel=room===1&&!exitOpen&&(visibleReel(-1)||visibleReel(0)||visibleReel(1));
    if(reelPlaying!==needsReel){
      reelPlaying=needsReel;
      if(needsReel)playReel();
      else reel.pause();
    }
    if(needsReel&&reel.readyState>=2){
      const frame=Math.floor(reel.currentTime*24);
      if(reelFrame!==frame){
        gl.bindTexture(gl.TEXTURE_2D,textures.reel);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,reel);
        textureReady.add('reel');
        reelFrame=frame;
      }
    }
    const tiles=room===1?(exitOpen?horizontalTiles:loopTiles):baseTile;
    if(exitOpen&&room!==0){
      gl.depthMask(false);
      draw(skyRange,0,0,room);
      gl.depthMask(true);
    }
    const shoreOrigin=Math.round(camera.x/shorePeriod)*shorePeriod;
    const drawCoast=(range,reach)=>{
      for(const offset of coastTiles){
        if(Math.abs(offset)<=reach)draw(range,shoreOrigin+offset,0);
      }
    };
    for(const range of opaque){
      if(range.coastOnly&&room!==2||room===2&&!range.afterGate&&!range.repeat)continue;
      if(range.coastTile&&room===2){drawCoast(range,range.action?.terrain?shorePeriod*6:shorePeriod*2);continue;}
      const throughPortal=room===2&&range.repeat||room===1&&range.coastTile;
      for(const [x,z] of range.repeat?tiles:baseTile)draw(range,x,z,throughPortal);
    }
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    if(groundShadows&&exitOpen){
      if(room===2)drawCoast(groundShadows,shorePeriod*2);
      else draw(groundShadows,0,0,room===1);
    }
    const side=Math.sin(yaw),front=Math.cos(yaw);
    const ordered=[];
    for(const range of translucent){
      if(room===2&&!range.afterGate&&!range.repeat)continue;
      let mediaOpacity=1;
      if(range.action?.cue){
        const blend=galleryHologramBlend(score,range.action.cue.at,!noMotion);
        mediaOpacity=range.action.slot===undefined?1-blend:blend;
        if(mediaOpacity<.015)continue;
      }
      for(const [x,z] of range.repeat?tiles:baseTile){
        const dx=range.x+x-camera.x, dz=range.z+z-camera.z;
        const depth=dx*side+dz*front;
        if(depth<-5||dx*dx+dz*dz>2800)continue;
        ordered.push({range,x,z,depth,mediaOpacity});
      }
    }
    ordered.sort((a,b)=>b.depth-a.depth);
    for(const {range,x,z,mediaOpacity} of ordered)
      draw(range,x,z,room===2&&range.repeat,mediaOpacity);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };
}

function look(dx,dy){
  camera.yaw=(camera.yaw+dx+Math.PI*4)%(Math.PI*2);
  camera.pitch=clamp(camera.pitch+dy,-1.09,1.06);
}

const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE']);
window.addEventListener('keydown',event=>{
  if(!inside||event.target instanceof HTMLButtonElement||!movementKeys.has(event.code))return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>keys.clear());

let lookPointer=null, padPointer=null, lookX=0, lookY=0;
canvas.addEventListener('pointerdown',event=>{
  if(!inside||lookPointer!==null)return;
  lookPointer=event.pointerId;
  lookX=event.clientX;lookY=event.clientY;
  canvas.setPointerCapture(lookPointer);
});
canvas.addEventListener('pointermove',event=>{
  if(event.pointerId!==lookPointer)return;
  look((event.clientX-lookX)*.0056,(lookY-event.clientY)*.0056);
  lookX=event.clientX;lookY=event.clientY;
});
canvas.addEventListener('lostpointercapture',()=>{lookPointer=null;});
function updatePad(event){
  const box=stick.getBoundingClientRect(), radius=box.width*.34;
  const x=(event.clientX-box.left-box.width/2)/radius;
  const y=(event.clientY-box.top-box.height/2)/radius;
  const length=Math.max(1,Math.hypot(x,y));
  move.x=x/length;move.z=-y/length;
  stick.style.setProperty('--x',move.x*radius+'px');
  stick.style.setProperty('--y',-move.z*radius+'px');
}
stick.addEventListener('pointerdown',event=>{
  if(padPointer!==null)return;
  padPointer=event.pointerId;stick.setPointerCapture(padPointer);updatePad(event);
});
stick.addEventListener('pointermove',event=>{
  if(event.pointerId===padPointer)updatePad(event);
});
stick.addEventListener('lostpointercapture',()=>{
  padPointer=null;move.x=move.z=0;
  stick.style.removeProperty('--x');stick.style.removeProperty('--y');
});
function sealEntrance(){
  if(entrySealed||entranceReleased||music.ended)return;
  entrySealed=true;
  roomButtons[0].disabled=true;
  roomButtons[0].hidden=true;
  wordmark.removeAttribute('href');
  wordmark.removeAttribute('aria-label');
}

function reopenEntrance(){
  entranceReleased=true;
  if(!entrySealed)return;
  entrySealed=false;
  roomButtons[0].disabled=false;
  roomButtons[0].hidden=false;
  wordmark.setAttribute('href','./');
  wordmark.setAttribute('aria-label','消失標本室の入口');
}

for(const [i,button] of roomButtons.entries()){
  button.addEventListener('click',()=>{
    if((i===0&&entrySealed)||(i===2&&!exitOpen))return;
    if(i!==0)sealEntrance();
    Object.assign(camera,rooms[i]);
    canvas.focus({preventScroll:true});
  });
}

let previous=null, shownRoom=-1, clock=0;
function showExhibit(){
  if(!showCaptions)return;
  const soundtrackTime=soundtrackScoreTime(music.currentTime);
  const forward=[Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch),Math.cos(camera.yaw)*Math.cos(camera.pitch)];
  let nearest=null, score=.78;
  for(const art of exhibits){
    if(art.screen&&exitOpen)continue;
    const exhibitRoom=roomAt(art.z);
    if((exhibitRoom===0&&entrySealed)||(exhibitRoom===2&&!exitOpen))continue;
    if(art.cue&&(galleryHologramBlend(soundtrackTime,art.cue.at)>=.5)!==!!art.figure)continue;
    const inGallery=roomAt(camera.z)===1&&exhibitRoom===1;
    if(exhibitRoom===1&&!art.screen&&galleryPresence(soundtrackTime,galleryDepartureTime(art.x,art.y,art.z))<.16)continue;
    const depth=art.z-camera.z;
    const z=inGallery&&!exitOpen?depth-Math.round(depth/galleryDepthPeriod)*galleryDepthPeriod:depth;
    const x=inGallery?wrapGalleryX(art.x-camera.x):art.x-camera.x;
    const y=art.y-eye;
    const dist=Math.hypot(x,y,z), direction=(x*forward[0]+y*forward[1]+z*forward[2])/dist;
    if(dist>Math.max(3,art.w*2.25)||x*Math.sin(art.angle)-z*Math.cos(art.angle)>0||direction<=score)continue;
    nearest=art;score=direction;
  }
  if(nearest===previous)return;
  previous=nearest;
  plaque.hidden=!nearest;
  if(nearest){
    byId('medium').textContent=nearest.medium??'';
    byId('medium').hidden=!nearest.medium;
    byId('object').textContent=nearest.title;
    byId('note').textContent=nearest.note??'';
    byId('note').hidden=!nearest.note;
  }
}

function update(dt){
  const has=key=>Number(keys.has(key));
  const direction=has('ArrowRight')-has('ArrowLeft')+has('KeyE')-has('KeyQ');
  if(direction)look(direction*dt*1.6,0);
  const side=move.x+has('KeyD')-has('KeyA');
  const front=move.z+has('KeyW')+has('ArrowUp')-has('KeyS')-has('ArrowDown');
  const pace=dt*2.65/Math.max(1,Math.hypot(side,front));
  const [s,c]=[Math.sin(camera.yaw),Math.cos(camera.yaw)];
  const nextZ=camera.z+(-side*s+front*c)*pace;
  const z=advanceGalleryDepth(camera.z,nextZ,exitOpen);
  const x=camera.x+(side*c+front*s)*pace;
  const currentRoom=roomAt(camera.z);
  const nextX=currentRoom===1?wrapGalleryX(x):x;
  if(canWalk(nextX,camera.z,exitOpen,entrySealed))camera.x=nextX;
  if(canWalk(camera.x,z,exitOpen,entrySealed)){
    if(z!==nextZ)galleryTurn++;
    camera.z=z;
  }
  const room=roomAt(camera.z);
  if(room!==shownRoom){
    shownRoom=room;
    if(room===1)sealEntrance();
    for(const [i,button] of roomButtons.entries())button.setAttribute('aria-current',String(i===room));
  }
  showExhibit();
  return room;
}

function fallback(){
  cancelAnimationFrame(animation);
  animation=0;
  canvas.hidden=true;
  entry.hidden=true;
  for(const id of ['controls','rooms','aim','plaque','captions'])byId(id).hidden=true;
  const content=byId('fallback');
  content.hidden=false;
  for(const image of content.querySelectorAll('img'))image.src=image.dataset.src;
}

if(gl){
  try{
    const render=buildRenderer();
    const tick=time=>{
      const dt=Math.min((time-clock)/1000,.045);clock=time;
      render(inside?update(dt):0,((time/1000)%300),time/1000);
      animation=requestAnimationFrame(tick);
    };
    animation=requestAnimationFrame(tick);
    canvas.addEventListener('webglcontextlost',fallback);
  }catch(error){
    console.error(error);
    fallback();
  }
}else fallback();
