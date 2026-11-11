# node-verify

Verify an OC Stamp in Node with [`@orangecheck/stamp-core`](https://npmjs.com/package/@orangecheck/stamp-core), [`@orangecheck/bip322`](https://npmjs.com/package/@orangecheck/bip322) and [`@orangecheck/stamp-ots`](https://npmjs.com/package/@orangecheck/stamp-ots). Every check runs on your machine. No stamp service is asked.

## Run it

```sh
yarn install
yarn -s verify stamps/2b3ab2ae394897d015a892dfc11f4b2e81d58e15358d4f1e8486716dd85dd9b8.stamp --headers headers --require-anchor
```

```json
{
  "ok": true,
  "id": "2b3ab2ae394897d015a892dfc11f4b2e81d58e15358d4f1e8486716dd85dd9b8",
  "signer": "bc1q24yhqzremqsd9nj49cfdt54faqnzkha62pypa2",
  "signed_at": "2026-10-22T16:00:13.311Z",
  "content_hash": "sha256:5617b9c1dab2877e7acb5a30354210059d3315e33d7a99e2700d012f8e83734e",
  "content_checked": false,
  "anchor": {
    "status": "confirmed",
    "blockHeight": 972632,
    "blockHash": "00000000000000000001ccf3e6f7177e019cb8bbefa1bb8be605cc0032ec17c7",
    "verified": true
  }
}
```

Options:

- `--content <path>`: the stamped bytes. Their SHA-256 must equal the stamp's `content.hash`. Without them, the content is not checked.
- `--headers <dir>`: a folder of `<height>.hex` files, one 80-byte block header each. Without it, a confirmed anchor is only `claimed`: the `ots` block sits outside the signature (SPEC §6.3).
- `--require-anchor`: exit `3` unless a header confirmed the anchor.

Exit codes: `0` verified, `1` bad input, `2` verification failed, `3` no header confirmed the anchor (with `--require-anchor`).

## What it checks

`src/verify-stamp.ts` is the whole integration; `src/cli.ts` only reads files and prints:

1. `parseStamp` reads the envelope and checks each field's form.
2. `verify` from stamp-core rebuilds the canonical message (SPEC §3), hashes it and compares that with the stamp's `id`. Any changed field gives another id.
3. `verifySignature` from bip322 checks the signature over that id for the signer's address. P2PKH, P2SH-P2WPKH, P2WPKH and P2TR all verify.
4. With headers, `makeAnchorVerifier` from stamp-ots walks the OpenTimestamps proof from the id to a Merkle root, and checks that the header at the claimed height hashes to the claimed block hash and carries that root.
5. With content, its hash is compared with `content.hash`.

A header your source cannot read leaves the anchor `unchecked`, not failed: nothing was shown wrong, so check again later. `headersFromDir` throws for a missing file for that reason; returning "no block" would fail a stamp that is fine.

It does not check `stake`: that field sits outside the id and the signature. Re-resolve the attestation and run `checkStake` from stamp-core if the stake matters to you.

## What you trust

The signer's address, and the block header. The one in `headers/972632.hex` was read from mempool.space and blockstream.info on 2026-11-11; both gave the same block hash. Live CI compares it with mempool.space's header every week. To trust no one, take headers from your own node: `bitcoin-cli getblockheader $(bitcoin-cli getblockhash 972632) false`.

Check that the signer is the address you expect. A valid stamp says that address signed those bytes, and a confirmed anchor says the stamp existed by that block. `signed_at` is the signer's own claim.

## The real stamp

`stamps/2b3ab2ae….stamp` is a stamp vote.ochk.io's ballot anchorer made on 2026-10-22, over a ballot cast in a throwaway test poll. It was signed under `bc1q24yhqzremqsd9nj49cfdt54faqnzkha62pypa2`, the P2WPKH address the anchorer used then. The anchorer has used another key since; [`/.well-known/oc-vote-anchorer.json`](https://vote.ochk.io/.well-known/oc-vote-anchorer.json) names the current one. Its signature carries no authority either way. It is anchored in block 972632. It was read from the public relays as Nostr kind 30083, `d` tag `oc-stamp:2b3ab2ae…`. The ballot itself is not included, so the content is not checked here.

## Test

```sh
yarn test
```

With no network: oc-stamp-protocol's signed vectors v10 to v13 (one per address type) verify and v14 (one signature byte changed) is refused. The real stamp verifies with its anchor confirmed against the committed header. One signature byte changed, a changed content hash, other content bytes, and a header with one byte changed are each refused, and a header that cannot be read leaves the anchor unchecked.
