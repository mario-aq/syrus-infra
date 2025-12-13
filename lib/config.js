"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGE_CONFIGS = void 0;
exports.getStageConfig = getStageConfig;
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * Stage configurations for dev and prod environments
 */
exports.STAGE_CONFIGS = {
    dev: {
        stage: 'dev',
        removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        tableCapacity: {
            readCapacity: 1,
            writeCapacity: 1,
        },
        gsiCapacity: {
            readCapacity: 1,
            writeCapacity: 1,
        },
    },
    prod: {
        stage: 'prod',
        removalPolicy: aws_cdk_lib_1.RemovalPolicy.RETAIN,
        tableCapacity: {
            readCapacity: 1,
            writeCapacity: 1,
        },
        gsiCapacity: {
            readCapacity: 1,
            writeCapacity: 1,
        },
    },
};
/**
 * Get stage config by stage name, defaults to dev if not found
 */
function getStageConfig(stage) {
    return exports.STAGE_CONFIGS[stage] || exports.STAGE_CONFIGS.dev;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXVEQSx3Q0FFQztBQXpERCw2Q0FBNEM7QUFzQjVDOztHQUVHO0FBQ1UsUUFBQSxhQUFhLEdBQWdDO0lBQ3hELEdBQUcsRUFBRTtRQUNILEtBQUssRUFBRSxLQUFLO1FBQ1osYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztRQUNwQyxhQUFhLEVBQUU7WUFDYixZQUFZLEVBQUUsQ0FBQztZQUNmLGFBQWEsRUFBRSxDQUFDO1NBQ2pCO1FBQ0QsV0FBVyxFQUFFO1lBQ1gsWUFBWSxFQUFFLENBQUM7WUFDZixhQUFhLEVBQUUsQ0FBQztTQUNqQjtLQUNGO0lBQ0QsSUFBSSxFQUFFO1FBQ0osS0FBSyxFQUFFLE1BQU07UUFDYixhQUFhLEVBQUUsMkJBQWEsQ0FBQyxNQUFNO1FBQ25DLGFBQWEsRUFBRTtZQUNiLFlBQVksRUFBRSxDQUFDO1lBQ2YsYUFBYSxFQUFFLENBQUM7U0FDakI7UUFDRCxXQUFXLEVBQUU7WUFDWCxZQUFZLEVBQUUsQ0FBQztZQUNmLGFBQWEsRUFBRSxDQUFDO1NBQ2pCO0tBQ0Y7Q0FDRixDQUFDO0FBRUY7O0dBRUc7QUFDSCxTQUFnQixjQUFjLENBQUMsS0FBYTtJQUMxQyxPQUFPLHFCQUFhLENBQUMsS0FBSyxDQUFDLElBQUkscUJBQWEsQ0FBQyxHQUFHLENBQUM7QUFDbkQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJlbW92YWxQb2xpY3kgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBmb3IgZGlmZmVyZW50IGRlcGxveW1lbnQgc3RhZ2VzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3RhZ2VDb25maWcge1xuICAvKiogU3RhZ2UgbmFtZSAoZGV2IG9yIHByb2QpICovXG4gIHN0YWdlOiBzdHJpbmc7XG4gIC8qKiBSZW1vdmFsIHBvbGljeSBmb3IgcmVzb3VyY2VzICovXG4gIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3k7XG4gIC8qKiBUYWJsZSBjYXBhY2l0eSB1bml0cyAoUkNVL1dDVSkgKi9cbiAgdGFibGVDYXBhY2l0eToge1xuICAgIHJlYWRDYXBhY2l0eTogbnVtYmVyO1xuICAgIHdyaXRlQ2FwYWNpdHk6IG51bWJlcjtcbiAgfTtcbiAgLyoqIEdTSSBjYXBhY2l0eSB1bml0cyAoUkNVL1dDVSkgKi9cbiAgZ3NpQ2FwYWNpdHk6IHtcbiAgICByZWFkQ2FwYWNpdHk6IG51bWJlcjtcbiAgICB3cml0ZUNhcGFjaXR5OiBudW1iZXI7XG4gIH07XG59XG5cbi8qKlxuICogU3RhZ2UgY29uZmlndXJhdGlvbnMgZm9yIGRldiBhbmQgcHJvZCBlbnZpcm9ubWVudHNcbiAqL1xuZXhwb3J0IGNvbnN0IFNUQUdFX0NPTkZJR1M6IFJlY29yZDxzdHJpbmcsIFN0YWdlQ29uZmlnPiA9IHtcbiAgZGV2OiB7XG4gICAgc3RhZ2U6ICdkZXYnLFxuICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB0YWJsZUNhcGFjaXR5OiB7XG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgIH0sXG4gICAgZ3NpQ2FwYWNpdHk6IHtcbiAgICAgIHJlYWRDYXBhY2l0eTogMSxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDEsXG4gICAgfSxcbiAgfSxcbiAgcHJvZDoge1xuICAgIHN0YWdlOiAncHJvZCcsXG4gICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgdGFibGVDYXBhY2l0eToge1xuICAgICAgcmVhZENhcGFjaXR5OiAxLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMSxcbiAgICB9LFxuICAgIGdzaUNhcGFjaXR5OiB7XG4gICAgICByZWFkQ2FwYWNpdHk6IDEsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAxLFxuICAgIH0sXG4gIH0sXG59O1xuXG4vKipcbiAqIEdldCBzdGFnZSBjb25maWcgYnkgc3RhZ2UgbmFtZSwgZGVmYXVsdHMgdG8gZGV2IGlmIG5vdCBmb3VuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RhZ2VDb25maWcoc3RhZ2U6IHN0cmluZyk6IFN0YWdlQ29uZmlnIHtcbiAgcmV0dXJuIFNUQUdFX0NPTkZJR1Nbc3RhZ2VdIHx8IFNUQUdFX0NPTkZJR1MuZGV2O1xufVxuIl19