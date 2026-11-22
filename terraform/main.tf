terraform {
  backend "s3" {
    bucket = "albertmoreno-tf-state"
    key    = "p2p-shopping-list/terraform.tfstate"
    region = "eu-central-1"
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
