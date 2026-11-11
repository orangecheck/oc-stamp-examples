import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { verifySignature } from '@orangecheck/bip322';
import { parseStamp, verify, type VerifyResult } from '@orangecheck/stamp-core';
import { hexDecode, makeAnchorVerifier, type BlockHeaderSource } from '@orangecheck/stamp-ots';

export interface VerifyStampOptions {
    /** The bytes the stamp is for. Without them, the content is not checked. */
    content?: Uint8Array;
    /**
     * Where block headers come from. Without one, a confirmed anchor is only
     * claimed: the `ots` block sits outside the signature (SPEC §6.3).
     */
    headers?: BlockHeaderSource;
}

/**
 * SPEC §8 on your machine: the id rebuilt from the canonical message, the
 * BIP-322 signature over that id, the OTS proof walked to a block header you
 * supply, and the content hash when you pass the bytes. Throws StampError when
 * the text is not a stamp envelope.
 */
export async function verifyStamp(text: string, opts: VerifyStampOptions = {}): Promise<VerifyResult> {
    const envelope = parseStamp(text);
    return verify({
        envelope,
        content: opts.content,
        verifyBip322: async (message, signature, address) => {
            try {
                return verifySignature(address, message, signature);
            } catch {
                return false;
            }
        },
        verifyOtsAnchor: opts.headers ? makeAnchorVerifier({ headerSource: opts.headers }) : undefined,
    });
}

/**
 * Headers from a folder of `<height>.hex` files, one 80-byte header each, so
 * an anchor checks with no network. A missing file throws: an unread header
 * leaves the anchor unchecked, never failed.
 */
export function headersFromDir(dir: string): BlockHeaderSource {
    return {
        async getHeaderAt(height) {
            let hex: string;
            try {
                hex = (await readFile(join(dir, `${height}.hex`), 'utf8')).trim();
            } catch {
                throw new Error(`no header for block ${height} in ${dir}`);
            }
            const header = hexDecode(hex);
            if (header.byteLength !== 80) throw new Error(`${dir}/${height}.hex is not an 80-byte header`);
            return header;
        },
    };
}
