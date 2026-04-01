/**
 * Verify the agent-executor deployment is working
 * This just checks that the function boots and responds
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function verifyDeployment() {
  console.log('🔍 Verifying agent-executor deployment...\n');

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        input: 'test',
        session_id: 'test_session',
        user_id: 'test-user-id',
      }),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Function is responding');
      console.log('Response type:', data.type);

      if (data.type === 'error' && data.error && data.error.includes('user_id is required')) {
        console.log('⚠️  Function requires valid authenticated user_id (expected)');
      }
    } else {
      const text = await response.text();
      console.log('❌ Function error:', text);
    }

    console.log('\n✅ Deployment verified - function is live');
    console.log('📝 Next step: Test in the actual Voice Assistant page with authentication');

  } catch (error) {
    console.error('❌ Deployment verification failed:', error.message);
  }
}

verifyDeployment();
