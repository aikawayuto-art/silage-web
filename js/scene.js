const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let progress = 0, targetProgress = 0;
window.__setScrollProgress = (p)=>{ targetProgress = p; };

try {
  const THREE = await import('three');
  const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
  const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');

  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const DPR = Math.min(window.devicePixelRatio || 1, reduce ? 1.25 : 1.6);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070305, 0.0115);
  const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 600);

  // ---- generate layered neural network corridor ----
  const LAYERS = reduce ? 18 : 28;
  const PER = reduce ? 14 : 22;
  const Z_NEAR = 10, Z_FAR = -252;
  const dz = (Z_NEAR - Z_FAR) / (LAYERS - 1);
  const nodes = [];
  const layerArr = [];
  for (let i=0;i<LAYERS;i++){
    const z = Z_NEAR - i*dz;
    const rot = i*0.34;
    const arr=[];
    for (let j=0;j<PER;j++){
      const ang = rot + (j/PER)*Math.PI*2 + (Math.random()-0.5)*0.55;
      const r = 6 + Math.pow(Math.random(),0.62)*27;
      const x = Math.cos(ang)*r;
      const y = Math.sin(ang)*r*0.8;
      const zz = z + (Math.random()-0.5)*dz*0.55;
      arr.push(nodes.length);
      nodes.push(new THREE.Vector3(x,y,zz));
    }
    layerArr.push(arr);
  }
  // connections (forward)
  const conns=[];
  for (let i=0;i<LAYERS-1;i++){
    const a=layerArr[i], b=layerArr[i+1];
    for (const ni of a){
      const k = 2;
      for (let c=0;c<k;c++){
        const nj = b[(Math.random()*b.length)|0];
        conns.push([ni,nj]);
      }
    }
  }

  // ---- nodes (glowing points) ----
  const np = new Float32Array(nodes.length*3);
  const nScale = new Float32Array(nodes.length);
  const nPhase = new Float32Array(nodes.length);
  nodes.forEach((v,i)=>{ np[i*3]=v.x; np[i*3+1]=v.y; np[i*3+2]=v.z; nScale[i]=0.6+Math.random()*1.3; nPhase[i]=Math.random()*6.283; });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(np,3));
  ng.setAttribute('aScale', new THREE.BufferAttribute(nScale,1));
  ng.setAttribute('aPhase', new THREE.BufferAttribute(nPhase,1));
  const uTime = { value:0 };
  const uPR = { value:DPR };
  const nodeMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uTime, uPixelRatio:uPR, uSize:{value:260.0}, uColor:{value:new THREE.Color(0xff2a2a)}, uHot:{value:new THREE.Color(0xffd8c8)} },
    vertexShader:`
      attribute float aScale; attribute float aPhase;
      uniform float uTime, uPixelRatio, uSize; varying float vG;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float pulse = 0.55 + 0.45*sin(uTime*1.6 + aPhase);
        vG = pulse;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * aScale * (0.5+0.7*pulse) * uPixelRatio / max(-mv.z,1.0);
        gl_PointSize = clamp(gl_PointSize, 0.0, 46.0);
      }`,
    fragmentShader:`
      uniform vec3 uColor, uHot; varying float vG;
      void main(){
        vec2 uv = gl_PointCoord-0.5; float d=length(uv);
        if(d>0.5) discard;
        float core = smoothstep(0.5,0.0,d);
        float halo = smoothstep(0.5,0.12,d);
        vec3 col = mix(uColor, uHot, core*core*vG);
        gl_FragColor = vec4(col, halo*(0.5+0.5*vG));
      }`
  });
  scene.add(new THREE.Points(ng, nodeMat));

  // ---- connection lines ----
  const lp = new Float32Array(conns.length*2*3);
  conns.forEach((c,i)=>{
    const a=nodes[c[0]], b=nodes[c[1]];
    lp[i*6]=a.x; lp[i*6+1]=a.y; lp[i*6+2]=a.z;
    lp[i*6+3]=b.x; lp[i*6+4]=b.y; lp[i*6+5]=b.z;
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp,3));
  const lineMat = new THREE.LineBasicMaterial({ color:0xff2424, transparent:true, opacity:0.075, blending:THREE.AdditiveBlending, depthWrite:false });
  scene.add(new THREE.LineSegments(lg, lineMat));

  // ---- data pulses (packets travelling toward camera) ----
  const PCOUNT = conns.length;
  const ppos = new Float32Array(PCOUNT*3);
  const aStart = new Float32Array(PCOUNT*3);
  const aEnd = new Float32Array(PCOUNT*3);
  const aOff = new Float32Array(PCOUNT);
  const aSpd = new Float32Array(PCOUNT);
  conns.forEach((c,i)=>{
    const far=nodes[c[1]], near=nodes[c[0]];   // travel far -> near
    aStart[i*3]=far.x; aStart[i*3+1]=far.y; aStart[i*3+2]=far.z;
    aEnd[i*3]=near.x; aEnd[i*3+1]=near.y; aEnd[i*3+2]=near.z;
    ppos[i*3]=far.x; ppos[i*3+1]=far.y; ppos[i*3+2]=far.z;
    aOff[i]=Math.random();
    aSpd[i]=0.05+Math.random()*0.16;
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(ppos,3));
  pg.setAttribute('aStart', new THREE.BufferAttribute(aStart,3));
  pg.setAttribute('aEnd', new THREE.BufferAttribute(aEnd,3));
  pg.setAttribute('aOff', new THREE.BufferAttribute(aOff,1));
  pg.setAttribute('aSpd', new THREE.BufferAttribute(aSpd,1));
  const pulseMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uTime, uPixelRatio:uPR, uSize:{value:170.0}, uColor:{value:new THREE.Color(0xff5230)} },
    vertexShader:`
      attribute vec3 aStart, aEnd; attribute float aOff, aSpd;
      uniform float uTime, uPixelRatio, uSize; varying float vE;
      void main(){
        float t = fract(uTime*aSpd + aOff);
        vec3 pos = mix(aStart, aEnd, t);
        vec4 mv = modelViewMatrix * vec4(pos,1.0);
        float edge = smoothstep(0.0,0.12,t)*smoothstep(1.0,0.8,t);
        vE = edge;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixelRatio / max(-mv.z,1.0) * (0.4+edge);
        gl_PointSize = clamp(gl_PointSize, 0.0, 22.0);
      }`,
    fragmentShader:`
      uniform vec3 uColor; varying float vE;
      void main(){
        vec2 uv = gl_PointCoord-0.5; float d=length(uv);
        if(d>0.5) discard;
        float core = smoothstep(0.5,0.0,d);
        vec3 col = mix(uColor, vec3(1.0,0.96,0.92), core*core);
        gl_FragColor = vec4(col, core*vE);
      }`
  });
  scene.add(new THREE.Points(pg, pulseMat));

  // ---- post fx ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), reduce?0.5:0.82, 0.6, 0.0);
  composer.addPass(bloom);

  function size(){
    const w=document.documentElement.clientWidth, h=window.innerHeight;
    renderer.setSize(w,h); composer.setSize(w,h);
    camera.aspect=w/h; camera.updateProjectionMatrix();
    uPR.value = renderer.getPixelRatio();
  }
  size();
  addEventListener('resize', size, {passive:true});
  addEventListener('load', size);
  // recompute once the loader clears and the scrollbar appears (clientWidth shrinks)
  const _szObs=new MutationObserver(()=>{ if(!document.body.classList.contains('loading')) size(); });
  _szObs.observe(document.body,{attributes:true,attributeFilter:['class']});
  setTimeout(size,1300); setTimeout(size,4500);

  // mouse parallax
  let mx=0,my=0,mlx=0,mly=0;
  addEventListener('mousemove', e=>{ mx=(e.clientX/innerWidth-0.5); my=(e.clientY/innerHeight-0.5); }, {passive:true});

  const clock = new THREE.Clock();
  function tick(){
    const t = clock.getElapsedTime();
    uTime.value = t;
    progress += (targetProgress - progress) * 0.055;
    mlx += (mx-mlx)*0.045; mly += (my-mly)*0.045;
    const camZ = (Z_NEAR+6) - progress * (Z_NEAR+6 - Z_FAR);
    const driftX = Math.sin(t*0.18)*1.4;
    const driftY = Math.cos(t*0.15)*1.0;
    camera.position.set(mlx*5 + driftX, -mly*4 + driftY, camZ);
    camera.lookAt(mlx*2.5, -mly*2, camZ - 34);
    camera.rotation.z = mlx*0.04 + Math.sin(t*0.1)*0.01;
    composer.render();
    requestAnimationFrame(tick);
  }
  if (reduce){ targetProgress = 0.04; composer.render(); }
  requestAnimationFrame(tick);

  // reveal scene
  setTimeout(()=>document.getElementById('scene').classList.add('on'), 200);

} catch(err){
  console.warn('WebGL scene unavailable — graceful CSS fallback active.', err);
}
