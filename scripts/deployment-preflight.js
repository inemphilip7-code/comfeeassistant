/**
 * Vabatim Deployment Preflight Inspector
 * Automated pre-deployment validation check for Vercel and Render deployments.
 */

const fs = require('fs');
const path = require('path');

let errors = 0;
let warnings = 0;

function logPass(msg) {
  console.log(`[PASS] ${msg}`);
}

function logFail(msg) {
  console.error(`[FAIL] ${msg}`);
  errors++;
}

function logWarn(msg) {
  console.warn(`[WARN] ${msg}`);
  warnings++;
}

console.log(`=======================================================`);
console.log(` VABATIM AUTOMATED DEPLOYMENT PREFLIGHT CHECK`);
console.log(`=======================================================`);

// 1. Check package.json engines & build scripts
const pkgPath = path.join(__dirname, '../package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.engines && pkg.engines.node) {
    logPass(`package.json contains engines declaration: ${pkg.engines.node}`);
  } else {
    logWarn(`package.json missing engines declaration`);
  }

  if (pkg.scripts && pkg.scripts.build && pkg.scripts.build.includes('prisma generate')) {
    logPass(`package.json build script includes prisma generate`);
  } else {
    logFail(`package.json build script must include prisma generate`);
  }
} else {
  logFail(`package.json not found`);
}

// 2. Check the Render-hosted API service.
const renderPath = path.join(__dirname, '../render.yaml');
if (fs.existsSync(renderPath)) {
  const renderContent = fs.readFileSync(renderPath, 'utf8');
  if (
    renderContent.includes('npm run build') &&
    renderContent.includes('startCommand: npm start') &&
    renderContent.includes('healthCheckPath: /health') &&
    renderContent.includes('value: openrouter') &&
    renderContent.includes('key: OPENROUTER_API_KEY') &&
    renderContent.includes('key: JWT_SECRET') &&
    renderContent.includes('generateValue: true')
  ) {
    logPass(`render.yaml builds, starts, and health-checks the API with OpenRouter and generated JWT secret`);
  } else {
    logFail(`render.yaml must define the API build, /health check, OpenRouter secret, and generated JWT secret`);
  }
} else {
  logFail(`render.yaml not found`);
}

// 3. Check the Vercel-hosted Vite frontend.
const vercelPath = path.join(__dirname, '../vercel.json');
if (fs.existsSync(vercelPath)) {
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    if (
      vercelConfig.framework === 'vite' &&
      String(vercelConfig.buildCommand || '').includes('frontend') &&
      vercelConfig.outputDirectory === 'frontend/dist'
    ) {
      logPass(`vercel.json builds and publishes the Vite frontend`);
    } else {
      logFail(`vercel.json must build the frontend and publish frontend/dist`);
    }
  } catch {
    logFail(`vercel.json must contain valid JSON`);
  }
} else {
  logFail(`vercel.json not found`);
}

// 4. Verify the frontend fails fast if its Render API URL is missing on Vercel.
const viteConfigPath = path.join(__dirname, '../frontend/vite.config.ts');
if (fs.existsSync(viteConfigPath)) {
  const viteContent = fs.readFileSync(viteConfigPath, 'utf8');
  if (viteContent.includes('VITE_API_URL') && viteContent.includes("process.env.VERCEL === '1'")) {
    logPass(`Vite production build requires VITE_API_URL`);
  } else {
    logFail(`Vite must fail its Vercel build when VITE_API_URL is missing`);
  }
} else {
  logFail(`frontend/vite.config.ts not found`);
}

// 5. Check DeviceSpeechProvider SSR Guard.
const deviceSpeechPath = path.join(__dirname, '../src/providers/speech/DeviceSpeechProvider.ts');
if (fs.existsSync(deviceSpeechPath)) {
  const speechContent = fs.readFileSync(deviceSpeechPath, 'utf8');
  if (speechContent.includes("typeof window !== 'undefined'") || speechContent.includes("typeof globalThis !== 'undefined'")) {
    logPass(`DeviceSpeechProvider.ts includes SSR browser global checks`);
  } else {
    logFail(`DeviceSpeechProvider.ts missing SSR window/globalThis guards`);
  }
}

// 6. Check Server Host Binding (0.0.0.0)
const serverPath = path.join(__dirname, '../src/server.ts');
if (fs.existsSync(serverPath)) {
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  if (serverContent.includes('0.0.0.0')) {
    logPass(`src/server.ts explicitly binds to host 0.0.0.0`);
  } else {
    logWarn(`src/server.ts should explicitly bind to 0.0.0.0 for Render production`);
  }
}

console.log(`=======================================================`);
if (errors > 0) {
  console.error(`PREFLIGHT CHECK FAILED (${errors} errors, ${warnings} warnings)`);
  process.exit(1);
} else {
  console.log(`PREFLIGHT CHECK PASSED (0 errors, ${warnings} warnings)`);
  process.exit(0);
}
