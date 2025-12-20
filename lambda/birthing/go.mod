module syrus-birthing

go 1.23.0

replace loros/syrus-models => ../../lib/go/models

require (
	github.com/aws/aws-lambda-go v1.47.0
	github.com/aws/aws-sdk-go v1.55.5
	loros/syrus-models v0.0.0
)

require github.com/jmespath/go-jmespath v0.4.0 // indirect
