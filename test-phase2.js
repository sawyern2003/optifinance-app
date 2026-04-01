/**
 * Test Phase 2 Autonomous Agent
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testAgent(input, testName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${testName}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📤 Input: "${input}"\n`);

  const startTime = Date.now();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      input: input,
      session_id: `test_${Date.now()}`,
      user_id: 'test-user-123', // Mock user ID for testing
    }),
  });

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    console.log(`❌ HTTP Error: ${response.status}`);
    const text = await response.text();
    console.log('Response:', text);
    return;
  }

  const result = await response.json();

  if (result.success) {
    console.log(`✅ SUCCESS (${elapsed}ms)`);
    console.log(`📥 Response: ${result.output}`);
  } else {
    console.log(`❌ FAILED`);
    console.log(`Error: ${result.error}`);
  }

  return result;
}

async function main() {
  console.log('\n🚀 TESTING PHASE 2: AUTONOMOUS AGENT\n');

  // Test 1: Simple query (should auto-search database)
  await testAgent(
    'What\'s happening today?',
    'Test 1: Today Summary'
  );

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Multi-step workflow (the real test)
  // This should: search for Nicholas → book appointment → create invoice → send it
  // WITHOUT asking for any details
  await testAgent(
    'Add Nicholas to the calendar for a consultation tomorrow at 2pm and send him an invoice for £20',
    'Test 2: Multi-step Workflow (Book + Invoice)'
  );

  console.log('\n' + '='.repeat(70));
  console.log('✅ PHASE 2 TESTS COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
