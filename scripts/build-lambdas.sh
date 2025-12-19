#!/bin/bash

# Script to build all Lambda functions
# Finds all Lambda directories containing main.go files and builds them

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to project root
cd "$PROJECT_ROOT" || exit 1

# First, build the shared models module
echo -e "${GREEN}Building shared models module...${NC}"
if [ -d "lib/go/models" ]; then
    (
        cd lib/go/models || exit 1
        
        # Run go mod tidy
        if go mod tidy 2>/dev/null; then
            echo -e "${GREEN}✓ Successfully tidied models module${NC}"
        else
            echo -e "${YELLOW}⚠ Could not tidy models module (Go may not be available)${NC}"
        fi
        
        # Verify the models compile
        if go build ./... 2>/dev/null; then
            echo -e "${GREEN}✓ Models module compiles successfully${NC}"
        else
            echo -e "${RED}✗ Models module failed to compile${NC}"
            exit 1
        fi
    )
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build models module${NC}"
        exit 1
    fi
    echo ""
else
    echo -e "${YELLOW}⚠ Shared models directory not found at lib/go/models${NC}"
    echo ""
fi

# Find all Lambda directories with main.go files
lambda_dirs=$(find lambda -name main.go -exec dirname {} \;)

if [ -z "$lambda_dirs" ]; then
    echo -e "${YELLOW}No Lambda functions found${NC}"
    exit 0
fi

# Build each Lambda
success_count=0
fail_count=0

for lambda_dir in $lambda_dirs; do
    echo -e "${GREEN}Building ${lambda_dir}...${NC}"
    
    # Build in a subshell to isolate directory changes
    (
        cd "$lambda_dir" || exit 1
        
        # Run go mod tidy (ignore errors if Go not available)
        go mod tidy 2>/dev/null || true
        
        # Build the Lambda
        if GOOS=linux GOARCH=amd64 go build -o bootstrap main.go; then
            echo -e "${GREEN}✓ Successfully built ${lambda_dir}${NC}"
            exit 0
        else
            echo -e "${RED}✗ Failed to build ${lambda_dir}${NC}"
            exit 1
        fi
    )
    
    # Capture exit status from subshell
    if [ $? -eq 0 ]; then
        ((success_count++))
    else
        ((fail_count++))
    fi
done

# Summary
echo ""
if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}All Lambda functions built successfully (${success_count})${NC}"
    exit 0
else
    echo -e "${RED}Build completed with ${fail_count} failure(s), ${success_count} success(es)${NC}"
    exit 1
fi
