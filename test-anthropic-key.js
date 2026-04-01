/**
 * Test Anthropic API key directly
 */

async function testAnthropicKey() {
  console.log('Testing Anthropic API key...\n');

  const apiKey = process.env.ANTHROPIC_API_KEY || 'YOUR_KEY_HERE';

  if (apiKey === 'YOUR_KEY_HERE') {
    console.log('❌ Please set ANTHROPIC_API_KEY environment variable');
    console.log('Run: export ANTHROPIC_API_KEY=sk-ant-api03-...');
    process.exit(1);
  }

  console.log('API Key format check:', apiKey.substring(0, 15) + '...');
  console.log('Key length:', apiKey.length);

  // Test with different model names
  const modelsToTest = [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ];

  for (const model of modelsToTest) {
    console.log(`\nTesting model: ${model}`);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Say hello' }]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${model} works!`);
        console.log('Response:', data.content[0].text);
        return;
      } else {
        const error = await response.text();
        console.log(`❌ ${model} failed:`, error);
      }
    } catch (error) {
      console.log(`❌ ${model} error:`, error.message);
    }
  }

  console.log('\n⚠️  No models worked. Please check:');
  console.log('1. API key is correct from https://console.anthropic.com/settings/keys');
  console.log('2. API key has not expired');
  console.log('3. You have credits/billing set up');
}

testAnthropicKey();
