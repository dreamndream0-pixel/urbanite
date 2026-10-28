const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};new Function('require','module','exports',js)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
async function main() {
  const cfg={isProd:true,merchantId:'MS_TEST',hashKey:'test-key',hashIv:'test-iv'};
  const query=load('lib/newebpay-query.ts',{'@/lib/newebpay':{getNewebpayConfig:async()=>cfg}});
  const order='VP261028143157a739d08e16c2';
  const sign=result=>crypto.createHash('sha256').update(`HashIV=${cfg.hashIv}&${new URLSearchParams({Amt:String(result.Amt),MerchantID:result.MerchantID,MerchantOrderNo:result.MerchantOrderNo,TradeNo:result.TradeNo})}&HashKey=${cfg.hashKey}`).digest('hex').toUpperCase();
  let result={MerchantID:cfg.merchantId,MerchantOrderNo:order,Amt:300,TradeNo:'TRADE1',TradeStatus:'1',BackStatus:'0'};result.CheckCode=sign(result);
  let calls=0;
  global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://core.newebpay.com/API/QueryTradeInfo');assert.equal(options.redirect,'error');const fields=options.body;assert.equal(fields.get('Amt'),'300');assert.equal(fields.get('MerchantOrderNo'),order);assert.equal(fields.get('CheckValue'),crypto.createHash('sha256').update(`IV=${cfg.hashIv}&Amt=300&MerchantID=MS_TEST&MerchantOrderNo=${order}&Key=${cfg.hashKey}`).digest('hex').toUpperCase());return Response.json({Status:'SUCCESS',Result:result});};
  assert.deepEqual(await query.queryNewebpayPayment(order,300),{paid:true,tradeNo:'TRADE1'});
  result.TradeStatus='0';assert.equal((await query.queryNewebpayPayment(order,300)).paid,false);
  result.TradeStatus='1';result.BackStatus='3';assert.equal((await query.queryNewebpayPayment(order,300)).paid,false);
  result.BackStatus='0';result.CheckCode='forged';await assert.rejects(()=>query.queryNewebpayPayment(order,300),/SIGNATURE/);
  result.CheckCode=sign(result);result.Amt=100;await assert.rejects(()=>query.queryNewebpayPayment(order,300),/MISMATCH/);
  const prior=calls;await assert.rejects(()=>query.queryNewebpayPayment(order,0));assert.equal(calls,prior);
  let settlements=0,queries=0;const filters=[];
  let batchRows=null;
  const db={from:()=>{const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},gt:(...args)=>{filters.push(args);return q;},gte:()=>q,order:()=>q,limit:async n=>{assert.equal(n,batchRows?6:3);return{data:batchRows||[{order_no:'paid',amount:300},{order_no:'pending',amount:100},{order_no:'uncertain',amount:100}],error:null};}};return q;}};
  const reconcile=load('lib/video-payment-reconcile.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/newebpay-query':{queryNewebpayPayment:async no=>{queries++;if(no==='uncertain')throw Error('timeout');return{paid:no==='paid',tradeNo:'VERIFIED'};}},
    '@/lib/video-points':{settleVideoPayment:async payload=>{settlements++;assert.equal(payload.Result.MerchantOrderNo,'paid');assert.equal(payload.Result.TradeNo,'VERIFIED');return{ok:true};}},
  });
  const [a,b]=await Promise.all([reconcile.reconcileVideoPayments('member-a'),reconcile.reconcileVideoPayments('member-a')]);
  assert.deepEqual(a,{checked:3,settled:1,unconfirmed:1});assert.deepEqual(b,a);assert.equal(settlements,1);assert.equal(queries,3);assert.ok(filters.some(([k,v])=>k==='user_id'&&v==='member-a'));assert.ok(filters.some(([k,v])=>k==='status'&&v==='pending'));
  batchRows=Array.from({length:6},(_,n)=>({order_no:'VP123'+n,amount:100}));
  assert.deepEqual(await reconcile.reconcileVideoPaymentBatch(),{checked:6,settled:0,unconfirmed:0,nextCursor:'VP1235'});
  batchRows=[];assert.deepEqual(await reconcile.reconcileVideoPaymentBatch('VP1235'),{checked:0,settled:0,unconfirmed:0,nextCursor:''});
  assert.ok(filters.some(([k,v])=>k==='order_no'&&v==='VP1235'));assert.equal(settlements,1);
  let authorized=false,batches=0;
  const route=load('app/api/video-points/service/route.ts',{
    'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
    '@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/newebpay':{},
    '@/lib/video-points':{isVideoStudioRequest:async()=>authorized},
    '@/lib/video-payment-reconcile':{reconcileVideoPaymentBatch:async cursor=>{batches++;assert.equal(cursor,'VP1235');return{checked:0,nextCursor:''};}},
  });
  const req=cursor=>new Request('https://shop.test/api/video-points/service',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reconcile-batch',cursor})});
  assert.equal((await route.POST(req('VP1235'))).status,403);assert.equal(batches,0);
  authorized=true;assert.equal((await route.POST(req('bad cursor'))).status,400);assert.equal(batches,0);
  assert.equal((await route.POST(req('VP1235'))).status,200);assert.equal(batches,1);
  console.log('Payment reconciliation tests passed: signed query, mismatch, pending, refund, timeout, member isolation and concurrent deduplication.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
