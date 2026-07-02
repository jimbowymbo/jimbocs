// Lógica de la aplicación Jimbo Cocktail Society.
// Se carga como módulo ES (<script type="module">), por lo que los imports
// de Firebase y de los datos de cócteles se resuelven aquí mismo.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getDatabase, ref, set, get, child } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';
import { IBA_SEED } from './data.js';

const FB={apiKey:"AIzaSyCequ_IRHIuPfsceCEnKqgM29Nq9QEA6EY",authDomain:"jimbococktails.firebaseapp.com",databaseURL:"https://jimbococktails-default-rtdb.europe-west1.firebasedatabase.app",projectId:"jimbococktails",storageBucket:"jimbococktails.firebasestorage.app",messagingSenderId:"81027495505",appId:"1:81027495505:web:ad0b49a3badea79909aa70"};
const db=getDatabase(initializeApp(FB));
const dbRef=ref(db);
const fbGet=async p=>{try{const s=await get(child(dbRef,p));return s.exists()?s.val():null;}catch{return null;}};
const fbSet=async(p,v)=>{try{await set(ref(db,p),v);}catch{}};
const setProgress=(pct,msg)=>{document.getElementById('splashBar').style.width=pct+'%';document.getElementById('splashMsg').textContent=msg;};
const sha256=async s=>{try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(buf));}catch{return[];}};
const hashEq=async(s,h)=>{if(!h||!Array.isArray(h))return false;const a=await sha256(s);return a.length===h.length&&a.every((b,i)=>b===h[i]);};
const escHtml=s=>typeof s==='string'?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'):'';
const sanitize=s=>{if(typeof s!=='string')return '';return typeof DOMPurify!=='undefined'?DOMPurify.sanitize(s,{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}):escHtml(s);};



let cocktails=[],currentUser=null,currentUserPinHash=null,myData={},myIngredients=new Set();
let selectedLiquors=new Set(),selectedCat='all',currentId=null,currentRating=0,editImgBase64=null;
let historiaLoaded={},quizAnswers={},quizStep=0;
let _pinBuf='',_pinTarget=null,_pendingLoginUser=null,_pinFailCount=0,_pinLocked=false,_pinLockTimer=null;
let gridSize=1;
const SESSION_MS=30*60*1000,WARN_MS=25*60*1000;
let _sesTimer=null,_sesWarn=null,_sesInterval=null;

window.resetSessionTimer=function(){
  clearTimeout(_sesTimer);clearTimeout(_sesWarn);clearInterval(_sesInterval);
  document.getElementById('sessionWarning').style.display='none';
  if(!currentUser)return;
  _sesWarn=setTimeout(()=>{
    let s=Math.round((SESSION_MS-WARN_MS)/1000);
    const w=document.getElementById('sessionWarning'),cd=document.getElementById('sessionCountdown');
    w.style.display='block';cd.textContent=s+'s';
    _sesInterval=setInterval(()=>{s--;cd.textContent=s+'s';if(s<=0)clearInterval(_sesInterval);},1000);
  },WARN_MS);
  _sesTimer=setTimeout(()=>{clearInterval(_sesInterval);document.getElementById('sessionWarning').style.display='none';logout(true);},SESSION_MS);
};
['click','keydown','mousemove','touchstart','scroll'].forEach(ev=>document.addEventListener(ev,()=>{if(currentUser)resetSessionTimer();},{passive:true}));

const RATE={max:5,winMs:15*60*1000};
async function checkRate(u){const d=await fbGet(`jimbo_login_attempts/${u}`),now=Date.now();if(!d)return{ok:true};if(d.lockedUntil>now){const m=Math.ceil((d.lockedUntil-now)/60000);return{ok:false,msg:`Demasiados intentos. Espera ${m} min.`};}if(now-d.firstAttempt>RATE.winMs){await fbSet(`jimbo_login_attempts/${u}`,null);return{ok:true};}if(d.count>=RATE.max){await fbSet(`jimbo_login_attempts/${u}`,{...d,lockedUntil:now+RATE.winMs});return{ok:false,msg:'Demasiados intentos. Espera 15 minutos.'};}return{ok:true};}
async function recordFail(u){const d=await fbGet(`jimbo_login_attempts/${u}`),now=Date.now();if(!d||now-(d.firstAttempt||now)>RATE.winMs){await fbSet(`jimbo_login_attempts/${u}`,{count:1,firstAttempt:now,lockedUntil:0});return;}const nc=(d.count||0)+1;await fbSet(`jimbo_login_attempts/${u}`,{...d,count:nc,lockedUntil:nc>=RATE.max?now+RATE.winMs:0});}
const clearFails=u=>fbSet(`jimbo_login_attempts/${u}`,null);

const CAT_FILTER={u:'Los Inolvidables',c:'Clásicos Contemporáneos',n:'Nueva Era',x:'custom'};
const LIQUORS=['Gin','Vodka','Rum','Tequila','Whisky','Bourbon','Cognac','Triple Sec','Campari','Vermouth','Champagne','Amaretto','Kahlúa','Mezcal','Absenta','Brandy','Cointreau','Pisco','Cachaça'];
const QUIZ=[
  {id:'sabor',q:'¿Qué sabor te pide el cuerpo?',opts:[{label:'Amargo y seco',val:'amargo'},{label:'Dulce y frutal',val:'dulce'},{label:'Fresco y cítrico',val:'fresco'},{label:'Cremoso o especiado',val:'cremoso'},{label:'Me da igual',val:'any'}]},
  {id:'alcohol',q:'¿Cuánto alcohol quieres?',opts:[{label:'Suave y ligero',val:'suave'},{label:'Medio, lo justo',val:'medio'},{label:'Potente y directo',val:'potente'},{label:'Me es indiferente',val:'any'}]},
  {id:'base',q:'¿Con qué base te apetece?',opts:[{label:'Gin',val:'gin'},{label:'Vodka',val:'vodka'},{label:'Rum / Ron',val:'rum'},{label:'Whisky / Bourbon',val:'whisky'},{label:'Tequila / Mezcal',val:'tequila'},{label:'Sin preferencia',val:'any'}]},
];

const uPath=s=>`jimbo_data/${currentUser}/${s}`;
const isIBA=c=>IBA_SEED.some(x=>x.id===c.id);
const getImg=c=>c.img||'';
const canMake=c=>myIngredients.size&&c.ingredients.every(i=>myIngredients.has(i.n));
const allIngs=()=>{const s=new Set();cocktails.forEach(c=>c.ingredients.forEach(i=>s.add(i.n)));return[...s].sort();};

window.setTheme=m=>{
  document.body.classList.toggle('dark-mode',m==='dark');
  document.getElementById('btnLight')?.classList.toggle('active',m==='light');
  document.getElementById('btnDark')?.classList.toggle('active',m==='dark');
  if(currentUser)fbSet(uPath('prefs'),{gridSize,theme:m});
};



async function loadUserData(){
  setProgress(80,'Cargando tu perfil…');
  const[rOverrides,rM,rI]=await Promise.all([
    fbGet('jimbo_cocktails'),   // overrides compartidos (fotos, ediciones IBA)
    fbGet(uPath('my')),
    fbGet(uPath('ings'))
  ]);
  // Base = IBA_SEED + overrides de Firebase para cócteles modificados
  const overrides = rOverrides || {};
  const base = IBA_SEED.map(c => overrides[c.id] ? {...c,...overrides[c.id]} : c);
  const uc=await fbGet(uPath('custom_cocktails'));
  cocktails=uc?[...base,...Object.values(uc)]:[...base];
  cocktails.sort((a,b)=>a.id-b.id);
  myData=rM?(typeof rM==='object'?rM:JSON.parse(rM)):{};
  myIngredients=rI&&Array.isArray(rI)?new Set(rI):new Set();
}

// IBA: guarda solo los campos modificados en Firebase (override compartido)
// Custom: guarda en el espacio personal del usuario
async function saveCocktailToDb(c){
  if(isIBA(c)) await fbSet(`jimbo_cocktails/${c.id}`,c);
  else await fbSet(`${uPath('custom_cocktails')}/${c.id}`,c);
}
async function deleteCocktailFromDb(c){if(!isIBA(c))await fbSet(`${uPath('custom_cocktails')}/${c.id}`,null);}
const saveMyData=()=>fbSet(uPath('my'),myData);

window.setCat=(cat,el)=>{selectedCat=cat;document.querySelectorAll('.chip-cat').forEach(c=>c.classList.remove('active'));el.classList.add('active');render();};

function buildChips(){
  const w=document.getElementById('chipContainer');w.innerHTML='';
  LIQUORS.forEach(l=>{const d=document.createElement('div');d.className='chip'+(selectedLiquors.has(l)?' active':'');d.textContent=l;d.onclick=()=>{selectedLiquors.has(l)?selectedLiquors.delete(l):selectedLiquors.add(l);d.classList.toggle('active');render();};w.appendChild(d);});
}

window.render=function(){
  const q=document.getElementById('searchInput').value.toLowerCase();
  const tried=document.getElementById('triedOnly').checked;
  const cm=document.getElementById('canMake').checked;
  let list=[...cocktails];
  if(q)list=list.filter(c=>c.name.toLowerCase().includes(q)||c.ingredients.some(i=>i.n.toLowerCase().includes(q)));
  if(selectedCat==='x')list=list.filter(c=>c.cat==='Custom');
  else if(selectedCat!=='all')list=list.filter(c=>c.cat===CAT_FILTER[selectedCat]);
  if(selectedLiquors.size)list=list.filter(c=>!c.liquors||!c.liquors.length||[...selectedLiquors].every(l=>c.liquors.includes(l)));
  if(tried)list=list.filter(c=>myData[c.id]&&myData[c.id].tried);
  if(cm)list=list.filter(c=>canMake(c));
  const grid=document.getElementById('grid'),empty=document.getElementById('emptyMsg');
  document.getElementById('countBadge').textContent=list.length+' de '+cocktails.length;
  if(!list.length){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  grid.innerHTML=list.map(c=>{
    const my=myData[c.id]||{},img=getImg(c);
    return `<div class="card" id="card-${c.id}" onclick="openModal(${c.id})">
      ${img?`<img class="card-img" src="${sanitize(img)}" alt="${sanitize(c.name)}" loading="lazy">`:''}
      ${!img?`<div class="card-img-ph">${sanitize(c.emoji||'🍸')}</div>`:''}
      ${my.rating?`<div class="card-rating" style="background:#1C2B3Acc;color:var(--gold2)">${'★'.repeat(my.rating)}</div>`:''}
      <div class="card-body">
        <div class="card-name">${sanitize(c.name)}</div>
        <div class="card-cat">${sanitize(c.cat)}</div>
        ${my.tried||my.rating?`<div class="card-badges">${my.tried?'<span class="badge-tried">Probado</span>':''}${my.rating?`<span class="badge-stars" style="color:var(--gold)">${'★'.repeat(my.rating)}</span>`:''}</div>`:''}
      </div>
    </div>`;
  }).join('');
};

window.openModal=function(id){
  currentId=id;currentRating=0;editImgBase64=null;
  const c=cocktails.find(x=>x.id===id);if(!c)return;
  const img=getImg(c);
  document.getElementById('modalTitle').textContent=c.name;
  document.getElementById('modalCat').textContent=c.cat;
  document.getElementById('modalTaste').textContent=c.taste||'';
  document.getElementById('modalImgWrap').innerHTML=img
    ?`<img class="modal-img" src="${sanitize(img)}" alt="${sanitize(c.name)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="modal-img-ph" style="display:none">${sanitize(c.emoji||'🍸')}</div>`
    :`<div class="modal-img-ph">${sanitize(c.emoji||'🍸')}</div>`;
  document.getElementById('modalIngredients').innerHTML=c.ingredients.map(i=>{
    const have=myIngredients.has(i.n);
    const cls=myIngredients.size?(have?'ing-name ing-have':'ing-name ing-miss'):'ing-name';
    return `<li><span class="${cls}">${myIngredients.size?(have?'✓ ':'✗ '):''}${sanitize(i.n)}</span><span class="ing-amount">${sanitize(i.a)}</span></li>`;
  }).join('');
  document.getElementById('modalInstructions').textContent=c.instructions;
  document.getElementById('modalGlass').textContent=c.glass||'—';
  document.getElementById('editImgUrl').value=c.img||'';
  document.getElementById('editImgFile').value='';
  document.getElementById('editName').value=c.name;
  document.getElementById('editCat').value=c.cat;
  document.getElementById('editEmoji').value=c.emoji||'';
  document.getElementById('editTaste').value=c.taste||'';
  document.getElementById('editGlass').value=c.glass||'';
  document.getElementById('editHistoria').value=c.historia||'';
  document.getElementById('editInstructions').value=c.instructions||'';
  document.getElementById('editIngList').innerHTML='';
  (c.ingredients||[]).forEach(i=>addEditIngRow(i.n,i.a));
  document.getElementById('editCustomOnly').style.display=!isIBA(c)?'block':'none';
  historiaLoaded[id]=false;
  document.getElementById('historiaText').textContent='Cargando historia…';
  if(c.historia){document.getElementById('historiaText').textContent=c.historia;historiaLoaded[id]=true;}
  loadMySection();
  switchTab('recipe',document.querySelector('.tabs .tab'));
  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow='hidden';
};

function loadMySection(){const my=myData[currentId]||{};document.getElementById('triedCheck').checked=!!my.tried;document.getElementById('commentArea').value=my.comment||'';currentRating=my.rating||0;renderStars();}
function renderStars(){document.getElementById('starsInput').innerHTML=[1,2,3,4,5].map(i=>`<span class="${i<=currentRating?'active':''}" onclick="setRating(${i})">★</span>`).join('');}
window.setRating=n=>{currentRating=n;renderStars();saveMy();};
window.saveMy=async()=>{if(!currentId)return;myData[currentId]={tried:document.getElementById('triedCheck').checked,rating:currentRating,comment:document.getElementById('commentArea').value};await saveMyData();render();};
window.handleFileUpload=()=>{const f=document.getElementById('editImgFile').files[0];if(!f)return;const r=new FileReader();r.onload=e=>{editImgBase64=e.target.result;document.getElementById('editImgUrl').value='(imagen subida)';};r.readAsDataURL(f);};
window.saveImg=async()=>{if(!currentId)return;const c=cocktails.find(x=>x.id===currentId);if(!c)return;c.img=editImgBase64||document.getElementById('editImgUrl').value.trim();await saveCocktailToDb(c);openModal(currentId);render();};
window.addEditIngRow=(n='',a='')=>{const row=document.createElement('div');row.className='ing-item-row';row.innerHTML=`<input type="text" placeholder="Ingrediente" value="${sanitize(n)}" style="flex:2"><input type="text" placeholder="Cantidad" value="${sanitize(a)}" style="flex:1"><button class="remove-ing" onclick="this.parentNode.remove()">×</button>`;document.getElementById('editIngList').appendChild(row);};
window.saveCocktailData=async()=>{
  if(!currentId)return;const c=cocktails.find(x=>x.id===currentId);if(!c)return;
  c.name=document.getElementById('editName').value.trim()||c.name;
  c.cat=document.getElementById('editCat').value;
  c.emoji=document.getElementById('editEmoji').value.trim()||c.emoji;
  c.taste=document.getElementById('editTaste').value.trim();
  c.glass=document.getElementById('editGlass').value.trim();
  c.historia=document.getElementById('editHistoria').value.trim();
  c.instructions=document.getElementById('editInstructions').value.trim();
  const rows=[...document.getElementById('editIngList').querySelectorAll('.ing-item-row')];
  c.ingredients=rows.map(r=>{const ins=r.querySelectorAll('input');return{n:ins[0].value.trim(),a:ins[1].value.trim()};}).filter(i=>i.n);
  await saveCocktailToDb(c);
  document.getElementById('editDataMsg').textContent='✓ Guardado.';document.getElementById('editDataMsg').className='status-msg ok';
  setTimeout(()=>document.getElementById('editDataMsg').textContent='',2500);
  openModal(currentId);render();
};
window.deleteCocktail=async()=>{if(!confirm('¿Eliminar este cocktail?'))return;const c=cocktails.find(x=>x.id===currentId);await deleteCocktailFromDb(c);cocktails=cocktails.filter(x=>x.id!==currentId);closeModalDirect();render();};
window.switchTab=(tab,el)=>{
  const m={recipe:'tabRecipe',historia:'tabHistoria',editar:'tabEditar',miFicha:'tabMiFicha'};
  Object.values(m).forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  const a=document.getElementById(m[tab]);if(a)a.style.display='block';
  document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));
  if(el?.classList)el.classList.add('active');
  if(tab==='historia'&&currentId&&!historiaLoaded[currentId])loadHistoria();
};
async function loadHistoria(){
  const c=cocktails.find(x=>x.id===currentId);if(!c)return;
  const el=document.getElementById('historiaText');
  if(c.historia&&c.historia.length>30){el.textContent=c.historia;historiaLoaded[currentId]=true;return;}
  el.textContent='Buscando historia…';
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:500,messages:[{role:'user',content:`Escribe en español un párrafo breve y elegante (150-200 palabras) sobre la historia y origen del cocktail "${c.name}". Solo el texto, sin títulos ni formateo.`}]})});
    const data=await r.json();
    const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    if(text){el.textContent=text;historiaLoaded[currentId]=true;}
    else el.textContent=c.historia||'Historia no disponible.';
  }catch{el.textContent=c.historia||'Historia no disponible en este momento.';}
}
window.closeModal=e=>{if(e.target===document.getElementById('overlay'))closeModalDirect();};
window.closeModalDirect=()=>{document.getElementById('overlay').classList.remove('open');document.body.style.overflow='';currentId=null;};
window.switchCfgTab=(p,el)=>{document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.cfg-panel').forEach(x=>x.classList.remove('active'));el.classList.add('active');document.getElementById('cfg'+p.charAt(0).toUpperCase()+p.slice(1)).classList.add('active');if(p==='despensa')buildIngGrid();if(p==='personal'){const sl=document.getElementById('gridSizeSlider');if(sl)sl.value=gridSize;}};
window.openConfig=()=>{document.getElementById('configOverlay').classList.add('open');document.body.style.overflow='hidden';};
window.logout=(auto=false)=>{
  if(!auto&&!confirm('¿Cerrar sesión?'))return;
  clearTimeout(_sesTimer);clearTimeout(_sesWarn);clearInterval(_sesInterval);
  document.getElementById('sessionWarning').style.display='none';
  currentUser=null;currentUserPinHash=null;myData={};myIngredients=new Set();
  cocktails=[];selectedLiquors=new Set();selectedCat='all';gridSize=1;
  document.getElementById('grid').style.gridTemplateColumns='';
  document.getElementById('app').style.display='none';
  closeModalDirect();closeConfig();closeQuiz();
  if(auto)document.getElementById('loginErr').textContent='Sesión cerrada por inactividad.';
  document.getElementById('userScreen').classList.remove('hidden');
  loadUserScreen();
};
window.closeConfig=()=>{document.getElementById('configOverlay').classList.remove('open');document.body.style.overflow='';};
window.closeConfigModal=e=>{if(e.target===document.getElementById('configOverlay'))closeConfig();};
window.addIngRow=(n='',a='')=>{const row=document.createElement('div');row.className='ing-item-row';row.innerHTML=`<input type="text" placeholder="Ingrediente" value="${sanitize(n)}" style="flex:2"><input type="text" placeholder="Cantidad" value="${sanitize(a)}" style="flex:1"><button class="remove-ing" onclick="this.parentNode.remove()">×</button>`;document.getElementById('mIngList').appendChild(row);};
window.saveManual=async()=>{
  const name=document.getElementById('mName').value.trim();
  if(!name){document.getElementById('manualMsg').textContent='El nombre es obligatorio.';document.getElementById('manualMsg').className='status-msg err';return;}
  const rows=[...document.getElementById('mIngList').querySelectorAll('.ing-item-row')];
  const ings=rows.map(r=>{const ins=r.querySelectorAll('input');return{n:ins[0].value.trim(),a:ins[1].value.trim()};}).filter(i=>i.n);
  const c={id:Date.now(),name,cat:document.getElementById('mCat').value,emoji:document.getElementById('mEmoji').value||'🍸',taste:document.getElementById('mTaste').value,historia:document.getElementById('mHistoria').value,glass:document.getElementById('mGlass').value,instructions:document.getElementById('mInstructions').value,ingredients:ings,img:document.getElementById('mImg').value.trim(),liquors:[],q:{sabor:['dulce','fresco'],alcohol:['medio'],base:['otros']}};
  await saveCocktailToDb(c);cocktails.push(c);render();
  ['mName','mEmoji','mTaste','mHistoria','mGlass','mInstructions','mImg'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mIngList').innerHTML='';
  document.getElementById('manualMsg').textContent=`✓ "${sanitize(name)}" añadido.`;document.getElementById('manualMsg').className='status-msg ok';
  setTimeout(()=>document.getElementById('manualMsg').textContent='',3000);
};
function buildIngGrid(){const all=allIngs(),grid=document.getElementById('ingGrid');grid.innerHTML=all.map(i=>{const sid='ing_'+btoa(unescape(encodeURIComponent(i))).replace(/[^a-z0-9]/gi,'');return `<div class="ing-check"><input type="checkbox" id="${sid}" ${myIngredients.has(i)?'checked':''}><label for="${sid}">${sanitize(i)}</label></div>`;}).join('');}
window.saveIngredients=async()=>{const all=allIngs();myIngredients=new Set();all.forEach(i=>{const sid='ing_'+btoa(unescape(encodeURIComponent(i))).replace(/[^a-z0-9]/gi,'');const el=document.getElementById(sid);if(el&&el.checked)myIngredients.add(i);});await fbSet(uPath('ings'),[...myIngredients]);render();document.getElementById('ingMsg').textContent='✓ Despensa guardada ('+myIngredients.size+' ingredientes).';document.getElementById('ingMsg').className='status-msg ok';setTimeout(()=>document.getElementById('ingMsg').textContent='',3000);};
window.changePin=async()=>{
  const old=document.getElementById('cpOld').value.trim(),n1=document.getElementById('cpNew').value.trim(),n2=document.getElementById('cpNew2').value.trim();
  const msg=document.getElementById('cpMsg');msg.className='status-msg';
  if(!old||!n1||!n2){msg.textContent='Rellena todos los campos.';msg.className='status-msg err';return;}
  if(!/^\d{4}$/.test(n1)){msg.textContent='El PIN debe tener 4 dígitos.';msg.className='status-msg err';return;}
  if(n1!==n2){msg.textContent='Los PINes no coinciden.';msg.className='status-msg err';return;}
  if(!(await hashEq(old,currentUserPinHash))){msg.textContent='El PIN actual es incorrecto.';msg.className='status-msg err';return;}
  const h=await sha256(n1);await fbSet(`jimbo_users/${currentUser}/pinHash`,h);currentUserPinHash=h;
  ['cpOld','cpNew','cpNew2'].forEach(id=>document.getElementById(id).value='');
  msg.textContent='✓ PIN actualizado.';msg.className='status-msg ok';setTimeout(()=>msg.textContent='',3000);
};
const GRID_SIZES=[155,210,280,360,460];
window.applyGridSize=val=>{
  gridSize=parseInt(val);
  document.getElementById('grid').style.gridTemplateColumns=`repeat(auto-fill,minmax(${GRID_SIZES[gridSize-1]}px,1fr))`;
  const sl=document.getElementById('gridSizeSlider');if(sl)sl.value=gridSize;
  if(currentUser)fbSet(uPath('prefs'),{gridSize,theme:document.body.classList.contains('dark-mode')?'dark':'light'});
};

window.openQuiz=()=>{quizAnswers={};quizStep=0;renderQuiz();document.getElementById('quizOverlay').classList.add('open');document.body.style.overflow='hidden';};
window.closeQuiz=()=>{document.getElementById('quizOverlay').classList.remove('open');document.body.style.overflow='';};
window.closeQuizModal=e=>{if(e.target===document.getElementById('quizOverlay'))closeQuiz();};
window.quizAnswer=(id,val)=>{quizAnswers[id]=val;quizStep++;if(quizStep>=QUIZ.length)showQuizResult();else renderQuiz();};
function renderQuiz(){
  const body=document.getElementById('quizBody'),q=QUIZ[quizStep],prog=Math.round((quizStep/QUIZ.length)*100);
  body.innerHTML=`<div style="padding:1.25rem;background:var(--cream)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem">
      <div style="flex:1;height:2px;background:var(--border);border-radius:1px"><div style="width:${prog}%;height:100%;background:var(--gold)"></div></div>
      <span style="font-size:11px;color:var(--text3)">${quizStep+1}/${QUIZ.length}</span>
    </div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:600;color:var(--text);margin-bottom:1rem">${sanitize(q.q)}</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${q.opts.map(o=>`<button onclick="quizAnswer('${sanitize(q.id)}','${sanitize(o.val)}')" style="background:var(--cream2);border:1px solid var(--border2);color:var(--text2);padding:11px 14px;border-radius:2px;cursor:pointer;font-size:14px;font-family:'Jost',sans-serif;text-align:left;font-weight:300">${sanitize(o.label)}</button>`).join('')}
    </div>
    ${quizStep>0?`<button onclick="quizStep--;renderQuiz()" style="margin-top:1rem;background:transparent;border:none;color:var(--text3);font-size:12px;cursor:pointer;font-family:'Jost',sans-serif">← Anterior</button>`:''}
  </div>`;
}
function scoreMatch(c){
  const q=c.q||{};let s=0;
  if(quizAnswers.sabor==='any'||(q.sabor||[]).includes(quizAnswers.sabor))s+=2;
  if(quizAnswers.alcohol==='any'||(q.alcohol||[]).includes(quizAnswers.alcohol))s+=2;
  return s;
}
function showQuizResult(){
  // 1. Solo cócteles que el usuario puede preparar
  let pool=myIngredients.size?cocktails.filter(c=>canMake(c)):cocktails;
  if(!pool.length)pool=cocktails; // fallback si despensa vacía

  // 2. Filtro DURO por base: si el usuario eligió una base concreta,
  //    solo se muestran cócteles que la tengan
  if(quizAnswers.base!=='any'){
    const filtered=pool.filter(c=>(c.q?.base||[]).includes(quizAnswers.base));
    if(filtered.length)pool=filtered; // solo aplica si hay resultados
  }

  // 3. Puntuar por sabor y alcohol
  const scored=pool.map(c=>({c,s:scoreMatch(c)})).sort((a,b)=>b.s-a.s||Math.random()-.5);
  const top=scored[0]?.s??0,topPool=scored.filter(x=>x.s===top);
  for(let i=topPool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[topPool[i],topPool[j]]=[topPool[j],topPool[i]];}
  const picks=topPool.slice(0,3).map(x=>x.c);
  if(picks.length<3){const rest=scored.filter(x=>x.s<top);for(let i=0;picks.length<3&&i<rest.length;i++)picks.push(rest[i].c);}
  document.getElementById('quizBody').innerHTML=`<div style="padding:1.25rem;background:var(--cream)">
    <div style="text-align:center;margin-bottom:1.25rem"><div style="font-size:2rem">✨</div><div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:600;color:var(--text)">Puedes preparar esta noche</div><div style="font-size:12px;color:var(--text3);margin-top:4px">Con los ingredientes de tu despensa</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1.25rem">
      ${picks.map(c=>`<div onclick="closeQuiz();openModal(${c.id})" style="display:flex;align-items:center;gap:12px;background:var(--cream2);border:1px solid var(--border2);padding:10px 12px;cursor:pointer;border-radius:2px">
        <div style="width:48px;height:48px;flex-shrink:0;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.6rem;overflow:hidden;border-radius:2px">
          ${c.img?`<img src="${sanitize(c.img)}" style="width:100%;height:100%;object-fit:cover">`:sanitize(c.emoji||'🍸')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'Cormorant Garamond',serif;font-size:1.05rem;font-weight:600;color:var(--text)">${sanitize(c.name)}</div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px">${sanitize(c.cat)}</div>
          <div style="font-size:12px;color:var(--text2);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sanitize(c.taste||'')}</div>
        </div>
        <div style="color:var(--gold);font-size:18px">›</div>
      </div>`).join('')}
    </div>
    <button onclick="quizStep=0;quizAnswers={};renderQuiz()" class="btn btn-sm btn-full">Repetir</button>
  </div>`;
}

function startPinLockout(){
  _pinLocked=true;
  const secs=10*Math.pow(2,Math.max(0,Math.floor(_pinFailCount/3)-1));
  let remaining=secs;const errEl=document.getElementById('pinError');
  _pinBuf='';updateDots(false);
  const tick=()=>{errEl.textContent=`Bloqueado ${remaining}s`;if(remaining<=0){_pinLocked=false;errEl.textContent='';return;}remaining--;_pinLockTimer=setTimeout(tick,1000);};
  tick();
}
function openLoginPin(u){_pendingLoginUser=u;_pinBuf='';_pinTarget='login';document.getElementById('pinTitle').textContent='Hola, '+u;document.getElementById('pinSub').textContent='Introduce tu PIN';document.getElementById('pinError').textContent='';updateDots(false);document.getElementById('pinOverlay').classList.add('open');}
window.pinKey=async k=>{
  if(_pinLocked||_pinBuf.length>=4)return;
  _pinBuf+=k;updateDots(false);
  if(_pinBuf.length===4){
    const entered=_pinBuf;
    if(_pinTarget==='login'){
      const rl=await checkRate(_pendingLoginUser);
      if(!rl.ok){updateDots(true);document.getElementById('pinError').textContent=rl.msg;setTimeout(()=>{_pinBuf='';updateDots(false);},900);return;}
      const ud=await fbGet(`jimbo_users/${_pendingLoginUser}`);
      const ok=ud&&await hashEq(entered,ud.pinHash);
      if(ok){
        await clearFails(_pendingLoginUser);_pinFailCount=0;_pinLocked=false;
        document.getElementById('pinOverlay').classList.remove('open');
        await loginAs(_pendingLoginUser,ud.pinHash);
      } else {
        await recordFail(_pendingLoginUser);_pinFailCount++;updateDots(true);
        const rechk=await checkRate(_pendingLoginUser);
        if(!rechk.ok){setTimeout(()=>startPinLockout(),600);}
        else{document.getElementById('pinError').textContent='Credenciales incorrectas.';setTimeout(()=>{_pinBuf='';updateDots(false);if(!_pinLocked)document.getElementById('pinError').textContent='';},1200);}
      }
      return;
    }
    const ok=await hashEq(entered,currentUserPinHash);
    if(ok){document.getElementById('pinOverlay').classList.remove('open');document.body.style.overflow='';if(_pinTarget==='config')openConfig();_pinBuf='';}
    else{_pinFailCount++;updateDots(true);document.getElementById('pinError').textContent='Código incorrecto.';setTimeout(()=>{_pinBuf='';updateDots(false);document.getElementById('pinError').textContent='';},900);}
  }
};
window.pinDel=()=>{_pinBuf=_pinBuf.slice(0,-1);updateDots(false);document.getElementById('pinError').textContent='';};
window.pinCancel=()=>{_pinBuf='';_pinTarget=null;document.getElementById('pinError').textContent='';updateDots(false);document.getElementById('pinOverlay').classList.remove('open');document.body.style.overflow='';if(_pinLockTimer){clearTimeout(_pinLockTimer);_pinLockTimer=null;}_pinLocked=false;_pinFailCount=0;};
function updateDots(err){for(let i=0;i<4;i++){const d=document.getElementById('d'+i);d.className='pin-dot'+(i<_pinBuf.length?(err?' error':' filled'):'');}}

document.addEventListener('keydown',e=>{
  const pinVisible=document.getElementById('pinOverlay').classList.contains('open');
  if(!pinVisible)return;
  if(e.key>='0'&&e.key<='9')pinKey(e.key);
  else if(e.key==='Backspace')pinDel();
  else if(e.key==='Escape')pinCancel();
});

function loadUserScreen(){document.getElementById('userListBox').style.display='block';document.getElementById('newUserForm').style.display='none';document.getElementById('loginName').value='';}
window.loginUser=async()=>{
  const name=document.getElementById('loginName').value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const err=document.getElementById('loginErr');
  if(!name){err.textContent='Introduce un nombre de usuario.';return;}
  const rl=await checkRate(name);
  if(!rl.ok){err.textContent=rl.msg;return;}
  err.textContent='Verificando…';
  try{const ud=await fbGet(`jimbo_users/${name}`);if(!ud){await recordFail(name);err.textContent='Credenciales incorrectas.';return;}err.textContent='';openLoginPin(name);}
  catch{err.textContent='Error de conexión.';}
};
window.showNewUserForm=()=>{document.getElementById('userListBox').style.display='none';document.getElementById('newUserForm').style.display='block';['nufName','nufPin','nufPin2'].forEach(id=>document.getElementById(id).value='');document.getElementById('nufErr').textContent='';};
window.showUserList=()=>{document.getElementById('userListBox').style.display='block';document.getElementById('newUserForm').style.display='none';document.getElementById('loginName').value='';document.getElementById('loginErr').textContent='';};
window.createUser=async()=>{
  const name=document.getElementById('nufName').value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const pin=document.getElementById('nufPin').value.trim(),pin2=document.getElementById('nufPin2').value.trim();
  const err=document.getElementById('nufErr');
  if(!name||name.length<2){err.textContent='Mínimo 2 caracteres.';return;}
  if(!/^\d{4}$/.test(pin)){err.textContent='El PIN debe tener exactamente 4 dígitos.';return;}
  if(pin!==pin2){err.textContent='Los PINes no coinciden.';return;}
  if(await fbGet(`jimbo_users/${name}`)){err.textContent='Ese nombre ya está en uso.';return;}
  const h=await sha256(pin);
  await fbSet(`jimbo_users/${name}`,{pinHash:h,createdAt:Date.now()});
  await loginAs(name,h);
};
async function loginAs(username,pinHashArr){
  currentUser=username;currentUserPinHash=pinHashArr;
  setProgress(75,'Cargando tu colección…');
  document.getElementById('splashLoading').classList.remove('hidden');
  document.getElementById('userScreen').classList.add('hidden');
  try{await loadUserData();}catch{}
  try{
    const prefs=await fbGet(uPath('prefs'));
    if(prefs){if(prefs.gridSize)gridSize=prefs.gridSize;if(prefs.theme)setTheme(prefs.theme);}
  }catch{}
  setProgress(100,'¡Listo!');
  setTimeout(()=>{
    document.getElementById('splashLoading').classList.add('hidden');
    document.getElementById('app').style.display='block';
    buildChips();render();addIngRow();
    applyGridSize(gridSize);
    resetSessionTimer();
  },400);
}

async function init(){
  setProgress(50,'Preparando…');
  await new Promise(r=>setTimeout(r,150));
  setProgress(100,'Listo.');
  await new Promise(r=>setTimeout(r,150));
  document.getElementById('splashLoading').classList.add('hidden');
  document.getElementById('userScreen').classList.remove('hidden');
  loadUserScreen();
}
init();
