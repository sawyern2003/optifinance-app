/**
 * Test Phase 3 - Simple GPT-4o Agent
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function test(request, name) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${name}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📤 "${request}"\n`);

  const start = Date.now();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor-v3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      input: request,
      user_id: '00000000-0000-0000-0000-000000000000',
    }),
  });

  const time = Date.now() - start;

  if (!response.ok) {
    console.log(`❌ HTTP ${response.status}`);
    console.log(await response.text());
    return;
  }

  const result = await response.json();

  if (result.success) {
    console.log(`✅ SUCCESS (${time}ms)`);
    console.log(`📥 ${result.output}\n`);
  } else {
    console.log(`❌ FAILED`);
    console.log(`Error: ${result.error}\n`);
  }
}

async function main() {
  console.log('\n🚀 PHASE 3: SIMPLE AGENT TEST\n');

  // Test 1: Simple query
  await test(
    "What's happening today?",
    "Simple query"
  );

  await new Promise(r => setTimeout(r, 2000));

  // Test 2: The actual request that was failing
  await test(
    "Invoice Nicholas Sawyer for £20 for a consultation he had yesterday at 11am",
    "Invoice for past consultation"
  );

  console.log('\n' + '='.repeat(70));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
