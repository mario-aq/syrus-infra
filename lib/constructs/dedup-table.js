"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedupTable = void 0;
const constructs_1 = require("constructs");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * Creates a DynamoDB table for message deduplication
 *
 * Schema:
 * - Partition key: dedupKey (string)
 * - TTL attribute: expiresAt (number, epoch seconds)
 *
 * Dedup key format: <queueRole>#<wamid>
 * Examples: ingest#wamid.ABC123, inference#wamid.ABC123, messaging#wamid.ABC123
 */
class DedupTable extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.table = new dynamodb.Table(this, 'DedupTable', {
            tableName: `syrus-dedup-${props.stage}`,
            partitionKey: {
                name: 'dedupKey',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: props.removalPolicy,
            pointInTimeRecovery: false, // Disabled for cost control
            deletionProtection: false,
            // Enable TTL on the 'expiresAt' attribute (24 hours)
            timeToLiveAttribute: 'expiresAt',
        });
        // Add tags
        aws_cdk_lib_1.Tags.of(this.table).add('App', 'Syrus');
        aws_cdk_lib_1.Tags.of(this.table).add('Service', 'WhatsAppBot');
        aws_cdk_lib_1.Tags.of(this.table).add('Stage', props.stage);
    }
}
exports.DedupTable = DedupTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVkdXAtdGFibGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZWR1cC10YWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwyQ0FBdUM7QUFDdkMscURBQXFEO0FBQ3JELDZDQUFrRDtBQVNsRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFhLFVBQVcsU0FBUSxzQkFBUztJQUd2QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNsRCxTQUFTLEVBQUUsZUFBZSxLQUFLLENBQUMsS0FBSyxFQUFFO1lBQ3ZDLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLFdBQVc7WUFDN0MsWUFBWSxFQUFFLENBQUM7WUFDZixhQUFhLEVBQUUsQ0FBQztZQUNoQixhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7WUFDbEMsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLDRCQUE0QjtZQUN4RCxrQkFBa0IsRUFBRSxLQUFLO1lBQ3pCLHFEQUFxRDtZQUNyRCxtQkFBbUIsRUFBRSxXQUFXO1NBQ2pDLENBQUMsQ0FBQztRQUVILFdBQVc7UUFDWCxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN4QyxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNsRCxrQkFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNGO0FBM0JELGdDQTJCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFRhZ3MgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVkdXBUYWJsZVByb3BzIHtcbiAgLyoqIERlcGxveW1lbnQgc3RhZ2UgKGRldi9wcm9kKSAqL1xuICBzdGFnZTogc3RyaW5nO1xuICAvKiogUmVtb3ZhbCBwb2xpY3kgZm9yIHRoZSB0YWJsZSAqL1xuICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5O1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBEeW5hbW9EQiB0YWJsZSBmb3IgbWVzc2FnZSBkZWR1cGxpY2F0aW9uXG4gKiBcbiAqIFNjaGVtYTpcbiAqIC0gUGFydGl0aW9uIGtleTogZGVkdXBLZXkgKHN0cmluZylcbiAqIC0gVFRMIGF0dHJpYnV0ZTogZXhwaXJlc0F0IChudW1iZXIsIGVwb2NoIHNlY29uZHMpXG4gKiBcbiAqIERlZHVwIGtleSBmb3JtYXQ6IDxxdWV1ZVJvbGU+Izx3YW1pZD5cbiAqIEV4YW1wbGVzOiBpbmdlc3Qjd2FtaWQuQUJDMTIzLCBpbmZlcmVuY2Ujd2FtaWQuQUJDMTIzLCBtZXNzYWdpbmcjd2FtaWQuQUJDMTIzXG4gKi9cbmV4cG9ydCBjbGFzcyBEZWR1cFRhYmxlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGVkdXBUYWJsZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMudGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0RlZHVwVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBzeXJ1cy1kZWR1cC0ke3Byb3BzLnN0YWdlfWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2RlZHVwS2V5JyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiA1LFxuICAgICAgd3JpdGVDYXBhY2l0eTogNSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLnJlbW92YWxQb2xpY3ksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBmYWxzZSwgLy8gRGlzYWJsZWQgZm9yIGNvc3QgY29udHJvbFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICAgIC8vIEVuYWJsZSBUVEwgb24gdGhlICdleHBpcmVzQXQnIGF0dHJpYnV0ZSAoMjQgaG91cnMpXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAnZXhwaXJlc0F0JyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCB0YWdzXG4gICAgVGFncy5vZih0aGlzLnRhYmxlKS5hZGQoJ0FwcCcsICdTeXJ1cycpO1xuICAgIFRhZ3Mub2YodGhpcy50YWJsZSkuYWRkKCdTZXJ2aWNlJywgJ1doYXRzQXBwQm90Jyk7XG4gICAgVGFncy5vZih0aGlzLnRhYmxlKS5hZGQoJ1N0YWdlJywgcHJvcHMuc3RhZ2UpO1xuICB9XG59XG4iXX0=