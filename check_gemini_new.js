const apiKey = 'AIzaSyDfpM4htp-BZyAiY6X9n_5uFvlA4Vpq3Og';

async function checkModels(version) {
  const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(`--- Version: ${version} ---`);
    if (data.models) {
      data.models.forEach(m => {
        console.log(`Name: ${m.name} | Methods: ${m.supportedGenerationMethods.join(', ')}`);
      });
    } else {
      console.log('No models found or error:', JSON.stringify(data.error || data));
    }
  } catch (err) {
    console.log(`Fetch error for ${version}:`, err.message);
  }
}

async function run() {
  await checkModels('v1');
  await checkModels('v1beta');
}

run();
