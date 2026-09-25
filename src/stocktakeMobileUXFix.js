export function installStocktakeMobileUXFix(){
  if(document.getElementById('stocktake-mobile-ux-fix')) return

  const style=document.createElement('style')
  style.id='stocktake-mobile-ux-fix'
  style.textContent=`
    .stk-close{
      float:none!important;position:absolute!important;right:14px!important;top:10px!important;
      width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      border:0!important;border-radius:50%!important;background:#f1f5f9!important;color:#0f172a!important;
      font-size:21px!important;font-weight:900!important;line-height:1!important;cursor:pointer!important;
      -webkit-tap-highlight-color:transparent;touch-action:manipulation
    }
    .stk-close:active{transform:scale(.94);background:#e2e8f0!important}
    .stk-head{position:relative!important;padding-right:70px!important;min-height:44px!important;display:flex!important;align-items:center!important}
    .stk-qty{font-size:18px!important;touch-action:manipulation}
    .stk-row.stk-attention{animation:stkPulse .75s ease 2;box-shadow:0 0 0 3px rgba(239,68,68,.18)}
    .stk-block-msg{margin:9px 0 0;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#dc2626;font-weight:900;font-size:13px}
    @keyframes stkPulse{50%{transform:scale(.99);background:#fee2e2}}
  `
  document.head.appendChild(style)

  const focusQty=(input)=>{
    input.setAttribute('inputmode','numeric')
    input.setAttribute('pattern','[0-9]*')
    try{input.focus({preventScroll:true})}catch{input.focus()}
    requestAnimationFrame(()=>{try{input.select()}catch{}})
  }

  document.addEventListener('pointerdown',e=>{
    const input=e.target.closest?.('.stk-qty')
    if(input) focusQty(input)
  },true)

  document.addEventListener('focusin',e=>{
    if(e.target?.matches?.('.stk-qty')){
      e.target.setAttribute('inputmode','numeric')
      e.target.setAttribute('pattern','[0-9]*')
    }
  },true)

  document.addEventListener('click',e=>{
    const save=e.target.closest?.('.stk-save')
    if(!save) return
    const modal=save.closest('.stk-modal')
    if(!modal) return
    const pending=[...modal.querySelectorAll('.stk-row.bad,.stk-row.warn')]
    if(!pending.length) return

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    modal.querySelectorAll('.stk-row.stk-attention').forEach(x=>x.classList.remove('stk-attention'))
    const first=pending[0]
    first.classList.add('stk-attention')
    let msg=modal.querySelector('.stk-block-msg')
    if(!msg){
      msg=document.createElement('div')
      msg.className='stk-block-msg'
      save.insertAdjacentElement('beforebegin',msg)
    }
    msg.textContent=`⚠️ 尚有 ${pending.length} 款產品未確認，請先完成紅色項目。`
    first.scrollIntoView({behavior:'smooth',block:'center'})
    setTimeout(()=>first.querySelector('.stk-select')?.focus(),450)
  },true)

  const enhance=()=>{
    document.querySelectorAll('.stk-qty').forEach(input=>{
      input.setAttribute('inputmode','numeric')
      input.setAttribute('pattern','[0-9]*')
      input.setAttribute('enterkeyhint','done')
    })
    document.querySelectorAll('.stk-close').forEach(btn=>{
      btn.setAttribute('aria-label','關閉')
      btn.setAttribute('title','關閉')
    })
    document.querySelectorAll('.stk-modal').forEach(modal=>{
      const pending=modal.querySelectorAll('.stk-row.bad,.stk-row.warn').length
      if(!pending) modal.querySelector('.stk-block-msg')?.remove()
    })
  }
  enhance()
  new MutationObserver(()=>requestAnimationFrame(enhance)).observe(document.body,{childList:true,subtree:true})
}
