import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseType,
  flattenEntities,
  validateEntity,
  auditSchema,
  toJson,
  REQUIREMENTS,
  STATUS,
} from '../src/lib/schema.js';

const page = (overrides = {}) => ({
  url: 'https://example.com/product',
  title: 'A product',
  jsonLd: [],
  microdata: [],
  collectedAt: '2026-09-19T10:00:00.000Z',
  ...overrides,
});

const ld = (data) => ({ ok: true, data });
const statusOf = (findings, label) => findings.find((f) => f.label === label).status;

// --- normaliseType -----------------------------------------------------------

test('normaliseType strips the schema.org prefix', () => {
  assert.equal(normaliseType('https://schema.org/Product'), 'Product');
  assert.equal(normaliseType('http://schema.org/Product'), 'Product');
  assert.equal(normaliseType('Product'), 'Product');
  assert.equal(normaliseType('schema.org/LocalBusiness'), 'LocalBusiness');
});

test('normaliseType joins a multi-type array', () => {
  assert.equal(normaliseType(['Product', 'https://schema.org/Offer']), 'Product, Offer');
});

test('normaliseType tolerates junk', () => {
  assert.equal(normaliseType(null), '');
  assert.equal(normaliseType(''), '');
  assert.equal(normaliseType('   '), '');
});

// --- Registry integrity ------------------------------------------------------

test('every requirement entry declares required and recommended arrays', () => {
  for (const [name, rules] of Object.entries(REQUIREMENTS)) {
    assert.ok(Array.isArray(rules.required), name + '.required');
    assert.ok(Array.isArray(rules.recommended), name + '.recommended');
    for (const alias of rules.aliases || []) assert.equal(typeof alias, 'string');
  }
});

// --- flattenEntities ---------------------------------------------------------

test('a single JSON-LD object becomes one entity', () => {
  const entities = flattenEntities(page({ jsonLd: [ld({ '@type': 'Product', name: 'Bike' })] }));
  assert.equal(entities.length, 1);
  assert.equal(entities[0].type, 'Product');
  assert.equal(entities[0].source, 'json-ld');
});

test('an array of JSON-LD objects becomes several entities', () => {
  const entities = flattenEntities(
    page({ jsonLd: [ld([{ '@type': 'Product', name: 'A' }, { '@type': 'Organization', name: 'B' }])] })
  );
  assert.deepEqual(entities.map((e) => e.type), ['Product', 'Organization']);
});

test('an @graph wrapper is unwrapped', () => {
  const entities = flattenEntities(
    page({
      jsonLd: [ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'S' }] })],
    })
  );
  assert.equal(entities.length, 1);
  assert.equal(entities[0].type, 'WebSite');
});

test('nested entities are found as well as their parent', () => {
  const entities = flattenEntities(
    page({
      jsonLd: [
        ld({
          '@type': 'Product',
          name: 'Bike',
          offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR' },
        }),
      ],
    })
  );
  assert.deepEqual(entities.map((e) => e.type), ['Product', 'Offer']);
});

test('Microdata items become entities alongside JSON-LD', () => {
  const entities = flattenEntities(
    page({
      jsonLd: [ld({ '@type': 'Product', name: 'A' })],
      microdata: [{ type: 'https://schema.org/Organization', properties: { name: 'B' } }],
    })
  );
  assert.deepEqual(entities.map((e) => e.source), ['json-ld', 'microdata']);
  assert.equal(entities[1].type, 'Organization');
});

test('blocks that failed to parse contribute no entities', () => {
  const entities = flattenEntities(
    page({ jsonLd: [{ ok: false, error: 'Unexpected token' }, ld({ '@type': 'Product', name: 'A' })] })
  );
  assert.equal(entities.length, 1);
});

test('an object with no @type is skipped but still descended into', () => {
  const entities = flattenEntities(
    page({ jsonLd: [ld({ something: { '@type': 'Person', name: 'Ada' } })] })
  );
  assert.deepEqual(entities.map((e) => e.type), ['Person']);
});

test('flattenEntities rejects junk', () => {
  assert.throws(() => flattenEntities(null), TypeError);
  assert.throws(() => flattenEntities('nope'), TypeError);
});

test('an empty page yields no entities', () => {
  assert.deepEqual(flattenEntities(page()), []);
});

// --- validateEntity ----------------------------------------------------------

test('a complete Product passes every check', () => {
  const findings = validateEntity({
    type: 'Product',
    properties: {
      name: 'Bike',
      image: 'https://a.test/b.jpg',
      description: 'A bike.',
      offers: { price: '10' },
      sku: 'X1',
      brand: 'Acme',
    },
  });
  assert.ok(findings.every((finding) => finding.status === STATUS.OK));
});

test('a missing required property is an error', () => {
  const findings = validateEntity({ type: 'Product', properties: { image: 'x' } });
  assert.equal(statusOf(findings, 'name'), STATUS.ERROR);
  assert.match(findings.find((f) => f.label === 'name').message, /Required/);
});

test('a missing recommended property is only a warning', () => {
  const findings = validateEntity({ type: 'Product', properties: { name: 'Bike' } });
  assert.equal(statusOf(findings, 'name'), STATUS.OK);
  assert.equal(statusOf(findings, 'image'), STATUS.WARNING);
});

test('an empty string does not satisfy a requirement', () => {
  const findings = validateEntity({ type: 'Product', properties: { name: '   ' } });
  assert.equal(statusOf(findings, 'name'), STATUS.ERROR);
});

test('an empty array or object does not satisfy a requirement', () => {
  assert.equal(
    statusOf(validateEntity({ type: 'FAQPage', properties: { mainEntity: [] } }), 'mainEntity'),
    STATUS.ERROR
  );
  assert.equal(
    statusOf(validateEntity({ type: 'Product', properties: { name: {} } }), 'name'),
    STATUS.ERROR
  );
});

test('a numeric or boolean value does satisfy a requirement', () => {
  assert.equal(
    statusOf(validateEntity({ type: 'AggregateRating', properties: { ratingValue: 0 } }), 'ratingValue'),
    STATUS.OK
  );
});

test('aliases are validated against their parent type', () => {
  const findings = validateEntity({ type: 'BlogPosting', properties: {} });
  assert.equal(statusOf(findings, 'headline'), STATUS.ERROR);
  assert.match(findings.find((f) => f.label === 'headline').message, /Article/);
});

test('a multi-type entity is checked against the first recognised type', () => {
  const findings = validateEntity({ type: 'SomethingCustom, Product', properties: {} });
  assert.equal(statusOf(findings, 'name'), STATUS.ERROR);
});

test('an unknown type is reported as unchecked, not as broken', () => {
  const findings = validateEntity({ type: 'MysteryThing', properties: {} });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, STATUS.INFO);
  assert.match(findings[0].message, /No rich-result requirements/);
});

test('validateEntity tolerates a missing entity', () => {
  assert.deepEqual(validateEntity(null), []);
});

// --- auditSchema -------------------------------------------------------------

test('a clean page reports no errors and no warnings', () => {
  const audit = auditSchema(
    page({
      jsonLd: [
        ld({
          '@type': 'Organization',
          name: 'Acme',
          url: 'https://acme.test',
          logo: 'https://acme.test/l.png',
          sameAs: ['https://x.test/acme'],
        }),
      ],
    })
  );
  assert.equal(audit.summary.errors, 0);
  assert.equal(audit.summary.warnings, 0);
  assert.equal(audit.summary.status, STATUS.OK);
  assert.deepEqual(audit.summary.types, ['Organization']);
});

test('a JSON-LD block that fails to parse is an error in its own right', () => {
  const audit = auditSchema(
    page({ jsonLd: [{ ok: false, error: 'Unexpected token }', excerpt: '{bad' }] })
  );
  assert.equal(audit.parseErrors.length, 1);
  assert.equal(audit.summary.parseErrors, 1);
  assert.equal(audit.summary.errors, 1);
  assert.equal(audit.summary.status, STATUS.ERROR);
});

test('errors and warnings are counted per entity and in total', () => {
  const audit = auditSchema(page({ jsonLd: [ld({ '@type': 'Product', name: 'Bike' })] }));
  const [product] = audit.entities;

  assert.equal(product.errors, 0);
  assert.equal(product.warnings, 5);
  assert.equal(audit.summary.warnings, 5);
  assert.equal(audit.summary.status, STATUS.WARNING);
});

test('an empty page is ok rather than broken', () => {
  const audit = auditSchema(page());
  assert.equal(audit.entities.length, 0);
  assert.equal(audit.summary.status, STATUS.OK);
  assert.deepEqual(audit.summary.types, []);
});

test('auditSchema rejects junk', () => {
  assert.throws(() => auditSchema(null), TypeError);
});

// --- Export ------------------------------------------------------------------

test('toJson produces parseable JSON carrying entities and findings', () => {
  const data = page({ jsonLd: [ld({ '@type': 'Product', name: 'Bike' })] });
  const audit = auditSchema(data);
  const parsed = JSON.parse(toJson(data, audit));

  assert.equal(parsed.tool, 'Schema Inspector');
  assert.equal(parsed.url, 'https://example.com/product');
  assert.equal(parsed.inspectedAt, '2026-09-19T10:00:00.000Z');
  assert.equal(parsed.entities[0].type, 'Product');
  assert.equal(parsed.entities[0].properties.name, 'Bike');
  assert.ok(parsed.entities[0].findings.length > 0);
});

test('toJson rejects missing arguments', () => {
  assert.throws(() => toJson(null, {}), TypeError);
  assert.throws(() => toJson({}, null), TypeError);
});

// --- ProductGroup ------------------------------------------------------------
//
// Added after running the collector against a real Shopify storefront: modern
// stores emit ProductGroup, not Product. Treating it as unknown meant reporting
// "nothing checked" on the most common e-commerce page there is.

test('ProductGroup is validated on its own terms, not as an unknown type', () => {
  const findings = validateEntity({
    type: 'ProductGroup',
    properties: { name: "Men's Runner", image: ['a.jpg'], description: 'x', hasVariant: [{}] },
  });

  assert.equal(findings.some((f) => f.status === STATUS.INFO && /No rich-result/.test(f.message)), false);
  assert.equal(statusOf(findings, 'name'), STATUS.OK);
  assert.equal(statusOf(findings, 'hasVariant'), STATUS.OK);
  assert.equal(statusOf(findings, 'productGroupID'), STATUS.WARNING);
});

test('a ProductGroup with no name is still an error', () => {
  const findings = validateEntity({ type: 'ProductGroup', properties: { hasVariant: [{}] } });
  assert.equal(statusOf(findings, 'name'), STATUS.ERROR);
});

test('a full schema.org URL for ProductGroup is recognised', () => {
  const entities = flattenEntities(
    page({ jsonLd: [ld({ '@type': 'https://schema.org/ProductGroup', name: 'X' })] })
  );
  assert.equal(entities[0].type, 'ProductGroup');
  assert.equal(validateEntity(entities[0]).some((f) => /No rich-result/.test(f.message)), false);
});
