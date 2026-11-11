// The README's recipe, run for real in a throwaway repository: git-stamp tag
// prompts for a signature of the id, and a disclosed burn key answers where your
// wallet would. Never send coins to its address: anyone can spend them.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';

// Key #1 of oc-stamp-protocol's test vectors: 0x01 repeated 32 times, published on purpose.
const BURN_KEY = '01'.repeat(32);
const ADDRESS = 'bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw';
const bin = (name: string) => fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));

let repo: string;
// No global or system git config: CI has no identity, and a signing setting must not leak in.
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Example', '-c', 'user.email=example@example.invalid', ...args], {
        cwd: repo,
        env,
        encoding: 'utf8',
    }).trim();

interface Run {
    code: number | null;
    stdout: string;
    stderr: string;
}

/** Run a bin in the repo; when it shows an id to sign, answer with `answer(id)`, as you would paste from a wallet. */
function run(name: string, args: string[], answer?: (id: string) => string): Promise<Run> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin(name), args, { cwd: repo, env });
        let stdout = '';
        let stderr = '';
        let answered = false;
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => {
            stderr += d;
            const id = stderr.match(/^([0-9a-f]{64})$/m)?.[1];
            if (answer && id && !answered && stderr.includes('paste signature')) {
                answered = true;
                child.stdin.end(answer(id) + '\n');
            }
        });
        // A prompt this never answers would wait on stdin for good.
        const timer = setTimeout(() => child.kill(), 20_000);
        child.on('error', reject);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        if (!answer) child.stdin.end();
    });
}

const wallet = (id: string) => signMessage(ADDRESS, id, BURN_KEY);
const json = (r: Run) => JSON.parse(r.stdout);

before(() => {
    repo = mkdtempSync(join(tmpdir(), 'oc-stamp-release-tag-'));
    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'README.md'), 'release 1\n');
    git('add', 'README.md');
    git('commit', '-q', '-m', 'release 1');
    git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
});

after(() => rmSync(repo, { recursive: true, force: true }));

test('the burn key is the key of the address the vectors name', () => {
    assert.equal(addressFromPrivateKey(BURN_KEY, 'p2wpkh'), ADDRESS);
});

test('git-stamp tag refuses a signature over anything but the id, and writes nothing', async () => {
    const r = await run('git-stamp', ['tag', 'v1.0.0', '--addr', ADDRESS, '--no-anchor', '--json'], () =>
        signMessage(ADDRESS, 'v1.0.0', BURN_KEY)
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Sign the 64-character id/);
    assert.throws(() => readFileSync(join(repo, '.git/stamps/v1.0.0.stamp')));
});

test('git-stamp tag stamps the tag with the signature pasted for its id', async () => {
    const r = await run('git-stamp', ['tag', 'v1.0.0', '--addr', ADDRESS, '--no-anchor', '--json'], wallet);
    assert.equal(r.code, 0, r.stderr);
    const out = json(r);
    assert.equal(out.ok, true);
    assert.equal(out.signer, ADDRESS);
    assert.equal(out.object, git('rev-parse', 'v1.0.0'));
    assert.equal(out.tree, git('rev-parse', 'v1.0.0^{tree}'));
    assert.match(out.written, /\.git\/stamps\/v1\.0\.0\.stamp$/);
});

test('git-stamp verify checks the stamp against the tag as it is now', async () => {
    const r = await run('git-stamp', ['verify', 'v1.0.0', '--json']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = json(r);
    assert.equal(out.ok, true);
    assert.equal(out.signer, ADDRESS);
    assert.equal(out.content_checked, true);
    assert.equal(out.signature_checked, true);
    assert.equal(out.anchor_state, 'none');
});

test('stamp verify checks the .stamp file on its own: id and signature', async () => {
    const r = await run('stamp', ['verify', '.git/stamps/v1.0.0.stamp', '--json']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const out = json(r);
    assert.equal(out.ok, true);
    assert.equal(out.signature_checked, true);
    assert.equal(out.content_checked, false);
});

test('without an anchor, --require-anchor does not pass', async () => {
    const r = await run('git-stamp', ['verify', 'v1.0.0', '--require-anchor', '--json']);
    assert.notEqual(r.code, 0);
    assert.equal(json(r).ok, false);
});

test('a .stamp with one signature byte changed is refused', async () => {
    const env0 = JSON.parse(readFileSync(join(repo, '.git/stamps/v1.0.0.stamp'), 'utf8'));
    const sig = Buffer.from(env0.sig.value, 'base64');
    sig[10]! ^= 0x01;
    writeFileSync(join(repo, 'tampered.stamp'), JSON.stringify({ ...env0, sig: { ...env0.sig, value: sig.toString('base64') } }));
    const r = await run('stamp', ['verify', 'tampered.stamp', '--json']);
    assert.equal(r.code, 2);
    assert.equal(json(r).code, 'E_BAD_SIG');
});

test('the stamp copied to another tag does not verify for it', async () => {
    git('tag', '-a', 'v1.0.1', '-m', 'v1.0.1');
    copyFileSync(join(repo, '.git/stamps/v1.0.0.stamp'), join(repo, '.git/stamps/v1.0.1.stamp'));
    const r = await run('git-stamp', ['verify', 'v1.0.1', '--json']);
    assert.equal(r.code, 2);
    assert.equal(json(r).code, 'E_BAD_CONTENT');
});

test('the tag moved after stamping no longer verifies', async () => {
    writeFileSync(join(repo, 'README.md'), 'release 1, changed\n');
    git('commit', '-q', '-am', 'changed after the release');
    git('tag', '-f', '-a', 'v1.0.0', '-m', 'v1.0.0');
    const r = await run('git-stamp', ['verify', 'v1.0.0', '--json']);
    assert.equal(r.code, 2);
    assert.equal(json(r).code, 'E_BAD_CONTENT');
});
