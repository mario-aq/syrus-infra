module syrus-imageGen

go 1.23

toolchain go1.23.4

replace loros/syrus-models => ../../lib/go/models

require (
	github.com/aws/aws-lambda-go v1.51.1
	github.com/aws/aws-sdk-go v1.55.8
	loros/syrus-models v0.0.0-00010101000000-000000000000
)

require github.com/jmespath/go-jmespath v0.4.0 // indirect
