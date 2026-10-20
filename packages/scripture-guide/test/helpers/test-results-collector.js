/**
 * Test Results Collector
 * Captures detailed input/output data from tests for comprehensive reporting.
 */

// Global storage for test results
const testResults = {
  metadata: {
    timestamp: null,
    version: null
  },
  suites: {}
};

/**
 * Record a test case result with full input/output details
 */
export function recordTestResult(suite, testId, data) {
  if (!testResults.suites[suite]) {
    testResults.suites[suite] = [];
  }

  testResults.suites[suite].push({
    testId,
    timestamp: new Date().toISOString(),
    ...data
  });
}

/**
 * Get all collected test results
 */
export function getTestResults() {
  return testResults;
}

/**
 * Clear all collected results (for fresh test run)
 */
export function clearTestResults() {
  testResults.metadata.timestamp = new Date().toISOString();
  testResults.suites = {};
}

/**
 * Set metadata about the test run
 */
export function setMetadata(key, value) {
  testResults.metadata[key] = value;
}

export default {
  recordTestResult,
  getTestResults,
  clearTestResults,
  setMetadata
};
