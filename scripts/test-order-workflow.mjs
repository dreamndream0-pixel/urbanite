// Isolated database tests. Pass the installed @electric-sql/pglite module path.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const shop = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const buyer = '00000000-0000-0000-0000-000000000003';
const seller = '00000000-0000-0000-0000-000000000004';
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const scalar = async sql => (await db.query(sql)).rows[0].value;
const rejects = async sql => { await assert.rejects(() => db.query(sql)); checks++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table shops(id uuid primary key);
    insert into shops values('${shop}'),('${other}');
    create table integration_settings(key text primary key,value text);
    create table orders(id uuid primary key default gen_random_uuid(),shop_id uuid references shops,user_id uuid,status text default '已出貨',
      order_status text default 'PROCESSING',fulfillment_status text default 'SHIPPED', payment_status text default 'UNPAID',paid boolean default false,
      cancel_status text default '',store_lgs_type text default '',store_id text default '',shipping_method text default '宅配');
    create table shipments(id uuid primary key default gen_random_uuid(),shop_id uuid,order_id uuid references orders,
      status text default 'SHIPPED',lgs_type text default '',ship_type text default '',provider text default '手動',
      created_at timestamptz default now(),updated_at timestamptz default now(),delivered_at timestamptz);
    create table returns(id uuid primary key default gen_random_uuid(),shop_id uuid,order_id uuid,status text);
    create table shipment_events(id uuid default gen_random_uuid(),shop_id uuid,shipment_id uuid,status text,description text);
    create table order_status_history(id uuid default gen_random_uuid(),shop_id uuid,order_id uuid,type text,from_status text,to_status text,note text,created_by text);
  `);
  const migration = await readFile(new URL('../supabase/migration-order-workflow.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  equal(await scalar('select order_workflow_version() as value'), 1);
  for (const role of ['anon', 'authenticated']) {
    for (const signature of ['order_workflow_version()', 'claim_order_notifications(integer)', 'manual_order_transition(uuid,uuid,uuid,boolean,text)']) {
      equal(await scalar(`select has_function_privilege('${role}','public.${signature}','execute') as value`), false);
    }
    equal(await scalar(`select has_table_privilege('${role}','order_notification_jobs','select') as value`), false);
  }
  const createOrder = async (store = false, tenant = shop) => {
    const id = await scalar(`insert into orders(shop_id,user_id,store_lgs_type) values('${tenant}','${buyer}','${store ? 'MANUAL' : ''}') returning id as value`);
    await db.exec(`insert into shipments(shop_id,order_id) values('${tenant}','${id}')`);
    return id;
  };
  const call = (id, action, actor = buyer, isSeller = false, tenant = shop) => `select manual_order_transition('${tenant}','${id}','${actor}',${isSeller},'${action}') as value`;
  const id = await createOrder();
  equal(await scalar('select count(*)::int as value from order_notification_jobs'), 0);
  await db.exec(`insert into integration_settings values('SHOP_ORDER_NOTIFICATIONS:${shop}','encrypted')`);
  await rejects(call(id, 'complete', seller));
  await rejects(call(id, 'arrived'));
  await rejects(call(id, 'arrived', seller, true, other));
  const arrived = await scalar(call(id, 'arrived', seller, true));
  equal(arrived.fulfillment_status, 'DELIVERED');
  equal(arrived.order_status, 'PROCESSING');
  equal(arrived.paid, false);
  equal(await scalar('select count(*)::int as value from order_notification_jobs'), 4);
  await scalar(call(id, 'arrived', seller, true));
  equal(await scalar('select count(*)::int as value from shipment_events'), 1);
  const completed = await scalar(call(id, 'complete'));
  equal(completed.order_status, 'COMPLETED');
  equal(completed.payment_status, 'UNPAID');
  equal(completed.paid, false);
  await scalar(call(id, 'complete'));
  equal(await scalar('select count(*)::int as value from order_notification_jobs'), 8);
  const pickup = await createOrder(true);
  equal((await scalar(call(pickup, 'arrived', seller, true))).fulfillment_status, 'AT_STORE');
  const picked = await scalar(call(pickup, 'complete'));
  equal(picked.fulfillment_status, 'PICKED_UP'); equal(picked.paid, false);
  equal(await scalar(`select count(*)::int as value from order_notification_jobs where order_id='${pickup}' and event='picked_up'`), 4);
  const direct = await createOrder();
  equal((await scalar(call(direct, 'complete'))).order_status, 'COMPLETED');
  for (const patch of ["status='取消'", "cancel_status='REQUESTED'", "payment_status='REFUNDED'", "fulfillment_status='UNFULFILLED'"]) {
    const blocked = await createOrder(); await db.exec(`update orders set ${patch} where id='${blocked}'`); await rejects(call(blocked, 'complete'));
  }
  const integrated = await createOrder();
  await db.exec(`update shipments set lgs_type='C2C' where order_id='${integrated}'`);
  await rejects(call(integrated, 'complete'));
  const returning = await createOrder();
  await db.exec(`insert into returns(shop_id,order_id,status) values('${shop}','${returning}','REQUESTED')`);
  await rejects(call(returning, 'complete'));
  const rollback = await createOrder();
  await db.exec(`create function reject_test_history() returns trigger language plpgsql as $$ begin if new.order_id='${rollback}' then raise exception 'test'; end if; return new; end $$;
    create trigger reject_test_history before insert on order_status_history for each row execute function reject_test_history();`);
  await rejects(call(rollback, 'complete'));
  equal(await scalar(`select status as value from shipments where order_id='${rollback}'`), 'SHIPPED');
  equal(await scalar(`select count(*)::int as value from shipment_events where shipment_id in(select id from shipments where order_id='${rollback}')`), 0);
  const tenantOrder = await createOrder(false, other);
  equal(await scalar(`select count(*)::int as value from order_notification_jobs where order_id='${tenantOrder}'`), 0);
  const claimed = (await db.query('select * from claim_order_notifications(2)')).rows;
  equal(claimed.length, 2);
  const claimedAgain = (await db.query('select * from claim_order_notifications(2)')).rows;
  equal(claimedAgain.some(j => claimed.some(c => c.id === j.id)), false);
  await db.exec(`update order_notification_jobs set lease_until=now()-interval '1 second' where id='${claimed[0].id}'`);
  const reclaimed = (await db.query('select * from claim_order_notifications(1)')).rows[0];
  equal(reclaimed.id, claimed[0].id); equal(reclaimed.attempts, 2);
  equal(reclaimed.lease_token === claimed[0].lease_token, false);
  console.log(`Passed ${checks} isolated PostgreSQL workflow checks; no production orders modified.`);
} finally { await db.close(); }
