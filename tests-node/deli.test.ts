import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeliSignature, md5 } from '../supabase/functions/_shared/deli-signature.ts';

test('implements standard MD5 vectors', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
});

test('matches Deli E+ path timestamp key secret signature format', () => {
  assert.equal(
    createDeliSignature('/v2.0/employee', '1532315906364', '3c5ee48d0b7d48c5', '65ded5353c5ee48d0b7d48c591b8f430'),
    'd380db98703c351c83600aa853786055'
  );
});
