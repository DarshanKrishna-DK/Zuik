import algosdk from 'algosdk';

console.log('=== Simple Signing Test ===');

// Test program
const program = new Uint8Array([6, 1, 1, 40]);
const account = algosdk.generateAccount();
const secretKey = account.sk;
const publicKey = algosdk.encodeAddress(account.sk.slice(32));

console.log('Program:', Array.from(program));
console.log('Account:', publicKey);

// What algosdk actually does internally
console.log('\n=== What algosdk does (working) ===');
const lsigAccount = new algosdk.LogicSigAccount(program);
lsigAccount.sign(secretKey);

const correctSignature = lsigAccount.lsig.sig;
console.log('Correct signature:', Array.from(correctSignature));
console.log('Verification:', lsigAccount.verify());

// Let's try to reverse engineer: test signBytes on different inputs
console.log('\n=== Testing algosdk.signBytes on different inputs ===');

const testInputs = [
  { name: 'Raw program', data: program },
  { name: 'SHA256(program)', data: algosdk.sha256(program) },
];

// Test different prefixes with signBytes
const prefixes = ['', 'MX', 'Program', 'ProgData'];

for (const prefix of prefixes) {
  for (const input of testInputs) {
    try {
      let dataToSign;
      if (prefix) {
        const prefixBytes = new TextEncoder().encode(prefix);
        dataToSign = new Uint8Array(prefixBytes.length + input.data.length);
        dataToSign.set(prefixBytes, 0);
        dataToSign.set(input.data, prefixBytes.length);
      } else {
        dataToSign = input.data;
      }
      
      const testSig = algosdk.signBytes(dataToSign, secretKey);
      const matches = testSig.length === correctSignature.length && 
                     testSig.every((byte, i) => byte === correctSignature[i]);
      
      const testName = prefix ? `"${prefix}" + ${input.name}` : input.name;
      console.log(`${testName}:`, matches ? '✅ MATCH!' : '❌ No match');
      
      if (matches) {
        console.log('🎉 FOUND IT! We should ask Pera to sign:', Array.from(dataToSign));
      }
    } catch (error) {
      const testName = prefix ? `"${prefix}" + ${input.name}` : input.name;
      console.log(`${testName}: Error -`, error.message);
    }
  }
}

// Test with the LogicSig.signProgram method
console.log('\n=== Testing LogicSig.signProgram ===');
try {
  const lsig = new algosdk.LogicSig(program);
  const progSig = lsig.signProgram(secretKey);
  const matches = progSig.length === correctSignature.length && 
                 progSig.every((byte, i) => byte === correctSignature[i]);
  
  console.log('signProgram matches:', matches ? '✅ MATCH!' : '❌ No match');
  if (matches) {
    console.log('🎉 signProgram is the correct method!');
  }
} catch (error) {
  console.log('signProgram error:', error.message);
}