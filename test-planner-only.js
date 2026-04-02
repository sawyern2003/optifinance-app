/**
 * Test just the planner to see what error is happening
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testPlanner() {
  console.log('\n🧪 TESTING PLANNER\n');

  const testCommands = [
    "What's on the calendar today?",
    "Invoice Nicholas for a consultation",
    "Book Sarah for Botox tomorrow at 3pm"
  ];

  for (const command of testCommands) {
    console.log(`\n📤 Testing: "${command}"`);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-planner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          input: command,
          user_id: '00000000-0000-0000-0000-000000000000',
        }),
      });

      console.log(`Status: ${response.status}`);

      const text = await response.text();
      console.log(`Raw response:`, text);

      if (response.ok) {
        const result = JSON.parse(text);
        if (result.success && result.plan) {
          console.log(`✅ Plan: ${result.plan.summary}`);
        } else {
          console.log(`❌ Failed:`, result);
        }
      } else {
        console.log(`❌ HTTP Error`);
      }

    } catch (error) {
      console.error(`❌ Error:`, error.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

testPlanner().catch(console.error);
