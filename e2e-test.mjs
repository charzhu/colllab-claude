#!/usr/bin/env node
/**
 * End-to-End Test for collab-claude-code
 *
 * Tests the complete workflow:
 * 1. Project scanning
 * 2. Initialization with context-aware policies
 * 3. Trust level checking (file-level and with annotations)
 * 4. Creating and managing proposals
 * 5. Recording authorship
 * 6. Recording and retrieving intents
 * 7. Status reporting
 *
 * Run with: node e2e-test.mjs
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the collab module
const collab = await import('./dist/collab.js');

// Test directory
const TEST_DIR = path.join(__dirname, '.e2e-test');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function log(msg) {
  console.log(msg);
}

function pass(test) {
  console.log(`${colors.green}✓${colors.reset} ${test}`);
}

function fail(test, error) {
  console.log(`${colors.red}✗${colors.reset} ${test}`);
  console.log(`  ${colors.dim}${error}${colors.reset}`);
}

function section(title) {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

async function setup() {
  // Clean up any previous test
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Change to test directory
  process.chdir(TEST_DIR);

  // Create a realistic project structure
  const structure = {
    'package.json': JSON.stringify({
      name: 'test-project',
      dependencies: {
        'next': '^14.0.0',
        'react': '^18.0.0',
      }
    }, null, 2),
    'src/index.ts': '// Entry point\nexport const main = () => console.log("hello");',
    'src/core/business.ts': '// Core business logic\nexport function calculatePrice() { return 100; }',
    'src/auth/login.ts': `
// @collab trust="SUGGEST_ONLY" owner="auth-team"
export async function login(email: string, password: string) {
  // Authentication logic
  return { token: 'xxx' };
}
`,
    'src/security/crypto.ts': `
// @collab trust="READ_ONLY" owner="security-team"
export function encrypt(data: string): string {
  // Encryption logic - DO NOT MODIFY
  return Buffer.from(data).toString('base64');
}
`,
    'src/utils/format.ts': '// Utility functions\nexport const formatDate = (d: Date) => d.toISOString();',
    'tests/index.test.ts': '// Tests\ntest("works", () => expect(true).toBe(true));',
    'generated/types.ts': '// Auto-generated types\nexport type ID = string;',
  };

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(TEST_DIR, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
}

async function cleanup() {
  process.chdir(__dirname);
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, errorMsg = 'Assertion failed') => {
    if (condition) {
      pass(testName);
      passed++;
    } else {
      fail(testName, errorMsg);
      failed++;
    }
  };

  try {
    // ========================================
    section('1. PROJECT SCANNING');
    // ========================================

    const scanResult = await collab.scanProject('.');

    assert(
      scanResult.detected_languages.includes('typescript'),
      'Detects TypeScript language',
      `Got: ${scanResult.detected_languages}`
    );

    assert(
      scanResult.detected_frameworks.includes('nextjs'),
      'Detects Next.js framework',
      `Got: ${scanResult.detected_frameworks}`
    );

    assert(
      scanResult.detected_frameworks.includes('react'),
      'Detects React framework',
      `Got: ${scanResult.detected_frameworks}`
    );

    assert(
      scanResult.suggested_policies.length > 0,
      'Generates suggested policies',
      `Got ${scanResult.suggested_policies.length} policies`
    );

    assert(
      scanResult.existing_trust_file === false,
      'Reports no existing trust file',
      `Got: ${scanResult.existing_trust_file}`
    );

    // ========================================
    section('2. INITIALIZATION');
    // ========================================

    const initResult = await collab.initializeCollab(true);

    assert(
      initResult !== null,
      'Returns scan result on init',
      'initializeCollab returned null'
    );

    const trustExists = await collab.fileExists('.collab/trust.yaml');
    assert(trustExists, 'Creates .collab/trust.yaml');

    const configExists = await collab.fileExists('.collab/config.yaml');
    assert(configExists, 'Creates .collab/config.yaml');

    const metaExists = await collab.fileExists('.collab/meta');
    assert(metaExists, 'Creates .collab/meta/ directory');

    // Verify policies were created correctly
    const trustConfig = await collab.loadTrustConfig();

    assert(
      trustConfig.default_trust === 'SUPERVISED',
      'Sets default trust to SUPERVISED',
      `Got: ${trustConfig.default_trust}`
    );

    assert(
      trustConfig.policies.some(p => p.pattern.includes('test')),
      'Includes test file policies',
      'No test policies found'
    );

    // ========================================
    section('3. TRUST LEVEL CHECKING');
    // ========================================

    // Test file-level trust (from policies)
    const testFileTrust = collab.getTrustLevel(trustConfig, 'tests/index.test.ts');
    assert(
      testFileTrust.level === 'AUTONOMOUS',
      'Test files get AUTONOMOUS trust',
      `Got: ${testFileTrust.level}`
    );

    const generatedTrust = collab.getTrustLevel(trustConfig, 'generated/types.ts');
    assert(
      generatedTrust.level === 'AUTONOMOUS',
      'Generated files get AUTONOMOUS trust',
      `Got: ${generatedTrust.level}`
    );

    const coreTrust = collab.getTrustLevel(trustConfig, 'src/core/business.ts');
    assert(
      coreTrust.level === 'SUGGEST_ONLY',
      'Core files get SUGGEST_ONLY trust',
      `Got: ${coreTrust.level}`
    );

    // Test annotation-based trust
    const authTrust = await collab.getTrustLevelWithAnnotations(
      trustConfig,
      'src/auth/login.ts',
      3,  // Line of the function
      6
    );
    assert(
      authTrust.level === 'SUGGEST_ONLY',
      'Annotation trust="SUGGEST_ONLY" is respected',
      `Got: ${authTrust.level}`
    );
    assert(
      authTrust.owner === 'auth-team',
      'Annotation owner is extracted',
      `Got: ${authTrust.owner}`
    );

    const securityTrust = await collab.getTrustLevelWithAnnotations(
      trustConfig,
      'src/security/crypto.ts',
      3,
      6
    );
    assert(
      securityTrust.level === 'READ_ONLY',
      'Annotation trust="READ_ONLY" is respected',
      `Got: ${securityTrust.level}`
    );

    // ========================================
    section('4. ANNOTATION PARSING');
    // ========================================

    const authAnnotations = await collab.parseAnnotations('src/auth/login.ts');
    assert(
      authAnnotations.length > 0,
      'Parses annotations from auth file',
      `Found ${authAnnotations.length} annotations`
    );

    if (authAnnotations.length > 0) {
      assert(
        authAnnotations[0].trust === 'SUGGEST_ONLY',
        'Extracts correct trust level from annotation',
        `Got: ${authAnnotations[0].trust}`
      );
      assert(
        authAnnotations[0].owner === 'auth-team',
        'Extracts correct owner from annotation',
        `Got: ${authAnnotations[0].owner}`
      );
    }

    // ========================================
    section('5. CHANGE PROPOSALS');
    // ========================================

    const proposal = {
      id: collab.generateId(),
      created_at: new Date().toISOString(),
      author: 'claude',
      status: 'pending',
      file_path: 'src/core/business.ts',
      description: 'Optimize calculatePrice function',
      rationale: 'Current implementation is inefficient',
      old_code: 'return 100;',
      new_code: 'return cachedPrice ?? 100;',
      confidence: 0.85,
      risks: ['Cache invalidation'],
      tests_needed: ['Test cache behavior'],
    };

    await collab.saveProposal(proposal);

    const proposals = await collab.loadProposals();
    assert(
      proposals.length === 1,
      'Saves and loads proposal',
      `Found ${proposals.length} proposals`
    );

    assert(
      proposals[0].id === proposal.id,
      'Proposal ID matches',
      `Got: ${proposals[0].id}`
    );

    assert(
      proposals[0].status === 'pending',
      'Proposal status is pending',
      `Got: ${proposals[0].status}`
    );

    // Delete proposal
    await collab.deleteProposal(proposal.id);
    const afterDelete = await collab.loadProposals();
    assert(
      afterDelete.length === 0,
      'Deletes proposal successfully',
      `Still found ${afterDelete.length} proposals`
    );

    // ========================================
    section('6. AUTHORSHIP TRACKING');
    // ========================================

    const authorshipRecord = {
      timestamp: new Date().toISOString(),
      author: 'claude',
      model: 'claude-opus-4',
      file_path: 'src/utils/format.ts',
      line_start: 1,
      line_end: 5,
      confidence: 0.95,
    };

    await collab.recordAuthorship(authorshipRecord);

    const authorship = await collab.loadAuthorship('src/utils/format.ts');
    assert(
      authorship.length === 1,
      'Records and loads authorship',
      `Found ${authorship.length} records`
    );

    assert(
      authorship[0].author === 'claude',
      'Authorship author is correct',
      `Got: ${authorship[0].author}`
    );

    assert(
      authorship[0].confidence === 0.95,
      'Authorship confidence is correct',
      `Got: ${authorship[0].confidence}`
    );

    // ========================================
    section('7. INTENT RECORDING');
    // ========================================

    const intent = {
      recorded_at: new Date().toISOString(),
      author: 'claude',
      file_path: 'src/core/business.ts',
      region_name: 'calculatePrice',
      line_start: 2,
      line_end: 2,
      intent: 'Calculate the final price including discounts and taxes',
      constraints: ['Must handle negative values', 'Must be deterministic'],
      non_goals: ['Currency conversion'],
    };

    await collab.saveIntent(intent);

    const intents = await collab.loadIntents('src/core/business.ts');
    assert(
      intents.length === 1,
      'Records and loads intent',
      `Found ${intents.length} intents`
    );

    assert(
      intents[0].region_name === 'calculatePrice',
      'Intent region name is correct',
      `Got: ${intents[0].region_name}`
    );

    assert(
      intents[0].constraints.length === 2,
      'Intent constraints are preserved',
      `Got ${intents[0].constraints?.length} constraints`
    );

    // ========================================
    section('8. STATUS REPORTING');
    // ========================================

    const fileStatus = await collab.getFileStatus('src/utils/format.ts');
    assert(
      fileStatus.primary_author === 'claude',
      'File status shows correct primary author',
      `Got: ${fileStatus.primary_author}`
    );

    assert(
      fileStatus.average_confidence === 0.95,
      'File status shows correct confidence',
      `Got: ${fileStatus.average_confidence}`
    );

    const projectStatus = await collab.getProjectStatus();
    assert(
      projectStatus.total_files_tracked >= 1,
      'Project status tracks files',
      `Got: ${projectStatus.total_files_tracked} files`
    );

    assert(
      projectStatus.pending_proposals === 0,
      'Project status shows 0 pending proposals',
      `Got: ${projectStatus.pending_proposals}`
    );

    // ========================================
    section('9. RE-INITIALIZATION (PRESERVES EXISTING)');
    // ========================================

    // Modify trust.yaml
    const customConfig = await collab.loadTrustConfig();
    customConfig.policies.push({
      pattern: '**/custom/**',
      trust: 'READ_ONLY',
      reason: 'Custom policy',
    });
    await collab.saveTrustConfig(customConfig);

    // Re-run init
    await collab.initializeCollab(true);

    // Check that custom policy is preserved
    const afterReinit = await collab.loadTrustConfig();
    const hasCustom = afterReinit.policies.some(p => p.pattern === '**/custom/**');
    assert(
      hasCustom,
      'Re-init preserves existing trust.yaml',
      'Custom policy was overwritten'
    );

    // ========================================
    section('SUMMARY');
    // ========================================

    console.log('');
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log('');

    return failed === 0;

  } catch (error) {
    console.error(`\n${colors.red}Test crashed:${colors.reset}`, error);
    return false;
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  collab-claude-code End-to-End Tests');
  console.log(`${'='.repeat(60)}`);

  log(`\n${colors.dim}Setting up test environment...${colors.reset}`);
  await setup();
  log(`${colors.dim}Test directory: ${TEST_DIR}${colors.reset}`);

  const success = await runTests();

  log(`\n${colors.dim}Cleaning up...${colors.reset}`);
  await cleanup();

  process.exit(success ? 0 : 1);
}

main();
