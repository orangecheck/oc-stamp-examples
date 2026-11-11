// yarn -s verify <file.stamp> [--content <path>] [--headers <dir>] [--require-anchor]
// Exit 0 verified, 1 bad input, 2 verification failed, 3 no header confirmed the anchor (with --require-anchor).
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { StampError } from '@orangecheck/stamp-core';

import { headersFromDir, verifyStamp } from './verify-stamp.js';

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        content: { type: 'string' },
        headers: { type: 'string' },
        'require-anchor': { type: 'boolean', default: false },
    },
});

function out(result: Record<string, unknown>, code: number): never {
    console.log(JSON.stringify(result, null, 2));
    process.exit(code);
}

const [stampPath] = positionals;
if (!stampPath || positionals.length > 1) {
    console.error('usage: verify <file.stamp> [--content <path>] [--headers <dir>] [--require-anchor]');
    process.exit(1);
}

let text: string;
let content: Uint8Array | undefined;
try {
    text = await readFile(stampPath, 'utf8');
    content = values.content ? new Uint8Array(await readFile(values.content)) : undefined;
} catch (e) {
    out({ ok: false, code: 'E_INPUT', message: e instanceof Error ? e.message : String(e) }, 1);
}

let result;
try {
    result = await verifyStamp(text, {
        content,
        headers: values.headers ? headersFromDir(values.headers) : undefined,
    });
} catch (e) {
    if (e instanceof StampError) out({ ok: false, code: e.code, message: e.message }, 1);
    throw e;
}

if (!result.ok) out({ ok: false, code: result.code, message: result.message }, 2);

const env = result.envelope;
const report = {
    ok: true,
    id: result.id,
    signer: env.signer.address,
    signed_at: env.signed_at,
    content_hash: env.content.hash,
    content_checked: content !== undefined,
    anchor: result.anchor,
};
if (values['require-anchor'] && result.anchor.status !== 'confirmed') {
    out({ ...report, ok: false, code: 'ANCHOR_NOT_CONFIRMED' }, 3);
}
out(report, 0);
