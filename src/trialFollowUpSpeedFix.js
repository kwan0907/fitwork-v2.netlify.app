const MARK='[TRIAL_RESULT]'

const cleanResult=(r='')=>String(r||'').replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g,'').trim()
const marker=(outcome)=>`${MARK}|${new Date().toISOString()}|${outcome}`

function clientFromCard(store,root){
  const text=root?.textContent||''
  const candidates=(store.clients||[]).filter(c=>c?.name&&text.includes(c.name))
  if(candidates.length===1)return candidates[0]
  const phone=(text.match(/(?:\+?852\s*)?[2-9]\d{3}\s*\d{4}/)||[])[0]?.replace(/\D/g,'').replace(/^852(?=\d{8}$)/,'')
  if(phone){const hit=candidates.find(c=>String(c.phone||'').replace(/\D/g,'').replace(/^852(?=\d{8}$)/,'')===phone);if(hit)return hit}
  return candidates[0]||null
}

function optimisticResult(store,root,outcome){
  const c=clientFromCard(store,root)
  if(!c)return
  const patch={remark:[cleanResult(c.remark),marker(outcome)].filter(Boolean).join('\n')}
  if(outcome==='no_show')patch.status='absent'
  if(outcome.startsWith('opened_'))patch.status='active'
  Object.assign(c,patch)
  const local=(store.clients||[]).find(x=>String(x.id)===String(c.id))
  if(local&&local!==c)Object.assign(local,patch)
}

function closeNow(root){
  if(!root||root.dataset.fastClosing==='1')return
  root.dataset.fastClosing='1'
  root.style.pointerEvents='none'
  root.style.opacity='0'
  root.style.transition='opacity 80ms linear'
  requestAnimationFrame(()=>setTimeout(()=>root.remove(),85))
}

export function installTrialFollowUpSpeedFix(store){
  if(window.__trialFollowUpSpeedFix)return
  window.__trialFollowUpSpeedFix=true

  // Use pointerdown so the UI reacts before Supabase/network work starts.
  document.addEventListener('pointerdown',e=>{
    const target=e.target?.closest?.('button')
    const root=target?.closest?.('.tf-backdrop')
    if(!target||!root)return
    if(!root.textContent?.includes('填寫試堂結果'))return

    const a=target.dataset?.a
    const profit=target.dataset?.profit

    // These first-stage buttons intentionally stay open because another choice is required.
    if(a==='opened'||a==='move'||a==='no_open')return

    if(a==='small'){
      optimisticResult(store,root,'opened_small')
      closeNow(root)
      return
    }
    if(a==='big'){
      optimisticResult(store,root,'opened_big')
      closeNow(root)
      return
    }
    if(a==='no_show'){
      optimisticResult(store,root,'no_show')
      closeNow(root)
      return
    }
    if(profit==='normal'){
      optimisticResult(store,root,'no_open_normal')
      closeNow(root)
      return
    }
    if(profit==='mygift'){
      optimisticResult(store,root,'no_open_mygift')
      closeNow(root)
      return
    }
    // Confirming a rescheduled date should also feel immediate. The original handler
    // still performs the actual database write after this visual close.
    if(target.classList.contains('tf-save')&&root.querySelector('.tf-res.show')){
      const input=root.querySelector('.tf-res input')
      if(input?.value){
        const c=clientFromCard(store,root)
        if(c){c.trial_date=input.value;c.status='prospect';c.remark=cleanResult(c.remark)}
        closeNow(root)
      }
    }
  },true)
}
