const MARK='[TRIAL_RESULT]'

const cleanResult=(r='')=>String(r||'').replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g,'').trim()
const marker=(outcome)=>`${MARK}|${new Date().toISOString()}|${outcome}`

function haptic(kind='tap'){
  try{
    // Supported browsers/devices get a short vibration; unsupported iOS Safari safely ignores it.
    if(navigator.vibrate){
      navigator.vibrate(kind==='success'?[18,28,28]:kind==='choice'?14:9)
    }
  }catch{}
}

function pressFeedback(btn){
  if(!btn)return
  btn.classList.remove('tf-haptic-press')
  void btn.offsetWidth
  btn.classList.add('tf-haptic-press')
  setTimeout(()=>btn.classList.remove('tf-haptic-press'),115)
}

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
  root.style.transform='scale(.992)'
  root.style.transition='opacity 80ms linear,transform 80ms ease-out'
  requestAnimationFrame(()=>setTimeout(()=>root.remove(),85))
}

export function installTrialFollowUpSpeedFix(store){
  if(window.__trialFollowUpSpeedFix)return
  window.__trialFollowUpSpeedFix=true

  const style=document.createElement('style')
  style.textContent=`
    .tf-actions button,.tf-profit-choices button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform 90ms ease,filter 90ms ease,background-color 90ms ease!important}
    .tf-actions button:active,.tf-profit-choices button:active,.tf-haptic-press{transform:scale(.965)!important;filter:brightness(.94)!important}
  `
  document.head.appendChild(style)

  // pointerdown gives instant tactile + visual acknowledgement before network work starts.
  document.addEventListener('pointerdown',e=>{
    const target=e.target?.closest?.('button')
    const root=target?.closest?.('.tf-backdrop')
    if(!target||!root)return
    if(!root.textContent?.includes('填寫試堂結果'))return

    pressFeedback(target)
    haptic('tap')

    const a=target.dataset?.a
    const profit=target.dataset?.profit

    // First-stage choices stay open because a second selection is required.
    if(a==='opened'||a==='move'||a==='no_open'){
      haptic('choice')
      return
    }

    if(a==='small'){
      haptic('success');optimisticResult(store,root,'opened_small');closeNow(root);return
    }
    if(a==='big'){
      haptic('success');optimisticResult(store,root,'opened_big');closeNow(root);return
    }
    if(a==='no_show'){
      haptic('success');optimisticResult(store,root,'no_show');closeNow(root);return
    }
    if(profit==='normal'){
      haptic('success');optimisticResult(store,root,'no_open_normal');closeNow(root);return
    }
    if(profit==='mygift'){
      haptic('success');optimisticResult(store,root,'no_open_mygift');closeNow(root);return
    }
    if(target.classList.contains('tf-save')&&root.querySelector('.tf-res.show')){
      const input=root.querySelector('.tf-res input')
      if(input?.value){
        haptic('success')
        const c=clientFromCard(store,root)
        if(c){c.trial_date=input.value;c.status='prospect';c.remark=cleanResult(c.remark)}
        closeNow(root)
      }
    }
  },true)
}
