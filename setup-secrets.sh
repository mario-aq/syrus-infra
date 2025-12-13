#!/bin/bash

echo "Setting up WhatsApp SSM parameters for Syrus..."
echo ""

# Check if AWS profile is set
if [ -z "$AWS_PROFILE" ]; then
    echo "Please set your AWS profile:"
    echo "export AWS_PROFILE=your-profile-name"
    exit 1
fi

echo "Using AWS profile: $AWS_PROFILE"
echo ""

# Prompt for WhatsApp credentials
echo "Enter your WhatsApp Business API credentials:"
echo ""

read -p "Verify Token (from WhatsApp webhook setup): " VERIFY_TOKEN
read -p "Access Token (from WhatsApp Business API): " ACCESS_TOKEN
read -p "Phone Number ID (from WhatsApp Business API): " PHONE_ID

echo ""
echo "Creating SSM parameters..."

# Create the parameters
aws ssm put-parameter \
    --name "/syrus/dev/whatsapp/verify-token" \
    --value "$VERIFY_TOKEN" \
    --type "String" \
    --overwrite \
    --profile "$AWS_PROFILE"

aws ssm put-parameter \
    --name "/syrus/dev/whatsapp/access-token" \
    --value "$ACCESS_TOKEN" \
    --type "String" \
    --overwrite \
    --profile "$AWS_PROFILE"

aws ssm put-parameter \
    --name "/syrus/dev/whatsapp/phone-number-id" \
    --value "$PHONE_ID" \
    --type "String" \
    --overwrite \
    --profile "$AWS_PROFILE"

echo ""
echo "✅ SSM parameters created successfully!"
echo ""
echo "You can now deploy: npm run deploy:dev"
