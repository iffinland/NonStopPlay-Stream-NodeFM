/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { buildSync } from 'esbuild';
import { createContext, runInContext } from 'node:vm';

describe('Core-injected lexical bridge', () => {
  it('uses a top-level const from a classic script, even without a window property', async () => {
    const request = vi.fn();
    const timed = vi.fn().mockResolvedValue({ address: 'Q-owner', publicKey: 'pub' });
    const context = createContext({ request, timed, setTimeout, clearTimeout });
    runInContext('const qortalRequest = request; const qortalRequestWithTimeout = timed;', context);
    const result = buildSync({
      entryPoints: ['src/qortium/bridge.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'nodefmBridge',
      target: 'es2020',
    });
    runInContext(result.outputFiles[0].text, context);
    expect(context.qortalRequest).toBeUndefined();
    const response = await runInContext(
      "nodefmBridge.sendBridgeRequest({action: 'GET_USER_ACCOUNT'})",
      context,
    );
    expect(response).toEqual({ address: 'Q-owner', publicKey: 'pub' });
    expect(timed).toHaveBeenCalledWith({ action: 'GET_USER_ACCOUNT' }, 300_000);
    expect(request).not.toHaveBeenCalled();
  });
});
