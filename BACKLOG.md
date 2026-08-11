# sol.new — working backlog

Living list so we can pick up across sessions. Newest active work first.

## Active now

### `/pay` — Scan & pay
- [x] Scan Solana Pay QR + passkey pay (SOL/USDC)

### `/pos` — Point of sale
- [x] Merchant POS: amount pad, SOL/USDC, large QR, tip %
- [x] Solana Pay reference + poll for payment
- [ ] Persist sales history (Turso)
- [ ] Multi-item cart / tax
- [ ] NFC tap (Seeker / App Clip)

### `/sub` — Subscriptions
- [x] Hub page: credits + Stripe status + on-chain plan roadmap
- [x] Link A$5 credits checkout
- [ ] Solana Foundation `subscriptions` program (USDC monthly Pro)
- [ ] Creator plans (fans subscribe in USDC)
- [ ] Cron puller + credit ledger unlock

## Blocked

### Stripe live charges
- [ ] Enable **card_payments** on acct (`charges_enabled` still false)
- [ ] Retest A$5 credits + Apple Pay AU
- Dashboard: Capabilities → Card payments

### Fiat on-ramps (AU)
- [ ] MoonPay production keys (currently test)
- [ ] Transak domain whitelist `sol.new` + partner session

## Next up (queue)

1. Spend credits on sponsored fees / custom short links  
2. Foundation subscriptions spike (`De1egAFM…`)  
3. AU “buy on exchange → send here” guided fund panel  
4. Near Intents multi-chain fund (optional)  
5. Seeker dApp Store 1.0.1 review follow-up  

## Done recently (reference)

- App Clip full product + GTM  
- GSC redirect / soft-404 hygiene  
- Seeker store update 1.0.1 submitted  
- Credits ledger + Checkout (blocked on Stripe charges)  
- Link OG + auto-forward  

---

**How we use this:** say “continue backlog” or name an item. Ship small PRs → main → CF.
