// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { checkTownUpdate } from '../release-recovery';
import version from '../../../../data/derived/town/runtime-version.json';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('distinguishes the same/new runtime without treating missing or malformed metadata as a forced reload',async()=>{
  const read=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(version))).mockResolvedValueOnce(new Response(JSON.stringify({version:1,runtimeSha256:'a'.repeat(64)}))).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('',{status:404}));vi.stubGlobal('fetch',read);
  const signal=new AbortController().signal;
  expect(await checkTownUpdate(signal)).toBe('same');expect(await checkTownUpdate(signal)).toBe('new');expect(await checkTownUpdate(signal)).toBe('unavailable');expect(await checkTownUpdate(signal)).toBe('unavailable');
  expect(read.mock.calls.every(([url,options])=>url==='/town-version.json'&&options.cache==='no-store')).toBe(true);
});
