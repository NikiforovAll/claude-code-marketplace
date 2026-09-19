const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const html = readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

function attributes(tag) {
  const result = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    if (name === 'script' || name === 'link') continue;
    result[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function externalAssets(source) {
  const assets = [];
  const tagPattern = /<(script|link)\b[^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(source)) !== null) {
    const attrs = attributes(match[0]);
    let url;
    if (match[1].toLowerCase() === 'script') {
      url = attrs.src;
    } else if (attrs.rel?.toLowerCase().split(/\s+/).includes('stylesheet')) {
      url = attrs.href;
    }

    if (!url) continue;
    const parsed = new URL(url, 'http://localhost');
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== 'http://localhost') {
      assets.push({ url: parsed.href, integrity: attrs.integrity, crossorigin: attrs.crossorigin });
    }
  }
  return assets;
}

describe('external asset integrity', () => {
  it('requires SRI and crossorigin on every external script and stylesheet', () => {
    const assets = externalAssets(html);

    assert.ok(assets.length > 0, 'expected at least one external asset');
    for (const asset of assets) {
      assert.match(asset.integrity ?? '', /^sha(?:256|384|512)-\S+$/, `${asset.url} needs a valid SRI hash`);
      assert.ok(asset.crossorigin, `${asset.url} needs a crossorigin attribute`);
    }
  });

  it('keeps all highlight.js CDN assets on the same version', () => {
    const versions = externalAssets(html)
      .map(({ url }) => url.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/highlight\.js\/([^/]+)\//)?.[1])
      .filter(Boolean);

    assert.ok(versions.length > 0, 'expected highlight.js CDN assets');
    assert.equal(new Set(versions).size, 1, 'highlight.js URLs must use one version');
  });
});
