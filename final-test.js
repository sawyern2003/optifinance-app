/**
 * Final comprehensive test of all agent tools
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testAgent(input, testName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📤 Input: "${input}"\n`);

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
    console.log(`❌ HTTP Error: ${response.status}`);
    return;
  }

  const result = await response.json();

  if (result.success) {
    console.log(`✅ SUCCESS`);
    console.log(`📥 Response: ${result.output}`);
  } else {
    console.log(`❌ FAILED`);
    console.log(`Error: ${result.error}`);
  }

  return result;
}

async function main() {
  const testName = `TestPatient_${Date.now()}`;

  console.log('\n🚀 STARTING COMPREHENSIVE AGENT TEST SUITE\n');

  // Test 1: Add treatment for new patient (should auto-create patient)
  await testAgent(
    `${testName} had Botox today for £300, paid cash`,
    '1. Add Treatment (Auto-create Patient)'
  );
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Create invoice and send it (should find the patient now)
  await testAgent(
    `Create an invoice for ${testName} for £300 for Botox with 10% discount and send it`,
    '2. Create Invoice + Send (Multi-step)'
  );
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 3: Add expense
  await testAgent(
    'I spent £175 on products today for stock',
    '3. Add Expense'
  );
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 4: Update patient info
  await testAgent(
    `Update ${testName}'s email to test@example.com`,
    '4. Update Patient'
  );
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 5: Get today's summary (should show all activity)
  await testAgent(
    'Give me today\'s full summary',
    '5. Today Summary'
  );
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 6: Book appointment for existing patient
  await testAgent(
    `Book ${testName} in for a follow-up consultation tomorrow at 3pm`,
    '6. Book Appointment'
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ TEST SUITE COMPLETE');
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
