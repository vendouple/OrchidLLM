const B=window.location.origin;let U=null,TT=null,catData=[],catCap='',selModels=new Set(),billingCycle='monthly',billingState={tiers:[],currentTier:null};
const BILLING_CYCLES=['monthly','quarterly','yearly'];
const CYCLE_LABELS={monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly'};
const CYCLE_SUFFIX={monthly:'/mo',quarterly:'/quarter',yearly:'/year'};
function $(id){return document.getElementById(id)}
function fN(n){return n==null?'—':Number(n).toLocaleString()}
function fD(d){if(!d)return'—';const x=new Date(d);return isNaN(x)?'—':x.toLocaleDateString()+' '+x.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fC(n){return 'Rp '+fN(Number(n||0))}
function daysLeft(d){if(!d)return'—';const x=new Date(d);if(isNaN(x))return'—';const days=Math.ceil((x-Date.now())/86400000);return days<0?'Expired':days===0?'Today':days+' day'+(days===1?'':'s')}
function pct(n,d){return Math.max(0,Math.min(100,d?Math.round(n/d*100):0))}
function esc(s){const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML}
function toast(m,t='success'){const e=$('toast');$('t-msg').textContent=m;$('t-ic').textContent=t==='error'?'error':'check_circle';e.className='toast show '+t;clearTimeout(TT);TT=setTimeout(()=>e.classList.remove('show'),4500)}
function parsePeriods(v){if(Array.isArray(v))return v.filter(x=>BILLING_CYCLES.includes(x));if(typeof v==='string'){try{return parsePeriods(JSON.parse(v))}catch{return BILLING_CYCLES.includes(v)?[v]:['monthly']}}return ['monthly']}
function periodLabel(v){return CYCLE_LABELS[v]||'Monthly'}
function priceLabel(t,cycle=billingCycle){const price=Number(t.priceIdr||t.price_idr||0);return price>0?'Rp '+fN(price)+(CYCLE_SUFFIX[cycle]||'/mo'):'Free'}
function tierSort(t){return Number(t?.effectiveSortOrder??t?.sortOrder??t?.sort_order??t?.id??0)}
function firstVal(obj,names,fallback=null){for(const n of names){if(obj&&obj[n]!==undefined&&obj[n]!==null&&obj[n]!=='')return obj[n]}return fallback}
function numVal(obj,names,fallback=0){const v=firstVal(obj,names,null);const n=Number(v);return Number.isFinite(n)?n:fallback}
function asArr(v){return Array.isArray(v)?v:[]}
function timeLeftLabel(d){if(!d)return'No expiry';const x=new Date(d);if(isNaN(x))return'No expiry';const diff=x-Date.now();if(diff<=0)return'Expired';const mins=Math.ceil(diff/60000),hrs=Math.ceil(diff/3600000),days=Math.ceil(diff/86400000);if(mins<60)return mins+' min left';if(hrs<48)return hrs+' hour'+(hrs===1?'':'s')+' left';return days+' day'+(days===1?'':'s')+' left'}
function creditParts(d){const c=d?.credits||{},t=d?.tier||{};const fast=Math.max(0,numVal(c,['fastCredits','fast_credits','fast','priorityCredits'],numVal(t,['fastCredits','fast_credits'],0)));const standard=numVal(c,['standardCredits','standard_credits','balance','creditsBalance'],0);const rollover=Math.max(0,numVal(c,['rollover','creditsRollover'],0));const recharges=asArr(c.rechargeBalances||c.recharge_balances);const rechargeTotal=recharges.reduce((s,rb)=>s+Math.max(0,numVal(rb,['remaining','creditsRemaining','credits_remaining','CREDITS_REMAINING'],0)),0);const monthly=Math.max(0,numVal(t,['monthlyCredits','monthly_credits'],0));return{fast,standard,rollover,recharges,rechargeTotal,monthly,total:fast+Math.max(standard,0)+rollover+rechargeTotal,overage:standard<0?Math.abs(standard):0}}
function renderCreditBar(barId,legendId,parts,includeRecharge=true){
  const actual={standard:Math.max(parts.standard,0),fast:Math.max(parts.fast,0),recharge:includeRecharge?Math.max(parts.rechargeTotal,0):0,rollover:Math.max(parts.rollover,0),overage:Math.max(parts.overage,0)};
  const demoMode=actual.standard+actual.fast+actual.recharge+actual.rollover<=0;
  const display={standard:actual.standard,fast:actual.fast,recharge:actual.recharge,rollover:actual.rollover};
  if(demoMode){display.standard=44;display.fast=36;display.recharge=20;display.rollover=0}
  const displayTotal=Math.max(display.standard+display.fast+display.recharge+display.rollover,1),rechargeCount=Array.isArray(parts.recharges)?parts.recharges.length:0;
  const rows=[
    {key:'standard',label:'Standard',cls:'cr-std',icon:'wallet',value:actual.standard,display:display.standard,info:'Subscription/package balance for everyday requests in the standard queue.',detail:`${fN(actual.standard)} available · ${parts.monthly?fN(parts.monthly)+' monthly allocation':'allocation not exposed'} · Standard queue`},
    {key:'fast',label:'Fast',cls:'cr-fast',icon:'bolt',value:actual.fast,display:display.fast,info:'Priority-capacity credits for faster queue access when your plan or recharge pack provides them.',detail:`${fN(actual.fast)} priority credits · Fast queue acceleration`},
    {key:'rollover',label:'Rollover',cls:'cr-roll',icon:'savings',value:actual.rollover,display:display.rollover,info:'Unused carry-over credits from a previous cycle when rollover is enabled.',detail:`${fN(actual.rollover)} carried over · Used alongside standard capacity`}
  ];
  if(includeRecharge)rows.push({key:'recharge',label:'Recharge',cls:'cr-recharge',icon:'add_card',value:actual.recharge,display:display.recharge,info:'One-time pack credits for bursts or extra headroom beyond the subscription allocation.',detail:`${fN(actual.recharge)} pack credits · ${rechargeCount} active pack${rechargeCount===1?'':'s'} · Pack queue rules may include standard or fast`});
  if(actual.overage>0)rows.push({key:'overage',label:'Overdrawn',cls:'cr-over',icon:'warning',value:actual.overage,display:0,info:'Credits used beyond the visible standard balance.',detail:`${fN(actual.overage)} credits overdrawn`});
  const segs=rows.filter(x=>x.display>0).map(x=>{const w=Math.max(6,Math.min(x.display/displayTotal*100,100)),tip=`${x.info} ${x.detail}${demoMode?' · Demo-filled visual only; numeric values are live.':''}`;return `<button type="button" class="cr-seg ${x.cls}" style="width:${w}%" aria-label="${esc(x.label)} credits: ${fN(x.value)}" title="${esc(tip)}"><span class="cr-seg-shine"></span><span class="cr-seg-label"><span class="ms mini">${x.icon}</span>${esc(x.label)}</span><span class="cr-tip"><strong>${esc(x.label)} credits</strong><span>${esc(x.info)}</span><em>${esc(x.detail)}${demoMode?' · Demo-filled visual only':''}</em></span></button>`}).join('')||`<button type="button" class="cr-seg cr-empty" style="width:100%" aria-label="No credits available" title="No credits available"><span class="cr-seg-label">Empty</span><span class="cr-tip"><strong>No credits available</strong><span>Choose a plan or recharge pack to add capacity.</span></span></button>`;
  const details=rows.filter(x=>x.key!=='overage'||x.value>0).map(x=>`<div class="cr-info ${x.cls}" tabindex="0"><span class="ms mini">${x.icon}</span><div><strong>${esc(x.label)}</strong><span>${esc(x.detail)}</span></div><div class="cr-tip"><strong>${esc(x.label)}</strong><span>${esc(x.info)}</span><em>${esc(x.detail)}</em></div></div>`).join('');
  const meta=demoMode?'Demo-filled capacity preview; live values remain unchanged until balances load.':`${fN(actual.standard+actual.fast+actual.recharge+actual.rollover)} live credits across standard, fast, rollover, and recharge.`;
  $(barId).innerHTML=`<div class="cr-track" role="group" aria-label="Credit capacity split">${segs}</div><div class="cr-meta"><span>${esc(meta)}</span><span>Hover or focus for queue and balance details</span></div><div class="cr-info-grid">${details}</div>`;
  $(legendId).innerHTML=rows.filter(x=>x.key!=='overage'||x.value>0).map(x=>`<div class="cr-leg ${x.cls}"><div class="cr-dot"></div><span>${esc(x.label)}</span><strong>${fN(x.value)}</strong></div>`).join('')
}
function packageIsAllEligible(p){return !firstVal(p,['targetTierName','target_tier_name','targetTierDefinitionId','target_tier_definition_id','tierId','tier_id'],null)}
function packageQueueInfo(p){const fast=firstVal(p,['queuePriorityFast','queue_priority_fast','fastQueue','fast_queue','queueFast','queue_fast'],null),std=firstVal(p,['queuePriorityStd','queue_priority_std','queuePriorityStandard','standardQueue','standard_queue','queueStd','queue_std'],null);if(fast!=null||std!=null)return `${fast!=null?'Fast queue '+esc(fast):'Fast queue —'} · ${std!=null?'Standard queue '+esc(std):'Standard queue —'}`;return 'Fast/standard behavior depends on package setup'}
function packageLimitInfo(p){const limit=firstVal(p,['purchaseLimit','purchase_limit','maxPurchases','max_purchases','perUserLimit','per_user_limit'],null),remaining=firstVal(p,['remainingPurchases','remaining_purchases','purchasesRemaining','purchases_remaining'],null),used=firstVal(p,['purchaseCount','purchase_count','purchasesUsed','purchases_used'],null);if(limit!=null||remaining!=null||used!=null)return `${limit!=null?'Limit '+esc(limit):'Limit —'}${remaining!=null?' · '+esc(remaining)+' remaining':''}${used!=null?' · '+esc(used)+' used':''}`;return 'Purchase limit not shown'}
function renderRechargeRows(recharges){if(!recharges.length)return'<div class="empty compact"><span class="ms">inventory_2</span>No active recharge packs. Buy a pack when you need extra credits this cycle.</div>';return recharges.map(rb=>{const rem=numVal(rb,['remaining','creditsRemaining','credits_remaining','CREDITS_REMAINING'],0),initial=Math.max(rem,numVal(rb,['credits','initialCredits','initial_credits','CREDITS'],rem||1),1),fill=pct(rem,initial),exp=firstVal(rb,['expiresAt','expires_at','EXPIRES_AT'],null),q=packageQueueInfo(rb);return `<div class="recharge-row lively"><div class="recharge-row-main"><strong>${esc(firstVal(rb,['tierName','tier_name','TIER_NAME'],'Recharge Pack'))}</strong><span>${fN(rem)} credits remaining · ${esc(timeLeftLabel(exp))}</span><div class="mini-meter recharge-meter"><i style="width:${fill}%"></i></div></div><span class="bg bg-p">${esc(q)}</span></div>`}).join('')}
function stripMd(s){const raw=String(s||'');const html=typeof marked!=='undefined'?marked.parse(raw):raw;const d=document.createElement('div');d.innerHTML=html;return (d.textContent||d.innerText||raw).replace(/\s+/g,' ').trim()}
function excerpt(s,len=140){const t=stripMd(s);return t.length>len?t.slice(0,len-1).trim()+'…':t}
function annTypeClass(t){return t==='error'?'r':t==='warning'?'o':t==='success'?'g':'b'}
function annIcon(t){return t==='error'?'error':t==='warning'?'warning':t==='success'?'check_circle':'campaign'}
function toggleAnn(id){const el=document.getElementById('ann-'+id);if(el)el.classList.toggle('expanded')}
function applyTheme(mode){document.documentElement.dataset.theme=mode;const th=$('dash-theme');if(th)th.setAttribute('color-scheme',mode);localStorage.setItem('orchid-dashboard-theme',mode);if($('theme-ic'))$('theme-ic').textContent=mode==='light'?'light_mode':'dark_mode';if($('theme-label'))$('theme-label').textContent=mode==='light'?'Light':'Dark'}
function toggleTheme(){applyTheme((document.documentElement.dataset.theme||'dark')==='dark'?'light':'dark')}
function hexToRgb(hex){const m=String(hex||'').replace('#','').match(/^([0-9a-f]{6})$/i);if(!m)return{r:103,g:80,b:164};const n=parseInt(m[1],16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
function rgbToHex({r,g,b}){const c=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');return '#'+c(r)+c(g)+c(b)}
function mixRgb(a,b,w){return{r:a.r+(b.r-a.r)*w,g:a.g+(b.g-a.g)*w,b:a.b+(b.b-a.b)*w}}
function accentPalette(hex){const base=hexToRgb(hex),white={r:255,g:255,b:255},black={r:18,g:16,b:28};return{main:rgbToHex(base),soft:rgbToHex(mixRgb(base,white,.34)),deep:rgbToHex(mixRgb(base,black,.38)),support:rgbToHex(mixRgb(base,{r:0,g:180,b:210},.28)),warm:rgbToHex(mixRgb(base,{r:255,g:178,b:55},.30))}}
function setDashboardAccent(hex,name='custom'){const p=accentPalette(hex),root=document.documentElement,th=$('dash-theme');root.style.setProperty('--p',p.soft);root.style.setProperty('--pc',p.deep);root.style.setProperty('--accent-main',p.main);root.style.setProperty('--accent-soft',p.soft);root.style.setProperty('--accent-support',p.support);root.style.setProperty('--accent-warm',p.warm);root.style.setProperty('--std',p.support);root.style.setProperty('--t',p.warm);if(th){th.style.setProperty('--m3e-sys-color-primary',p.soft);th.style.setProperty('--m3e-sys-color-primary-container',p.deep)}localStorage.setItem('orchid-dashboard-accent',JSON.stringify({hex:p.main,name}));document.querySelectorAll('.accent-chip').forEach(b=>b.classList.toggle('active',b.dataset.accent===name))}
function loadDashboardAccent(){try{const saved=JSON.parse(localStorage.getItem('orchid-dashboard-accent')||'{}');setDashboardAccent(saved.hex||'#6750A4',saved.name||'orchid')}catch{setDashboardAccent('#6750A4','orchid')}}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'}

async function initAuth(){
  try{const r=await fetch(B+'/api/auth/session');const d=await r.json();
    if(d.authenticated){U=d;$('sb-login').style.display='none';$('sb-user').style.display='flex';
      $('sb-nm').textContent=d.user?.username||'User';$('sb-rl').textContent=d.isAdmin?'Admin':'User';
      $('sb-av').src=d.user?.avatar||'';if(d.isAdmin)$('admin-pill').style.display='inline-flex';
      loadOverview();loadUnread();
    }else{$('sb-login').style.display='block'}
  }catch(e){$('sb-login').style.display='block'}
}
async function doLogout(){await fetch(B+'/api/auth/logout',{method:'POST'});location.reload()}

function go(p){
  document.querySelectorAll('.pg').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(x=>x.classList.remove('active'));
  const pg=$('page-'+p),nv=$('nav-'+p);if(pg)pg.classList.add('active');if(nv)nv.classList.add('active');
  if(p==='overview')loadOverview();if(p==='billing')loadBilling();if(p==='keys')loadKeys();
  if(p==='catalog')loadCatalog();if(p==='notifications')loadAnn();if(p==='settings')loadSettings();
}

async function loadOverview(){
  try{const r=await fetch(B+'/api/user/me');const d=await r.json();
    const parts=creditParts(d),planName=d.tier?.name||d.tier?.tierName||'Free',period=periodLabel(d.credits?.billingPeriod||'monthly'),end=d.credits?.billingCycleEnd,userName=U?.user?.username||d.user?.username||'there',planUsed=parts.monthly?Math.max(0,parts.monthly-Math.max(parts.standard,0)):0,planPct=parts.monthly?pct(planUsed,parts.monthly):0;
    $('o-tier').textContent=planName;$('o-fast').textContent=fN(parts.fast);$('o-std').textContent=fN(parts.standard);$('o-roll').textContent=fN(parts.rollover);
    $('o-total').textContent=fN(parts.total);$('o-period').textContent=period;$('o-next').textContent=fD(end);$('o-renew-left').textContent=timeLeftLabel(end);$('o-status').textContent='Active';$('o-status').className='bg bg-g';
    $('o-plan-allocation').textContent=parts.monthly?`${fN(parts.monthly)} plan credits per ${period.toLowerCase()} cycle`:'Plan allocation is not exposed yet';
    $('o-plan-meta').textContent=parts.monthly?`${fN(Math.max(parts.standard,0))} plan credits visible · ${planPct}% estimated used`:'Usage and allocation details will appear as plan metadata becomes available.';
    $('o-plan-progress').style.width=planPct+'%';
    $('o-recharge-total').textContent=fN(parts.rechargeTotal)+' credits';
    $('o-model-access').textContent=d.tier?.modelAccessLevel||d.tier?.model_access_level||'Standard';
    $('o-hero-title').textContent=`${greeting()}, ${userName}`;
    $('o-hero-copy').innerHTML=parts.total>0?`Your <strong>${esc(planName)}</strong> workspace is ready for API calls. You have <strong>${fN(parts.total)}</strong> credits available across plan, rollover, fast, and recharge balances.`:`Your <strong>${esc(planName)}</strong> workspace is ready. Create an API key or open chat; credits and usage activity will appear here as soon as the account starts using models.`;
    $('o-action-copy').textContent=parts.rechargeTotal>0?'Recharge balance is active for extra headroom this cycle.':'Need more room for testing? Recharge packs can add one-time credits without changing plans.';
    $('o-fast-note').textContent=parts.fast?'Fast lane is available for priority-capacity requests.':'Fast credits will appear when your plan or recharge pack provides priority capacity.';
    $('o-std-note').textContent=parts.overage?`Overdrawn by ${fN(parts.overage)} credits.`:parts.standard>0?'Ready for everyday model requests.':'No standard balance exposed yet; start usage or choose a plan to populate this area.';
    renderCreditBar('o-cr-bar','o-cr-legend',parts,true);
    $('o-recharges').innerHTML=renderRechargeRows(parts.recharges);
  }catch(e){console.error(e)}
  try{const kr=await fetch(B+'/api/user/keys');const keys=await kr.json();const arr=Array.isArray(keys)?keys:[];const totalReq=arr.reduce((s,k)=>s+Number(k.usageCount||0),0);$('o-api-keys').textContent=fN(arr.length);$('o-api-requests').textContent=fN(totalReq);$('o-requests').textContent=fN(totalReq);$('o-usage-note').textContent=arr.length?`${arr.length} key${arr.length===1?'':'s'} tracked`:'No API keys yet';$('o-usage-empty').classList.toggle('has-usage',totalReq>0);if(totalReq>0){$('o-usage-empty').innerHTML='<span class="ms">monitoring</span><strong>'+fN(totalReq)+' tracked requests</strong><span>Detailed daily breakdown can replace this placeholder once usage history is connected.</span>'}}catch(e){$('o-api-keys').textContent='—';$('o-api-requests').textContent='—';$('o-requests').textContent='—'}
}

async function loadBilling(){
  try{const r=await fetch(B+'/api/user/me');const d=await r.json();
    const parts=creditParts(d),bal=parts.standard,roll=parts.rollover,fast=parts.fast;
    $('b-tier').textContent=d.tier?.name||'Free';$('b-fast').textContent=fN(fast);$('b-std').textContent=fN(bal);$('b-roll').textContent=fN(roll);
    const mc=parts.monthly,nextBill=fD(d.credits?.billingCycleEnd),cycleStart=fD(d.credits?.billingCycleStart),period=periodLabel(d.credits?.billingPeriod||'monthly'),recharges=parts.recharges;
    const planName=d.tier?.name||'Free',standard=Math.max(bal,0),overage=parts.overage,rechargeTotal=parts.rechargeTotal,totalCredits=parts.total,remainingPlan=Math.max(0,Math.min(standard,mc||standard)),remainingPct=pct(remainingPlan,Math.max(mc,1));
    $('billing-hero').innerHTML=`
      <div class="billing-hero-main">
        <div class="billing-eyebrow"><span class="ms">verified</span>Active subscription</div>
        <div class="billing-plan-line"><span>${esc(planName)}</span><span class="bg bg-g">Active</span></div>
        <div class="billing-copy">${period} billing renews in <strong>${timeLeftLabel(d.credits?.billingCycleEnd)}</strong>. You have <strong>${fN(totalCredits)}</strong> usable credits available${overage?` with <strong>${fN(overage)}</strong> credits overdrawn`:''}.</div>
        <div class="billing-progress remaining"><div class="billing-progress-fill" style="width:${remainingPct}%"></div></div>
        <div class="billing-progress-meta"><span>${fN(remainingPlan)} of ${fN(mc)} plan credits remaining</span><span>${remainingPct}%</span></div>
      </div>
      <div class="billing-hero-side">
        <div><span>Next renewal</span><strong>${nextBill}</strong></div>
        <div><span>Recharge balance</span><strong>${fN(rechargeTotal)} credits</strong></div>
        <div><span>Billing cycle</span><strong>${period}</strong></div>
      </div>`;
    $('bill-info').innerHTML=`
      <div class="bill-row"><span class="bill-lbl">Plan</span><span class="bill-val bill-plan">${esc(planName)}</span></div>
      <div class="bill-row"><span class="bill-lbl">Monthly Allocation</span><span class="bill-val">${fN(mc)} credits</span></div>
      <div class="bill-row"><span class="bill-lbl">Available Credits</span><span class="bill-val">${fN(totalCredits)} credits</span></div>
      <div class="bill-row"><span class="bill-lbl">Billing Period</span><span class="bill-val">${period}</span></div>
      <div class="bill-row"><span class="bill-lbl">Cycle Start</span><span class="bill-val">${cycleStart}</span></div>
      <div class="bill-row"><span class="bill-lbl">Next Renewal</span><span class="bill-val">${nextBill}</span></div>
      <div class="bill-row"><span class="bill-lbl">Time Remaining</span><span class="bill-val">${timeLeftLabel(d.credits?.billingCycleEnd)}</span></div>
      <div class="bill-row"><span class="bill-lbl">Status</span><span class="bill-val"><span class="bg bg-g">Active</span></span></div>
      ${recharges.length?`<div class="bill-subhead">Active Recharge Packs</div>`+
        recharges.map(rb=>`<div class="bill-row bill-recharge-row"><span class="bill-lbl">${esc(firstVal(rb,['tierName','tier_name'],'Pack'))}</span><span class="bill-val">${fN(numVal(rb,['remaining','creditsRemaining'],0))} cr · ${esc(timeLeftLabel(firstVal(rb,['expiresAt','expires_at'],null)))}</span></div>`).join(''):''}`;
  }catch(e){}

  try{const r=await fetch(B+'/api/user/tiers');const d=await r.json();
    billingState={tiers:d.tiers||[],currentTier:d.currentTier||null};
    billingCycle=d.currentTier?.billingPeriod||billingCycle;
    if(!BILLING_CYCLES.includes(billingCycle))billingCycle='monthly';
    updateCycleTabs();renderTierGrid();
  }catch(e){$('tier-grid').innerHTML='<div class="empty"><span class="ms">error</span>Could not load plans</div>';}

  try{const r=await fetch(B+'/api/user/recharge');const d=await r.json();const g=$('rech-grid');
    if(!Array.isArray(d)||!d.length){g.innerHTML='<div class="empty"><span class="ms">storefront</span>No packages</div>';return}
    g.innerHTML=d.map(p=>{
      const price=Number(p.priceIdr||p.price_idr||0),orig=Number(p.originalPriceIdr||p.original_price_idr||0),discount=Number(p.discountPct||p.discount_pct||0),allEligible=packageIsAllEligible(p),tier=allEligible?'ALL eligible plans':(p.tierDisplayName||p.targetTierName||'Eligible plans'),expRaw=firstVal(p,['expiryDate','expiry_date','expiresAt','expires_at'],null),exp=expRaw?`${timeLeftLabel(expRaw)} · ${fD(expRaw)}`:'No expiry',queue=packageQueueInfo(p),limit=packageLimitInfo(p);
      return `<div class="recharge-card ${allEligible?'all-eligible':''}">
        <div class="recharge-top">
          <div class="recharge-icon"><span class="ms f">add_card</span></div>
          <div><div class="recharge-name">${esc(p.name||'Recharge Pack')}</div><div class="recharge-tier">For ${esc(tier)}</div></div>
        </div>
        <div class="recharge-desc">${esc(p.description||'Adds one-time credits to your account for extra usage beyond your subscription allocation.')}</div>
        <div class="recharge-price-row">
          <span class="recharge-price">${fC(price)}</span>
          ${orig>price?`<span class="recharge-original">${fC(orig)}</span>`:''}
        </div>
        <div class="recharge-meta">
          <span class="bg bg-p">${fN(p.credits)} credits</span>
          ${discount>0?`<span class="bg bg-g">${discount}% off</span>`:''}
          ${allEligible?`<span class="bg bg-b">ALL eligible plans</span>`:''}
          <span class="bg bg-y"><span class="ms mini">schedule</span>${esc(exp)}</span>
        </div>
        <div class="recharge-detail-surface">
          <div><span class="ms">speed</span><strong>${esc(queue)}</strong></div>
          <div><span class="ms">production_quantity_limits</span><strong>${esc(limit)}</strong></div>
        </div>
        <button class="btn btn-f recharge-btn" onclick="buyRech(${Number(p.id)})"><span class="ms">shopping_cart</span>Purchase pack</button>
      </div>`;
    }).join('');
  }catch(e){}
}
function updateCycleTabs(){
  const available=new Set();billingState.tiers.forEach(t=>parsePeriods(t.billingPeriods).forEach(p=>available.add(p)));
  document.querySelectorAll('.cycle-tab').forEach(btn=>{const c=btn.dataset.cycle;btn.classList.toggle('active',c===billingCycle);btn.disabled=available.size>0&&!available.has(c)});
}
function setBillingCycle(cycle){if(!BILLING_CYCLES.includes(cycle))return;billingCycle=cycle;updateCycleTabs();renderTierGrid()}
function renderTierGrid(){
  const g=$('tier-grid'),tiers=billingState.tiers||[],cur=billingState.currentTier||{};
  if(!tiers.length){g.innerHTML='<div class="empty"><span class="ms">workspace_premium</span>No plans available</div>';return}
  const tierColors=['#6750A4','#2196F3','#4CAF50','#FF9800','#E91E63','#9C27B0'];
  g.innerHTML=tiers.map((t,i)=>{
    const periods=parsePeriods(t.billingPeriods),cycleOk=periods.includes(billingCycle),tid=t.id,nm=t.name||t.tierName||'Plan',mc=t.monthlyCredits||0,isCurrent=tid==cur.id,col=tierColors[i%tierColors.length];
    const label=isCurrent&&billingCycle===(cur.billingPeriod||'monthly')?'Current Plan':cycleOk?'Choose Plan':periodLabel(billingCycle)+' unavailable';
    const disabled=!cycleOk||t.disableBuying;
    return `<div class="cd tier-card" style="border-color:${isCurrent?col:'transparent'}">
      ${isCurrent?`<div class="tier-current" style="background:${col}">Current</div>`:''}
      <div class="tier-name" style="color:${col}">${esc(nm)}</div>
      <div class="tier-price">${priceLabel(t,billingCycle)}</div>
      <div class="tier-feature"><span class="ms">bolt</span>${fN(mc)} credits/month</div>
      <div class="tier-feature"><span class="ms">calendar_month</span>${periods.map(periodLabel).join(', ')}</div>
      <div class="tier-feature"><span class="ms">model_training</span>${esc(t.modelAccessLevel||'standard')} model access</div>
      <button class="btn ${isCurrent?'btn-o':'btn-f'}" style="margin-top:auto${disabled?';opacity:.5;cursor:not-allowed':''}" ${disabled?'disabled':''} onclick="requestTierChange(${tid})">${label}</button>
    </div>`;
  }).join('');
}
async function requestTierChange(tierId){
  const tier=billingState.tiers.find(t=>Number(t.id)===Number(tierId));if(!tier)return;
  const current=billingState.currentTier||{},same=Number(current.id)===Number(tierId)&&billingCycle===(current.billingPeriod||'monthly');
  if(same){toast(`You are already on ${tier.name||tier.tierName||'this plan'} with ${periodLabel(billingCycle).toLowerCase()} billing.`);return}
  try{const r=await fetch(B+'/api/user/tiers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tierId,billingPeriod:billingCycle})});const d=await r.json();
    if(!r.ok){toast(d.error||'Could not choose plan','error');return}
    const action=d.changeType==='upgrade'?'Upgrade':d.changeType==='downgrade'?'Downgrade':'Plan change';
    toast(`${action} to ${tier.name||tier.tierName||'plan'} selected for the next ${periodLabel(billingCycle).toLowerCase()} billing cycle. Temporarily applied immediately while payments are disabled.`);
    await loadOverview();await loadBilling();
  }catch(e){toast('Network error','error')}
}
async function buyRech(id){
  try{const r=await fetch(B+'/api/user/recharge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packageId:id})});
    if(r.ok){toast('Recharge applied!');loadOverview();if($('page-billing')?.classList.contains('active'))loadBilling()}else{const e=await r.json();toast(e.error||'Error','error')}
  }catch(e){toast('Network error','error')}
}

async function loadKeys(){
  const tb=$('k-body');
  try{const r=await fetch(B+'/api/user/keys');const d=await r.json();
    if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="6"><div class="empty"><span class="ms">vpn_key</span>No keys yet</div></td></tr>';return}
    tb.innerHTML=d.map(k=>`<tr>
      <td><strong>${k.name||'Key'}</strong></td>
      <td><span class="mono" style="cursor:pointer" onclick="this.textContent=this.dataset.r==='1'?'Click to reveal':'${k.key}';this.dataset.r=this.dataset.r==='1'?'0':'1'" data-r="1">Click to reveal</span></td>
      <td><span class="bg bg-${k.allowedModels==='all'?'g':'b'}">${k.allowedModels==='all'?'All':k.allowedModels==='*'?'All':'Selected'}</span></td>
      <td>${k.creditCapAmount<0?'∞':fN(k.creditCapAmount)+'/'+k.creditCapPeriod}</td>
      <td>${fN(k.usageCount||0)}</td>
      <td><button class="ib del" onclick="delKey(${k.id})"><span class="ms">delete</span></button></td>
    </tr>`).join('');
  }catch(e){console.error(e)}
}
async function delKey(id){if(!confirm('Delete this key?'))return;
  try{const r=await fetch(B+'/api/user/keys?id='+id,{method:'DELETE'});if(r.ok){toast('Deleted');loadKeys()}else toast('Error','error')}catch(e){toast('Error','error')}
}
function openKeyModal(){$('key-oly').classList.add('show');$('k-name').value='';$('k-cap').value='-1';$('k-period').value='none';$('k-models-mode').value='all';$('k-model-picker').style.display='none';selModels.clear();loadModelChips()}
function closeKeyModal(){$('key-oly').classList.remove('show')}
function toggleModelPicker(){$('k-model-picker').style.display=$('k-models-mode').value==='select'?'block':'none';if($('k-models-mode').value==='select')loadModelChips()}
async function loadModelChips(){
  try{const r=await fetch(B+'/api/user/catalog?category=text');const d=await r.json();const c=$('k-chips');
    c.innerHTML=(d.models||[]).map(m=>`<button class="chip ${selModels.has(m.id)?'sel':''}" onclick="toggleChip(this,'${m.id}')">${m.name||m.id}</button>`).join('');
  }catch(e){}
}
function toggleChip(el,id){if(selModels.has(id)){selModels.delete(id);el.classList.remove('sel')}else{selModels.add(id);el.classList.add('sel')}}
async function submitKey(){
  const body={name:$('k-name').value||'My Key',creditCapAmount:Number($('k-cap').value),creditCapPeriod:$('k-period').value,
    allowedModels:$('k-models-mode').value==='all'?'all':Array.from(selModels)};
  try{const r=await fetch(B+'/api/user/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){const d=await r.json();closeKeyModal();toast('Key created!');loadKeys();
      if(d.key)prompt('Save your key (shown once only):',d.key);
    }else{const e=await r.json();toast(e.error||'Error','error')}
  }catch(e){toast('Error','error')}
}

async function loadCatalog(){
  try{const r=await fetch(B+'/api/user/catalog?category=text');const d=await r.json();catData=d.models||[];renderCatalog()}catch(e){$('cat-grid').innerHTML='<div class="empty"><span class="ms">error</span>Failed to load</div>'}
}
function setCatFilter(el,cap){catCap=cap;document.querySelectorAll('#page-catalog .pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');renderCatalog()}
function filterCatalog(){renderCatalog()}
function renderCatalog(){
  const q=($('cat-search').value||'').toLowerCase();
  let f=catData;
  if(catCap)f=f.filter(m=>(m.capabilities||[]).some(c=>c.toLowerCase().includes(catCap)));
  if(q)f=f.filter(m=>(m.id+' '+m.name+' '+(m.description||'')).toLowerCase().includes(q));
  const g=$('cat-grid');
  if(!f.length){g.innerHTML='<div class="empty"><span class="ms">search_off</span>No models found</div>';return}
  g.innerHTML=f.map(m=>`<div class="m-card">
    <div class="m-name">${m.name||m.id}</div>
    <div class="m-desc">${m.description||'AI Model'}</div>
    <div class="m-caps">
      ${(m.capabilities||[]).map(c=>`<span class="bg bg-b">${c}</span>`).join('')}
      <span class="bg bg-y">${m.contextWindow||'—'} ctx</span>
      ${m.modelAccessLevel&&m.modelAccessLevel!=='free'?`<span class="bg bg-p">${m.modelAccessLevel}+</span>`:''}
    </div>
  </div>`).join('');
}

async function loadAnn(){
  try{const r=await fetch(B+'/api/announcements');const d=await r.json();const l=$('ann-list');
    const items=[...(d.banners||[]),...(d.announcements||[])];
    if(!items.length){l.innerHTML='<div class="empty"><span class="ms">notifications_off</span>No announcements</div>';return}
    l.className='ann-list';
    l.innerHTML=items.map(a=>{const id=Number(a.id)||Math.random().toString(36).slice(2),type=a.type||'info',body=typeof marked!=='undefined'?marked.parse(a.content||''):(a.content||''),prev=excerpt(a.content||'',150);return `<article class="ann-card ${type}" id="ann-${id}" onclick="toggleAnn('${id}')" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAnn('${id}')}">
      <div class="ann-icon"><span class="ms">${annIcon(type)}</span></div>
      <div class="ann-main">
        <div class="ann-head"><div class="ann-title-wrap"><span class="bg bg-${annTypeClass(type)}">${esc(type)}</span>${a.isUrgent?'<span class="bg bg-r">Urgent</span>':''}<strong>${esc(a.title||'Announcement')}</strong></div><span class="ann-date">${fD(a.createdAt)}</span></div>
        <p class="ann-preview">${esc(prev||'No description provided.')}</p>
        <div class="ann-body">${body}</div>
        <div class="ann-more"><span class="ms">expand_more</span><span>More details</span></div>
      </div>
    </article>`}).join('');
  }catch(e){$('ann-list').innerHTML='<div class="empty">Failed to load</div>'}
}

async function loadUnread(){
  try{const r=await fetch(B+'/api/announcements');const d=await r.json();
    const dot=$('noti-dot');if(dot)dot.classList.toggle('show',(d.unreadCount||0)>0);
  }catch(e){}
}

function getBannerDismissed(){try{return JSON.parse(sessionStorage.getItem('dismissed_banners')||'[]')}catch{return[]}}
function setBannerDismissed(id){const d=getBannerDismissed();if(!d.includes(id)){d.push(id);sessionStorage.setItem('dismissed_banners',JSON.stringify(d))}}

async function loadBanners(){
  try{const r=await fetch(B+'/api/announcements');const d=await r.json();
    const dismissed=getBannerDismissed();
    const b=(d.banners||[]).filter(x=>!dismissed.includes(x.id));
    const c=$('banners');if(!c)return;
    c.innerHTML=b.slice(0,3).map(x=>{const bt=x.type||'info',prev=excerpt(x.content||'',110);return `<div class="banner ${bt}" id="ubanner-${x.id}" onclick="go('notifications')">
      <div class="banner-ic"><span class="ms">${annIcon(bt)}</span></div>
      <div class="banner-copy"><strong>${esc(x.title||'Announcement')}</strong>${prev?`<span>${esc(prev)}</span>`:''}</div>
      ${x.isUrgent?'<span class="bg bg-r">Urgent</span>':''}
      <button class="b-close" onclick="event.stopPropagation();dismissB(${Number(x.id)},this)" title="Dismiss"><span class="ms">close</span></button>
    </div>`}).join('');
  }catch(e){}
}
function dismissB(id,btn){
  setBannerDismissed(id);
  const el=document.getElementById('ubanner-'+id)||btn?.closest('.banner');
  if(el){el.style.transition='opacity .2s';el.style.opacity='0';setTimeout(()=>el.remove(),200)}
}

function loadSettings(){
  if(!U)return;$('s-nm').textContent=U.user?.username||'User';$('s-email').textContent='@'+(U.user?.username||'user');
  $('s-av').src=U.user?.avatar||'';$('s-id').textContent=U.userId||U.id||'—';$('s-since').textContent='—';
}

document.addEventListener('DOMContentLoaded',()=>{applyTheme(localStorage.getItem('orchid-dashboard-theme')||'dark');loadDashboardAccent();initAuth();loadBanners();go('overview')});