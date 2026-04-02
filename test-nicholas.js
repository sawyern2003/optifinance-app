/**
 * Test Nicholas Sawyer invoice request specifically
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testNicholas() {
  console.log('🧪 Testing Nicholas Sawyer invoice request...\n');

  const request = 'Invoice Nicholas Sawyer for £20 for a consultation he had yesterday at 10am';

  console.log(`📤 Request: "${request}"\n`);

  const startTime = Date.now();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      input: request,
      session_id: `test_nicholas_${Date.now()}`,
      user_id: '00000000-0000-0000-0000-000000000000', // Mock user ID
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

  console.log(`⏱️  Time: ${elapsed}ms\n`);

  if (result.success) {
    console.log(`✅ SUCCESS`);
    console.log(`📥 Response: ${result.output}\n`);

    // Check if it mentions Nicholas (not Sarah!)
    if (result.output.toLowerCase().includes('nicholas')) {
      console.log('✅ Correctly identified Nicholas!');
    } else if (result.output.toLowerCase().includes('sarah')) {
      console.log('❌ BUG: Still using Sarah from example!');
    }
  } else {
    console.log(`❌ FAILED`);
    console.log(`Error: ${result.error}`);
  }
}

testNicholas().catch(console.error);
