import algosdk from 'algosdk';

// Test what the actual signing format should be
const program = new Uint8Array([6, 1, 1, 40]); // Simple always-approve

console.log('=== Testing Signature Formats ===');

// Generate test keys
const account = algosdk.generateAccount();
const secretKey = account.sk;
const publicKey = account.addr;

console.log('Test account:', publicKey);
console.log('Program bytes:', Array.from(program));

// Test 1: What does algosdk.LogicSig.sign() actually do internally?
console.log('\n=== Test 1: Internal LogicSig.sign() ===');
const lsig1 = new algosdk.LogicSig(program);
lsig1.sign(secretKey);
console.log('Internal signature:', Array.from(lsig1.sig));

// Test 2: What does LogicSigAccount.sign() do?
console.log('\n=== Test 2: LogicSigAccount.sign() ===');
const lsigAccount = new algosdk.LogicSigAccount(program);
lsigAccount.sign(secretKey);
console.log('LogicSigAccount signature:', Array.from(lsigAccount.lsig.sig));
console.log('LogicSigAccount sigkey:', Array.from(lsigAccount.sigkey || []));
console.log('Verify result:', lsigAccount.verify());

// Test 3: Different domain separators
console.log('\n=== Test 3: Domain Separators ===');

const testDomainSeparators = [
  'Program',
  'MX', 
  'ProgData',
  '', // No separator
  'TX', // Transaction prefix
];

for (const separator of testDomainSeparators) {
  console.log(`\nTesting separator: "${separator}"`);
  
  // Create sign bytes
  let signBytes;
  if (separator) {
    const sepBytes = new TextEncoder().encode(separator);
    signBytes = new Uint8Array(sepBytes.length + program.length);
    signBytes.set(sepBytes, 0);
    signBytes.set(program, sepBytes.length);
  } else {
    signBytes = program; // No separator
  }
  
  console.log('Sign bytes:', Array.from(signBytes));
  
  try {
    // Sign with nacl
    const fullSig = algosdk.nacl.sign(signBytes, secretKey);
    const sig = fullSig.slice(0, 64); // Remove message part
    
    // Test verification
    const testLsig = new algosdk.LogicSigAccount(program);
    testLsig.lsig.sig = sig;
    testLsig.sigkey = algosdk.decodeAddress(publicKey).publicKey;
    
    const isValid = testLsig.verify();
    console.log(`Verification result: ${isValid}`);
    
    if (isValid) {
      console.log('✅ SUCCESS! Found working separator:', separator);
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

// Test 4: Try signBytes function
console.log('\n=== Test 4: Using algosdk.signBytes ===');
try {
  const bytesSignature = algosdk.signBytes(program, secretKey);
  console.log('signBytes result:', Array.from(bytesSignature));
  
  const testLsig = new algosdk.LogicSigAccount(program);
  testLsig.lsig.sig = bytesSignature;
  testLsig.sigkey = algosdk.decodeAddress(publicKey).publicKey;
  
  const isValid = testLsig.verify();
  console.log('signBytes verification:', isValid);
} catch (error) {
  console.log('signBytes error:', error.message);
}

// Test 5: Try using tealSignFromProgram
console.log('\n=== Test 5: Using tealSignFromProgram ===');
try {
  // Empty data for delegation
  const emptyData = new Uint8Array(0);
  const tealSig = algosdk.tealSignFromProgram(secretKey, emptyData, program);
  console.log('tealSignFromProgram result:', Array.from(tealSig));
  
  const testLsig = new algosdk.LogicSigAccount(program);
  testLsig.lsig.sig = tealSig;
  testLsig.sigkey = algosdk.decodeAddress(publicKey).publicKey;
  
  const isValid = testLsig.verify();
  console.log('tealSignFromProgram verification:', isValid);
} catch (error) {
  console.log('tealSignFromProgram error:', error.message);
}