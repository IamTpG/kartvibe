/**
 * Normalization module for HTTP responses before snapshot comparison.
 *
 * Rules:
 * 1. Replaces dynamic orderId with "<ID>" in body objects.
 * 2. Filters out dynamic request tracking headers and fields:
 *    - Headers: date, x-request-id, etag, last-modified, content-length, connection, keep-alive.
 *    - Body fields: x-request-id, requestId (if present in payload).
 * 3. Preserves deterministic fields (status, code, message, sku, quantity, status: CONFIRMED).
 */

export function normalizeResponse(raw) {
  if (!raw) return { status: 0, headers: {}, body: null };

  const status = Number(raw.status) || 0;

  // Normalize Body
  let body = raw.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // Plain text or invalid JSON string, preserve as-is
    }
  }

  function cleanObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    }
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'orderId') {
        cleaned[key] = '<ID>';
      } else if (key.toLowerCase() === 'x-request-id' || key === 'requestId') {
        // Strip out dynamic request ids
        continue;
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = cleanObject(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  const normalizedBody = typeof body === 'object' && body !== null ? cleanObject(body) : body;

  // Normalize Headers
  const normalizedHeaders = {};
  if (raw.headers && typeof raw.headers === 'object') {
    const ignoredHeaders = new Set([
      'date',
      'x-request-id',
      'etag',
      'last-modified',
      'content-length',
      'connection',
      'keep-alive'
    ]);
    for (const [k, v] of Object.entries(raw.headers)) {
      const lower = k.toLowerCase();
      if (!ignoredHeaders.has(lower)) {
        normalizedHeaders[lower] = v;
      }
    }
  }

  return {
    status,
    headers: normalizedHeaders,
    body: normalizedBody
  };
}

/**
 * Compares two responses (raw or normalized) and returns { match: boolean, diff?: string }
 */
export function compareSnapshots(snapA, snapB, labelA = 'REST', labelB = 'gRPC') {
  const normA = normalizeResponse(snapA);
  const normB = normalizeResponse(snapB);

  if (normA.status !== normB.status) {
    return {
      match: false,
      diff: `Status code mismatch: [${labelA}] ${normA.status} vs [${labelB}] ${normB.status}`
    };
  }

  const bodyAStr = JSON.stringify(normA.body, null, 2);
  const bodyBStr = JSON.stringify(normB.body, null, 2);

  if (bodyAStr !== bodyBStr) {
    return {
      match: false,
      diff: `Body mismatch between [${labelA}] and [${labelB}]:\n--- ${labelA} ---\n${bodyAStr}\n--- ${labelB} ---\n${bodyBStr}`
    };
  }

  return {
    match: true
  };
}
