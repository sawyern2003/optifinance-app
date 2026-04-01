/**
 * Test script for agent-executor
 * Tests all tools and multi-step workflows
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testAgent(input, testName) {
  console.log(`\n=== TEST: ${testName} ===`);
  console.log(`Input: "${input}"\n`);

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

  const result = await response.json();

  if (result.success) {
    console.log(`✅ SUCCESS: ${result.output}`);
  } else {
    console.log(`❌ FAILED: ${result.error || 'Unknown error'}`);
  }

  return result;
}

async function runTests() {
  console.log('🚀 Starting Agent Tests...\n');

  try {
    // Test 1: Multi-step workflow (create patient, book appointment, create invoice, send it)
    await testAgent(
      'Add Sarah Johnson to the calendar for Botox tomorrow at 2pm with a 10% discount invoice and send it to her',
      'Multi-step workflow: Patient + Appointment + Invoice + Send'
    );

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Add expense
    await testAgent(
      'I spent £150 on products today',
      'Add expense'
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Add treatment (should link to patient_id)
    await testAgent(
      'Sarah Johnson had Botox today for £300, she paid cash',
      'Add treatment with patient_id linking'
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Get today's summary
    await testAgent(
      'What\'s happening today?',
      'Get today summary'
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 5: Update patient
    await testAgent(
      'Update Sarah Johnson\'s email to sarah.j@example.com',
      'Update patient info'
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 6: Send payment reminder (if there's an unpaid invoice)
    await testAgent(
      'Send a payment reminder to Sarah Johnson',
      'Send payment reminder'
    );

    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
  }
}

runTests();
