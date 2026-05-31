import algosdk from 'algosdk';

console.log('=== Finding Correct Signing Format ===');

// Test program
const program = new Uint8Array([6, 1, 1, 40]);
const account = algosdk.generateAccount();
const secretKey = account.sk;
const publicKey = algosdk.encodeAddress(account.sk.slice(32));

console.log('Program:', Array.from(program));
console.log('Account:', publicKey);

// What we currently do (wrong approach)
function currentApproach() {
  console.log('\n=== Current Approach (Failing) ===');
  const programTag = new TextEncoder().encode('Program');
  const toSign = new Uint8Array(programTag.length + program.length);
  toSign.set(programTag, 0);
  toSign.set(program, programTag.length);
  
  console.log('We ask Pera to sign:', Array.from(toSign));
  
  const fullSig = algosdk.nacl.sign(toSign, secretKey);
  const sig = fullSig.slice(0, 64);
  console.log('Result signature:', Array.from(sig));
  
  return sig;
}

// What algosdk actually does (working approach)
function correctApproach() {
  console.log('\n=== Correct Approach (Working) ===');
  const lsigAccount = new algosdk.LogicSigAccount(program);
  lsigAccount.sign(secretKey);
  
  console.log('SDK produces signature:', Array.from(lsigAccount.lsig.sig));
  console.log('Verification result:', lsigAccount.verify());
  
  return lsigAccount.lsig.sig;
}

// Test different approaches to match SDK behavior
function testAlternatives() {
  console.log('\n=== Testing Alternative Approaches ===');
  
  const alternatives = [
    // Test 1: Sign just the program bytes (no prefix)
    () => {
      console.log('Test 1: Raw program bytes');
      const fullSig = algosdk.nacl.sign(program, secretKey);
      return fullSig.slice(0, 64);
    },
    
    // Test 2: Use algosdk.signBytes on program
    () => {
      console.log('Test 2: algosdk.signBytes(program)');
      return algosdk.signBytes(program, secretKey);
    },
    
    // Test 3: Hash the program first, then sign
    () => {
      console.log('Test 3: Sign SHA256 hash of program');
      const hash = algosdk.sha256(program);
      const fullSig = algosdk.nacl.sign(hash, secretKey);
      return fullSig.slice(0, 64);
    },
    
    // Test 4: Try ProgData prefix
    () => {
      console.log('Test 4: ProgData prefix');
      const prefix = new TextEncoder().encode('ProgData');
      const toSign = new Uint8Array(prefix.length + program.length);
      toSign.set(prefix, 0);
      toSign.set(program, prefix.length);
      const fullSig = algosdk.nacl.sign(toSign, secretKey);
      return fullSig.slice(0, 64);
    },
    
    // Test 5: Try empty prefix with hash
    () => {
      console.log('Test 5: Hash("Program" + program)');
      const prefix = new TextEncoder().encode('Program');
      const combined = new Uint8Array(prefix.length + program.length);
      combined.set(prefix, 0);
      combined.set(program, prefix.length);
      const hash = algosdk.sha256(combined);
      const fullSig = algosdk.nacl.sign(hash, secretKey);
      return fullSig.slice(0, 64);
    }
  ];
  
  const correctSig = correctApproach();
  
  alternatives.forEach((testFunc, index) => {
    try {
      const testSig = testFunc();
      const matches = testSig.length === correctSig.length && 
                     testSig.every((byte, i) => byte === correctSig[i]);
      
      console.log(`Result ${index + 1}:`, matches ? '✅ MATCH!' : '❌ No match');
      if (matches) {
        console.log('🎉 FOUND THE CORRECT METHOD!');
      } else {
        console.log('Signature:', Array.from(testSig.slice(0, 10)), '...');
      }
    } catch (error) {
      console.log(`Result ${index + 1}: Error -`, error.message);
    }
  });
}

// Run tests
currentApproach();
correctApproach();
testAlternatives();