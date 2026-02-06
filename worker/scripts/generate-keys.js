#!/usr/bin/env node

/**
 * License Key Generator for AI Trade Journal.
 *
 * Usage:
 *   node generate-keys.js --count 50
 *   node generate-keys.js --count 10 --format sql
 *   node generate-keys.js --count 5 --format both
 *
 * Options:
 *   --count <n>   Number of keys to generate (default: 10)
 *   --format <f>  Output format: json | sql | both (default: both)
 *
 * Key format: XXXX-XXXX-XXXX-XXXX
 * Charset: ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no ambiguous 0/O, 1/I/L)
 */

import crypto from 'node:crypto';

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEGMENT_LENGTH = 4;
const SEGMENT_COUNT = 4;

/**
 * Generate a single license key.
 * @returns {string}
 */
function generateKey() {
  const segments = [];

  for (let s = 0; s < SEGMENT_COUNT; s++) {
    let segment = '';
    for (let c = 0; c < SEGMENT_LENGTH; c++) {
      const randomIndex = crypto.randomInt(0, CHARSET.length);
      segment += CHARSET[randomIndex];
    }
    segments.push(segment);
  }

  return segments.join('-');
}

/**
 * Generate multiple unique license keys.
 * @param {number} count
 * @returns {string[]}
 */
function generateKeys(count) {
  const keys = new Set();

  while (keys.size < count) {
    keys.add(generateKey());
  }

  return Array.from(keys);
}

/**
 * Format keys as SQL INSERT statements.
 * @param {string[]} keys
 * @returns {string}
 */
function toSql(keys) {
  const lines = [
    '-- AI Trade Journal License Keys',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Count: ${keys.length}`,
    '',
    'INSERT INTO licenses (key, status) VALUES',
  ];

  const values = keys.map((key, i) => {
    const comma = i < keys.length - 1 ? ',' : ';';
    return `  ('${key}', 'unused')${comma}`;
  });

  lines.push(...values);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { count: 10, format: 'both' };

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--count' && argv[i + 1]) {
      args.count = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--format' && argv[i + 1]) {
      args.format = argv[i + 1];
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`
Usage: node generate-keys.js [options]

Options:
  --count <n>   Number of keys to generate (default: 10)
  --format <f>  Output format: json | sql | both (default: both)
  --help, -h    Show this help message
`);
      process.exit(0);
    }
  }

  if (isNaN(args.count) || args.count < 1 || args.count > 10000) {
    console.error('Error: --count must be a number between 1 and 10000.');
    process.exit(1);
  }

  if (!['json', 'sql', 'both'].includes(args.format)) {
    console.error('Error: --format must be one of: json, sql, both.');
    process.exit(1);
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const keys = generateKeys(args.count);

  if (args.format === 'json' || args.format === 'both') {
    console.log('=== JSON ===');
    console.log(JSON.stringify(keys, null, 2));
  }

  if (args.format === 'both') {
    console.log('');
  }

  if (args.format === 'sql' || args.format === 'both') {
    console.log('=== SQL ===');
    console.log(toSql(keys));
  }
}

main();
