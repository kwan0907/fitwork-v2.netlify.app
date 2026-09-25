import { supabase } from './supabase'

const OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const OCR_LANG = ['chi_tra', 'eng']
const CODE_RE = /\b([0-9OIl]{3}[0-9A-Z])\b/i
const META_RE = /^(訂單摘要|產品編號|產品名稱|數量|您的折扣|價格為|銷售量點數|收入基數|HK\$|HKD|總計|小計)/i

const clean = (v='') => String(v).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim()
const normCode = (v='') => clean(v).toUpperCase().replace(/^O(?=\d)/,'0').replace(/(?<=\d)[OI](?=\d|[A-Z]$)/g,'1')
const normName = (v='') => clean(v).toLowerCase().replace(/[®©™@]/g,'').replace(/\d+(?:\.\d+)?\s*(克|g|kg|毫升|ml|包|粒|片|支|盒)\b/gi,'').replace(/[\s\-–—_()（）【】\[\]{}，,。.:：;；/\\+]/g,'')
const esc = (v='') => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')

function productCodes(p={}) {
  return [p.product_no,p.product_code,p.code,p.sku,p.item_no,p.stock_no,p.stock_number,p.id]
    .map(normCode).filter(Boolean).flatMap(v=>v.match(/[0-9]{3}[0-9A-Z]/g)||[])
}
function scoreName(a,b){
  a=normName(a); b=normName(b); if(!a||!b)return 0; if(a===b)return 1
  if(a.includes(b)||b.includes(a))return .92
  const grams=s=>Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2))
  const aa=grams(a), pool=grams(b); let hit=0
  aa.forEach(g=>{const i=pool.indexOf(g);if(i>=0){hit++;pool.splice(i,1)}})
  return aa.length+grams(b).length ? 2*hit/(aa.length+grams(b).length) : 0
}
function matchProduct(row,products=[]){
  const code=normCode(row.code)
  const byCode=products.find(p=>productCodes(p).includes(code))
  if(byCode)return {product:byCode,method:'產品編號',confidence:1}
  let best=null,bestScore=0
  for(const p of products){for(const n of [p.name,p.name_en,p.description,p.product_name].filter(Boolean)){const s=scoreName(row.name,n);if(s>bestScore){best=p;bestScore=s}}}
  return best&&bestScore>=.5?{product:best,method:bestScore>=.82?'產品名稱':'模糊名稱',confidence:bestScore}:{product:null,method:'未配對',confidence:bestScore}
}

function parseOrder(raw='',products=[]){
  const lines=String(raw).split(/\r?\n/).map(clean).filter(Boolean)
  const starts=[]
  lines.forEach((line,i)=>{const m=line.match(CODE_RE);if(m){const code=normCode(m[1]);if(/^[0-9]{3}[0-9A-Z]$/.test(code))starts.push({i,code,line})}})
  const rows=[]
  for(let s=0;s<starts.length;s++){
    const cur=starts[s], end=starts[s+1]?.i??lines.length
    const seg=lines.slice(cur.i,end)
    let name=clean(cur.line.replace(CODE_RE,''))
    if(!name||META_RE.test(name)||!/[A-Za-z\u3400-\u9fff]/.test(name)){
      name=seg.slice(1).find(x=>!META_RE.test(x)&&!/^HK\$?/i.test(x)&&/[A-Za-z\u3400-\u9fff]/.test(x))||''
    }
    // Quantity is normally the first standalone small integer after product name and before the first HK$ amount.
    let qty=null
    const hkIndex=seg.findIndex(x=>/^HK\$?/i.test(x)||/HK\$\s*[\d,.]+/i.test(x))
    const qtyScope=seg.slice(1,hkIndex>0?hkIndex:Math.min(seg.length,5))
    for(const x of qtyScope){
      const q=x.match(/^(?:數量\s*[:：]?\s*)?(\d{1,3})$/i)?.[1]
      if(q&&Number(q)>0&&Number(q)<=999){qty=Number(q);break}
      const inline=x.match(/(?:數量|qty|×|x)\s*[:：]?\s*(\d{1,3})\b/i)?.[1]
      if(inline){qty=Number(inline);break}
    }
    // OCR often keeps code/name/qty on one line.
    if(!qty){const after=cur.line.replace(CODE_RE,'').match(/\s(\d{1,3})\s*(?:HK\$|$)/i)?.[1];if(after)qty=Number(after)}
    const matched=matchProduct({code:cur.code,name},products)
    rows.push({code:cur.code,name,qty:qty||1,...matched})
  }
  // If OCR damaged product codes, recover by known product names in the full text.
  const found=new Set(rows.filter(r=>r.product).map(r=>r.product.name))
  for(const p of products){
    if(found.has(p.name))continue
    const n=normName(p.name); if(n.length<4)continue
    if(normName(raw).includes(n))rows.push({code:productCodes(p)[0]||'',name:p.name,qty:1,product:p,method:'產品名稱',confidence:.9})
  }
  return rows
}

function ensureOCR(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract)
  return new Promise((resolve,reject)=>{const old=document.querySelector('script[data-fitwork-tesseract]');if(old){old.addEventListener('load',()=>resolve(window.Tesseract),{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=OCR_SCRIPT;s.async=true;s.dataset.fitworkTesseract='1';s.onload=()=>resolve(window.Tesseract);s.onerror=()=>reject(new Error('OCR 元件載入失敗'));document.head.appendChild(s)})
}
async function preprocess(file){
  const bmp=await createImageBitmap(file); const maxW=2200, scale=Math.min(3,maxW/bmp.width); const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale)
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,w,h)
  const d=x.getImageData(0,0,w,h),a=d.data
  for(let i=0;i<a.length;i+=4){const g=.299*a[i]+.587*a[i+1]+.114*a[i+2];const v=g>210?255:g<90?0:Math.max(0,Math.min(255,(g-128)*1.45+128));a[i]=a[i+1]=a[i+2]=v}x.putImageData(d,0,0);return c
}

function styles(){if(document.getElementById('inv-v2-style'))return;const s=document.createElement('style');s.id='inv-v2-style';s.textContent=`.inv2-launch{width:100%;margin:8px 0 12px;padding:12px;border:1px solid #c7d2fe;border-radius:14px;background:#eef2ff;color:#4338ca;font-weight:900}.inv2-overlay{position:fixed;inset:0;z-index:13000;background:#0008;display:flex;align-items:center;justify-content:center;padding:14px}.inv2-modal{width:min(700px,100%);max-height:92dvh;background:#fff;border-radius:22px;display:flex;flex-direction:column;overflow:hidden}.inv2-head{display:flex;justify-content:space-between;align-items:center;padding:15px 16px;border-bottom:1px solid #eee}.inv2-close{border:0;background:#f1f5f9;border-radius:10px;width:36px;height:36px}.inv2-body{padding:14px;overflow:auto}.inv2-note,.inv2-progress{font-size:12px;line-height:1.5;padding:10px;border-radius:10px;background:#f8fafc;margin-bottom:10px}.inv2-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px}.inv2-actions label,.inv2-actions button{min-height:44px;border:0;border-radius:11px;font-weight:900;display:flex;align-items:center;justify-content:center;background:#4f46e2;color:#fff}.inv2-actions button{background:#0f172a}.inv2-actions input{display:none}.inv2-text{width:100%;min-height:140px;box-sizing:border-box;border:2px solid #e2e8f0;border-radius:12px;padding:10px}.inv2-row{display:grid;grid-template-columns:1fr 78px;gap:8px;padding:10px 0;border-bottom:1px solid #eee}.inv2-name{font-weight:900;font-size:13px}.inv2-src{font-size:11px;color:#64748b;margin-top:3px}.inv2-ok{font-size:10px;color:#15803d}.inv2-bad{color:#b91c1c}.inv2-qty{width:100%;height:40px;border:2px solid #cbd5e1;border-radius:9px;text-align:center;font-weight:900;font-size:17px}.inv2-foot{padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #eee}.inv2-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}.inv2-branches button{padding:8px;border:1px solid #ddd;background:#fff;border-radius:9px;font-weight:800}.inv2-branches .active{background:#eef2ff;border-color:#6366f1;color:#4338ca}.inv2-summary{text-align:center;font-size:11px;color:#64748b;margin:6px}.inv2-confirm{width:100%;min-height:48px;border:0;border-radius:12px;background:#10b981;color:#fff;font-weight:900;font-size:15px}.inv2-confirm:disabled{opacity:.4}@media(max-width:500px){.inv2-overlay{align-items:flex-end;padding:0}.inv2-modal{border-radius:22px 22px 0 0}.inv2-actions{grid-template-columns:1fr 1fr}.inv2-actions button{grid-column:1/-1}}`;document.head.appendChild(s)}

export function installInventoryOrderImportV2(store){
  styles();let btn=null,modal=null,rows=[],branch='觀塘',busy=false
  const summary=()=>{if(!modal)return;const m=rows.filter(r=>r.product),q=m.reduce((a,r)=>a+(+r.qty||0),0);modal.querySelector('.inv2-summary').textContent=`已配對 ${m.length} 款／${q} 件${rows.length-m.length?` · ${rows.length-m.length} 款未配對`:''}`;modal.querySelector('.inv2-confirm').disabled=busy||!m.length}
  const render=()=>{if(!modal)return;const box=modal.querySelector('.inv2-preview');box.innerHTML=rows.length?rows.map((r,i)=>`<div class="inv2-row" data-i="${i}"><div><div class="inv2-name">${r.product?esc(r.product.name):'⚠️ 未找到對應產品'}</div><div class="inv2-src">${esc(r.code)} · ${esc(r.name)}</div><div class="inv2-ok ${r.product?'':'inv2-bad'}">${r.product?'✓ '+esc(r.method):'需要手動處理'}</div></div><input class="inv2-qty" type="number" min="1" max="999" value="${r.qty}"></div>`).join(''):'<div class="inv2-note">尚未辨識到產品。</div>';box.querySelectorAll('.inv2-qty').forEach(x=>x.oninput=()=>{const i=+x.closest('.inv2-row').dataset.i;rows[i].qty=Math.max(1,Math.min(999,+x.value||1));summary()});summary()}
  const parse=()=>{rows=parseOrder(modal.querySelector('.inv2-text').value,store.products||[]);render();modal.querySelector('.inv2-progress').textContent=rows.length?'✅ 已重新分析文字，請核對數量。':'⚠️ 找不到產品。請保留產品編號、名稱和數量。'}
  const ocr=async file=>{if(!file||busy)return;busy=true;summary();const p=modal.querySelector('.inv2-progress');p.textContent='📷 正在優化圖片…';try{const T=await ensureOCR(),img=await preprocess(file);const worker=await T.createWorker(OCR_LANG,1,{logger:m=>{if(m.status==='recognizing text')p.textContent=`🔎 圖片辨識 ${Math.round((m.progress||0)*100)}%`}});const out=await worker.recognize(img);await worker.terminate();const text=out?.data?.text||'';modal.querySelector('.inv2-text').value=text;rows=parseOrder(text,store.products||[]);render();p.textContent=rows.length?'✅ 圖片完成。已用產品編號優先配對，請核對數量後入庫。':'⚠️ 圖片已讀取但未找到產品。建議改用「複製文字」貼上，準確度最高。'}catch(e){console.error(e);p.textContent='❌ 圖片辨識失敗：'+(e?.message||'未知錯誤')}finally{busy=false;summary()}}
  const close=()=>{modal?.remove();modal=null;document.documentElement.style.overflow=''}
  const confirmImport=async()=>{const matched=rows.filter(r=>r.product&&+r.qty>0);if(!matched.length||busy)return;if(!confirm(`確認將 ${matched.length} 款／${matched.reduce((a,r)=>a+(+r.qty||0),0)} 件加入「${branch}」庫存？`))return;busy=true;summary();try{const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('登入狀態已失效');const fail=[];for(const r of matched){const name=r.product.name,qty=+r.qty;const {data,error}=await supabase.from('stock').select('quantity').eq('prod_name',name).eq('branch',branch).eq('user_id',user.id).maybeSingle();if(error){fail.push(name);continue}const quantity=(+data?.quantity||0)+qty;const res=data?await supabase.from('stock').update({quantity,own_email:user.email}).eq('prod_name',name).eq('branch',branch).eq('user_id',user.id):await supabase.from('stock').insert({prod_name:name,branch,quantity,user_id:user.id,own_email:user.email});if(res.error)fail.push(name)}await store.syncAll();if(fail.length)alert(`⚠️ ${fail.length} 款入庫失敗，其他已完成。`);else{alert('✅ 快速入庫完成');close()}}catch(e){alert('❌ 入庫失敗：'+e.message)}finally{busy=false;summary()}}
  const open=()=>{if(modal)return;branch=document.querySelector('.branch-tabs button.active')?.textContent?.includes('中環')?'中環':document.querySelector('.branch-tabs button.active')?.textContent?.includes('佐敦')?'佐敦':'觀塘';modal=document.createElement('div');modal.className='inv2-overlay';modal.innerHTML=`<div class="inv2-modal"><div class="inv2-head"><b>📦 訂單快速入庫</b><button class="inv2-close">✕</button></div><div class="inv2-body"><div class="inv2-note">建議優先直接貼上訂單「複製文字」；長文字亦可。系統會以產品編號分段，不再受價格、VP、收入基數干擾。圖片會先放大、灰階及加強對比再 OCR。</div><div class="inv2-actions"><label>📷 拍照<input class="inv2-camera" type="file" accept="image/*" capture="environment"></label><label>🖼️ 相簿<input class="inv2-library" type="file" accept="image/*"></label><button class="inv2-parse">✨ 分析文字</button></div><div class="inv2-progress">等待輸入…</div><textarea class="inv2-text" placeholder="直接貼上完整訂單文字，不需要刪走價格或其他內容…"></textarea><div class="inv2-preview"></div></div><div class="inv2-foot"><div class="inv2-branches">${['觀塘','中環','佐敦'].map(b=>`<button data-b="${b}" class="${b===branch?'active':''}">${b}</button>`).join('')}</div><div class="inv2-summary">尚未有項目</div><button class="inv2-confirm" disabled>✅ 確認加入庫存</button></div></div>`;document.body.appendChild(modal);document.documentElement.style.overflow='hidden';modal.querySelector('.inv2-close').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};modal.querySelector('.inv2-parse').onclick=parse;modal.querySelector('.inv2-text').onpaste=()=>setTimeout(parse,0);modal.querySelector('.inv2-camera').onchange=e=>ocr(e.target.files?.[0]);modal.querySelector('.inv2-library').onchange=e=>ocr(e.target.files?.[0]);modal.querySelectorAll('[data-b]').forEach(x=>x.onclick=()=>{branch=x.dataset.b;modal.querySelectorAll('[data-b]').forEach(y=>y.classList.toggle('active',y===x))});modal.querySelector('.inv2-confirm').onclick=confirmImport}
  const mount=()=>{const ok=document.querySelector('#app-main')&&store.view==='inventory';if(!ok){btn?.remove();btn=null;return}if(btn?.isConnected)return;const bar=document.querySelector('.content .filter-bar');if(!bar)return;btn=document.createElement('button');btn.className='inv2-launch';btn.textContent='📦 訂單圖片／文字快速入庫';btn.onclick=open;bar.insertAdjacentElement('beforebegin',btn)}
  store.$subscribe(()=>requestAnimationFrame(mount));new MutationObserver(()=>requestAnimationFrame(mount)).observe(document.getElementById('app'),{childList:true,subtree:true});requestAnimationFrame(mount)
}
