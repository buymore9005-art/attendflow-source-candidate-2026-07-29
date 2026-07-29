import assert from 'node:assert/strict';
import test from 'node:test';
import { stripLeadingSqlComments } from '../scripts/verify-project-helpers.mjs';

test('strips leading line and block comments before a SQL transaction', () => {
  const sql = '\uFEFF-- generated file\n/* deployment note */\n\nBEGIN;\nselect 1;\nCOMMIT;';
  assert.equal(stripLeadingSqlComments(sql).startsWith('BEGIN;'), true);
});

test('does not remove SQL statements while stripping comments', () => {
  const sql = '-- note\ncreate table example(id integer);';
  assert.equal(stripLeadingSqlComments(sql), 'create table example(id integer);');
});
