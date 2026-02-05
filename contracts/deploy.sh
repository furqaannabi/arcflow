#!/bin/bash

# ArcFlow Multi-Chain Deployment Script
# Usage: ./deploy.sh [chain] [--verify]
#   chain: baseSepolia, sepolia, arbitrumSepolia, arc, all
#   --verify: verify contracts on block explorer

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check environment
check_env() {
    if [ -z "$PRIVATE_KEY" ]; then
        echo -e "${RED}Error: PRIVATE_KEY not set${NC}"
        exit 1
    fi
    if [ -z "$ALCHEMY_API_KEY" ]; then
        echo -e "${YELLOW}Warning: ALCHEMY_API_KEY not set, using public RPCs${NC}"
    fi
}

# Create deployments directory
mkdir -p deployments

# Deploy to a source chain (has Router + StateManager)
deploy_source() {
    local chain=$1
    local verify=$2

    echo -e "${GREEN}Deploying to $chain...${NC}"

    local cmd="forge script script/00_DeployAll.s.sol --rpc-url $chain --broadcast"

    if [ "$verify" = "--verify" ]; then
        cmd="$cmd --verify"
    fi

    eval $cmd

    echo -e "${GREEN}Deployed to $chain${NC}"
}

# Deploy to Arc (has Distributor)
deploy_arc() {
    local verify=$1

    echo -e "${GREEN}Deploying to Arc Testnet...${NC}"

    local cmd="forge script script/01_DeployDistributor.s.sol --rpc-url arc --broadcast"

    if [ "$verify" = "--verify" ]; then
        cmd="$cmd --verify"
    fi

    eval $cmd

    echo -e "${GREEN}Deployed to Arc Testnet${NC}"
}

# Merge all deployments
merge_deployments() {
    echo -e "${GREEN}Merging deployments...${NC}"
    forge script script/02_MergeDeployments.s.sol
    echo -e "${GREEN}Deployments merged to ../agent/src/addresses.json${NC}"
}

# Main
main() {
    local chain=${1:-"baseSepolia"}
    local verify=${2:-""}

    check_env

    echo -e "${YELLOW}=== ArcFlow Multi-Chain Deployment ===${NC}"
    echo "Chain: $chain"
    echo ""

    case $chain in
        "baseSepolia"|"sepolia"|"arbitrumSepolia")
            deploy_source $chain $verify
            ;;
        "arc")
            deploy_arc $verify
            ;;
        "all")
            echo -e "${YELLOW}Deploying to all chains...${NC}"
            deploy_source "baseSepolia" $verify
            deploy_source "sepolia" $verify
            deploy_source "arbitrumSepolia" $verify
            deploy_arc $verify
            merge_deployments
            ;;
        "merge")
            merge_deployments
            ;;
        *)
            echo -e "${RED}Unknown chain: $chain${NC}"
            echo "Usage: ./deploy.sh [baseSepolia|sepolia|arbitrumSepolia|arc|all|merge] [--verify]"
            exit 1
            ;;
    esac

    echo ""
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
}

main "$@"
