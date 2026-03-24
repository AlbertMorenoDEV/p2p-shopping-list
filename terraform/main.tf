terraform {
  backend "s3" {
    bucket         = "albertmoreno-tf-state"
    key            = "p2p-shopping-list/terraform.tfstate"
    region         = "us-east-1"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Provider for us-east-1 (Required for ACM with CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
