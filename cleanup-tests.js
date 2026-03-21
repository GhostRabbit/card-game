#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Remove test-results directory if it exists
const testResultsPath = path.join(__dirname, 'test-results');
if (fs.existsSync(testResultsPath)) {
  console.log('Cleaning up test-results directory...');
  try {
    fs.rmSync(testResultsPath, { recursive: true, force: true });
    console.log('✓ Cleaned up test-results');
  } catch (err) {
    console.warn('Warning: Could not clean test-results:', err.message);
  }
}

// Also clean up test-results-latest if needed
const testResultsLatestPath = path.join(__dirname, 'test-results-latest');
if (fs.existsSync(testResultsLatestPath)) {
  try {
    fs.rmSync(testResultsLatestPath, { recursive: true, force: true });
  } catch (err) {
    // Ignore
  }
}
