import algosdk from 'algosdk';

// Test program - simple always-approve LogicSig
const program = new Uint8Array([6, 1, 1, 40]); // TEAL: #pragma version 6; int 1; return

console.log('=== LogicSig Signature Debug ===');
console.log('Program bytes:', Array.from(program));

// Create LogicSigAccount
const lsigAccount = new algosdk.LogicSigAccount(program);
console.log('LogicSig address (contract):', lsigAccount.address().toString());

// Test with mock signing
const secretKey = algosdk.generateAccount().sk;
const publicKey = algosdk.generateAccount().addr;

console.log('\n=== Test Delegation Signature ===');

// What we're currently doing in delegationSigner.ts
function logicSigProgramSignBytes(programBytes) {
  const programTag = new TextEncoder().encode('Program');
  const toSign = new Uint8Array(programTag.length + programBytes.length);
  toSign.set(programTag, 0);
  toSign.set(programBytes, programTag.length);
  return toSign;
}

const signBytes = logicSigProgramSignBytes(program);
console.log('Sign bytes we create:', Array.from(signBytes));
console.log('Sign bytes string:', new TextDecoder().decode(signBytes.slice(0, 7)));

// Test what the algosdk expects vs what we provide
try {
  // Test 1: Use algosdk's own signing method
  const testLsig1 = new algosdk.LogicSigAccount(program);
  testLsig1.sign(secretKey);
  console.log('\nAlgosdk internal signature:', Array.from(testLsig1.lsig.sig || []));
  console.log('Algosdk internal sigkey:', Array.from(testLsig1.sigkey || []));
  console.log('Algosdk verify result:', testLsig1.verify());

  // Test 2: Use our manual approach
  const testLsig2 = new algosdk.LogicSigAccount(program);
  // Simulate what we get from wallet signing
  const mockSignature = algosdk.nacl.sign(signBytes, secretKey);
  const sig = mockSignature.slice(0, 64); // Remove the message part
  
  console.log('\nOur mock signature:', Array.from(sig));
  
  // Attach like we do in attachDelegationSignature
  testLsig2.lsig.sig = sig;
  testLsig2.sigkey = algosdk.decodeAddress(algosdk.encodeAddress(algosdk.generateAccount().sk.slice(32))).publicKey;
  console.log('Our verify result:', testLsig2.verify());

} catch (error) {
  console.error('Error in signature test:', error.message);
}

// Test 3: Check what signProgram returns
console.log('\n=== signProgram test ===');
const testLsig3 = new algosdk.LogicSig(program);
try {
  const progSig = testLsig3.signProgram(secretKey);
  console.log('signProgram result:', Array.from(progSig));
} catch (error) {
  console.error('signProgram error:', error.message);
}