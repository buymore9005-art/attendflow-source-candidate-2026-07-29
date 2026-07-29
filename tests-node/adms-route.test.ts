import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAdmsPath } from '../supabase/functions/_shared/adms-route.ts';

test('classifies standard iClock push routes behind an Edge Function base path', () => {
  assert.equal(classifyAdmsPath('/functions/v1/adms/iclock/cdata'), 'cdata');
  assert.equal(classifyAdmsPath('/functions/v1/adms/iclock/getrequest'), 'getrequest');
  assert.equal(classifyAdmsPath('/functions/v1/adms/iclock/devicecmd'), 'devicecmd');
  assert.equal(classifyAdmsPath('/functions/v1/adms/iclock/registry'), 'registry');
  assert.equal(classifyAdmsPath('/functions/v1/adms/health'), 'health');
});

test('rejects lookalike and unsupported routes', () => {
  assert.equal(classifyAdmsPath('/iclock/cdata/extra'), 'unknown');
  assert.equal(classifyAdmsPath('/admin/iclock/cdata-export'), 'unknown');
});
