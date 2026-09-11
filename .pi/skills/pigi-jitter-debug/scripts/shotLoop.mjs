#!/usr/bin/env node
/** Rapidly capture composited frames via Page.captureScreenshot for N seconds. */
import fs from 'node:fs';
import { connect } from '../../../../scripts/cdpClient.mjs';

const seconds = parseInt(process.argv[2] || '15', 10);
const outDir = process.argv[3] || '/tmp/pigi-shots';

const session = await connect();
await session.call('Page.enable');

fs.mkdirSync(outDir, { recursive: true });
const end = Date.now() + seconds * 1000;
let count = 0;
while (Date.now() < end) {
  const result = await session.call('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
  if (result?.data) {
    fs.writeFileSync(
      `${outDir}/shot-${String(count).padStart(4, '0')}.jpg`,
      Buffer.from(result.data, 'base64'),
    );
    count++;
  }
}
console.log(`captured ${count} shots to ${outDir}`);
session.close();
process.exit(0);
