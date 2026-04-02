/**
 * Test confirmation dialog flow
 *
 * Tests:
 * 1. agent-planner creates execution plan
 * 2. Plan is returned with actions array
 * 3. agent-executor-confirmed executes the plan
 */

const SUPABASE_URL = 'https://xfkitnutpzhaamuaaelp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2l0bnV0cHpoYWFtdWFhZWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjI2MjksImV4cCI6MjA4MzY5ODYyOX0.PLIfB_dD2w2djtIzntHXLkf52PfBp3SAlh3KNi0loTc';

async function testConfirmationFlow() {
  console.log('\n🚀 TESTING CONFIRMATION DIALOG FLOW\n');
  console.log('='.repeat(70));

  const testCommand = "Invoice Nicholas Sawyer for a consultation he had today at 5pm with a 5% discount";

  console.log(`\n📤 STEP 1: Create execution plan`);
  console.log(`Command: "${testCommand}"\n`);

  const start1 = Date.now();

  // Step 1: Call agent-planner
  const planResponse = await fetch(`${SUPABASE_URL}/functions/v1/agent-planner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      input: testCommand,
      user_id: '00000000-0000-0000-0000-000000000000',
    }),
  });

  const time1 = Date.now() - start1;

  if (!planResponse.ok) {
    console.log(`❌ HTTP ${planResponse.status}`);
    console.log(await planResponse.text());
    return;
  }

  const planResult = await planResponse.json();

  if (planResult.success && planResult.plan) {
    console.log(`✅ PLAN CREATED (${time1}ms)\n`);
    console.log(`Summary: ${planResult.plan.summary}\n`);
    console.log(`Actions:`);
    planResult.plan.actions.forEach((action, idx) => {
      console.log(`  ${idx + 1}. ${action.description}`);
      if (action.result?.price) {
        console.log(`     Price: £${action.result.price}`);
      }
    });

    if (planResult.plan.warnings && planResult.plan.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      planResult.plan.warnings.forEach(warning => {
        console.log(`  - ${warning}`);
      });
    }

    // Wait a moment
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Execute the plan
    console.log(`\n📤 STEP 2: Execute confirmed plan\n`);

    const start2 = Date.now();

    const executeResponse = await fetch(`${SUPABASE_URL}/functions/v1/agent-executor-confirmed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        plan: planResult.plan,
        user_id: '00000000-0000-0000-0000-000000000000',
      }),
    });

    const time2 = Date.now() - start2;

    if (!executeResponse.ok) {
      console.log(`❌ HTTP ${executeResponse.status}`);
      console.log(await executeResponse.text());
      return;
    }

    const executeResult = await executeResponse.json();

    console.log('Full response:', JSON.stringify(executeResult, null, 2));

    if (executeResult.success) {
      console.log(`✅ EXECUTION COMPLETE (${time2}ms)\n`);
      console.log(`Summary: ${executeResult.summary}\n`);
      console.log(`Results:`);
      executeResult.results.forEach((result, idx) => {
        const status = result.result.success ? '✅' : '❌';
        console.log(`  ${status} ${idx + 1}. ${result.description}`);
        console.log(`     ${result.result.message}`);
      });
    } else {
      console.log(`❌ EXECUTION FAILED`);
      console.log(`Error: ${executeResult.error}\n`);
      if (executeResult.results) {
        console.log(`Results:`);
        executeResult.results.forEach((result, idx) => {
          const status = result.result.success ? '✅' : '❌';
          console.log(`  ${status} ${idx + 1}. ${result.description}`);
          console.log(`     ${result.result.message || result.result.error}`);
        });
      }
    }

  } else {
    console.log(`❌ PLANNING FAILED`);
    console.log(`Error: ${planResult.error}\n`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70) + '\n');
}

testConfirmationFlow().catch(console.error);
