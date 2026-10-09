// Isolated PostgreSQL/WASM test only. Argument: path to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const scalar = async sql => (await db.query(sql)).rows[0].value;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.card_payments(id uuid primary key default gen_random_uuid(), order_no text unique not null,
      user_id uuid not null, period text not null, amount integer not null, status text default 'pending',
      trade_no text default '', paid_at timestamptz, tier text not null default 'plus');
    create table public.card_subscriptions(user_id uuid primary key, plan text not null, expires_at timestamptz not null, updated_at timestamptz default now());
    create table public.orders(id uuid primary key, shop_id uuid not null);
    create schema storage; create table storage.objects(id uuid primary key, bucket_id text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
    create policy existing_broad_access on storage.objects for select using(true);
    insert into storage.objects values(gen_random_uuid(), 'assets'), (gen_random_uuid(), 'payment-proofs');
  `);
  await db.exec(await readFile(new URL('../supabase/migration-security-settlement.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migration-security-isolation.sql', import.meta.url), 'utf8'));
  equal(await scalar(`select has_function_privilege('anon','public.settle_card_payment_v1(text,integer,text)','execute') as value`), false);
  equal(await scalar(`select has_function_privilege('authenticated','public.settle_card_payment_v1(text,integer,text)','execute') as value`), false);
  equal(await scalar(`select has_function_privilege('service_role','public.settle_card_payment_v1(text,integer,text)','execute') as value`), true);
  const user = '00000000-0000-0000-0000-000000000099';
  await db.exec(`insert into public.card_payments(order_no,user_id,period,amount) values ('CP1','${user}','month',39), ('CP2','${user}','month',39), ('CP3','${user}','month',39)`);
  await assert.rejects(() => db.query(`select public.settle_card_payment_v1('CP1',40,'T1')`)); checks++;
  equal(await scalar(`select status as value from public.card_payments where order_no='CP1'`), 'pending');
  equal(await scalar(`select public.settle_card_payment_v1('CP1',39,'T1') as value`), true);
  const expiry = await scalar(`select expires_at::text as value from public.card_subscriptions where user_id='${user}'`);
  equal(await scalar(`select public.settle_card_payment_v1('CP1',39,'T1') as value`), true);
  equal(await scalar(`select expires_at::text as value from public.card_subscriptions where user_id='${user}'`), expiry);
  await assert.rejects(() => db.query(`select public.settle_card_payment_v1('CP1',39,'OTHER')`)); checks++;
  equal(await scalar(`select public.settle_card_payment_v1('CP2',39,'T2') as value`), true);
  equal(await scalar(`select expires_at = '${expiry}'::timestamptz + interval '31 days' as value from public.card_subscriptions where user_id='${user}'`), true);
  // Force the final payment write to fail; entitlement changes must roll back as well.
  await db.exec(`create function public.reject_test_payment() returns trigger language plpgsql as $$ begin if new.order_no='CP3' then raise exception 'TEST_FAILURE'; end if; return new; end $$;
    create trigger reject_test_payment before update on public.card_payments for each row execute function public.reject_test_payment();`);
  const before = await scalar(`select expires_at::text as value from public.card_subscriptions where user_id='${user}'`);
  await assert.rejects(() => db.query(`select public.settle_card_payment_v1('CP3',39,'T3')`)); checks++;
  equal(await scalar(`select expires_at::text as value from public.card_subscriptions where user_id='${user}'`), before);
  equal(await scalar(`select status as value from public.card_payments where order_no='CP3'`), 'pending');
  await db.exec(`insert into public.orders values('${user}','00000000-0000-0000-0000-000000000001')`);
  await assert.rejects(() => db.query(`update public.orders set shop_id='00000000-0000-0000-0000-000000000002'`)); checks++;
  await db.exec('set role anon');
  equal(await scalar('select count(*)::int as value from storage.objects'), 1);
  await assert.rejects(() => db.query('select * from public.orders')); checks++;
  await db.exec('reset role');
  await db.exec('grant select on public.orders to anon; create policy legacy_public_read on public.orders for select using(true); set role anon');
  equal(await scalar('select count(*)::int as value from public.orders'), 0);
  await db.exec('reset role; set role service_role');
  equal(await scalar('select count(*)::int as value from public.orders'), 1);
  await db.exec('reset role');
  console.log(`Passed ${checks} isolated PostgreSQL checks; production migrations NOT applied. Concurrency across independent connections requires staging verification.`);
} finally { await db.close(); }
