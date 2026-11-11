# release-tag

Stamp a git release tag with your Bitcoin address, and let anyone check it. `git-stamp` comes with [`@orangecheck/stamp-cli`](https://npmjs.com/package/@orangecheck/stamp-cli).

## Stamp a release

```sh
npm i -g @orangecheck/stamp-cli

git tag -a v1.2.0 -m 'v1.2.0'
git-stamp tag v1.2.0 --addr bc1q...yours
```

`git-stamp tag` shows what the stamp commits to and a 64-character id. Sign that id with your wallet (BIP-322 message signing) and paste the signature back. It checks the signature before it writes anything: a signature over anything but the id is refused. It then writes `.git/stamps/v1.2.0.stamp` and submits the id to the OpenTimestamps calendars.

The stamp covers the tag name, the tag object and the tree. Move the tag, or copy the stamp to another tag, and it no longer verifies.

Git does not push `.git/stamps/`. Publish the file with the release:

```sh
gh release upload v1.2.0 .git/stamps/v1.2.0.stamp
```

A few hours later, once a Bitcoin block holds the calendars' commitment, upgrade the proof and upload it again:

```sh
stamp anchor .git/stamps/v1.2.0.stamp
gh release upload v1.2.0 .git/stamps/v1.2.0.stamp --clobber
```

To sign on another machine, fix the time. The id depends on it, so the same `--signed-at` gives the same id. Run once to see the id, stop at the prompt, sign the id elsewhere, then pass the signature:

```sh
git-stamp tag v1.2.0 --addr bc1q...yours --signed-at 2026-11-11T12:00:00Z
git-stamp tag v1.2.0 --addr bc1q...yours --signed-at 2026-11-11T12:00:00Z --sig '<base64>'
```

## Check a release

```sh
git fetch --tags
mkdir -p .git/stamps
gh release download v1.2.0 -p 'v1.2.0.stamp' -D .git/stamps
git-stamp verify v1.2.0 --require-anchor
```

`git-stamp verify` reads the tag as it is now and checks the stamp against it: the id, the BIP-322 signature, and a confirmed anchor against the block header at its height, read from `https://mempool.space/api`. `--require-anchor` fails a stamp that is not anchored yet. Exit codes: `0` verified, `1` bad input, `2` verification failed, or with `--require-anchor` a stamp not anchored yet, `3` with `--require-anchor`, the block header could not be read: check again later.

`stamp verify .git/stamps/v1.2.0.stamp` checks the file on its own: the id, the signature and the anchor, without the tag. It takes `--headers-url` to read headers from your own Esplora instead.

Check that the signer is the address you expect. A valid stamp only says that address signed this tag.

## Test

```sh
yarn install
yarn test
```

The test runs this recipe in a throwaway repository, with no network. A disclosed burn key from oc-stamp-protocol's test vectors answers the prompt where your wallet would. Its private key is public: never send coins to its address. The test also checks the refusals: a signature over the tag name, a `.stamp` with one signature byte changed, the stamp copied to another tag, and the tag moved after stamping.
