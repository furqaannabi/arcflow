// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

/// @notice Merges all deployment files into a single addresses.json for the agent
/// @dev Run after deploying to all chains
contract MergeDeploymentsScript is Script {
    function run() public {
        console.log("=== Merging Deployments ===");

        // Read individual deployment files
        string memory baseSepolia = _tryReadFile("deployments/baseSepolia.json");
        string memory sepolia = _tryReadFile("deployments/sepolia.json");
        string memory arbitrumSepolia = _tryReadFile("deployments/arbitrumSepolia.json");
        string memory arcTestnet = _tryReadFile("deployments/arcTestnet.json");

        // Build merged JSON
        string memory merged = "{\n";
        bool hasContent = false;

        if (bytes(baseSepolia).length > 0) {
            merged = string.concat(merged, '  "baseSepolia": ', _extractContent(baseSepolia));
            hasContent = true;
            console.log("Added: baseSepolia");
        }

        if (bytes(sepolia).length > 0) {
            if (hasContent) merged = string.concat(merged, ",\n");
            merged = string.concat(merged, '  "sepolia": ', _extractContent(sepolia));
            hasContent = true;
            console.log("Added: sepolia");
        }

        if (bytes(arbitrumSepolia).length > 0) {
            if (hasContent) merged = string.concat(merged, ",\n");
            merged = string.concat(merged, '  "arbitrumSepolia": ', _extractContent(arbitrumSepolia));
            hasContent = true;
            console.log("Added: arbitrumSepolia");
        }

        if (bytes(arcTestnet).length > 0) {
            if (hasContent) merged = string.concat(merged, ",\n");
            merged = string.concat(merged, '  "arcTestnet": ', _extractContent(arcTestnet));
            hasContent = true;
            console.log("Added: arcTestnet");
        }

        merged = string.concat(merged, "\n}");

        // Write to agent
        vm.writeFile("../agent/src/addresses.json", merged);
        console.log("");
        console.log("Merged addresses written to: ../agent/src/addresses.json");
    }

    function _tryReadFile(string memory path) internal view returns (string memory) {
        try vm.readFile(path) returns (string memory content) {
            return content;
        } catch {
            return "";
        }
    }

    function _extractContent(string memory json) internal pure returns (string memory) {
        // Simple extraction - assumes format { "key": { ... } }
        // Returns the inner object content
        bytes memory b = bytes(json);
        uint start = 0;
        uint end = b.length;

        // Find first {
        for (uint i = 0; i < b.length; i++) {
            if (b[i] == "{") {
                start = i + 1;
                break;
            }
        }

        // Find the inner object start (second {)
        for (uint i = start; i < b.length; i++) {
            if (b[i] == "{") {
                start = i;
                break;
            }
        }

        // Find matching closing }
        uint depth = 0;
        for (uint i = start; i < b.length; i++) {
            if (b[i] == "{") depth++;
            if (b[i] == "}") {
                depth--;
                if (depth == 0) {
                    end = i + 1;
                    break;
                }
            }
        }

        // Extract substring
        bytes memory result = new bytes(end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = b[i];
        }

        return string(result);
    }
}
