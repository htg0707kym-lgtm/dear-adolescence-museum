import {accentFps,dreamAccents} from './dream-accents.js';

export const scoreLength=213;
// The November 22 master adds 27,000 samples before the existing picture cues.
export const soundtrackLeadIn=27000/44100;
export const soundtrackScoreTime=time=>Math.min(scoreLength,Math.max(0,time-soundtrackLeadIn));
export const settledOnEntry=12;
export const dropDuration=1.25;
export const exitCue=202.1871;
export const exitFade=.72;

const installationStarts=[0,13,25,38,50,64,77,89,102,114,126,140];
const installationCycle=153;
const installationModes=[0,1,6,3,2,7,4,8,9,10,11,12];
const galleryLights=[
  [.13,.51,1.00], [1.00,.17,.44], [.61,.22,1.00], [.18,.65,1.00],
  [1.00,.37,.52], [.38,.47,1.00], [.43,.81,1.00], [.84,.22,.66],
  [.18,.48,1.00], [1.00,.46,.26], [.50,.30,1.00], [.46,.80,1.00],
];

const withdrawalStart=exitCue-57;
const withdrawalEnd=exitCue-1;
const hologramPeak=178;
const galleryEmptyingStart=182;

export function galleryHologramCue(rank,total){
  if(rank<6)return -2;
  const progress=(rank-6)/Math.max(1,total-7);
  return 24+(hologramPeak-26)*Math.pow(progress,.72);
}

export function galleryHologramBlend(time,cue,ease=true){
  const progress=Math.max(0,Math.min(1,(time-cue)/(ease?1.65:.001)));
  return progress*progress*(3-2*progress);
}

export function galleryDepartureTime(x,y,z){
  const distance=Math.min(1,Math.abs(x)/20);
  const height=Math.min(1,Math.max(0,y-.5)/10);
  const depth=Math.min(1,Math.max(0,z-19)/18);
  const scatter=(Math.sin(x*4.34+z*2.51+y*3.12)+1)*.5;
  const exposure=.57*distance+.30*height+.13*(1-depth);
  const order=.88*Math.pow(exposure,1.42)+.12*scatter;
  return withdrawalEnd-(withdrawalEnd-galleryEmptyingStart)*order;
}

export function galleryPresence(musicTime,departure=withdrawalEnd,ease=true){
  const amount=Math.max(0,Math.min(1,(departure-musicTime)/(ease?2.7:.001)));
  return amount*amount*(3-2*amount);
}

export function installationScore(elapsed,musicTime,pass=0){
  const cycle=Math.floor(elapsed/installationCycle);
  const position=elapsed%installationCycle;
  const chapter=installationStarts.findLastIndex(start=>position>=start);
  const age=position-installationStarts[chapter];
  const remaining=(installationStarts[chapter+1]??installationCycle)-position;
  const closing=musicTime>=exitCue-11;
  const program=((chapter+pass)%installationModes.length+installationModes.length)%installationModes.length;
  const previous=galleryLights[(program+galleryLights.length-1)%galleryLights.length];
  const blend=cycle===0&&chapter===0&&pass===0?1:Math.min(age/2.7,1);
  const recession=Math.max(0,Math.min(1,(musicTime-withdrawalStart)/(withdrawalEnd-withdrawalStart)));
  const lighting=galleryLights[program].map((value,i)=>
    (previous[i]+(value-previous[i])*blend)*(1-.64*recession));
  const intensity=closing?Math.max(.24,1-(musicTime-exitCue+11)*.069):
    Math.min(1,.20+age*2.5,.20+remaining*4);
  const whitePulse=!closing&&chapter>0&&chapter%3===0?Math.max(0,1-Math.abs(age-.50)/.34):0;
  return {mode:closing?5:installationModes[program],cycle,lighting,intensity,whitePulse};
}

const cuts=[0,25.34,39.79,54.8,88.1,113.1,140.48,159.49,182.19,191.49,201.7];
const layouts=[0,2,4,1,3,5,0,3,2,1,5];
const movieOffset=10.6871;
// The final cut's superimposed words and tiled typography use the story clock.
const dreamOverlays=[[132.15,133.1,2],[145.97,147.1,3],[160,161.1,4],
  [169,170.1,5],[178.7,180,7],[185.54,187.05,9],[190.15,191.5,12]];
const dreamTiles=[[132.574,134.421,2,3],[170.232,171.5,3,4],[174.819,178,4,5],
  [183.707,185.54,5,6],[189.513,191.14,6,7]];
const mirrors=[[73.5,75.34],[94.02,95.41],[169.32,170.20]];
const dissolveStart=195.4+movieOffset;

export function dreamsAt(time){
  const story=time-movieOffset;
  const typography=dreamOverlays.find(([start,end])=>story>=start&&story<end)?.[2]??0;
  const tile=dreamTiles.find(([start,end])=>story>=start&&story<end);
  if(!tile)return typography;
  const [start,end,from,to]=tile;
  return Math.max(typography,Math.min(to,from+Math.floor((story-start)/(end-start)*(to-from+1))));
}

export function dreamAccentAt(time){
  const frame=Math.floor(time*accentFps+1e-7);
  return dreamAccents.find(([start,end])=>frame>=start&&frame<end)?.[2]??0;
}

export function projectionScore(time,slot){
  const section=cuts.findLastIndex(start=>time>=start);
  const phase=(slot+section)%5;
  return {phase,fade:Math.max(0,Math.min(1,(time-dissolveStart)/5.6))};
}

export function mirrorStrength(time){
  const story=time-movieOffset;
  return mirrors.some(([start,end])=>story>=start&&story<end)?1:.56;
}

export function canvasCue(index){
  if(index<settledOnEntry)return -1;
  const slot=index-settledOnEntry;
  return .22+Math.floor(slot/3)*.69+(slot%3)*.17;
}

export function collageScore(time,panel){
  const section=cuts.findLastIndex(start=>time>=start);
  const change=Math.floor((time+panel*.81)/(2.35+panel*.73));
  const seed=change*13+section*7+panel*11;
  const start=(seed%36+36)%36;
  const layout=(layouts[section]+panel*2+Math.floor(change/3))%6;
  return {layout, seed, figures:[0,7,17,28].map(offset=>(start+offset)%36)};
}

export function hologramScore(time,slot){
  const bank=Math.floor(slot/12), field=slot%12;
  const cadence=[11.2,15.6,19.1][bank];
  return bank*12+(field+Math.floor((time+field*.81)/cadence)*5)%12;
}

