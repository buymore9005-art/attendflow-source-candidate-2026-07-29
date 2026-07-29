import assert from 'node:assert/strict';
import test from 'node:test';
import { planAuthIdentityTransition } from '../src/lib/auth-session-policy.ts';

test('a newly authenticated user enters bootstrap loading without clearing another cache', () => {
  assert.deepEqual(planAuthIdentityTransition('', 'user-a'), {
    identityChanged: true,
    shouldLoadBootstrap: true,
    userIdToClear: null
  });
});

test('a token refresh for the same user does not remount the query cache', () => {
  assert.deepEqual(planAuthIdentityTransition('user-a', 'user-a'), {
    identityChanged: false,
    shouldLoadBootstrap: false,
    userIdToClear: null
  });
});

test('sign-out clears the previous user cache without starting another bootstrap', () => {
  assert.deepEqual(planAuthIdentityTransition('user-a', ''), {
    identityChanged: true,
    shouldLoadBootstrap: false,
    userIdToClear: 'user-a'
  });
});

test('switching identities clears the old cache and bootstraps the new user', () => {
  assert.deepEqual(planAuthIdentityTransition('user-a', 'user-b'), {
    identityChanged: true,
    shouldLoadBootstrap: true,
    userIdToClear: 'user-a'
  });
});
