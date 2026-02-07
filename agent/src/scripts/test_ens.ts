import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://eth.llamarpc.com"),
});

async function testEnsResolution() {
  console.log("Testing ENS resolution...");
  
  const address = await client.getEnsAddress({
    name: normalize("vitalik.eth"),
  });
  
  console.log("✅ vitalik.eth resolved to:", address);
  
  if (address === "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") {
    console.log("✅ Address matches expected value!");
  } else {
    console.log("⚠️  Address differs from expected");
  }
}

testEnsResolution();
