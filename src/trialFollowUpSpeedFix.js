const MARK='[TRIAL_RESULT]'

const cleanResult=(r='')=>String(r||'').replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g,'').trim()
const marker=(outcome)=>`${MARK}|${new Date().toISOString()}|${outcome}`

function haptic(kind='tap'){
  try{
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

function installTapShield(){
  let shield=document.getElementById('tf-tap-shield')
  if(!shield){
    shield=document.createElement('div')
    shield.id='tf-tap-shield'
    shield.setAttribute('aria-hidden','true')
    document.body.appendChild(shield)
  }
  shield.classList.add('on')
  clearTimeout(window.__tfShieldTimer)
  window.__tfShieldTimer=setTimeout(()=>shield.classList.remove('on'),520)
}

function markProcessing(btn,label='處理中…'){
  if(!btn)return
  btn.dataset.originalText=btn.dataset.originalText||btn.textContent
  btn.classList.add('tf-processing')
  btn.textContent=`✓ ${label}`
}

function armConfirm(btn,label){
  if(!btn)return false
  if(btn.dataset.confirmArmed==='1'){
    btn.dataset.confirmReady='1'
    return true
  }
  btn.dataset.confirmArmed='1'
  btn.dataset.originalText=btn.textContent
  btn.textContent=`再按一次確認：${label}`
  btn.classList.add('tf-confirm-armed')
  haptic('choice')
  setTimeout(()=>{
    if(btn?.isConnected&&btn.dataset.confirmReady!=='1'){
      btn.dataset.confirmArmed=''
      btn.textContent=btn.dataset.originalText||label
      btn.classList.remove('tf-confirm-armed')
    }
  },5000)
  return false
}

export function installTrialFollowUpSpeedFix(store){
  if(window.__trialFollowUpSpeedFix)return
  window.__trialFollowUpSpeedFix=true

  const style=document.createElement('style')
  style.textContent=`
    .tf-actions button,.tf-profit-choices button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform 90ms ease,filter 90ms ease,background-color 90ms ease!important}
    .tf-actions button:active,.tf-profit-choices button:active,.tf-haptic-press{transform:scale(.965)!important;filter:brightness(.94)!important}
    .tf-confirm-armed{background:#fff7ed!important;border-color:#fb923c!important;color:#c2410c!important;box-shadow:0 0 0 3px #fed7aa!important}
    .tf-processing{pointer-events:none!important;opacity:.78!important;filter:saturate(.8)!important}
    #tf-tap-shield{position:fixed;inset:0;z-index:99989;display:none;background:transparent;pointer-events:none;touch-action:none}
    #tf-tap-shield.on{display:block;pointer-events:all}
  `
  document.head.appendChild(style)

  // Capture click before the original handlers. First tap on destructive/ambiguous actions only arms confirmation.
  document.addEventListener('click',e=>{
    const target=e.target?.closest?.('button')
    const root=target?.closest?.('.tf-backdrop')
    if(!target||!root||!root.textContent?.includes('填寫試堂結果'))return

    const a=target.dataset?.a
    if(a==='no_show'&&target.dataset.confirmReady!=='1'){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()
      return
    }

    // Final actions get a temporary invisible shield. It survives the modal removal and blocks tap-through.
    const isFinal=a==='small'||a==='big'||a==='no_show'||target.dataset?.profit==='normal'||target.dataset?.profit==='mygift'||(target.classList.contains('tf-save')&&root.querySelector('.tf-res.show'))
    if(isFinal){
      installTapShield()
      markProcessing(target,'已確認，儲存中…')
    }
  },true)

  document.addEventListener('pointerdown',e=>{
    const target=e.target?.closest?.('button')
    const root=target?.closest?.('.tf-backdrop')
    if(!target||!root||!root.textContent?.includes('填寫試堂結果'))return

    pressFeedback(target)
    haptic('tap')

    const a=target.dataset?.a
    const profit=target.dataset?.profit

    // 開卡、未開卡、改期本身已經有第二步：卡種 / 利潤來源 / 新日期確認。
    if(a==='opened'||a==='move'||a==='no_open'){
      haptic('choice')
      return
    }

    // 冇出席原本只有一步，所以改成真正「按兩次」才執行。
    if(a==='no_show'){
      if(!armConfirm(target,'冇出席'))return
      haptic('success')
      optimisticResult(store,root,'no_show')
      return
    }

    if(a==='small'){
      haptic('success');optimisticResult(store,root,'opened_small');return
    }
    if(a==='big'){
      haptic('success');optimisticResult(store,root,'opened_big');return
    }
    if(profit==='normal'){
      haptic('success');optimisticResult(store,root,'no_open_normal');return
    }
    if(profit==='mygift'){
      haptic('success');optimisticResult(store,root,'no_open_mygift');return
    }
    if(target.classList.contains('tf-save')&&root.querySelector('.tf-res.show')){
      const input=root.querySelector('.tf-res input')
      if(input?.value){
        haptic('success')
        const c=clientFromCard(store,root)
        if(c){c.trial_date=input.value;c.status='prospect';c.remark=cleanResult(c.remark)}
      }
    }
  },true)
}
