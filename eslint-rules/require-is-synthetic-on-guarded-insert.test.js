const { RuleTester } = require('eslint');
const rule = require('./require-is-synthetic-on-guarded-insert');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('require-is-synthetic-on-guarded-insert', rule, {
  valid: [
    `supabase.from('switch_events').insert({ id: 1, is_synthetic: false })`,
    `supabase.from('switch_fallbacks').insert({ is_synthetic: deriveFlag(org) })`,
    `supabase.from('switch_events').insert([{ is_synthetic: true }, { is_synthetic: false }])`,
    `const q = supabase.from('usage_events'); q.insert({ is_synthetic: true })`,
    `supabase.from('lead_events').insert({ visitor_id: 'x' })`,
    `supabase.from('newsletter_subscribers').insert({ email: 'a@b.c', is_synthetic: false })`,
    `supabase.from('newsletter_issues').insert({ title: 'x' })`,
    `db.from('some_other_table').insert({ foo: 1 })`,

  ],
  invalid: [
    { code: `supabase.from('switch_events').insert({ id: 1 })`, errors: [{ messageId: 'missing' }] },
    { code: `supabase.from('organizations').upsert({ name: 'x' })`, errors: [{ messageId: 'missing' }] },
    { code: `supabase.from('usage_events').insert([{ is_synthetic: true }, { foo: 1 }])`, errors: [{ messageId: 'missing' }] },
    { code: `supabase.from('switch_events').insert(buildPayload())`, errors: [{ messageId: 'unresolvable' }] },
    { code: `supabase.from('recommendations').insert({ ...base })`, errors: [{ messageId: 'spreadUnresolvable' }] },
    { code: `const q = supabase.from('billing_captures'); q.insert({ amount: 5 })`, errors: [{ messageId: 'missing' }] },
  ],
});
