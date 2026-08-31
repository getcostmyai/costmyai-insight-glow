'use strict';

const GUARDED_TABLES = new Set([
  'organizations',
  'recommendations',
  'switches',
  'switch_events',
  'switch_fallbacks',
  'routing_rules',
  'usage_events',
  'usage_rollups',
  'billing_captures',
  'objectives',
  'workload_profiles',
  'refusal_events',
  // Org-less tables: is_synthetic is pinned to false by pin_synthetic_false()
  // rather than derived by enforce_synthetic_flag(). The presence requirement
  // still applies so a writer states the classification it expects.
  'newsletter_subscribers',
  'newsletter_sends',
]);


const INSERT_METHODS = new Set(['insert', 'upsert']);

function getTableFromFromCall(node) {
  if (
    !node ||
    node.type !== 'CallExpression' ||
    node.callee.type !== 'MemberExpression' ||
    node.callee.property.type !== 'Identifier' ||
    node.callee.property.name !== 'from'
  ) {
    return null;
  }
  const arg = node.arguments[0];
  if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
    return arg.value;
  }
  return null;
}

function objectHasIsSynthetic(objExpr) {
  if (!objExpr || objExpr.type !== 'ObjectExpression') return false;
  return objExpr.properties.some((p) => {
    if (p.type === 'SpreadElement') return false;
    const keyNode = p.key;
    if (!keyNode) return false;
    if (keyNode.type === 'Identifier') return keyNode.name === 'is_synthetic';
    if (keyNode.type === 'Literal') return keyNode.value === 'is_synthetic';
    return false;
  });
}

function payloadHasSpread(objExpr) {
  return (
    objExpr &&
    objExpr.type === 'ObjectExpression' &&
    objExpr.properties.some((p) => p.type === 'SpreadElement')
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require is_synthetic to be present in the payload of any insert/upsert against a trigger-covered table.',
    },
    schema: [],
    messages: {
      missing:
        "'{{table}}' is covered by enforce_synthetic_flag() and requires an explicit `is_synthetic` key in every {{method}}() payload. Add `is_synthetic: <boolean>` (correctness of the value is validated elsewhere — this check only requires presence).",
      unresolvable:
        "'{{table}}' is covered by enforce_synthetic_flag(), but this {{method}}() payload is not a plain object/array literal, so `is_synthetic` presence cannot be statically verified. Either inline the payload as an object literal with an explicit `is_synthetic` key, or add a justified eslint-disable comment.",
      spreadUnresolvable:
        "'{{table}}' payload uses object spread (...) without an explicit is_synthetic key elsewhere in the literal; presence cannot be statically verified through a spread. Add `is_synthetic` directly in this object literal, or add a justified eslint-disable comment.",
    },
  },
  create(context) {
    const varTableMap = new Map();

    function checkPayloadArg(node, table, method) {
      const payload = node.arguments[0];
      if (!payload) {
        context.report({ node, messageId: 'missing', data: { table, method } });
        return;
      }
      if (payload.type === 'ObjectExpression') {
        if (payloadHasSpread(payload) && !objectHasIsSynthetic(payload)) {
          context.report({ node: payload, messageId: 'spreadUnresolvable', data: { table, method } });
          return;
        }
        if (!objectHasIsSynthetic(payload)) {
          context.report({ node: payload, messageId: 'missing', data: { table, method } });
        }
        return;
      }
      if (payload.type === 'ArrayExpression') {
        for (const el of payload.elements) {
          if (!el || el.type === 'SpreadElement') {
            context.report({ node: payload, messageId: 'unresolvable', data: { table, method } });
            continue;
          }
          if (el.type !== 'ObjectExpression' || !objectHasIsSynthetic(el)) {
            context.report({ node: el, messageId: 'missing', data: { table, method } });
          }
        }
        return;
      }
      context.report({ node: payload, messageId: 'unresolvable', data: { table, method } });
    }

    return {
      VariableDeclarator(node) {
        if (node.init && node.id.type === 'Identifier') {
          const table = getTableFromFromCall(node.init);
          if (table && GUARDED_TABLES.has(table)) {
            varTableMap.set(node.id.name, table);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          !INSERT_METHODS.has(node.callee.property.name)
        ) {
          return;
        }
        const method = node.callee.property.name;
        const objectNode = node.callee.object;

        if (objectNode.type === 'CallExpression') {
          const table = getTableFromFromCall(objectNode);
          if (table && GUARDED_TABLES.has(table)) {
            checkPayloadArg(node, table, method);
            return;
          }
        }

        if (objectNode.type === 'Identifier' && varTableMap.has(objectNode.name)) {
          const table = varTableMap.get(objectNode.name);
          checkPayloadArg(node, table, method);
        }
      },
    };
  },
};
