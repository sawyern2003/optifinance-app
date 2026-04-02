/**
 * Test agent with SQL query capability
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
  console.log('\n🚀 TESTING SQL QUERY CAPABILITY\n');

  // Test 1: Standard workflow (should use specific tools)
  await test(
    "Nicholas Sawyer had a consultation yesterday, add it to his card and invoice him",
    "Standard workflow (uses specific tools)"
  );

  await new Promise(r => setTimeout(r, 3000));

  // Test 2: Complex query that requires SQL
  await test(
    "Show me all unpaid invoices",
    "Complex query (should use SQL)"
  );

  await new Promise(r => setTimeout(r, 3000));

  // Test 3: Analytics query
  await test(
    "What's my total revenue this month?",
    "Analytics query (should use SQL)"
  );

  console.log('\n' + '='.repeat(70));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
