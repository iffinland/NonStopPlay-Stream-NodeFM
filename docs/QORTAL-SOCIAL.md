# Qortal messages and QORT tips

**Release acceptance, 2026-11-22:** the owner confirmed RC.9 runtime and all tests passed, and authorized main/tag/release publication. Earlier candidate/pending statements below describe their historical checkpoints and are superseded by the [accepted release](../reports/QORTAL-RC9-ACCEPTANCE.md).

RC.6 social addendum, 2026-11-22. Implemented and automatically verified;
RC.6 native Hub runtime acceptance was confirmed on 2026-11-22. This addendum is included with the
collaborator candidate; no commit/push or official release is included.

## Listener behavior

When enabled in station settings, **Message the Station Owner** sends an
encrypted direct Qortal chat to the station owner's wallet. The owner reads
and replies using the Chat panel in Qortal Hub, signed into that wallet.
The Admin Messages page explains this flow; it no longer opens the historical
Qortium Chat application. Collaborator permissions do not grant access to the
owner's private chat or wallet.

**Tip the Station Owner** opens Hub's native QORT payment approval for the
entered amount and the station owner's wallet. Hub controls fees, balance checks,
approval and signing. The connected sender pays from their own wallet.
NodeFM never handles a password, private key or transaction signing bytes.

Both forms show rotating progress while waiting. Their Send/Close/X controls
are disabled while a request is pending. Success closes the form only after
a matching signed transaction response. Failed/uncertain results remain visible;
there is no automatic or signed Retry action. If a result is uncertain, check
Hub Chat or wallet history before starting another send. A read/transport error
is not evidence that no transaction was broadcast.

## Platform contracts

The source revisions are recorded in the [port audit](QORTAL-PORT-AUDIT.md).
Stable Hub v3.0.3 `src/qortal/get.ts` implements:

- `sendChatMessage`: `SEND_CHAT_MESSAGE` accepts `destinationAddress` (or
  `recipient`) and `message`. The historical `recipientAddress` field is not
  recognized. For direct messages Hub resolves the recipient's public key,
  creates an encrypted CHAT transaction and returns Core's native transaction
  response, not Qortium's `{accepted: true}` wrapper.
- `sendCoin`: `SEND_COIN` requires `coin: "QORT"`, `recipient` and `amount`.
  After the native payment approval it returns Core's PAYMENT transaction data.

The bridge now permits these two ported signed actions, once per call. They are
outside the read-only retry set. The adapter requires a non-empty signature and
matching recipient; payments must also match the requested amount, and chat must
confirm encryption. Returned transaction types and sender identity are checked
when present. Bare booleans, legacy accepted-only wrappers, mismatched results
and transport errors never become local success.

The live account write gate remains in place. A service-level reservation blocks
overlapping calls even before account lookup completes; modal guards also block
rapid double clicks. Account changes invalidate the old form callback so an old
send cannot close a different wallet's form.

Qortal Core `ChatTransaction.MAX_DATA_SIZE` is 4,000 bytes. Validation counts the
audited Hub v3 rich-text JSON envelope, UTF-8/JSON escaping and the 16-byte NaCl
authentication tag. Four thousand typed characters therefore do not necessarily
fit in one chat message. Oversized messages are rejected before Hub approval.
Payments retain the eight-decimal validation and reject amounts that Hub's
numeric conversion could change, before requesting approval.

Hub's normal chat requirements still apply: in the audited stable handler the
sender needs at least 4 QORT and the recipient must have a public key on chain.
These requirements are enforced by Hub, with no plaintext fallback. Enabling
station messaging does not bypass them.

## Runtime checks

1. Reopen the updated APP in Hub. As a listener with chat available, send a short
   message and approve it. Confirm the modal closes and the owner's Hub Chat
   receives it. Reply from the owner's account.
2. Send a small chosen QORT tip. Check Hub's recipient, amount and fee before
   approval, then confirm the payment in the sender's wallet history.
3. While an approval is open, verify the form shows a spinner and cannot enqueue
   another send. A rejected/uncertain result must not show success or trigger
   another request automatically.
4. Confirm the existing collaborator add/remove and station publication checks
   still pass. RC.7 adds durable removal and remaining port integration; see [phases 3–4](QORTAL-PHASE3-4.md).
