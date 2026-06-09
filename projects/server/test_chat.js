async function test() {
  const res = await fetch('http://localhost:4021/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are an AI assistant. Return a JSON object.' },
        { role: 'user', content: 'Create a workflow that send 0.01 ALGO every 10 seconds to wallet ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA. Run this for 3 iterations maximum.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.12,
      max_tokens: 3072
    })
  });
  console.log(res.status);
  console.log(await res.text());
}

test();
