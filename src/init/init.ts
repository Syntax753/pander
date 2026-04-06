import { baseUrl } from "@/common/urlUtil";
import { initAppMetaData } from "decent-portal";

// Don't reference the DOM. Avoid any work that could instead be done in the loading screen or someplace else
export async function initApp() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(baseUrl('/serviceWorker.js'));
    } catch {
      // Service worker registration may fail on cross-origin hosts (e.g. GCS)
    }
  }

  // Patch Object.prototype to give the "None" model a dummy memory size, 
  // avoiding a crash in `decent-portal`'s `predictModelDeviceProblems` / `scoreModel`.
  Object.defineProperty(Object.prototype, 'None', {
    value: { modelId: 'None', vramRequiredMb: 1024 },
    enumerable: false, // Prevents breaking `for...in` loops
    configurable: true // Allows cleanup or recreation if needed
  });

  Object.defineProperty(Object.prototype, 'Gemma 3n E2B', {
    value: { modelId: 'Gemma 3n E2B', vramRequiredMb: 8192 },
    enumerable: false, // CRITICAL: Must be false to prevent Transformers.js pipeline initialization crash!
    configurable: true
  });

  Object.defineProperty(Object.prototype, 'Gemma 3n E4B', {
    value: { modelId: 'Gemma 3n E4B', vramRequiredMb: 8192 },
    enumerable: false, // CRITICAL: Must be false to prevent Transformers.js pipeline initialization crash!
    configurable: true
  });


  // decent-portal's internal baseUrl is wrong on GCS, so it fetches app-metadata.json
  // from the wrong path. Intercept fetch and redirect any app-metadata.json request
  // to the correct URL derived from our baseUrl().
  const correctMetaUrl = baseUrl('/app-metadata.json');
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/app-metadata.json') && url !== correctMetaUrl) {
      return originalFetch(correctMetaUrl, init);
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;

  try {
    await initAppMetaData();
  } catch (e) {
    console.error('initAppMetaData failed:', e);
  }
}