(function(){
  const body = document.body;
  const loader = document.getElementById('loader');
  const lbar = document.getElementById('lbar');
  const lnum = document.getElementById('lnum');

  // ---- loader progress (gated on fonts) ----
  let p = 0;
  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  let fontsDone = false;
  fontsReady.then(()=>{ fontsDone = true; });
  const li = setInterval(()=>{
    const cap = fontsDone ? 100 : 88;
    p += (cap - p) * 0.08 + 0.6;
    if (p > cap) p = cap;
    lbar.style.width = p + '%';
    lnum.textContent = Math.round(p);
    if (p >= 99.4 && fontsDone){
      clearInterval(li);
      lbar.style.width='100%'; lnum.textContent='100';
      setTimeout(start, 360);
    }
  }, 30);
  // safety: never hang
  setTimeout(()=>{ if(body.classList.contains('loading')){ clearInterval(li); start(); } }, 4200);

  let started = false;
  function start(){
    if (started) return; started = true;
    loader.classList.add('done');
    body.classList.remove('loading');
    initReveals();
  }

  // ---- smooth scroll (Lenis if available) ----
  let lenis = null;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setupLenis(){
    if (reduce || typeof Lenis === 'undefined') return;
    lenis = new Lenis({ lerp:0.09, wheelMultiplier:1, smoothWheel:true });
    lenis.on('scroll', ({scroll, limit})=>{
      const pr = limit>0 ? scroll/limit : 0;
      onScroll(pr, scroll);
    });
    function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    // anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', e=>{
        const id=a.getAttribute('href'); if(id.length<2) return;
        const el=document.querySelector(id); if(!el) return;
        e.preventDefault(); lenis.scrollTo(el, {offset:-10});
      });
    });
  }
  // native scroll fallback
  function nativeScroll(){
    const limit = document.documentElement.scrollHeight - innerHeight;
    const scroll = window.scrollY || document.documentElement.scrollTop;
    onScroll(limit>0?scroll/limit:0, scroll);
  }

  const head = document.getElementById('head');
  const prog = document.getElementById('prog');
  const scrim = document.getElementById('readScrim');
  const floatCta = document.getElementById('floatCta');
  const railLinks = [...document.querySelectorAll('.rail a')];
  const secEls = railLinks.map(a=>document.querySelector('#'+a.dataset.sec)).filter(Boolean);
  let lastY = 0;

  function onScroll(pr, y){
    prog.style.width = (pr*100)+'%';
    if (window.__setScrollProgress) window.__setScrollProgress(Math.min(Math.max(pr,0),1));
    // readability scrim: hero keeps the field bright, content dims it so text reads cleanly
    if (scrim){
      const vh = innerHeight;
      const k = Math.min(Math.max((y - vh*0.45) / (vh*0.55), 0), 1);
      scrim.style.opacity = (0.05 + k*0.62).toFixed(3);
    }
    // header solid + hide on scroll-down
    if (y > 40) head.classList.add('solid'); else head.classList.remove('solid');
    if (y > lastY && y > 420) head.classList.add('hide'); else head.classList.remove('hide');
    lastY = y;
    // float cta
    if (y > innerHeight*0.7) floatCta.classList.add('show'); else floatCta.classList.remove('show');
    // active rail
    const mid = y + innerHeight*0.4;
    let act = secEls[0];
    secEls.forEach(s=>{ if (s.offsetTop <= mid) act = s; });
    railLinks.forEach(a=> a.classList.toggle('active', a.dataset.sec === (act?act.id:'')));
  }

  if (!reduce && typeof Lenis !== 'undefined'){ setupLenis(); }
  else { window.addEventListener('scroll', nativeScroll, {passive:true}); nativeScroll(); }
  window.addEventListener('resize', ()=>{ if(!lenis) nativeScroll(); }, {passive:true});

  // ---- reveals + count-up via IntersectionObserver ----
  function initReveals(){
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if (en.isIntersecting){
          en.target.classList.add('in');
          if (en.target.classList.contains('step')) {}
          en.target.querySelectorAll && en.target.querySelectorAll('.cu').forEach(countUp);
          if (en.target.classList.contains('cu')) countUp(en.target);
          io.unobserve(en.target);
        }
      });
    }, { threshold:0.18, rootMargin:'0px 0px -8% 0px' });

    document.querySelectorAll('[data-reveal], .mask, .step').forEach((el,i)=>{
      el.style.transitionDelay = ((i%6)*60)+'ms';
      io.observe(el);
    });
    // ensure metrics count even if metric wrapper revealed
    document.querySelectorAll('.metric').forEach(m=> io.observe(m));
  }

  const counted = new WeakSet();
  function countUp(el){
    if (counted.has(el)) return; counted.add(el);
    const to = parseFloat(el.dataset.to||'0');
    const dur = 1500; const t0 = performance.now();
    function step(now){
      const k = Math.min((now-t0)/dur, 1);
      const e = 1 - Math.pow(1-k, 3);
      el.textContent = Math.round(to*e);
      if (k<1) requestAnimationFrame(step);
      else el.textContent = to;
    }
    requestAnimationFrame(step);
  }

  // ---- service card spotlight ----
  document.querySelectorAll('.svc').forEach(card=>{
    card.addEventListener('mousemove', e=>{
      const r=card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
      card.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
    });
  });

  // ---- magnetic buttons ----
  if (!('ontouchstart' in window)){
    document.querySelectorAll('.magnetic').forEach(el=>{
      el.addEventListener('mousemove', e=>{
        const r=el.getBoundingClientRect();
        const x=(e.clientX-r.left-r.width/2)*0.32;
        const y=(e.clientY-r.top-r.height/2)*0.42;
        el.style.transform=`translate(${x}px,${y}px)`;
      });
      el.addEventListener('mouseleave', ()=> el.style.transform='');
    });
  }

  // ---- custom cursor ----
  const cur = document.getElementById('cursor');
  const cdot = document.getElementById('cdot');
  if (cur && matchMedia('(pointer:fine)').matches){
    let cx=0,cy=0,tx=0,ty=0;
    addEventListener('mousemove', e=>{
      tx=e.clientX; ty=e.clientY;
      cdot.style.transform=`translate(${tx}px,${ty}px) translate(-50%,-50%)`;
      cur.classList.add('on'); cdot.classList.add('on');
    });
    (function loop(){ cx+=(tx-cx)*0.18; cy+=(ty-cy)*0.18; cur.style.transform=`translate(${cx}px,${cy}px) translate(-50%,-50%)`; requestAnimationFrame(loop); })();
    document.querySelectorAll('a,button,.svc,.tag').forEach(el=>{
      el.addEventListener('mouseenter', ()=> cur.classList.add('big'));
      el.addEventListener('mouseleave', ()=> cur.classList.remove('big'));
    });
  }
})();

/* ===== mobile hamburger menu (auto-built from header nav) ===== */
(function(){
  var head=document.getElementById('head'); if(!head) return;
  var navEl=head.querySelector('.nav'); if(!navEl) return;
  if(head.querySelector('.burger')) return;
  var burger=document.createElement('button');
  burger.className='burger'; burger.type='button'; burger.setAttribute('aria-label','メニュー');
  burger.innerHTML='<span></span><span></span><span></span>';
  head.appendChild(burger);
  var menu=document.createElement('nav'); menu.className='mobile-menu';
  var anchors=navEl.querySelectorAll('a');
  for(var i=0;i<anchors.length;i++){
    var a=anchors[i];
    var link=document.createElement('a');
    link.setAttribute('href', a.getAttribute('href'));
    link.textContent=(a.textContent||'').replace(/[←-→➔➜]/g,'').trim();
    if(a.classList.contains('current')) link.className='current';
    menu.appendChild(link);
  }
  var foot=document.createElement('div'); foot.className='mm-foot'; foot.textContent='SILAGE INC.';
  menu.appendChild(foot);
  document.body.appendChild(menu);
  function setOpen(o){ burger.classList.toggle('open',o); menu.classList.toggle('open',o); }
  burger.addEventListener('click', function(){ setOpen(!menu.classList.contains('open')); });
  var ml=menu.querySelectorAll('a');
  for(var j=0;j<ml.length;j++){ ml[j].addEventListener('click', function(){ setOpen(false); }); }
  window.addEventListener('keydown', function(e){ if(e.key==='Escape') setOpen(false); });
})();

