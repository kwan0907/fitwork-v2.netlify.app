const MONTH_KEY='fitwork_trial_batch_month'

function currentMonth(){
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function options(){
  const now=new Date(),out=[]
  for(let offset=-3;offset<=24;offset++){
    const d=new Date(now.getFullYear(),now.getMonth()-offset,1)
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    out.push(`<option value="${v}">${d.getFullYear()}年${d.getMonth()+1}月</option>`)
  }
  return out.join('')
}

function ensureMonth(panel){
  if(!panel)return null
  let select=panel.querySelector('[data-v2-month]')
  if(!select){
    const bar=document.createElement('div')
    bar.className='tf-month-fix'
    bar.innerHTML=`<label>📅 補回紀錄月份 <span>Excel 只有「日」時，會用這個月份建立試堂日期</span></label><select data-v2-month>${options()}</select>`
    const smart=panel.querySelector('.tf-smart')
    if(smart)panel.insertBefore(bar,smart)
    else panel.prepend(bar)
    select=bar.querySelector('[data-v2-month]')
  }else{
    const holder=select.closest('div')
    if(holder){
      holder.classList.add('tf-month-fix')
      const label=holder.querySelector('label')
      if(label)label.innerHTML='📅 補回紀錄月份 <span>Excel 只有「日」時，會用這個月份建立試堂日期</span>'
    }
  }
  const saved=localStorage.getItem(MONTH_KEY)||currentMonth()
  if([...select.options].some(o=>o.value===saved))select.value=saved
  if(select.dataset.monthBound!=='1'){
    select.dataset.monthBound='1'
    select.addEventListener('change',()=>localStorage.setItem(MONTH_KEY,select.value))
  }
  return select
}

function installOne(root){
  const v2=root.querySelector('.tf-batch-v2')
  const legacy=root.querySelector('.tf-batch')
  if(v2){
    ensureMonth(v2)
    // If the user opened the old Excel panel before the V2 enhancer finished loading,
    // move them to the real V2 panel so the month/source/referrer controls are visible
    // and, importantly, the selected month is the one used by the V2 save logic.
    if(legacy?.classList.contains('on')||legacy?.style.display==='block'){
      legacy.classList.remove('on')
      legacy.style.display='none'
      v2.style.display='block'
      const tabs=root.querySelectorAll('.tf-tab')
      tabs.forEach(t=>t.classList.toggle('on',t.dataset.tab==='batch'))
      const single=root.querySelector('.tf-single')
      if(single)single.classList.add('off')
    }
    return
  }
  // Temporary visual fallback while V2 is being mounted. Once V2 appears,
  // MutationObserver below automatically switches to it.
  if(legacy)ensureMonth(legacy)
}

export function installTrialBatchMonthFix(){
  if(!document.getElementById('tf-month-fix-style')){
    const s=document.createElement('style')
    s.id='tf-month-fix-style'
    s.textContent=`
      .tf-month-fix{display:block!important;width:100%!important;grid-column:1/-1!important;background:#eef2ff!important;border:2px solid #6366f1!important;border-radius:16px!important;padding:12px!important;margin:8px 0 12px!important;box-sizing:border-box!important}
      .tf-month-fix label{display:block!important;font-size:15px!important;font-weight:900!important;color:#312e81!important;margin:0 0 8px!important}
      .tf-month-fix label span{display:block!important;font-size:12px!important;font-weight:700!important;color:#64748b!important;margin-top:3px!important}
      .tf-month-fix select{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;min-height:50px!important;margin:0!important;padding:10px 12px!important;border:1px solid #c7d2fe!important;border-radius:12px!important;background:#fff!important;color:#111827!important;font-size:16px!important;font-weight:800!important}
    `
    document.head.appendChild(s)
  }
  const run=()=>document.querySelectorAll('.tf-backdrop').forEach(installOne)
  run()
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true})
}
