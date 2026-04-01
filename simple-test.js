/**
 * Simple test to verify basic functionality
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testAgent(input) {
  console.log(`\n📤 Sending: "${input}"\n`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      input: input,
      session_id: `test_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log('Response:', text);
    return;
  }

  const result = await response.json();
  console.log(`📥 Response:`, JSON.stringify(result, null, 2));
}

async function main() {
  // Test 1: Add expense
  console.log('=== Test 1: Add Expense ===');
  await testAgent('I spent £200 on marketing');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Create patient and add treatment
  console.log('\n=== Test 2: Create Patient + Add Treatment ===');
  await testAgent('Emily Watson had lip filler today for £250, she paid in full');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Create invoice and send it
  console.log('\n=== Test 3: Create and Send Invoice ===');
  await testAgent('Create an invoice for Emily Watson for £250 for lip filler with 5% discount and send it');

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Get summary
  console.log('\n=== Test 4: Today Summary ===');
  await testAgent('Give me today\'s summary');
}

main().catch(console.error);
