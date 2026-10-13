# Order Notifications and Manual Fulfillment

## Deployment

1. Apply `supabase/migration-order-workflow.sql` after the existing shop, tracking,
   returns and integrations migrations. It is transactional and rerunnable.
2. Deploy the application.
3. Apply `supabase/schedule-order-notifications.sql` to reuse the existing authenticated
   LINE cron command for a separate five-minute order notification worker. The original
   broadcast job is unchanged. Alternatively schedule authenticated GET requests to
   `/api/cron/order-notifications` using `Authorization: Bearer <CRON_SECRET>`.
4. Open Admin > System Settings > Notifications, enable channels and event/recipient
   checkboxes, then save. Until settings are saved, legacy notifications remain active.

Email uses the existing Resend integration. Platform seller email uses ORDER_NOTIFY_EMAILS,
falling back to administrator emails. Tenant seller email uses shop owner accounts.
LINE uses the platform bot or the tenant's own bot. Buyers and sellers must bind their
accounts to that shop's LINE bot; seller LINE recipients are the shop owners (platform:
member accounts matching the configured notification emails).

No old orders are replayed. New status transitions create jobs inside the order transaction.
Channel and event settings are checked at dispatch; disabled rules are skipped. Recent
attempts and safe error summaries are visible in the settings panel. Missing credentials
fail visibly; missing recipient bindings are skipped. Saving settings does not send a test
message or change an order.

## Delivery Semantics

Workers claim one leased job at a time with `FOR UPDATE SKIP LOCKED`. Request payloads
and recipients are persisted before sending; retries use the same job UUID. Transient
errors retry with backoff, up to six attempts. Automatic retries stop 23 hours after the
first send to stay within provider idempotency windows. Failed jobs require investigation;
they are not blindly resent. Provider acceptance is not proof of delivery or reading.

Primary references:
- https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
- https://resend.com/changelog/idempotency-keys

The queue contains private message payloads and is service-role-only. Neither anonymous
nor authenticated database roles may read it or invoke workflow RPCs.

## Manual Orders

Only single-shipment, non-integrated orders in shipped/transit/arrived states qualify.
Seller arrival becomes AT_STORE for pickup or DELIVERED for home delivery. The owning
buyer can confirm receipt after shipment, including before the seller marks arrival.
Completion becomes PICKED_UP/DELIVERED and COMPLETED. Payment columns are never changed.
Cancelled, cancellation-requested, returned, refunded and integrated orders are rejected.
The RPC locks the order and shipment and commits state, history, events and notification
jobs together. Repeated confirmations do not create duplicate events.

## Verification

```
node scripts/test-order-notifications.cjs
node scripts/test-order-workflow.mjs <path-to-installed-pglite/dist/index.js>
```

These tests use mocks and an isolated PostgreSQL WASM database. No production orders or
provider requests are used. Real delivery should be verified with designated test buyer
and seller accounts after credentials, LINE bindings and event rules are configured.
