// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

import {ArcPayrollDistributor} from "../src/ArcPayrollDistributor.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @notice Deploys the ArcPayrollDistributor contract on Arc Network
/// @dev Only runs on Arc Testnet (chain ID: 5042002)
contract DeployDistributorScript is Script {
    function run() public {
        // Validate we're on Arc chain
        require(ChainConfig.isArcChain(), "Not Arc chain - use DeployAll for source chains");

        // Get chain config
        ChainConfig.Config memory config = ChainConfig.getConfig();

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        console.log("=== ArcPayrollDistributor Deployment ===");
        console.log("Chain:", config.name);
        console.log("Chain ID:", config.chainId);
        console.log("Deployer:", deployer);
        console.log("Agent:", agentAddress);
        console.log("Gateway Minter:", config.gatewayMinter);

        vm.startBroadcast(deployerPrivateKey);

        ArcPayrollDistributor distributor = new ArcPayrollDistributor(
            config.gatewayMinter,
            0x3600000000000000000000000000000000000000
        );
        console.log("ArcPayrollDistributor deployed at:", address(distributor));

        // Authorize the agent
        distributor.setAgentAuthorization(agentAddress, true);
        console.log("Agent authorized");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Distributor:", address(distributor));

        // Write addresses to file
        _writeAddresses(config, address(distributor));
    }

    function _writeAddresses(
        ChainConfig.Config memory config,
        address distributor
    ) internal {
        string memory json = string.concat(
            '{\n',
            '  "arcTestnet": {\n',
            '    "distributor": "', vm.toString(distributor), '",\n',
            '    "gatewayMinter": "', vm.toString(config.gatewayMinter), '",\n',
            '    "circleDomain": ', vm.toString(uint256(config.circleDomain)), ',\n',
            '    "usdc": "0x3600000000000000000000000000000000000000"\n',
            '  }\n',
            '}'
        );

        vm.writeFile("deployments/arcTestnet.json", json);
        console.log("Deployment saved to: deployments/arcTestnet.json");
    }
}
