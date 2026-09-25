const MONTH_KEY='fitwork_trial_batch_month'

function currentMonth(){
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function options(){
  const now=new Date(),out=[]
  for(let i=-3;i<24;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1)
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    out.push(`<option value="${v}">${d.getFullYear()}年${d.getMonth()+1}月</option>`)
  }
  return out.join('')
}

function installOne(root){
  const panel=root.querySelector('.tf-batch-v2')
  if(!panel||panel.dataset.monthFixed==='1')return
  panel.dataset.monthFixed='1'

  let select=panel.querySelector('[data-v2-month]')
  if(!select){
    const bar=document.createElement('div')
    bar.className='tf-month-fix'
    bar.innerHTML=`<label>📅 補回紀錄月份 <span>Excel 只有「日」時會套用這個月份</span></label><select data-v2-month>${options()}</select>`
    panel.prepend(bar)
    select=bar.querySelector('[data-v2-month]')
  }else{
    const holder=select.closest('div')
    if(holder){
      holder.classList.add('tf-month-fix')
      const label=holder.querySelector('label')
      if(label)label.innerHTML='📅 補回紀錄月份 <span>Excel 只有「日」時會套用這個月份</span>'
    }
  }

  const saved=localStorage.getItem(MONTH_KEY)||currentMonth()
  if([...select.options].some(o=>o.value===saved))select.value=saved
  select.addEventListener('change',()=>localStorage.setItem(MONTH_KEY,select.value))
}

export function installTrialBatchMonthFix(){
  if(!document.getElementById('tf-month-fix-style')){
    const s=document.createElement('style')
    s.id='tf-month-fix-style'
    s.textContent=`
      .tf-batch-v2 .tf-month-fix{display:block!important;width:100%!important;grid-column:1/-1!important;background:#eef2ff!important;border:2px solid #6366f1!important;border-radius:16px!important;padding:12px!important;margin:8px 0 12px!important;box-sizing:border-box!important}
      .tf-batch-v2 .tf-month-fix label{display:block!important;font-size:15px!important;font-weight:900!important;color:#312e81!important;margin:0 0 8px!important}
      .tf-batch-v2 .tf-month-fix label span{display:block!important;font-size:12px!important;font-weight:700!important;color:#64748b!important;margin-top:3px!important}
      .tf-batch-v2 .tf-month-fix select{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;min-height:48px!important;margin:0!important;padding:10px 12px!important;border:1px solid #c7d2fe!important;border-radius:12px!important;background:#fff!important;color:#111827!important;font-size:16px!important;font-weight:800!important}
    `
    document.head.appendChild(s)
  }
  const run=()=>document.querySelectorAll('.tf-backdrop').forEach(installOne)
  run()
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true})
}
