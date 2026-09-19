/**
 * Structured data rules.
 *
 * Pure functions: parsed JSON-LD and Microdata in, entities and findings out.
 * No DOM, no chrome.* APIs - which is what makes this file directly
 * unit-testable under Node.
 */

export const STATUS = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
});

/**
 * What each schema.org type needs to be eligible for rich results.
 *
 * `required` missing is an error; `recommended` missing is a warning. Aliases
 * let one entry serve a family of types (Article covers BlogPosting, and so on).
 */
export const REQUIREMENTS = Object.freeze({
  Article: {
    aliases: ['NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle'],
    required: ['headline'],
    recommended: ['image', 'datePublished', 'author', 'publisher'],
  },
  Product: {
    required: ['name'],
    recommended: ['image', 'description', 'offers', 'sku', 'brand'],
  },
  // What Shopify and Google now emit for any product with variants. It is not
  // a Product alias: hasVariant and variesBy are what make it useful.
  ProductGroup: {
    aliases: ['ProductModel'],
    required: ['name'],
    recommended: ['image', 'description', 'hasVariant', 'productGroupID', 'variesBy', 'brand'],
  },
  Offer: {
    required: ['price', 'priceCurrency'],
    recommended: ['availability', 'url'],
  },
  AggregateOffer: {
    required: ['lowPrice', 'priceCurrency'],
    recommended: ['highPrice', 'offerCount'],
  },
  Review: {
    required: ['reviewRating', 'author'],
    recommended: ['datePublished', 'reviewBody'],
  },
  AggregateRating: {
    required: ['ratingValue'],
    recommended: ['reviewCount', 'bestRating'],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  Organization: {
    aliases: ['Corporation', 'NGO', 'OnlineBusiness'],
    required: ['name'],
    recommended: ['url', 'logo', 'sameAs'],
  },
  LocalBusiness: {
    aliases: ['Restaurant', 'Store', 'ProfessionalService'],
    required: ['name', 'address'],
    recommended: ['telephone', 'openingHours', 'geo', 'priceRange'],
  },
  Person: {
    required: ['name'],
    recommended: ['url', 'jobTitle'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction'],
  },
  WebPage: {
    aliases: ['ItemPage', 'CollectionPage', 'AboutPage', 'ContactPage'],
    required: [],
    recommended: ['name', 'description'],
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
  },
  Question: {
    required: ['name', 'acceptedAnswer'],
    recommended: [],
  },
  Recipe: {
    required: ['name'],
    recommended: ['image', 'recipeIngredient', 'recipeInstructions', 'author', 'cookTime'],
  },
  Event: {
    required: ['name', 'startDate'],
    recommended: ['location', 'endDate', 'offers', 'description'],
  },
  VideoObject: {
    required: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['duration', 'contentUrl'],
  },
  ImageObject: {
    required: [],
    recommended: ['url', 'contentUrl', 'width', 'height'],
  },
  JobPosting: {
    required: ['title', 'description', 'datePosted', 'hiringOrganization'],
    recommended: ['jobLocation', 'baseSalary', 'employmentType'],
  },
  SoftwareApplication: {
    required: ['name'],
    recommended: ['applicationCategory', 'operatingSystem', 'offers', 'aggregateRating'],
  },
});

/** Maps every alias back to the entry that describes it. */
const TYPE_INDEX = (() => {
  const index = new Map();
  for (const [name, rules] of Object.entries(REQUIREMENTS)) {
    index.set(name.toLowerCase(), { name, rules });
    for (const alias of rules.aliases || []) {
      index.set(alias.toLowerCase(), { name, rules });
    }
  }
  return index;
})();

/** The bare type name, whether it came from @type or a full itemtype URL. */
export function normaliseType(value) {
  if (Array.isArray(value)) return value.map(normaliseType).filter(Boolean).join(', ');
  if (!value) return '';

  const text = String(value).trim();
  if (!text) return '';

  // "https://schema.org/Product" -> "Product"
  const last = text.split(/[/#]/).filter(Boolean).pop();
  return last || text;
}

/**
 * Flattens JSON-LD blocks and Microdata items into one list of entities.
 *
 * Handles the three shapes that appear in practice: a single object, an array
 * of objects, and an @graph wrapper.
 *
 * @param {object} data Output of collectSchema().
 * @returns {Array<{type, properties, source, path}>}
 * @throws {TypeError} If data is malformed.
 */
export function flattenEntities(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('flattenEntities() requires collected schema data.');
  }

  const entities = [];

  const visit = (node, source, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 8) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, source, path + '[' + index + ']', depth + 1));
      return;
    }

    if (Array.isArray(node['@graph'])) {
      node['@graph'].forEach((item, index) =>
        visit(item, source, path + '@graph[' + index + ']', depth + 1)
      );
      return;
    }

    const type = normaliseType(node['@type']);
    if (type) {
      entities.push({ type, properties: node, source, path });
    }

    // Nested entities (an Offer inside a Product) are validated too.
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      if (value && typeof value === 'object') {
        visit(value, source, path ? path + '.' + key : key, depth + 1);
      }
    }
  };

  (Array.isArray(data.jsonLd) ? data.jsonLd : []).forEach((block, index) => {
    if (block && block.ok) visit(block.data, 'json-ld', 'block' + index, 0);
  });

  (Array.isArray(data.microdata) ? data.microdata : []).forEach((item, index) => {
    const type = normaliseType(item.type);
    if (type) {
      entities.push({
        type,
        properties: item.properties || {},
        source: 'microdata',
        path: 'item' + index,
      });
    }
  });

  return entities;
}

/** True when a property is present and carries something meaningful. */
function hasValue(properties, name) {
  if (!properties || typeof properties !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(properties, name)) return false;

  const value = properties[name];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Checks one entity against the requirements for its type.
 *
 * @param {object} entity One item from flattenEntities().
 * @returns {Array<{status, label, message}>}
 */
export function validateEntity(entity) {
  if (!entity) return [];

  // A type may be a comma-joined list; the first recognised one governs.
  const names = String(entity.type || '').split(',').map((name) => name.trim());
  let matched = null;
  for (const name of names) {
    const found = TYPE_INDEX.get(name.toLowerCase());
    if (found) {
      matched = found;
      break;
    }
  }

  if (!matched) {
    return [
      {
        status: STATUS.INFO,
        label: entity.type,
        message: 'No rich-result requirements are checked for this type.',
      },
    ];
  }

  const findings = [];
  const properties = entity.properties || {};

  for (const name of matched.rules.required) {
    findings.push(
      hasValue(properties, name)
        ? { status: STATUS.OK, label: name, message: 'Present.' }
        : { status: STATUS.ERROR, label: name, message: 'Required by ' + matched.name + '.' }
    );
  }

  for (const name of matched.rules.recommended) {
    if (hasValue(properties, name)) {
      findings.push({ status: STATUS.OK, label: name, message: 'Present.' });
    } else {
      findings.push({
        status: STATUS.WARNING,
        label: name,
        message: 'Recommended for ' + matched.name + '.',
      });
    }
  }

  return findings;
}

/**
 * Validates everything on the page, parse errors included.
 *
 * @param {object} data Output of collectSchema().
 * @returns {{entities: Array, parseErrors: Array, summary: object}}
 */
export function auditSchema(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('auditSchema() requires collected schema data.');
  }

  const parseErrors = (Array.isArray(data.jsonLd) ? data.jsonLd : [])
    .map((block, index) => ({ index, ...block }))
    .filter((block) => block.ok === false);

  const entities = flattenEntities(data).map((entity) => {
    const findings = validateEntity(entity);
    return {
      ...entity,
      findings,
      errors: findings.filter((finding) => finding.status === STATUS.ERROR).length,
      warnings: findings.filter((finding) => finding.status === STATUS.WARNING).length,
    };
  });

  const summary = {
    entities: entities.length,
    types: [...new Set(entities.map((entity) => entity.type))],
    errors: entities.reduce((total, entity) => total + entity.errors, 0) + parseErrors.length,
    warnings: entities.reduce((total, entity) => total + entity.warnings, 0),
    parseErrors: parseErrors.length,
  };

  summary.status = summary.errors ? STATUS.ERROR : summary.warnings ? STATUS.WARNING : STATUS.OK;

  return { entities, parseErrors, summary };
}

/** Pretty-printed JSON of everything found, for the export button. */
export function toJson(data, audit) {
  if (!data || !audit) throw new TypeError('toJson() requires the data and the audit.');

  return JSON.stringify(
    {
      tool: 'Schema Inspector',
      version: 1,
      url: data.url || null,
      inspectedAt: data.collectedAt || new Date().toISOString(),
      summary: audit.summary,
      parseErrors: audit.parseErrors,
      entities: audit.entities.map((entity) => ({
        type: entity.type,
        source: entity.source,
        path: entity.path,
        errors: entity.errors,
        warnings: entity.warnings,
        findings: entity.findings,
        properties: entity.properties,
      })),
    },
    null,
    2
  );
}
