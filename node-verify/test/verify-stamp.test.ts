// The spec's signed vectors and one real stamp, verified with no network: the
// anchor is walked to a block header committed beside the stamp. live.yml checks
// the same stamp against a live header source weekly.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import type { BlockHeaderSource } from '@orangecheck/stamp-ots';

import { headersFromDir, verifyStamp } from '../src/verify-stamp.js';

const STAMP_ID = '2b3ab2ae394897d015a892dfc11f4b2e81d58e15358d4f1e8486716dd85dd9b8';
const BLOCK = 972_632;
const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const real = (): string => readFileSync(here(`stamps/${STAMP_ID}.stamp`), 'utf8');
const headers = headersFromDir(here('headers'));

interface Vector {
    expected: { id: string; envelope: unknown };
    signature_check: { address_type: string; expected: { outcome: 'ACCEPT' | 'REJECT'; code?: string } };
}
const vector = (name: string): Vector => JSON.parse(readFileSync(here(`vectors/${name}.json`), 'utf8'));

/** The same BIP-322 witness with one byte inside the ECDSA signature's r changed; the pubkey is untouched. */
function oneByteChanged(sigB64: string): string {
    const bytes = Buffer.from(sigB64, 'base64');
    bytes[10]! ^= 0x01;
    return bytes.toString('base64');
}

function edited(edit: (env: Record<string, any>) => void): string {
    const env = JSON.parse(real());
    edit(env);
    return JSON.stringify(env);
}

for (const name of ['v10-sig-p2pkh', 'v11-sig-p2sh-p2wpkh', 'v12-sig-p2wpkh', 'v13-sig-p2tr']) {
    test(`${name} verifies`, async () => {
        const v = vector(name);
        assert.equal(v.signature_check.expected.outcome, 'ACCEPT');
        const out = await verifyStamp(JSON.stringify(v.expected.envelope));
        assert.equal(out.ok, true, out.ok ? '' : `${out.code}: ${out.message}`);
        if (out.ok) assert.equal(out.id, v.expected.id);
    });
}

test('v14-sig-tampered is refused for its signature', async () => {
    const v = vector('v14-sig-tampered');
    assert.equal(v.signature_check.expected.outcome, 'REJECT');
    const out = await verifyStamp(JSON.stringify(v.expected.envelope));
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, 'E_BAD_SIG');
});

test('the real stamp verifies, its anchor confirmed against the committed header', async () => {
    const out = await verifyStamp(real(), { headers });
    assert.equal(out.ok, true, out.ok ? '' : `${out.code}: ${out.message}`);
    if (!out.ok) return;
    assert.equal(out.id, STAMP_ID);
    assert.equal(out.envelope.signer.address, 'bc1q24yhqzremqsd9nj49cfdt54faqnzkha62pypa2');
    assert.deepEqual(out.anchor, {
        status: 'confirmed',
        blockHeight: BLOCK,
        blockHash: '00000000000000000001ccf3e6f7177e019cb8bbefa1bb8be605cc0032ec17c7',
        verified: true,
    });
});

test('without a header source the anchor is only claimed', async () => {
    const out = await verifyStamp(real());
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.anchor.status, 'claimed');
});

test('a header that cannot be read leaves the anchor unchecked, not failed', async () => {
    const out = await verifyStamp(real(), { headers: headersFromDir(here('no-such-dir')) });
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.anchor.status, 'unchecked');
});

test('a header with one byte changed refuses the anchor', async () => {
    const good = await headers.getHeaderAt(BLOCK);
    const bad = Uint8Array.from(good!);
    bad[40]! ^= 0x01;
    const source: BlockHeaderSource = { getHeaderAt: async () => bad };
    const out = await verifyStamp(real(), { headers: source });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, 'E_BAD_ANCHOR');
});

test('one signature byte changed is refused', async () => {
    const text = edited((env) => (env.sig.value = oneByteChanged(env.sig.value)));
    const out = await verifyStamp(text, { headers });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, 'E_BAD_SIG');
});

test('a changed content hash no longer matches the id', async () => {
    const text = edited((env) => (env.content.hash = env.content.hash.replace(/.$/, (c: string) => (c === '0' ? '1' : '0'))));
    const out = await verifyStamp(text, { headers });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, 'E_BAD_ID');
});

test('content bytes that are not the stamped ones are refused', async () => {
    const out = await verifyStamp(real(), { headers, content: new TextEncoder().encode('not the ballot') });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, 'E_BAD_CONTENT');
});
