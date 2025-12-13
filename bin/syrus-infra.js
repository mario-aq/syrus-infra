#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = require("aws-cdk-lib");
const syrus_mvp_stack_1 = require("../lib/syrus-mvp-stack");
const app = new cdk.App();
// Create stacks for both dev and prod stages
['dev', 'prod'].forEach(stage => {
    new syrus_mvp_stack_1.SyrusMvpStack(app, `Syrus-${stage}`, {
        stage,
        /* If you don't specify 'env', this stack will be environment-agnostic.
         * Account/Region-dependent features and context lookups will not work,
         * but a single synthesized template can be deployed anywhere. */
        /* Uncomment the next line to specialize this stack for the AWS Account
         * and Region that are implied by the current CLI configuration. */
        // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
        /* Uncomment the next line if you know exactly what Account and Region you
         * want to deploy the stack to: */
        // env: { account: '123456789012', region: 'us-east-1' },
        /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lydXMtaW5mcmEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzeXJ1cy1pbmZyYS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSx1Q0FBcUM7QUFDckMsbUNBQW1DO0FBQ25DLDREQUF1RDtBQUV2RCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw2Q0FBNkM7QUFDN0MsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO0lBQzlCLElBQUksK0JBQWEsQ0FBQyxHQUFHLEVBQUUsU0FBUyxLQUFLLEVBQUUsRUFBRTtRQUN2QyxLQUFLO1FBQ0w7O3lFQUVpRTtRQUVqRTsyRUFDbUU7UUFDbkUsNkZBQTZGO1FBRTdGOzBDQUNrQztRQUNsQyx5REFBeUQ7UUFFekQsOEZBQThGO0tBQy9GLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFN5cnVzTXZwU3RhY2sgfSBmcm9tICcuLi9saWIvc3lydXMtbXZwLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gQ3JlYXRlIHN0YWNrcyBmb3IgYm90aCBkZXYgYW5kIHByb2Qgc3RhZ2VzXG5bJ2RldicsICdwcm9kJ10uZm9yRWFjaChzdGFnZSA9PiB7XG4gIG5ldyBTeXJ1c012cFN0YWNrKGFwcCwgYFN5cnVzLSR7c3RhZ2V9YCwge1xuICAgIHN0YWdlLFxuICAgIC8qIElmIHlvdSBkb24ndCBzcGVjaWZ5ICdlbnYnLCB0aGlzIHN0YWNrIHdpbGwgYmUgZW52aXJvbm1lbnQtYWdub3N0aWMuXG4gICAgICogQWNjb3VudC9SZWdpb24tZGVwZW5kZW50IGZlYXR1cmVzIGFuZCBjb250ZXh0IGxvb2t1cHMgd2lsbCBub3Qgd29yayxcbiAgICAgKiBidXQgYSBzaW5nbGUgc3ludGhlc2l6ZWQgdGVtcGxhdGUgY2FuIGJlIGRlcGxveWVkIGFueXdoZXJlLiAqL1xuXG4gICAgLyogVW5jb21tZW50IHRoZSBuZXh0IGxpbmUgdG8gc3BlY2lhbGl6ZSB0aGlzIHN0YWNrIGZvciB0aGUgQVdTIEFjY291bnRcbiAgICAgKiBhbmQgUmVnaW9uIHRoYXQgYXJlIGltcGxpZWQgYnkgdGhlIGN1cnJlbnQgQ0xJIGNvbmZpZ3VyYXRpb24uICovXG4gICAgLy8gZW52OiB7IGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIH0sXG5cbiAgICAvKiBVbmNvbW1lbnQgdGhlIG5leHQgbGluZSBpZiB5b3Uga25vdyBleGFjdGx5IHdoYXQgQWNjb3VudCBhbmQgUmVnaW9uIHlvdVxuICAgICAqIHdhbnQgdG8gZGVwbG95IHRoZSBzdGFjayB0bzogKi9cbiAgICAvLyBlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcblxuICAgIC8qIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWUgaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9sYXRlc3QvZ3VpZGUvZW52aXJvbm1lbnRzLmh0bWwgKi9cbiAgfSk7XG59KTtcbiJdfQ==