module syrus-configuring

go 1.21

replace loros/syrus-models => ../../lib/go/models

require (
	github.com/aws/aws-lambda-go v1.47.0
	github.com/aws/aws-sdk-go v1.50.0
	loros/syrus-models v0.0.0
)

require github.com/jmespath/go-jmespath v0.4.0 // indirect
