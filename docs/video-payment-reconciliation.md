# Video top-up reconciliation

Signed NewebPay callbacks remain the primary settlement path. These callback POSTs and the shared-secret studio service no longer refresh browser login sessions in the proxy; their handlers retain their existing signature/secret authentication.

On a studio member summary request, reconcile at most the three most recent pending orders created in the last seven days for that same member. The read-only QueryTradeInfo request uses the payment service's own server-side merchant configuration. Verify the response CheckCode, exact merchant, order and amount; accept only TradeStatus=1 with no reported refund. Query SUCCESS by itself never proves payment. Errors/timeouts remain unconfirmed and do not grant points.

Confirmed payments use the existing settle_video_points_v1 database transaction used by callbacks, preserving ledger/balance atomicity and duplicate protection. Concurrent summary checks share a promise and a 30-second cache per server process. There is no new recurring scheduler; members can reopen their points panel or use Recheck Payment to trigger a check.

Sources: NewebPay NDNF manual sections 4.1.5, 4.1.6, 4.3 (https://www.newebpay.com/website/Page/content/download_api).

Validation: production Next.js build and scripts/test-video-payment-reconcile.cjs passed. Covers signed queries, mismatched amounts, unpaid/refunded results, invalid signatures, timeouts, per-member filtering and concurrent deduplication. The existing private-payment and security-hardening suites currently stop at pre-existing unmocked imports (order-access-token and video-points); these unrelated fixtures were not modified. Studio: 61 tests passed. No new real payment was made for validation.
