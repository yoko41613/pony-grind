// L2 runtime simulation: run rL2 -> uL2/drL2 for many frames with various inputs
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const html=fs.readFileSync(__dirname+'/index.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m)throw new Error('no script');
const code=m[1];

// Full-ish 2D context mock
const noop=()=>{};
const gradient={addColorStop:noop};
const mockCtx=new Proxy({
  canvas:{width:480,height:720},
  measureText:(t)=>({width:(t?String(t).length:0)*10}),
  createLinearGradient:()=>gradient,
  createRadialGradient:()=>gradient,
  drawImage:noop, save:noop, restore:noop, fillRect:noop, strokeRect:noop,
  clearRect:noop, fillText:noop, strokeText:noop,
  beginPath:noop, closePath:noop, moveTo:noop, lineTo:noop, bezierCurveTo:noop,
  quadraticCurveTo:noop, arc:noop, arcTo:noop, ellipse:noop,
  fill:noop, stroke:noop, clip:noop, setLineDash:noop, translate:noop,
  scale:noop, rotate:noop, transform:noop, setTransform:noop, resetTransform:noop,
  globalAlpha:1, fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:''
},{get:(t,p)=>p in t?t[p]:noop,set:()=>true});

const canvas={getContext:()=>mockCtx,getBoundingClientRect:()=>({left:0,top:0,width:480,height:720}),style:{},addEventListener:()=>{},width:480,height:720};
global.document={getElementById:(id)=>id==='game'?canvas:{style:{},addEventListener:()=>{},focus:()=>{},value:''},createElement:()=>({})};
global.window={innerWidth:480,innerHeight:720,addEventListener:()=>{},AudioContext:function(){this.state='running';this.resume=()=>{};this.createOscillator=()=>({connect:()=>{},start:()=>{},stop:()=>{},frequency:{value:0},type:''});this.createGain=()=>({connect:()=>{},gain:{setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}}});}};
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.requestAnimationFrame=()=>{};
global.setTimeout=(fn)=>{if(typeof fn==='function')fn();return 0;};
global.clearTimeout=()=>{};
const sandbox={document,window,localStorage,requestAnimationFrame,setTimeout,clearTimeout,console,canvas,ctx:mockCtx,nameInput:{style:{},addEventListener:()=>{},focus:()=>{},value:''},nameOk:{style:{},addEventListener:()=>{},click:()=>{}}};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);

let failures=0;
function check(name,fn){try{fn();console.log('✓',name);}catch(e){failures++;console.log('✗',name,':',e.message);}}

// --- Test 1: rL2 initializes cleanly ---
check('rL2() initializes',()=>{
  vm.runInContext('rL2()',sandbox);
  assert.strictEqual(vm.runInContext('l2.stage',sandbox),0);
  assert(vm.runInContext('l2.plats.length',sandbox)>=5,'platforms should be generated (random count)');
  assert(vm.runInContext('l2.plats[0].y',sandbox)===vm.runInContext('l2.gy',sandbox),'ground platform should exist');
  assert(vm.runInContext('l2.obs.length',sandbox)>=1,'obstacles should exist');
  assert(vm.runInContext('l2.colls.length',sandbox)>=1,'collectibles should exist');
});

// --- Test 2: uL2 runs 300 frames without crash (walking right) ---
check('uL2 300 frames (run right)',()=>{
  vm.runInContext('inp.rightDown=true;inp.leftDown=false;',sandbox);
  for(let i=0;i<300;i++){vm.runInContext('uL2()',sandbox);}
  assert(vm.runInContext('l2.p.x',sandbox)>500,'player should have moved right');
});

// --- Test 3: drL2 draws without crash ---
check('drL2 draws without crash',()=>{
  vm.runInContext('drL2()',sandbox);
  vm.runInContext('l2.cam=1000;drL2()',sandbox);
  vm.runInContext('l2.stage=1;l2.cam=2000;drL2()',sandbox);
  vm.runInContext('l2.stage=2;l2.cam=3000;drL2()',sandbox);
});

// --- Test 4: jump physics + platform landing ---
check('uL2 jump and land',()=>{
  vm.runInContext('l2.p.y=250;l2.p.vy=0;l2.p.gnd=true;inp.dt=true;inp.rightDown=false;',sandbox);
  for(let i=0;i<60;i++)vm.runInContext('uL2()',sandbox);
  assert(vm.runInContext('l2.p.y',sandbox)<800,'player should not have fallen off world');
});

// --- Test 5: obstacles (elevator/hr) update without crash ---
check('uL2 obstacle logic safe',()=>{
  vm.runInContext('l2.p.x=1000;l2.p.y=600;l2.p.vy=0;inp.rightDown=true;',sandbox);
  for(let i=0;i<200;i++)vm.runInContext('uL2()',sandbox);
});

// --- Test 6: boss fight end -> stage advance -> regen ---
check('boss death advances stage & regens',()=>{
  vm.runInContext('l2.go=false;l2.won=false;l2.boss.dead=true;l2.bossT=111;l2.stage=0;',sandbox);
  vm.runInContext('uL2()',sandbox);
  const st=vm.runInContext('l2.stage',sandbox);
  assert.strictEqual(st,1,'stage should advance to 1');
  assert(vm.runInContext('l2.plats.length',sandbox)>=10,'platforms should regen for stage 1');
});

// --- Test 7: full run to win (stage 2 -> won) ---
check('boss death at stage 2 -> won',()=>{
  vm.runInContext('l2.go=false;l2.won=false;l2.stage=2;l2.boss.dead=true;l2.bossT=111;',sandbox);
  vm.runInContext('uL2()',sandbox);
  assert.strictEqual(vm.runInContext('l2.won',sandbox),true,'should win at stage 3');
});

// --- Test 8: return button in L2 returns to menu ---
check('L2 back button returns to menu',()=>{
  vm.runInContext("gs='level2';l2.go=false;l2.won=false;",sandbox);
  vm.runInContext('handleTap(46,26)',sandbox);
  assert.strictEqual(vm.runInContext('gs',sandbox),'menu');
});

// --- Test 9: touch input for L2 (left/right zones) does not crash ---
check('L2 touch input safe',()=>{
  vm.runInContext("gs='level2';rL2();inp.leftDown=true;",sandbox);
  for(let i=0;i<120;i++)vm.runInContext('uL2()',sandbox);
  vm.runInContext('inp.leftDown=false;inp.rightDown=true;',sandbox);
  for(let i=0;i<120;i++)vm.runInContext('uL2()',sandbox);
});

// --- Test 10: L3 untouched still fine ---
check('L3 still boots',()=>{
  vm.runInContext('rL3()',sandbox);
  for(let i=0;i<60;i++)vm.runInContext('uL3()',sandbox);
  vm.runInContext('drL3()',sandbox);
});

console.log(failures?`\n${failures} FAILURES`:'\nALL RUNTIME TESTS PASSED');
process.exit(failures?1:0);
