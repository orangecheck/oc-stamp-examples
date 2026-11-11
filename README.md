# oc-stamp-examples

Copy-forkable integrations of [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol): sign something with your Bitcoin address, anchor it to a Bitcoin block, and let anyone check it offline. Each subdirectory is a standalone template. Fork it, put in your own tag or file, ship.

## What's in here

| Path | What it is |
|---|---|
| [`release-tag/`](./release-tag) | Stamp a release tag with `git-stamp`, the way you would sign it with GPG, but with your Bitcoin address. Check it with `git-stamp verify` and `stamp verify`. Its test runs the whole recipe in a throwaway repository. |
| [`node-verify/`](./node-verify) | Verify a `.stamp` in Node with `stamp-core` and `bip322`: the id, the BIP-322 signature, the content hash and the OpenTimestamps anchor, walked to a block header you supply. Ships one real stamp anchored in block 972632, and that block's header. |

## Shared assumptions

- You have a **Bitcoin wallet** that signs BIP-322 messages (UniSat, Xverse, Leather, OKX, Phantom), or any offline BIP-322 signer. The wallet signs the stamp's 64-character id, never the message (SPEC §4.5).
- Node 22 or newer, and yarn 1.

## What you trust

A stamp checks with no service asked. The signature needs only the address. The anchor needs one Bitcoin block header: from your own node, or from a source you name. `stamp verify` reads headers from `https://mempool.space/api` unless you pass `--headers-url`. `node-verify` reads them from a folder you fill.

## Running locally

Each subdirectory has its own `README.md` and its own lockfile. None of them share deps. cd in, `yarn install`, `yarn test`.

## CI

- **Templates**, on every push and pull request: each template installed from its lockfile, type-checked and tested.
- **Live**, weekly: the same against the latest published packages, plus the real stamp checked three ways (stamp-cli against mempool.space, node-verify against the committed header, the committed header against the chain). A copy with one signature byte changed must fail both verifiers.
- **Hygiene**: no secrets in the history, no home-directory paths.

## License

MIT. Fork freely.

## Related

- **Protocol**: [`orangecheck/oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol)
- **Web client**: [`stamp.ochk.io`](https://stamp.ochk.io)
- **Library**: [`@orangecheck/stamp-core`](https://npmjs.com/package/@orangecheck/stamp-core)
- **CLI**: [`@orangecheck/stamp-cli`](https://npmjs.com/package/@orangecheck/stamp-cli)
