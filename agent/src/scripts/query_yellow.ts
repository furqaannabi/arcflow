import WebSocket from 'ws';

console.log('Connecting to Yellow Network WebSocket...');
const ws = new WebSocket('wss://clearnet-sandbox.yellow.com/ws');

const REQUEST_ID = 12345;

ws.on('open', () => {
  console.log('Connected!');
  const request = {
    req: [REQUEST_ID, 'get_config', {}, Date.now()],
    sig: [] // get_config is a public endpoint, no signature required
  };
  console.log(`Sending get_config request with ID ${REQUEST_ID}...`);
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    
    if (response.res && Array.isArray(response.res)) {
        const msgId = response.res[0];
        const msgType = response.res[1];
        const msgData = response.res[2];

        if (msgId === REQUEST_ID) {
             console.log('\n✅ Received response for get_config!');
             console.log('\n=== Supported Chains ===');
             console.dir(msgData.chains, { depth: null, colors: true });

             console.log('\n=== Contract Addresses ===');
             console.dir(msgData.contracts, { depth: null, colors: true });
             
             console.log('\n=== Full Config Data ===');
             console.dir(msgData, { depth: null, colors: true });

             process.exit(0);
        } else {
            console.log(`Received other message: ${msgType} (ID: ${msgId})`);
        }
    } else {
        console.log('Received raw message:', data.toString());
    }
  } catch (err) {
    console.error('Error parsing response:', err);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
  process.exit(1);
});

// Timeout after 15 seconds
setTimeout(() => {
    console.error('❌ Timeout waiting for response');
    process.exit(1);
}, 15000);
