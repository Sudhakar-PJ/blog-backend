/**
 * Detects if the request is coming from a web browser based on common headers.
 * @param {import('express').Request} req 
 * @returns {boolean}
 */
const isWebBrowser = (req) => {
  // Test environment should behave like a browser for cookie-auth verification
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  // 1. Explicit override for future apps
  if (req.headers['x-client-platform'] === 'mobile' || req.headers['x-client-platform'] === 'app') {
    return false;
  }

  // 2. Modern browsers send Sec-Fetch-Mode
  if (req.headers['sec-fetch-mode']) {
    return true;
  }

  // 3. Presence of Origin or Referer usually indicates a browser for cross-origin or same-site AJAX
  if (req.headers['origin'] || req.headers['referer']) {
    return true;
  }

  // 4. Default: assume App if no browser-specific headers are found
  // This is safer for future-proofing since we want to be explicit about browsers
  return false;
};

module.exports = { isWebBrowser };
