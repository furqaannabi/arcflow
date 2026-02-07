// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @notice Merges all deployment files into a single addresses.json for the agent
/// @dev Run after deploying to all chains. Injects poolManager from ChainConfig.
contract MergeDeploymentsScript is Script {
    function run() public {
        console.log("=== Merging Deployments ===");

        // Read individual deployment files
        string memory baseSepolia = _tryReadFile("deployments/baseSepolia.json");
        string memory sepolia = _tryReadFile("deployments/sepolia.json");
        string memory arcTestnet = _tryReadFile("deployments/arcTestnet.json");

        ChainConfig.Config memory bsConfig = ChainConfig.getBaseSepolia();
        ChainConfig.Config memory sepConfig = ChainConfig.getSepolia();

        // Build merged JSON
        string memory merged = "{\n";
        bool hasContent = false;

        if (bytes(baseSepolia).length > 0) {
            merged = string.concat(
                merged,
                '  "baseSepolia": {\n',
                '    "poolManager": "', vm.toString(bsConfig.poolManager), '",\n',
                '    ', _extractFields(baseSepolia), '\n',
                '  }'
            );
            hasContent = true;
            console.log("Added: baseSepolia (poolManager:", bsConfig.poolManager, ")");
        }

        if (bytes(sepolia).length > 0) {
            if (hasContent) merged = string.concat(merged, ",\n");
            merged = string.concat(
                merged,
                '  "sepolia": {\n',
                '    "poolManager": "', vm.toString(sepConfig.poolManager), '",\n',
                '    ', _extractFields(sepolia), '\n',
                '  }'
            );
            hasContent = true;
            console.log("Added: sepolia (poolManager:", sepConfig.poolManager, ")");
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

    /// @dev Extract the key-value fields from the inner object (without braces)
    function _extractFields(string memory json) internal pure returns (string memory) {
        bytes memory inner = bytes(_extractContent(json));
        // Strip leading { and trailing }
        if (inner.length < 2) return "";

        uint start = 1; // skip {
        uint end = inner.length - 1; // skip }

        // Skip leading whitespace/newlines
        while (start < end && (inner[start] == " " || inner[start] == "\n" || inner[start] == "\r" || inner[start] == "\t")) {
            start++;
        }
        // Skip trailing whitespace/newlines
        while (end > start && (inner[end - 1] == " " || inner[end - 1] == "\n" || inner[end - 1] == "\r" || inner[end - 1] == "\t")) {
            end--;
        }

        bytes memory result = new bytes(end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = inner[i];
        }
        return string(result);
    }

    /// @dev Extract the inner object { ... } from a deployment JSON like { "key": { ... } }
    function _extractContent(string memory json) internal pure returns (string memory) {
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

        bytes memory result = new bytes(end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = b[i];
        }

        return string(result);
    }
}
