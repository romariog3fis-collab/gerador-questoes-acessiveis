const apiKey = 'AIzaSyD5nzz0ckoJWtCUGnJZgKZWys1JjSt9QuU';

async function checkModels(version) {
  const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(`--- Version: ${version} ---`);
    if (data.models) {
      data.models.forEach(m => {
        if (m.name.includes('flash')) {
          console.log(`Found: ${m.name}`);
        }
      });
    } else {
      console.log('No models found or error:', data.error?.message || 'Unknown error');
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
