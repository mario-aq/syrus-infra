#!/bin/bash

# Script to manage SSM parameters for Syrus infrastructure
# Usage:
#   ./scripts/manage-ssm.sh list [stage]
#   ./scripts/manage-ssm.sh get <parameter-name> [stage]
#   ./scripts/manage-ssm.sh set <parameter-name> <value> [stage] [--secure]
#   ./scripts/manage-ssm.sh delete <parameter-name> [stage]

set -euo pipefail

# Default values
STAGE="${STAGE:-dev}"
REGION="${AWS_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-arborquote}"
SSM_PREFIX="/syrus"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
  list [stage]                    List all SSM parameters for a stage (default: dev)
  get <parameter-name> [stage]    Get a specific parameter value
  set <parameter-name> <value> [stage] [--secure]  Set/update a parameter
  delete <parameter-name> [stage] Delete a parameter
  show-all                        Show all parameters with values (non-secure only)

Examples:
  $0 list dev
  $0 get discord/public-key dev
  $0 set openai/api-key "\$SYRUS_OPENAI_API_KEY" dev --secure
  $0 delete whatsapp/access-token dev

Parameter names should be relative to /syrus/<stage>/ (e.g., "discord/public-key" not "/syrus/dev/discord/public-key")
EOF
    exit 1
}

# Get full parameter path
get_full_path() {
    local param_name="$1"
    local stage="${2:-$STAGE}"
    
    # Remove leading slash if present
    param_name="${param_name#/}"
    
    # Remove /syrus/<stage>/ prefix if present
    param_name="${param_name#syrus/*/}"
    
    echo "${SSM_PREFIX}/${stage}/${param_name}"
}

# List all parameters for a stage (excluding WhatsApp)
list_params() {
    local stage="${1:-$STAGE}"
    local path="${SSM_PREFIX}/${stage}"
    
    echo -e "${BLUE}Listing SSM parameters for stage: ${stage}${NC}"
    echo ""
    
    aws ssm get-parameters-by-path \
        --path "$path" \
        --recursive \
        --region "$REGION" \
        --profile "$PROFILE" \
        --query "Parameters[?contains(Name, 'whatsapp') == \`false\`].[Name,Type,LastModifiedDate]" \
        --output table 2>&1 || {
        echo -e "${RED}Error listing parameters${NC}"
        exit 1
    }
}

# Get a specific parameter
get_param() {
    local param_name="$1"
    local stage="${2:-$STAGE}"
    local full_path=$(get_full_path "$param_name" "$stage")
    
    echo -e "${BLUE}Getting parameter: ${full_path}${NC}"
    
    local result=$(aws ssm get-parameter \
        --name "$full_path" \
        --region "$REGION" \
        --profile "$PROFILE" \
        --with-decryption \
        2>&1) || {
        echo -e "${RED}Error getting parameter: $full_path${NC}"
        exit 1
    }
    
    local value=$(echo "$result" | jq -r '.Parameter.Value')
    local param_type=$(echo "$result" | jq -r '.Parameter.Type')
    
    echo -e "${GREEN}Type: ${param_type}${NC}"
    echo -e "${GREEN}Value: ${value}${NC}"
}

# Set/update a parameter
set_param() {
    local param_name="$1"
    local value="$2"
    local stage="${3:-$STAGE}"
    local secure="${4:-}"
    local full_path=$(get_full_path "$param_name" "$stage")
    
    # Determine parameter type
    local param_type="String"
    if [[ "$secure" == "--secure" ]] || [[ "$secure" == "-s" ]]; then
        param_type="SecureString"
    fi
    
    echo -e "${BLUE}Setting parameter: ${full_path}${NC}"
    echo -e "${BLUE}Type: ${param_type}${NC}"
    
    # Check if parameter exists
    local exists=$(aws ssm get-parameter \
        --name "$full_path" \
        --region "$REGION" \
        --profile "$PROFILE" \
        2>&1 | grep -q "ParameterNotFound" && echo "false" || echo "true") || echo "false"
    
    if [[ "$exists" == "true" ]]; then
        echo -e "${YELLOW}Parameter exists, updating...${NC}"
        aws ssm put-parameter \
            --name "$full_path" \
            --value "$value" \
            --type "$param_type" \
            --region "$REGION" \
            --profile "$PROFILE" \
            --overwrite \
            > /dev/null
        echo -e "${GREEN}Parameter updated successfully${NC}"
    else
        echo -e "${YELLOW}Creating new parameter...${NC}"
        aws ssm put-parameter \
            --name "$full_path" \
            --value "$value" \
            --type "$param_type" \
            --region "$REGION" \
            --profile "$PROFILE" \
            > /dev/null
        echo -e "${GREEN}Parameter created successfully${NC}"
    fi
}

# Delete a parameter
delete_param() {
    local param_name="$1"
    local stage="${2:-$STAGE}"
    local full_path=$(get_full_path "$param_name" "$stage")
    
    echo -e "${YELLOW}Deleting parameter: ${full_path}${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deletion cancelled${NC}"
        exit 0
    fi
    
    aws ssm delete-parameter \
        --name "$full_path" \
        --region "$REGION" \
        --profile "$PROFILE" \
        2>&1 || {
        echo -e "${RED}Error deleting parameter${NC}"
        exit 1
    }
    
    echo -e "${GREEN}Parameter deleted successfully${NC}"
}

# Show all parameters with values (excluding WhatsApp, non-secure only for security)
show_all() {
    local stage="${1:-$STAGE}"
    local path="${SSM_PREFIX}/${stage}"
    
    echo -e "${BLUE}All SSM parameters for stage: ${stage}${NC}"
    echo ""
    
    # Get all parameters and filter out WhatsApp ones
    aws ssm get-parameters-by-path \
        --path "$path" \
        --recursive \
        --region "$REGION" \
        --profile "$PROFILE" \
        --with-decryption \
        --query "Parameters[?contains(Name, 'whatsapp') == \`false\`].[Name,Type,Value]" \
        --output table 2>&1 | grep -v "whatsapp" || {
        # Fallback: get all and filter in bash if query fails
        aws ssm get-parameters-by-path \
            --path "$path" \
            --recursive \
            --region "$REGION" \
            --profile "$PROFILE" \
            --with-decryption \
            --query "Parameters[*].[Name,Type,Value]" \
            --output table 2>&1 | grep -v "whatsapp" || {
            echo -e "${RED}Error listing parameters${NC}"
            exit 1
        }
    }
}

# Main command handling
main() {
    if [[ $# -lt 1 ]]; then
        usage
    fi
    
    local command="$1"
    shift || true
    
    case "$command" in
        list)
            list_params "$@"
            ;;
        get)
            if [[ $# -lt 1 ]]; then
                echo -e "${RED}Error: Parameter name required${NC}"
                usage
            fi
            get_param "$@"
            ;;
        set)
            if [[ $# -lt 2 ]]; then
                echo -e "${RED}Error: Parameter name and value required${NC}"
                usage
            fi
            set_param "$@"
            ;;
        delete)
            if [[ $# -lt 1 ]]; then
                echo -e "${RED}Error: Parameter name required${NC}"
                usage
            fi
            delete_param "$@"
            ;;
        show-all)
            show_all "$@"
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            usage
            ;;
    esac
}

main "$@"
