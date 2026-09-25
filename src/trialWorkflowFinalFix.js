import { supabase } from './supabase'

const RESULT='[TRIAL_RESULT]'
const PROFIT='[TRIAL_PROFIT:'
const NORMAL_PROFIT=44.6
const MYGIFT_PROFIT=-53.4
const MONTH_KEY='fitwork_trial_batch_month'
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g,'')
const cleanResult=(r='')=>String(r||'').replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g,'').trim()
const esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
const resultLine=(outcome,when,extra='')=>`${RESULT}|${when||new Date().toISOString()}|${outcome}${extra?'|'+extra:''}`
const trialKey=c=>`${String(c?.id||'unknown')}:${String(c?.trial_date||'').slice(0,16)}`

function monthOptions(){
  const now=new Date(),out=[]
  for(let i=0;i<24;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1)
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    out.push(`<option value="${v}">${d.getFullYear()}年${d.getMonth()+1}月</option>`)
  }
  return out.join('')
}
function parseTSV(text){
  const rows=[];let row=[],cell='',q=false;const s=String(text||'').replace(/\r\n?/g,'\n')
  for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'){if(q&&s[i+1]==='"'){cell+='"';i++}else q=!q}else if(ch==='\t'&&!q){row.push(cell);cell=''}else if(ch==='\n'&&!q){row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=''}else cell+=ch}
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);return rows
}
function parseExcel(text){
  return parseTSV(text).map(cols=>{while(cols.length<7)cols.push('');const day=parseInt(String(cols[0]||'').trim(),10),branch=String(cols[1]||'').trim();let name=String(cols[5]||'').replace(/\s*\n\s*/g,' & ').replace(/\s+/g,' ').trim();const item=String(cols[6]||'').replace(/\s+/g,' ').trim();const pm=(name+' '+item).match(/(?:\+?852[\s-]?)?[2-9]\d{3}[\s-]?\d{4}/);const phone=pm?pm[0].replace(/\D/g,'').replace(/^852(?=\d{8}$)/,''):'';name=name.replace(pm?.[0]||'','').replace(/[+·,，]\s*$/,'').trim();const keep=/(廣告)?試堂\s*(未開卡|冇開卡)|試堂後\s*(未開卡|冇開卡)/.test(item);return{day:isNaN(day)?null:day,branch,name,phone,item,keep,kind:'normal',referrer:''}}).filter(r=>r.name||r.item)
}
function bestClient(store,r){const p=norm(r.phone),n=norm(r.name);if(p){const x=store.clients.find(c=>norm(c.phone)===p);if(x)return x}if(n){const exact=store.clients.find(c=>norm(c.name)===n);if(exact)return exact;const near=store.clients.filter(c=>{const cn=norm(c.name);return cn&&n.length>=4&&(cn.includes(n)||n.includes(cn))});if(near.length===1)return near[0]}return null}
function dateFor(month,day){const [y,m]=String(month).split('-').map(Number);const last=new Date(y,m,0).getDate(),d=Math.max(1,Math.min(last,+day||1));return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T12:00`}
async function sessionEmail(){const {data:{session}}=await supabase.auth.getSession();return session?.user?.email||null}
async function writeProfit(store,c,kind){const tag=`${PROFIT}${trialKey(c)}]`;if(store.transactions.some(t=>String(t?.note||'').includes(tag)))return;const owner_email=await sessionEmail();if(!owner_email)throw new Error('尚未登入');const profit=kind==='mygift'?MYGIFT_PROFIT:NORMAL_PROFIT;const row={owner_email,type:'income',category:'試堂調整',amount:0,profit,note:`${tag} ${kind==='mygift'?'MyGift 試堂未開卡':'普通試堂未開卡'}`,client_id:c?.id||null,client_name:c?.name||'',branch:c?.branch||'',created_at:c?.trial_date||new Date().toISOString()};const {data,error}=await supabase.from('transactions').insert(row).select().single();if(error)throw error;if(data)store.transactions.unshift(data)}
async function saveRow(store,r,month){const dt=dateFor(month,r.day),stamp=new Date(dt).toISOString(),found=bestClient(store,r),outcome=r.kind==='mygift'?'no_open_mygift':'no_open_normal',extra=r.referrer?`referrer=${r.referrer}`:'';if(found){const patch={trial_date:dt,branch:r.branch||found.branch||'觀塘',remark:[cleanResult(found.remark),resultLine(outcome,stamp,extra)].filter(Boolean).join('\n'),status:'prospect'};const {error}=await supabase.from('clients').update(patch).eq('id',found.id);if(error)throw error;Object.assign(found,patch);await writeProfit(store,found,r.kind);return}const owner_email=await sessionEmail();const row={name:r.name||r.phone,phone:r.phone||null,branch:r.branch||'觀塘',source:r.kind==='mygift'?'朋友介紹 / MyGift':'廣告',status:'prospect',join_date:dt.slice(0,10),trial_date:dt,remark:resultLine(outcome,stamp,extra),owner_email};const {data,error}=await supabase.from('clients').insert(row).select().single();if(error)throw error;if(data){store.clients.unshift(data);await writeProfit(store,data,r.kind)}}
function refOptions(store){const names=[...new Set(store.clients.map(c=>String(c.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-HK'));return `<option value="">請選擇介紹人</option>`+names.map(n=>`<option>${esc(n)}</option>`).join('')}

function upgradeDirectBatch(store,root){
  if(root.dataset.finalBatch==='1'||!root.textContent?.includes('補回試堂記錄'))return
  const smart=root.querySelector('.tf-smart'),textarea=root.querySelector('[data-excel]'),analyse=root.querySelector('[data-analyse]'),save=root.querySelector('.tf-batch-save')
  if(!smart||!textarea||!analyse||!save)return
  root.dataset.finalBatch='1'
  const controls=document.createElement('div');controls.className='tf-final-controls';controls.innerHTML=`<div><label>📅 補回紀錄月份</label><select data-final-month>${monthOptions()}</select></div><div><label>預設來源</label><select data-final-default><option value="normal">廣告（+$44.6）</option><option value="mygift">朋友介紹 / MyGift（-$53.4）</option></select></div>`
  smart.parentNode.insertBefore(controls,smart)
  const month=controls.querySelector('[data-final-month]'),saved=localStorage.getItem(MONTH_KEY)||currentMonth();month.value=saved;month.onchange=()=>localStorage.setItem(MONTH_KEY,month.value)
  const enrich=()=>setTimeout(()=>{
    const rows=parseExcel(textarea.value).filter(r=>r.keep),def=controls.querySelector('[data-final-default]').value
    root.__finalRows=rows
    root.querySelectorAll('.tf-batch-row').forEach((el,i)=>{const r=rows[i];if(!r)return;r.kind=def;if(el.querySelector('[data-final-kind]'))return;const box=document.createElement('div');box.className='tf-final-row-controls';box.innerHTML=`<select data-final-kind><option value="normal">廣告（+$44.6）</option><option value="mygift">朋友介紹 / MyGift（-$53.4）</option></select><div data-final-ref style="display:none"><select data-final-referrer>${refOptions(store)}</select></div>`;el.appendChild(box);const kind=box.querySelector('[data-final-kind]'),ref=box.querySelector('[data-final-ref]');kind.value=def;kind.onchange=()=>{r.kind=kind.value;ref.style.display=kind.value==='mygift'?'block':'none'};kind.onchange()})
  },0)
  analyse.addEventListener('click',enrich)
  save.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()
    const rows=root.__finalRows||parseExcel(textarea.value).filter(r=>r.keep);if(!rows.length)return alert('未找到試堂未開卡記錄')
    root.querySelectorAll('.tf-batch-row').forEach((el,i)=>{if(!rows[i])return;rows[i].branch=el.querySelector('[data-branch]')?.value||rows[i].branch;rows[i].kind=el.querySelector('[data-final-kind]')?.value||'normal';rows[i].referrer=el.querySelector('[data-final-referrer]')?.value||''})
    for(const r of rows){if(r.kind==='mygift'&&!r.referrer)return alert(`請先選擇 ${r.name} 的介紹人`)}
    if(!confirm(`確認補回 ${month.value} 共 ${rows.length} 筆試堂未開卡？`))return
    save.disabled=true;save.textContent='儲存中…';let ok=0,fail=0
    for(const r of rows){try{await saveRow(store,r,month.value);ok++}catch{fail++}}
    save.disabled=false;save.textContent=`完成：成功 ${ok} · 失敗 ${fail}`
    if(!fail)setTimeout(()=>root.remove(),450)
  },true)
}

function fixToolVisibility(store){
  const tools=document.querySelector('.tf-tools');if(!tools)return
  const authenticated=Boolean(document.querySelector('#app-main'))
  tools.style.display=authenticated&&store.view==='dashboard'?'flex':'none'
}
function installInstantClose(){
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('button'),root=btn?.closest?.('.tf-backdrop');if(!btn||!root||!root.textContent?.includes('填寫試堂結果'))return
    const a=btn.dataset?.a,profit=btn.dataset?.profit
    const final=a==='small'||a==='big'||(a==='no_show'&&btn.dataset.confirmReady==='1')||profit==='normal'||profit==='mygift'||(btn.classList.contains('tf-save')&&root.querySelector('.tf-res.show'))
    if(final)setTimeout(()=>{if(root.isConnected){root.style.opacity='0';root.style.pointerEvents='none'}},0)
  },true)
}

export function installTrialWorkflowFinalFix(store){
  if(window.__trialWorkflowFinalFix)return;window.__trialWorkflowFinalFix=true
  const style=document.createElement('style');style.textContent=`.tf-final-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#eef2ff;border:2px solid #6366f1;border-radius:16px;padding:12px;margin:10px 0}.tf-final-controls label{display:block;font-size:13px;font-weight:900;color:#312e81;margin-bottom:6px}.tf-final-controls select,.tf-final-row-controls select{width:100%;min-height:46px;border:1px solid #c7d2fe;border-radius:12px;background:#fff;padding:9px;font-size:15px;font-weight:800}.tf-final-row-controls{display:grid;gap:7px;margin-top:8px}@media(max-width:480px){.tf-final-controls{grid-template-columns:1fr}}`;document.head.appendChild(style)
  installInstantClose()
  const refresh=()=>{fixToolVisibility(store);document.querySelectorAll('.tf-backdrop').forEach(root=>upgradeDirectBatch(store,root))}
  refresh();store.$subscribe?.(()=>refresh(),{detached:true});new MutationObserver(refresh).observe(document.getElementById('app'),{childList:true,subtree:true});new MutationObserver(refresh).observe(document.body,{childList:true,subtree:false});window.addEventListener('focus',refresh)
}
