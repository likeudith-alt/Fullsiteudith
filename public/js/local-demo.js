/* LOCAL-ONLY DEMO STORAGE. Not secure or suitable for real-money wallets.
   Data lives in this browser/device only and can be edited/cleared by its owner. */
(() => {
  'use strict';
  const K='udiya_demo_v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(K))||{customers:[],deposits:[],orders:[],transactions:[],data:null,freeLikes:[]}}catch{return {customers:[],deposits:[],orders:[],transactions:[],data:null,freeLikes:[]}}};
  const write=d=>{try{localStorage.setItem(K,JSON.stringify(d));return true}catch(e){throw Error('Browser storage is full. Remove large uploaded images or clear old demo data.')}};
  const id=p=>p+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
  const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
  const hash=async s=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
  const original=window.fetch.bind(window);
  window.fetch=async (input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    if(!url.startsWith('/api/'))return original(input,options);
    const method=(options.method||'GET').toUpperCase();let body={};try{body=options.body?JSON.parse(options.body):{}}catch{}
    const db=read(), now=()=>new Date().toISOString();
    const token=(options.headers?.authorization||'').replace(/^Bearer\s+/i,'')||sessionStorage.getItem('udithAdminToken')||'';
    const customer=db.customers.find(c=>c.session===(token||localStorage.getItem('udiya_customer_session'))), admin=token==='LOCAL-DEMO-ADMIN';
    try{
      if(url.startsWith('/api/data'))return response(db.data?db.data:{empty:true});
      if(url.startsWith('/api/save')&&method==='POST'){db.data=body;write(db);return response({data:db.data});}
      if(url.startsWith('/api/login')&&method==='POST'){if(body.password!=='ChangeMe123!')return response({error:'Demo admin password is ChangeMe123! Change it in local-demo.js before use.'},401);return response({token:'LOCAL-DEMO-ADMIN'});}
      if(url.startsWith('/api/upload')&&method==='POST'){if(!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(body.dataUrl||''))return response({error:'Only image files are supported.'},400);if(body.dataUrl.length>3_000_000)return response({error:'Image is too large. Use a smaller image.'},413);return response({url:body.dataUrl});}
      if(url.startsWith('/api/free-likes-admin')){if(!admin)return response({error:'Admin login required'},401);if(method==='GET')return response({requests:db.freeLikes});const x=db.freeLikes.find(v=>v.id===body.id);if(x){if(body.status)x.status=body.status;else db.freeLikes=db.freeLikes.filter(v=>v!==x);write(db)}return response({ok:true});}
      if(url.startsWith('/api/free-likes')&&method==='POST'){const x={id:id('FL'),gameUid:body.gameUid,username:'Guest',status:'Pending',createdAt:now()};db.freeLikes.unshift(x);write(db);return response({request:x});}
      if(url.startsWith('/api/shop')){
        const action=new URL(url,location.origin).searchParams.get('action');
        if(action==='auth'&&method==='POST'){
          const phone=String(body.phone||'').trim(),password=String(body.password||'');if(!/^\+?[0-9]{8,16}$/.test(phone)||password.length<8)return response({error:'Enter a valid phone number and password (8+ characters).'},400);
          let c=db.customers.find(x=>x.phone===phone);if(body.mode==='register'){if(c)return response({error:'An account already exists for this number.'},409);c={customerId:id('UDC'),phone,passwordHash:await hash(password),balance:0,transactions:[],orders:[],deposits:[],created_at:now()};db.customers.push(c)}else if(!c||c.passwordHash!==await hash(password))return response({error:'Incorrect phone number or password.'},401);
          c.session=id('SESSION');localStorage.setItem('udiya_customer_session',c.session);write(db);return response({customer:{customerId:c.customerId,phone:c.phone}});
        }
        if(action==='logout'&&method==='POST'){if(customer){customer.session='';write(db)}localStorage.removeItem('udiya_customer_session');return response({ok:true});}
        if(action==='me'){if(!customer)return response({error:'Please log in'},401);return response({customer:{customerId:customer.customerId,phone:customer.phone},balance:customer.balance,transactions:customer.transactions,orders:customer.orders,deposits:customer.deposits});}
        if(action==='deposit'&&method==='POST'){if(!customer)return response({error:'Please log in'},401);if(!Number.isSafeInteger(body.amount)||body.amount<100||body.amount>1000000||!/^\+?[0-9]{8,16}$/.test(body.whatsapp||'')||!/^data:image\/(jpeg|png|webp);base64,/i.test(body.receipt||'')||body.receipt.length>2800000)return response({error:'Check amount, WhatsApp number and receipt image (max 2MB).'},400);const d={id:id('DEP'),customer_code:customer.customerId,amount:body.amount,whatsapp:body.whatsapp,receipt_url:body.receipt,status:'Pending',created_at:now()};db.deposits.unshift(d);customer.deposits.unshift({id:d.id,status:d.status,amount:d.amount,created_at:d.created_at});write(db);return response({depositId:d.id});}
        if(action==='buy'&&method==='POST'){if(!customer)return response({error:'Please log in'},401);const [a,b]=String(body.productKey||'').split('|');let product=null;if(a==='id'){const x=(db.data?.ids||[]).find(x=>x.id===b&&!x.sold);if(x)product={name:'Rare ID '+x.id,price:x.price}}else{const c=(db.data?.categories||[]).find(x=>x.id===a);const x=c?.items?.find(x=>x.id===b&&x.visible!==false);if(x)product={name:x.name,price:x.price};}if(!product||!Number.isSafeInteger(product.price)||product.price<1)return response({error:'This product is unavailable.'},404);if(customer.balance<product.price)return response({error:'Insufficient Wallet Balance. Please Add Money.'},400);const oid=id('UDS-ORD'),tx=id('TX');customer.balance-=product.price;const t={id:tx,kind:'Purchase',amount:-product.price,status:'Completed',created_at:now(),balance_after:customer.balance};customer.transactions.unshift(t);const o={id:oid,customer_code:customer.customerId,product_name:product.name,amount:product.price,status:'Paid',created_at:now()};customer.orders.unshift(o);db.orders.unshift(o);db.transactions.unshift(t);write(db);return response({orderId:oid});}
        if(action==='admin'){if(!admin)return response({error:'Admin login required'},401);return response({customers:db.customers.map(c=>({customer_code:c.customerId,phone:c.phone,balance:c.balance})),deposits:db.deposits,orders:db.orders});}
        if(action==='admin-customer'){if(!admin)return response({error:'Admin login required'},401);const q=new URL(url,location.origin).searchParams.get('customerId'),c=db.customers.find(x=>x.customerId===q);return c?response({customer:{customer_code:c.customerId,phone:c.phone},balance:c.balance,transactions:c.transactions}):response({error:'Customer not found'},404);}
        if(action==='admin-credit'&&method==='POST'){if(!admin)return response({error:'Admin login required'},401);const c=db.customers.find(x=>x.customerId===body.customerId);if(!c||!Number.isSafeInteger(body.amount)||body.amount<1)return response({error:'Invalid customer or amount'},400);c.balance+=body.amount;const t={id:id('TX'),kind:'Admin credit',amount:body.amount,status:'Completed',created_at:now(),balance_after:c.balance};c.transactions.unshift(t);db.transactions.unshift(t);write(db);return response({ok:true});}
        if(action==='admin-deposit'&&method==='POST'){if(!admin)return response({error:'Admin login required'},401);const d=db.deposits.find(x=>x.id===body.depositId);if(!d||d.status!=='Pending')return response({error:'Request already processed or missing.'},409);d.status=body.status==='Approved'?'Approved':'Rejected';const c=db.customers.find(x=>x.customerId===d.customer_code);if(d.status==='Approved'&&c){c.balance+=d.amount;const t={id:id('TX'),kind:'Deposit',amount:d.amount,status:'Completed',created_at:now(),balance_after:c.balance};c.transactions.unshift(t);db.transactions.unshift(t);}if(c){const cd=c.deposits.find(x=>x.id===d.id);if(cd)cd.status=d.status;}write(db);return response({ok:true});}
      }
      return response({error:'This demo API route is not available.'},404);
    }catch(e){return response({error:e.message||'Storage error'},500)}
  };
})();
