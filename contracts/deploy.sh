#!/bin/bash

# ArcFlow Multi-Chain Deployment Script
# Usage: ./deploy.sh [chain] [--no-verify]
#   chain: baseSepolia, sepolia, arc, all
#   --no-verify: skip contract verification (verification enabled by default)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment from .env file
load_env() {
    if [ -f .env ]; then
        echo -e "${GREEN}Loading .env file...${NC}"
        # Convert Windows line endings to Unix if needed
        if command -v sed &> /dev/null; then
            sed -i 's/\r$//' .env 2>/dev/null || true
        fi
        set -a
        source .env
        set +a
    elif [ -f ../.env ]; then
        echo -e "${GREEN}Loading ../.env file...${NC}"
        if command -v sed &> /dev/null; then
            sed -i 's/\r$//' ../.env 2>/dev/null || true
        fi
        set -a
        source ../.env
        set +a
    else
        echo -e "${YELLOW}No .env file found, using environment variables${NC}"
    fi
}

# Check environment
check_env() {
    if [ -z "$PRIVATE_KEY" ]; then
        echo -e "${RED}Error: PRIVATE_KEY not set${NC}"
        echo "Create a .env file with PRIVATE_KEY=0x..."
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

    local cmd="forge script script/00_DeployAll.s.sol --rpc-url $chain --broadcast $verify"

    eval $cmd

    echo -e "${GREEN}Deployed to $chain${NC}"
}

# Deploy to Arc (has Distributor)
deploy_arc() {
    local verify=$1

    echo -e "${GREEN}Deploying to Arc Testnet...${NC}"

    local cmd="forge script script/01_DeployDistributor.s.sol --rpc-url arc --broadcast $verify"

    eval $cmd

    echo -e "${GREEN}Deployed to Arc Testnet${NC}"
}

# Ensure arcTestnet.json has required fields (usdc, circleDomain)
ensure_arc_defaults() {
    local arc_file="deployments/arcTestnet.json"
    if [ ! -f "$arc_file" ]; then
        echo -e "${YELLOW}Creating default arcTestnet.json...${NC}"
        cat > "$arc_file" << 'ARCEOF'
{
  "arcTestnet": {
    "distributor": "0x792504ceb7DE2C0e697a8bDdfa096d1e2CA678d3",
    "gatewayMinter": "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    "circleDomain": 26,
    "usdc": "0x3600000000000000000000000000000000000000"
  }
}
ARCEOF
    elif ! grep -q '"usdc"' "$arc_file"; then
        echo -e "${YELLOW}Patching arcTestnet.json with usdc + circleDomain...${NC}"
        # Replace closing braces to inject usdc and fix circleDomain
        sed -i 's/"circleDomain": [0-9]*/"circleDomain": 26,\n    "usdc": "0x3600000000000000000000000000000000000000"/' "$arc_file" 2>/dev/null || true
    fi
}

# Merge all deployments
merge_deployments() {
    ensure_arc_defaults
    echo -e "${GREEN}Merging deployments...${NC}"
    forge script script/02_MergeDeployments.s.sol
    echo -e "${GREEN}Deployments merged to ../agent/src/addresses.json${NC}"
}

# Main
main() {
    local chain=${1:-"baseSepolia"}
    local no_verify=${2:-""}
    local verify="--verify"

    # Disable verification if --no-verify is passed
    if [ "$no_verify" = "--no-verify" ]; then
        verify=""
    fi

    load_env
    check_env

    echo -e "${YELLOW}=== ArcFlow Multi-Chain Deployment ===${NC}"
    echo "Chain: $chain"
    echo "Verify: $([ -n "$verify" ] && echo 'enabled' || echo 'disabled')"
    echo ""

    case $chain in
        "baseSepolia"|"sepolia")
            deploy_source $chain $verify
            merge_deployments
            ;;
        "arc")
            deploy_arc $verify
            merge_deployments
            ;;
        "all")
            echo -e "${YELLOW}Deploying to all chains...${NC}"
            deploy_source "baseSepolia" $verify
            deploy_source "sepolia" $verify
            deploy_arc $verify
            merge_deployments
            ;;
        "merge")
            merge_deployments
            ;;
        *)
            echo -e "${RED}Unknown chain: $chain${NC}"
            echo "Usage: ./deploy.sh [baseSepolia|sepolia|arc|all|merge] [--no-verify]"
            exit 1
            ;;
    esac

    echo ""
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
}

main "$@"
