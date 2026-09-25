import { supabase } from './supabase'

const RESULT='[TRIAL_RESULT]'
const PROFIT='[TRIAL_PROFIT:'
const NORMAL_PROFIT=44.6
const MYGIFT_PROFIT=-53.4

const cleanResult=(r='')=>String(r).replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g,'').trim()
const resultLine=(outcome)=>`${RESULT}|${new Date().toISOString()}|${outcome}`
const trialKey=(c)=>`${String(c?.id||'unknown')}:${String(c?.trial_date||'').slice(0,16)}`
const profitTag=(c)=>`${PROFIT}${trialKey(c)}]`

async function sessionEmail(){
  const {data:{session}}=await supabase.auth.getSession()
  return session?.user?.email||null
}

async function writeProfit(store,c,kind){
  const profit=kind==='mygift'?MYGIFT_PROFIT:NORMAL_PROFIT
  const tag=profitTag(c)
  if(store.transactions.some(t=>String(t?.note||'').includes(tag))) return
  const owner_email=await sessionEmail()
  if(!owner_email) throw new Error('尚未登入')
  const row={
    owner_email,
    type:'income',
    category:'試堂調整',
    amount:0,
    profit,
    note:`${tag} ${kind==='mygift'?'MyGift 試堂未開卡':'普通試堂未開卡'}`,
    client_id:c?.id||null,
    client_name:c?.name||'',
    branch:c?.branch||'',
    created_at:c?.trial_date||new Date().toISOString()
  }
  const {data,error}=await supabase.from('transactions').insert(row).select().single()
  if(error) throw error
  if(data) store.transactions.unshift(data)
}

async function saveNoOpen(store,c,kind){
  const outcome=kind==='mygift'?'no_open_mygift':'no_open_normal'
  const remark=[cleanResult(c?.remark),resultLine(outcome)].filter(Boolean).join('\n')
  const {error}=await supabase.from('clients').update({remark,status:'prospect'}).eq('id',c.id)
  if(error) throw error
  c.remark=remark
  const local=store.clients.find(x=>String(x.id)===String(c.id))
  if(local){local.remark=remark;local.status='prospect'}
  await writeProfit(store,c,kind)
}

function currentResultClient(store,root){
  const text=root?.textContent||''
  return store.clients.find(c=>c?.name&&text.includes(c.name))||null
}

function enhanceResultCard(store,root){
  if(!root||root.dataset.profitEnhanced==='1') return
  const old=root.querySelector('[data-a="no_open"]')
  if(!old) return
  root.dataset.profitEnhanced='1'
  const btn=old.cloneNode(true)
  btn.textContent='❌ 試堂後冇開卡'
  old.replaceWith(btn)
  const choices=document.createElement('div')
  choices.className='tf-profit-choices'
  choices.innerHTML='<button data-profit="normal">普通試堂 <b>+$44.6</b></button><button data-profit="mygift">MyGift <b>-$53.4</b></button>'
  btn.insertAdjacentElement('afterend',choices)
  btn.onclick=()=>choices.classList.toggle('show')
  choices.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
    const c=currentResultClient(store,root)
    if(!c)return alert('找不到這位試堂客戶，請重新開啟待辦。')
    b.disabled=true
    try{
      await saveNoOpen(store,c,b.dataset.profit)
      root.remove()
    }catch(e){b.disabled=false;alert('更新失敗：'+(e?.message||e))}
  })
}

async function syncLegacyNoOpen(store){
  for(const c of store.clients){
    const r=String(c?.remark||'')
    if(!r.includes(RESULT)||!r.includes('|no_open')) continue
    if(r.includes('|no_open_mygift')) await writeProfit(store,c,'mygift').catch(()=>{})
    else await writeProfit(store,c,'normal').catch(()=>{})
  }
}

export function installTrialFollowUpEnhance(store){
  if(document.getElementById('tf-enhance-style'))return
  const style=document.createElement('style')
  style.id='tf-enhance-style'
  style.textContent=`
    .tf-tools{bottom:118px!important;left:20px!important;gap:7px!important;transition:none!important}
    .tf-tool{padding:10px 13px!important;border-radius:16px!important;line-height:1.1!important}
    .tf-profit-choices{display:none;grid-template-columns:1fr 1fr;gap:8px;margin:-2px 0 4px}.tf-profit-choices.show{display:grid}.tf-profit-choices button{border:0;border-radius:14px;padding:13px 8px;background:#eef2ff;color:#3730a3;font-weight:900;font-size:15px}.tf-profit-choices button:last-child{background:#fff1f2;color:#be123c}
    @media(max-width:480px){.tf-tools{bottom:116px!important;left:18px!important}.tf-tool{font-size:13px!important;padding:9px 11px!important}}
  `
  document.head.appendChild(style)

  const refresh=()=>{
    const tools=document.querySelector('.tf-tools')
    if(tools) tools.style.display=store.view==='dashboard'?'flex':'none'
    document.querySelectorAll('.tf-backdrop').forEach(x=>enhanceResultCard(store,x))
  }
  refresh()
  if(store.$subscribe) store.$subscribe(()=>refresh(),{detached:true})
  const observer=new MutationObserver(()=>refresh())
  observer.observe(document.body,{childList:true,subtree:true})
  window.addEventListener('popstate',refresh)
  window.addEventListener('hashchange',refresh)
  setTimeout(()=>syncLegacyNoOpen(store),1200)
}
